# Food catalog integration candidate

This follow-on source overlay combines frozen client V5, seven independently reviewed client readiness fixes, the final lookup/search backend composition and native PostgreSQL/PostgREST validation tooling. It is a review candidate, not approval to migrate, deploy, build, submit or release. Base: `robertojose17/MacroGoal` commit `5c3c2ac0d6ffd3d8f523307737a0147f7f5703eb`, tree `7256c7c81b78d821955316580a5bd76f9079c1f3`.

## Included and excluded

- 32 V5 client/helper/test files with seven explicitly recorded readiness source fixes, plus one new regression file and 11 exact composed backend files. One shared `foodPortions.mjs` gives 43 unique final source/test paths. `source-lineage.json` and `follow-on-lineage.json` distinguish frozen originals from final bytes.
- Three proposed additive SQL files stored only under this directory's `sql/`. These are inactive review candidates, not Supabase migration files. Nothing automatically applies them.
- Portable offline callback, SQL and endpoint tests. Existing build 609 source is included only as six pinned test fixtures to demonstrate the known cached-search compatibility problem. It is not runtime code or a proposed rollback.
- No package/dependency, version, build, EAS project or deployment configuration changes. The reviewed, branch-scoped validation-only CI is included in this follow-on validation snapshot. No obsolete source package, archive, production row, credential or private work note is included.
- No `vision-nutrition-extract` or `ai-coach` runtime file is replaced. No live service or provider is contacted by the portable tests.

## Reproduction

Apply this overlay to a checkout of the exact base commit; preserve every unlisted repository file. Tests require Node 24.22.1, TypeScript 5.9.3 and PGlite 0.5.8. Use an existing installation or the separately prepared pinned CI tooling. The runner does not install anything or discover arbitrary tests.

```sh
node scripts/release-review/verify.mjs
node scripts/release-review/check.mjs --group syntax
node scripts/release-review/check.mjs --group client
node scripts/release-review/check.mjs --group contracts
```

TypeScript resolves from the checkout by default. `TYPESCRIPT_MODULE` may point at an existing TypeScript module directory. `PGLITE_MODULE` may point at an existing PGlite `dist/index.js`. `BARCODE_RECOVERY_NODE_MODULES` is derived automatically unless explicitly supplied. Paths are portable; no original packaging workspace is required.

Fresh execution after follow-on overlay/harness integration: client 225 tests, 224 passed, one explicit historical backend-only SQL assertion skipped, zero failed; contracts 4/4 passed; 42 source syntax checks passed. These are synthetic offline executions against the actual overlaid files, not native rendering, real PostgreSQL concurrency, full app semantic validation, live auth or deployment proof. The predecessor's 556 backend component executions are prior evidence in its frozen package, not silently counted as rerun by this portable four-test contract suite.

## SQL sequence and authorization gates

Do not place these files in `supabase/migrations` or apply them before explicit authorization and all preflights pass:

1. `sql/01-nutrition/enrichment.CANDIDATE.sql` extends the captured nutrition authority. Confirm live definitions, owners, grants, RLS/forced-RLS and exact guard predecessor before any write.
2. `sql/02-off-registry/off-mass.CANDIDATE.sql` adds the registry alternative. It does not repair or merge historical collisions. Installation includes a reservation trigger/bootstrap and remains blocked until actual multi-session PostgreSQL locking, abort, duplicate/correction/importer races and isolation tests pass. An OFF capture flag does not disable that trigger.
3. `sql/03-search/search-snapshots.CANDIDATE.sql` adds service-only atomic snapshot reads; verify grants before enabling its Edge consumer. It does not replace ranked search or give clients private table access.

Preserve existing authority, canonical IDs, nutrition history, diary, favorites and meals. No row conversion, identity merge, mass deletion or historical relabeling is part of this candidate. Synthetic fixtures never establish service-role behavior over real PostgREST.

Keep `NUTRIENT_REFRESH_ENABLED=false`, `NUTRIENT_REFRESH_NETWORK_ENABLED=false` and `OFF_MASS_CAPTURE_ENABLED=false` until separately approved gates pass. Authentication observations are documentation only: search v40 and lookup v39 use `verify_jwt=false`; vision v45 uses `verify_jwt=true`. Do not rely on CLI defaults or treat this observation file as deployment configuration.

## Vision drift and safe publication strategy

`vision-source-drift.json` compares every captured v45 file to the pinned repository tree by exact Git blob identity. Six match, nine differ and fifteen are absent. Therefore repository-main vision is not the deployed v45 source closure. This overlay intentionally leaves all vision and shared ai-coach files untouched.

Publishing this source overlay must not trigger a bulk function deployment. Before a later authorized vision deployment, review a separate exact v45 synchronization, including its ai-coach dependency closure, against fresh deployed metadata/source and preserve `verify_jwt=true`. Do not copy the old repository vision over v45. Current deployment remains unchanged.

## Remaining release gates

- Real complete checkout/dependencies, absolute full-app lint/typecheck, JS exports and required CI on the exact integrated commit. No relative-to-baseline diagnostic waiver establishes success.
- Actual Deno/Edge typechecking and byte-pinned dependency resolution. Inherited `jsr:@supabase/supabase-js@2` remains a floating major dependency and is not vendored here.
- Actual multi-session PostgreSQL, live schema/ownership/grant/trigger preflight, PostgREST auth/client denials, uncertain-write handling and request scheduler behavior.
- Whole selected-USDA endpoint latency within the client 1800 ms deadline. Optional enrichment scheduling alone is not a whole-request guarantee.
- Real-device camera, cancellation/repeated actions, review/save/reopen, diary/favorites/recipes/meals/history and exact installed build. Old build 609 can retain unsafe prior search cache after HTTP 409; server capability rejection cannot clear that installed cache. A verified minimum-client rollout is required.
- Volume-only completion remains unsupported without real gram evidence. Catalog conflicts/reservations deliberately lead to Back-only guidance. No density is invented.

Prefer disabling and draining new capture/refresh callers while retaining final fail-closed safety if rollout is stopped. Do not restore the legacy lookup insertion path merely because an old source is archived. Any destructive rollback or authority change requires separate review and authorization.

## Follow-on validation publication

The initial 81-file validation snapshot remains immutable. This follow-on applies the reviewed seven client source fixes and the new 14-case actual-source regression suite. The explicit client allowlist now runs both the retained V5 safety cases and those new cases. No baseline subtraction or suppressed diagnostic establishes application readiness.

The placeholder native gate is replaced with `python3 scripts/ci/native-database/run.py --postgrest` on the exact CI commit. Thirteen reviewed harness files enforce parity with the final checked-out SQL/provider sources and use only a fresh isolated local PostgreSQL cluster and local PostgREST container. This is validation, not production migration. Native source parity (six hashes, five final-source comparisons) and Python syntax pass locally; the actual native invocation exits 2 because this preparation host lacks PostgreSQL binaries. Genuine native/HTTP results must come from CI and are not claimed here.

The workflow changes only the existing validation branch workflow, not main or EAS workflows. Deno checks still fail without reviewed committed dependency locks. Complete app diagnostics, exports, current live drift, gateway/auth/scheduler behavior, latency and real-device/minimum-client rollout gates remain open. No native application build, submission, deployment or live SQL execution is part of this snapshot.
