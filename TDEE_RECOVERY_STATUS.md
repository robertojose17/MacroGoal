# INCOMPLETE TDEE recovery candidate — NOT READY FOR RELEASE

This isolated work branch is a source backup, not a release or deployment.
Do not merge, deploy, build, or distribute it without completing its open gates.

## Provenance

- Recovered source base: `5a10c5e93e492e1046985e1d50556b9943af84c6`.
- Existing iOS 23.0.2 (613) source: `5b4ef5976139a793a3c38a98811bae6ce0b7cab9`.
- Existing Android 23.0.1 (28) source: `bf103da59a54db060d66a8f020a06567d8885014`.
- This is a new reconstruction. It does not inherit test results from an unavailable earlier local candidate.
- The separate onboarding/paywall work has not been merged. Step10 remains byte-identical to the source base.

## Current scope

Accepted-goal save/restart controllers use the installed production RPCs with actor identity, exact nullable profile/goal CAS, immutable replay, and verified readback. Onboarding uses exact date of birth and explicit target acceptance, without independent profile/goal writes or historical backfill. Food and widgets do not invent missing targets. Recipe/planner generation is bound to an accepted goal and preserves preferences. Coach no longer applies AI goal proposals directly.

Observation remains opt-in through the explicit build configuration `EXPO_PUBLIC_TDEE_MODE=observation-v1`. The production build profile now sets that configuration for a future approved build, but does not change the installed app, enable a user setting, enable recommendations, or enable a replacement cron. The broken legacy job was narrowly paused as documented below. OFF shows unavailable rather than legacy invented estimates. See `docs/testing/observational-client-recovery-20261112.md` and `docs/testing/dynamic-calculation-policy-20261113.md` for intentional visual differences and the policy/validation limits.

## Release blockers

- Absolute application typecheck still has 5 diagnostics outside the TDEE recovery core. No type-pass claim is made, and the account-deletion route is intentionally untouched.
- The latest maintained combined CI run passed 403/403, with no skips. This includes actual session/controller/hook code running against simulated auth/database/storage, not a native account E2E run.
- The incompatible prebuild override was removed: CLI and SplashScreen now resolve official @expo/prebuild-config 54.0.9 within their declared ranges. Frozen install and 7 dependency checks pass; all importer versions are unchanged. Router/RN and other bundled-version differences still require review. No mass upgrade was performed.
- Native onboarding and editors are now wired to encrypted durable recovery with explicit replay. The source declares SecureStore backup exclusions; effective native configuration, process-kill and hardware-key recovery still require artifact/device tests. A non-sensitive presence witness detects a missing encrypted head; losing both storage domains still requires server/device reconciliation. See the durable journal document for exact limits.
- Planner/diary writes are not a single database transaction. Partial or uncertain results block automatic retry; cross-process recovery remains incomplete.
- Settings/profile fixes and owner/read-order regression tests are consolidated. The separate account-deletion route is unchanged and has an independently reported safety/type blocker.
- No native device compilation, installation, or authenticated E2E validation of this client has occurred. Existing build success is not proof this client is installed.
- Historical rollback SQL results are not a substitute for current application tests. Recipe-social/calendar runtime QA was not rerun.

There has been no client deployment, paid generation, account-data mutation, build, or TestFlight distribution during this recovery pass. One authorized production maintenance change paused only the broken TDEE cron job; see `release-candidates/tdee-cron-containment/README.md`. The dynamic calculation and recommendation limits are recorded in `docs/testing/dynamic-calculation-release-gates-20261112.md`. The isolated remote branch has been created but still points to the original base; it does not yet contain the candidate. A partial unreferenced tree is not a completed backup. Source upload was denied and is paused pending specific publication authorization. This remains a local checkpoint until an exact remote tree/commit receipt is recorded.
