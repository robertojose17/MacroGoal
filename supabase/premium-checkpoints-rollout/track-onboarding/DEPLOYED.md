# Deployed checkpoint receiver

Current extension: track-onboarding v23 ACTIVE on 2026-11-11, SHA-256 e84b205132b355b774c49a27b92abb0257e28e6453f9ffa4feb0401de2cd5a0d. See `../HOST-SCREEN-DEPLOYED.md`. The following v20 record is historical; do not treat its version/hash as the current deployment.

Existing project esgptfiofoaeguslgvcq; existing function track-onboarding version 20 ACTIVE. Updated 2026-11-01T00:25:50.764Z. Bundle SHA-256: 6565a4b0d92c94bad6f919e1f3351355eb031213a7fd52d6aab6089f9322f53e. Reviewed source commit: 7b58e0bb54629a36d3c7d168557e3fa3c67bddcc.

The deployed entrypoint is supabase/premium-checkpoints-rollout/track-onboarding/index.ts. Bundle files are track-onboarding/index.ts, router.ts, legacy.ts, checkpoint.ts and edge/protocol.ts, relative to this rollout directory's parent. Preserve these relative imports. The backup is not a deployed module. Gateway verify_jwt=false preserves pre-auth legacy onboarding; the private handler independently requires getUser JWT verification before any write.

Verified external private URL: https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/track-onboarding/premium-checkpoint . Postflight: unauthenticated POST 401 unauthorized; GET 405; OPTIONS 204; legacy root OPTIONS 200 ok; private suffixed path 404. All five returned deployed source files byte-matched the reviewed candidate. Function count stayed 100 and all other versions stayed unchanged. Private table had zero rows at 2026-11-01T00:26:49Z. No valid event or synthetic user/payment was sent.

Private migration premium_checkpoints_private_v1, version 20261101000807, applied 2026-11-01T00:08:07Z. Metadata verified forced RLS, no ordinary schema/table access, service-only RPC execute, empty search_path and actual postgres function owner with BYPASSRLS, both cascading account/profile foreign keys and unchanged authority guards.

## Prevent deployment drift

DO NOT deploy supabase/functions/track-onboarding/index.ts over this receiver without an explicit reconciliation review. That canonical repository file differs from the v19 production baseline: it contains unrelated first_meal behavior absent from deployed v19, while deployed v19 includes session/upsert/backfill/paywall behavior absent from that file. It was deliberately preserved unchanged, not silently discarded. This rollout directory is the actual v20 production source. Future deployments must incorporate both the isolated private router and the verified legacy behavior deliberately.

Exact rollback baseline: deployed-v19.backup.ts, byte-identical to v19 bundle 1f1036c9724f390c464e6556b059f24479a25e97c4ed46c0218b56a16733e7bd. A rollback would remove checkpoint reception and must be coordinated with app capture. Re-read current deployed source/version before any future deployment; do not blindly retry uncertain operations.

Standalone premium-checkpoint deployment was rejected by the 100-function quota and remains absent. The user separately approved the existing-function route update. No quota, plan, credentials, webhook, billing, entitlement or commission changes occurred.
