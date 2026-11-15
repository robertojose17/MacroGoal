# Macro allocation acceptance trace — source inspection, recommendations OFF

2026-11-15. This trace is not execution, deployment, clinical validation or proof of production behavior.

## Current Smart source
The allocator preserves current protein only when that amount fits the independently reviewed limits. Otherwise it blocks protein_review_required; it does not raise or lower protein automatically. It protects fat according to supplied reviewed bounds and adjusts carbohydrates, failing closed when infeasible. Current fiber is preserved. These are the implemented candidate rules, not proof that every future mode should use identical grams.

An explicit preserve_percent choice is retained with exact basis points and choice version on every preset. It blocks custom_percentage_review_required because its reviewed allocator is not implemented. It must not fall through to Smart. Invalid/revoked/stale/absent state from the concrete authenticated loader blocks before a new proposal.

## Proposal
After engine validation, the producer snapshots macroEvidence: binding, review identity/timestamps, limits and available choice identity/version/percentages. It caps proposal expiry by review expiry as well as existing policy/eligibility/offer limits. The concrete loader still returns review:null, so this is an inert path, not invented authorization.

## Acceptance
The existing SQL validates receipt identity, policy, profile/goal CAS, readiness, source, numerical caps and macro energy consistency. It does not yet read or authenticate macroEvidence, look up its review or reread the selected macro choice. Adding a universal protein equality condition would not fix those omissions and could prevent a future legitimately reviewed custom allocation. The previously proposed protein hunk was withdrawn from the unapplied patch; no live guard was weakened or removed.

Acceptance needs an authoritative, versioned allocation contract. For the current Smart-preserve-adequate-protein mode, equality can be one contract-specific invariant. A separate manual-percent or protein-correction mode needs explicit consent, reviewed constraints and its own verification. None is authorized merely by naming a mode or setting a boolean.

## Revocation and expiry
Choice save/revoke and acceptance both lock the same own-user row before goal. A future latest-choice reread inside that lock can serialize these RPC operations. Existing SQL does not do that reread yet. Food/weight edits retain the approved snapshot-as-of limitation, not global serialization.

A review expiring after issuance but before acceptance must be rejected by authoritative acceptance revalidation, even if some cached proposal metadata appears current. No such review storage/lookup is implemented yet. Replaying an already committed exact receipt remains recovery of history and must not create a new application or overwrite current goals.

## New goal
Acceptance creates a new goal ID. There is no automatic transfer of a preference bound to the old goal. A future transfer must be explicitly designed and consented or require reconfirmation; no silent transfer is assumed.

## Verification still required
Actual server tests, changed choice/revocation between preview and accept, expired review, cross-mode targets, response loss and exact replay, then same-release E2E. No blocked runner or rejected SQL operation was retried for this trace.
