# Isolated simulation browser QA

Runs actual `app/tdee-simulation.tsx`, `TdeeSessionSimulation`, shared comparison,
MacroBar and ProgressCircle through React Native Web. Auth, GET endpoint and router
are synthetic boundary mocks. It does not mount real Dashboard/Foods or contact
production. This is component/route QA, not a full production root-layout test.

## CI (after existing browser-visual dependency/browser preparation)

```sh
cd tests/browser-simulation
ln -s ../browser-visual/node_modules node_modules # only if absent
node --check build.mjs
node --check run.mjs
node run.mjs
```

Reuse the already locked `tests/browser-visual` dependencies; no separate install
or lockfile is needed. Local staged sources can set SIMULATION_SOURCE_ROOT to the
candidate root (resolves root, publish, base); main CI requires no override.

Upload `tests/browser-simulation/artifacts/` with an always() artifact step.
The runner records results.json plus synthetic EN/light and ES/dark screenshots.
Generated app.js/harness.jsx/synthetic.js/index.html and node_modules must not be
committed. Commit only build.mjs, run.mjs, contract.json, package.json, README.md,
and .gitignore from this directory.

Coverage: real in-memory accept/reject/reset; Dashboard/Foods target propagation
and calorie progress 60→67%; repeated tab changes; invalid envelope; expiry;
logout/identity switch with late response; foreground logout/background hiding;
component session identity invalidation; Escape exit; explicit return only.
Every scenario blocks external network and checks no mutation transport. Auth
requests are test doubles, not real account or server authorization tests.

Local status: syntax/bundle checked; browser runtime not yet verified. Existing
cloud socket/Chromium restrictions require CI runtime and screenshot inspection
before claiming tests or visual checks pass.
