# Reliable portions: source candidate only

This change is not in build 23.0.2 (609), the existing web bundle, or the deployed search/barcode functions. No SQL has been applied for portions.

## Data flow

- Search reads at most one bounded private-cache batch (150ms); it does not fetch USDA details for each suggestion.
- Opening a USDA selection or quick-adding it invokes the existing lookup-barcode operation usda_portions_v1. It requires a verified user JWT and accepts only an exact numeric FDC ID. Authentication and provider/cache operations are bounded.
- USDA Food Details is fetched for that exact ID. Measures retain provider, FDC, food description, retrieval time, amount and gram weight. A conflicting description/preparation cannot supply the default for another food. Multiple measures remain selectable; an ambiguous default stays 100g.
- Provider catalog capture is insert-only, keyed by the existing unique FDC. Existing catalog rows and historical diary snapshots are never overwritten. Concurrent insertion reuses the winner UUID. Capture can fail without blocking a meal operation.
- Successful barcode lookups capture exact matching provider codes and explicit, consistent gram labels. Open Food Facts labels are marked provider_reported, not USDA-verified. Existing barcode rows win conflicts.
- List, new detail and new log use the same selected grams against immutable per100 nutrients. A package containing four units can expose both the full package serving and one unit. Historical edit loading stays byte-identical to baseline.

## Proposed activation requiring specific approval

Review and apply only portion-cache.CANDIDATE.sql in the existing project esgptfiofoaeguslgvcq. It creates macrogoal_food_private.usda_portions and public.read_usda_portions_v1 / public.record_usda_portions_v1, SECURITY INVOKER with empty search_path, bounded input, service_role-only execution and schema/table access. PUBLIC, anon and authenticated receive no cache access. Existing food_items policies, rows, nutrients, user/diary tables and grants are unchanged.

After approval, verify collisions, actual owners, RLS and ACLs atomically; then deploy matching search-foods and lookup-barcode sources plus shared modules. The authenticated operation exposes only public food facts, never user/diary data. Keep prior deployed bundles as rollback. Do not deploy the dependent source before its cache RPCs are approved and installed.

## Limits and acceptance

- No new catalog, index, app, project, native build or paid web job is required for source preparation.
- Missing/ambiguous USDA measures use 100g; no universal banana, breast, cup or piece weight is invented. New volume choices require an exact provider gram relationship; historical edit units are preserved.
- Open Food Facts metadata remains community/provider reported. Liquid per100ml versus per100g ambiguity is an existing limitation; this change does not assert a universal liquid density or dietitian verification.
- Suggestions are not all persisted on every keystroke. Capture occurs on use, with cache reuse on subsequent searches; provider limits and offline failures leave a valid 100g fallback.
- GitHub isolated tests use in-memory doubles, not production fake users/events. They are not native visual/device acceptance. Verify actual list/detail/log and barcode behavior in the next owner-approved app release after activation.
- Build 609 remains the earlier search build without these portion changes. No new build is authorized by this source work.
