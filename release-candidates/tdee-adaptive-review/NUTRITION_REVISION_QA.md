# Row-local revision candidate: review and rollout gate

Candidate `nutritionRevisionCandidate.sql` is SOURCE ONLY, not executed, not tested in PostgreSQL, and not a completed provenance feature. It preserves the existing `log_food` signature, implementation, user/service guards and grants. The prerequisite should not be installed alone merely to claim progress; install only as part of an independently reviewed evidence writer/reader release.

## Inspection

Live metadata previously checked: one 16-argument log_food, owner postgres, ACL postgres/authenticated/service_role, zero catalogued normal dependents; this does not enumerate dynamic/external callers. No user triggers currently on meal_items. pg_catalog.gen_random_uuid and the private schema exist. Candidate refuses any existing user trigger and any name collision so review cannot silently become stale.

Located write paths include log_food calls from add-food, my-foods-create, chatbot, ai-meal-planner, my-meals-details, copy-from-previous, recipe-finder-detail and coachDailyServices; direct inserts from QuickAddHome and Coach; nutrition edits from FoodDetailsLayout; off_data-only updates from coachDailyServices. Search is not a proof of an exhaustive inventory. Existing mobile binaries must remain supported.

## Semantics

A nullable revision column has no default/backfill. New inserts and any update explicitly targeting the listed nutrition/portion/identity columns rotate a server-generated UUID, including identical-value updates and attempted revision manipulation. No table reads, explicit global/advisory locks, network calls or application-level rejection in the trigger. off_data-only changes do not rotate. Another BEFORE trigger could mutate watched fields without UPDATE OF firing; installation refuses existing triggers, and future trigger changes require review.

DDL nevertheless needs a table lock and runtime errors can abort the triggering statement. A 2s lock timeout bounds acquisition waiting; it does not mean zero blocking or zero risk. RLS and legacy RPC behavior need actual tests before install.

Revision identifies a row version, not accurate nutrition or professional review. NULL never matches evidence. Future evidence must bind own meal owner, item ID, nonnull revision, exact values/portion, source statement and current revocation state. Date/journey/timezone and meal-owner changes are separately revalidated by the consumer. No historical provenance is inferred.

## Required PostgreSQL QA, NOT RUN

1. INSERT with no revision and with arbitrary revision both yield a new server UUID; old rows are not backfilled.
2. Every watched field, including SET to its existing value, rotates revision.
3. Metadata-only off_data update preserves revision; legacy NULL remains NULL in this case.
4. Explicit revision=NULL/arbitrary cannot install a chosen revision.
5. Two concurrent updates serialize normally and stale evidence cannot match the final row.
6. Transaction rollback restores original data/revision; no external side effects from other hooks.
7. Existing authenticated log_food and service-role invocation keep authorization behavior; cross-owner writes fail as before. Test with permitted own-account fixtures only.
8. Existing JSON parsers tolerate extra revision column; inspect INSERT without explicit column lists.
9. Evidence future writer/reader reject stale revision, revoked statement and other owner; zero is only usable when explicit input provenance is valid.

## Rollback plan

Before removing invalidation, disable the future evidence consumer/writer and verify it does not accept revision-bound evidence. Do NOT leave a reader active while revisions stop rotating. Capture installed function/trigger/column definitions and grants; compare exact definitions before any reversal. A narrow rollback drops only the reviewed trigger/function (RESTRICT), retains the nullable revision column and all user data, and leaves log_food untouched. Retained revisions are non-authoritative once evidence consumption is disabled. Removing the column later is a separate destructive/schema compatibility decision. No executable inverse is supplied until the complete evidence consumer contract and installation hashes are fixed; blindly dropping the trigger is unsafe.

No production changes, recommendation activation or TestFlight action performed by this design.
