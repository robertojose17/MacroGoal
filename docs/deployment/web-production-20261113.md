# Existing Expo production web deployment

The source consolidation was verified in GitHub `main` at
`2fa72e8eb03ea86971a959f48d22b5bccefd39c5`. The manual production web
workflow was then added to that same branch at
`c5e5edd2f1f4ec28e1dd735b414ddd14f5e9921b`.

This workflow deploys only web assets to the existing Expo project. It does not
build iOS/Android binaries, submit to TestFlight, enable adaptive proposals, or
change account settings. It explicitly bundles `observation-v1` and has a main
branch guard. Run it with the `main` ref, not a commit SHA; the latter does not
satisfy that guard.

Local web export completed on 2026-11-13 against the consolidated source and
locked dependencies (3,619 modules). Package lock and dependency versions were
not changed. This proves compilation only, not authenticated application behavior.

The first workflow run (`01a1d713-8440-76a7-9ad8-42aca62ae9de`) selected an
exact SHA and was skipped by the branch guard. It did not deploy. The subsequent
run from `main` is `01a1d715-18c0-7074-9727-3c2039310743`; it completed successfully in 1m54s with deployment ID `2z5m76a2oz`.
The official production URL is `https://macro-goal.expo.app/`. The bundle hash
matched the local export. Edge opened the production app and login screen.
No authenticated session was present; login is required before account E2E.
No tokens were copied from the old Site, and no account data was changed.

Open release gates include authenticated application checks, native build/device
validation, and the separate adaptive proposal/acceptance infrastructure and
policy. Source publication and observational display are not completion of
adaptive recommendations.
