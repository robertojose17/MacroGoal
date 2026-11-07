# Food catalog validation, round 3

**Validation candidate only. Not release-ready.** Based on published commit `0fb1db21adb10c1ec84088c44f98e027462024de`, tree `d552b15cb8f53b5cb04244ed657bc3ea1ed32669`. Earlier snapshots are immutable. No build, TestFlight submission, deployment, hosted SQL application or remote write is performed by this preparation.

## Reviewed changes

- The native psql session harness now terminates a semicolonless SQL buffer before its response marker. Both PG16 and PG17.6 lanes retain their original assertions and gain real session regressions. Fifteen mocked protocol/isolation/cleanup checks are not native database or HTTP proof.
- Search uses a shared catalog deadline and only the remaining optional snapshot budget; provider fallback budgets and fail-closed authority remain intact. The runtime hashes and strict hydration type pins are updated explicitly to the approved sources.
- Pure food-search coverage and deadline coverage are explicitly selected, never discovered by a bulk test glob. Strict declaration and annotation/emitted-JavaScript comparisons remain required.
- Two authentic CI-generated dependency locks are committed byte-for-byte after independent review. Their recorded graph is not proof of parity with live v45. Fresh exact-commit Deno `--frozen` checks remain required.
- Coach test-only reconciliation isolates native module boundaries and follows verified current diary labels/meal selection. Four unresolved restore/dietary-correction behavior assertions remain red; no Coach runtime change or case suppression is included.

The reviewed library v2 package is included. Its saved-only numeric mass/count round-trip and numeric-string compatibility fixes preserve the legacy diary parser; blocked v1 was never included.

`source-lineage.json` pins the current source files. `round3-provenance.json` records exact approved inputs, predecessor hashes, explicit pin changes and lock provenance. Historical round2 evidence remains clearly historical. Root application packages, package lock, EAS configuration, active migrations, Health and Coach runtime behavior are unchanged by round3.

## Current combined local checks

- Explicit client suite: 317 passed, 1 historical backend-only skipped, 0 failed.
- Component suites: 552 passing executions (129 nutrition + 250 registry + 173 search), plus 4 separate cross-component executions. Counts overlap; they are not unique scenarios. Actual checkout runtime/SQL hashes and stability are enforced. Two documented predecessor-only source exclusivity checks remain excluded as in the frozen original package.
- Purchases/subscriptions: 38 passed, 0 failed.
- Explicit CI regression suite: 78 passed, 4 failed, 0 skipped. The remaining four failures are explicit restore after restart, pre-search dietary correction, unpaid preparation restore with fresh consent and historical same-flow unfinished resume. They are not fixed by this validation candidate.
- Absolute application types: 252 diagnostics across 361 roots. No baseline subtraction or error suppression establishes a pass.
- Native mocked safety/protocol tests: 15 passed. Actual local PostgreSQL and Docker remain unavailable. Fresh PG16 and PG17.6 CI must finish native sessions, mixed-role races, authenticated HTTP and cleanup; prior run failures are not passes for this revision.

Local staging contains pinned compilation/test sources, not a build-complete asset checkout. Full exact-commit CI, native concurrency/HTTP, frozen Deno, live transport/scheduler/latency and device tests remain gates. A local source lint pass or JavaScript syntax check is not release readiness.

## Vision status

The complete 30-file vision closure is unchanged from reviewed round2 source reconciliation. Twenty-three files match captured v45 bytes, six contain reviewed type/JSDoc-only changes and one retains the repository newline convention; normalized emitted JavaScript matches all 30. The prior separate offline run passed 935 regression executions plus two boot/auth checks against these same closure hashes. That evidence is retained, not relabeled as a new round3 CI run. Its legacy test-layout overlay is not copied into the repository.

Production v45 and `verify_jwt=true` remain unchanged. The committed vision dependency lock reflects the observed CI graph only. Fresh frozen Deno and live dependency/runtime checks remain required; no bulk deployment is authorized.

## Reproduction

Use a complete checkout with Node24.22.1, locked pnpm10.21.0 application dependencies, TypeScript5.9.3, isolated PGlite0.5.8 and Deno2.5.6. SQL fixtures are synthetic and local only.

```sh
node scripts/release-review/verify.mjs
node scripts/release-review/check.mjs --group syntax
node scripts/ci/run-stage.cjs client-regressions
node scripts/ci/run-stage.cjs ci-regressions
node scripts/ci/run-stage.cjs purchase-regressions
node scripts/ci/run-stage.cjs backend-components
node scripts/ci/run-stage.cjs backend-contracts
node scripts/ci/run-stage.cjs app-types
node scripts/ci/run-stage.cjs lint
node scripts/ci/run-stage.cjs deno-candidate
node scripts/ci/run-stage.cjs deno-repository-vision
python3 scripts/ci/native-database/safety_probes.py
python3 scripts/ci/native-database/run.py --postgrest
python3 scripts/ci/native-database/run.py --postgrest --postgres17-container
```

## SQL candidates and rollout gates

All three additive SQL proposals remain inactive under `release-candidates/food-catalog/sql`, outside `supabase/migrations`. Only an explicitly authorized later migration may use this order:

1. `01-nutrition/enrichment.CANDIDATE.sql`, after exact authority-definition, owner, grant and RLS preflight.
2. `02-off-registry/off-mass.CANDIDATE.sql`, after registry/bootstrap/locking and current-schema checks. Installation itself adds reservation behavior; disabling capture does not disable its trigger.
3. `03-search/search-snapshots.CANDIDATE.sql`, with service-only grants checked before enabling dependent callers.

Native fixture copies under `scripts/ci/native-database/sql` are linked by strict hash/byte equality to these actual candidate files. They run only in fresh local synthetic clusters. Keep `NUTRIENT_REFRESH_ENABLED=false`, `NUTRIENT_REFRESH_NETWORK_ENABLED=false` and `OFF_MASS_CAPTURE_ENABLED=false` until separately approved gates pass. Do not merge historical collisions, invent density, rewrite nutrition/history or delete canonical rows.

Volume-only completion and catalog conflicts remain honest unsupported/Back-only flows. Old build609 can retain prior unsafe search cache after HTTP409; server rejection cannot clear that installed cache. Verify the minimum-client rollout and installed build. Validate camera, cancellation, repeated actions, review/save/reopen, corrected portions, diary/favorites/recipes/meals and whole-request latency on the real authorized path before any release. Prefer disabling new callers while retaining final fail-closed safety if rollout is stopped; never restore unsafe legacy insertion as a rollback shortcut.
