# Smart Macro context port: OFF integration

Candidate source only. No deployment, SQL, review records, consent records, policy defaults or release changes. Tests are prepared and NOT EXECUTED while the runner blocker remains.

The parser derives a minimal request only when all earlier source, policy, eligibility, history and energy guards pass and the sole allocation blocker is macro_context_required. It derives owner/goal/revision/preset/source/policy bindings and current macros from the validated snapshot. The request also binds source capture, profile revision, profile/journey hashes, local today and age calculated from DOB/local date. A null preset is never guessed.

Independent server-port evidence must echo that request exactly and provide review and consent separately. Embedded customChoice inside review is rejected. Raw snapshot/request macro flags never supply this argument. Matching bindings/statuses do not establish review authenticity; the future server storage loader is responsible for real provenance and revocation. The concrete Supabase port now reads the installed own-actor tdee_read_macro_choice_v1 RPC with the original authenticated bearer and public key. It never uses service_role for this read. The source now also prepares a fixed service-only tdee_read_nutrition_review_v1 lookup with the exact validated owner and expected binding, then validates its administrative evidence separately. The nutrition table/getter remain source-only and uninstalled; there are no real review records. Missing lookup or invalid evidence blocks rather than inventing review.

After refresh/reload, the orchestrator enters load_macro instead of issuing. It retains the cloned snapshot in private workflow memory, gives the port the immutable actor, a cloned minimal request and the internal bearer token as a third argument (never in workflow state, HTTP output or logs), and reparses using a fresh clock after await. Source expiration or changed binding blocks. This is snapshot-as-of semantics: it does not assert serialization of all concurrent food/profile writers or live reauthentication after every await. The original authenticated actor remains fixed. Acceptance must still revalidate authoritative state.

The finite interpreter permits seven phases; unknown phases cannot fall through to issuance. Errors, invalid clocks, or missing macro evidence after refresh preserve mayHaveWritten:true because earlier eligibility refresh may have committed. No automatic retries. Private raw context is never returned in HTTP outcomes.

OFF still returns before any port call. There is no request enable flag. Absent, stale, revoked or mismatched preferences carry explicit non-current preference status and block; preserve-percent is represented separately and never silently converted into Smart. Review is never inferred from criteria_confirmed or Premium. RPC errors are sanitized and not retried. OFF still causes zero client creation.

## Custom configuration gap

The old custom UI saved rounded grams and preset custom, not original percentages or Smart consent. Actor-owned versioned/revocable preference storage has since been installed separately; UI integration is coordinated separately. This source change reads only that existing authenticated RPC. No local-only consent is inferred. Preserve-percent stays blocked until exact configuration and its separate reviewed allocator are integrated.

## Remaining work

Authorized verification/installation of the prepared nutritional-review storage/getter, actual verified approval records and verification of the prepared server loader; application verification of preference UI and authenticated loading; acceptance revalidation of macro evidence; approved runner and actual application testing; reviewed activation. Current readback/static inspection is not E2E proof. The original old server runtime remains fail-closed without independent macro evidence; only the selected orchestration candidate has the new phase.

## Authenticated preference read contract

The latest RPC choice must be current, copy version macro-choice-v1, and match owner, goal ID/revision, profile/journey bindings and latest integer choice version. Goal revision strings match exactly as emitted by the PostgreSQL JSON sources; formatting differences fail closed rather than collapsing microsecond differences. Preserve-percent is not treated as Smart. Missing bindings or source-limit fallback cannot grant consent.

The RPC capture must be recent and not precede the source snapshot. The original recordedAt must not follow that snapshot; a newly changed choice requires a new snapshot. consentId is the original requestId and acceptedAt is the original stored timestamp, not now. Binding this lasting per-goal preference to the current source records applicability only, not a new weekly user consent. The authenticated source proves ownership, not nutritional appropriateness.

No review records or clinical flags are fabricated. Preference evidence alone has review:null. The additional service lookup can populate review only from a structurally valid, bound, unexpired administrative record; its SQL source is not installed and no such real records exist. Missing/invalid records remain blocked, and OFF still prevents all workflow calls. Future acceptance must re-read revocation/current version; this read does not serialize later changes. The token is passed only interpreter-to-port, not stored in exported workflow commands. New regression cases remain NOT RUN due to the existing runner blocker. No mount, release activation or SQL/grant change.
