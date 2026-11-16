# Diagnostic and hold path, OFF

This module composes the existing snapshot diagnostic and existing seven-day hold rules. It does not create a new nutrition policy or statistical method.

- Exact trusted owner snapshot and source freshness remain required.
- Existing 14-day eligibility, 8 weight dates and 10 explicitly confirmed complete days are retained. Existing local calendar, journey, age and binding checks are reused, not bypassed.
- Existing target-comparison tolerances are descriptive. Coverage or consistent pairwise slopes never become confidence, permission to adjust, or a claim that existing targets are safe.
- Insufficient, conflicting or unvalidated evidence results in a diagnostic hold. No proposal, calorie conversion, macro adjustment, 100-kcal rule, individual review record or accepted-goal receipt is created.
- A hold is bound to owner, goal/revision, profile revision/binding, journey binding and timezone. Daily assessment does not postpone the original seven-day deadline. A completed due assessment can propose the next seven-day hold. Changed scope fails closed instead of resetting history silently.
- Runtime is immutable OFF before clock/context/network calls. There are no write ports. The returned hold is explicitly proposed and not persisted or scheduled. Existing scheduler/database integration is unchanged.
- Spanish and English copy distinguish descriptive trends, unvalidated statistical precision, unchanged targets and an unscheduled proposed reassessment. This is a view-model only, not a mounted app screen.

## Verification
13 new tests pass, including sufficient-but-unvalidated data, within-tolerance, missing coverage, source expiry, wrong actor, scoped hold preservation, due reassessment and zero-port OFF behavior. Deno checking of the full dependency graph passes. Review caught a malformed null/undefined existing hold that could restart its deadline; it now fails closed with a regression test. These tests use synthetic contract fixtures, not operational reviews or real accepted baseline history.

## Remaining blocker
Actionable recommendations remain OFF. The rejected experimental bootstrap configuration did not establish acceptable interval coverage even under its synthetic assumptions; no further open-ended experiments were run for this increment. A statistically grounded automatic adjustment path still lacks applicable method/calibration evidence. An alternative rule-based recommendation path would require an explicit product/nutrition policy decision and distinct contract; it is not implemented by this diagnostic module. No new 100-kcal policy or substitute guarantee was adopted.

A genuine baseline still requires explicit accepted-goal provenance; a legacy acknowledgment alone is not that baseline. Applicable nutrition limits, proposal/acceptance validation and real downstream checks remain prerequisites for recommendations. No activation, live schedule, goal change, provider TTL modification, production deployment or TestFlight occurred in this increment.
