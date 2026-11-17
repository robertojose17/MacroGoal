# Internal observation access marker

The coherent scheduler observation omitted `context.accessValidUntil`, while rules14 admission requires a numeric, unexpired access marker. The new migration reads the existing genuine managed entitlement decision once in a MATERIALIZED CTE and carries its unchanged validity into the context only when access is allowed. It does not refresh/extend proof, change premium eligibility, relax acceptance checks, enable recommendations or add app permissions. Expired/missing managed access emits no marker and remains nonpremium.

Source fingerprints intentionally retain their existing stable inputs; provider proof refresh alone must not change nutrition-source identity. The admission guard still independently checks fresh access at acceptance.

Verification: 12 portable source regression tests pass. PostgreSQL rollback-only function replacement compiled; pure JSON current/expired/missing/nonmanaged projection assertions passed. The genuine read reached the existing `authentication_required` guard from the SQL connector; no owner session or proof was fabricated. The original live function MD5 was unchanged after rollback (`7671d98dc9b3c50d5213a7430b201698`). A genuine authenticated-owner end-to-end diagnostic remains required after deployment.

This is not a full-rollout assertion. Nonmanaged subscriptions retain their prior behavior and do not receive an invented expiry marker. A separate generic production-proof contract is still required before claiming full nonmanaged acceptance support. Historical migrations are unchanged; the new migration is fenced against unexpected live-source changes.
