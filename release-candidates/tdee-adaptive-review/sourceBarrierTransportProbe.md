# Existing-database concurrency transport probe

Date: 2026-11-13. No application/account rows, persistent objects or configuration changed. This is **not** a test of the TDEE writer barrier, identity, prescription safety or an acceptance transaction.

A bounded advisory transaction lock on a dedicated probe key was used only to establish whether two connector calls can overlap. It is not the proposed production barrier and no application writer uses it.

## Results

1. Two calls launched together from one orchestration invocation did **not** overlap in this run. The second began after the first released its lock. That attempt is not evidence of concurrent execution.
2. Two independent workers then used the same existing Supabase project, with no new environment or database:
   - Holder backend PID `4100420`: acquired key `(19482026,11130002)` at `2026-11-13 03:40:46.136029+00`, ended at `03:41:06.150867+00`.
   - Observer backend PID `4100422`: at `03:40:59.274358+00`, `pg_try_advisory_xact_lock(19482026,11130002)` returned `false`, isolation `read committed`.
   - The observer timestamp falls inside the holder interval and the PIDs differ. This proves overlapping database sessions and lock contention through the available connector path.
3. A final catalog check found **0 remaining probe locks** for either probe key. These were transaction-scoped locks, not persistent session locks.

## Boundary

Real writer-barrier QA still requires a reviewed implementation, permission for its installation and a verified own-account identity for any account-specific operation. The historical context UUID is not such proof. Tests must cover actual source rows, rollback, owner mappings, cascades and acceptance interleavings; the temporary transport probe supplies none of those guarantees.
