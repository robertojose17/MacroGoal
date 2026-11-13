# Read-only enriched source candidate (2026-11-13)

Not installed, not callable publicly, no live entrypoint or numerical policy changed.

Catalog-only verification of the live observation RPC and information_schema confirmed:
- `users.id`, `updated_at`, `sex`, `date_of_birth`, `current_weight` exist.
- `goals.user_id`, `updated_at`, `goal_type`, `is_active`, `target_weight` exist.
- Neither `macrogoal_adaptive_private` nor `macrogoal_source_barrier_private` returned columns in this inspection. Candidate registry/barrier are not installed.
- Observation RPC is STABLE invoker, actor-scoped and materializes its source rows in one query. It hashes profile/goal CAS but does not expose those CAS values.

`enrichedSourceCandidate.sql` composes that existing STABLE RPC with profile CAS/sex/DOB and full active goal in one STABLE statement snapshot. It retains the exact goal row for later acceptance CAS comparison. The SQL adds no data writes, grants, source triggers or public wrapper. This is a deployment candidate, not executed SQL. Revoke statements and CREATE are not evidence of installation.

`sourceReader.ts` reuses the deployed observation parser, authenticates actor for existing read-only RPC, and supplies a strict private enriched parser. It does not supply a no-op producer dependency or pretend a DraftContext is available. Enriched records remain explicitly unverified, not prescriptions. Full goal targets must match the nested observation. Raw target_weight is not normalized because its unit contract was not established by schema alone; profile current_weight is not substituted for latest reconciled check-in/tracker evidence.

Still genuinely absent: serialized source epoch/revision (all writer matrix not verified), explicit complete-day records and digest, reviewed numerical/model policy, current eligibility record, accepted baseline anchor and validated receipts. Adding profile/meta fields does not supply these. No fields are promoted to verified or seeded. A future reviewed producer can consume these coherent raw fields after those gates exist.

Verification: focused TypeScript compilation and unit/static-invariant tests only. SQL has not been parsed/executed by PostgreSQL; no MVCC concurrency or live account E2E claim. Catalog reads accessed no customer rows. No policy or clinical claim changed.

Read-only production EXPLAIN (without ANALYZE), using NULL actor, successfully planned the enriched CTE/column expressions on 2026-11-13. This validates those live SQL references without executing sources or reading account rows. It does not compile/install the PL/pgSQL wrapper or prove concurrency.
