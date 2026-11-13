# Consistent observation implementation status

Status recorded 2026-11-13. Incomplete release, not proof of native installation or account E2E.

## Installed database change

`schema-review.sql` was independently reviewed and installed as the additive migration `observed_tdee_consistent_snapshot_v1`. SQL SHA-256: `03f7680174b764faf4c441d3aa3116b6bcb39add7712e6dac638128e793668a9`.

Catalog readback confirms `observed_get_tdee_snapshot_v1()` is STABLE, SECURITY INVOKER, with closed search path. EXECUTE is true only for authenticated among the checked authenticated/anon/service_role roles. The existing private context source remains unchanged (MD5 `325bec7c3f742d9b29ea705b5394705a`). The new function definition readback MD5 is `8a16cf042d8b6eed72de336e26f5c14d`.

A real read-only call under authenticated role **without JWT claims** rejects with `42501 authentication_required`. This verifies rejection, not a signed-in user call. Full main SELECT EXPLAIN (without ANALYZE) succeeded before installation. Security advisor results contain no notice naming the new RPC. These checks do not replace authenticated execution or multisesion QA.

## Edge package, deployed as existing Progress v15

`supabase/functions/observed-snapshot-release/functions` is a source package for the **existing** `progress-intelligence` Edge Function. It is not a second deployed service or a test environment. The baseline was read back again as active version 14 with JWT verification enabled.

The package has 42 files. Compared with the 41-file production readback, exactly these differ:

- `observed-program/runtime.ts`: consume the no-argument snapshot RPC instead of independent source reads.
- `observed-program/handler.ts`: validate the envelope, use the server capture time, preserve context-change rejection, no recommendations.
- `observed-program/snapshot.ts`: new strict response parser.
- Both `progress-intelligence/types.ts` and `preview-progress/types.ts`: restore 19 existing type/interface declarations. Production download returned empty files; restoration uses the existing repository declarations, with no runtime statements.

The other 37 files are byte-identical to the current readback. No engine, legacy route, settings mutation, recommendation gate, auth switch or API-key policy changes. RPC failures return unavailable; there is no fallback to inconsistent reads.

Validation: 36/36 local adapter/handler tests pass. Full Deno 2.9.6 check passes using the actual pinned Supabase SDK 2.83.0. Before restoring the two type-only files, baseline and candidate had the same 44 diagnostics; no diagnostics were hidden. Package file-manifest SHA-256: `453f540f2090ba5850e2eaa0eae6fbf063789c69dc390d5db619b85375ff3a4a`.

The first authorized deploy attempt was denied and did not execute. After separate explicit approval of the complete 42-file production package, the retry succeeded as **Progress v15 ACTIVE, verify_jwt=true**. Its compiled package SHA-256 is `b9cf505dc5e9bec0876db4ffdcdb46d54a651e7e89c4a1e314774e341a621da6`. Readback confirms all 40 non-type-only files match the submitted source exactly. The packager strips the two declaration-only files back to empty content; this explains the same behavior in the original v14 readback, rather than a runtime code change.

Real postdeployment HTTP probes: missing session returns 401; presenting the public anon key as a user returns 401 `authentication_required` with the observation-v1 response marker; OPTIONS returns 200. The new RPC also rejects an anonymous REST call with 401/42501 `permission denied`. No authenticated account probe or mutation was made.

## Boundaries still unverified

- A real authenticated owner session and exact account identity have not been established for these probes. Historical SQL claims are not authentication evidence.
- No authenticated RPC happy path or real DTO/context-fingerprint equivalence run.
- No PostgreSQL multi-session committed-interleaving test.
- No installed candidate native app, device lifecycle or offline-recovery E2E.
- No clinical eligibility approval. Estimates remain observational, low-confidence, unverified logging; all recommendation actions remain refused.

No food, weight, profile, target, subscription, settings or receipt data were modified by this work. No new environment, build, TestFlight submission or paid generation was started.

## Consolidated local checks

The maintained combined regression stage now passes 455/455 tests with no skips. Absolute application checking covers 391 root files and still reports one error in `app/delete-account.tsx` (a nonexistent `meal_items.user_id` column). Account-deletion behavior was explicitly kept out of scope and was not changed. The gate is therefore not a full native release pass.

The first staged whitespace check reports extra trailing blank lines in eight verbatim `preview-progress` baseline files. They are preserved byte-for-byte for rollback/provenance, not newly edited runtime logic; no whitespace rule was disabled. Changed handler/runtime/parser and test files have no whitespace diagnostic.

## Remote backup boundary

The separately approved 138-file snapshot of source `04ee76e` is backed up on `codex/tdee-production-recovery-20261112`, remote commit `0fcb95d7660bcce8ea8086e6c7704fba7909d1c6`, exact tree `7a54f78a9e39102e1d8391b2b09800f9c3de3fa3`. It is explicitly WIP, unmerged and not build-ready. After separate explicit approval, all 51 subsequent source/config/test/document files, including this Progress v15 package, were backed up in remote commit `3c9782c702a18a17f74e1ab3746ad4f13fe93b3c`. Its tree `e7ab661931c796b67f3d9fc3bd8edd3940e7233b` was verified identical to local source snapshot `aff8cf6`. This subsequent receipt-only documentation update does not change runtime code. The branch remains unmerged and no GitHub-triggered deployment or build was requested. No GitHub publication is treated as native installation.
