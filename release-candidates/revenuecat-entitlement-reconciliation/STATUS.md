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
