# Settings language backend rollout

Project: esgptfiofoaeguslgvcq. Deployment verified 2026-10-12 20:02 UTC.

## Applied changes
- `preferred_language.sql` applied successfully. `public.users.preferred_language` is nullable text, no default, with CHECK allowing only en/es. Existing rows remain null; no backfill or deletes. Policies, RLS flags and grants were verified unchanged.
- `functions/ai-coach`: deployed v153, JWT verification true. Exact en/es normalization and Spanish empty-response fallback. All other live Coach logic retained.
- `functions/daily-morning-notifications`: deployed v14, JWT verification false, as before.
- `functions/streak-risk-notifications`: deployed v15, JWT verification false, as before.
- Both notification packages group already-eligible recipients by saved preference; the selected language fills both OneSignal locale fields.

## Verification
`deployment-record.json` contains live versions, bundle hashes, JWT flags, and SHA-256 for every exact package source. Each deployment response agrees with subsequent function-list metadata. All five source files were retrieved after deployment and compared byte-for-byte with the submitted reviewed packages; all match. The additive column/check and unchanged policies/RLS/grants were verified through read-only schema queries. No live push or AI invocation was used. Mocked behavior/race tests passed before deployment; authenticated device end-to-end notification delivery was not tested.

Deployment and body retrieval initially returned intermittent internal errors during a reported Supabase Functions incident. After unchanged-state checks and recovery, all deployments and source readbacks completed. No alternate deployment route, new sender, or schedule change was used.

## Compatibility and source layout
This separate deployment mirror preserves verified LIVE behavior. The main `supabase/functions/ai-coach/index.ts` is stale (513 lines versus 759 in the pre-rollout live baseline); this package does not overwrite/reconcile that main file. Review diffs are in `diffs/`; source drift is documented separately. Local pre-rollout baseline snapshots may include one extra trailing newline from serialization; submitted and read-back deployment file hashes identify exact deployed bytes.

Null/missing/unknown preferences retain existing OneSignal device-locale behavior. Explicit en/es overrides it. Existing eligibility, timing, auth flags, data handling, and provider error behavior are retained. Grouping can produce up to three provider calls per prior batch; existing logical-batch counters are not delivery confirmation. Missing/broken legacy reminder functions were not repaired.

## Environment
Existing runtime environment references remain unchanged: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY, ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY. No credential values are included.
