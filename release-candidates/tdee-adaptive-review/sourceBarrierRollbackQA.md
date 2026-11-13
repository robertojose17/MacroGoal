# Source barrier rollback rehearsal, 2026-11-13

Status: **private-core multisesession overlap verified; not installed, not activated, complete source concurrency still incomplete**. These checks used the existing authorized database, not a new environment. No real account identity was assumed and no public source row was written.

## Candidate and generated probes

Candidate `sourceBarrierCandidate.sql` SHA256:
`84f9196fa95e34d48f00fc051600af8b28caa68d9b27b732e8a9e8590aa24b5d`.

`tests/prepare-source-barrier-rollback-probe.cjs` only generates SQL and hashes. It does not connect, execute, install or activate. Its eight maintained tests reject unsafe transformations. Every probe removes the candidate COMMIT, replaces real-owner enrollment with `SELECT id FROM public.users WHERE false`, and ends in a mandatory exception. Public source INSERT/UPDATE/DELETE are absent. The normal full probe has a 2-second lock timeout, a 30-second statement timeout and no sleep. A hold is allowed only in private-core mode, at most 20 seconds; that mode removes all ten public source/enrollment trigger definitions and preserves the private flush constraint.

| Probe | SHA256 | Observed result |
| --- | --- | --- |
| Full candidate, no real enrollment | `eb83fbb30173735d476cfb13ff2edbc069cb80da5a83afee8bbfdc53c10520d9` | 13 checks reached expected P7700; whole transaction aborted |
| Private-core REPEATABLE READ rejection | `7a72d2005264192f955121b88be119111ddde6ea5e1a068954c85efebef24b2e` | Actual flush rejected with 25000; restored empty workset/revisions; expected outer P7700 |
| Private-core 20-second concurrent holder | `ba688419247e46eed65275dd27598ec34fbe632011dee9c84818db3f9dbeafb9` | Subsequently executed 13 checks and forced rollback after explicit resend; observer did not demonstrate overlap |

The full probe checked synthetic-owner collision exclusion, closed role access, compiled trigger inventory, no real enrollment, transaction/owner queue deduplication, deferred and immediate cleanup, subtransaction rollback before and after flush, final cleanup, missing-auth rejection, absent-profile reset handling and both existence-independent owner keys. It uses two synthetic private revision/workset identities only. It does **not** test a real profile's ordinary revision increment, a successful acceptance, actual source triggers firing on account rows, cascade behavior, normal commit or lifecycle interleaving.

An earlier source version also completed 12 checks with forced rollback. That older result is superseded for the current candidate by the 13-check and isolation probes above; it is not added to a concurrency coverage count.

## Multi-session attempt and exact blocker

The holder was requested through apply_migration under name `tdee_source_barrier_multisession_rollback_probe_v1`. The tool returned `confirmation expired after 2 minutes`, not a PostgreSQL execution result. No automatic retry or alternative execution path was attempted.

The separate observer inspected only pg_locks metadata for the reserved namespace and synthetic owner key. It waited at most 55 seconds under a 65-second statement timeout. It was designed to call a single transactional try-lock only **after** seeing another granted holder, then roll back. It returned `observed:false`, so did not call try-lock. There is no overlapping-holder evidence and this attempt is not a pass. The tool confirmation must be completed while valid for the blocked holder action; its bounded timing must then actually overlap the observer before any claim is made.

Even a successful technical overlap would prove only that the candidate's private flush holds the same owner key across two sessions. It would not establish complete source serialization, actual-account E2E or clinical validity.

### Explicitly authorized confirmation renewal

After checking the same source/payload hashes, absence of objects/migration records and zero locks, the same holder action was requested once more at the coordinator's explicit direction. Its confirmation again expired after two minutes, without a PostgreSQL execution result. The observer performed three bounded windows, all `observed:false`, each ending in ROLLBACK without trying a lock. No overlap is claimed. A fresh cleanup check again found zero schema/migration/lock residue and the legacy cron OFF.

The holder is now paused until the person can complete the tool confirmation while available. There will be no automatic retries, alternative DDL execution route or invented authenticated session. The candidate and exact probe payload are unchanged. Rehearsal approval does not authorize installing the barrier or activating recommendations.

### Independent compatibility inventory continued

A fresh read-only scan of installed function/procedure bodies in `public`, `macrogoal_observed_private` and `macrogoal_dynamic_tdee_private` found no explicit SET CONSTRAINTS, REPEATABLE READ, SERIALIZABLE or transaction-isolation references. A source scan of app/components/hooks/utils/features/supabase found only READ COMMITTED guards in an unrelated uninstalled Community candidate and an unrelated use of the word serializable for JSON. No installed/source writer explicitly selecting incompatible isolation was identified by this bounded scan.

This is negative search evidence only: external services, dynamic SQL, other schemas, database/session defaults and future callers are not proved absent. The new fail-closed isolation guard remains an installation compatibility gate, not permission to relax it.

### Approved holder subsequently executed, without observed overlap

After the person explicitly requested another send and completed the tool confirmation, the original private-core holder (`ba688419...`) executed successfully. PostgreSQL reported 13 checks, PID 4144889, hold start `2026-11-13T13:44:25.994478+00:00` and end `2026-11-13T13:44:46.108689+00:00`, followed by the intentional P7700 that aborted the whole transaction. A separate observer returned `observed:false` with PID 4145488; it did not try the owner lock. Its later windows were canceled once the holder's interval had passed. This proves the holder worked but **does not prove two-session overlap**.

Fresh cleanup again found schema absent, zero probe migration rows, zero namespace locks, cron OFF, observation settings count zero and the unchanged read-only snapshot hash. The source and original holder hashes did not change.

A new, not-yet-executed synchronization harness now requires an observer readiness marker before any private DDL and an acknowledgment from that same observer PID before reporting success. The observer only acknowledges after seeing another holder and failing to acquire that exact owner key. Both sides record timestamps. The holder's wait remains bounded by 20 seconds; the current observer uses bounded 45-second windows with a 55-second statement timeout, followed only by a 3-second acknowledgment window; additional windows require a confirmed clean result and an explicit bounded assignment. Both transactions still roll back, no public source/enrollment triggers are installed, and no public source row is mutated. The ready/ack keys are checked against both synthetic owner hashes. A missing observer is a failed rehearsal, never success. The changed harness must receive its own valid tool confirmation before execution.

## Cleanup independently read back

After successful forced-abort probes and again after the expired holder request:

- Barrier namespace absent; zero migration records for the probe names.
- Zero advisory locks in the reserved owner namespace.
- Legacy adaptive cron inactive; observation settings count zero.
- Existing read-only snapshot MD5 remains `8a16cf042d8b6eed72de336e26f5c14d`.
- All 24 expressly approved API-role/table TRUNCATE combinations still denied.

Private raw receipts, generated SQL and manifests are retained outside the tracked candidate. They must not be confused with successful installation receipts. No recommendations, source enrollment or account mutation occurred.

## Remaining release gates

Actual source/profile lifecycle and cascades, opposite-owner bulk operations, direct/legacy/service writers, early IMMEDIATE and later deferred writers, lock capacity/timeouts and fresh snapshots after waits remain unverified. The new rejection of non-READ-COMMITTED source transactions is a deliberate compatibility constraint, not a supported-isolation claim. No verified authenticated native session is available. Clinical model/policy/eligibility and complete-intake capability, enriched snapshots and real acceptance/journal/receipt bindings are still absent. Keep the candidate OFF and uninstalled.

## Synchronized attempt outcome and timing correction

The ready marker was independently observed in the existing database, PID 4146187. Its exact observer interval was `2026-11-13T13:52:54.841011+00:00` through `2026-11-13T13:53:49.957806+00:00`; result `observed:false`, no try-owner lock and no ack. The holder's new tool confirmation expired after two minutes, without execution. Fresh readback found no barrier schema, no probe migration records and no owner/ready/ack locks. The cron remained OFF. No automatic retry was made after the coordinator paused this test.

This exposed a harness scheduling limit: a 55-second readiness window could expire before a permitted two-minute tool confirmation. The prepared observer now allows at most 150 seconds on its two reserved metadata marker keys only. The holder still fails before private DDL if readiness is absent, requires the same observer PID's ack to claim success, and holds the synthetic source-owner keys for **at most 20 seconds**. The observer records actual times even when no holder appears. This timing correction is prepared locally, not executed or production-installed. A future attempt still needs a valid tool confirmation and matching receipts from both sessions.

## Verified synchronized result, 15:49 UTC

The final holder was the unchanged synchronized payload `a2cb34a063a0be8ffe34d3459af544377ec49c3a2256c3b2c0bbea1e32d0dc05`; the observer used payload `8ff32cfbb52888f26d11b42dd36ec62afc9a9412015ae816458b52c43d60a421`. The actual source stayed `84f9196f...`. The attempted 150-second observer had encountered a connector timeout; its uncertain outcome was resolved before proceeding: no connection, lock, object or migration residue remained. The final observer used a 45-second window, safely below that transport limit.

- Holder PID **4154378**: owner fence held from `15:49:28.304244` through forced abort at `15:49:28.555574` UTC; **14 checks**, including same-observer acknowledgment, reached expected P7700.
- Observer PID **4154373**: saw holder at `15:49:28.345348`, attempted the same owner key at `15:49:28.345361`, got **acquired=false**, acknowledged, and completed SELECT plus ROLLBACK at `15:49:31.350655` UTC.
- Both raw receipts were correlated programmatically by distinct matching PIDs and ordered microsecond timestamps. Holder acknowledgment lies inside both intervals. This is actual overlapping PostgreSQL-session evidence, not a simulated schedule or a successful holder alone.
- At `15:49:54.463438` UTC, fresh catalog readback found no barrier schema, no probe migration rows, no owner/handshake locks and no probe connections. Cron and observation settings remained OFF/zero; the existing snapshot hash was unchanged.

`sourceBarrierVerifiedResult.json` retains the sanitized, correlated result with exact hashes and explicit unverified scopes. It contains technical probe metadata only, no account identity or nutrition data. The private-core exclusion check is now PASSED. Actual source rows/cascades, normal commit, real profile lifecycle, legacy interleavings, native account E2E and clinical activation are **not** passed by this result. No barrier installation, enrollment or recommendation activation occurred.
