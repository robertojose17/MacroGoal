# Phase A installation and quarantine plan

Prepared source only, not run or compiled. No GitHub publication, database
installation, backend test execution or deployment was performed for this plan.

## Artifacts and pinned baseline

- `loggedNutritionPhaseAInstall.sql`: one bounded transaction, revision plus
  evidence prerequisites only, COMMIT, **no projection** and no fixtures.
- `loggedNutritionPhaseAQuarantine.sql`: functional quarantine, not destructive
  schema restoration. COMMIT, preserving history and user data.
- `loggedNutritionPhaseAQAPlan.md`: separate acceptance checklist, not DDL work.

Derived verbatim bodies from main `095cb718`:

- nutrition revision source blob `e0de27b9390b0cefca9a0f5898da08956d99eb97`.
- evidence source blob `490b36b2163c9cacf71880353617a3c207465481`.

Snapshot baseline `md5(pg_get_functiondef(...))`:
`978feafb4d1d480f8d93b76ab0737a98`, invoker/STABLE, postgres owner,
`search_path=pg_catalog, pg_temp`, ACL postgres/authenticated execute only.
Parent reported this live at 21:10 UTC; re-read before any actual action. Source
includes fresh collision/drift checks; these are not a substitute for review.

## Install behavior

Execute as the reviewed postgres administrative identity only. It adds a nullable
UUID column without default/backfill, its row-local rotation trigger, a private
evidence table and narrow functions. No `log_food` signature/body/ACL changes.
Evidence is user declaration, not independently verified nutritional truth.

Public RPC EXECUTE for authenticated is **revoked before COMMIT**. No runtime API
is opened pending QA. The intermediate grants inherited from the source candidate
are never committed. No private schema/table privilege is granted to clients.
Existing app log writers gain only revision rotation; no consumer receives data.

DDL uses a short ACCESS EXCLUSIVE lock on meal_items and can also acquire locks
for foreign-key definitions. It is not zero-risk or globally lock-free. It has
lock_timeout 250 milliseconds, statement_timeout 2 seconds and PostgreSQL 17 local
transaction_timeout 3 seconds. These are proposed limits, not measured wall-clock
guarantees. The last setting bounds transaction lifetime,
not just individual statements. Any timeout/error requires stopping and checking
actual committed state before retry; lost network response is an uncertain result.
Do not retry with longer limits, partial statements, skipped guards or another
tool to bypass a rejection. No functional QA runs while DDL locks are held.

## Functional QA before opening any surface

No temporary GRANT is included in a DML QA harness. GRANT is DDL and needs a
supported, separately authorized execution route; an apply_migration invocation
is NOT a supported dry-run merely because SQL contains ROLLBACK.

While Phase A RPCs remain closed, partial functional QA may invoke the functions
as the administrative owner with explicitly synthetic claims for the approved
own-account fixture, in a separate rollback transaction. The actor helper reads
auth.uid()/JWT; it does not authenticate current_user. This exercises binding,
version/idempotency and readback logic, NOT positive authenticated permissions,
PostgREST login or app E2E. Separately SET LOCAL ROLE authenticated may verify
negative denial of the still-closed RPCs. Do not describe owner execution with
claims as a real authenticated session or a grant. Do not create a meal: its
insert trigger invokes funnel handling. Approved own existing meal fixtures must
be fully rolled back and digests verified afterward. If even this QA route is
not supported/authorized, stop and report that concrete validation blocker.

Only after actual functional QA and a separate reviewed access-opening step may
authenticated EXECUTE be restored. The snapshot projection is a later separate
candidate and remains forbidden by this Phase A plan. The production consumer,
marker, final snapshots and app behavior must not be claimed complete by Phase A.

## Quarantine

Before invoking quarantine, disable the real consumer and drain in-flight calls.
The session setting `macrogoal.evidence_consumer_gate=off_and_drained` is solely
the operator's acknowledgement of those completed steps, not an authorization,
runtime gate or technical proof. The file does not set it itself. Parent must
identify the actual gate and drain mechanism before execution; if none can be
verified, quarantine is blocked rather than pretending the setting enforces it.

Quarantine asserts the exact unchanged snapshot hash/ACL (no evidence projection),
exact function bodies and expected local objects. It revokes both public RPCs and
disables the rotation trigger under a bounded item-table lock. It does not DROP,
DELETE, TRUNCATE or CASCADE anything. Private historical events and UUIDs remain;
postgres administrative access remains. If projection exists, STOP and prepare a
separate reviewed reversal before this quarantine. No silent projection rollback.

Disabling the trigger means later edits may no longer rotate revisions. Therefore
this is a terminal quarantine for this evidence generation: **do not re-enable
the old reader/writer and trust old records**. A future rollout needs a reviewed
invalidation/version transition for quarantined evidence. Retained history does
not imply that it is valid. Row/statement locks alone do not prove calls were
drained, and a parameter flag alone cannot replace that operational prerequisite.

References: PostgreSQL 17 transaction timeout documentation:
https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-TRANSACTION-TIMEOUT
STABLE reader snapshot semantics:
https://www.postgresql.org/docs/17/xfunc-volatility.html
