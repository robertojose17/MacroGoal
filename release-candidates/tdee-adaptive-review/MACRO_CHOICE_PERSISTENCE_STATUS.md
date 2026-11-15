# Macro preference persistence candidate

Source only: macroChoicePersistenceCandidate.sql and macroChoicePersistenceRollbackTail.sql. The SQL candidate and rollback tail from commit 65d8db1a72f27f7bff4cbf59c590cab7d44a5e1b were executed successfully together in an authorized database transaction, followed by ROLLBACK. They are not installed. The candidate ends in ROLLBACK. This is not a migration filename or deployment authorization.

## Data and API

One append-only private table: macrogoal_snapshot_review_private.macro_choices. Owner and goal foreign keys cascade deletes; role access is denied on the table and RLS is enabled. The candidate includes narrowly scoped authenticated EXECUTE grants on only the three public own-actor wrappers, but those grants existed only inside the rolled-back validation transaction; no new permissions persist.

Functions: private macro_split_valid(jsonb), macro_choice_state(), macro_choice_write(jsonb); narrow public SECURITY DEFINER wrappers tdee_read_macro_choice_v1(), tdee_save_macro_choice_v1(p_request jsonb), tdee_revoke_macro_choice_v1(p_request jsonb). All use closed search paths. Public wrappers verify identity before private access and have no dynamic SQL. This avoids granting schema USAGE or helper EXECUTE on the existing private schema. The actor comes from the existing readiness actor() helper, rejecting anonymous identity, plus an authenticated-role check. There is no p_owner.

Save expects exactly nine fields: requestId, expectedChoiceVersion, goalId, goalUpdatedAt, profileBinding, journeyBinding, copyVersion='macro-choice-v1', mode, splitBps. Modes are smart, preserve_percent, revoked. Preserve-percent requires exactly protein/carbs/fats integer basis points, each 0..10000 and total 10000; no normalization, grams inference or strings. Smart/revoked require explicit JSON null for splitBps.

Locks follow own user then own goal. Granting a choice requires the sole active owned goal's exact updated_at, matching existing readiness profile/journey bindings, and latest choice-version CAS. Bindings are read through existing read_state(), not reimplemented or interpreted as clinical eligibility. Every write adds a new version. The same request ID and exact JSON request replays its original receipt; a different payload is rejected. Replay includes latest stored choice so an old Smart receipt cannot be mistaken for current consent.

Revocation is restrictive: it requires owned goal and latest choice-version CAS but not current nutrition data, active status or fresh granting bindings. It retains the previous stored bindings rather than trusting newly supplied ones. It never returns current=true. If there is no prior choice, revocation fails with macro_choice_missing. No write updates goals, users, policies, purchases or entitlements.

The reader may expose existing choice with bindingStatus=unavailable/current=false if readiness reports source_limit or profile_unavailable. Other errors are not hidden. This preserves a way to revoke without pretending stale context grants permission.

## Lifetime and future loader

This is a preference per goal, not final approval of a new calorie/macro proposal. There is no weekly sourceFingerprint expiry and no clinical reviewed field. Goal revision or relevant profile/journey change invalidates granting applicability until reconfirmed. Safe transfer across a subsequently accepted goal revision is NOT implemented.

A future trusted loader must read latest version, require current=true, verify owner/goal/profile/journey, and separately obtain real nutritional review. It may bind that verified lasting choice to the current snapshot request; it must not pretend the user re-consented weekly. Revocation and version must be rechecked at proposal acceptance. This table alone cannot satisfy macro clinical review or enable recommendations.

Existing custom UI does not save original percentages or Smart choice. No new UI or automatic data backfill is included. copyVersion is an API contract identifier; reviewed localized consent copy and UI submission remain work before use. No diagnoses are collected.

## Review and tests

Rollback tail validation PASSED on November 15, 2026 using a simulated authenticated database request context for the authorized existing Rivera account. This is SQL/role validation, NOT verification of a real signed-in HTTP session. It requires an already verified own-account authenticated context supplied by an approved harness, creates no users/JWTs, checks exact split/type rejection, owner injection, wrong goal, CAS, replay, revocation and unchanged goals, then rolls back. Other-session races, anonymous context, deleted-account cascades and API ACL remain explicit additional tests. No claim of compilation or successful execution.

Relevant primary guidance consulted: https://supabase.com/docs/guides/database/functions and https://www.postgresql.org/docs/current/sql-createfunction.html. Changelog checked; no SDK/CLI upgrade is part of this candidate.

## Verified rollback result

The Supabase migration tool returned success after executing CREATE statements and all tail assertions. Subsequent independent readback found zero candidate tables and zero candidate functions. Before/after hashes of the complete own profile and goal rows matched exactly, and the policy table remained empty. No candidate consent rows, goals, limits, or release state were left changed. A technical migration history entry may exist; this is not an installed application migration.

Covered assertions: exact split save/read, type and sum rejection, request ID replay/conflict, version CAS, owner-field injection, missing/foreign-ID goal rejection (not an existing other user's goal), restrictive revocation with stale supplied bindings, replay after revocation cannot reactivate, direct-table/helper denial, and public RPC privilege checks. Actual anonymous requests, another existing owner's records, concurrency, cascades, API transport and UI remain unverified. Do not generalize this result to those cases or to overall TDEE readiness. The separate blocked backend test runner was not retried.

A second authorized rollback transaction also passed SQL-context denial checks for missing subject, anonymous identity, anon role and service_role. This still does not prove HTTP/JWT validation. Readback again found no candidate table/RPC and unchanged goal hash. The full profile hash differed between these later observations; neither validation SQL writes public.users, but concurrent activity was not diagnosed, so this second run must not be described as an identical-profile restoration. No profile was overwritten to force a match.
