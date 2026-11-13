# Host-screen backend deployment — 2026-11-11

> Historical 2026-11-11 record. Preserved for provenance, not a separate current release line or an instruction to deploy. See `HOST-SCREEN-CONSOLIDATION.md` for the single production candidate and fresh checks.

Backend complete; client release remains pending. This does not mean installed apps are already emitting screen.

- Existing project: esgptfiofoaeguslgvcq.
- RPC migration: `20261111202019_premium_checkpoint_host_screen_v1`, applied 2026-11-11 20:20:19 UTC through Supabase migration tooling.
- RPC definition before MD5: `fd6c09bfb2d88257e82b3924e74393ed`; after: `30d17e0619ab9a7d86bc25c4bc78b9ab`. Returned live definition byte-matched the applied function source.
- Function OID 179318, postgres owner, SECURITY DEFINER, empty search_path and `{postgres=X/postgres,service_role=X/postgres}` ACL preserved. Ordinary anon/authenticated execution remains denied. Private table still has forced RLS. No grants, policies, billing, entitlement or webhook changed.
- Shared receiver: `track-onboarding`, v22 → **v23 ACTIVE** at 2026-11-11 20:20:42.742 UTC. `verify_jwt=false` preserved because the legacy root is pre-auth and the private handler independently verifies JWT with getUser before RPC.
- Published bundle SHA-256: `e84b205132b355b774c49a27b92abb0257e28e6453f9ffa4feb0401de2cd5a0d`.
- All 5 returned files byte-matched the reviewed deployment input. Four live modules (`index.ts`, `legacy.ts`, `router.ts`, `checkpoint.ts`) were preserved byte-for-byte; only `edge/protocol.ts` changed. Function count stayed 100; all other function versions stayed unchanged.
- Preflight source review found only one nonfunctional drift between the previous live protocol and repository baseline: an ESLint suppression comment. No legacy behavior was replaced.

## Verification

- Fresh local protocol/routing run: 27 passed. Earlier isolated SQL/flow suite: 33 passed against the actual candidate; purchase/subscription suite: 38 passed.
- Live unauthenticated POST to private path: 401 unauthorized.
- Live GET to private path: 405 method_not_allowed.
- Live OPTIONS to private path: 204.
- Live OPTIONS to legacy root: 200 ok.
- Live GET to private suffixed path: 404 not_found.
- Security advisors before/after: no new or removed notices. Existing private-table “RLS enabled without policy” info remains intentional because ordinary clients have no access and ingestion uses the protected service boundary.
- Updated read-only report ran against live data. The two production purchases from 10–11 November still attribute correctly, with 0 unattributed/ambiguous/conflicting payments. Their host screen remains null/not_recorded. The separate sandbox purchase remains separate.
- Checkpoint rows before and after: 1,804; screen-bearing rows: 0; observed actors: 122. No synthetic event, authenticated probe, new account, purchase or historical backfill was performed.

## Backups and remaining work

Exact RPC metadata/definition and all previous receiver files were saved before changes in `premium_screen_tracking/deployment-20261111/` in the execution workspace, alongside after-deployment source, postflight metadata, HTTP results and the aggregate owner report. The repository also retains the original RPC fixture and source history.

At the backend rollout checkpoint the client was unpublished. The later narrow GitHub candidate is documented in `HOST-SCREEN-CLIENT-CANDIDATE.md`. No installed-client rollout or authenticated in-app acceptance is established by this backend report. Verify genuine permitted app interactions from two tabs after client distribution; do not invent payment events.
