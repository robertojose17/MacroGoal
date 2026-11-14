# Snapshot-based adaptive acceptance status

2026-11-14. Snapshot-as-of concurrency semantics approved by the owner. This document does not activate recommendation generation or goal mutation.

## New contract
- No source-table triggers, global writer isolation changes, source fences, or all-user backfill.
- Lock the authenticated profile and exact current goal; compare their non-null versions and complete goal snapshot.
- Revalidate a coherent source snapshot after those locks. Fresh acceptance capture is at most 30 seconds old.
- A food/weight write after that capture may affect the following review. This is explicitly not the former all-writers-through-commit guarantee.
- Preserve exact request identity, repeatable receipts, atomic goal/anchor/proposal/receipt writes, and replay after expiry or disabling.
- Record the accepted source fingerprint, capture time and contract version.
- Proposal lifetime is bounded separately (five-minute engineering ceiling). It is not the freshness interval of the revalidation.

## Implemented, still inactive
- snapshotRegistryCandidate.sql: private registry and own-actor acceptance candidate with reviewed snapshot contract gate; no grants, seeds or public wrapper.
- snapshotAdjustment.ts: pure signed anchored draft calculation, step ceiling of 200 kcal plus explicit fraction, policy floor/ceiling, net-deviation limit, interval and receipt-history checks. Threshold values are policy inputs, not hidden defaults or medical guarantees. No live import, no automatic target changes.
- Existing deployed observation/entitlement remains unchanged by these candidate commits.
- The prior serialized-source registry remains a historical candidate, not a dependency of this contract.

## Verification actually performed
- Registry definitions compiled in the existing Supabase database under a transaction that explicitly ended ROLLBACK.
- Timestamp boundary (30 seconds), stale, future, invalid date, missing timezone and null checks passed.
- Closed API privileges, no seeded policy/proposal, and no source trigger checks passed.
- Subsequent catalog read confirmed neither the private schema nor acceptance function persisted.
- Ten signed-adjustment tests passed using the actual TypeScript engine transformed by Node on the connected Windows computer. They include both directions, no stacked deficit, large expenditure swings, floors, expiry, cooldown, anchor mismatch, and return-to-baseline history.
- This is not full app type-check, live multi-session acceptance, real-user nutritional efficacy, or clinical validation.

## Remaining before activation
1. Reviewed product policy and evidence/eligibility inputs. Do not infer complete food logging from meal count or Premium; heuristic completeness must remain labeled as heuristic. No new questionnaire or collection is enabled.
2. A coherent private producer/adapter linking the current source snapshot and goal CAS to the new registry; no manufactured reviewed flags.
3. Persistent private deployment, authenticated wrappers and tests of two accepts, manual edits, expiry while waiting, lost-response replay and atomic rollback. Existing application consumers must refresh the same active goal.
4. UI presentation/explicit acceptance/recovery and account E2E. TestFlight remains separately authorized.

## Evidence and limitations
MacroFactor describes weekly updates and initial convergence over several weeks:
https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal
https://help.macrofactorapp.com/en/articles/206-what-should-i-do-if-my-initial-expenditure-or-recommended-energy-intake-seems-too-high-or-too-low

A proposed fourteen-day acceptance cadence is a product choice, not evidence that fourteen days always provide reliable data. The current observational engine retains its existing 21–28-day coverage checks.

PostgreSQL explains why a serializable acceptance transaction alone does not replace participating legacy writers:
https://www.postgresql.org/docs/current/applevel-consistency.html

Product floors and adjustment ceilings are not universally safe prescriptions. Eligibility and uncertainty handling still matter. No proprietary competitor algorithm has been copied or claimed.
