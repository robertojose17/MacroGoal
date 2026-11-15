# Two-session Phase A QA: proposed, not run

## Authorization boundary
Phase A closed RPCs stay closed. No DDL, GRANT, API opening or production
projection changes. Both connections are postgres with synthetic own-account
claims, not verified JWTs or authenticated/PostgREST access. Real authenticated
positive testing remains a separate Phase B decision and signed-in UI test.

## Persistence required, approval before execution
Two database connections cannot see one another's uncommitted fixture. Therefore
this test needs ONE temporary committed synthetic meal_item in an existing own
meal, plus at most ONE committed evidence event. This is not rollback-only QA.
No existing row is edited. No parent meal is inserted (avoid funnel trigger).
The synthetic consumed zero-calorie item is temporarily visible to the app and
can affect counts/completeness despite zero nutrients. Do not proceed until the
owner/coordinator accepts that exact temporary effect and cleanup scope.

Before setup capture the independent own-account counts/digests and generate the
three UUIDs in a separate read-only SQL call, preserving that recovery seed before
any INSERT (see setup SQL). Capture in a
private execution manifest: ownerId, chosen existing own mealId, generated itemId,
generated requestIds A/B, returned revision, exact item JSON after insert, and
reader expected binding. Do not publish the manifest or identifiers. No existing
nutrition values need copying or logging. Recheck current trigger catalog first:
unexpected triggers or changed RPC definition/ACL stop the test.

Setup uses the catalog-verified insert from owner-only QA: nullable food IDs NULL,
calories/protein/carbs/fats/fiber all 0, grams/quantity 1, synthetic name/portion,
is_scheduled=false, fresh item UUID. Lock existing own parent FOR SHARE and use
250ms lock_timeout, 2s statement_timeout, 3s transaction_timeout. Read exact
expected binding and revision and COMMIT. Capture the manifest only after
independent readback confirms commit; a returned pre-COMMIT row is not sufficient.
No setup SQL execution is authorized by this document.

## Two sessions
Run loggedNutritionConcurrencySession.sql twice on independent connections,
using identical manifest and DIFFERENT captured request UUIDs A/B. Both requests
explicitly carry expectedEvidenceVersion=0 and the original revision/values.
The harness does not prelock any row: both invoke the real RPC directly after a
read-only fixture check. Only the successful writer holds its RPC-acquired locks
for a bounded 100ms sleep before COMMIT. No advisory/global locks.
Each executor must supply the two GUCs within that call's transaction; session
settings from a previous connector call must never be assumed to persist.

Use Promise.all only to initiate the two independently transactional tool calls.
It does NOT prove concurrent database execution. Capture distinct backend PIDs
and timestamps from results without statement text. Actual overlap is established
only if the losing beforeCall timestamp is before the winner's afterHold timestamp
and its afterCall is later. This supports overlapping calls, not a direct wait-event
observation. Otherwise report SERIALIZED CAS ONLY, not a
contention test. Lock timeout is an inconclusive bounded result, not CAS PASS.
Connector wall time is not the server's transaction timeout. Do not increase
timeouts or repeat automatically to manufacture overlap.

Independent post-commit read must find exactly one fixture event/version 1;
winning request receipt present; losing request receipt absent. Expected results
are one registered and one evidence_version_changed. Two backend responses or
pre-COMMIT success outputs alone do not prove this. Error/unknown outcome means
inspect both captured request IDs before cleanup or any subsequent action.

## Exact cleanup and recovery
The private manifest is the recovery record. Cleanup must lock own parent then
fixture item, verify exact captured item JSON (nutrition revision included), and
verify every evidence event belongs to this owner/item, version 1, and one of the
two captured requests. Unknown events or edited fixture: abort and ask coordinator,
never delete unexpected data. Delete only that exact synthetic item with own-meal
join and verified UUID; its evidence FK cascade removes only that fixture event.
No schema CASCADE, no blanket date/name delete, no deletion of parent meal.
If the item no longer joins its original meal but its UUID still exists, abort
with fixture_moved_cleanup_aborted; never report that moved item already absent.
COMMIT cleanup, then independently verify item absence by UUID alone (without
the old meal filter), evidence absence by item UUID, and
compare baseline own digests. Legitimate concurrent user edits may change the
digest; never overwrite or delete them to force equality. Cleanup is idempotent
only after independent absence is established. Network timeout requires readback,
not a blind repeat. Do not leave the fixture if a worker terminates: parent owns
recovery using the manifest.

## Remaining checks before execution
Auditor review of this plan and all three SQL files (Setup, Session, Cleanup);
the coordinator has confirmed authorization for temporary own-account fixtures.
No SQL executed, no concurrency/ACL-positive PASS claimed. This test does not
cover two different actors, cross-item request collisions, auth login, or UI.
