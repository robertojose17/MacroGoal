# TDEE cron containment, 2026-11-12

Applied narrowly in production and independently read back: job 34 `adaptive-tdee-nightly` is now inactive. This is reversible containment, not a new scheduled TDEE implementation. No recommendation, account flag, profile, goal, source data or unrelated job was changed.

The job still retains its 15:00 UTC schedule and original command fingerprint `b68dc728c77d578bf6d5eff07ccc8085`. Its target is the missing `file-writer` Edge Function. The function catalog and direct function lookup both confirmed absence. It was not redirected to Progress or backfill because those contracts are different.

The initial `FOR UPDATE` preflight failed with PostgreSQL 42501 before mutation because the managed role cannot update/lock `cron.job` directly. Catalog inspection confirmed EXECUTE on the official `cron.alter_job` API. Independent review approved using that API with before/after checks instead. A rollback-only call verified that the installed API is transactional; the final transaction then paused the one job. Assertions preserved every other field and all other jobs. Separate readback confirmed inactive, unchanged fingerprint and zero running executions. A separate queue count found zero pending requests to the missing endpoint; no queue entries were removed.

`pause-job-34.sql` records the guarded operation. It deliberately rejects an already-paused or changed job. `rollback-job-34.NOT-EXECUTED.sql` is prepared but has not run. Reactivation requires explicit authorization and verification of a repaired destination. Do not grant permissions, print Vault/command contents, automatically reactivate, purge queues or cancel unrelated work.

A replacement must define its exact actor/opt-in, calculation-only versus proposal scope, source consistency, idempotency, provenance, privacy, and failure semantics. The current owner-scoped dynamic estimator already calculates on demand inside Progress; a background service must not impersonate its user-scoped contract or re-enable legacy adjustments.
