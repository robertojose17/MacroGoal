# Separate QA plan: PREPARED, NOT RUN

Do not concatenate long QA or fixture work into the installation transaction.
No backend runner, SQL execution or real-user calculation has been performed.

## Before installation

1. Verify current PostgreSQL 17 support for local transaction_timeout, exact
   baseline snapshot source/hash, owner, volatility, search path and ACL.
2. Confirm absence of the UUID column, new schema/functions and any conflicting
   meal_items trigger; verify watched column names and real log_food shape.
3. Record existing own-account diary and relevant log_food/function metadata
   digests; do not collect data from other users for a baseline.
4. Have the exact quarantine artifacts reviewed and identify real consumer-off
   and drain controls. A session acknowledgement is not a control.

## After installation, before granting public access

Perform bounded metadata reads, not writes:

- New column nullable UUID with no default. No legacy-row backfill.
- Exact trigger function/body/attribute list, expected enabled state.
- Exact getter/writer/helpers, getter and actor STABLE, writer VOLATILE.
- Private RLS and zero client schema/table privileges.
- Authenticated/anon/service_role RPC EXECUTE denied after the install COMMIT.
- Baseline snapshot source and ACL byte-for-byte unchanged. No evidence marker.
- log_food body/signature/ACL unchanged. No evidence events or new diary entries.

## Functional tests in a NEW transaction ending ROLLBACK

No GRANT/DDL is permitted inside this DML harness without a separately supported
and authorized route. apply_migration is not a supported dry-run. Phase A has
no positive authenticated API access to test yet.

Partial functional QA may run as the administrative owner with synthetic claims
identifying the approved own-account fixture. actor() reads auth.uid()/JWT, not
current_user; this is NOT proof of login, real JWT validation, positive
authenticated permission or PostgREST/app E2E. Separately SET LOCAL ROLE
authenticated tests only the expected negative denial while the RPC is closed.
Keep a short local timeout and no external effects. Do not
create a parent meal because AFTER INSERT on_first_meal_logged invokes funnel
logic. Use only explicitly approved own existing meal/item fixtures; when a new
item is necessary, create it directly within the authorized rollback transaction,
not by retrying or wrapping a real uncertain log_food purchase/logging request.

Required checks:

1. INSERT forces new revision even when caller provides one. Relevant UPDATE
   rotates; off_data-only metadata UPDATE preserves; legacy NULL stays unknown
   until a relevant write. Explicit revision overwrite is rerandomized.
2. Registration validates revision, all five stored values, exact portion/identity
   and consumed status. Declare zero only when the fixture's explicit declaration
   did so; no prefills/defaults become provenance. Unknown undeclared value rejects.
3. Registration's STABLE nested reader observes its own inserted event under the
   actual VOLATILE writer. Verify response and separate read, not just row count.
4. Exact retry returns the same historical receipt; different payload with same
   ID rejects; competing evidence version rejects. No partial receipt on failure.
5. Revoke, then replay old registration: latest evidence stays null; historical
   receipt remains distinguishable and cannot authorize current use.
6. Edit nutrients/portion/item meal link: old revision evidence becomes null.
   Date-only meal change does NOT claim historical invalidation of nutrient
   evidence; readiness/day completeness is separate. Do not promise ABA detection.
7. Missing/anonymous claims reject under owner invocation. A real authorized foreign-owner fixture is
   denied; a random nonexistent UUID is NOT sufficient ownership testing.
8. Metadata and negative role tests verify no direct table/schema/helper access
   and no public service-role registration privilege. Owner can always execute;
   synthetic claims are not a successful test of the role's privilege boundary.
9. End ROLLBACK, verify own-user data digests and committed ACL remain unchanged.

The older prepared evidence rollback tail assumes authenticated EXECUTE and
MUST NOT be run unchanged in closed Phase A, nor "fixed" by sneaking in a GRANT.
A separate owner-only functional tail must label its lesser assurance and remove
that positive-role assertion; it has not been implemented or executed here.
If schema constraints
prevent an invalid-value fixture, report it as untested with schema protection
evidence rather than weakening constraints or marking a pass.

## Separate concurrency and application checks

Need a specifically authorized multi-session harness to prove same-item conflict,
cross-item request-ID collision, concurrent ownership/move/delete, and lock-order
compatibility with real existing writers. A single DO block cannot prove these.
Read/write lost-response recovery must use the same evidence request ID; never
relog food. Stop on uncertain result. Check readonly snapshot/max-row costs only
after the later projection has its own review. No projection or recommendation
activation is part of these artifacts.

## Quarantine validation

With consumer genuinely disabled and calls drained, apply only the reviewed
quarantine artifact (not prepared/executed here). Verify RPC denial, disabled
trigger, unchanged baseline snapshot, and preserved table/history/user data.
Do not enable the old evidence generation again without invalidation design.
