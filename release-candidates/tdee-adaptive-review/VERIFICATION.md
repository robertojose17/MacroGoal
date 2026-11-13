# Disabled adaptive candidate verification

Date: 2026-11-13. Base: `1d40acb1aa541fb0468275622b2d6a231f5d2165`.

## Passed

- `node scripts/ci/run-stage.cjs ci-regressions`: **598/598 pass, 0 skipped**. This includes 25 draft-proposal, 62 headless acceptance/recovery and 23 static SQL/permission-contract tests and 8 rollback-probe preparation tests plus 10 subscription-source preparation tests and 15 historical-evidence consistency tests registered in the maintained gate. Tests use synthetic engineering fixtures, not account data.
- Independent source review and rerun of those **87/87** focused cases: no new defect identified after the final corrections.
- ESLint of both candidate modules, both test files and the changed stage script: no diagnostics.
- Strict TypeScript compilation of the controller is also exercised by the maintained test suite.
- Whole-application absolute type check: **393 roots, 1 diagnostic**. The existing `app/delete-account.tsx:48` query references nonexistent `meal_items.user_id`. Account deletion is explicitly outside this changeset; the gate is not suppressed or called passing.

## Important final corrections

- A positive adjustment history cannot omit its acceptance timestamp and bypass cadence.
- New macros use whole grams and the existing energy-consistency tolerance. Legitimate zero remains zero.
- Crossing the account's civil midnight invalidates an old source even within the cache lifetime.
- The accepted anchor must agree with loss/gain/maintenance intent; a new deficit is never stacked onto an existing target.
- Current weight must match dated, source-attributed, non-conflicting normalized evidence. Its maximum age is an explicit, still-unapproved policy parameter, not a hidden medical threshold.
- Committed receipts carry exact goal ID/version and current/superseded status, always requiring a fresh active-goal read. Historical reconciliation remains possible when new recommendations are OFF.
- `not_found` with contradictory extra fields never authorizes a resend. Definitive rejection can be acknowledged explicitly only after server reconciliation, using atomic compare-and-clear of that rejected journal. An uncertain request is never discarded as a rejection.
- No runtime application/Edge entrypoint imports this candidate; a regression test enforces this boundary.

## Not passed or not run

- No clinical approval, clinical model validation, verified eligibility or verified complete-intake workflow exists for this candidate. Test policy numbers are not production defaults or recommendations.
- No real proposal/anchor/receipt registry, enriched snapshot adapter, native journal binding or authenticated acceptance endpoint is implemented here.
- Source serialization now has a local SQL implementation candidate, not an installed or source-interleaving-verified capability. U → exact active goal G → owner revision R resolves the identified simple inverse-lock cycle, but complete writer transactions, cascades, owner moves and multi-owner operations still require coverage and real PostgreSQL multi-session validation. Read-only inventory, the uninstalled schema candidate and the separately approved permission-only change are clearly separated. Candidate DDL has only run inside deliberately aborted transactions, with real enrollment skipped; no barrier installation has committed. An advisory-lock transport probe demonstrated two overlapping sessions in the existing database and left zero probe locks; it did not exercise TDEE sources or the barrier.
- No native authenticated account E2E, device recovery test, build, TestFlight, Site, new environment, account mutation or paid generation was performed for this changeset.
- The recommendations/acceptance release state is immutable OFF; every generated engineering draft is non-actionable. No existing manual/restart RPC is used to bypass that boundary.

Passing the code checks makes this candidate reviewable, not ready to activate or release. The already verified GitHub backup covers the prior base; this changeset requires its own appropriately scoped publication before it can be described as remotely backed up.

## Subsequently verified permission-only action

Explicitly approved migration `20261113121512` (`tdee_source_truncate_least_privilege_v1`) removed only TRUNCATE on the eight authorized public source tables from anon/authenticated/service_role. Fresh preflight matched the retained baseline exactly; the SQL payload hash matched the reviewed file. Postflight found all 24 combinations false, all 108 ordinary CRUD checks unchanged, every other ACL entry unchanged, and owner/RLS flags/policy fingerprints unchanged. Exact ACL/grantor/grant-option rollback information was preserved privately. No source-data statement was executed.

Separate live readback still found no writer-barrier schema, legacy cron job34 OFF, zero enabled observation settings, and the original read-only snapshot definition unchanged. This is not acceptance activation, native QA or a test of source-row concurrency.

## Real SQL rehearsal and latest remaining block

The current candidate source SHA256 is `84f9196fa95e34d48f00fc051600af8b28caa68d9b27b732e8a9e8590aa24b5d`.

- Full candidate DDL, excluding real-owner enrollment, executed in the existing PostgreSQL database. **13 checks passed** against only synthetic private workset/revision rows. An intentional SQLSTATE P7700 at the end aborted the entire transaction; that expected tool error is the success marker, not an installed migration.
- A separate private-core REPEATABLE READ transaction exercised the actual deferred flush and was rejected with SQLSTATE 25000. Its subtransaction restored the empty private workset/revisions; the outer transaction deliberately aborted. This closes the independently identified stale-snapshot bypass by refusing unsupported isolation, not by claiming compatibility with it.
- Fresh catalog checks after both probes and the later expired call found barrier schema absent, zero probe migration rows, zero owner advisory locks, legacy cron OFF, zero observation settings, unchanged snapshot MD5 and zero authorized API-role TRUNCATE privileges.
- The final synchronized private-core probe PASSED with 14 holder checks and a second PostgreSQL session receiving acquired=false on the same owner key. Distinct matching PIDs, microsecond-ordered timestamps and same-observer acknowledgment were correlated from both raw receipts. Fresh cleanup found no schema/migration/lock/connection residue. Earlier expirations and unsynchronized attempts are retained in the chronology, not counted as passes. This proves private-core mutual exclusion only, NOT full source/cascade/acceptance concurrency. No alternative DDL execution route was used.

See `sourceBarrierRollbackQA.md` for exact hashes, transformations, scope and unresolved tests. Clinical validation, real-account native E2E and real source/cascade concurrency remain unpassed. These probes do not justify installing or activating the candidate.

## Public subscription source rollback verified

`sourceCascadeReview.md` records the sanitized read-only FK/callback review. `tests/prepare-subscription-source-probe.cjs` prepares a single inactive synthetic subscription with the actual candidate source trigger, bounded table-DDL contention and a forced outer rollback. Its reviewed payload SHA256 is `2a2229869940761fd868936c2ef48e9b0ba4495cc67350844948b79d75a1d109`; source SHA remains `84f9196f...`. Ten maintained preparation tests pass. Three earlier confirmations expired without execution; the next explicitly requested confirmation completed and the actual probe passed 11 checks before mandatory rollback. Fresh readback confirmed the exact original catalog fingerprint and no fixture, candidate schema/migration/trigger/locks. This is a passed subscription callback/rollback test, not a passed cascade or concurrent-source matrix. No account identity was inferred, and the other eight sources remain outside that identity-free probe.

## Historical evidence integrity gate

`node scripts/ci/verify-tdee-barrier-evidence.cjs` regenerates reviewed probe bytes
and rejects source/payload drift, uncorrelated PIDs, invalid microsecond ordering,
an observer interval shorter than its fixed three-second sleep, inconsistent
counts/scopes or missing rollback/cleanup fields. Fifteen mutation tests pass,
including independent-review counterexamples. The output always leaves deployment,
activation and current-live-state verification false. This is offline consistency
of retained evidence, not a new SQL test or cryptographic receipt authentication.
The sanitized subscription receipt lacks an execution end time; its cleanup order
is therefore explicitly not machine-verifiable by this gate. The original manual
raw-result/postflight review remains separate. Never fabricate a timestamp to close it.
