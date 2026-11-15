# Phase A: verified result, 2026-11-15

## Applied and verified
- Official production migration `install_logged_nutrition_evidence_closed_phase_a` returned success.
- Readback at 21:22 UTC confirmed nullable UUID revision without default, one enabled revision trigger, private RLS, and zero evidence events.
- Authenticated, anon and service_role writer execution denied; authenticated reader and direct table read denied. No consumer projection or recommendation activation.
- Snapshot definition MD5 remains `978feafb4d1d480f8d93b76ab0737a98`.
- Existing log_food definition MD5 remains `3e57a70c31fbcdcf95f081669a17e71a`, with original postgres/authenticated/service_role ACL.

## Executed partial QA
The reviewed owner-only DML harness executed without errors and ended ROLLBACK. Its assertions cover revision assignment, explicit-zero declaration, nested STABLE readback, replay, payload mismatch, stale revision, portion mismatch, duplicate fields, revocation and non-resurrection, nutrient edit invalidation, metadata-only preservation, invalid undeclared nutrient rejection, missing/anonymous claims, and denied authenticated RPC execution.

Separate before/after own-account hashes and counts of meals, items including revisions, and evidence matched exactly. No fixture or evidence event remained. No other account was used. This used explicitly synthetic own-user claims under the administrative executor, NOT real JWT authentication, positive authenticated permission, PostgREST or app E2E.

The frozen installation and harness files retain their original PREPARED comments to preserve the exact reviewed/executed inputs; this result records their subsequent execution. Quarantine has NOT been executed. The synthetic fixture owner was supplied only at execution, not committed into source.

## Separate pure code check
12/12 weight-instant-ordering tests passed on Node 24.22.1 against exact files from commit095cb718, without installations or database calls. This was module verification, not application E2E or full typechecking.

## Not complete
Concurrent-session behavior, positive real authenticated access, actual client writer integration, snapshot evidence projection/performance and recommendation acceptance E2E remain unverified. Do not open RPCs or activate recommendations based solely on this result. Phase A changes revision rotation for new/edited items but does not backfill historical nutrient provenance.

## Reviewed artifacts
- Install SHA256: edb1d51e2f2a1b6feae6021d2146029df757137ab378f93e4699a76b2a62da37
- Quarantine SHA256: c50ebafd610424c309ed442b9afe466b587a7c78858bfb073d82b62b3eabead1
- Owner QA SHA256: 69babefee89317495d5444eaefd5a5053ad88c4aeeb5a24029e34e090fe63241

Local lock/statement/transaction timeouts were250ms/2s/3s. Tool wall time is not SQL transaction duration. No claim of zero transient lock impact is made.
