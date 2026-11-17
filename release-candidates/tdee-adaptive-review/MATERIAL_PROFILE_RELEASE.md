# Material-profile provenance and telemetry continuity

New manual goal receipts capture a versioned server-generated material profile while the original owner lock is held. Historical full fingerprints and acceptance timestamps are retained. No legacy receipt or anchor is backfilled or rewritten.

Material identity includes owner, DOB, sex, canonical height in cm, onboarding, activity, journey and timezone. Ordinary weight logs, display units and app-open telemetry do not redefine the baseline. Initial derivation, idempotent goal-save retry, existing baseline recovery, all-count source and admission enforce the appropriate material evidence. Legacy or changed material evidence requires explicit new manual target acceptance and its real 14-day period.

Screening retains exact risk/journey bindings, explicit response, revocation, supersession and expiry. Timestamp equality is retained for insertion concurrency, not used as permanent consent identity. Pre-save optimistic concurrency is unchanged.

Deploy atomically: acceptedGoalMaterialProfileCandidate columns/helper; materialGoalWriterCandidate replacement; materialAnchorVerifierCandidate helpers; initial provenance helper; only the changed private functions from canonical loaders, append, source, admission, screening and reconciliation. Preserve all live public wrappers and ACLs. Do not run canonical candidate files wholesale: unrelated historical release guards are not part of this patch. Then deploy the matching Edge closure and production web. No scheduler, policy, entitlement or native-submission change is required.

Rollback must preserve newly captured evidence columns and rows. Restore prior function definitions only if needed; never drop evidence or rewrite immutable history. A mixed version must fail closed, not fabricate an acceptance.

Verification: affected Node/TypeScript regressions, Deno checks, actual PostgreSQL rollback compilation, TS/SQL derivation parity, pure original-receipt material lifecycle and ACL checks. Normal production UI end-to-end verification is a separate release gate, not implied by these tests.
