# Rules14 production release

This source enables the complete deterministic general-adult TDEE workflow: explicit screening, known-unit weight normalization, confirmed food coverage, genuine accepted-target baseline, bounded calorie/macro proposals, explicit acceptance with atomic receipts, and daily assessment/reconciliation. Unsupported or insufficient data holds targets. The legacy snapshot HTTP acceptance route remains separately OFF.

The versioned product policy is rules14-general-adult-v1 revision 1, document digest 65c9dd0d1ed3c0f5ef9fede9e76c5683ea05ca440e21dcfbe35fa40b8fdc063e. Administrative validity ends 2027-11-17T00:00:00Z and can be revoked earlier. Expiry stops new proposals/acceptance without altering existing targets or falling back to a legacy engine. Renewal is not automatic; review is required before expiry. This validity is not clinical approval or a guarantee of nutritional suitability.

Provider/source freshness remains 30seconds; screening expiry remains 30days. Repeated uncertainty fails closed. One bounded read-only provider refresh retry handles concurrent proof refresh; it never retries a goal write or extends a proof. Browser/native acceptance retains account and request reconciliation.

Engineering verification includes genuine authenticated production rollback tests for SQL/TypeScript producer parity, acceptance/replay/receipt chain, and six scheduler recovery/rollback assertions. These synthetic tests are not real consent, medical evaluation, empirical TDEE validation, or operational history. User data is restored. Current release maintenance diagnostics do not mount or request capability.

The existing adaptive cron is prepared with the authenticated internal worker route but left disabled by its migration. Enable only after successful real service dispatch verification. No native/TestFlight distribution is included in this web release.
