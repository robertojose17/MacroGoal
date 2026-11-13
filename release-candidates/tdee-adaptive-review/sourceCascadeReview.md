# Source and cascade review

Status: metadata review completed on 2026-11-13. The subscription source probe **passed 11 real PostgreSQL checks with forced rollback** after the person completed a valid confirmation. Earlier expired attempts did not execute. No production source barrier or recommendation capability is established by this document.

## Evidence boundary

Read-only PostgreSQL catalog inspection covered the nine source relations and their relevant foreign-key closure, including the Auth and food-catalog boundaries: 117 relations, 166 foreign keys, and 39 custom triggers examined. This closure includes unrelated domains and is not a claim that all 117 relations are TDEE sources. No account rows, credentials, or secret values were read. Private inventory contains definitions and hashes; none are reproduced here.

The private-core rollback and two-session advisory-lock checks passed separately. They demonstrate private queue/lock behavior, not public-source cascades, authenticated acceptance, or complete legacy-writer concurrency.

## Relevant foreign-key matrix

| Parent | Child | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| Auth user | Public profile | CASCADE | NO ACTION |
| Public profile | Goals | CASCADE | NO ACTION |
| Auth user | Meals, check-ins, trackers, tracker entries, observed settings | CASCADE | NO ACTION |
| Meal | Meal items | CASCADE | NO ACTION |
| Tracker | Tracker entries | CASCADE | NO ACTION |
| Foods catalog | Meal items, saved meal items | CASCADE | NO ACTION |
| Foods catalog | Meal-plan items | SET NULL | NO ACTION |
| Food-items catalog | Meal items | SET NULL | NO ACTION |
| Auth user | Foods catalog creator reference | NO ACTION | NO ACTION |

These listed constraints are nondeferrable. Subscriptions have no incoming or outgoing foreign key in the inspected catalog. Trigger names and events determine ordering within each relation; numeric OID order is not a safe substitute for actual nested-cascade testing. No account-deletion test or change is proposed here.

## What can be tested without an account identity

| Scope | Status | What it can establish | What it cannot establish |
| --- | --- | --- | --- |
| Private barrier core with synthetic owners | Passed separately | Queue cleanup, rollback behavior, isolation rejection, observed advisory-lock exclusion | Public-source callbacks or authenticated acceptance |
| One synthetic inactive subscription, always rolled back | Passed 11 rollback checks | Real subscription INSERT, owner-changing UPDATE, non-owner UPDATE, DELETE, deduplication, invalid/noncanonical owner handling, subtransaction rollback, absent-owner cleanup | A real user's entitlement, profile epoch lifecycle, accepted-goal consistency, or application flow |
| Other eight sources: profile, goals, meals, meal items, check-ins, trackers, tracker entries, observed settings | Not covered by the subscription probe | Require a valid Auth/profile parent and separately reviewed, bounded account-scoped fixtures | Cannot use a contextual UUID as proof of identity or bypass foreign keys |

The subscription preparation pins the reviewed source and the inspected columns/defaults, constraints, rules, trigger definitions, function hashes, owners, ACLs, and configuration. It rejects foreign keys or sequences. Only the subscription source trigger is attached temporarily; no other source trigger is attached by this probe. All public writes use one explicit synthetic fixture ID, inactive status, empty entitlements, and no billing identifiers. Updates/deletes additionally require inactive status.

The single transaction has a 2-second lock timeout and 30-second statement timeout, no sleeps, no multi-session hold, and a mandatory final abort. Temporary subscription trigger creation holds a table DDL lock until rollback. This can briefly contend with ordinary subscription writes. Catalog validation occurs after that lock is acquired. Function deployments must remain frozen during the probe: the table lock does not independently prevent a concurrent function-body replacement after validation. No execution is authorized or implied by this preparation.

## Callback and rollback risks

- Meal insertion can write onboarding event/funnel records. These are database callbacks, not evidence of an external HTTP request.
- Profile insertion can create a referral code. A profile becoming premium or a subscription becoming active can create commission records and update referral state. The proposed probe avoids those transitions completely.
- A completed-referral insertion callback contains a Vault lookup and an attempted four-argument HTTP call. The inspected catalog exposes only two- and three-argument overloads; the callback also catches errors. This appears incompatible, but no call was executed and no delivery is claimed. Do not rely on that incompatibility as a rollback guarantee. If repaired, an external request could outlive a database rollback; warnings/logs can also survive it.
- No other direct HTTP/network, dblink, NOTIFY, or dynamic EXECUTE operation was found in the 39 custom trigger bodies examined. This is not exhaustive transitive dependency certification.
- Food-items inserts/updates have private nutrition-audit and identity-reservation callbacks. Its current BEFORE DELETE guard explicitly rejects deletion. The declared SET NULL cascade therefore is not permission to exercise that path. Do not disable or bypass the guard for QA.

## Remaining gates

Public-source rollback checks, real cascade behavior, concurrent legacy writers, profile recreation, and authenticated acceptance remain unproven. The passed subscription probe is a narrow source-callback check, not completion of those gates. Recommendations remain inactive pending the separate correctness, safety, and account-level validation requirements.

## Verified execution

Payload `2a2229869940761fd868936c2ef48e9b0ba4495cc67350844948b79d75a1d109` executed under explicit tool confirmation and reached expected P7700 with **11 checks**, zero profiles created and zero committed source rows. Fresh readback at `2026-11-13 18:05:34.035223+00` confirmed exact equality with the pinned original columns/defaults, constraints, rules, trigger definitions, function hashes, owners, ACLs and configuration. No synthetic row, source trigger, private barrier schema, migration record or owner lock remained. Cron and observation settings stayed OFF/zero, and the snapshot hash was unchanged. See `subscriptionSourceVerifiedResult.json`.

This tests the real subscription source callback within a single transaction for an absent synthetic owner. It does not test a real person's subscription, profile revision, clinical target, native UI or concurrent committed source writers. Other accounts were not used to fill that gap.
