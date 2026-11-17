# Synthetic real-Chromium durable journal checks

Run from an actual repository checkout containing the candidate modules:

```
cd tests/browser-journal
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install --with-deps chromium
npm run check
npm test
```

The builder reads actual `utils/*.ts` source from that checkout and emits browser ESM. It never imports frozen copies of implementation. It records SHA256 source paths in JSON results and rejects nonlocal runtime imports. The test inputs contain only fictional values. No production account, consent, credentials, Supabase client, app environment or app deployment is used.

Coverage: the existing11 browser scenarios exercise exact prepare/load/resolve/reject/clear, real IndexedDB CryptoKey structured cloning and nonextractability, iframe contention, namespace isolation, storage/key/head/witness loss, tampering, quota failure and unsupported API failure. Added checks use full page reload, separate top-level tab and actual acceptedGoalJournalAvailable implementation. All browser requests must stay on the ephemeral127.0.0.1 origin; CSP forbids connections; service workers are disabled. Browser context is fresh and closed afterward. No user screenshots or browser profile reused.

JSON is printed to stdout and written to ignored results.json, including commit and actual source manifest. No claim of full application onboarding/lifecycle QA: controller mock-transport lifecycle tests are not included in this first minimal job. Actual application mounting/recovery tests remain separate.

Pinned primary sources checked: actions/checkout v4.2.2 SHA11bd71901bbe5b1630ceea73d27597364c9af683; actions/setup-node v4.4.0 SHA49933ea5288caeca8642d1e84afbd3f7d6820020; microsoft/playwright v1.56.1 tag54c711571a37de525377e6f3d3608c3e029b1829; https://nodejs.org/en/blog/release/v24.11.0 ; https://playwright.dev/docs/ci . npm dependencies and integrity hashes are locked. Network during setup is only standard official tooling installation; test code has no production-network capability.

Workflow onpushmain path filters run tests only, contents:read, no secrets and no deploy. EAS workflows remain untouched/manual. Creating `.github/workflows` requires connector Contents+Workflows write; a denial must be reported, not bypassed.

## Isolated controller integration boundary
Six added Chromium cases build actual repository saveNutritionGoal, restartNutritionJourney, nutritionGoalRequest and goalChangeEvents modules, with source SHA256 evidence. The only external module adapter is explicitly named expo-crypto-test-adapter.js: randomUUID delegates to browser crypto.randomUUID (UUIDv4); no other Expo export is provided. The adapter source hash appears separately in the manifest.

A fictional in-memory client implements auth, query and RPC interfaces and checks exact durable journal presence BEFORE every simulated RPC. No Supabase client, credentials or network are used. Tests cover verified save/readback, uncertain response then true page reload with no automatic send followed by exact explicit retry, preserved onboarding scope blocking a new manual save/restart takeover, account switch, mismatched readback, and restart kilograms/receipt/readback. Onboarding Settings hook presentation and production backend behavior are NOT asserted by these controller cases. Browser storage remains real IndexedDB/CryptoKey/localStorage/locks.
