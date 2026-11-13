# Adaptive TDEE: evidence and fail-closed gates

Date: 2026-11-13. Status: **design for review only; recommendations and acceptance OFF**. This document is neither professional approval nor release approval. It contains no user data. No runtime, UI, SQL, account, deployment or scheduler is changed by this review.

## 1. Evidence matrix

Sources were checked again on 2026-11-13. CDC/NIDDK and AHA/ACC/TOS full text were accessible. NICE direct chapter returned 403; its official indexed chapter/PDF and update listing were inspected. Hall PMC pages returned browser challenges; primary-paper indexed text and PubMed abstracts were available. No challenge was solved. The earlier evidence review is `docs/testing/dynamic-calculation-policy-20261113.md`; its historical test/deployment counts are not current release evidence.

| Primary source and date | Supports | Does NOT support |
|---|---|---|
| [CDC, Steps for Losing Weight](https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html), 2025-01-17 | Gradual loss around 1–2 lb/week is associated with maintenance. Medicines, conditions and individual circumstances matter. | A required rate for every adult; diagnosing a plateau from a short window; an automatic weekly deficit escalation. |
| [NICE NG246, dietary approaches](https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet), published 2025-01-14, guideline updated 2026-01-08; recommendations 1.16.8–1.16.12 | 800–1,200 kcal diets only in supported, multicomponent specialist pathways for specified overweight/obesity populations; under 800 needs further clinical indication. Low/very-low-energy diets require nutritional completeness, supervision and a duration no longer than 12 weeks. Comorbidities, medicines and eating-disorder concerns require assessment. | 1,200 kcal as a universal safe floor; unrestricted use of such diets in an app; permission to classify eligibility from BMI or sparse profile fields alone. |
| [NIDDK Body Weight Planner](https://www.niddk.nih.gov/bwp), editorial date not displayed | Tool is for adults 18+, not pregnancy/breastfeeding. It enforces 1,000 kcal/day because lower intake fails its food-group/nutrient targets; unusually low metabolism/very sedentary circumstances can produce overestimates. | 1,000 kcal as a safe prescription, permission to lower our existing floors, endorsement of our model, or proof that missing pregnancy/lactation information means absent. |
| [AHA/ACC/TOS guideline](https://pmc.ncbi.nlm.nih.gov/articles/PMC5819889/), 2013-11-12 | Comprehensive overweight/obesity interventions include individualized intake ranges (1,200–1,500 women; 1,500–1,800 men) OR 500/750 kcal deficits among strategies. | Stacking a new deficit onto a goal already containing one; universal minimums; a dose recommendation for normal/underweight adults or this adaptive algorithm. This is an older contextual guideline, not asserted to be the latest complete standard. |
| [Hall et al., energy imbalance and bodyweight](https://pubmed.ncbi.nlm.nih.gov/21872751/), 2011-08-27; [full paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/) | Dynamic adaptation and body composition matter; their model was compared with controlled intervention data. Water/glycogen-related change cannot simply be treated as tissue energy. | Validation of our 7,700 kcal/kg approximation, linear long-term forecasts, exact individual expenditure inferred from a few weeks of diary entries. |
| [Hall and Chow, changes in free-living energy intake](https://pubmed.ncbi.nlm.nih.gov/21562087/), online 2011-05-11; [paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC3127505/) | In their different model and simulated free-living subjects, more than 28 daily weights were needed for intake-change estimates with a 95% CI under 300 kcal/day; fluid changes affected transition estimates. | Our absolute-TDEE method, a universal 28-day sufficiency threshold, 21 days as clinical validation, or interpreting our sensitivity interval as a statistical CI. |

The apparent energy-floor differences concern different populations, tools and supervised pathways. Do not resolve them by choosing the smallest number. Existing 1,200/1,500 product references remain, but passing a reference does not establish safety. Engineering choices such as 100 kcal/week, 5%, a cooldown, 21 days, 10 weigh-ins, rounding to 50, and a five-minute cache TTL have no clinical endorsement established here.

## 2. Eligibility and stopping matrix

All entries below are requirements for a future reviewed policy, not a newly authorized questionnaire or clinical diagnosis.

| Condition | Software response now | Evidence/uncertainty |
|---|---|---|
| Missing/invalid DOB, under 18 | No adaptive proposal or acceptance | Adult-only scope; use verified existing DOB, never an age-derived invented date. |
| Pregnancy/breastfeeding known, or relevant eligibility unknown | No adaptive authorization | Explicitly excluded by NIDDK tool. Current contracts do not establish these facts; do not infer from sex, age, goal or silence. |
| Eating-disorder concerns, conditions or medicines affecting nutrition/weight | Require qualified assessment; do not automate classification | NICE/CDC describe assessment needs. Normal BMI does not establish absence of an eating disorder. No sensitive screening collection or external disclosure is authorized by this work. |
| Underweight, unsafe target, unexplained change, illness/fluid-related concerns | Withhold changes pending reviewed population/stop rules | Existing observation is not a clinical assessment. Do not invent numerical stop thresholds. |
| Loss target reached/passed or loss target above current weight; inverse for gain | No continuing deficit/surplus or automatic change of goal type | Validate explicit goal direction against a fresh, source-attributed weight. Missing/conflicting/stale weights fail closed. A maintenance transition requires a separately reviewed, explicit choice. |
| `low` confidence or `loggingCompleteness: unverified` | Observation only | Every current estimated result has these markers. More rows, premium or opt-in cannot transform them into validated evidence. |
| Missing dates, source conflict, unknown/zero calorie provenance, incomplete day | No adaptive authorization | Keep diary intact; never impute zero or “complete” from three meal labels. User attestation, if later designed, is not independent validation. |
| No signed/versioned qualified policy review and validation record | Global OFF, including non-reducing proposals | An increase is not automatically appropriate either. User acceptance and software passing tests do not replace this review. |

## 3. Actual contracts inspected

- `utils/dynamicTdeeObservation.ts`: observation-v1, confidence low/null, completeness unverified, proposal null, reviewDue false. Its client parser intentionally rejects proposals. Do not overload this existing envelope or enable actions through a build flag.
- Candidate `supabase/functions/observed-snapshot-release/functions/observed-program/{snapshot,handler}.ts`: owner-scoped versioned snapshot, server capturedAt, context fingerprint, sourceFingerprint, exact counts and raw DataSources; disabled/nonpremium sources/counts null; GET estimates using server time; review/accept/reject return 409. A coherent snapshot is not proof of complete food intake or of stability until acceptance.
- `utils/saveNutritionGoal.ts`: existing atomic RPC `save_accepted_nutrition_goal_v1`, immutable request UUID, full expected goal and profile timestamp, actor, operation (`manual_goal` or `initial_onboarding`). It rejects calorie reduction; manual profile patch allows only activity_level. Do not label an algorithmic proposal `manual_goal` to bypass provenance or safety.
- `utils/nutritionGoalRequest.ts` and durable journal: retain uncertain input for explicit same-request replay, distinguish operation scopes, reject stale actor and definitive conflicts. New adaptive acceptance must not reuse a manual/restart journal scope accidentally.
- `utils/onboardingNutrition.ts`: preserves existing product floor and no-reduction guards. No adaptation may loosen them under this candidate.

No current contract carries professionally verified clinical eligibility, validated intake completeness, or a policy approval record. These missing capabilities are blockers, not booleans that may be set to true in a fixture and treated as production approval.

## 4. Proposed software barriers (not an installed schema)

1. Separate server-authoritative policy activation, clinical eligibility and data quality gates. All must be satisfied independently. Missing/expired/revoked/version-mismatched evidence denies proposal and acceptance. Public metadata, client flags, premium, user consent and successful observation are not authority. Today, the conjunction is false.
2. Keep review drafts inert. A future proposal must be server-derived and bind owner, exact accepted goal/version, profile CAS, policy/engine versions, snapshot source/context fingerprints, capturedAt, evidence window, full target/macros and expiry. Do not accept client-recomputed amounts. Bind all consequential fields to one immutable proposal identity.
3. Preserve no-reduction, product floors, positive finite integers, macro-energy consistency and complete targets on both proposal and acceptance. Do not silently clamp invalid candidates or translate unknown sex/weight into a floor/default. Do not weaken an existing guard just because it prevents a desired adjustment.
4. Never stack deficits: do not subtract a new “weekly adjustment” from a goal that already encodes a deficit. Future reviewed policy must explicitly define its expenditure basis, intended deficit and cumulative changes, with separate review of direction/goal attainment. No numeric adaptive formula is endorsed in this document.
5. Acceptance is a separate explicit action over exact displayed proposal, not a settings toggle, timer, scheduler, retry, app entry or read side effect. A declined/expired/revoked proposal cannot later be accepted. Cancel must not imply a prior uncertain write was undone.
6. In a future atomic acceptance transaction, authenticate actor, validate receipt/proposal, lock the active goal/profile consistently, verify owner/CAS and policy state, revalidate the coherent sources, apply at most one goal transition and store an idempotent receipt. Exact replay returns its recorded outcome, not a second adjustment; changed payload with same UUID fails. After later changes, replay must not overwrite current state. Receipt lookup order must distinguish an already committed operation from a stale first attempt.
7. **Fingerprint comparison alone has a race.** A source edit can commit after recomputation but before acceptance. Locks only on goal/profile, or an advisory lock not honored by all source writers, do not close it. SQL design must demonstrate a shared writer revision/locking protocol or a viable serializable transaction boundary with conflict handling. Do not assume an RPC can switch isolation mid-statement. Until proven, acceptance stays OFF even if snapshot GET is coherent.
8. Content hashes do not prove history: edit-and-revert (ABA) may restore the same hash. If the reviewed policy requires “no intervening changes,” a monotonic revision is necessary. Source deletes, same-count updates, late/backdated entries, timezone/day-boundary changes and account switches must invalidate appropriately. Capture server time once; never refresh CAS to legitimize an old proposal.
9. Revoke unauthorized execution and raw proposal mutation. Authenticated ownership, RLS and minimum grants remain required; no service-role exposure or permissive SECURITY DEFINER shortcut. Do not persist additional health details in analytics, URLs or public backup evidence.

## 5. Adversarial acceptance criteria for future implementation

These are planned tests, **not executions reported by this document**:

- Every current valid low-confidence/unverified observation produces no actionable proposal; forged ready/high/complete markers cannot bypass server gates. Disabled, nonpremium, no policy, revoked/expired policy and unknown eligibility produce zero target writes.
- Adult boundary, invalid DOB, absent sex/weight, conflicting sources, zero/unknown calories, duplicate IDs and same-count source changes fail closed. Reached/contradictory lose/gain goals never deepen direction or silently become maintenance.
- Existing deficit plus new adjustment cannot subtract twice; below-floor or decreasing target rejects even when “only 50 kcal”; an increasing target still requires all eligibility gates. Macro inconsistency and partial target patches reject without clamping.
- Two proposals against one goal, two simultaneous accepts, manual-save versus accept, restart versus accept: at most one winning transition, explicit conflict for the other, no duplicate active goals or receipts.
- Food/weight writer commits before, during and after snapshot revalidation; includes inserts, deletes, same-count updates and ABA. Prove the chosen isolation/revision guarantee, not just compare hashes sequentially.
- Different actor/token/account, stale goal/profile timestamps, timezone-midnight rollover, changed policy/engine, expired proposal or altered proposed numbers reject with zero writes.
- Lost response before/after commit; interrupted durable storage; relaunch; double tap; logout; background; explicit retry. Exact same UUID/payload returns at most one effect, no automatic retry, no replacement by a fresh CAS. Definitive rejection cannot be replayed as uncertain.
- Cancel/decline/revoke race with accept has a deterministic single outcome. Once accepted, replay does not restore superseded goals. Existing manual/restart journal scopes cannot replay adaptive operations.
- Public/anon/other-account access denied; errors/logs contain no source rows or private health facts. Existing observational endpoint and its client parser remain compatible and non-prescriptive.

## 6. Completion boundary

A technically sound proposal/acceptance candidate can be implemented and tested while disabled. It cannot be called clinically ready, or activated, until the precise policy/population/algorithm and uncertainty/stop criteria have qualified review, independent validation, concurrency proof and authorized real-app verification. Current evidence does not supply that approval. No new data collection, environment, native build or live acceptance is authorized by this document.
