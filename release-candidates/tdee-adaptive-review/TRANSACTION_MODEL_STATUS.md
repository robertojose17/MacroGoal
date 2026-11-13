# Transaction model review — candidate only

2026-11-13. No database, grant, account, source trigger, lock or deployment action.

## Code correction

Registry schema creation now uses IF NOT EXISTS, permitting the private enriched-reader candidate and registry candidate to share the same namespace regardless of installation ordering. Tables/functions intentionally remain create-only so incompatible existing definitions do not silently pass. Corrected misleading comment describing the source barrier as independently verified: real source-writer coverage is NOT verified.

## Deterministic model tests

`tests/adaptive-transaction-model.test.mjs` exhaustively enumerates order-preserving writer/accept schedules in a small abstract fence model. Legal schedules either accept before the writer publishes, or reject a stale proposal after the writer publishes. Additional model cases cover rollback, two competing requests, lost-response replay, request mismatch, supersession and ABA revisions. Static assertions tie intended validation/write/receipt ordering to the candidate SQL.

These six tests do not run PostgreSQL, do not emulate its locks, deferred triggers, MVCC, RLS or exception subtransactions, and do not prove actual deadlock freedom. The sorted-key model is only a specification check. It is not a substitute for real transactions.

## Unclosed production-writer matrix

The current candidate's transaction-wide owner queue and deferred flush cover supported ordinary READ COMMITTED source transactions. Actual source/profile lifecycle (insert/delete/reinsert/owner move), catalogue cascades, multi-owner updates, legacy coach lock ordering, forced early constraint flush, and deferred domain writes still need real multi-session SQL testing. Elevated trigger suppression/maintenance remains outside protocol. Receipt lifecycle on account deletion and private registry retention also needs explicit review before deployment; do not quietly add a new users FK that changes the established lock order.

## What would permit actual PostgreSQL testing

The user forbids a separate environment; none was created or proposed for automatic creation. Private rollback probes in the existing database can validate isolated helper primitives only, not live-table trigger/cascade equivalence. A rollback still takes locks and can affect concurrent users. Therefore no actual source-table installation/test can be represented as having zero live impact.

A real full-source validation in the existing database would require an explicitly approved maintenance window, bounded source-table locks/trigger installation, a scoped test owner, verified rollback/cleanup and multi-session access. This exceeds the current no-live-lock/no-account-change constraint. Alternatively the owner could explicitly revise the separate-environment restriction, but that is not assumed or requested by this artifact. Until an allowed method exists, full PostgreSQL verification remains blocked and activation stays OFF.

## Concrete live-lock constraint

The candidate adds triggers to users, goals, meals, meal_items, check_ins,
trackers, tracker_entries, subscriptions and macrogoal_observed_private.settings.
CREATE TRIGGER acquires SHARE ROW EXCLUSIVE until transaction end, conflicting
with ordinary writes. The candidate's 2-second lock_timeout limits acquisition
wait, not held-lock duration; its 30-second statement_timeout is per statement,
not total installation/backfill duration. No measured maximum is available.
Cascades additionally involve auth.users, foods and food_items. External HTTP
callbacks/logs are not necessarily undone by SQL rollback.

Uncommitted triggers are invisible to competing sessions. A CREATE+ROLLBACK
rehearsal therefore cannot validate live writers across sessions. A true matrix
requires a committed installation and later reversal, or a separately authorized
copy. Neither is authorized here. No installation should be attempted under a
claim of zero user impact. Continue catalog, EXPLAIN without ANALYZE and model
checks, but keep their limits explicit.
