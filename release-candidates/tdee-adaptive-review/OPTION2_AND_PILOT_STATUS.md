# Tracking preparation and conservative pilot guard, OFF

## Option 2: read-only tracking
The controller composes the already-tested fourteen-day diagnostic/hold path. Its bilingual view model distinguishes insufficient data, descriptive trend and unavailable/stale context, without calling an interval validated or implying current targets are safe. Only explicit read-only refresh exists; there is no accept/change-target command.

The prepared own-account adapter uses the EXISTING `tdee_read_review_context_v1()` RPC. Inspection of its installed SQL confirms it creates one coherent observation/readiness/profile/goal envelope and can return it with null policy/anchor. Thus trend diagnostics do not require inventing a nutrition policy or accepted baseline. Authentication is the user's existing signed-in client; no service-role substitution, supplied owner parameter, new credential, provider TTL extension or write is used. Current access/observation availability are still enforced by the existing source and assessor.

Both controller and adapter stay OFF. They do not mount a mobile screen, start a background schedule, or prove a live signed-in read. Previous holds must come from legitimately bound state; proposed dates remain explicitly not scheduled. App rendering, exact signed-in transport and accessibility need verification before a visible rollout.

## Option 3: limits, not an invented adjustment algorithm
The separate conservative pilot checker validates an explicitly supplied candidate delta against an explicitly supplied policy. It supplies NO default policy, dose, statistical evidence or step-selection method. Missing policy yields hold. It never picks 100 kcal or converts a weight slope into calories.

It retains existing contracts: source freshness30s, accepted baseline/cadence at least14d, maximum step200kcal, configured relative/increment/net/intake constraints, actual anchor delta reconciliation, and the unresolved individual-deficit block on reductions. Requested targets are rejected rather than silently clamped or rounded. Passing numerical limits is explicitly NOT acceptance authorization; nutritional/macro, identity, purchase, source, policy provenance and atomic-write validation remain independent.

All test policy numbers are synthetic fixtures, not adopted operational settings. No reviewed record or approval is manufactured. No new rate-rule proposal is emitted and the existing statistically-reviewed proposal contract is not bypassed.

## Remaining decision and engineering
The owner has approved preparing tracking and a conservative pilot while keeping recommendations inactive. That does not choose an unprovided per-adjustment rule or remaining individual limits. The exact pilot step-selection rule, applicable nutrition limits and reduction/deficit handling must be explicit before an actionable proposal path is implemented. Do not ask for an additional vague approval, and do not claim a passing numeric guard supplies those missing decisions.

A real target change still needs explicit proposal acceptance and full end-to-end verification of bound persistence, macros, receipts, readback, rejection, expiry, revocation and uncertain results. A real intake baseline must use genuine goal-save provenance, not a fabricated legacy acknowledgment. No recommendations, cron, target change, TestFlight, empirical-data-free research experiment or live deployment is performed by this source increment.

## Source checks
24 controller/own-account adapter tests and14 numerical pilot tests pass. The existing13 diagnostic/hold tests and9 issuance regressions also pass in the packaged graph. Deno checks the composed source graph. These are source/fixture checks, not a live signed-in or native UI demonstration.
