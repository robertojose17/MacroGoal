# Macro Goal: one production-bound source line

Status: local consolidation in progress, **not a new deployment or release-ready claim**.
No new Site, test environment, build or TestFlight submission was created. Recommendations
and acceptance remain OFF. This document contains no account rows, credential values or
private execution receipts.

## Provenance checked on 2026-11-13

- GitHub default `main`: `5c3c2ac0d6ffd3d8f523307737a0147f7f5703eb`.
- Expo iOS production-profile artifact 23.0.2 (613): source
  `5b4ef5976139a793a3c38a98811bae6ce0b7cab9`, 30 commits ahead of `main`.
  [Build receipt](https://expo.dev/accounts/roberto_jose17/projects/macro-goal/builds/22e42f09-42a7-40aa-8bfb-18e0e47e3bc0).
- Expo Android production-profile artifact 23.0.1 (28): source
  `bf103da59a54db060d66a8f020a06567d8885014`.
  [Build receipt](https://expo.dev/accounts/roberto_jose17/projects/macro-goal/builds/327d1f2d-b155-46ca-9c6f-3d636696763a).
- `codex/release-23-0-2` points to `f89a6c7f`, 31 commits behind the iOS artifact.
  Its name is not evidence that it is the current release source.
- The candidate base `5a10c5e9` contains iOS 613 plus ten later commits. The remote
  TDEE backup `4b000035` contains that base. Its tree matches local checkpoint
  `1d40acb1`; subsequent local work must not be silently discarded when updating GitHub.

Build success does not prove App Store publication, installation or a signed-in session.
The existing Expo web alias is the old review deployment, not this candidate. No verified
production web URL or OTA path exists in this evidence. The canceled Site is not used.

## Consolidation rules

Preserve the current candidate and port approved changes semantically. Do not reset to
`main`, the named release branch or an old feature snapshot. Do not merge every historic
branch mechanically. Only one active source line is intended; historical branches are not
deleted until incorporation and recovery are verified. No force push or history rewrite.

| Source | Decision |
| --- | --- |
| TDEE accepted goals, onboarding CAS, restart and observation | Preserve current candidate and installed contracts; do not replace with old onboarding files. |
| Onboarding offer `a040313c` | Apply narrow EN/ES copy, explicit purchase and delayed Food/Coach notification changes. Preserve CAS, exact DOB, original request UUID, retry and Step 10. Include actual iOS layout and stale Auth epoch guard. |
| Premium host-screen `fd475b3` | Restore approved tracker while preserving current native refs/types and the new onboarding no-auto-purchase guard. Its backend v23 is already live; no redeployment required. |
| Barcode branch `d1c3ff2` | Do NOT merge the canceled separate source screen. Preserve approved existing-detail flow and port current web-first client/backend changes. |
| Older purchase, contextual paywall, Coach manual and checkpoint preparation branches | Already ancestors of the remote TDEE backup; do not replay them over newer code. |
| Historic food-search branch | Parallel older work, not selected as a replacement for iOS 613/current backend. Preserve current combined search/portion implementation; do not import its preview workflow or old function versions blindly. Retain history until detailed disposition is complete. |

## Function deployment authority

A repository branch and a deployed function are separate facts. Do not deploy all folders.
Use only the reviewed function-specific source and preserve its live authentication behavior.

- **Progress:** live v15, JWT enabled. Forty runtime files in
  `supabase/functions/observed-snapshot-release` match current readback exactly. Two type-only
  files are reconstructed declarations because the retrieved bundle omits their contents.
  `supabase/config.toml` explicitly selects this protected observational entrypoint, not the
  historical central index. `runtime-authority.json` and its tests pin that boundary.
- **Lookup barcode:** live v49. Its canonical function folder now owns its private shared
  dependency closure, isolated from other functions' `_shared` versions. Only reviewed import
  relocation/formatting differs from live source. See `release-candidates/barcode-production/manifest.json`.
- **Vision barcode:** live v82. Two production-bound changes implement independent unknown-web
  idempotent request claims. They are **not live**; deploy and verify that backend change before
  releasing its new web-first client. No provider calls or paid tests were made by consolidation.
- **Premium tracker:** live v23. The five runtime files match current production readback, and
  the verified RPC retains its reviewed hash/service-only privilege boundary. Historical SQL
  documentation is evidence, not a request to reapply it.

These are the functions in this consolidation scope, not certification of every function in
the Supabase project. Other functions must not be overwritten by a bulk deployment.

## Credential hygiene and continuity

A legacy USDA key entry was already present in public `main`. This consolidation removes
that client configuration entry and an unused constant. The current client already uses the
backend for USDA reads; the backend's server-side secret configuration is not changed.
No key values are included here. Rotation/support work was explicitly stopped at the owner's
request. No key was created, replaced, revoked or sent to support. Removal from the current
source does not revoke a key or erase public history.

## Verification boundary

The consolidated maintained gate passed **695/695 tests, zero skips** before the final
metadata/lock review. Absolute application typecheck: **395 roots, one diagnostic**, still
`app/delete-account.tsx:48` using nonexistent `meal_items.user_id`. Account deletion remains
outside the authorized changes and was not altered or suppressed. No new application type
diagnostics were introduced. Final checks must be rerun after any subsequent edits.

Lookup's pinned `deno.json` requests a frozen lock that was not included in source readback.
A dependency check with the real installed Deno 2.9.6 could not load the JSR package manifest;
no successful final Deno verification or reconstructed lock is claimed at this checkpoint.
Do not remove frozen checking or substitute declaration shims to call this passed.

No signed-in native account E2E, installed-candidate recovery, completed clinical validation
or complete source/cascade concurrency matrix exists. The private-core and subscription
rollback evidence remains deliberately narrower. See the TDEE adaptive review package.

## Publication and automatic-action boundary

The default-branch `.eas/workflows/submit-ios.yml` is unchanged and manual-only. The candidate
also contains a manual-only old review deploy workflow; it is not executed or selected here.
The two GitHub Actions files trigger only specifically named older feature branches, not main.
Expo reports GitHub connected and Workflows configured; inspected history is manual. No
source-defined push-to-main build or submit trigger was found. This does not certify every
external service rule; recheck configuration and remote heads before advancing the active line.

Consolidating source is not permission to trigger either manual workflow. Publication must
verify the exact resulting remote tree and preserve recovery before retiring any branch.
