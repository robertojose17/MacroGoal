# Interrupted baseline reconciliation

The scheduled worker may time out after a successful initial-anchor append, leaving its claim uncertain. Proposal-issuance reconciliation cannot establish this outcome because baseline calibration does not create a proposal journal entry.

The new server-only reconciler verifies desired baseline state, not which request created it. It requires the exact still-current rules14 selection scope (full goal, profile/screening bindings, settings, screening row and policy binding), matching ledger revision/claim, a latest immutable anchor created no earlier than the claim, the exact current accepted receipt and goal, and equality with fresh original-anchor derivation. It also requires current provider access and absence of a proposal or proposal journal for this claim. An older anchor, changed source, unrelated head, absent append or uncertain proposal cannot complete calibration. It never appends or resets anchor history.

Verified recovery completes the existing ledger by CAS and records the ordinary scheduler completion receipt while preserving its uncertainty hold. It returns `current_baseline_verified`, not a claim that this worker wrote the anchor. Runtime fallback occurs only after an explicit unverified issuance result, never following transport uncertainty or ambiguous output.

The service wrapper remains immutable OFF. Activation must be coordinated with the other reviewed scheduler wrappers. No new persistent table or credential is added. The generic finite-provider `read_access` helper is required.

Verification: five focused runtime/source tests pass, including timeout-after-append recovery on a subsequent worker run, unresolved missing/older/changed-source outcomes, mismatched evidence, and transport interruption. Actual PostgreSQL rollback compilation and missing-claim rejection pass; all new functions were confirmed absent after rollback. A genuine owner-scoped seeded success test has not yet been performed and must not be inferred from the mocked runtime outcomes.
