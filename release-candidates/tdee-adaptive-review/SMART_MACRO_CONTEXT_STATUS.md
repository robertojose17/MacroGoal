# Smart Macro context port: OFF integration

Candidate source only. No deployment, SQL, review records, consent records, policy defaults or release changes. Tests are prepared and NOT EXECUTED while the runner blocker remains.

The parser derives a minimal request only when all earlier source, policy, eligibility, history and energy guards pass and the sole allocation blocker is macro_context_required. It derives owner/goal/revision/preset/source/policy bindings and current macros from the validated snapshot. The request also binds source capture, profile revision, profile/journey hashes, local today and age calculated from DOB/local date. A null preset is never guessed.

Independent server-port evidence must echo that request exactly and provide review and consent separately. Embedded customChoice inside review is rejected. Raw snapshot/request macro flags never supply this argument. Matching bindings/statuses do not establish review authenticity; the future server storage loader is responsible for real provenance and revocation. The currently concrete Supabase port returns null deliberately and makes no invented RPC.

After refresh/reload, the orchestrator enters load_macro instead of issuing. It retains the cloned snapshot in private workflow memory, gives the port only the immutable actor and a cloned minimal request, and reparses using a fresh clock after await. Source expiration or changed binding blocks. This is snapshot-as-of semantics: it does not assert serialization of all concurrent food/profile writers or live reauthentication after every await. The original authenticated actor remains fixed. Acceptance must still revalidate authoritative state.

The finite interpreter permits seven phases; unknown phases cannot fall through to issuance. Errors, invalid clocks, or missing macro evidence after refresh preserve mayHaveWritten:true because earlier eligibility refresh may have committed. No automatic retries. Private raw context is never returned in HTTP outcomes.

OFF still returns before any port call. There is no request enable flag. Missing storage/records results in null, not clinical review inferred from criteria_confirmed or Premium.

## Custom configuration gap

Existing custom UI saves rounded grams and preset custom, not original percentages or Smart consent. Future actor-owned versioned/revocable storage and acceptance revalidation are required. No local-only fake consent UI is added. Preserve-percent stays blocked until exact configuration and its separate reviewed allocator are integrated.

## Remaining work

Verified nutritional review storage and server loader; verified custom consent; acceptance revalidation of macro evidence; approved runner and actual application testing; reviewed activation. Current readback/static inspection is not E2E proof. The original old server runtime remains fail-closed without independent macro evidence; only the selected orchestration candidate has the new phase.
