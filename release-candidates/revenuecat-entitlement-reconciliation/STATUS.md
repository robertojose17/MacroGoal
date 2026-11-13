# Review candidate, NOT deployed

policy.mjs implements pure server-side decision planning; verifyExpiration uses injected official-provider and mirror readers. test.mjs passes 15 checks. No mutation, grant, revoke, schema, or live deployment performed.

## Minimal guarded integration contract
After webhook authentication, BEFORE event insertion or any subscription/profile write:
- PROMOTIONAL events: stop without writes until an independent entitlement registry exists. Do not overwrite the subscription mirror.
- EXPIRATION: fetch authenticated official RC subscriber with server key and bounded timeout; read current mirror. Provider unavailable/malformed => no writes, retryable response.
- Different product/store/environment, newer mirror expiry, or another active RC entitlement => no writes to current mirror/profile.
- Only confirmed inactive RC plus matching nonstale mirror permits the returned downgrade plan.
- Commit that plan through ONE transaction/CAS RPC checking original mirror version and profile.updated_at under a per-user lock. Existing sequential JS writes cannot guarantee this. Race: RC can change after read; webhook ordering still requires latest reconciliation and versioning.
- Do NOT simply paste this planner around existing upsert. Current upsert copies event fields, and event-first writes could violate no-writes-on-unavailable. A transactional integration remains required.

## Owner conclusion
Roberto's existing profile says premium but RC has no active official right. Reconciliation can legitimately produce free. It cannot restore premium afterward without an independent existing grant/override. Promo grant overwrites the current single mirror and either natural expiry or revocation ends access. Restoring the previous premium flag would recreate the original inconsistency, not legitimate restoration.
Therefore reversible Premium QA with no new authority/storage and no changed real subscription mirror is NOT presently possible. Need either:
1. approved separate expiring QA entitlement registry consumed by TDEE (no purchase/commission rows), or
2. proper RC-derived per-entitlement cache independent of subscription mirror; accept the expected free state after expiry explicitly.
Current candidate intentionally blocks promotional processing rather than silently creating either architecture.

## Limits
Pure tests are not E2E, no SQL transaction implementation, not deploy-ready. General financial fallback defects remain outside this scope.

## Atomic integration candidate added
atomic-expiration.sql provides actual service-only SECURITY INVOKER RPC:
- live column types checked (users.id UUID; subscriptions.user_id text, id UUID; timestamps timestamptz);
- fixed profile->subscription row locking, version/type CAS, actor+row identity binding;
- matching product/store/environment and nonstale expiration required;
- both updates in same transaction; trigger errors rollback both;
- no inserts or paid conversion/commission paths, only active->inactive and premium->free.
integration.mjs consumes existing policy planner and constructs exact RPC contract. State read before official RC lookup; provider failure makes zero RPC writes. MUST replace expiration branch entirely before legacy ledger/upsert writes, not run alongside it.
8 model race/failure tests pass in addition to 15 policy tests. PostgreSQL function not installed/executed; therefore runtime role/RLS/trigger interaction remains unverified.
30-second snapshot freshness is an engineering rejection window, NOT guarantee RC cannot renew immediately after its response. Correct eventual state still requires authoritative reconciliation on every lifecycle event and monotonic/versioned processing.
No new access rights, promotional activation, live permissions, or real account/subscription values changed. No claim QA reversible: promotional path intentionally blocked pending independent storage/authority design.
