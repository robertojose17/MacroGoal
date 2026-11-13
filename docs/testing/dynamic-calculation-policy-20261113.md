# Conservative TDEE policy: implementation and evidence

Status: **observational candidate, not clinical validation and not release approval**. Reviewed sources on 2026-11-12. Candidate changes completed on 2026-11-13. No recommendations, automatic adjustments, server opt-ins or replacement cron were enabled by this work.

## Effective boundary

The production build profile now explicitly selects `EXPO_PUBLIC_TDEE_MODE=observation-v1`. This is source configuration for a future authorized build, not an OTA, deployment or change to the installed app. The user's observed settings still require explicit opt-in; server authentication/premium checks remain authoritative. Other build profiles are unchanged.

The client accepts only the production observation protocol, with its exact response marker and owner scope. It rejects proposals, review periods and actionable review status. Existing server routes reject review/accept/reject with `409 safety_review_required`. A valid observation does not grant clinical eligibility or authorize target changes. Accepted targets remain separately controlled by the atomic, versioned save/restart workflows.

## Enforced display contract

For an `estimated` result, the client now verifies the actual deployed engine contract:

- Premium and observed setting enabled, confidence `low`, logging completeness `unverified`, reason `ready`.
- Latest weight date is a completed civil day, one to three days before server `today`; today/future/stale/invalid dates reject. Server `today` must also be within one civil day of the device UTC day (timezone tolerance). An invalid device clock fails closed; old internally consistent payloads are not accepted indefinitely. Transport bypasses caches.
- The exact first-to-last interval is 21–28 days. Every intervening day has intake; 10 through `interval + 1` distinct weight days. Missing, inconsistent or non-finite metadata rejects.
- Expenditure is 1,000–5,000 kcal, rounded to 50, and sensitivity bounds are finite, ordered and enclose the estimate. These are model contract filters, **not calorie intake prescriptions or proof of safety**.
- The existing Daily Burn card exposes the interval, logged-day and weight-day counts, and the model sensitivity range in kcal/day. It explains that the last interval date contributes weight only, not intake. It states low confidence, unverified intake, no intake target and no statistical confidence interval or metabolic measurement.
- Settings labels its day as a data review day, not an adjustment day.

Returning from logging food/weight reloads observation through router focus. Blur/background cancels and hides stale results; foreground restores by reading. A possibly committed settings POST is never replayed automatically; refocus or own-goal invalidation reconciles by one read after it settles. A five-minute foreground cache lifetime is an engineering freshness control, not a clinical threshold. Expiry clears the prior snapshot and refreshes once; no timer remains while blurred/background/unmounted. Same-account token renewal does not erase a valid observation or extend its expiry. Account changes discard prior-account results.

These checks do not establish that all consumed food was logged, that weight change was tissue change, or that separate backend source queries constitute a coherent database snapshot. They cannot justify autonomous prescriptions.

## Evidence and its limits

1. [CDC, Steps for Losing Weight](https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html), 2025-01-17: gradual loss around 1–2 lb/week is associated with maintenance. Medication and medical conditions matter. This is not a universal rate or permission to increase a deficit automatically.
2. [NICE NG246, Physical activity and diet](https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet), recommendations 1.16.8–1.16.12 (2025): 800–1,200 kcal diets belong within specialized, supported interventions for specified populations; very-low-energy diets require further clinical indication and supervision. They must be nutritionally complete and limited in duration. Direct chapter access returned 403; official indexed chapter/PDF text was consulted. This does not establish 1,200 as a universal safe minimum.
3. [NIDDK Body Weight Planner](https://www.niddk.nih.gov/bwp), editorial date not shown: adults 18+, not pregnant/breastfeeding; the tool rejects under 1,000 kcal but that is its tool bound, not approval of our app or an individually safe minimum.
4. [2013 AHA/ACC/TOS guideline](https://pmc.ncbi.nlm.nih.gov/articles/PMC5819889/), published 2013-11-12: contextual strategies for adults with overweight/obesity include 500/750 kcal deficits or individualized 1,200–1,500 / 1,500–1,800 intake ranges in comprehensive interventions. These do not validate stacking another deficit onto an existing accepted goal.
5. [Hall et al., Quantification of the effect of energy imbalance on bodyweight](https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/), 2011-08-27: adaptation, composition, water/glycogen and sodium invalidate indefinite fixed-rule weight projections. Our short-window 7,700 kcal/kg approximation is not that validated model.
6. [Hall and Chow, Estimating changes in free-living energy intake and its confidence interval](https://pmc.ncbi.nlm.nih.gov/articles/PMC3127505/), online 2011-05-11: a different model estimating changes in intake required more than 28 daily weights in its simulation to narrow uncertainty. This does not validate our 21-day gate or make 28 days universally sufficient.

## Requirements before adaptive recommendations

- Qualified review of the exact algorithm, eligible population, exclusion/stop criteria, uncertainty, accumulated changes and follow-up. No such approval is recorded here.
- Validate the model against references and adverse cases separately from software tests. A plausible output, user consent or literature citation does not substitute for clinical validation.
- Do not infer contraindications are absent from missing profile fields. Do not add a clinical questionnaire or transmit health data to another provider under this change.
- Preserve existing product floors/no-reduction protections; do not lower them based on NIDDK or label them universally safe. Goal reached, contradictory direction or unexplained change must not deepen a deficit.
- Resolve coherent source snapshot/completeness and consequential write concurrency before any automatic adjustment. User proposals, if later approved, must remain explicit, explainable and accepted individually through CAS/idempotent save.

A 100-kcal/week limit, 5% step, cooldown or minimum record count would be an engineering choice unless separately validated. None is represented as professionally approved or used here to unlock recommendations.

## Verification limits

The exact downloaded Progress v14 engine is preserved as an inert test fixture (`observed-engine-v14.ts`, SHA-256 `3f09d090f8ab426ae10e5b7b4d6c07567b9345334490efcf1ee5f50910b8d659`). Tests execute that source and the real client parser, plus real hook code with simulated auth/network/focus. The fixture is not a new server/environment or deployed replacement. It contains no account data or credentials.

No native build, installation, authenticated app E2E, live settings change, paid generation, clinical validation or new scheduler was performed. The existing Windows computer is now connected. Read-only inspection found browser windows but no controllable native app or mobile device; installation/version/session remain unverified. Some full device/application inventories were access-denied, so absence is not asserted. Release remains blocked by those missing checks and the separately documented source/dependency/recovery issues.

Final local gate: **403/403 maintained tests pass, zero skips**; absolute types still report **5 diagnostics across 391 roots**, all in the previously reported account-deletion/social-post/challenge files; changed TDEE source lint is **0 errors / 0 warnings** and diff checks are clean. No type-pass, clinical-pass or device/account-pass claim is made.
