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

## Verified follow-up: Settings session recovery

Production run `01a1d71e-382c-748c-98ae-f32111500934` completed successfully
in 1m55s from main `2e26664ee8229b151ff272e22e08d0e7697da56a`, deployment
`vnw9v2i6cc`. The existing authenticated owner session remained active.
Settings now displays the same profile and accepted targets as Foods/Profile:
2015 kcal, 196 g protein, 132 g carbs, 78 g fat (fiber 28 g).
The observation switch remained OFF and was not changed during this check.
Daily Burn still displays Estimate unavailable. This is not a successful
adaptive recommendation/acceptance test. No grant, purchase or TestFlight
submission was part of this deployment verification.

Inert adaptive infrastructure was subsequently committed to main `21ce9f8`.
It has no screen import/render, no deployed SQL, and no live acceptance binding.
51 focused infrastructure/session-recovery tests passed independently, but
native lifecycle, SQL concurrency and end-to-end acceptance remain unverified.

## QA entitlement blocker

The production RevenueCat webhook was narrowly patched at main `1235543f` /
live version 51 so official PROMOTIONAL events have zero recorded USD amount.
No promotional entitlement has been granted. A later lifecycle audit found
that the existing unique-per-user subscription mirror is overwritten by such
a grant and that EXPIRATION unconditionally downgrades the profile. The amount
fix is not full lifecycle reconciliation. Grant/revoke QA must remain blocked
until that risk is resolved; it cannot be claimed as a reversible test today.
The owner's current profile says Premium while the official entitlement is not
active. Neither an admin flag nor a forged subscription was used as a bypass.
