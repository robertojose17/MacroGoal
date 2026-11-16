# TDEE integration verification — 2026-11-16

## Installed and verified
- Observation consumer: progress-intelligence v18. Revision-bound nutrition evidence projection installed as migration 20261116120255.
- Revocable tester registry expiry stabilized in migration 20261116120926. Actual purchase verification and its 30-second expiry were not weakened.
- Signed-in observation settings and server-adjacent provider refresh succeeded; observation was enabled temporarily, the positive authenticated snapshot included the evidence marker, and observation was restored OFF. Recommendations remained OFF.
- Installed snapshot explicit-zero/revocation checks passed using actual fresh purchase verification. Own-account fictitious data was restored and verified.
- Independent overlapping read/edit and read/revoke probes preserved coherent statement snapshots; subsequent reads invalidated evidence.
- Bounded 5,001-distinct-item projection and JSON aggregation took about 1.53 seconds in a rollback transaction. This is not a universal latency guarantee.

## Source-only manual allocation
The candidate now supports persisted exact basis-point percentages with deterministic nearest-gram rounding. It requires existing reviewed nutrient constraints and bound consent. It never normalizes the chosen percentages, switches to Smart, or redistributes grams to conceal infeasibility. Smart retains its existing protein-preservation behavior.

The allocation mode is carried through draft and proposal evidence. The rollback-only SQL hardening candidate validates the locked current choice, recomputes manual grams, retains all existing calorie, review, revocation, expiry and receipt defenses, and is fenced to the inspected live acceptance body. **That SQL hardening is not installed.**

## Checks
- Full canonical source graph: 65 files; complete Deno check PASS.
- Combined candidate suite after the manual changes: 194 tests PASS, 0 failed/skipped.
- Includes 11 acceptance-endpoint OFF/contract tests and 14 new manual cases (including a 930-combination arithmetic grid).
- 50 read-only PostgreSQL/JavaScript rounding cases matched.
- Live authenticated missing-proposal rejection and terminal rejected-receipt replay passed in rollback.
- The deliberate parser expectation change now rejects a manual choice lacking persisted split/version as manual_percentage_choice_invalid, rather than the obsolete blanket custom_percentage_review_required.
- No release-switch rewriting, software installation, new environment, operational policy seed or fabricated approval evidence was used for these checks. GitHub CI status is separate; local passes do not assert CI passed.

## Remaining release gates
recommendationsEnabled=false, acceptanceEnabled=false and reviewedPolicyId=null remain unchanged. The new manual/acceptance candidate is source-only and is not the deployed observation bundle.

The 14-day route still produces an assessment rather than an actionable issued proposal. Operational policy/applicable nutrition review records, appropriate uncertainty handling, daily evaluation/seven-day reassessment scheduling, SQL hardening execution, and positive proposal→explicit acceptance→goal/history/consumer synchronization remain unfinished. No positive enabled core-acceptance test is claimed.

The user's reference ranges and approval authorize design/implementation; they are not evidence of an independent clinical validation or of any particular person's eligibility. Do not seed fictitious reviewed operational records to pass activation gates.

No TestFlight submission occurred.
