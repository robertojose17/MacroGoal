# Observational client reconstruction, 2026-11-12

Candidate source only. No Site export, deployment, app/account test, build, TestFlight, SQL execution, cron change or global flag activation is part of this work.

## Source and protocol

Reconstructed from GitHub base 5a10c5e and the exact downloaded live Progress v14 source (`observed-program` and `observed-progress` dispatchers/handlers). This is not recovery of the lost complete candidate or its previous test evidence.

The explicit `EXPO_PUBLIC_TDEE_MODE=observation-v1` rollout is required. OFF is fail-closed: unavailable cards/settings, no observational request, no legacy fallback. Program GET and settings POST use `observed-program-v1`; progress POST uses `observed-progress-v1`. Both require their exact response marker. Settings only permits the observed enabled/review-day controls. There is no proposal/review/accept/reject path or goal mutation.

Actor-scoped resources have no shared cache. Auth actor change, goal events, abort and unmount invalidate pending responses. Same-actor token refresh preserves verified data. Settings requests serialize and are not automatically replayed after invalidation. The server remains responsible for authoritative access and premium checks.

## Deliberate visual differences from the GitHub base

ProgressCard and GoalWeightCard retain only authenticated observed start/current/goal weights (explicit lb) and, when available, a separately validated low-confidence observed Daily Burn estimate. Incoming unverified weight props cannot substitute for the response. Unknown quantities display `--`; zero is not converted into a positive estimate.

Removed from these cards: local 2000-calorie defaults, 3500-based projections, deadline/ETA, ahead/behind and clinical pace labels, simulated planned curves, local adherence and local projection fallbacks. The `WeightProgressMiniChart` compatibility export now displays observed weights, not a fabricated chart. This is intentionally not visual parity with the lost candidate. Restoring a chart requires a verified historical series and a separate implementation/review. No automatic recommendations are activated.

## Verification

`node --test tests/observed-tdee-client.test.cjs`: 17 tests pass with mocked network, executing real transport, parsers and hook code. Coverage includes exact HTTP contract, OFF/no calls, owner checks before/after asynchronous steps, marker mismatch, abort, stale result suppression, same-actor refresh, signout, goal invalidation, serialized settings without automatic replay, missing/zero/stale estimate, invalid clinical output, and card source guards.

These tests do not establish native rendering, installed-app behavior, real account flows, HealthKit, or live endpoint success. Those remain release validation requirements. No prior lost-suite test counts are reused.

## Follow-up, 2026-11-13

The candidate production build profile now explicitly selects observation mode. No build or activation in the installed app occurred. Router focus reloads after food/weight logging; blur hides stale data and uncertain settings writes reconcile by read, never automatic replay. Strict estimate metadata validation now exposes interval, coverage and model sensitivity on the existing card, without treating it as a confidence interval or clinically verified expenditure. Settings says data review day, not adjustment. See `dynamic-calculation-policy-20261113.md` for professional sources and exact limitations. The maintained CI includes the new focus and exact-engine contract suites; the original 17-test count above is historical.
