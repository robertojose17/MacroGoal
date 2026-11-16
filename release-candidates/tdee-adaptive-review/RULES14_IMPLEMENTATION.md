# Fourteen-day adaptive recommendations

This implementation uses deterministic product rules, not a statistical confidence interval or individually signed clinical review. Energy expenditure is an approximation from confirmed logged intake and observed weight trend. Recommendation creation and acceptance remain separately gated OFF in this source revision.

## Calculation

- Use the preceding 14 local calendar days, at least 8 weight days and 10 explicitly confirmed complete intake days.
- Normalize explicitly tagged pounds to kilograms once. Check-in weights are already kilograms; tracker values retain their declared units. Presentation follows the user's preferred unit without migrating stored history.
- Compare observed and selected weekly weight-change rate. Product tolerance defaults are 0.25 lb/week or 20% of selected rate. These constants are implementation choices, not quotations from the owner or claims of clinical validation.
- Approximate expenditure = confirmed mean intake − observed kg/week × 7700 / 7. Desired intake = approximate expenditure + selected kg/week × 7700 / 7. The adjustment is relative to the current calorie target, not silently relative to reported intake.
- Descriptive pair-slope sensitivity must support a consistent direction. Conflicting rate/intake evidence holds the target. The envelope is not a confidence interval.
- Configurable defaults: at most 200 kcal or 10% of the current target per accepted step, 25-kcal increments, at most 400 kcal cumulative departure from the accepted baseline, and at least 14 days between accepted changes. A reduction is additionally bounded by remaining total-deficit allowance, default minimum of 500 kcal and 20% of estimated expenditure.
- The current general-adult policy configuration includes calorie bounds of 1500–5000. These are conservative product guardrails, not universal safe-intake guarantees. Policy registration is explicit and independently revocable; no operational policy is seeded by the installation.

## Eligibility and macros

New, explicit screening is required. Old `general-adult-v1` responses do not imply consent to the new risk questions. Restricted, unsure, stale, revoked, under-19 and unsupported reference-weight cases hold recommendations. The general path does not invent a reference weight for obesity or permit underweight adjustments.

Protein uses an appropriate known non-obese reference weight and configured policy ranges. The allocator preserves appropriate protein, protects fat bounds, respects the carbohydrate reference, preserves fiber, and checks calorie/macro arithmetic. Manual percentage preservation and Smart allocation require the correct explicit preference evidence. Fat percentage alone does not prove essential fatty-acid adequacy.

## Acceptance and automation

Recommendations are never automatic goal changes. Acceptance rechecks the exact owner, source, profile, journey, screening, policy, baseline and current goal, with 30-second source/provider freshness unchanged. Calories and macros, request receipt and accepted-history chain commit atomically. Unknown outcomes require reconciliation of the same request; they are not blindly retried with a new identifier.

The UI refreshes an expired offer legitimately. A changed visible target, allocation, policy or goal requires another explicit confirmation. Browser journals serialize across tabs; native journals use the existing secure storage. Verified accepted goals trigger the established shared goal refresh.

Daily-worker routing supports this rules engine while preserving the legacy route. The worker, selectors, scheduler and public wrappers remain OFF; an OFF worker is not evidence of a running daily schedule.

## Verification boundaries

Actual PostgreSQL compilation and 24 deterministic decision fixtures passed. Eight positive/tampered historical-chain fixtures and screening revocation/replay also passed in a transaction that was rolled back. The final tested aggregate SHA-256 was `861088da8bcd85b56b002c212db565521f747cf44814934cbca39a8c7a32a906`.

The producer/runtime suite passed 119 tests. The actual Expo web project exports with official project dependencies and original assets. Unit, UI and SQL tests are separate proof levels; none alone proves an authenticated positive production acceptance. Own-account fixture tests must restore all touched data and must not be represented as genuine consent, operational nutritional review, or empirical validation.

No TestFlight build or release is included.
