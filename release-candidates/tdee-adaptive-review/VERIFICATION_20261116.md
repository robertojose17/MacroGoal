# TDEE integration verification — 2026-11-16

## Installed and verified
- Observation consumer: progress-intelligence v18. Revision-bound nutrition evidence projection installed as migration 20261116120255.
- Revocable tester registry expiry stabilized in migration 20261116120926. Actual purchase verification and its 30-second expiry were not weakened.
- Signed-in observation settings and server-adjacent provider refresh succeeded; observation was enabled temporarily, the positive authenticated snapshot included the evidence marker, and observation was restored OFF. Recommendations remained OFF.
- Installed snapshot explicit-zero/revocation checks passed using actual fresh purchase verification. Own-account fictitious data was restored and verified.
- Independent overlapping read/edit and read/revoke probes preserved coherent statement snapshots; subsequent reads invalidated evidence.
- Bounded 5,001-distinct-item projection and JSON aggregation took about 1.53 seconds in a rollback transaction. This is not a universal latency guarantee.

## Source-only manual allocation
The candidate now supports persisted exact basis-point percentages with deterministic nearest-gram rounding. It requires existing reviewed nutrient constraints and bound consent. It never normalizes the chosen percentages, switches to Smart, or redistributes grams to conceal infeasibility. Smart retains its existing protein-preservation behavior.

The allocation mode is carried through draft and proposal evidence. The rollback-only SQL hardening candidate validates the locked current choice, recomputes manual grams, retains all existing calorie, review, revocation, expiry and receipt defenses, and is fenced to the inspected live acceptance body. **That SQL hardening is not installed.**

## Checks
- Full canonical source graph: 65 files; complete Deno check PASS.
- Combined candidate suite after the manual changes: 194 tests PASS, 0 failed/skipped.
- Includes 11 acceptance-endpoint OFF/contract tests and 14 new manual cases (including a 930-combination arithmetic grid).
- 50 read-only PostgreSQL/JavaScript rounding cases matched.
- Live authenticated missing-proposal rejection and terminal rejected-receipt replay passed in rollback.
- The deliberate parser expectation change now rejects a manual choice lacking persisted split/version as manual_percentage_choice_invalid, rather than the obsolete blanket custom_percentage_review_required.
- No release-switch rewriting, software installation, new environment, operational policy seed or fabricated approval evidence was used for these checks. GitHub CI status is separate; local passes do not assert CI passed.

## Remaining release gates
recommendationsEnabled=false, acceptanceEnabled=false and reviewedPolicyId=null remain unchanged. The new manual/acceptance candidate is source-only and is not the deployed observation bundle.

The 14-day route now has a pure preparation bridge and an optional authoritative-review orchestration phase, described below. It still cannot issue an actionable live proposal. Operational policy/applicable review records, live scheduling, SQL hardening execution and positive proposal→explicit acceptance→goal/history/consumer synchronization remain unfinished. No positive enabled core-acceptance test is claimed.

The user's reference ranges and approval authorize design/implementation; they are not evidence of an independent clinical validation or of any particular person's eligibility. Do not seed fictitious reviewed operational records to pass activation gates.

No TestFlight submission occurred.

## Subsequent 14-day and daily-scheduler source integration
- The 14-day bridge recomputes the actual snapshot diagnostic and 8-weight/10-complete-day coverage. It binds an explicitly supplied reviewed uncertainty interval and conversion to exact owner, goal revision, profile, journey, policy, source and calendar window. It checks the actual receipt chain rather than accepting a receipt-verification boolean.
- Synthetic positive preparation uses the existing bounded macro allocator, a maximum 200 kcal step, unchanged cooldown and explicit acceptance. It does not estimate confidence from pairwise slope extrema, invent a review, replace the 14-day route with the legacy 21-day model, or authorize calorie reductions.
- The orchestration phase defaults closed without an authoritative reviewed-rate loader. Even successful preparation ends at rate_acceptance_contract_unavailable with no issuer call or externally offered proposal. Source artifacts are not a live feature.
- The pure daily scheduler uses local calendar dates and stable goal/profile/journey scope, not rolling food fingerprints. Atomic claim/revision contracts, claim revalidation, interrupted outcomes, authoritative reconciliation, DST/timezone changes and first-uncertainty plus seven elapsed days are covered. Daily polls do not postpone the seven-day deadline. The immutable scheduler switch remains OFF and invokes no ports.
- The rollback-only acceptance SQL candidate now uses the requested 19+ age floor and explicitly rejects the new 14-day/rateEvidence contract until an acceptance-time validator exists. Source assertions check these guards; SQL execution is not claimed.

### Decisions and implementation still required
1. Define and validate the uncertainty method that can supply the reviewed interval. Coverage alone does not establish precision. No method or interval has been approved or manufactured by these tests.
2. Define the initial 14-day anchor/calibration contract. The bridge requires a genuine existing receipt-verified anchor; it does not bootstrap a baseline expenditure from insufficient evidence.
3. Bind actual operational policy limits and individual nutrition eligibility, including protein reference weight and any exceptions. Define individual total-deficit handling before allowing reductions.
4. Implement authoritative rate-review loading/storage, acceptance-time locked revalidation, durable scheduler ledger/hold storage and bounded scheduler dispatch. No cron or persistent schedule was installed.
5. Verify positive acceptance and all downstream goal/history/consumer synchronization, revocation, expiry, replay and concurrency using genuine prerequisites, then consider activation. User approval of implementation is not a substitute for those engineering checks.

### Final integrated checks for this source increment
- 233 tests passed, zero failed/skipped: the 194-test baseline plus 12 new 14-day tests, 25 scheduler tests and 2 SQL-source assertions.
- Deno type checking passed for every candidate TypeScript module and the full observation entrypoint import graph using existing cached tooling.
- Independent review found and fixed scheduler completion-time clock rollback and malformed-hold handling; both have regression tests.
- No live data, database definitions, deployment, TTL, release switches or TestFlight state changed in this increment. Source-only checks do not prove enabled scheduler concurrency or live acceptance.

## Installed inactive infrastructure and subsequent verification
Migration `20261116124243_private_inactive_tdee_review_scheduler_infrastructure` installed empty private reviewed-rate storage, its service-only getter, a private binding-inspection helper, and private scheduler ledger/receipt tables. The helper explicitly does not authorize acceptance. No scheduler role, credential, cron, operational policy, approved review, Edge deployment or release switch was created/enabled. The production acceptor definition is unchanged.

Verified database state after tests: all three new tables empty, zero operational policies, 33 pre-existing cron jobs unchanged. Anonymous/authenticated roles cannot access the new tables/getter/helper; service_role can only SELECT/INSERT the rate review table and call its getter, not access scheduler storage or the inspector. RLS is enabled on all three tables. The security advisor added three expected private deny-all/no-policy informational entries (55 to 58); all other category counts were unchanged. [RLS/no-policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The authoritative loader is now wired in source to the fixed service review getter, own-bearer persisted macro choice and service nutrition review. Exact provenance/version/timestamp validation fails closed. Typed evaluator results now feed scheduler hold/receipt persistence; unknown or blocked outcomes never clear a hold. These runtime changes remain OFF and are not deployed.

### Checks completed
- Integrated suite: 260 tests passed, zero failed/skipped. Every candidate TypeScript module and observation entrypoint passed Deno checking with existing cached tooling.
- Actual PostgreSQL own-account rollback test passed ledger insertion, first CAS success, stale CAS rejection, receipt insertion and fractional-revision constraint rejection. No fixture remained.
- Genuine overlapping own-account SQL sessions passed: writer ran 12:50:55.800924–12:51:25.816975 UTC and changed one row; competing stale CAS ran 12:50:58.278221–12:51:25.820282 UTC, waited 27.542 seconds and changed zero rows. The temporary ledger fixture was removed and emptiness verified. Two earlier non-overlapping attempts are not counted as concurrency proof. This tests database serialization, not an enabled worker identity or full scheduler execution.
- Full manual-macro/19+ acceptance candidate compiled inside rollback, then passed missing-proposal rejection, identical receipt replay, modified-replay rejection and unchanged own goals. The first test harness had an ambiguous variable, was corrected, and the retry passed. No reviewed policy/proposal fixture was invented. Production acceptance code and receipt state were restored by rollback. Positive acceptance branches remain unverified.
- Service getter malformed-request rejection and private inspector unauthenticated rejection passed. Five read-only PostgreSQL timestamp precision cases matched the intended millisecond wire representation.
- A fenced empty-table rollback plan is prepared, not executed. Exact installed migration and 14 source/test files were read back from GitHub after publication. Local checks do not assert GitHub CI success.

### Remaining real gates
- No validated uncertainty method/current reviewed evidence or initial 14-day calibration anchor is available. No confidence interval can be inferred merely from coverage or pairwise extrema.
- Persisted policies lack `increment_kcal`; the loader deliberately rejects the missing field instead of inventing an operational value. Actual policy limits and individual nutrition eligibility still need explicit, applicable records.
- The new binding inspector is only one acceptance validation layer. Full rate arithmetic/coverage parity and positive acceptance remain unfinished; the explicit 14-day issuance/acceptance block is retained.
- At this checkpoint the persistent scheduler lacked a deployed internal worker binding; the subsequent section records the implemented alternative. No synthetic JWT, extended proof TTL or new worker credential was used.
- No recommendations or acceptance were activated; no TestFlight submission occurred.

## Internal daily-worker path, kept OFF
Migration `20261116131704_inactive_internal_tdee_worker_context_and_persistence` installed explicit-owner private context readers, a bounded trusted selector and cursor, and an atomic scheduler RPC. Four public wrappers are executable only by the existing service role and return disabled/blocked before any owner/data/cursor work. Private readers and cursor remain inaccessible to anonymous, authenticated and service roles directly. No existing user's session is impersonated.

The source composition uses the existing server-injected service key and RevenueCat V2 API key, actual provider evidence refresh, and exact cache-version plus tester-registry revalidation before/after context reads and evaluation. It preserves the 30-second purchase proof, revocation and stable context binding. It invokes the real 14-day diagnostic, persists diagnostic-only completion/uncertainty through atomic RPC, and does not issue a proposal. All immutable release switches remain OFF. No keys were read, created, published or copied into source. Canonical existing provider modules are imported rather than duplicated.

### Verification at this checkpoint
- 312 tests passed, zero failed/skipped; complete candidate graph and observation entrypoint passed Deno using existing cached tooling.
- Eight synthetic runtime integration tests include the actual 14-day evaluator, hold persistence, deduplication, cache/registry change, cancellation, stale/foreign context and unknown completion. These are not authenticated live worker end-to-end proof.
- Full SQL compiled in rollback and all four service-role OFF responses were tested; the same responses were verified after installation. Earlier own-account read-only service-role context probe succeeded in rollback, with no user JWT spoofing; its temporary probe wrapper was removed.
- Selector cursor is untouched (revision 0, no owner), ledger/receipt/rate-review tables remain empty, existing cron job count is still 33, and production acceptor definition remains unchanged. Anonymous/authenticated EXECUTE is absent on every new function; only the four fixed public wrappers grant service-role EXECUTE.
- Atomic claim rechecks current enrollment/context/timezone and rejects unfinished claims from any old context. The selector bounds scans and returned owners, uses a persistent fair cursor, and does not anchor daily scope to rolling log fingerprints.
- Empty-state/OFF rollback is prepared but not executed. No Edge function, scheduled invocation, cron modification, recommendation activation or TestFlight submission occurred.

### Actual remaining work
The internal authentication/context alternative is implemented; user JWT lifetime is no longer the architectural blocker. Remaining work is packaging/deploying the OFF Edge entrypoint, verifying it without exposing existing credentials, and subsequently running a bounded real diagnostic-only worker path after its gates are reviewed. A background cron has not been installed or enabled. This is not a claim of daily operation while the app is closed.

Actionable recommendations and explicit acceptance still require genuine uncertainty/calibration and applicable policy/nutrition evidence, full acceptance-time arithmetic/coverage parity and positive downstream verification. Source composition and SQL OFF checks do not satisfy those release gates. No fabricated approval or operational review records were seeded.

## Verified inactive Edge transport through an existing compatibility slot
Creating a separate Edge function was blocked by the project's 100-function quota. No plan, spend cap or deletion was performed. Investigation ruled out replacing backfill-tdee-estimates (eight invocations in the observed 24-hour window) and onesignal-inspector (current bug-report dependency).

The selected ai-coach-daily v13 was an explicit superseded compatibility stub, with no code dependencies found by repository search, no SQL/cron reference, and no events/invocations in the observed 24 hours. These checks do not establish that no older/manual caller exists. Therefore its normal compatibility response is preserved exactly, rather than removing it.

With owner authorization, ai-coach-daily v14 now includes an exact internal subpath. Gateway verify_jwt remains true. Every other request retains the original 200 JSON compatibility response. The immutable internal OFF guard precedes imports, body reads, keys and data, returning 503 disabled; no CORS access is added. A separate lazy exported handler avoids initializing another Deno server.

### Actual checks
- The existing Vault credential was used inside the database only for bounded fixed-destination HTTP probes, never exposed in output or source. It passed the actual existing JWT gateway; the existing coach-daily-insight auth-check separately confirmed exact internal-key authentication before business logic. No credential was created or user impersonated.
- After deployment, normal compatibility request returned 200 with its original JSON; authenticated internal request returned 503 disabled; the same internal path without authentication returned gateway 401. No request timed out.
- All 22 files returned by deployment readback matched their submitted contents exactly. Six type-only dependencies were omitted by the bundler. The full local entrypoint passed Deno; executable entrypoint tests verified normal compatibility, OFF and zero key/network calls. The three dispatcher tests additionally cover exact-path selection and unchanged forwarding; the broader candidate suite has 315 passing tests.
- Cron count remains 33, scheduler ledger/receipts empty, selector cursor revision 0, and production acceptor unchanged. Existing progress-intelligence was not modified. No TestFlight submission, active schedule, provider refresh through the new worker, actionable recommendation or acceptance occurred.

The service transport/authentication problem and function quota obstacle are resolved without weakening the gateway. This does not prove an enabled daily evaluation. Worker and SQL gates remain OFF. Genuine calibration/uncertainty/policy evidence, complete acceptance-time parity and positive end-to-end goal/history/consumer checks remain separate requirements.

## Nullable policy shape installed without activation
Migration `20261116142518_nullable_tdee_policy_increment_without_activation` adds nullable integer `increment_kcal` with no default or backfill, constrained to 1 through the policy's own max_step_kcal only when supplied. Policies remain empty. It removes a schema representation gap, not the absence of a genuinely reviewed value or policy.

The DDL first compiled in rollback. Installation metadata confirms nullable/no default and the exact check; cron remains unchanged. The combined suite is now 319 passing tests. Four additional tests verify missing/null/invalid increments fail closed with no fallback, explicit synthetic shape preserves its value, and review/eligibility gates are not replaced by this field. No operational review/policy fixture was inserted.

Remaining decisions are substantive, not transport permissions: validated uncertainty method and its evidence, the initial calibration/anchor contract, an applicable explicit increment and reviewed policy/nutrition limits, and total-deficit handling before reductions. Full 14-day acceptance parity and positive downstream verification remain engineering work. None is inferred from adding a column; worker, recommendations and acceptance stay OFF.
