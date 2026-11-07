# Food catalog validation, round 2

**Validation candidate only. Not release-ready.** Base commit `9193c2243d9919323715d7d10338ca589f3e7a2e`, tree `213497d148b951626718ab0bdc2216beeaff8d5a`. No native app build, TestFlight submission, deployment or hosted SQL application is part of this snapshot. Previous frozen snapshots remain unchanged.

## Source changes and provenance

This combines the previously reviewed client/backend candidate with the approved full backend test pack, Deno type-contract fixes, current vision v45 source reconciliation, isolated PG17.6/authenticated-writer validation, exact lint/checker corrections and central schema/theme/icon type contracts. `source-lineage.json` records final source hashes. `round2-provenance.json` identifies the frozen input manifests and explicit workflow/stage/hash resolutions. Application package and lockfile bytes are unchanged.

The workflow preserves backend components, the two explicit Deno regressions, failed-lock evidence, full application diagnostics, client/purchase/contracts, JavaScript-only exports and the original PG16 lane. It adds a separate exact PG17.6 container lane with safety probes. Missing reviewed Deno locks remain a red gate even if graph resolution or typechecking succeeds; no lock or package checksum is invented.

## Vision source reconciliation, not deployment

`vision-source-lineage.json` pins the full 30-file local closure. Twenty-four repository files are added/updated. The entrypoint is byte-identical to captured live v45; 23 closure files are raw-byte equal, six have reviewed type/JSDoc-only changes, and one retains the repository newline convention. Normalized emitted JavaScript is identical for all 30. The earlier 6 equal / 9 different / 15 absent comparison is retained only as historical evidence in `vision-source-drift.json`.

Production v45 and its `verify_jwt=true` setting remain unchanged. Source equality does not prove the same externally resolved dependency graph or hosted runtime. The inherited JSR/NPM dependencies still need authentic generated locks, review and actual Deno CI. No bulk deployment is authorized.

The separate vision offline package passed 935 regression executions plus two entrypoint/auth boot checks against the exact assembled source bytes. Its original unadapted tests remain preserved at 928 passes and seven obsolete raw-source pin failures. The reviewed expectation overlay preserves all runtime assertions and exact original/new pins. That nine-file test overlay uses a legacy offline layout and is deliberately **not** copied into the repository. These counts are separate offline evidence, not CI or device results.

## Reproduce source validation

Use a complete checkout with its locked dependencies, Node24.22.1, TypeScript5.9.3 and isolated PGlite0.5.8 tooling. Tests use explicit allowlists, not repository-wide discovery.

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
python3 scripts/ci/native-database/safety_probes.py
python3 scripts/ci/native-database/run.py --postgrest
python3 scripts/ci/native-database/run.py --postgrest --postgres17-container
```

Backend coverage is 129 nutrition + 250 registry + 173 search component executions, plus four separate cross-component executions. This is 556 executions with intentional overlap, not 556 unique scenarios. Actual checkout runtime/SQL hashes and start/end stability checks prevent archived current-runtime copies from making stale code pass. Two frozen predecessor-only source exclusivity assertions remain excluded exactly as documented in the fixture manifest; no new runtime assertions are removed. Client coverage retains 224 passes and one explicit historical backend-only skip.

Prior commit9193c224 CI run42318773712 passed PG16/local PostgREST, client/purchase/contracts and iOS/web JavaScript exports. Those are prior-revision results, not automatic passes for round2. New PG17.6/authenticated-writer checks require genuine exact-commit CI execution. This preparation host lacks native PostgreSQL/Docker; five mocked isolation/cleanup probes are not concurrency or HTTP proof.

Current local absolute application checker reports **297 diagnostics**. Local source-complete lint has zero errors and 53 warnings. The explicit CI regression stage currently has 38 passes and 26 failures across 64 tests, caused by historical Coach UI harness/native-module incompatibilities; those cases are not passing evidence, and no cases are removed or suppressed here. No baseline subtraction or suppressed errors establish a pass. Full exact-commit CI results, source completion, actual Deno locks, native parity, live drift/transport/scheduler/latency and device tests remain release gates.

## SQL candidates and rollout gates

All three additive SQL proposals remain inactive under `release-candidates/food-catalog/sql`, outside `supabase/migrations`. Only an explicitly authorized later migration may use this order:

1. `01-nutrition/enrichment.CANDIDATE.sql`, after exact authority-definition, owner, grant and RLS preflight.
2. `02-off-registry/off-mass.CANDIDATE.sql`, after registry/bootstrap/locking and current-schema checks. Installation itself adds reservation behavior; disabling capture does not disable its trigger.
3. `03-search/search-snapshots.CANDIDATE.sql`, with service-only grants checked before enabling dependent callers.

Native fixture copies under `scripts/ci/native-database/sql` are linked by strict hash/byte equality to these actual candidate files. They run only in fresh local synthetic clusters. Keep `NUTRIENT_REFRESH_ENABLED=false`, `NUTRIENT_REFRESH_NETWORK_ENABLED=false` and `OFF_MASS_CAPTURE_ENABLED=false` until separately approved gates pass. Do not merge historical collisions, invent density, rewrite nutrition/history or delete canonical rows.

Volume-only completion and catalog conflicts remain honest unsupported/Back-only flows. Old build609 can retain prior unsafe search cache after HTTP409; server rejection cannot clear that installed cache. Verify the minimum-client rollout and installed build. Validate camera, cancellation, repeated actions, review/save/reopen, corrected portions, diary/favorites/recipes/meals and whole-request latency on the real authorized path before any release. Prefer disabling new callers while retaining final fail-closed safety if rollout is stopped; never restore unsafe legacy insertion as a rollback shortcut.
