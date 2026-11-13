# Coherent observation source contract and QA plan

**Read-only RPC and Progress v15 integration installed 2026-11-13. No prescription or recommendation is enabled.** This document began as a design against production Progress v14. See `IMPLEMENTATION_STATUS.md` for the current, separately verified implementation status. No account rows, synthetic live fixtures or new environment were used.

## Verified v14 gap (reader replaced in v15)

Progress v14 queries profile, tracker, paginated check-ins/tracker entries/meals, and then meal items separately. Exact row counts and duplicate-ID checks detect some truncation/races but not updates with unchanged row counts. Its context fingerprint covers profile/goal/settings, not the food/weight content.

`node scripts/diagnostics/tdee-source-consistency.cjs` executes the exact downloaded runtime with a simulated database adapter. One atomic simulated writer changes `(weight=80, calories=2000)` to `(weight=81, calories=2500)` between reader calls. The reader returns `(weight=80, calories=2500)`, which existed in neither complete state. All row counts remain unchanged. The diagnostic deliberately exits **1** when this gap reproduces; exit **2** means the diagnostic itself failed. It is not counted as a passing CI regression test or evidence of a race on the user's account.

Fixture SHA-256: `fa702fd1beb809c507a65c63ab72d2b5e1f9c60d9c0aa9e5951bc1b787632416`. The inert fixture is not an activated replacement service.

## Proposed API boundary

One additive, versioned, read-only RPC, tentatively `observed_get_tdee_snapshot_v1()`, without a selectable user ID. It derives owner from `auth.uid()`, rejects absent/anonymous authentication, and preserves premium/explicit observation opt-in. It must not write settings, activate a program, mutate a goal or bootstrap records.

Return one envelope containing:

- Contract version, owner ID and one server capture timestamp.
- Timezone validated against the catalog; civil `today` and source-window start derived once from that timestamp.
- Context: premium, observed enabled/review day, unique accepted goal, existing context fingerprint, `proposal=null`, `reviewDue=false`, safety disabled/unverified.
- `sources` compatible with the existing `DataSources` interface below. Preserve raw values/units and conflict detection; do not move nutrition interpretation into SQL.
- Explicit complete counts for each source and a deterministic content fingerprint over ordered context/source rows. The fingerprint is an observation identity, **not authorization, a lock or proof of dietary completeness**.

Use `STABLE`, `SECURITY INVOKER`, a closed search path and fully qualified names. Revoke the new function’s default EXECUTE from PUBLIC/anon in the same deployment transaction and grant only authenticated; no exposed interval with default broad EXECUTE. Materialize context and source arrays in one SQL query/snapshot. Do not wrap the existing VOLATILE context helper and call that atomic: production catalog confirms both `context_for_actor` and the public context wrapper are VOLATILE. Re-express their reads in the single snapshot query with equivalent semantics. The existing premium predicate is STABLE and may be reused only after confirming its effective scope/grants at implementation review.

A server timestamp belongs to the snapshot, not a client clock supplied in an argument. The engine must use the snapshot's captured timestamp rather than independently computing a different date after reading.

## Exact data mapping to preserve

| Source | Fields | Scope |
| --- | --- | --- |
| users | timezone, date_of_birth, journey_start_date, updated_at | id = authenticated owner; updated_at is profile CAS only |
| goals (context only) | id, user_id, is_active, updated_at, daily_calories, protein_g, carbs_g, fats_g, fiber_g, macro_preset, goal_type, loss_rate_lbs_per_week | authenticated owner and active=true; duplicates reject |
| trackers | id, unit | owner, is_default=true, case-insensitive name=weight; more than one rejects |
| tracker_entries | id, tracker_id, date, value, created_at | owner plus owned tracker; 29 completed-day window |
| check_ins | id, date, weight, updated_at, created_at | owner; weight non-null; same window |
| meals | id, date, meal_type | owner; same window |
| meal_items | id, meal_id, calories, is_scheduled | JOIN owned meals; is_scheduled=false |

There is **no meal_items.user_id column**. Never invent or filter by it. Preserve `estimateFromSources` conversions, latest-read precedence, same-time conflicts, cross-source disagreement, unit validation, unknown calorie provenance and partial/missing-day rejection. Do not sum away zero/unknown items or choose an arbitrary active goal. Do not use MAX(updated_at) as a universal revision: some sources do not have that field, and deletion must also be represented.

Retain the existing limits (5,000 rows per source, 500 meals), checking excess within the same snapshot. Overflow returns a bounded error; no silent truncation and no follow-on pagination outside the snapshot. Preserve the journey-date cutoff semantics in the adapter; do not backfill history.

## Read-only ACL/RLS preflight actually performed

Production catalog on 2026-11-13 confirms:

- Authenticated role has schema usage and SELECT on private observation settings; anonymous does not have SELECT there. RLS is enabled and the read policy is `auth.uid() = user_id`.
- The seven public source tables above have RLS enabled and authenticated SELECT. Their SELECT/ALL policies are owner-scoped; meal items use the ownership JOIN through meals.
- The current context and identity functions are invoker functions; authenticated can execute them. Context is VOLATILE, not STABLE.

These are catalog observations, not a successful call of the proposed RPC. They resolve the initial uncertainty about needing broad grants for private settings: **none is justified by this preflight**. Do not add service-role access, SECURITY DEFINER or broader grants to make the candidate work. Preserve RLS and explicit owner filters even where existing table grants also include anon; a table grant alone is not evidence that anonymous can read a row.

## Required QA before integration

| Case | Expected result | Status |
| --- | --- | --- |
| Static source equivalence | Same DTO/engine output as v14 for identical data | Planned |
| Missing/anonymous auth; other actor IDs | Rejection/no other-owner rows | Planned |
| Invalid timezone/DOB/units; duplicate trackers/goals | Fail closed, no fallback/default | Planned |
| Zero/unknown energy, scheduled entries, partial/missing days | Preserve current unavailable/paused behavior | Planned |
| Source overflow / 500-meal limit | Bounded error, never partial success | Planned |
| Stable clock at timezone midnight/restart | One coherent day/window/context | Planned |
| Equal-count updates, inserts and deletes | Content fingerprint changes correctly | Planned |
| Two sessions, one atomic committed writer | Entirely before or entirely after state, never mixed | Not run |
| Client writers using multiple transactions | Expose valid intermediate committed states; do not call them complete | Separate unresolved write/completeness contract |
| Settings/goal changed after read | Reconcile/discard appropriately; no automatic proposal | Planned |
| HTTP marker, owner, disabled/premium gate | Preserve observation protocol and refusal of review/accept/reject | Planned |

A multisession test with a committed transition requires specific authorization, a permitted execution path and verified restoration. Rolling both sessions back tests dirty reads but does not prove every committed-interleaving behavior. No test environment, cluster, service or synthetic account was created.

## Integration and rollback plan

1. Independent SQL/security review and catalog recheck; no changes to current helpers until reviewed.
2. Add only the read-only RPC and minimal EXECUTE permission; verify authenticated/anon isolation.
3. Read-only equivalence probes on authorized data, then explicit concurrency QA under separately approved constraints.
4. Change the observation reader to consume that RPC envelope; preserve estimator/markers and all recommendation rejections.
5. Keep old source as rollback candidate. Do not fall back silently on RPC failure: return unavailable, since silent fallback would defeat the consistency guarantee.

Snapshot coherence is not clinical validation, dietary completeness or authority to alter targets. Source rows may change after capture, and a point-in-time snapshot cannot repair multi-transaction writers. Future consequential adaptations still need atomic revalidation and professionally reviewed eligibility/limits. This document closes the requested design/QA preparation only, not that backend implementation or account/device validation.
