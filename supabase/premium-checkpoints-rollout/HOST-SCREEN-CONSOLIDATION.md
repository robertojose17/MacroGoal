# Host-screen tracker: single production candidate, 2026-11-13

The approved tracker change from `fd475b3177c8ea7ffdb9ae80c35f56cee0c27c16` is now consolidated locally into the **one production candidate** based on `29e27dd`. This is source integration, not a new branch, installed-client update, release certification or deployment. The 2026-11-11 records are retained for provenance only; they do not define additional current release lines.

## Scope and preservation

The five runtime paths are `utils/premiumCheckpointContract.ts`, `utils/premiumCheckpointRuntime.ts`, `components/GoPremiumFloatingBadge.tsx`, `components/PremiumCheckpointInline.tsx` and `app/subscription.tsx`. The first four match the approved tracker commit exactly. The subscription integration adds only `originScreen` to route capture and `capturePremiumFlow`; the existing production-candidate differences remain intact:

- Native measurement uses `PremiumMeasurable` and `getNativeScrollRef()`; it never casts a ScrollView wrapper into a measurable host.
- The subscription icon names retain their actual component-prop types.
- `source === 'onboarding_complete'` prevents even a stale `autoStart=true` route from opening the purchase sheet. Explicit subscribe still invokes the selected package. This tracker port does not restore the canceled onboarding completion UI or edit `app/onboarding/complete.tsx`.
- TDEE, authentication, nutrition, barcode, notifications, SDK identity, purchase/restore locks and entitlements are not changed by the tracker integration.

Supporting restored paths are the closed backend protocol, read-only owner report, pure reconciliation helper, tracker tests, and the historical SQL/deployment documentation and fixtures. The historical SQL file is **already applied** and deliberately rejects reapplication; it is not placed in the automatic migrations directory. No database fixture was executed in this consolidation.

## Recorded data

A Go Premium interaction retains `source: floating_badge` and a closed screen label: `home`, `dashboard`, `check_ins`, `profile` or `unknown`. The normalizer never stores raw paths, query strings, fragments, user IDs or free text. Changing tabs remounts the immutable flow; returning after a consumed paywall starts a new flow with the same normalized screen. The original screen follows impressions, clicks, displayed offers, attempts and SDK observations through `originScreen` route capture.

Old events without screen remain valid and keep `null` / `not_recorded`. Missing attempts remain unattributed; contradictory screen claims become ambiguous. Exact actor/product/transaction reconciliation is retained. SDK outcomes and restore operations are not reclassified as verified purchases. There is no historical backfill or fabricated event.

## Fresh backend verification, read-only

The existing Supabase project still serves `track-onboarding` **v23 ACTIVE**, bundle SHA-256 `e84b205132b355b774c49a27b92abb0257e28e6453f9ffa4feb0401de2cd5a0d`. Its five returned source files match this candidate byte for byte: `track-onboarding/index.ts`, `legacy.ts`, `router.ts`, `checkpoint.ts`, and `edge/protocol.ts`. Existing gateway `verify_jwt=false` remains unchanged; the private handler independently verifies the authenticated user.

Catalog-only inspection of `public.record_private_checkpoint_v1(uuid,jsonb)` returned OID 179318, definition MD5 `30d17e0619ab9a7d86bc25c4bc78b9ab`, postgres ownership, SECURITY DEFINER, empty search path and `{postgres=X/postgres,service_role=X/postgres}` ACL. Execution is false for anon and authenticated, true for service_role. These match the previously applied screen-compatible RPC. No row data, events, auth state, schema or function was changed or activated. **The tracker requires no new backend deployment.**

## Fresh local verification

- `node --test tests/premium-checkpoints.test.cjs tests/premium-checkpoint-routing.test.cjs tests/purchase-reliability.test.cjs tests/sync-subscription.test.cjs tests/sdk-ui-recovery.test.cjs`: **74 passed, 0 failed, 0 skipped**. Includes privacy normalization, historical flow compatibility, tab/return lifecycle, screen reconciliation, native host refs, and the new executable regression proving onboarding autoStart cannot purchase.
- Focused strict TypeScript for contract/runtime/backend protocol/reconciliation: **passed**, using the installed compiler with `--noEmit --strict --skipLibCheck --target es2022 --module commonjs --moduleResolution node`.
- Focused ESLint across the five runtime paths, protocol, reconciliation and tracker tests: **0 errors, 1 existing warning** in the subscription initialization effect dependency.
- Full application/aggregate gates belong to the combined production candidate and must be rerun after all concurrent work is frozen. Focused checks are not a full release pass.

No staging, commit, push, live event injection, database test environment, Site update, Expo export/build, OTA, store submission or TestFlight action was performed by this consolidation. Native/device acceptance and distribution remain pending. Backend availability alone does not establish that installed clients are emitting screen labels. Verify genuine authorized interactions after the actual client reaches the selected app, and validate payment attribution only against an intended real purchase.
