'use strict';
// Offline integrity of reviewed historical receipts, NOT new database execution,
// receipt authentication, permission to deploy, or proof of present live state.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prepareSynchronizedProbe } = require('../../tests/prepare-source-barrier-rollback-probe.cjs');
const { prepareSubscriptionSourceProbe } = require('../../tests/prepare-subscription-source-probe.cjs');
const SNAPSHOT_MD5 = '8a16cf042d8b6eed72de336e26f5c14d';
const CORE_GAPS = Object.freeze([
  'actual-source-row-cascades-and-owner-moves', 'ordinary-commit-and-real-profile-lifecycle',
  'legacy-source-writer-concurrency', 'authenticated-native-account-e2e',
  'clinical-policy-and-model-validation', 'acceptance-endpoint-and-journal-binding',
]);
const SUBSCRIPTION_GAPS = Object.freeze([
  'other-eight-source-row-fixtures', 'real-source-cascades', 'cross-session-legacy-writer-concurrency',
  'normal-commit', 'verified-account-entitlement-or-acceptance', 'native-account-e2e', 'clinical-policy-validation',
]);
function requireCondition(ok, reason) { if (!ok) throw new Error('barrier_evidence_' + reason); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, expected, reason) { requireCondition(value === expected, reason); }
function positivePid(value) { return Number.isSafeInteger(value) && value > 0; }
function utcMicros(value) {
  requireCondition(typeof value === 'string', 'time_invalid');
  const match = /^(\d{4}-\d{2}-\d{2})[T ]((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.(\d{1,6}))?(?:Z|\+00(?::00)?)$/.exec(value);
  requireCondition(match, 'time_invalid');
  const seconds = Date.parse(match[1] + 'T' + match[2] + 'Z');
  requireCondition(Number.isFinite(seconds) && new Date(seconds).toISOString().slice(0, 10) === match[1], 'time_invalid');
  return BigInt(seconds) * 1000n + BigInt((match[3] || '').padEnd(6, '0'));
}
function closed(receipt, status, gaps) {
  requireCondition(record(receipt), 'receipt_invalid');
  exact(receipt.status, status, 'scope_changed');
  exact(receipt.installed, false, 'installation_claim');
  exact(receipt.recommendations_activated, false, 'activation_claim');
  requireCondition(Array.isArray(receipt.not_verified) && gaps.every(gap => receipt.not_verified.includes(gap)), 'unverified_scope_removed');
}
function cleanup(value, zeroFields) {
  requireCondition(record(value), 'cleanup_missing');
  exact(value.barrier_absent, true, 'cleanup_schema');
  exact(value.snapshot_md5, SNAPSHOT_MD5, 'snapshot_changed');
  for (const field of zeroFields) exact(value[field], 0, 'cleanup_' + field);
  return utcMicros(value.checked_at);
}
function verifyEvidence({ source, core, subscription }) {
  requireCondition(typeof source === 'string', 'source_invalid');
  const sourceSha = crypto.createHash('sha256').update(source).digest('hex');
  closed(core, 'private-core-overlap-verified-not-source-matrix', CORE_GAPS);
  closed(subscription, 'subscription-source-single-transaction-rollback-verified', SUBSCRIPTION_GAPS);
  exact(core.source_sha256, sourceSha, 'core_source_drift');
  exact(subscription.source_sha256, sourceSha, 'subscription_source_drift');
  const synced = prepareSynchronizedProbe(source);
  const subProbe = prepareSubscriptionSourceProbe(source);
  exact(core.holder_probe_sha256, synced.probeSha256, 'holder_payload_drift');
  exact(core.observer_probe_sha256, synced.observerSha256, 'observer_payload_drift');
  exact(subscription.probe_sha256, subProbe.probeSha256, 'subscription_payload_drift');
  const h = core.holder, o = core.observer;
  requireCondition(record(h) && record(o), 'sessions_missing');
  requireCondition(positivePid(h.pid) && positivePid(o.observer_pid) && h.pid !== o.observer_pid, 'sessions_not_distinct');
  exact(h.observer_pid, o.observer_pid, 'observer_pid_mismatch');
  exact(o.holder_pid, h.pid, 'holder_pid_mismatch');
  exact(h.checks, 14, 'core_check_count');
  exact(h.core_only, true, 'core_scope');
  exact(h.public_source_writes, 0, 'core_source_writes');
  exact(h.persistent_objects, 0, 'core_persistent_objects');
  exact(o.observed, true, 'overlap_not_observed');
  exact(o.acquired, false, 'exclusion_not_observed');
  const times = [o.started, h.hold_started, o.seen_at, o.attempt_at, h.observer_ack, h.ended, o.ended].map(utcMicros);
  requireCondition(times.every((t, i) => i === 0 || t >= times[i - 1]), 'overlap_time_order');
  requireCondition(times[6] - times[3] >= 3000000n, 'observer_sleep_not_demonstrated');
  requireCondition(times[5] - times[1] <= 20000000n && times[6] - times[0] <= 55000000n, 'probe_window_exceeded');
  const coreCleanup = cleanup(core.cleanup, ['probe_migrations', 'owner_and_handshake_locks', 'probe_connections', 'legacy_cron_active', 'observation_settings_count']);
  requireCondition(coreCleanup > times[6], 'core_cleanup_not_after_sessions');
  const s = subscription.result;
  requireCondition(record(s) && positivePid(s.pid), 'subscription_result_missing');
  exact(s.checks, 11, 'subscription_check_count');
  exact(s.source, 'subscriptions', 'subscription_scope');
  exact(s.committed_source_rows, 0, 'subscription_committed_rows');
  exact(s.owner_profiles_created, 0, 'subscription_profiles_created');
  cleanup(subscription.cleanup, ['probe_migrations', 'fixture_rows', 'probe_triggers', 'owner_locks', 'legacy_cron_active', 'observation_settings_count']);
  exact(subscription.cleanup.catalogMatches, true, 'subscription_catalog_not_restored');
  // The sanitized subscription execution receipt lacks an end timestamp. Its
  // cleanup time is syntactically checked, not correlated to that execution.
  // The manual raw-tool/postflight review is separate from this offline check.
  return Object.freeze({
    kind: 'historical-receipt-consistency-only', sourceSha256: sourceSha,
    verifiedHistoricalScopes: Object.freeze(['private-core-two-session-exclusion', 'subscription-source-single-transaction-rollback']),
    deploymentReady: false, activationReady: false, currentLiveStateVerified: false,
    receiptLimitations: Object.freeze(['subscription-cleanup-execution-order-not-machine-verifiable', 'sanitized-receipts-not-cryptographically-authenticated']),
    blockers: Object.freeze([...CORE_GAPS, ...SUBSCRIPTION_GAPS, 'pilot-implementation-and-review', 'verified-total-transaction-deadline']),
  });
}
function readAndVerify(root) {
  const directory = path.join(root, 'release-candidates/tdee-adaptive-review');
  return verifyEvidence({ source: fs.readFileSync(path.join(directory, 'sourceBarrierCandidate.sql'), 'utf8'),
    core: JSON.parse(fs.readFileSync(path.join(directory, 'sourceBarrierVerifiedResult.json'), 'utf8')),
    subscription: JSON.parse(fs.readFileSync(path.join(directory, 'subscriptionSourceVerifiedResult.json'), 'utf8')) });
}
module.exports = { verifyEvidence, readAndVerify, utcMicros };
if (require.main === module) console.log(JSON.stringify(readAndVerify(process.cwd()), null, 2));
