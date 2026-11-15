# Macro preference persistence candidate

Source only: macroChoicePersistenceCandidate.sql and macroChoicePersistenceRollbackTail.sql. The SQL candidate and rollback tail from commit 65d8db1a72f27f7bff4cbf59c590cab7d44a5e1b were executed successfully together in an authorized database transaction, followed by ROLLBACK. After that validation, the owner explicitly authorized installation; the storage and six functions are now installed. The candidate ends in ROLLBACK. This is not a migration filename or deployment authorization.

## Data and API

One append-only private table: macrogoal_snapshot_review_private.macro_choices. Owner and goal foreign keys cascade deletes; role access is denied on the table and RLS is enabled. The candidate includes narrowly scoped authenticated EXECUTE grants on only the three public own-actor wrappers, and the owner-authorized installation now grants authenticated EXECUTE on those three public wrappers only. There are no direct table/helper grants.

Functions: private macro_split_valid(jsonb), macro_choice_state(), macro_choice_write(jsonb); narrow public SECURITY DEFINER wrappers tdee_read_macro_choice_v1(), tdee_save_macro_choice_v1(p_request jsonb), tdee_revoke_macro_choice_v1(p_request jsonb). All use closed search paths. Public wrappers verify identity before private access and have no dynamic SQL. This avoids granting schema USAGE or helper EXECUTE on the existing private schema. The actor comes from the existing readiness actor() helper, rejecting anonymous identity, plus an authenticated-role check. There is no p_owner.

Save expects exactly nine fields: requestId, expectedChoiceVersion, goalId, goalUpdatedAt, profileBinding, journeyBinding, copyVersion='macro-choice-v1', mode, splitBps. Modes are smart, preserve_percent, revoked. Preserve-percent requires exactly protein/carbs/fats integer basis points, each 0..10000 and total 10000; no normalization, grams inference or strings. Smart/revoked require explicit JSON null for splitBps.

Locks follow own user then own goal. Granting a choice requires the sole active owned goal's exact updated_at, matching existing readiness profile/journey bindings, and latest choice-version CAS. Bindings are read through existing read_state(), not reimplemented or interpreted as clinical eligibility. Every write adds a new version. The same request ID and exact JSON request replays its original receipt; a different payload is rejected. Replay includes latest stored choice so an old Smart receipt cannot be mistaken for current consent.

Revocation is restrictive: it requires owned goal and latest choice-version CAS but not current nutrition data, active status or fresh granting bindings. It retains the previous stored bindings rather than trusting newly supplied ones. It never returns current=true. If there is no prior choice, revocation fails with macro_choice_missing. No write updates goals, users, policies, purchases or entitlements.

The reader may expose existing choice with bindingStatus=unavailable/current=false if readiness reports source_limit or profile_unavailable. Other errors are not hidden. This preserves a way to revoke without pretending stale context grants permission.

## Lifetime and future loader

This is a preference per goal, not final approval of a new calorie/macro proposal. There is no weekly sourceFingerprint expiry and no clinical reviewed field. Goal revision or relevant profile/journey change invalidates granting applicability until reconfirmed. Safe transfer across a subsequently accepted goal revision is NOT implemented.

A future trusted loader must read latest version, require current=true, verify owner/goal/profile/journey, and separately obtain real nutritional review. It may bind that verified lasting choice to the current snapshot request; it must not pretend the user re-consented weekly. Revocation and version must be rechecked at proposal acceptance. This table alone cannot satisfy macro clinical review or enable recommendations.

Existing custom UI does not save original percentages or Smart choice. No UI or automatic data backfill was included in the storage installation; UI integration remains separate. copyVersion is an API contract identifier; reviewed localized consent copy and UI submission remain work before use. No diagnoses are collected.

## Review and tests

Rollback tail validation PASSED on November 15, 2026 using a simulated authenticated database request context for the authorized existing Rivera account. This is SQL/role validation, NOT verification of a real signed-in HTTP session. It requires an already verified own-account authenticated context supplied by an approved harness, creates no users/JWTs, checks exact split/type rejection, owner injection, wrong goal, CAS, replay, revocation and unchanged goals, then rolls back. Other-session races, anonymous context, deleted-account cascades and API ACL remain explicit additional tests. No claim of compilation or successful execution.

Relevant primary guidance consulted: https://supabase.com/docs/guides/database/functions and https://www.postgresql.org/docs/current/sql-createfunction.html. Changelog checked; no SDK/CLI upgrade is part of this candidate.

## Verified rollback result

The Supabase migration tool returned success after executing CREATE statements and all tail assertions. Subsequent independent readback found zero candidate tables and zero candidate functions. Before/after hashes of the complete own profile and goal rows matched exactly, and the policy table remained empty. No candidate consent rows, goals, limits, or release state were left changed. A technical migration history entry may exist; this is not an installed application migration.

Covered assertions: exact split save/read, type and sum rejection, request ID replay/conflict, version CAS, owner-field injection, missing/foreign-ID goal rejection (not an existing other user's goal), restrictive revocation with stale supplied bindings, replay after revocation cannot reactivate, direct-table/helper denial, and public RPC privilege checks. Actual anonymous requests, another existing owner's records, concurrency, cascades, API transport and UI remain unverified. Do not generalize this result to those cases or to overall TDEE readiness. The separate blocked backend test runner was not retried.

A second authorized rollback transaction also passed SQL-context denial checks for missing subject, anonymous identity, anon role and service_role. This still does not prove HTTP/JWT validation. Readback again found no candidate table/RPC and unchanged goal hash. The full profile hash differed between these later observations; neither validation SQL writes public.users, but concurrent activity was not diagnosed, so this second run must not be described as an identical-profile restoration. No profile was overwritten to force a match.

## Authorized storage installation

The owner subsequently requested installation. Migration install_macro_choice_storage_v1 applied the exact validated candidate with final COMMIT instead of ROLLBACK. Independent readback matched all six stored function bodies to the validated source exactly. RLS is enabled, client table/helper access is false, and the three public RPCs allow authenticated while denying anon/service_role. The table contains zero choices and policy rows remain zero. No target, purchase, entitlement, eligibility or release switches were changed. The repository candidate still ends ROLLBACK for reproducible transactional validation; this section records the separately authorized installation.

This installs storage and RPCs, not a finished selector or activated TDEE. HTTP-session and concurrent-request tests remain pending; the current browser control surface supports UI inspection but not arbitrary authenticated HTTP requests. Do not extract session secrets or claim those tests passed. Future UI QA must use the app's normal transport and explicitly selected synthetic own-account values with scoped restoration.

## Installed database competing-request QA

Two SQL connector calls were launched in parallel with simulated authenticated contexts for the authorized own account, distinct request IDs and the same expected choice version zero. Exactly one stored a Smart choice; the other returned 40001/macro_choice_changed. This proves the observed competing-request CAS outcome, not authenticated HTTP behavior or independently measured transaction overlap. The single synthetic row was backed up in full and then removed by exact owner/request/version/mode/timestamp after the first cleanup confirmation expired and the owner explicitly requested retry. Readback confirmed own choices zero, unchanged complete goal hash, observed settings OFF and policy rows zero. No other user's rows were involved.

Client choice UI source is published at 084499185679550f3904a838900820a66159e976 and statically reviewed against installed RPC shapes. Worker-reported client suite: 141 passed, including 17 new cases; this is not backend-runner execution, full typecheck or UI E2E. The own-bearer server preference loader is source-integrated at d3a486ae185ed34bac22867ffdb27b91c442a694; it still returns review:null and cannot supply missing nutritional review. Web deployment/real UI QA remain separately coordinated. Recommendations remain OFF.
