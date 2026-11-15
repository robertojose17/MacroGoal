# Configured split allocation candidate

Status: isolated, inert source. No runtime imports, SQL changes, deployment, policy activation, or acceptance. The 10 tests in `tests/configured-split-allocator.test.mjs` are prepared and NOT EXECUTED because the runner blocker remains. Synthetic fixtures are arithmetic examples, not clinical policy.

## Verified current source

`utils/calculations.ts:calculateMacrosWithPreset` defines balanced 30/40/30, high_protein 40/35/25, and low_carb 35/25/40 percent of calorie energy for protein/carbohydrate/fat. This candidate versions those mappings as `configured-split-v1`; it does not import the existing calculator or its logging.

`goals.macro_preset` persists the preset. `app/custom-macros.tsx` accepts a percentage total within 0.5 of 100, but saves rounded grams and preset custom, not the exact entered percentages. Its displayed percentages are reconstructed from grams. The inspected users/goals schema has no explicit percentage fields. Therefore existing custom goals cannot supply this candidate's explicit record without an additional persistence contract. Do not infer custom percentages from rounded grams or normalize a 99.5 percent total silently.

The lean_body preset uses body weight to determine protein and fat, and residual calories for carbohydrates. It is not a fixed percentage strategy and is blocked here.

## Pure contract

`allocateConfiguredSplit` requires a nonempty goal ID, revision and preset; integer calories from 1 through 10000; and nonnegative safe-integer current protein/fiber grams up to 10000. All five target values have a technical 10000 ceiling matching the existing validator; this is not a clinical ceiling. The output uses fatsG (plural), matching SnapshotTarget. For custom, the explicit versioned record must match that exact goal binding and contain nonnegative integer basis points summing to 10000. Named presets reject overrides. Binding equality is not authentication or evidence of review: future server integration must load authoritative configuration itself, not trust client strings or boolean provenance flags.

The allocator considers eight floor/ceiling combinations around the ideal macro grams. It minimizes absolute energy discrepancy, then summed gram deviations, with deterministic mask-order ties. Each macro remains within 1 gram of its ideal; total energy discrepancy must be at most 10 kcal. This is rounding-compatible preservation, not algebraically exact percentage equality.

The selected protein must equal current protein exactly or the result is `protein_guard_conflict`. Fiber remains exactly current fiber, unlike the existing preset calculator's 14 g/1000 kcal recalculation. The allocator does not seek a less-optimal alternative merely to evade the protein guard. This conservative rule can block even when an alternative rounded combination preserves protein.

## Integration gaps and authority

Most meaningful calorie changes at a positive protein percentage also change protein, so they remain blocked pending an explicit guard contract. This candidate does not complete configured split support and does not weaken the existing engine's protein/fiber guard. Custom persistence and lean_body strategy are unresolved.

Every candidate is `actionable:false` and requires explicit acceptance. The caller must validate proposed calories through the full engine before any future allocation: individual deficit review, existing reduction suspension, floors, ceilings, signed cumulative caps, maximum 200 kcal step and 14-day cadence remain unchanged. This module neither validates nor authorizes a calorie delta, schedules a review, writes a goal, or authenticates a user. No default policy or clinical thresholds are introduced.
