# Available nutrition capture and practical portions

## What is preserved

- Search saves nutrition records already received from USDA/OpenFoodFacts, including records that are not selected. This is a source-evidence library, not automatic approval of a product match.
- Authenticated selection/scan capture can fetch a full source record. Fresh detail evidence is reused for 24 hours. A search summary is never labeled a full detail response.
- Evidence retains provider/source identity, received/captured time, raw source fields, nutrient names, numeric values when valid, printed units/basis, and explicit invalid/missing status. Missing is not zero.
- Private append-only snapshots are deduplicated by content and versioned when content changes. Receipts optionally link a specific catalog item/revision. Old evidence is not overwritten by a new source response.
- Source capture does not overwrite user-confirmed corrections. Existing guarded canonical enrichment remains separate from raw evidence; storing a nutrient does not mean it is already supported by daily micronutrient analytics.

## Practical portions

- Household weights come only from an exact USDA food identity and validated portion evidence. A unique source-described medium/average portion is preferred; ambiguity falls back to grams.
- Catalog UUID resolution checks current identity/correction protection before and after retrieving portions. It does not infer identity or a weight from a food name, and does not replace the current macros.
- Official fixture examples: Bananas, raw (173944), medium 118 g; Apples, raw, without skin (171689), medium 161 g. The latter must not inherit 182 g from another apple variant.
- Edits, historical entries, account changes, navigation, newer queries, and uncertain requests must not receive stale asynchronous default resets.

## Limits

- No query-wide detail crawl. Search response capture adds no provider requests and runs as registered background work.
- At most 100 source records / 8 MiB per batch; raw record 256 KiB. Oversized records are explicitly skipped. Storage quotas and authenticated detail rate limits fail closed without blocking normal search.
- Database-only hits already present in the catalog create no new external-response snapshot. Cached client searches may reuse an earlier response. No historical full-library backfill is implied.
- Provider outages, unavailable source portions, identity/variant mismatches, and timeouts retain safe fallback behavior. They are not successful capture claims.
- Search-source evidence is not automatically confirmed catalog nutrition. Review-required OpenFoodFacts results remain review-required.
- Physical label supplemental capture is a separate change. Do not infer it is activated from the search/scan evidence implementation.

## Verification

Tests cover snapshot SQL/RLS/ACL/idempotency/quotas, real module scheduling, source identity, zero vs missing, stale/repeated callbacks, and official banana/apple portion examples. Existing application-wide baseline TypeScript/source-contract failures must be distinguished from new regressions; do not describe a globally failing workflow as green.
