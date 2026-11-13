'use strict';
// Mutated fixtures below test the validator. They are not additional SQL executions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { verifyEvidence, readAndVerify, utcMicros } = require('../scripts/ci/verify-tdee-barrier-evidence.cjs');
const directory = 'release-candidates/tdee-adaptive-review/';
function fixture() {
  return { source: fs.readFileSync(directory + 'sourceBarrierCandidate.sql', 'utf8'),
    core: JSON.parse(fs.readFileSync(directory + 'sourceBarrierVerifiedResult.json', 'utf8')),
    subscription: JSON.parse(fs.readFileSync(directory + 'subscriptionSourceVerifiedResult.json', 'utf8')) };
}
function rejected(change, reason) { const value = fixture(); change(value); assert.throws(() => verifyEvidence(value), reason); }
test('reviewed receipts bind exact current source and regenerated probe bytes', () => {
  const result = readAndVerify(process.cwd());
  assert.equal(result.kind, 'historical-receipt-consistency-only');
  assert.deepEqual(result.verifiedHistoricalScopes, ['private-core-two-session-exclusion', 'subscription-source-single-transaction-rollback']);
  assert.equal(result.deploymentReady, false); assert.equal(result.activationReady, false);
  assert.equal(result.currentLiveStateVerified, false); assert.ok(Object.isFrozen(result));
});
test('source changes cannot inherit historical proof', () => rejected(v => { v.source += '\n'; }, /source_drift/));
test('changed holder, observer or source probe bytes cannot inherit proof', () => {
  for (const [owner, field] of [['core', 'holder_probe_sha256'], ['core', 'observer_probe_sha256'], ['subscription', 'probe_sha256']])
    rejected(v => { v[owner][field] = '0'.repeat(64); }, /payload_drift/);
});
test('identical or uncorrelated session PIDs do not prove exclusion', () => {
  rejected(v => { v.core.observer.observer_pid = v.core.holder.pid; }, /sessions_not_distinct/);
  rejected(v => { v.core.holder.observer_pid++; }, /observer_pid_mismatch/);
  rejected(v => { v.core.observer.holder_pid++; }, /holder_pid_mismatch/);
});
test('not observed and successfully acquired cases cannot count as mutual exclusion', () => {
  rejected(v => { v.core.observer.observed = false; }, /overlap_not_observed/);
  rejected(v => { v.core.observer.acquired = true; }, /exclusion_not_observed/);
});
test('timestamp precision is preserved below milliseconds', () => {
  assert.equal(utcMicros('2026-11-13T15:49:28.555383+00:00') - utcMicros('2026-11-13 15:49:28.555382+00'), 1n);
  rejected(v => { v.core.holder.observer_ack = '2026-11-13T15:49:28.555575Z'; }, /overlap_time_order/);
});
test('malformed, impossible or non-UTC evidence timestamps fail', () => {
  for (const value of ['2026-02-30T00:00:00Z', '2026-11-13T24:00:00Z', '2026-11-13T15:49:28-05:00', null, '2026-11-13'])
    assert.throws(() => utcMicros(value), /time_invalid/);
});
test('acknowledgement outside the demonstrated overlap fails', () => {
  rejected(v => { v.core.holder.observer_ack = '2026-11-13T16:49:28Z'; }, /overlap_time_order/);
  rejected(v => { v.core.observer.attempt_at = '2026-11-13T15:49:28.300000Z'; }, /overlap_time_order/);
});
test('probe window cannot silently exceed the reviewed bounds', () => rejected(v => {
  v.core.observer.started = '2026-11-13T15:45:00Z';
}, /probe_window_exceeded/));
test('cleanup must follow both sessions and contain no source or schema residue', () => {
  rejected(v => { v.core.cleanup.checked_at = v.core.holder.ended; }, /cleanup_not_after_sessions/);
  rejected(v => { v.core.cleanup.owner_and_handshake_locks = 1; }, /cleanup_owner_and_handshake_locks/);
  rejected(v => { v.subscription.cleanup.barrier_absent = false; }, /cleanup_schema/);
  rejected(v => { v.subscription.cleanup.fixture_rows = 1; }, /cleanup_fixture_rows/);
});
test('catalog restoration and unchanged snapshot are mandatory', () => {
  rejected(v => { v.subscription.cleanup.catalogMatches = false; }, /catalog_not_restored/);
  rejected(v => { v.core.cleanup.snapshot_md5 = '0'.repeat(32); }, /snapshot_changed/);
});
test('counts and scope cannot be inflated to real-account or normal-commit claims', () => {
  rejected(v => { v.core.holder.checks = 15; }, /core_check_count/);
  rejected(v => { v.subscription.result.owner_profiles_created = 1; }, /profiles_created/);
  rejected(v => { v.subscription.result.committed_source_rows = 1; }, /committed_rows/);
  rejected(v => { v.subscription.result.source = 'users'; }, /subscription_scope/);
});
test('missing coverage cannot be removed and historical proof never authorizes activation', () => {
  rejected(v => { v.core.not_verified = []; }, /unverified_scope_removed/);
  rejected(v => { v.subscription.installed = true; }, /installation_claim/);
  rejected(v => { v.core.recommendations_activated = true; }, /activation_claim/);
  const result = verifyEvidence(fixture()); assert.ok(Object.isFrozen(result.blockers));
  assert.ok(result.blockers.includes('authenticated-native-account-e2e'));
  assert.ok(result.blockers.includes('clinical-policy-and-model-validation'));
});

test('fixed observer sleep must be reflected in receipt timing', () => rejected(v => {
  const time = v.core.holder.hold_started;
  for (const key of ['started', 'seen_at', 'attempt_at', 'ended']) v.core.observer[key] = time;
  v.core.holder.observer_ack = time; v.core.holder.ended = time;
}, /observer_sleep_not_demonstrated/));
test('subscription execution-order gap is explicit, never inferred from earlier core receipt', () => {
  const value = fixture(); value.subscription.cleanup.checked_at = '2026-11-13T15:49:54.463439Z';
  const result = verifyEvidence(value);
  assert.ok(result.receiptLimitations.includes('subscription-cleanup-execution-order-not-machine-verifiable'));
  assert.ok(result.receiptLimitations.includes('sanitized-receipts-not-cryptographically-authenticated'));
  assert.ok(Object.isFrozen(result.receiptLimitations));
  assert.equal(result.deploymentReady, false); assert.equal(result.currentLiveStateVerified, false);
});
