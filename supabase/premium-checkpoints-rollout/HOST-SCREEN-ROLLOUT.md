# Go Premium host-screen attribution — prepared 2026-11-11

Status: **backend deployed and verified on 2026-11-11; client not published**. RPC migration `20261111202019_premium_checkpoint_host_screen_v1` is applied and `track-onboarding` v23 is ACTIVE. No store build, OTA update, TestFlight submission or synthetic production event was performed. Existing installed clients still do not send host screen. See `HOST-SCREEN-DEPLOYED.md` for exact postflight evidence.

## Behavior

The floating Go Premium control records `source: floating_badge` plus optional `flow.screen`. New badge flows contain one of `home`, `dashboard`, `check_ins`, `profile` or `unknown`. Navigation aliases are normalized locally. Query strings, fragments, dynamic path segments, identifiers, free text and full URLs are never included in the event. Unrecognized routes become `unknown`; they are not guessed from a prefix.

The screen is pinned to the original immutable flow. It accompanies the inline impression, entry click, displayed offer, purchase attempt/result and restore attempt/result. The subscription route carries only the closed `originScreen` label. Changing the host tab remounts the observer synchronously with a new flow, so a persistent badge cannot reuse the previous tab's origin. Returning from a consumed paywall generates a new flow on focus.

Other entrypoints keep their existing source behavior. Historical/old-client events without `screen` are accepted unchanged and remain eligible for exact transaction attribution. Their screen is `null`/`not_recorded`, never backfilled from neighboring events. New unrecognized screens use the explicit `unknown` label.

The read-only report retains `by_source` totals and adds `by_entry_screen`, with labels such as `Go Premium / home`. Source/screen disagreement within an otherwise matching claim is ambiguous. A missing attempt stays unattributed, not ambiguous. Production and sandbox remain separate. No payment, entitlement or provider webhook logic changes.

## Rollout order (backend steps completed; client pending)

1. Before any further update, re-read the current private RPC and shared `track-onboarding` bundle. The RPC snapshot reviewed on 2026-11-11 has MD5 `fd6c09bfb2d88257e82b3924e74393ed`. The active receiver reported version 22 with bundle SHA-256 `6565a4b0d92c94bad6f919e1f3351355eb031213a7fd52d6aab6089f9322f53e`. Older DEPLOYED/RELEASE-PREP version numbers are historical; compare the actual live state, not only those documents.
2. Apply the separately reviewed `40-host-screen.CANDIDATE.sql`. Its preflight refuses an unexpected RPC definition. It changes only permitted flow keys, closed screen validation and within-flow source/screen consistency. It preserves the existing function identity, owner, ACL, SECURITY DEFINER boundary, empty search path, retention, rate limit, table and payload. No schema/table grants or backfill are needed. Record it as a normal migration through the current supported deployment workflow.
3. Deploy the shared receiver from `track-onboarding/index.ts` with `router.ts`, `legacy.ts`, `checkpoint.ts` and the updated `edge/protocol.ts`. Do not deploy the divergent canonical `supabase/functions/track-onboarding/index.ts`. Preserve legacy behavior, authentication and all existing route protections. Compare unchanged bundle modules before publication.
4. Verify deployment identity, closed protocol, ACL and backward compatibility. Do not inject synthetic authenticated production events or purchases. Upgrade the read-only owner reporting query.
5. Only after **both** backend validators accept the optional screen may the client containing this change be released via the owner-authorized app release process. Ask before any TestFlight action. No native version/build counter was changed here. Backend changes alone cannot make existing installed clients send screen.
6. On the released client, verify a genuine consenting user's Go Premium interaction from two allowed tabs. Inspect aggregate labels and same-flow consistency without returning user/transaction IDs. Validate paid attribution only against an actual intended purchase.

Rollback: stop or revert client emission first. Keep the backwards-compatible backend readers accepting historical screen values; rolling the receiver back while new clients are active would drop their telemetry. Do not remove or rewrite recorded events.

## Tests

- `node --test tests/premium-checkpoints.test.cjs tests/premium-checkpoint-routing.test.cjs`
- `PGLITE_MODULE=<installed @electric-sql/pglite/dist/index.js> node --test tests/premium-host-screen.database.check.mjs`
- With locked test tooling installed: `node scripts/ci/run-stage.cjs premium-screen-database`.
- Repository lint, application typecheck, CI regressions and purchase regressions are also required before release.

The SQL suite uses an isolated in-memory PostgreSQL WASM database (PGlite 0.5.8), a snapshot of the actual prior RPC, the complete candidate SQL and the real owner report. It covers closed fields, legacy payloads, duplicates, conflict handling, protected function/table metadata, exact payment joins, source/screen splits, sandbox separation, contradictory screens, missing attempts and the deployment drift guard. It creates synthetic fixture users only in that in-memory database, never in Supabase.

No new dependency or authentication data is needed. No native runtime/visual acceptance or production screen capture is claimed by local tests.

## Earlier integrated-checkout validation result (historical)

- 33 tracker/routing/SQL tests passed, including the actual replacement RPC and owner query in PGlite 0.5.8.
- 38 existing purchase/subscription tests passed.
- Focused checkpoint TypeScript passed. Full application check reports 202 diagnostics, identical to the current baseline report (0 introduced). This is not a full application typecheck pass.
- Full repository ESLint completed with 0 errors and 72 warnings. The stage wrapper could not initialize pnpm's home directory, so the equivalent installed ESLint binary was run directly. Focused lint has 0 errors and the existing subscription effect warning.
- Broad CI regressions: 528 passed, 4 failed. All four failures are in the unchanged Coach conversation controls and reproduce on the baseline without this change. They are not waived as an overall release pass.
- Independent source review found no remaining host-screen blockers after the missing-attempt SQL parity correction. Native visual/device acceptance and client distribution remain pending. Backend deployment is verified separately.
