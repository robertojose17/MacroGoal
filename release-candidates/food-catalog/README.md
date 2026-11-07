# Food catalog validation, round 4

**Validation candidate only. Not release-ready.** Based on published commit `1fa113058b989421181f6e5adf3b82e823f126ae`, tree `6f1e5f33bc1ea6783e37f920ca5c83f0fffa1752`. This is a client-only persistence follow-on. No build, TestFlight submission, deployment, hosted SQL or remote write is part of this source preparation. All earlier snapshots remain unchanged.

## Narrow changes and limits

The reviewed client coordinator retains an uncertain USDA persistence operation within the originating authenticated session and exact FDC identity. An 1800 ms UI deadline covers auth admission and optional capture. Timeout or ambiguous transport/readback does not prove rollback and does not authorize a duplicate retry. Exact verified late identity may update only the matching still-active draft entry; nutrients, portion facts, user edits, cleared/consumed entries, auth changes and retired navigation remain protected. Valid nutrition logging is not blocked by optional catalog failure.

Unresolved reservations are bounded to 128 per active session and are never evicted to permit uncertain replay. Only original acknowledged success releases the reservation; verified operation history has an LRU capacity of 64. A later explicit selection can refresh after the original acknowledgement. The guarantee is single-process/session scoped, not durable global exactly-once persistence. Whole-array draft consumers and their preexisting stale-array limitation remain unchanged; no saved-meal identity is guessed after consumption, navigation retirement or restart.

`source-lineage.json` and `round4-provenance.json` pin exact reviewed source and predecessor hashes against the published Git tree. Only the eleven approved package files plus an explicit client allowlist entry and derived release documentation/manifests change. Server source, all SQL candidates, Deno locks, native harness, workflow, three My Meals consumers, Coach/Health runtime and package dependencies remain unchanged.

## Actual combined checks

- Client suite: **377 passed, 1 historical backend-only skipped, 0 failed**, including all 60 newly wired identity cases and every existing selected suite.
- Existing CI/domain suite: **78 passed, 4 failed, 0 skipped**. The library domain cases remain included. Four unrelated Coach restore/dietary-correction behavior assertions remain red; no assertion is suppressed to obtain a green result.
- Actual cross-component contracts: **4 passed, 0 failed**.
- Absolute application types: **252 diagnostics across 363 roots**, still red. No baseline subtraction or diagnostic suppression is used.
- Full local source lint: **0 errors, 53 warnings**. Staging is source-complete for these checks, not an asset/build-complete checkout.

The unchanged backend component source and fixtures retain prior round3 evidence of 552 passing component executions, and purchases retain prior 38-pass evidence. Those suites were not rerun for this client-only change and are not counted as fresh round4 passes. Native, Deno, hosted transport/concurrency, live auth/provider behavior and device gates require their own exact-revision evidence. The unchanged 30-file vision closure retains prior reviewed source equivalence and separate offline 935+2 evidence; no fresh vision execution or production change is claimed here.

## Reproduction

Use the complete checkout, locked Node24.22.1/pnpm10.21.0 dependencies, TypeScript5.9.3 and isolated PGlite0.5.8 tooling. The explicit client and CI stage commands retain outbound denial guards and all prior selected cases.

```sh
node scripts/release-review/verify.mjs
node scripts/release-review/check.mjs --group syntax
node scripts/ci/run-stage.cjs client-regressions
node scripts/ci/run-stage.cjs ci-regressions
node scripts/ci/run-stage.cjs backend-contracts
node scripts/ci/run-stage.cjs app-types
node scripts/ci/run-stage.cjs lint
```

The unchanged validation workflow also retains backend components, purchases, native PG16/PG17.6, authentic frozen Deno locks and JavaScript export stages. This source package does not establish release readiness or authorize a build.

## SQL candidates and rollout gates

All three additive SQL proposals remain inactive under `release-candidates/food-catalog/sql`, outside `supabase/migrations`. Only an explicitly authorized later migration may use this order:

1. `01-nutrition/enrichment.CANDIDATE.sql`, after exact authority-definition, owner, grant and RLS preflight.
2. `02-off-registry/off-mass.CANDIDATE.sql`, after registry/bootstrap/locking and current-schema checks. Installation itself adds reservation behavior; disabling capture does not disable its trigger.
3. `03-search/search-snapshots.CANDIDATE.sql`, with service-only grants checked before enabling dependent callers.

Native fixture copies under `scripts/ci/native-database/sql` are linked by strict hash/byte equality to these actual candidate files. They run only in fresh local synthetic clusters. Keep `NUTRIENT_REFRESH_ENABLED=false`, `NUTRIENT_REFRESH_NETWORK_ENABLED=false` and `OFF_MASS_CAPTURE_ENABLED=false` until separately approved gates pass. Do not merge historical collisions, invent density, rewrite nutrition/history or delete canonical rows.

Volume-only completion and catalog conflicts remain honest unsupported/Back-only flows. Old build609 can retain prior unsafe search cache after HTTP409; server rejection cannot clear that installed cache. Verify the minimum-client rollout and installed build. Validate camera, cancellation, repeated actions, review/save/reopen, corrected portions, diary/favorites/recipes/meals and whole-request latency on the real authorized path before any release. Prefer disabling new callers while retaining final fail-closed safety if rollout is stopped; never restore unsafe legacy insertion as a rollback shortcut.
