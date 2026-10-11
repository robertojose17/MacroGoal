# Community privacy global release

This directory supersedes the earlier pair-only rollout scripts. It is not an automatically applied migration. Do not run the older pair scripts after the global cutover.

## Release order

1. Keep both client feature flags false while saving the fail-closed client and server sources.
2. Export and verify current code for the seven legacy Community routes. Deploy the reviewed strict profile handler at the existing `social-profile` route and replace the other six legacy routes with their fixed update-required responses. The client protected-route binding must also use `social-profile`. This reuses the existing function slot. Keep existing gateway settings. Verify deployed source hashes before asserting Edge readiness.
3. Apply the reviewed global SQL once, in one transaction, against its exact original baseline. Only after approval and actual Edge verification may the release wrapper set `macrogoal.global_activation_approved=true` and `macrogoal.global_legacy_cutover_verified=true` immediately after BEGIN. The candidate intentionally does not self-attest.
4. Require the SQL metadata postflight to pass. Use `50-postflight.READONLY.sql` to repeat it. A guard failure is a stop, not permission to remove the guard.
5. Set `COMMUNITY_PRIVACY_V2_ENABLED=true`; leave `COMMUNITY_PRIVACY_PAIR_PILOT_OPT_IN=false`. Verify the normal app before publishing its build.

## Privacy behavior

All full profiles require directional acceptance. Existing follows grant no automatic acceptance. Discovery exposes only the approved minimal identity. Accepted viewers can access approved calorie/macro history, while raw weight history and check-in galleries remain owner-only. Voluntary posts retain their own audience. Both block stores revoke both directions.

The strict v2 profile handler replaces the legacy contract at `social-profile`; old request shapes fail closed. The other six old routes are `social-follows`, `social-feed`, `social-search-users`, `social-user-stats`, `social-connections`, and `social-post-actions`. They return HTTP410 `app_update_required` when their existing platform gateway permits the request to reach the handler. Old Community screens can fail until a compatible build is installed. This does not force an installed app to upgrade.

Native clients without an Origin header are supported. The supplied Edge configuration rejects browser Origin requests. No bucket configuration is changed. Avatar access relies on the existing exact SQL-approved target avatar URL as well as the HTTP allowlist.

## Recovery

The approved fail-closed rollback sets CLOSED and revokes the twelve profile/follow APIs. It preserves restrictive RLS, the safe interaction RPCs, real activity and nine relationship safeguards. It does not restore broad legacy readers or erase relationships.

The safeguards reject TRUNCATE on `blocked_users`, `community_blocks`, and `social_follows`, including ordinary administrative TRUNCATE. Normal authorized row operations remain available. Any future maintenance must preserve authorization revocation; do not disable these safeguards casually.

## Verification limits

Prepared SQL passed 19 isolated integration checks, 25 focused API checks and 8 helper-preservation regressions; the exact candidate is SHA256 fd838360aa637de05b20f0e81f7f4ff1c4519773afb0e9ccc6e15f6944404897. These used PGlite PostgreSQL18.3 with synthetic data, rather than hosted PostgreSQL17.6 or independent-session concurrency. The retirement files passed strict Deno checks and 84 runtime assertions. The new profile handler passed actual-bundle Deno and separately scoped binding/privacy checks. Client eligibility checks cover unavailable, closed and incompatible rollout responses. These local results do not replace deployed source verification, live JWT/PostgREST checks or normal native-app QA.

This change does not certify every unrelated RPC, Storage policy, external integration or already downloaded data.

The corrected cutover preserves the installed helper definition exactly after the unchanged baseline fingerprint passes. It compares its OID, owner, body and full definition before and after granting authenticated execution. A duplicated literal-body assumption from the first attempted script was removed; the helper itself, security/configuration checks and ACL checks are unchanged.
