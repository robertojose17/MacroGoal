# Snapshot-based adaptive acceptance status

2026-11-14. Recommendations remain OFF. No target has been changed persistently by this work. No TestFlight release.

## Live, verified
- Observational TDEE uses the scoped verified Premium authority without an owner/admin bypass.
- Readiness UI is deployed on web: eligibility self-confirmation and explicitly complete food days, reversible by the user. Self-report is not clinical review.
- Private snapshot registry, own-actor context/read/accept/receipt wrappers and service-only issuance/bootstrap wrappers are installed.
- Five registry tables have RLS and no direct authenticated/service table grants. Anonymous acceptance and authenticated issuance are denied.
- Registry readback: zero policies, anchors, proposals and receipts. Therefore installed acceptance cannot issue/apply a recommendation.

## Snapshot contract
Authenticated profile and exact current goal are locked and compared; recent sources and readiness are revalidated. Source changes after the capture enter a subsequent review. This is not a global source-writer serialization guarantee.
Atomic acceptance preserves goal/anchor/proposal/receipt consistency and request identity. Receipts support recovery after expiry.
A baseline is bound to its complete starting goal and journey; it is not silently reset. Initial calibration and subsequent acceptance require at least fourteen days, plus the independent observational data requirements.

## Important source/runtime difference
The prepared TypeScript engine preserves protein and fiber and allocates residual energy between carbohydrates and fat. The engine, context parser, bootstrap planner and eligibility refresh planner now require finite positive cumulative/intake caps, aligned with the deployed SQL NOT NULL requirement; null is rejected without substituting defaults.
The deployed SQL still does not include the new exact-protein equality guard. This cap-contract alignment does not establish full source/runtime equivalence.
Do not deploy or enable these candidates as if they were already a single verified release. The rejected persistent policy migration remains unapproved; no workaround or retry is authorized. No numerical cap has been selected or seeded. Updated cap-contract regression tests are prepared but not executed because the local runner is blocked; earlier passing test counts below are historical evidence, not validation of these latest changes.

## Evidence actually obtained
- Actual own-account SQL acceptance transaction passed: revoked readiness rejected; atomic goal/receipt creation; identical replay; consumed proposal reuse and mismatched request rejection. Mandatory rollback restored the complete original state digest.
- Bootstrap rollback passed: service-only writer; exact goal/profile/journey CAS; creation; repetition does not restart baseline; no target mutation. Original state digest matched afterward.
- Current candidate suites: 56 passing tests across engine, producer, context parser, bootstrap and runtime; seven receipt-chain tests also passed. They run real module bodies with Node TypeScript stripping, not a full project type-check.
- Readiness UI: 67 focused tests and real web open/cancel checks passed without saving health declarations or complete-day attestations.
- Full live proposal/acceptance UI E2E is still pending. Software tests do not establish nutritional efficacy or clinical validity.

## Remaining
1. Resolve the policy/guard contract before activation; no unsupported universal accumulated or intake ceiling.
2. Wire trusted server bootstrap, eligibility refresh and proposal route, preserving actor identity and immutable baseline.
3. Connect explicit acceptance/recovery UI and refresh all consumers of the same accepted goal.
4. Validate the coherent release and own-account end-to-end scenarios. No automatic goal application.

## Evidence and limits
The 200 kcal maximum is the owner's product limit. Fourteen days and five percent are engineering choices, not universal clinical standards.
MacroFactor describes smoothing and avoiding catch-up deficits, not a universal 400 kcal accumulated cap or 5000 kcal intake ceiling:
https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal

Weight response is dynamic; a fixed energy-per-weight approximation is not a complete individualized model:
https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/

Common calorie ranges in weight-management guidance are individualized treatment strategies, not guarantees that a floor is safe for every person:
https://pmc.ncbi.nlm.nih.gov/articles/PMC5819889/

The estimator's numerical domain must not be represented as a clinical intake range. No proprietary competitor algorithm or clinical validation is claimed.

## Additional verification, 2026-11-14
- Eligibility refresh passed own-account transaction tests with real current Premium evidence and observation enabled: service-only authority, exact goal/profile/anchor CAS, bounded expiry, canonical digest, replay and revocation. Transaction rollback preserved the combined account state digest.
- The two refresh functions were then installed additively with execution restricted to service_role. Anonymous and authenticated execution are denied; fixed search paths and private SECURITY DEFINER/public INVOKER were verified. No existing table grants or calorie caps changed.
- Registry readback remains zero policies, anchors, eligibility rows, proposals and receipts. The observation switch was restored to OFF through the real web application and verified in the database. No synthetic account data or medical attestations persist.
- Own-actor offer recovery and expired-request closure are installed and transaction-tested; closure never applies a goal. Recovery UI remains unmounted.
- HTTP dispatcher and Supabase ports are prepared but unmounted: nine focused tests pass, including the actual immutable OFF runtime returning 503 without creating Supabase clients. These tests do not replace a full Deno/project type check or live proposal E2E.
