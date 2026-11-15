# Acceptance parity review — activation remains OFF

Source inspection: 2026-11-15. This is a proposed contract, not a migration, deployment, clinical validation or executed test. Do not retry or route around the previously rejected SQL replacement. No production database read was repeated after its authorization-review failure.

## Verified source discrepancies

1. snapshotRegistryCandidate.sql accept_proposal does not read macro_choices or validate the current choice version, revocation or nutritional macro review. The new server source loader reads a preference but always supplies review:null.
2. The Smart allocator preserves current protein and fiber after validating context. SQL target limits preserve fiber and macro energy consistency, but not exact protein equality.
3. SQL age gate allows 18; Smart context requires at least 19. This difference must be resolved explicitly; absence of consensus must fail closed.
4. Acceptance creates a new active goal ID. Stored preferences are bound to the previous goal ID/revision. There is no approved automatic preference transfer.
5. Rate-adjustment candidate uses desired-rate versus observed reliable-interval evidence. Existing snapshot engine instead preserves an anchored energy gap. Do not silently replace one formula while keeping the old engine/policy identity.

## Proposed change boundary for future explicit approval

Preserve owner authentication, receipt replay, lock order, exact goal/profile CAS, source/readiness revalidation, all existing calorie caps, cooldown, expiry, atomic goal creation and receipt recording. Do not remove NOT NULL caps or select arbitrary policy values.

Before any first application (but after returning an existing exact receipt):
- Require a persisted, server-issued macro evidence identifier and exact owner/goal/source/policy/engine binding.
- Read authoritative evidence, expiry and revocation under a defined lock/read protocol. Client payload booleans and self-confirmation are not review authority.
- Read latest own-goal choice and compare ID/version/mode/bindings to persisted proposal. Revocation or changed choice rejects a new application.
- For the reviewed Smart-preserve-protein contract, require exact current protein and fiber equality plus reviewed bounds for all macros. A future different contract requires its own explicit version.
- Resolve the age-policy mismatch in one versioned contract; do not relax either guard as an incidental refactor.
- Leave a new goal's preference unconfirmed unless an explicit, reviewed transfer design is separately authorized. Preserve the historical choice as history, not ongoing permission.
- Revalidate actual rate-evidence provenance and total-deficit constraints before allowing any reduction. No fake reliable interval, fixed conversion default or automatic review flag.

No helper alone closes this gap: it must be invoked in the authoritative transaction before UPDATE/INSERT and tested against first acceptance, replay and concurrent revocation. A wrapper that bypasses the rejected replacement is not an acceptable substitute.

## Required verification cases (prepared specification, NOT RUN)

- Proposal preview then macro choice revoked: reject without goal mutation.
- Changed choice version with same mode: reject stale proposal.
- Protein altered while calories and 4/4/9 still match: reject under preserve-protein contract.
- Missing, expired, revoked or wrong-owner review: reject.
- Age boundary with divergent contracts: deny rather than infer eligibility.
- Exact receipt replay after choice revoke or feature OFF: return historical receipt, never apply again.
- Accept once then new goal: no silent transfer or repeated application.
- Concurrent food/weight edit: enforce approved snapshot-as-of semantics, not a nonexistent global serialization guarantee.
- Transaction rollback must restore exact own-account state; test declarations must not persist as real medical answers.

## Independent work completed

The candidate as-of pace now excludes future weigh-ins. Two corresponding regressions are prepared and unexecuted. Client macro preference UI/storage were verified separately, including exact percentages, Smart, revocation and restoration of synthetic events. These results do not validate adaptive proposal acceptance.

## Point of stop

Safe activation needs the real policy/evidence source, explicit acceptance contract change, permitted server test execution and same-release application E2E. No additional dummy port, always-blocked wrapper or checkbox would satisfy these dependencies. Current recommendations stay OFF.
