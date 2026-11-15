# Macro-aware acceptance hardening candidate

Status: candidate source only; existing production acceptance remains unchanged; recommendations OFF. No TestFlight or Edge deployment.

## Different from the rejected operation
This candidate does not make calorie caps nullable, replace caps with defaults, change table/API grants or weaken the existing checks. It adds mandatory versioned Smart evidence revalidation and retains the existing engine's reduction suspension. It is not a workaround for the earlier rejected operation.

## New first-application checks
Requires snapshot-macro-context-v1 with allocationMode smart-preserve-adequate-protein-v1. Checks latest administrative review and latest own-goal macro choice against the exact proposal binding, profile/journey, current target, policy/engine, review/choice identity and version, provenance digest/version, expiry and explicit Smart selection. Protein preservation is specific to this contract, not a universal rule for hypothetical future manual allocations. Exact review/choice identities are recorded in the receipt. Historical exact receipt replay still occurs before new first-application checks.

The new review-table trigger serializes INSERT with the same user lock as acceptance. UPDATE and direct DELETE with living parents are rejected; changes require a new version, so deleting a revocation cannot resurrect an older approval. Account/goal cascades remain permitted when the corresponding parent is already absent; no reverse user lock is acquired for those cascades. No trigger is added to food, weight, goals or user tables.

## Verified so far
- Independent static review.
- Supabase compilation of the candidate in BEGIN/ROLLBACK succeeded.
- Own-account rollback tests passed: exact review mapping; wrong owner/engine/binding rejection; newer restricted/revoked/expired/mismatched versions suppress prior approval; missing required eligible limit rejects.
- Trigger rollback tests passed: direct UPDATE and DELETE reject; deleting a disposable own-goal fixture cascades its review correctly. All own-goal JSON digest matched before/after the test body.
- Independent readback after rollback confirmed original acceptance body unchanged, candidate trigger function absent and review table empty.

## Positive acceptance test not yet completed
The full harness requires real Premium authority; it never renews or fabricates a tester binding. One coordinated attempt stopped at that gate before any user fixture writes: the legitimately refreshed authority cache expired after30 seconds before the tool reached the test. Original acceptance and trigger state were restored; original goals hash remained unchanged. The combined profile/goals digest changed across browser activity, so no exact profile-restoration claim is made or rollback over those external updates attempted.

A profile Premium badge is not proof of fresh server authority. A backend-adjacent legitimate preflight is being prepared; TTL and purchase state are not modified. Still pending: full positive atomic acceptance/replay and macro revocation/expiry cases, permitted TypeScript execution, same-release application E2E, reviewed policy and real administrative approvals. No source fixture constitutes a nutritional review.
