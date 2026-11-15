# Logged macro snapshot projection: installation status

Production migration `extend_observed_snapshot_logged_macros_v1` returned success using the official migration tool. This was a real installation, not a dry run.

## Verified database readback

- Function: `public.observed_get_tdee_snapshot_v1()`.
- Original definition MD5: `a8e6453f42dfcf4bbccb9640534c5130`.
- Installed definition MD5: `978feafb4d1d480f8d93b76ab0737a98`.
- Full definition readback exactly matches the original with only the two documented projection/version-marker substitutions.
- Owner remains `postgres`; SECURITY INVOKER, STABLE, search_path `pg_catalog, pg_temp` unchanged.
- ACL remains `{postgres=X/postgres,authenticated=X/postgres}`.
- No goal, food, weight, eligibility, policy or subscription rows were changed by this migration.
- Guarded inverse source: `macroSnapshotExtensionRollback.sql`; prepared and independently reviewed, NOT executed. It refuses any definition not exactly reconstructible to the pinned original.

## Not established by this installation

Authenticated UI compatibility is being checked separately. This installation does not deploy the new macro-average consumer, activate recommendations, establish nutrient provenance, run the blocked backend suite, or prove positive acceptance/concurrency scenarios. Stored zero values remain ambiguous and the prepared consumer treats them conservatively. Review/recommendation release remains OFF; no TestFlight action.
