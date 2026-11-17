# Source-only generic finite-subscription TDEE authority

Base: main 02d0b280487b325c063312bea246bd008a57449e (narrow managed-expiry patch included). Other touched files freshly read from main immediately before that update. No database writes, publish, deploy, flags, cron, or account mutations.

Implemented:
- Generic private proof reader: existing 30-second `decision`, dirty-state rejection, PRODUCTION for every authenticated owner, SANDBOX only with protected registry permission. Minimum genuine validity across active authorized scopes. No subscription-table fallback, invented TTL or lifetime inference.
- Narrow own-access wrapper rejects other actors and returns only permission/validity; existing own snapshot remains SECURITY INVOKER/RLS, generic scheduler snapshot remains private. Both derive premium and expiry from one materialized read.
- Own context uses same access decision, removes old hardcoded-owner and invented deny-expiry branches.
- TDEE observation, issuance context and legacy accept ports explicitly refresh all authenticated owners then reread SQL. Marker presence no longer decides whether to refresh.
- Rules14 actual UI acceptance/retry checks prior receipt before provider refresh, then calls unchanged acceptance RPC; final SQL acceptance rereads generic authority unconditionally.

`MIGRATION_SOURCE_ONLY.sql` changes only helper/context/own snapshot/scheduler snapshot/final acceptance function bodies. Source-only; NOT executed or compiled against PostgreSQL. Existing wrapper flags remain OFF. Existing function ACLs preserved by CREATE OR REPLACE; new private helper denied to app roles, new own-only wrapper grants authenticated EXECUTE only.

Tests: 36 node tests pass (24 new plus 12 updated canonical tests) (actual JS helper + extracted actual UI acceptance body and static SQL guard checks). These are NOT PostgreSQL execution or positive production E2E tests. TypeScript syntax transpilation checked separately; independent reviewer reports full backend Deno graph typecheck passes. PostgreSQL rollback compile initially failed missing statement terminators; source/build fixed and termination regression added. Parent reports independent review PASS, including actual rollback compilation and backend full-graph Deno typecheck. No deployment claimed.

Remaining rollout requirements:
1. Review and run actual PostgreSQL rollback compile/behavior tests, including own-wrapper grants/RLS, finite PRODUCTION, registered SANDBOX, dirty/expired/revoked/no-proof, and both active environments. Recheck live definitions/ACLs before any migration.
2. Regenerate deployment bundle/build manifests; historical install fences are not an upgrade migration. Install generic helper before dependent context source.
3. Public observation/acceptance web + backend must ship together; no flags activated here.
4. Scheduled worker already contains `refreshServerSelectedProviderForReview` in internalProviderRefresh.ts and revalidator. Its runtime is OFF. Need integrate/check enabled service-refresh flow, selector enrollment and final source proof in full scheduled end-to-end test before activation. Never substitute caller JWT or synthesize proof.
5. Lifetime/non-recurring purchase and active unbounded/grace expiry remain unsupported by existing RevenueCat v2 adapter. It returns unknown and this patch fails closed. Supporting those requires explicit verified provider semantics, not creating a future timestamp locally.
6. Public finite_access helper is not added; wrapper remains in existing private schema. Verify authenticated schema usage exists as for neighboring helpers.

Upgrade migration: supabase/migrations/20261117020000_tdee_finite_provider_access.sql. Four installed function-definition MD5 fences and absence checks for both new helpers were captured read-only at 2026-11-17 02:00 UTC. Reviewed bodies and ACLs are identical to the reviewed migration; only preflight/comment additions. No execution.
