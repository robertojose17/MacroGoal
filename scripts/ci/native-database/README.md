# Native database validation gate

Validation only. This directory is not a migration or deployment package. It never accepts a database URL, remote host, Supabase key, production fixture, or arbitrary test path. Do not put these SQL files in `supabase/migrations`.

## Run in the exact assembled repository

Prerequisites: unprivileged Linux user, Python 3, Node, and PostgreSQL **16** binaries. GitHub `ubuntu-24.04` supplies `/usr/lib/postgresql/16/bin`; otherwise the runner searches PATH and verifies the major version. Missing prerequisites exit **2**, assertion/runtime/cleanup failures exit **nonzero**. `python -O` is rejected.

Native SQL and multi-session suite:

    python3 scripts/ci/native-database/run.py

Native suite plus real local PostgREST HTTP/JWT gate:

    python3 scripts/ci/native-database/run.py --postgrest

The HTTP gate additionally requires Docker and a successful pull of the official version-pinned `postgrest/postgrest:v13.0.7` image. The exact registry digest and image ID are retained, and the resolved image ID is what runs. No floating `latest` tag is used. Future reproductions should verify the recorded digest; the tag is a version pin, not a baked-in immutable digest. Running the HTTP container uses `--network none`, the same unprivileged UID, read-only root, no capabilities, and a bind mount of **only** the ephemeral socket directory. It communicates with PostgreSQL and the test client over Unix sockets. Synthetic signing material is generated only for this run and is not saved in reports.

No `continue-on-error`, `|| true`, missing-tool success, or skipped-test success is appropriate for CI. Upload `scripts/ci/native-database/results/` with `if: always()`. The plain invocation intentionally reports PostgREST `not_run`; its native success is not an HTTP gate pass. To require both in CI, invoke `--postgrest`.

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

`results/native-postgresql.json` is rewritten on each invocation with individual statuses, PG version, observed blocker PIDs, exact security metadata and optional HTTP status/digest. `postgres.log` and optional `postgrest.log` are retained before teardown. A failure is not a pass even if some earlier assertions succeeded.

Preparation host status: native PostgreSQL and Docker unavailable. Syntax, fixture generation and source parity can be checked here; genuine SQL and HTTP outcomes must come from the exact CI commit. A version-pinned local HTTP pass does not close current-live-schema drift, hosted transport configuration, Edge/provider timing, rollout or TestFlight/device gates.
