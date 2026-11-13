# iOS 613 source candidate — 2026-11-11

> Historical 2026-11-11 record. Preserved for provenance, not a separate current release line or an instruction to deploy. See `HOST-SCREEN-CONSOLIDATION.md` for the single production candidate and fresh checks.

This branch is based on the exact source of the latest verified production-profile iOS build, 23.0.2 (613): `5b4ef5976139a793a3c38a98811bae6ce0b7cab9`. Expo build: https://expo.dev/accounts/roberto_jose17/projects/macro-goal/builds/22e42f09-42a7-40aa-8bfb-18e0e47e3bc0.

It supersedes the earlier main-based source candidate for future client integration. Main `5c3c2ac0d6ffd3d8f523307737a0147f7f5703eb` is 30 commits behind that iOS source and must not be used to roll the app back. All existing files outside the explicitly listed tracker patch are byte-for-byte unchanged from the iOS 613 source, preserving the recent food-search and large USDA-response fixes.

The patch changes only five runtime client files: `app/subscription.tsx`, `components/GoPremiumFloatingBadge.tsx`, `components/PremiumCheckpointInline.tsx`, `utils/premiumCheckpointContract.ts` and `utils/premiumCheckpointRuntime.ts`. Supporting files record the already deployed tracker protocol/RPC, read-only reconciliation, regression tests and deployment evidence. It introduces no additional TDEE, nutrition-goal, private-preview or recipe/planner work. Native version/build numbers, package locks, permissions and build profiles are unchanged. The only backend prerequisite is the already deployed tracker RPC and `track-onboarding` v23.

No workflow file or trigger is changed or disabled. The new source branch `codex/premium-screen-ios613-20261111` does not match the existing workflows' push filters. Publishing it does not run an isolated database, hosted preview, native build or app release. The earlier integrated candidate remains separate and is not a release source.

Fresh verification of this exact iOS-source candidate is recorded below. Earlier actual-SQL results in the rollout document remain historical, not a fresh database execution for this candidate. No new database test environment was created.

Authenticated testing through the updated app remains pending. Source publication and a published backend do not establish installed-client behavior. No native build, OTA, Expo deployment, store submission or TestFlight action was started. Before distribution, validate the chosen complete release and obtain any required build-cost and TestFlight approval. Then verify authorized interactions through the owner's identified app, checking allowed host tabs and same-flow labels. Never fabricate payment events or backfill an unknown historical screen.

## Fresh source checks

- 65 checkpoint, route, purchase and subscription regression tests passed.
- Focused ESLint completed with zero errors and one existing subscription effect warning.
- Application-scope TypeScript comparison with the same available dependencies reported 252 diagnostics in both baseline and candidate, with zero introduced. This is not an absolute application typecheck pass or a locked-dependency release certification.
- Independent source review confirmed exactly 17 tracker paths, the five runtime client files matching the reviewed implementation, and unchanged package locks, workflows, Expo configuration and all other base files.
- No database fixtures, hosted test environment, simulator, device test, native build or deployment ran during this source-port verification. Earlier SQL validation remains explicitly historical.
