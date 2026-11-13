# Source barrier transition plan: preparation only

Date: 2026-11-13. **Not authorized for execution by this document.** No migration,
public endpoint, enrollment or recommendation is enabled. The current global
`sourceBarrierCandidate.sql` is a reviewed engineering candidate, **not the
one-account pilot described below**. Its reviewed SHA256 is
`84f9196fa95e34d48f00fc051600af8b28caa68d9b27b732e8a9e8590aa24b5d`.

## Decision and verified baseline

Prepare a separately reviewed, persistent **single verified owner** pilot in the
existing database before attempting committed legacy-writer concurrency. Do not
install the global candidate merely to obtain a test result. Do not create a new
app, environment or Auth user. Recommendation calculation remains an inert draft;
acceptance, automatic target changes and the old cron stay OFF.

Already established, with independent scopes:

- Candidate compilation and 13 private-workset checks passed under forced rollback.
- Real REPEATABLE READ flush rejected unsupported isolation with SQLSTATE 25000.
- A real second database session was excluded by the private-core owner fence;
  the holder passed 14 checks. This did not exercise committed public sources.
- The real subscription callback passed 11 checks on one inactive, synthetic,
  nonexistent-owner fixture. Mandatory rollback and exact catalog restoration
  were verified. This was not a subscription or entitlement test for a person.
- 583 maintained code checks passed. The whole-app type check still has one
  unrelated account-deletion diagnostic; it is not declared passing.

Fresh read-only production check at 2026-11-13 18:24:45 UTC: barrier schema absent,
legacy TDEE cron OFF, observation settings count zero, snapshot definition unchanged,
zero barrier advisory locks and zero API-role TRUNCATE combinations. These are dated
receipts, not assertions that a future preflight may be skipped. See
`sourceBarrierVerifiedResult.json` and `subscriptionSourceVerifiedResult.json`.

## Why another rollback-only DDL test is insufficient

`CREATE TRIGGER` acquires a SHARE ROW EXCLUSIVE table lock that conflicts with
ordinary writers and is held until transaction end. A second session cannot
exercise an uncommitted installed trigger as if it were committed. Thus an
installation-and-rollback transaction does not prove normal concurrent source
writes against the installed barrier. This conclusion follows from PostgreSQL's
[table-lock rules](https://www.postgresql.org/docs/17/explicit-locking.html) and
[transaction visibility](https://www.postgresql.org/docs/17/tutorial-transactions.html).
The passed rollback probes remain useful but narrower evidence.

## Entry gates before any persistent transition

1. **Authenticated identity and application path.** Obtain the owner from the
   actual signed-in Macro Goal session through its verified Auth flow. An admin
   dashboard login, username, contextual UUID or manually set SQL claims do not
   establish this. Record identity evidence privately, without tokens. Verify
   which native/app version is open. The canceled Site, an Expo review alias or
   a successful EAS build is not an installed production client.
2. **Exact reviewed pilot artifact.** Implement a separate manifest and pilot
   variant. Pin all nine source relations, trigger/function definitions, owners,
   grants, RLS, relevant FK/callback closure, private objects and advisory keys.
   Use a non-public enrollment record with an immutable random generation. No
   owner UUID belongs in public source or documentation. No all-user backfill.
3. **Compatibility review.** Inventory actual writer transaction orders and
   isolation, including nested callbacks, maintenance and provider workers.
   Check source drift, external side effects and multi-owner writes. Freeze
   relevant function deployments during validation; a table lock does not stop
   concurrent function-body replacement.
4. **Action-time approval.** Disclose the exact persistent object changes and
   the global effects below before installation. Prior confirmation for
   rollback-only tests or TRUNCATE removal does not authorize this deployment.
   No recommendation activation or new execute grant is bundled into it.

## Pilot design requirements, not implemented guarantees

- Immediate source hooks derive **OLD and NEW** owners and real meal/tracker
  parents before applying scope. Never authorize or filter by `auth.uid()` alone:
  service writers and cascades can have a different caller or no caller.
- Scope must survive until that transaction's deferred source work has flushed.
  Queue both owner and immutable enrollment generation. Recheck generation at the
  fence; a stale enrollment may not affect a replacement. No lazy enrollment by
  an acceptance call or ordinary source write.
- Do not attach a foreign key from private revision/enrollment rows that would
  acquire revision locks early in Auth/profile cascades. Remove stale enrollment
  and revision only after the final source flush and an absence recheck. Profile
  recreation must require new verified enrollment, not silently inherit UUID
  authority. Lifecycle behavior needs review before implementation.
- Refuse unsupported isolation **before reading/filtering enrollment**. Merely
  filtering on an allowlist can miss a newly enrolled owner in an old REPEATABLE
  READ snapshot. READ COMMITTED uses a fresh statement snapshot whereas REPEATABLE
  READ retains its earlier transaction view. See PostgreSQL's
  [isolation definition](https://www.postgresql.org/docs/17/sql-set-transaction.html).
- Source transactions collect their complete workset before sorted advisory
  fences, then sorted revision rows. The future acceptance order remains profile
  U → exact goal G → owner fence A → revision R; source snapshots must be reread
  after those locks. Do not lock newly discovered source rows after R.
- Early `SET CONSTRAINTS ... IMMEDIATE`, later deferred source writers, and legacy
  G→U operations are unresolved compatibility cases, not covered by the passed
  private-core exclusion test. Reject unsupported patterns or prove a compatible
  protocol; never hide a deadlock with automatic write retries.
- The private schema remains inaccessible to API roles, with no public wrapper,
  receipt registry or accepting endpoint. Scope is observation of serialization,
  not permission to prescribe or accept a target.

## Concrete production impact to disclose

Although only one account would be enrolled, table DDL locks touch all nine source
relations and can briefly block **any user's** writes to those tables. The proposed
migration is one atomic transaction, fixed lock order, `lock_timeout = 2s`,
`statement_timeout = 30s`, no sleeps or hold-for-approval inside it. These settings
are per-lock/per-statement limits, **not a verified 30-second bound on the entire
multi-statement transaction**. A total execution deadline, cancellation behavior
and post-cancellation rollback/lock cleanup still must be implemented and verified
before this becomes executable. Do not claim a maximum interruption from the
statement timeout alone. See PostgreSQL
[timeout semantics](https://www.postgresql.org/docs/17/runtime-config-client.html).
Timeout or fingerprint mismatch aborts the action, without automatic retry.

A correct scope filter also does **not** make every runtime effect account-local.
The pre-filter isolation guard would reject source writes made under unsupported
isolation even by non-enrolled owners. Every source hook has execution overhead.
New workset/fence contention can expose existing lock cycles. These global effects
must be independently reviewed and accepted, or the pilot must be redesigned.
Ordinary CRUD permissions and RLS remain unchanged; the approved TRUNCATE removal
is a separate prerequisite and must not be reverted incidentally.

## Atomic installation and enrollment sequence, if later approved

1. Freshly verify project, source/artifact hashes, callbacks, privileges, inactive
   routes/cron and absence of unexpected pilot objects. Preserve a private exact
   catalog manifest and rollback plan. Do not read unrelated account rows.
2. In one bounded transaction, acquire all nine source table locks in a documented
   fixed order before enrollment. This drains prior source writers; an owner
   advisory lock alone cannot drain writers that predate installed hooks.
3. Install the reviewed private pilot objects and source hooks, then enroll only
   the independently verified owner with a fresh generation. No global profile
   scan, health-data copy, goal mutation or policy setting change.
4. Validate the exact in-transaction manifest, privileges and enrolled count; commit
   only that complete unit. On any mismatch abort, never leave partial hooks.
5. Fresh readback proves committed hashes, exact scope, closed public access and
   inactive acceptance/recommendations. A second-session test may begin only now.

This is a sequence for future review, not executable SQL or proof the design is
ready. API roles cannot be given a new route merely to make a probe convenient.

## Required source and recovery evidence

Use only account-scoped, explicitly marked fixtures whose callbacks have been
reviewed. Prefer per-test rollback, and record before/after hashes and cleanup.
Never test a path whose external callback can escape rollback. No account deletion,
Auth creation, guard bypass, real premium activation or purchase is required.

- Eight remaining sources: permitted insert/update/delete paths, OLD/NEW ownership
  and parent changes, valid-owner revision/epoch and existing writer compatibility.
  **Exclude creating, deleting or replacing Auth/users profiles from this scope**;
  profile deletion/recreation and authority transfer remain explicitly unverified.
  No all-operations coverage claim may be made for that source.
- Parent deletion and allowed meal/tracker cascades; forbidden food deletion stays
  forbidden. No user/profile deletion test under the current authorization.
- Two real sessions: direct food/weight/settings writer versus context lock;
  changed source invalidates the old revision, rollback does not advance it,
  lost responses do not cause duplicated writes. Use verified request identities
  and correlated receipts, not fabricated JWT claims.
- Early constraint flush and later deferred writer behavior; multi-owner worksets
  only where all affected owners are authorized. No second person's account or
  fake Auth account may be introduced to fill a coverage gap.
- Existing actual app: current accepted targets, manual save/restart, sign-out,
  interrupted/repeated request, explicit retry and recovery. Record installed
  source/version separately. SQL success does not establish app E2E.

Normal-commit fixtures, if genuinely necessary, require an explicit reviewed
restoration plan. Do not delete original user data or overwrite concurrent edits.
Failure or missing coverage leaves the capability OFF.

## Rollback and stop conditions

On source errors, unexpected latency/locks, fingerprint drift, identity uncertainty
or callback surprises: stop testing; do not activate recommendations. Disable only
new capability entrypoints if any were separately authorized, drain in-flight
operations and keep unrelated cron/permissions unchanged.

Prepare a separate exact-hash rollback transaction with bounded locks. Remove only
manifest-owned hooks after rechecking their definitions. Do not `DROP ... CASCADE`
or remove unknown objects. Verify the original catalog and all affected CRUD/RLS
fingerprints. Keep private pilot records closed and preserved unless deletion is
explicitly authorized and a verified equivalent copy exists; disabling hooks does
not itself authorize irreversible data deletion. On drift or lock timeout abort
and report the exact blocker rather than broadening rollback.

Finally verify no unexpected queues/locks, no persisted fixtures, original targets
intact, and recommendation/acceptance state OFF. If any result is uncertain, inspect
it before retrying. Publication, merge, build and TestFlight are separate actions.

## Current blocking facts

No unequivocal consumer Auth identity or controllable installed candidate has been
verified. Only a canceled consumer Site and administrative sessions were found.
Expo's existing alias was a review deployment, not a verified normal web release.
Reading Auth URL Configuration is currently blocked by ownership of the existing
browser tab; no session was forced and no setting changed. A configured redirect
URL, if later read, would be a discovery lead, not proof of a deployed app or login.

The eight-source/cascade matrix, committed legacy concurrency, pilot implementation
and independent review, qualified clinical policy and native recovery remain open.
This plan closes the transition analysis, **not those gates and not TDEE readiness**.

## Independent review

Read-only review approved this document as preparation only. Its two corrections
are incorporated: per-statement timeout is not a total transaction deadline, and
the source matrix explicitly excludes Auth/profile creation/deletion/replacement.
No pilot code, total-deadline enforcement or installation was approved by that review.
