# Adaptive backend infrastructure candidate — not deployed

Prepared 2026-11-13. No database mutation, grants, Edge deployment or feature activation was performed.

## Implemented

- `apiContract.ts`: separate `adaptive-review-v1` POST protocol. Exact actor-bound request contains only owner/request/proposal IDs and digest. Targets cannot be posted to acceptance. Response receipts bind the same immutable identity; read-only receipt reconciliation works independently of new-write gates.
- `proposalProducer.ts`: private-server preparation from the existing conservative draft engine, full goal/source/policy binding, explicit `<=200 kcal` per-step product ceiling and no hidden numerical defaults. Its release gate remains immutable OFF, so it performs neither source reads nor persistence at runtime. Preparation is not an actionable proposal.
- `registryCandidate.sql`: candidate private policy/anchor/eligibility/proposal/receipt registry, service-only issuer, owner-JWT acceptance and durable rejection/commit receipts. Acceptance serializes the owner, checks the installed source barrier, exact source fingerprint, goal/profile versions, entitlement, policy/eligibility expiry and anchor, consumes one proposal and writes a new goal plus receipt in one transaction. Journey/intent fields and original anchor are retained. Existing no-reduction behavior is preserved.
- No policy, eligibility, anchor, proposal or account rows are seeded. All tables/functions are revoked from API roles; no public wrappers/grants are installed. General project authorization does not synthesize clinical eligibility, complete-day attestations or SQL-concurrency evidence.

## Verification

- `node --test tests/adaptive-api-contract.test.mjs tests/adaptive-proposal-producer.test.mjs`: 17 passed, zero skips.
- These tests cover the handler and pure producer plus static SQL invariants. They do **not** execute PostgreSQL, validate a clinical policy, test live multi-session locking, or constitute application/account E2E.
- Live SQL definitions for the accepted-goal function and observation snapshot were read to match actual goal columns and existing CAS/identity semantics; no customer rows were read.

## Remaining integration gates

1. Review and validate the writer barrier against all production writers and cascades. A live rollback installation still takes locks and installs temporary triggers, so it was not attempted under the requirement of no effect on live users.
2. Provide a real coherent enriched-source reader, policy/eligibility/completeness records and accepted anchor. Never promote existing low-confidence/unverified observation merely by changing markers.
3. Select and verify the numerical policy/cadence/eligibility with appropriate evidence. Only the per-change upper bound is applied here; no policy is selected or enabled.
4. Compile/rehearse the SQL in an authorized way, then independent review, least-privilege callable wrappers and server RPC bindings. None currently exists for this candidate.
5. Wire the reviewed versioned API into the live Edge dispatcher and deploy, then authenticated UI/account recovery and acceptance tests. The live observation entrypoint is unchanged.

The presence of this infrastructure must not be reported as a working recommendation feature or as ready for TestFlight.
