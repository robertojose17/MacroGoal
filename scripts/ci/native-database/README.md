# Native database validation gate

Validation only. This directory is not a migration or deployment package. It never accepts a database URL, remote host, Supabase key, production fixture, or arbitrary test path. Do not put these SQL files in `supabase/migrations`.

## Run in the exact assembled repository

Prerequisites: unprivileged Linux user, Python 3 and Node. The default lane uses PostgreSQL **16** binaries. GitHub `ubuntu-24.04` supplies `/usr/lib/postgresql/16/bin`; otherwise the runner searches PATH and verifies the major version. Missing prerequisites exit **2**, assertion/runtime/cleanup failures exit **nonzero**. `python -O` is rejected.

Native SQL and multi-session suite:

    python3 scripts/ci/native-database/run.py

Native suite plus real local PostgREST HTTP/JWT gate:

    python3 scripts/ci/native-database/run.py --postgrest

The HTTP gate additionally requires Docker on the local `/var/run/docker.sock` and a successful pull of the official version-pinned `postgrest/postgrest:v13.0.7` image. The exact registry digest and image ID are retained, and the resolved image ID is what runs. No floating `latest` tag is used. Future reproductions should verify the recorded digest; the tag is a version pin, not a baked-in immutable digest. Running the HTTP container uses `--network none`, the same unprivileged UID, read-only root, no capabilities, and a bind mount of **only** the ephemeral socket directory. It communicates with PostgreSQL and the test client over Unix sockets. Synthetic signing material is generated only for this run and is not saved in reports.

No `continue-on-error`, `|| true`, missing-tool success, or skipped-test success is appropriate for CI. Upload `scripts/ci/native-database/results/` with `if: always()`. The plain invocation intentionally reports PostgREST `not_run`; its native success is not an HTTP gate pass. To require both in CI, invoke `--postgrest`.

## Exact production PostgreSQL minor-version lane

    python3 scripts/ci/native-database/run.py --postgrest --postgres17-container

This separate lane needs Docker, Python 3 and Node on the runner; it does not require host PostgreSQL or install packages. It explicitly pulls the official `postgres:17.6-bookworm` image, records its resolved image ID and registry digest, and executes that immutable local image ID. Both binary `postgres --version` and native `SHOW server_version_num` must identify **17.6 / 170006**. There is no fallback to a newer 17.x or to PG16. A missing old tag, incompatible image/platform, version mismatch, Docker failure, timeout or cleanup uncertainty fails the gate. Runtime CI evidence, not this source file or a registry tag name, establishes exact minor parity.

The PostgreSQL container runs as the same unprivileged UID/GID as the CI user, with no capabilities, no-new-privileges, a read-only root, and `--network none`. No ports are published. Only the fresh private test directory is bind-mounted, plus generated passwd/group files mounted read-only so `initdb` can resolve that UID as `postgres`. `getent passwd` is checked before initialization. The unused image data volume is overlaid with a small temporary filesystem. The test's actual cluster lives only in the newly generated directory. Fixed wrappers execute the four PostgreSQL tools through the local Docker socket and forward only the synthetic PGAPPNAME used to observe lock waits. The Docker socket is not mounted inside either container.

PostgREST is a separate network-disabled container and receives only the test socket directory. The PostgreSQL container is reconciled and removed even after an uncertain start. Its exact generated name is never reused for another start attempt. All fixtures, databases, users, JWT signing material and test rows are ephemeral. This is vanilla official PostgreSQL 17.6, not proof of the hosted Supabase PostgreSQL build, extensions, settings or gateway.

## Separate authenticated-writer policy fixture

Both lanes now create an additional `authenticated_writer_fixture` database after the unchanged restricted-fixture tests. The frozen base fixture and all candidate SQL stay byte-identical. A separate `sql/authenticated-policy.sql` models the **observed 2026-11-07** public.food_items shape: RLS enabled but not forced; authenticated INSERT WITH CHECK true; authenticated UPDATE USING/WITH CHECK true; authenticated and PUBLIC SELECT true. Only the necessary anon SELECT and authenticated SELECT/INSERT/UPDATE grants are added to this new database. It intentionally does not recreate or exercise inherited DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants and is not a production ACL replacement.

New assertions cover:

- Legitimate unverified authenticated INSERT and nutrition UPDATE succeed and produce the expected audit revisions.
- INSERT and UPDATE attempts for each of verified, ai_verified, ai_verified_source, ai_verified_at and last_verified_at fail at `verification_metadata_server_only`, not the table ACL.
- Changes to nutrition protected by verified, ai_verified, barcode-recovery metadata, or private confirmation alone fail at `confirmed_nutrition_protected`.
- Equivalent canonical-barcode INSERT and UPDATE fail at `canonical_package_identity_reserved` and preserve all reservations.
- Forged JWT GUC role/claims cannot grant service RPC access, private write context access, verified metadata or protected nutrition edits.
- Two real authenticated-versus-service direct-INSERT alias races, with each role winning once, require a server-observed lock wait and loser SQLSTATE 23505. The final complete canonical/private state must equal the winner transaction's state.
- A third observed alias race runs the real service create RPC against an authenticated direct INSERT, preserving the sole food, binding, evidence and replayable receipt.
- With `--postgrest`, real locally signed authenticated POST/PATCH succeed for unverified rows and fail at the expected guard/identity error for forbidden writes. Public reads work under the observed SELECT policy. Service-only RPCs and both private contexts remain HTTP-denied.

Denied writes compare every canonical row and all current revisions, audit, evidence, contexts, receipts, bindings and identity reservations, including timestamps. Reports retain a hash of the unchanged complete state. The earlier restricted fixture's HTTP table denial is retained and remains evidence only for that restrictive fixture, **not production table behavior**.

## Exact source linkage

Before starting the cluster, the runner checks `frozen-inputs.json` and requires byte equality with these **actual checked-out release sources**:

- `release-candidates/food-catalog/sql/01-nutrition/enrichment.CANDIDATE.sql`
- `release-candidates/food-catalog/sql/02-off-registry/off-mass.CANDIDATE.sql`
- `release-candidates/food-catalog/sql/03-search/search-snapshots.CANDIDATE.sql`
- `supabase/functions/_shared/nutritionProvider.mjs`
- `supabase/functions/_shared/offMass.mjs`

Missing or changed targets fail. The public CI invocation has no bypass. The local copies make this harness's inputs reviewable, not an excuse to test a stale source version. When approved sources change, review and update the copies and their manifest together, then rerun all tests. `sql/fixture.sql` is the hash-pinned minimal synthetic fixture from the frozen composition, not a dump of the live database.

## Isolation and exact installation order

The runner clears inherited PG/PGRST/Supabase and Docker transport overrides and forces Docker to the local `/var/run/docker.sock`, creates its own random `0700` temporary directory, starts `initdb`, and disables PostgreSQL TCP listeners. It always connects to that new socket with explicit database/user/port arguments and `psql -X`, `ON_ERROR_STOP=1`, verbose SQLSTATE diagnostics and time budgets. Every assertion uses native PostgreSQL, never PGlite.

The fixture installs the captured nutrition guard, audit, snapshot and evidence interface with source-shaped columns. It contains no importer body, discovery-selection fixture, hosted credentials, real users, diary records or provider requests. Synthetic historical UPC12/EAN13 duplicates are seeded **before** registry installation. The exact additive files then execute in nutrition → OFF registry → search order.

This minimal fixture intentionally excludes unrelated application tables, policies, constraints and infrastructure. Passing proves these candidates under the stated fixture and role model, not compatibility with unknown live drift. The installed baseline record-evidence function is inherited fixture material; new RPC and private authority permissions receive the exhaustive assertions.

## Genuine concurrency coverage

All nine original registry scenario groups use distinct persistent psql sessions and overlapping transactions. The harness records server-observed `pg_stat_activity` lock waits and nonempty `pg_blocking_pids`, rather than relying on sleeps or two sequential calls.

1. Equivalent UPC12/EAN13 create calls yield one created result, one existing result, one canonical food, binding and evidence.
2. Identical request retries yield equal receipts and exactly one write.
3. Same request with different payload waits and fails SQLSTATE 22023 without extra writes.
4. Direct service-role equivalent inserts wait and loser fails 23505.
5. Stale repeatable-read transactions fail 40001 after concurrent creation **and** after modification of an existing reservation.
6. An aborted reservation releases the contender and leaves no abandoned food/current/audit.
7. Historical-duplicate correction and an ordinary update overlap on the same row, serialize, and preserve immutable membership and ambiguity.
8. Competing barcode changes serialize and fail the loser with 23505, preserving prior reservations.
9. A multirow equivalent insert waits for a separate transaction to abort, then conflicts with its own second row and rolls back every row/audit/reservation.

Additional native tests cover simultaneous nutrition claims, finalization replay, correction versus stale refresh, a correction versus an importer-shaped write using the existing transaction-context protocol, late audit failure rollback, and search MVCC coherence while correction is uncommitted. The importer-shaped test does **not** execute or validate the actual importer implementation.

## Security and rollback assertions

- Exact owner `postgres`, SECURITY DEFINER/INVOKER flags, empty `search_path`, and exact function ACL grantees for all 23 candidate functions.
- All six new authority tables have forced RLS, no policies and zero direct app-role privileges (including service_role).
- Public/anon/authenticated EXECUTE denied except the intentionally granted canonical-GTIN helper, which remains in an unexposed schema without client schema usage.
- No application role is a member of postgres; expected bypass/login capabilities, trigger ordering, `ENABLE ALWAYS` identity trigger, and original audit/snapshot hashes are checked.
- Native anonymous/authenticated calls, JWT-GUC spoof attempts and direct capability access fail with exact SQLSTATE 42501.
- Separate ephemeral databases prove nutrition definition drift, registry definition/owner drift and untrusted search installation fail with no partial objects.
- Rollback rehearsal tests fail-closed predecessor drift and transactional revocation of the five new RPCs. The transaction abort restores exact definitions/ACLs and retains canonical rows, evidence, audit and reservations. It deliberately does **not** run the old unguarded nutrition guard-restoration file after the registry extension.

The optional HTTP gate tests signed service-role success, all five RPC denials for no token/anon/authenticated, invalid-signature denial, private schema exclusion, exact creation receipt replay and service snapshot reads using real PostgREST. It does not stand in for a hosted Supabase gateway, production JWT keys, Edge scheduler, whole-request latency, or installed-device checks.

## Evidence and limits

`results/native-postgresql.json` is rewritten on each invocation with individual statuses, PG version, observed blocker PIDs, exact security metadata and optional HTTP status/digest. `postgres.log` and optional `postgrest.log` / `postgrest-authenticated.log` are retained before teardown. A failure is not a pass even if some earlier assertions succeeded.

Preparation host status: native PostgreSQL and Docker unavailable. New container and authenticated-writer paths are not claimed executed here. Syntax, fixture generation and source parity can be checked here; genuine SQL and HTTP outcomes must come from the exact CI commit. A version-pinned local HTTP pass does not close current-live-schema drift, hosted transport configuration, Edge/provider timing, rollout or TestFlight/device gates.
