# Food search v2 — source-only candidate

Base repository: 5c3c2ac0d6ffd3d8f523307737a0147f7f5703eb.
Production baseline: search-foods v32, retrieved 2026-11-01 20:28 UTC; function ed6932b4-31ab-4280-bd39-6d7c7d3403d1; bundle SHA256 efd1b13ab13912c674f50b4e62473aa17d00a9a458d56df16139a05cb65538dd; verify_jwt=false. The repository backend differs from production. Implementation must preserve the live DB macro mapping (calories/protein/carbs/fat, macros_per and serving size).

## Proposed execution order

1. Indexed database token matching and relevance ranking BEFORE LIMIT. Use the existing food_items_fts_idx expression, not the incompletely populated stored search_vector. Blank product_name falls through to name. Basic generic raw/cooked foods rank ahead for unspecified intent; all explicit brand/preparation query tokens remain required.
2. Return immediately when database results satisfy the requested intent. Otherwise supplement from USDA within a bounded overall deadline.
3. OpenFoodFacts is a last resort only when neither database nor USDA supplies relevant usable results. It never displaces a relevant result from those sources.

A new service-only, SECURITY INVOKER read-only RPC is proposed to express indexed ranking before LIMIT. Its SQL and grants require independent review and scoped approval before application. No catalog data, stored vectors, indexes, policies or existing RPCs will be modified. No deployment is authorized by this document.

Keep product IDs, barcode/FDC identities, nutritional values, serving details, selection/history and Premium gates intact. Deduplication affects displayed search results only and must not collapse different preparation or nutrition. Small explicit Spanish search aliases do not rename foods. No user personalization or analytics changes.

Client: preserve debounce/minimum query length; version the global non-personalized cache, bound the complete request including response decoding, and distinguish failure from an honest empty search. No authentication lookup should delay a non-personalized catalog query.

## Validation plan and current evidence

Fixtures: chicken breast, raw/cooked/fried, Tyson, apple versus pineapple, banana, manzana and pechuga; provider ordering/deadlines; identity/nutrient/serving response contracts. Execute isolated fixtures and Deno/TypeScript checks in the existing repository's free GitHub Actions pattern, with no secrets, deployment or Expo build.

Production read-only audit: expression-index chicken/breast query selected 190 candidates and ranked before LIMIT in 8.167 ms execution / 12.209 ms planning on one observation. This is not p95 or end-to-end latency. AND-token trigram alternative measured 251.627 ms. Candidate-specific measurements and results remain pending.

## Browser acceptance / release hold

No existing canonical hosted web URL has yet been verified. A source route or Expo build-details page is not an interactive app preview. Do not create a second app/environment or promise a test link until the existing project's hosting is verified. Signed-in app mounting can trigger existing maintenance/analytics writes, so read-only host discovery must not mount another user's account.

All merges, database application, Edge deployment, native builds and store submissions remain paused pending review. Native visual/performance acceptance is not established by source tests.
