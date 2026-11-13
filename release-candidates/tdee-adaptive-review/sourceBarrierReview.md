# Source serialization: implementation boundary and rollout plan

Status: **local SQL candidate implemented, not installed or runtime-validated, adaptation OFF**. Review 2026-11-13. This supplements ACCEPTANCE_CONTRACT.md. Only catalog metadata was queried; no account rows, fixtures, database changes, app execution, environment or deployment. The accompanying SQL is a read-only inventory, not a migration or capability certificate.

## Concrete conclusion

A safe minimal change today is the read-only inventory and closed capability gate, not installing a partial set of triggers. Compatibility with direct CRUD and existing profile→goal locking needs a cross-writer migration and real multisesession verification. The current sourceWriterProtocol marker in an injected candidate adapter cannot establish that coverage.

Two viable designs need further evaluation: (A) mandatory per-owner serialization acquired before each affected write, with redesigned writer entry points and controlled direct CRUD compatibility; (B) a revision fence updated transactionally by all source mutations, with acceptance acquiring and comparing that fence plus fresh snapshot. Neither is implemented here. A revision fence still serializes writers and has lock-order and snapshot problems; renaming it does not solve them.

## Actual source dependency map

The checked-in observed_get_tdee_snapshot_v1 query reads:

| Relation | Relevant dependency | Coverage required |
| --- | --- | --- |
| public.users | actor existence, timezone, DOB, journey start, updated_at | insert/update/delete; profile version changes, even unrelated fields if fingerprint includes them |
| public.goals | active owner goal and all fingerprinted fields | inserts, updates, deactivation, deletion, owner changes; manual and restart RPCs |
| macrogoal_observed_private.settings | enabled, review_day, started_on, complete record | every insert/update/delete and settings RPC |
| public.subscriptions | user_id text, active/trialing status, entitlement_ids, expiration_at | writes/deletes/moves; time expiration also requires server-clock revalidation without a write |
| public.trackers | owner, default flag, name matching weight, unit, id | inserts/deletes/updates that enter or leave selector, not only currently selected trackers |
| public.tracker_entries | owner and tracker relationship, date, value, created_at | writes/deletes/moves for old/new entry and tracker owners |
| public.check_ins | owner, date, weight, timestamps | writes/deletes/moves, including null weight becoming known |
| public.meals | owner, date, meal_type, id | writes/deletes/moves, including outside-window rows moved inside |
| public.meal_items | parent meal, calories, is_scheduled, id | writes/deletes/moves; no user_id column; scheduled→logged changes |

Snapshot caps (2 trackers, 5001 weight/items, 501 meals) are not permission to omit affected writers. Crossing a cap must make evidence unusable. Policy, eligibility, completeness attestations and adaptive proposals are additional future dependencies, not existing verified records.

## Verified catalog and hidden cascade surfaces

Catalog rechecked read-only on 2026-11-13:

- No shared source-revision/barrier trigger on meal_items, check_ins, trackers, tracker_entries or observation settings.
- Goals have an updated_at trigger. Meals have AFTER INSERT first-meal handling. Users and subscriptions have side-effect/authority triggers; these must be included in lock-order review rather than replaced.
- meal_items.meal_id → meals ON DELETE CASCADE.
- **meal_items.food_id → foods ON DELETE CASCADE**. A global catalog deletion can therefore delete diary data for several actors. Do not inventory only user-facing Food CRUD.
- meal_items.food_item_id → food_items ON DELETE SET NULL. This FK value is not in the present snapshot projection; currently it does not itself change observed calories, but triggers and future schema expansion must be reviewed.
- tracker_entries.tracker_id → trackers ON DELETE CASCADE, while tracker_entries.user_id independently references auth.users. Parent and entry owner are not proven equal by these FKs.
- Meals/check-ins/trackers/tracker entries reference auth.users ON DELETE CASCADE. Goals reference public.users ON DELETE CASCADE. Public profile locking is not equivalent to locking auth.users.
- Subscriptions have no FK in the inspected FK result; owner is text in the snapshot predicate. Canonical mapping and invalid-owner handling cannot assume UUID FK enforcement.

Catalog food nutrition is not joined to compute this snapshot: item calories are materialized. Do not unnecessarily serialize every catalogue nutrition edit; do cover catalogue operations that cascade into diary source or verified triggers that propagate changes.

## Why a generic row trigger is not a safe completed solution

1. Existing manual/restart operations lock profile then goal. Acceptance must preserve that order and acquire revision LAST: users U → exact active goal G → revision R. The earlier R→G proposal creates a direct-G→R cycle; U→G→R eliminates that specific cycle. After R, acceptance must not acquire source row locks. Audit complete transactions, not only individual trigger calls: a writer that already owns R from an earlier statement and later acquires U/G can still invert the order. No such current writer has been established by this review; its absence remains to be proved.
2. Cascading meal deletion may execute child triggers after the parent is no longer visible to their lookup. A missing meal cannot be treated as no owner/no revision. Capture owner obligations at the parent operation, or use a reviewed immutable ownership mapping/denormalization with enforced consistency and backfill. Neither exists yet.
3. A tracker or meal move needs old and new owners; entry owner and parent owner may differ. Lock both deterministically before mutation, or explicitly prohibit ownership changes after verifying existing legitimate paths. Silently rejecting existing moves would change behavior.
4. Bulk foods deletion may touch many actors. Per-row sorting does not globally sort owners across the statement/transaction. Statement-level AFTER transition tables also run after row locks have been taken. A design must handle full transaction order or retry safely; do not claim alphabetical trigger names solve this.
5. FK key-share locks on parent inserts are not universal coverage of non-key update/delete or child changes.
6. Source revision is transactional: update it in the source mutation transaction, not asynchronously. Rollback must revert it too. Revisions cannot be max timestamps/counts, which miss edits/deletes and ABA changes.
7. Under READ COMMITTED, acquire the fence then execute a fresh source read in a new statement/snapshot. A SELECT that starts before waiting can retain stale visibility. Under REPEATABLE READ, a subsequent statement still uses the old snapshot; either explicitly reject unsupported isolation or prove a safe alternative, including revision-conflict behavior.
8. Do not introduce global table locks. Do not claim SERIALIZABLE acceptance alone establishes participation of unmodified direct writers.

## Concrete AFTER-trigger revision-fence candidate, not installed

A useful candidate is a private revision row per owner, updated by AFTER INSERT/UPDATE/DELETE source triggers in the writer transaction. Acceptance locks that row through commit, then performs a fresh VOLATILE READ COMMITTED snapshot and compares the proposal's revision and fingerprint. A writer holding uncommitted source changes cannot commit until its AFTER trigger acquires and increments the same revision. Acceptance can legally linearize before that writer; the uncommitted source change need not be included. After acceptance commits, the writer increments revision and commits later. This is a real transaction protocol, unlike a boolean marker or a double hash read.

Coverage specifics: meals/trackers parent OLD+NEW owner bumps cover their cascades even if a child can no longer resolve the deleted parent. A foods→meal_items cascade can resolve the surviving meal owner; concurrent meal deletion/moves still require tests. Entries must account for both entry owner and tracker owner. Revision rows should not inherit an unreviewed FK to public.users/auth.users; account deletion behavior is outside this task and must not be changed incidentally. No account-delete function modification is proposed.

Correction after lock-order review: acceptance should lock **U→G→R**, not R→G. This removes the specific direct goal writer G→R / acceptance R→G cycle. Existing manual/restart U→G is compatible with that prefix. Once R is held, perform only fresh plain MVCC reads of source rows; own goal/profile mutations already have their tuple locks and revision bumps are reentrant. Do not describe the solved two-transaction cycle as an outstanding impossibility.

Phantoms still require explicit handling: lock only the exact expected active goal and reject if absent/changed/multiple. Do not treat a missing row lock as locking the gap or auto-adopt a newly inserted goal. The partial unique active-goal index protects active multiplicity, not arbitrary source freshness. After R, reread coherent current state and validate exact goal/profile CAS; any newly visible different active goal conflicts. Uncommitted source inserts remain serialized by their pending AFTER bump. Acceptance may only insert its own replacement after deactivating the locked old goal; ensure no new active-goal lookup/lock is introduced after R.

Remaining work is broader than claiming all deadlocks solved: confirm no whole writer transaction takes R and then subsequently U/G or policy/proposal locks; verify triggers/recursive side effects and all owner/cascade mappings; handle multi-owner bulk operations (R1/R2 cycles); and test fresh snapshots after waits with actual PostgreSQL. For simple single-owner source DML whose only final lock is R, the revised ordering is compatible. Reviewed first-meal and subscription-activation trigger bodies write onboarding/referral records, not public.users or goals; those two bodies do not establish a reverse U/G edge. Other writers were not exhaustively audited.

Lock timeouts are useful but are not proof of no legacy regression, and automatically replaying arbitrary legacy mutations remains forbidden. Account deletion stays outside this task. These are bounded inventory/testing obligations, not a proof that a safe implementation is impossible.

Consequently this deliverable does not include executable trigger DDL. It specifies the concrete candidate and its exact coverage obligations, while the read-only SQL enables inspection. sourceWriteSerialization must remain unverified until this protocol is implemented and tested, not merely because this design exists.

## Required implementation phases, without activating recommendations

1. Inventory all source relations, constraints, policies, grants, triggers and SECURITY DEFINER writers using the read-only preflight. Review actual function bodies and application/service callers, including import/admin/delete paths. Establish which actor moves and bulk operations are legitimate.
2. Freeze a lock-order design covering existing profile→goal RPCs and direct CRUD. Choose fence semantics and snapshot isolation explicitly. Specify service-role/admin behavior without relying on auth.uid() for cascades.
3. Propose migration for ownership resolution (especially parent cascades), fence storage, privileges and every writer. Include transaction-local ownership capture or enforced owner mapping only after review; no guessed columns or data backfill.
4. Define a server-owned deployment/capability manifest listing every verified writer/schema revision, not a request-controlled flag. Activation must remain OFF on missing capability, migration drift or unsupported administrative paths.
5. Independently review migration and rollback. Rolling back protection must first disable new adaptive accepts, drain in-flight transactions, and keep read-only receipts available. Do not drop an active fence while writes are possible.
6. Execute authorized multi-session tests in the existing permitted database only when identity, data isolation/restoration and permission are resolved. Local mocked schedules are not evidence of PostgreSQL lock behavior. Do not create another environment.
7. Only after all tests and professional policy gates pass, bind an acceptance adapter. This review does not authorize that step.

## Exact concurrency matrix still required

For each table/operation above, test source transaction begins before acceptance and commits while acceptance waits; source starts after acceptance owns fence; source rolls back; source times out; delete and owner/parent move. Include:

- direct REST CRUD, manual goal RPC, restart RPC, settings RPC, service import, subscription webhook;
- insert phantom, non-key update, NULL→value, scheduled→logged, date entering/leaving window;
- DELETE meal cascade; DELETE tracker cascade; DELETE foods cascade affecting multiple owners; auth/public-user deletion separately authorized (never part of ordinary QA);
- mismatched tracker-entry owner/parent and owner moves (no reading another account's data to construct fixtures);
- opposite-order two-owner bulk transactions, lock timeout/deadlock with full rollback and no automatic duplicate request;
- READ COMMITTED wait followed by fresh snapshot, REPEATABLE READ rejection or proved conflict handling;
- entitlement expiry and local midnight during wait, policy revocation, profile/goal CAS conflict;
- failure after deactivating goal but before receipt, replay after policy OFF, receipts after manual replacement;
- competing proposal IDs and UUIDs, exactly one goal transition, no source writes as an acceptance side effect.

**None of these multi-session tests was performed in this review.** Parent can continue pure candidate gates, but sourceWriteSerialization remains unverified and live acceptance unavailable.

## Subsequent local implementation checkpoint (not installed)

`sourceBarrierCandidate.sql` now supplies reviewable DDL, superseding the earlier statement that no trigger candidate is included. It remains uninstalled and does not establish the production capability. Static tests check textual contracts only, not SQL execution or concurrency.

The revised candidate avoids retained UUID tombstones through a revision FK to public.users with delete/update cascade. Enrollment occurs exactly once in the migration (UUID plus zero revision, no nutrition values) and when a new users row is inserted. Ordinary source bumps only UPDATE revision, never INSERT or change owner_id, avoiding the lazy-FK U-lock edge after R. Missing R for an existing profile raises a closed error; missing profile is skipped because acceptance requires locking that profile and deletion cascades remove R. This does not edit delete-account. Enrollment and the complete migration require review/authorization; no backfill was run.

Full inspected function bodies: manual accepted-goal and restart acquire U and G before domain writes; log_food writes meal then items without later U/G mutations; observation settings writes settings only then reads context. coach_confirm_action_v1 goal replacement acquires G then inserts another goal, whose FK may acquire U: this inherited ordering must be included in actual concurrency QA against U→G→R. No Coach or legacy RPC was modified. nullify_zero_byte_checkin_photos performs a multi-owner check-in update and remains part of bulk-order testing. Function-name/source-text scanning is not a proof that dynamic SQL, other schemas or service code are absent.

Candidate still has no public wrapper, no grant to app/service roles, no proposal enrollment API, no policy/eligibility registry and no acceptance implementation. Every installation gate and multi-session requirement above remains applicable except that tombstone retention is addressed by the untested FK design rather than left as the intended storage behavior.

### Deferred-fence refinement

The candidate now uses nine AFTER **CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED** source bumps, plus a separate immediate users-INSERT enrollment trigger. This addresses a concrete statement-level cycle: log_food could otherwise own R after creating its meal, then wait on catalogue-food FK F while DELETE foods owns F and its cascading item trigger waits for R. Moving bumps to transaction end lets ordinary legacy domain writes finish before requesting R.

The private acceptance helper acquires U then exact G, executes schema-qualified SET CONSTRAINTS for both source-trigger schemas IMMEDIATE to drain its earlier events, then locks/compares R. Subsequent own goal/profile bumps are reentrant. The future acceptance transaction must not write unrelated source rows after that drain. Its source snapshot must still be a separate fresh READ COMMITTED statement after the locks.

This refinement is not a general deadlock guarantee. Explicit SET CONSTRAINTS by legacy callers can force early bumps; other deferred triggers can perform new domain writes; multiple owners can be acquired in different event order across transactions. Sorting the owners of a single event does not globally sort all events. Parent OLD/NEW bumps cover changed/deleted parents when child resolution at commit sees only final state, but actual cascade/move interleavings remain untested. These conditions must be audited and included in multisesession QA before installation, not dismissed as static-test coverage.

### Permission prerequisite completed, barrier still uninstalled

On 2026-11-13, an explicit per-action confirmation covered only TRUNCATE removal from three roles on eight public source tables. Migration `20261113121512` applied that narrow action. All 24 combinations now deny TRUNCATE; ordinary CRUD, RLS, owners and every other ACL entry were verified unchanged against a fresh full catalog snapshot. See `sourceBarrierPrivileges.md`. This removes that API-role bypass prerequisite, not the owner/admin maintenance exception or the source-interleaving QA gates. No writer-barrier objects, enrollment backfill or acceptance endpoint were installed.

### Transaction-wide owner queue refinement (current local candidate)

The current candidate supersedes the per-source deferred callbacks above: nine immediate source AFTER triggers now only enqueue `(pg_current_xact_id() xid8, owner UUID)` into a private workset with no FK. The workset PK is transaction+owner, so another transaction has a different key. A single deferred constraint-trigger type on workset INSERT gathers **all** owners of that transaction in UUID order, calls the sorted revision bumper once per owner, then deletes the complete workset in that same transaction. Other already-queued callbacks find no rows. Rollback reverts the workset and revision bumps together. No health values or normal committed queue residue are intended; actual commit/rollback tests remain required.

This closes the event-order R1/R2 problem for ordinary transactions whose source mutations finish before deferred processing: row/statement order no longer determines revision lock order. Immediate parent callbacks preserve OLD/NEW ownership before later cascade/move steps. Enrollment remains a separate immediate users-INSERT trigger; it does not take an existing owner's revision lock.

The private acceptance helper locks U→exact G, rejects any pending workset owner other than its authenticated actor, drains only the private flush constraint IMMEDIATE, then locks/compares R. Its future adapter may perform only its authorized single-owner goal/profile changes thereafter; these revision bumps are reentrant. No acceptance adapter or production capability was added.

Remaining limitations are explicit: callers forcing SET CONSTRAINTS IMMEDIATE early can split a transaction into several ordered subsets and reintroduce cross-subset order; future deferred domain writers can add source rows after the first flush; privileged trigger suppression or direct workset mutation is outside the supported protocol. Existing role permissions are revoked on this private schema/table/functions, but privileged administration still requires review. Do not claim these callers are safe or that static checks prove native PostgreSQL behavior. The existing schema guard for TRUNCATE privileges is preserved. No database installation or source-data action was performed for this refinement.

### Deferred deletion and enrollment refinement (supersedes revision FK design)

Independent review identified that ON DELETE CASCADE on the revision FK can acquire R while a profile deletion still has source cascades to complete. The current candidate therefore removes that FK. This does **not** retain normal committed tombstones: the same sorted final flush deletes R when the profile is absent, after source operations/cascades. Neither source callbacks nor account deletion code directly lock R. No delete-account function was edited.

Enrollment also cannot upsert R immediately, because delete+reinsert of an existing UUID would regain the early-R problem. An immediate users INSERT or actual UPDATE OF id now only queues `reset_epoch=true` under the transaction+owner key. At final sorted flush, a present profile with that explicit enrollment event receives a fresh epoch and revision 1, using UPSERT to invalidate an old epoch even for delete+reinsert within one transaction. An absent profile is cleaned up regardless of reset marker. Ordinary source events default reset_epoch=false and can only increment an existing revision, otherwise fail closed. Migration enrollment remains explicit UUID/revision-zero backfill; it was not executed.

Both old/new IDs remain queued by the normal users source trigger for identity moves. An unchanged UPDATE OF id returns without requesting an epoch reset. The flush removes the queue and handles revision deletion/reset in the same transaction. Forced early constraint execution and privileged trigger bypass remain unsupported limitations, not guarantees. Real PostgreSQL tests still must cover delete, insert-delete, delete-reinsert, ID move, rollback and concurrency; static checks establish only that the candidate contains these intended branches. The earlier FK-based statements in this chronological review are superseded by this section and current SQL.

### Existence-independent fence and isolation restriction (latest candidate)

A row lock is insufficient while both profile and revision are absent. Every writer flush now obtains the same transaction-level advisory namespace `1413760325` before touching revisions. It collects all distinct actual `hashtext(owner UUID text)` keys in sorted order before the UUID-ordered revision loop. The empty-workset acceptance path uses that same fence after U/G and draining its own workset. Collisions only serialize unrelated owners; they neither combine revision identity nor authorize data access. The namespace had zero matching installed function sources and zero locks before the rehearsals. Advisory locks do consume shared lock capacity, so bulk-owner performance/capacity remains unvalidated.

Independent review found that the helper's READ COMMITTED guard alone was insufficient: a direct REPEATABLE READ writer could retain an absent-profile snapshot after a concurrent enrollment and omit its revision bump. The actual bumper now rejects every isolation level other than READ COMMITTED before taking keys. A real private deferred-flush RR probe confirmed this rejection with rollback. This is an intentional compatibility boundary: any existing RR/serializable source writer would fail instead of silently bypassing the barrier, and must be inventoried before installation.

Latest order is U→exact G→owner advisory fence→R for acceptance; ordinary source writers finish domain operations, then acquire all sorted owner keys and R during flush. This is not a claim that all legacy lock cycles are removed. Forced early flushes, multi-batch owner expansion, later deferred domain writers, privileged trigger suppression, maintenance writes and future acceptance side effects remain explicit review gates. Actual source/profile lifecycle and cascade interleavings were not exercised by the private-row rehearsals. The obsolete FK/per-source-trigger designs above are retained as chronological rationale, not current instructions.

The real SQL rehearsals and blocked concurrent attempt are recorded in `sourceBarrierRollbackQA.md`. No source barrier was installed, no owner backfill ran, no account row was written and no recommendation was activated.
