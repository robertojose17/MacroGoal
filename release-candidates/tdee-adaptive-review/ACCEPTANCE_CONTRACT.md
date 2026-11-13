# Adaptive recommendation acceptance: reviewed boundary, not an installed API

Status: **design candidate, new acceptance writes disabled**. Prepared 2026-11-13. No migration, deployment, new environment, account read, account write, clinical approval or native test was performed for this review. This file does not authorize activation. The parent owns the pure proposal implementation; this review owns only the transaction contract.

## Conclusion first

The existing manual goal and journey-restart RPCs provide useful owner/CAS/idempotency patterns, but neither is an adaptive-proposal acceptance API. Calling the manual RPC with a recommendation would not bind its food/weight source, clinical policy, eligibility or cumulative adjustment history. It must not be used as a shortcut around those missing checks or its no-reduction rule.

The newly installed read-only snapshot makes one observation coherent. It does **not** freeze the source data until an acceptance commits. Current direct food/weight/settings writers do not all participate in a common transaction barrier. A hash comparison followed by a goal write therefore has a real time-of-check/time-of-use gap. New adaptive acceptance must remain unavailable until this barrier and its tests exist.

No installable acceptance SQL is supplied here: doing so without those capabilities would imply atomicity that the inspected database does not provide. A mocked transactional adapter or injected `writerBarrierVerified=true` is not evidence that the production capability exists.

## 1. Read-only facts verified from the production catalog and definitions

The inspection read definitions, grants, constraints and policies only. It did not select a person's rows or impersonate an account.

### Accepted goals

`public.save_accepted_nutrition_goal_v1` has eight required arguments: expected goal ID/version, request ID, goal patch, profile patch, expected user ID, expected profile version and operation. Its public wrapper is an invoker; the existing private `macrogoal_goal_write_private.replace_nutrition_goal` is a SECURITY DEFINER function with closed search path and explicit owner checks.

It derives `auth.uid()`, rejects missing/anonymous authentication and a different expected actor, locks `public.users` then the active `public.goals` row, and rejects multiple active goals. A unique partial index `goals_one_active_per_user` also exists.

Its private receipt has primary key `(user_id, request_id)`. Exact request replay is evaluated before the original CAS. Replay succeeds only when the current accepted goal snapshot and complete profile fingerprint still match the receipt. A different payload with the same request is rejected.

The reviewed manual contract permits only `initial_onboarding` or `manual_goal`, not an adaptive operation. It rejects calorie reductions from an existing goal. When applicable, its existing product references are 1,200 kcal for `female` and 1,500 for `male`, with valid adult profile requirements; these are **not universal clinical safety claims**. Changed target sets must be complete integers and satisfy the existing 10-kcal macro-energy tolerance. Goal direction, explicit target weight and loss pace checks must not be weakened by a new route.

It creates a new active goal, preserves journey dates for ordinary edits, and sets `base_daily_calories` to the new accepted calories and `last_adaptive_update` to null. This is another reason not to reuse it as an adaptive shortcut: blindly resetting the base on each adjustment would erase the anchor needed to constrain accumulated changes.

### Restart

`public.restart_accepted_nutrition_journey_v1` has nine arguments: request ID, date, initial/current weights, activity, expected goal ID/version, expected user and expected profile version. Its private implementation locks the profile then goal, preserves the accepted targets, and writes an idempotent receipt keyed by `(user_id, request_id)`. It does not calculate a new target or enable adaptive settings. Restart is not acceptance of a recommendation.

### Snapshot and writers

`observed_get_tdee_snapshot_v1()` is STABLE, invoker and owner-derived. Its output contains source/context fingerprints, capture time and the source envelope. **It does not expose `users.updated_at` or `goals.updated_at` as CAS fields.** Those values are used inside the fingerprint computation; separate client queries must not be represented as a coherent enriched snapshot.

Catalog inspection confirmed authenticated INSERT/UPDATE/DELETE privileges and owner policies on goals, meals, meal items, check-ins, trackers and tracker entries. The inspected trigger set has no common source-revision/barrier trigger on check-ins, tracker entries, trackers or meal items. Goals have an updated-at trigger. Observation settings `write_settings` reads the timezone and upserts settings without locking the user's public profile first.

Some foreign keys or individual writers can incidentally acquire locks, but that is not a universal protocol. In particular, a non-key change to a meal item's calories or a check-in's weight need not conflict with a lock on `public.users`. Most food/weight owner foreign keys reference `auth.users`, not the profile row locked by manual goal writes. A unique active-goal index prevents two active goals; it does not freeze food, weight or settings inputs.

## 2. Required server-owned records and capabilities (proposed, not existing schema)

The following are conceptual requirements, **not assertions that tables or fields already exist**:

1. An immutable policy artifact/version/digest, reviewed eligibility and stop criteria, algorithm version and parameter bounds. Approval provenance must be authenticated and controlled outside ordinary client writes. A request flag, environment string, citation list or self-labelled `approved` JSON is not clinical approval.
2. An owner-scoped eligibility attestation, explicit observation/adaptation consent and a verified-completeness protocol tied to the exact source window. Missing information is unknown, not eligible/complete. The current result explicitly says low confidence and `loggingCompleteness='unverified'`; those values cannot silently become actionable.
3. An accepted anchor linking the goal, strategy, nutrition/macro intent and the expenditure reference used for future adjustment. Do not derive an old accepted deficit from today's profile TDEE, sum another deficit onto it, or reset the anchor on each adaptive acceptance. Restart/manual edits invalidate or explicitly replace the old anchor.
4. A server-issued immutable proposal with owner, version, digest, expiry, algorithm/policy/eligibility/completeness references, anchor, source fingerprint, full expected goal and profile CAS, proposed complete target set and explanation. The client cannot choose or recalculate target values during acceptance.
5. A transaction-enforced source revision/barrier covering **all** relevant writers and deletes, not only the new acceptance function.
6. Owner-scoped durable acceptance receipts and an independent read-only reconciliation route that continues to function when new adaptations are disabled.

Until these capabilities are installed, reviewed and tested, the server must return a non-actionable reason such as `adaptive_acceptance_unavailable`; it must not fall back to the manual RPC, old preview RPC, an unguarded goal update or the legacy cron.

## 3. Enriched coherent context needed by proposal creation

A new reviewed snapshot contract must return, from the same protected read, at least:

- owner, server timestamp, timezone/civil day and complete source fingerprint;
- nullable profile CAS timestamp exactly as stored and the relevant profile fingerprint;
- accepted goal ID, nullable version and a complete canonical accepted-goal snapshot;
- settings revision/consent state, applicable entitlement, eligibility/completeness versions;
- source revision/barrier generation and the anchor/policy references.

This is a prospective contract change, not a claim that snapshot v1 already provides it. Do not enrich v1 by independently reading profile or goal after it, then attach those newer versions to an older calculation. At acceptance, all versions must refer to the proposal the person actually reviewed. No refresh/rebase is allowed to legitimize stale form input.

## 4. Proposed acceptance request and transaction order

The narrow client request contains a protocol version, proposal ID/version/digest, immutable request UUID and expected actor. Exact names/signatures should be frozen only after the database capability exists. It contains **no target numbers, new eligibility claims, policy enable flag, arbitrary user override, revised CAS or new source calculation**.

Required server sequence:

1. Authenticate and derive the owner. Reject missing/anonymous identity, owner mismatch, malformed/oversized input and unexpected keys. A high-privilege connector key is not a substitute for the user's identity.
2. Look up the exact owner/request receipt before deciding whether a **new** write is permitted. Bind the receipt to operation, proposal ID/version/digest and original request bytes. Changed input using the same UUID is rejected.
3. If a committed receipt exists, reconcile it **without any mutation or recalculation**, even if the policy is now OFF, revoked or expired. Return the committed result with an explicit distinction between current and superseded accepted goal. Never report a superseded goal as today's active target. Do not create another acceptance merely because the caller lost the first response.
4. For a new acceptance, require server-side release approval, matching valid policy/algorithm artifacts, current consent/eligibility/completeness and the proven writer-barrier capability. Every missing/unknown/expired condition blocks writes. Observation opt-in alone is insufficient.
5. Acquire the canonical per-owner transaction barrier and the existing profile/goal locks in a documented order shared by all participating operations. Acquire policy/proposal/receipt coordination required for revocation and one-time consumption in a compatible order. Bound lock waits and fail without side effects on timeout/deadlock.
6. Under that barrier, obtain a fresh coherent enriched snapshot, compare the proposal's source fingerprint, revision, goal/profile CAS, settings, entitlement, anchor and eligibility/completeness. Recompute/validate with the exact trusted algorithm and policy, not client-supplied values. Check expiry and server civil day. Any drift rejects the old proposal; do not generate and accept a replacement in the same request.
7. Preserve current no-reduction/product-floor protections until a separately reviewed and authorized replacement explicitly changes them. Revalidate goal reached/contradictory direction, stop criteria, bounds, cumulative changes, cooldown, full macro consistency and unchanged journey/intent. Engineering limits are not marked clinically validated.
8. Atomically create the new accepted goal, deactivate only the exact prior active goal, consume the proposal, and insert a receipt/audit entry. A failure at any stage rolls back all of them. The anchor and accumulated adjustments remain traceable; no hidden journey reset, opt-in, questionnaire, weight record or food write occurs.
9. Return a receipt with request/proposal identity, accepted goal snapshot and versions. The client verifies it, then refreshes accepted data for the next action. That later refresh cannot alter the already-issued request or be confused with server transaction validation.

Uniqueness must cover both `(owner, request UUID)` and proposal consumption, so a second client using another UUID cannot accept the same proposal twice. Receipt queries remain owner-scoped and never reveal another actor's request existence.

## 5. Writer consistency barrier: the missing capability

An effective per-owner source revision can be a design option, but it needs a complete rollout. All inserts, updates, deletes, owner/parent changes and cascading operations that affect observation input must serialize through it in the **same transaction**. That includes old clients using direct CRUD, relevant server jobs/imports, observation settings, manual goals, restart, profile changes and entitlement/eligibility changes that matter to acceptance.

The acceptance must hold this same barrier until commit and read the snapshot after acquiring it. A writer that begins earlier but has not committed must either be observed before validation or serialize strictly after acceptance; it cannot commit a relevant hidden change between final validation and acceptance commit.

Important implementation traps to resolve before writing deployable SQL:

- New triggers alone can introduce inverse lock order with existing user→goal operations. Review row locks already taken by the statement, and test deadlock/rollback behavior across actual writers.
- Meal items have no owner column; derive ownership through the real meal relation. Parent deletion/cascades and moving a parent or child require preserving both old and new owner scopes. Do not invent `meal_items.user_id` or let a missing parent silently bypass the barrier.
- Multi-owner administrative operations need deterministic ordering or explicit rejection; client `auth.uid()` alone is not sufficient for service-role jobs or cascades.
- Prevent bypass through direct writes, function wrappers, disabled triggers, ownership changes or broad administrative paths. Document any administrative exception as requiring adaptation shutdown.
- Under PostgreSQL READ COMMITTED, take the fresh read after the lock. An old REPEATABLE READ snapshot must not be mistaken for a refreshed current state. Isolation level, revision-update behavior and retry semantics require explicit tests.
- Existing source limits and invalid/ambiguous values must fail closed within the barrier; no pagination or independent read after releasing it.
- A registry marker or test mock claiming `writerBarrierVersion` does not establish coverage. The production writer inventory and transactional tests must prove it.

**Rejected shortcuts:** global `LOCK TABLE` blocking other users; an advisory lock taken only by acceptance; hash-before/hash-after with a write between; existing-row locks that miss inserts; source counts or maximum timestamps as universal revision; changing to SERIALIZABLE in only one client call and assuming all direct writers now participate. No such shortcut is implemented or proposed for activation.

## 6. Client recovery and explicit acceptance

- Only a visible, server-issued, eligible proposal can lead to an explicit individual acceptance. No acceptance on mount, foreground, notification, scheduled job, refresh or restored journal.
- Persist the original request/proposal identity before sending. An uncertain outcome permits only explicit reconciliation or exact replay of that request, not a new UUID, regenerated proposal or refreshed CAS.
- Account change invalidates the view and in-flight callbacks; it must never transfer a prior owner's proposal or journal into the next account.
- A known conflict or validation rejection blocks automatic retry. Ask for review of fresh state, preserving evidence of the old request rather than silently relabelling it.
- Transport failure is not proof that nothing committed. Resolve the receipt first. New-write disablement must not strand a previously committed request in permanent ambiguity.
- Display proposed before/after calories and complete macros, limitations and rationale before accepting. Do not label an expenditure estimate as an intake target.

## 7. Required acceptance QA before wiring a write-capable adapter

| Test | Required outcome | Verified here? |
| --- | --- | --- |
| Missing/anonymous/cross-owner request | No proposal/goal disclosure or write | Design only for new API |
| Missing/draft/revoked policy; unverified eligibility/completeness | No new write | Design only |
| Client changes target numbers or enables policy | Reject unexpected input | Design only |
| Null CAS, timestamp precision, same request exact replay | Preserve exact original versions | Existing manual patterns inspected only |
| Same UUID/different proposal or payload | Mismatch, no mutation | Design only |
| Same proposal/two UUIDs or two clients | Exactly one acceptance | Not run |
| Lost response, then policy OFF | Owner can reconcile committed receipt; no second write | Not run |
| Lost response, then manual goal/restart | Receipt says historical/superseded; never overwrites current | Not run |
| Source insert/update/delete/parent cascade during acceptance | Serializable per-owner ordering or conflict, never hidden stale acceptance | Not run |
| Settings, entitlement, eligibility, policy revoked during acceptance | Ordering/revalidation prevents unauthorized new acceptance | Not run |
| Goal reached, contradictory target, reduction, floor/macro violation | Block; do not substitute another target | Design only |
| Failure after deactivation/before receipt | Entire transaction rolls back | Not run |
| Background, account switch, offline retry, restore journal | No automatic acceptance or actor crossover | New API not wired |

Pure-function unit tests and memory adapters are useful but cannot prove these database interleavings. Actual multi-session tests need authorized execution, verified identity and a restoration plan. No live synthetic fixture or environment was created for this review.

## References and operational note

- [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html): a stable snapshot and serializable ordering are distinct guarantees.
- [PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html): lock conflicts and consistent acquisition order must match the participating transactions.
- [PostgreSQL 17 function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html): STABLE functions provide statement-snapshot behavior; they are not source-write locks.
- [Supabase functions](https://supabase.com/docs/guides/database/functions): preserve explicit function privileges and ownership checks; no broad grants to make an adapter work.

The Supabase changelog was checked on 2026-11-13. A [2026-10-30 timezone-data advisory](https://supabase.com/changelog/tzdata-local-time-vancouver-edmonton-casablanca) applies to some older hosted versions using Vancouver, Edmonton or Casablanca. This review did not establish whether an affected zone is relevant to this account or the exact service-image version. Do not assert the person's dates are wrong or perform an upgrade; include timezone-rule conformance in the future supported-population validation if those zones are enabled.
