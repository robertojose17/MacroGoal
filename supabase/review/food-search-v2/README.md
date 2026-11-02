# Food search — general intent refactor review

## Provenance and deployment boundary

The preserved v32 source remains in preservedlive-v32.index.ts.txt. Current production is search-foods v37 from 1f5a6d0ef9073165b780b83b2de53ceea912f591. This general refactor is draft PR9 only: neither the replacement RPC nor matching Edge core has been applied. The existing web preview still exercises production v37, not this candidate.

## Implemented methodology

- Preserve original-language query plus bounded EN/ES aliases and the existing chiken correction. This is a finite dictionary, not universal translation; platano remains ambiguous.
- Retrieve with the existing name+brand expression GIN and retain alternate display/generic/brand fields. Do not use the incomplete stored search_vector.
- Classify matching identity, explicit preparation/presentation, brand and unrequested variants before SQL LIMIT; apply the same descriptor vocabulary in final provider ranking. No food-name-specific conditional branches remain in the ranking policy.
- An arbitrary second comma segment is not food identity. Only explicit taxonomy heads can delegate identity to the next segment. Unknown/composite cases remain conservative and may trigger USDA.
- DB first; when no suitable basic or explicit intent match exists, supplement from USDA even if branded DB matches exist. OFF remains last resort only when both provide no usable matches.
- Keep DB1800/USDA1400/OFF600ms deadlines, existing client5s boundary, failure/empty/cache contracts, IDs, macros, servings, history and Premium gates unchanged. No new personalization, analytics, generated query inference or catalog writes.

The shared descriptor list models preparation, derived products and presentation across identities; it is not proof of completeness. Brandless is not synonymous with verified/basic. No dietitian-verification claim is made.

## SQL security and performance

catalog-search.CANDIDATE.sql replaces only search_food_catalog_v2(text[],integer), STABLE SECURITY INVOKER, empty search_path, bounded inputs and service_role-only execution. PUBLIC/anon/authenticated remain revoked. No table, index, policy or data changes are included. Exact reviewed RPC replacement plus matching Edge deployment still require approval.

Normalization and variant classification are materialized once per candidate, full nutrition rows hydrated only after ranking/LIMIT. SELECT-only equivalent EXPLAIN on chicken breast returned30 rows and used food_items_fts_idx: execution759.299ms/planning151.172ms on one observation. Prior candidate observation1085.914ms/planning158.097ms is not a controlled benchmark. The alternate-name lane scanned9699 rows and took558.706ms in the newer observation; this is the remaining performance bottleneck. No p95 or HTTP latency claim. The current indexes do not cover that complete predicate; do not silently drop alternate-field coverage or add an index without reviewed approval.

## Validation and acceptance limits

Existing GitHub CI runs isolated source/behavior fixtures, Deno checks and comparison against known TypeScript baseline errors. Focused coverage includes explicit brand/preparation, composites, provider fallback/deadlines, bilingual/typo matching and unchanged response data. Held-out category smoke fixtures (lentils, cheddar, milk, almonds, arepa) were added after fixing the general rules; they check identity/data preservation, not exhaustive category quality. Do not tune the policy solely to those examples.

Production catalog ranking across held-out categories, end-to-end latency and actual UI acceptance of THIS refactor remain pending the reviewed RPC/backend deployment. Existing v37 visual acceptance must not be represented as acceptance of these draft changes. No native build, paid preview run, merge or deployment is authorized by this document.
