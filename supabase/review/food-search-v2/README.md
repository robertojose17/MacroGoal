# Food search — general intent follow-up

## Current production and draft boundary

Production is search-foods v38 from114bfe1690698e6085575a8c69766ec05530b059 with RPC migration20261102234533. Its real-app acceptance passed basic lentils/milk/chicken, explicit Tyson/fried/oil intent and rice card/detail consistency, but failed generic-first ordering for cheddar/almonds/arepa. Logs showed DB SEARCH_TIMEOUT1802ms and USDA_UNAVAILABLE; ten observed POSTs returned200 with315–3333ms server execution. HTTP200 was not proof of a complete provider response.

This follow-up remains draft PR9 ONLY. No further RPC/index/Edge application, paid job, web/native build or merge has occurred. Current preview remains https://macro-goal--lbuo26j3nh.expo.app at web6f6aca with backendv38.

## General correction

- Preserve original query plus finite EN/ES aliases/typo correction; no AI per query, new personalization or universal translation claim.
- Keep shared identity/taxonomy, preparation/presentation and unrequested-variant tiers. Add a generic brand preference tier BEFORE SQL LIMIT and in final JS ordering. No cheddar/almond/arepa production conditionals.
- A food word embedded in a brand is not explicit brand intent. Use the same bounded terminal-s normalization for comparison of query, brand and display-name words. Explicit brand requests remain token-matched and supported.
- Restaurant is origin/context, not a transformation of the food: it no longer receives the preparation/derived-product penalty. Unknown taxonomy stays conservative; brandless does not mean verified/basic. Missing catalog brand/category metadata remains a limitation.
- DB first; USDA if no adequate basic/explicit match even with brand hits; OFF last. DB1800/USDA1400/OFF600ms, client5s, IDs/macros/servings/history/Premium/error/cache contracts unchanged.

## USDA diagnosis

The deployed provider throws the same USDA_UNAVAILABLE for every non-success HTTP response, discarding response.status. Therefore the historical exact status is unavailable; do NOT assert429 or key exhaustion from that generic code. The draft carries a typed ProviderHttpError with an allowlisted numeric400–599 status to the existing safe log envelope. No raw body/error/URL/query/key/account is logged. A mocked real-handler429 regression verifies partial-response behavior. That fixture is NOT evidence of production429. Matching Edge deployment and one authorized genuine request are needed for the actual status; no repeated uninformative probes were made.

## Retrieval bottleneck and separate index proposal

Existing indexes cover name+brand FTS and name/product-name/brand trigrams, but not the complete alternate generic_name/brands predicate. A SELECT-only equivalent of this draft used the existing main GIN but scanned the alternate lane: execution656.129ms/planning173.944ms, alternate scan425.003ms,1760 shared-hit blocks,0 shared-read blocks. This is a single observation, not p95 or proof that the index will meet a latency target.

The draft pushes the exact alternate FTS predicate into its materialized candidate lane and hydrates full rows only after rank/LIMIT. alternate-index.CANDIDATE.sql proposes a PARTIAL GIN on that exact expression/predicate in existing food_items. No new table/database/catalog, extension, data rewrite, grants or RLS change. Explicit-config to_tsvector and btrim were verified immutable in the live catalog. The index is UNAPPLIED, so its actual plan, size, build time and benefit are unverified. Ordinary CREATE INDEX temporarily blocks writes: proposal bounds lock wait2s and statement15s, aborting on timeout. Review/approval must cover this separately; inspect outcomes before any retry.

The replacement RPC retains STABLE SECURITY INVOKER, empty search_path and existing service_role-only ACL. Do not deploy the candidate blindly without reviewing the index decision and actual performance. No new privilege is needed by ordinary app users.

## Focused checks and limits

Read-only candidate SELECTs put Cheese, cheddar first; Nuts, almonds first after common plural-brand comparison; Restaurant, Latino, arepa first; explicit Tyson chicken retained Tyson. No catalog/customer records were written. JS regressions cover those shared rules, a different regional flatbread fixture, identity/data preservation and sanitized real-handler HTTP errors. Existing GitHub CI also runs provider deadlines, screen cancellation/cache/error contracts, Deno and baseline TypeScript comparison.

CI source tests and SELECT-only ranking are not end-to-end UI acceptance. After scoped approval: apply reviewed index/RPC as selected, verify owner/ACL/index validity/exact bytes and EXPLAIN, deploy matching Edge files, then check real HTTP status/latency and authenticated UI without diary writes. Do not claim ready across all foods from a small held-out sample. Previous rollback references: v37 at1f5a6d0; current v38 at114bfe.
