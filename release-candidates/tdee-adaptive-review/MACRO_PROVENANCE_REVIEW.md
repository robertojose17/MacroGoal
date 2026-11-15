# Macro averages: provenance and release review

## Verified source and live metadata

The production snapshot projection is installed; this is not deployment of the new consumer. The existing `meal_items` schema has no per-nutrient known/unknown provenance columns. `fiber` defaults to zero. More importantly, the live `public.log_food` function defaults **all five nutrition arguments** (calories, protein, carbs, fats, fiber) to zero and inserts those numeric arguments unchanged. Consequently, a stored zero alone cannot distinguish a declared zero from an omitted argument. No user diary records were read for this finding.

Independent static review of `snapshotReviewContextParser.ts` (blob `9f6804876a69cfad4d255640598aaafe9c8c0283`), observed snapshot parser and `dynamic-tdee/data.ts` found no actionable duplicate/orphan/day-count error in the current average path: the snapshot parser rejects duplicate item/meal IDs, missing parents and malformed dates before aggregation; readiness binds confirmed days to current content; missing/unknown confirmed days do not become zero or get silently dropped from the denominator.

## Current behavior, intentionally limited

- Only explicitly confirmed completed local days in the 14-day window contribute.
- Missing energy or ambiguous zero energy in any confirmed day makes the calorie average unavailable.
- A null/zero/invalid macro on any included item makes that nutrient average unavailable; other independently known nutrient averages can remain available.
- A zero-protein oil or zero-fat food can therefore suppress a legitimate nutrient average. This is a conservative data-availability limitation, not proof the actual nutrient is unknown or wrong.
- The result describes **recorded amounts on confirmed days**, not verified true intake, a confidence interval, a 14-day imputed intake or an actionable recommendation.

## Safe next contract, not implemented here

Future provenance must be persisted at logging/editing time per nutrient, retain the exact value and portion/basis used, distinguish supplied zero from absent data, and be bound into the snapshot/readiness content hash. An arbitrary `known=true` from a client is not clinical validation. Legacy rows remain unknown where provenance cannot be established; do not retroactively fill zeros using today's mutable catalog or AI guesses. Editing amounts must update/invalidate provenance atomically. A marker indicating field presence is not provenance.

This requires a reviewed writer/data contract across diary creation, edit, saved-meal logging and imports, not a one-line relaxation of the average reducer. No writer or schema changes were made in this review.

## Remaining validation

The backend runner previously rejected remains unexecuted. Prepared cases must cover declared zero versus omitted nutrient, partial/empty days, confirmation invalidation after edits, scheduled entries, duplicate/orphan rejection, timezone/journey boundaries, and preview/acceptance same-source binding. Existing UI compatibility QA after the projection passed without modifying goals, but does not validate these backend cases. Recommendations remain OFF and no TestFlight was performed.
