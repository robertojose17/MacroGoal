# Dynamic TDEE: current capability and release gates

This is a review of the exact recovered production Progress v14 source, not approval of a clinical policy. No recommendation flag or user setting was enabled.

## Dynamic calculation exists

The engine estimates expenditure from mean logged intake minus a robust median pairwise weight slope multiplied by 7,700 kcal/kg. Slopes use observations at least seven days apart. It rounds to 50 kcal and always marks confidence low and logging completeness unverified. Its sensitivity range is not a statistical confidence interval. It does not use accepted goals to fabricate expenditure or impute missing intake.

A fresh audit of real modules with simulated sources exercised 34 scenarios plus 23 handler assertions. Example at 2,400 kcal/day intake: stable weight produces 2,400; loss of 0.35 kg/week produces 2,800; equivalent gain produces 2,000. These are implementation checks, not validation on the user's account or clinical calibration.

## Existing guards, not clinical recommendations

- Adult DOB from the 18th through 100th birthday; known timezone and dated sources.
- At least 21 days between first/last weight, at least 10 weight days, at least two measurements per seven-day block and no gap over seven days. Last weight at most three days old.
- Every intake day in the interval must be present; no missing-day filling. The 800–6,000 kcal/day, meal-type and median-relative checks are logging-quality heuristics, not safe calorie targets.
- Known kg/lb/lbs only; conflicting sources and unknown values reject. Legacy zeros lack provenance, so they pause the estimate rather than undercounting.
- Noise, sustained steps, inconsistent half-window slopes and rapid changes can pause calculation. These cannot identify body composition or prove absence of water change. A gradual water change may pass; a single outlier can be robustly ignored.
- Results outside the existing 1,000–5,000 expenditure range are withheld. Those are model filters, not dietary prescriptions.

One conservative P2 remains: a zero-calorie item on the last weight date, outside the energetic interval, can pause the whole estimate because provenance is checked against the broader source window. No unsafe relaxation or source rewrite was applied.

## Why the feature is not release-ready

1. The production build profile now sets `EXPO_PUBLIC_TDEE_MODE=observation-v1` in candidate source only (2026-11-13). Without the explicit flag the transport makes no observation call. This has not changed the installed client. Backend observation settings currently contain zero enabled rows. An installed candidate with explicit opt-in and real account testing is required before claiming a working Daily Burn.
2. Proposals and adaptive acceptance are structurally unavailable: `proposal=null`, `reviewDue=false`, safety disabled, and review/accept/reject actions return `409 safety_review_required`. There is no validated recommendation policy ready to switch on.
3. Product reference floors (1,200/1,500) and no-reduction rules are not proof of individualized clinical suitability. A qualified review must define eligibility, exclusions, rate/size limits, stopping/review conditions, goal-reached behavior and communication. Do not infer approval from adult age or a plausible estimate.
4. Source reads are not one coherent transaction; the context fingerprint does not lock meal/weight writers or establish diary completeness. This must be resolved or explicitly constrained before consequential adaptive changes.
5. Native artifact configuration, secure storage lifecycle, dependency alignment, installed app/account E2E, and release type errors remain open. Partial planner/diary writes and total storage-loss reconciliation also remain open.
6. The broken nightly job is paused; no replacement scheduler or automatic goal writer has been activated. Owner-scoped on-demand calculation is distinct from a safe background adjustment service.

A release of observational dynamic calculation and a release of adaptive recommendations are different outcomes. Neither should be labeled complete merely because source tests pass.
