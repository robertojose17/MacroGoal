# Narrow TRUNCATE permission change: applied and verified

Before the authorized change, read-only catalog verification on 2026-11-13 confirmed `TRUNCATE=true` for each of `anon`, `authenticated` and `service_role` on all eight public source tables below. This is a database grant, **not evidence that an HTTP/app route exposes TRUNCATE**. The private observation settings table has none of these grants.

TRUNCATE is not protected by row-level security and does not run row DELETE triggers. It can therefore bypass a row-based source revision protocol. Ordinary API CRUD does not require it.

## Exact authorized action

Revoke **only TRUNCATE** from **anon, authenticated, service_role** on:

- public.users
- public.goals
- public.meals
- public.meal_items
- public.check_ins
- public.trackers
- public.tracker_entries
- public.subscriptions

The exact applied SQL payload is `sourceBarrierPrivileges.sql` (its review-only header is retained byte-for-byte for provenance). It changes no SELECT/INSERT/UPDATE/DELETE grant, RLS policy, row, account setting, token, goal, cron or recommendation flag. An administrative integration using one of these three roles to truncate these tables would stop working and must instead use a separately authorized maintenance procedure. No known normal app CRUD workflow requires this grant; undiscovered maintenance consumers are not certified here.

The transaction has bounded lock/statement waits and verifies that no inherited TRUNCATE grant remains; otherwise it aborts. Installation of the writer barrier is a separate, larger action and is not authorized by approval of this permission-only step.

## Verification and rollback boundaries

Post-change verification checked all 24 role/table combinations: all now deny TRUNCATE. All 108 ordinary CRUD role/table checks, table owners, RLS flags/policy fingerprints and all other ACL entries matched the immediately preceding catalog snapshot. No table was truncated to test the denial.

The retained pre-change catalog includes complete table ACLs, grantor, grant option, ordinary CRUD privileges, owner and RLS policy fingerprints. The 24 relevant TRUNCATE entries are explicit grants from postgres, each without grant option. An explicitly authorized rollback executed as that recorded grantor would restore TRUNCATE for these same roles/tables without grant option and restore the known bypass risk. Boolean effective-privilege checks alone would not have established this ACL restoration contract. Such restoration is not automatic and must not occur while claiming an active source-barrier guarantee. Existing database owners remain privileged maintenance actors; their ability to change triggers/schema is not eliminated by this role change.

Applied migration: `20261113121512`, `tdee_source_truncate_least_privilege_v1`. SQL SHA-256: `c9e07ca5f608a3824ec4cd01449a0e03944b5c01ff64fd2e13c87b5053b3b2f9`. The writer-barrier schema remains absent; no recommendation or observation setting was activated. This completed permission-only action does not authorize another migration or rollback.
