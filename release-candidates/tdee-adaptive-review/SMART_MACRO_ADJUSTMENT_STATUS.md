# Smart Macro Adjustment: source integration, release OFF

Implements candidate source for the verified November 15, 2026 user specification. Its nutritional references are starting points for review, not an approved universal clinical policy. This change does not verify anyone's professional credentials.

## Code path

smartMacroAdjustment.ts is pure and deterministic. snapshotAdjustment.ts calls it after existing energy, cadence and evidence guards instead of proportional carbohydrate/fat scaling. Missing context blocks with macro_context_required, never a legacy fallback. The actual parser/loader does NOT manufacture context; release stays OFF.

Required context: exact owner, goal ID/revision/preset, source fingerprint, policy version/digest, current five-value target, eligible adult age 19+, and a nonfuture unexpired reviewed record. The producer independently compares binding to its proposal source. Matching strings/status fields are NOT authentication or clinical validation: future server loading must verify their origin.

All protein/carbohydrate/fat gram bounds and fat energy-fraction bounds are explicit. No default 130 g carbohydrate, 20 percent fat, protein grams/kg, body-weight selection or reference weight is injected. Protein remains fixed only if inside the reviewed range. Fiber stays fixed, not a sole nutritional suitability criterion.

Integer fat candidates must satisfy both gram bounds and fraction of NEW calories. Adjacent integer carbohydrate values come from residual calories after protein/fat. Candidates must respect carbohydrate bounds and energy discrepancy <=10 kcal. Selection prioritizes smallest fat change, then energy error, then carbohydrate change, with deterministic enumeration ties. If infeasible, block instead of lowering protein or violating a bound. Boundary cases not adjacent to exact residual may be conservatively rejected. The 0..10000 domain is technical, not nutritional.

Custom requires real bound consent selecting Smart. Preserve-percent is explicitly blocked pending reviewed integration of that strategy. No consent persistence/UI is added.

## Unchanged barriers

Maximum 200 kcal step, 14-day cadence, floors/ceilings, signed cumulative caps, source freshness, receipt history and suspension of ALL reductions remain. Direct helper reduction tests check arithmetic only; the energy engine still blocks reductions without an individual total-deficit review contract. Every candidate is non-actionable and requires explicit acceptance. No writes occur.

Fat percentage compliance does not establish essential-fatty-acid adequacy. No linoleic/alpha-linolenic intake, body composition, training need or reference weight is invented. Eligibility exclusions and individual suitability must be resolved upstream; uncertainty blocks.

## Validation and remaining gaps

Helper and updated engine/producer tests are PREPARED, NOT EXECUTED due to the runner blocker. All test reviews/limits are synthetic, not production policy. Indirect parser/orchestration expectations are coordinated separately.

Before release: reviewed individualized limits and provenance; real server loading; custom consent storage/UI; reliable variable-rate evidence; macro-policy revalidation at acceptance; updated release bundle; authorized test execution and application E2E. SQL acceptance has not been extended to enforce this new context. Source-only integration is neither deployment nor full application completion.

Proposal offer expiry is also capped by the present macro review's expiry. This narrows issuance lifetime but does not replace server-side acceptance revalidation. A null stored preset is not converted into an invented string; it cannot currently satisfy the explicit binding contract.
