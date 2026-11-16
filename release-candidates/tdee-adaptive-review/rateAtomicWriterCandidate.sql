-- SOURCE ONLY / ROLLBACK ONLY. Does NOT replace any legacy acceptor.
-- Concrete owner-locked admission and atomic goal/receipt/request effects.
-- Public own-user wrapper stays literal OFF. Both macro modes call verified pure
-- SQL allocation; manual split retains additional exact basis-point guards.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='3s';
CREATE FUNCTION tdee_rate_record_private.assert_rate_request(q jsonb)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=auth.uid();k text;
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';END IF;
 IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR octet_length(q::text)>2048 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(q))<>6 OR NOT q ?& ARRAY['version','ownerId','requestId','rateProposalId','rateProposalDigest','anchorReference'] OR
 jsonb_typeof(q->'version') IS DISTINCT FROM 'string' OR jsonb_typeof(q->'ownerId') IS DISTINCT FROM 'string' OR jsonb_typeof(q->'rateProposalDigest') IS DISTINCT FROM 'string' OR
 q->>'version' IS DISTINCT FROM 'rate-acceptance-request-v1' OR q->>'ownerId' IS DISTINCT FROM actor::text OR
 q->>'rateProposalDigest' IS NULL OR q->>'rateProposalDigest' !~ '^[a-f0-9]{64}$' OR jsonb_typeof(q->'anchorReference') IS DISTINCT FROM 'object' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;
 FOREACH k IN ARRAY ARRAY['requestId','rateProposalId'] LOOP
 IF jsonb_typeof(q->k) IS DISTINCT FROM 'string' OR q->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(q->'anchorReference'))<>4 OR NOT (q->'anchorReference') ?& ARRAY['ownerId','version','sourceRequestId','sourceGoalId'] OR
 q#>>'{anchorReference,ownerId}' IS DISTINCT FROM actor::text OR jsonb_typeof(q#>'{anchorReference,version}') IS DISTINCT FROM 'number' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;
 IF (q#>>'{anchorReference,version}')::numeric<>trunc((q#>>'{anchorReference,version}')::numeric) OR
 (q#>>'{anchorReference,version}')::numeric NOT BETWEEN 1 AND 9007199254740991 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;
 FOREACH k IN ARRAY ARRAY['sourceRequestId','sourceGoalId'] LOOP
 IF jsonb_typeof(q->'anchorReference'->k) IS DISTINCT FROM 'string' OR q->'anchorReference'->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;END LOOP;
 RETURN actor;
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.assert_rate_request(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION tdee_rate_record_private.inspect_rate_binding_trusted(
 p_actor uuid,p_payload jsonb,p_goal jsonb,p_profile jsonb,p_policy jsonb,p_readiness jsonb,p_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE r macrogoal_snapshot_review_private.rate_review_versions; evidence jsonb; expected jsonb; n timestamptz; today date;
BEGIN
 IF p_actor IS NULL THEN
  RETURN jsonb_build_object('status','blocked','reason','authentication_required','actionable',false); END IF;
 -- Match acceptance lock order. Appending a revocation must take this same lock.
 PERFORM 1 FROM public.users WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','blocked','reason','profile_unavailable','actionable',false); END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_goal) IS DISTINCT FROM 'object' OR
 jsonb_typeof(p_profile) IS DISTINCT FROM 'object' OR jsonb_typeof(p_policy) IS DISTINCT FROM 'object' OR
 jsonb_typeof(p_readiness) IS DISTINCT FROM 'object' OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' THEN
  RETURN jsonb_build_object('status','blocked','reason','invalid_context','actionable',false); END IF;
 evidence:=p_payload->'rateEvidence';
 IF jsonb_typeof(evidence) IS DISTINCT FROM 'object' OR
 p_goal->>'user_id' IS DISTINCT FROM p_actor::text OR p_profile->>'id' IS DISTINCT FROM p_actor::text OR
 p_readiness->>'ownerId' IS DISTINCT FROM p_actor::text OR p_snapshot->>'ownerId' IS DISTINCT FROM p_actor::text OR
 p_policy->>'engine_version' IS DISTINCT FROM 'rate-review-14d-v1' OR
 p_policy->'enabled' IS DISTINCT FROM 'true'::jsonb OR p_policy->'reviewed' IS DISTINCT FROM 'true'::jsonb OR
 p_policy->'snapshot_contract_reviewed' IS DISTINCT FROM 'true'::jsonb OR
 p_payload->>'engineVersion' IS DISTINCT FROM p_policy->>'engine_version' OR
 p_payload->>'policyDigest' IS DISTINCT FROM p_policy->>'digest' OR
 p_payload->'goalSnapshot' IS DISTINCT FROM p_goal OR
 p_payload->>'profileUpdatedAt' IS DISTINCT FROM p_profile->>'updatedAt' THEN
  RETURN jsonb_build_object('status','blocked','reason','rate_binding_changed','actionable',false); END IF;
 -- Never filter for reviewed/applicable before selecting latest: revocation wins.
 SELECT * INTO r FROM macrogoal_snapshot_review_private.rate_review_versions
 WHERE owner_id=p_actor AND goal_id=(p_goal->>'id')::uuid ORDER BY review_version DESC LIMIT 1 FOR SHARE;
 n:=clock_timestamp();
 IF NOT FOUND OR (p_policy->>'expires_at') IS NULL OR NOT isfinite((p_policy->>'expires_at')::timestamptz) OR
 NOT isfinite(r.source_captured_at) OR NOT isfinite(r.reviewed_at) OR NOT isfinite(r.verified_at) OR NOT isfinite(r.expires_at) OR
 (p_policy->>'expires_at')::timestamptz<=n OR r.decision IS DISTINCT FROM 'reviewed' OR r.expires_at<=n OR r.reviewed_at>n OR r.verified_at>n OR
 r.reviewed_at<r.source_captured_at OR r.verified_at<r.reviewed_at OR
 r.goal_revision IS DISTINCT FROM (p_goal->>'updated_at')::timestamptz OR
 r.profile_updated_at IS DISTINCT FROM (p_profile->>'updatedAt')::timestamptz OR
 r.profile_binding IS DISTINCT FROM p_readiness->>'profileBinding' OR
 r.journey_binding IS DISTINCT FROM p_readiness->>'journeyBinding' OR
 r.policy_version IS DISTINCT FROM p_policy->>'version' OR r.policy_digest IS DISTINCT FROM p_policy->>'digest' OR
 r.engine_version IS DISTINCT FROM p_policy->>'engine_version' OR
 r.source_fingerprint IS DISTINCT FROM p_payload->>'sourceFingerprint' OR
 r.source_fingerprint IS DISTINCT FROM p_snapshot->>'sourceFingerprint' OR
 date_trunc('milliseconds',r.source_captured_at) IS DISTINCT FROM (p_payload->>'sourceCapturedAt')::timestamptz THEN
  RETURN jsonb_build_object('status','blocked','reason','rate_review_changed','actionable',false); END IF;
 today:=(n AT TIME ZONE (p_profile->>'timezone'))::date;
 IF r.window_end_exclusive IS DISTINCT FROM today OR r.window_start IS DISTINCT FROM today-14 OR
 n-r.source_captured_at>interval '30 seconds' OR r.source_captured_at>n OR
 (p_snapshot->>'capturedAt') IS NULL OR NOT isfinite((p_snapshot->>'capturedAt')::timestamptz) OR
 (p_snapshot->>'capturedAt')::timestamptz>n OR
 (p_snapshot->>'capturedAt')::timestamptz<r.source_captured_at OR
 p_payload->>'today' IS DISTINCT FROM today::text OR
 p_readiness#>'{eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR
 p_snapshot#>'{context,premium}' IS DISTINCT FROM 'true'::jsonb OR
 p_snapshot#>'{context,enabled}' IS DISTINCT FROM 'true'::jsonb THEN
  RETURN jsonb_build_object('status','blocked','reason','rate_source_expired_or_changed','actionable',false); END IF;
 -- Exact audited record, including all timestamps and provenance identity.
 expected:=jsonb_build_object('version','fourteen-day-reviewed-input-v1',
 'reviewId',r.review_id,'reviewVersion',r.review_version,'methodVersion',r.method_version,
 'reviewedAt',floor(extract(epoch FROM r.reviewed_at)*1000),'expiresAt',floor(extract(epoch FROM r.expires_at)*1000),
 'ownerId',r.owner_id,'goalId',r.goal_id,'goalRevision',p_goal->>'updated_at',
 'profileUpdatedAt',p_profile->>'updatedAt','profileBinding',r.profile_binding,'journeyBinding',r.journey_binding,
 'policyVersion',r.policy_version,'policyDigest',r.policy_digest,'engineVersion',r.engine_version,
 'sourceFingerprint',r.source_fingerprint,'sourceCapturedAt',floor(extract(epoch FROM r.source_captured_at)*1000),
 'windowStart',r.window_start,'windowEndExclusive',r.window_end_exclusive,
 'approvalDigest',r.approval_digest,'approvalVersion',r.approval_version,
 'uncertainty',jsonb_build_object('validated',true,'stable',true,'lowerKgPerWeek',r.lower_kg_per_week,'upperKgPerWeek',r.upper_kg_per_week),
 'conversion',jsonb_build_object('reviewed',true,'model',r.conversion_model,'kcalPerKg',r.kcal_per_kg));
 IF evidence IS DISTINCT FROM expected THEN
  RETURN jsonb_build_object('status','blocked','reason','rate_evidence_changed','actionable',false); END IF;
 RETURN jsonb_build_object('status','binding_validated','actionable',false,'acceptanceAuthorized',false,
 'reviewId',r.review_id,'reviewVersion',r.review_version,'expiresAt',r.expires_at,
 'remainingGate','rate_acceptance_contract_unavailable');
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR invalid_parameter_value OR numeric_value_out_of_range THEN
 RETURN jsonb_build_object('status','blocked','reason','invalid_rate_evidence','actionable',false);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.inspect_rate_binding_trusted(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Shared trusted server admission. No request-supplied authority, no goal writes.
-- Caller holds provenance of candidate; helper independently reads all live authority.
CREATE FUNCTION tdee_rate_record_private.validate_rate_proposal_locked(actor uuid,candidate jsonb,at_time timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' AS $fn$
DECLARE reason text:='rate_proposal_unavailable';
 p tdee_rate_record_private.proposals;h tdee_rate_anchor_private.anchors;u public.users;g public.goals;
 policy macrogoal_snapshot_review_private.policies;nr macrogoal_snapshot_review_private.nutrition_review_versions;mc macrogoal_snapshot_review_private.macro_choices;
 payload jsonb;ref jsonb;c jsonb;chain jsonb;verified_chain jsonb;source jsonb;derived jsonb;coverage jsonb;binding jsonb;energy jsonb;energy_input jsonb;
 snapshot jsonb;readiness jsonb;target jsonb;macro jsonb;mb jsonb;expected_review jsonb;expected_limits jsonb;expected_choice jsonb;allocation jsonb;trusted_macro jsonb;
 at_ms bigint;source_ms numeric;today date;k text;n numeric;delta integer;net_delta integer;accepted_count integer;commit_obligations_verified boolean:=false;
 new_goal public.goals;unsigned_receipt jsonb;receipt_record jsonb;receipt_content text;receipt_hash text;final_context jsonb;final_access jsonb;changed_count integer;
BEGIN
 IF actor IS NULL OR at_time IS NULL OR at_time>clock_timestamp() OR at_time<clock_timestamp()-interval '30 seconds' THEN RETURN jsonb_build_object('status','rejected','reason','admission_time_invalid');END IF;
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected','reason','profile_unavailable');END IF;
 at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 <<admission>>
 BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN reason:='isolation_unsupported';EXIT admission;END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=actor AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=at_time)) THEN reason:='account_unavailable';EXIT admission;END IF;
  IF candidate->>'ownerId' IS DISTINCT FROM actor::text OR NOT tdee_rate_record_private.valid_content(candidate,candidate->>'canonicalContent',candidate->>'digest','digest') THEN reason:='proposal_content_invalid';EXIT admission;END IF;
  IF jsonb_typeof(candidate->'expiresAt') IS DISTINCT FROM 'number' OR (candidate->>'expiresAt')::numeric<>trunc((candidate->>'expiresAt')::numeric) OR (candidate->>'expiresAt')::numeric NOT BETWEEN 0 AND 9007199254740991 THEN reason:='proposal_expiry_invalid';EXIT admission;END IF;
  p.id:=(candidate->>'id')::uuid;p.owner_id:=actor;p.record:=candidate;p.digest:=candidate->>'digest';p.canonical_content:=candidate->>'canonicalContent';p.expires_at_ms:=(candidate->>'expiresAt')::bigint;
  p.anchor_version:=(candidate#>>'{payload,anchorReference,version}')::bigint;p.source_request_id:=(candidate#>>'{payload,anchorReference,sourceRequestId}')::uuid;p.source_goal_id:=(candidate#>>'{payload,anchorReference,sourceGoalId}')::uuid;
  IF NOT tdee_rate_record_private.valid_content(p.record,p.canonical_content,p.digest,'digest') OR p.record->>'version' IS DISTINCT FROM 'rate-proposal-record-v1' THEN reason:='proposal_content_invalid';EXIT admission;END IF;
  IF p.expires_at_ms<=at_ms THEN reason:='proposal_expired';EXIT admission;END IF;
  IF EXISTS(SELECT 1 FROM tdee_rate_record_private.receipts WHERE owner_id=actor AND proposal_id=p.id) THEN reason:='proposal_consumed';EXIT admission;END IF;
  SELECT * INTO h FROM tdee_rate_anchor_private.anchors WHERE owner_id=actor ORDER BY version DESC LIMIT 1 FOR SHARE;
  ref:=jsonb_build_object('ownerId',h.owner_id,'version',h.version,'sourceRequestId',h.source_request_id,'sourceGoalId',h.source_goal_id);
  IF NOT FOUND OR candidate#>'{payload,anchorReference}' IS DISTINCT FROM ref OR p.anchor_version IS DISTINCT FROM h.version OR p.source_request_id IS DISTINCT FROM h.source_request_id OR p.source_goal_id IS DISTINCT FROM h.source_goal_id THEN reason:='anchor_head_changed';EXIT admission;END IF;
  payload:=p.record->'payload';target:=payload->'target';macro:=payload->'macroEvidence';
  IF payload->'anchorReference' IS DISTINCT FROM ref OR payload->'anchorSnapshot' IS DISTINCT FROM h.anchor OR payload->>'contract' IS DISTINCT FROM 'explicit-rate-acceptance-v1' OR payload->'requiresExplicitAcceptance' IS DISTINCT FROM 'true'::jsonb THEN reason:='proposal_anchor_changed';EXIT admission;END IF;
  IF (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 THEN reason:='goal_unavailable';EXIT admission;END IF;
  SELECT * INTO g FROM public.goals WHERE user_id=actor AND is_active=true FOR UPDATE;
  IF NOT FOUND OR to_jsonb(g) IS DISTINCT FROM payload->'goalSnapshot' THEN reason:='goal_changed';EXIT admission;END IF;
  chain:=tdee_rate_record_private.read_chain(actor);
  IF chain->>'version' IS DISTINCT FROM 'rate-acceptance-chain-source-v1' OR chain->>'ownerId' IS DISTINCT FROM actor::text OR chain->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR
   chain#>'{anchorHead,anchor}' IS DISTINCT FROM h.anchor OR chain#>'{anchorHead,version}' IS DISTINCT FROM to_jsonb(h.version) OR jsonb_typeof(chain->'rows') IS DISTINCT FROM 'array' THEN reason:='rate_chain_unavailable';EXIT admission;END IF;
  verified_chain:=tdee_rate_record_private.verify_chain(chain,at_ms);
  IF verified_chain->>'kind' IS DISTINCT FROM 'rate_chain_verified' OR verified_chain->'receiptsVerified' IS DISTINCT FROM 'true'::jsonb OR
   verified_chain->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR verified_chain->'anchorReference' IS DISTINCT FROM ref THEN reason:='rate_chain_unverified';EXIT admission;END IF;
  accepted_count:=(verified_chain->>'acceptedCount')::integer;
  IF accepted_count>=1000 THEN reason:='rate_chain_limit';EXIT admission;END IF;
  IF accepted_count=0 THEN
  IF h.anchor->'baselineGoalSnapshot' IS DISTINCT FROM to_jsonb(g) OR h.anchor->'acceptedCount' IS DISTINCT FROM '0'::jsonb OR h.anchor->'acceptedDeltaKcal' IS DISTINCT FROM '0'::jsonb OR h.anchor->'lastAcceptedAt' IS DISTINCT FROM 'null'::jsonb THEN reason:='initial_rate_anchor_changed';EXIT admission;END IF;
  source:=tdee_rate_anchor_private.read_source(actor);
  IF source#>>'{existingAnchor,kind}' IS DISTINCT FROM 'rate_anchor_head' OR source#>'{existingAnchor,anchor}' IS DISTINCT FROM h.anchor OR source#>'{existingAnchor,version}' IS DISTINCT FROM to_jsonb(h.version) OR
   source#>>'{existingAnchor,sourceRequestId}' IS DISTINCT FROM h.source_request_id::text OR source#>>'{existingAnchor,sourceGoalId}' IS DISTINCT FROM h.source_goal_id::text THEN reason:='initial_rate_source_changed';EXIT admission;END IF;
  -- Presence is stripped ONLY inside pure provenance re-derivation for equality.
  -- This neither resets stored history nor calls append_initial.
  derived:=tdee_rate_anchor_private.derive_initial(jsonb_set(source,'{existingAnchor}','null'::jsonb),actor,at_time);
  IF derived IS DISTINCT FROM h.anchor THEN reason:='initial_rate_provenance_changed';EXIT admission;END IF;
  END IF;
  SELECT * INTO policy FROM macrogoal_snapshot_review_private.policies WHERE version=payload#>>'{policyBinding,version}' FOR SHARE;
  IF NOT FOUND OR policy.enabled IS DISTINCT FROM true OR policy.reviewed IS DISTINCT FROM true OR policy.snapshot_contract_reviewed IS DISTINCT FROM true OR policy.expires_at<=at_time OR policy.engine_version<>'rate-review-14d-v1' OR
   to_jsonb(policy) IS DISTINCT FROM payload->'policySnapshot' OR policy.digest IS DISTINCT FROM payload#>>'{policyBinding,digest}' OR policy.increment_kcal IS NULL THEN reason:='reviewed_policy_changed';EXIT admission;END IF;
  -- Trusted explicit-owner internal reader; no spoofed user JWT or client context.
  c:=tdee_scheduler_private.read_context(actor);snapshot:=c->'observation';readiness:=c->'readiness';
  IF c->>'actor' IS DISTINCT FROM actor::text OR c->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR
   c#>>'{profile,updatedAt}' IS DISTINCT FROM payload->>'profileUpdatedAt' OR readiness->>'profileBinding' IS DISTINCT FROM payload->>'profileBinding' OR readiness->>'journeyBinding' IS DISTINCT FROM payload->>'journeyBinding' OR
   readiness#>'{eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR readiness#>'{eligibility,adult}' IS DISTINCT FROM 'true'::jsonb OR readiness#>>'{eligibility,response}' IS DISTINCT FROM 'criteria_confirmed' OR
   snapshot#>'{context,premium}' IS DISTINCT FROM 'true'::jsonb OR snapshot#>'{context,enabled}' IS DISTINCT FROM 'true'::jsonb OR snapshot->>'sourceFingerprint' IS DISTINCT FROM payload->>'sourceFingerprint' THEN reason:='current_context_changed';EXIT admission;END IF;
  coverage:=macrogoal_snapshot_review_private.inspect_rate_coverage_v1(c,actor,at_time);
  IF coverage->>'status' IS DISTINCT FROM 'coverage_checked' OR coverage->'coverageSufficient' IS DISTINCT FROM 'true'::jsonb OR coverage->>'startDate' IS DISTINCT FROM payload->>'windowStart' OR coverage->>'endDateExclusive' IS DISTINCT FROM payload->>'windowEndExclusive' OR
   coverage->'observedRateKgPerWeek' IS DISTINCT FROM payload#>'{rateArithmetic,observedKgPerWeek}' OR coverage->'targetRateKgPerWeek' IS DISTINCT FROM payload#>'{rateArithmetic,targetKgPerWeek}' THEN reason:='rate_coverage_changed';EXIT admission;END IF;
  IF jsonb_typeof(payload->'sourceCapturedAt') IS DISTINCT FROM 'number' OR jsonb_typeof(payload->'preparedAt') IS DISTINCT FROM 'number' THEN reason:='proposal_time_invalid';EXIT admission;END IF;
  source_ms:=(payload->>'sourceCapturedAt')::numeric;
  IF source_ms<>trunc(source_ms) OR source_ms<0 OR source_ms>at_ms OR at_ms-source_ms>30000 OR
   (payload->>'preparedAt')::numeric<>trunc((payload->>'preparedAt')::numeric) OR (payload->>'preparedAt')::numeric NOT BETWEEN source_ms AND at_ms OR
   payload->'actionable' IS DISTINCT FROM 'false'::jsonb THEN reason:='proposal_time_invalid';EXIT admission;END IF;
  binding:=tdee_rate_record_private.inspect_rate_binding_trusted(actor,
   jsonb_build_object('rateEvidence',payload->'reviewedRate','engineVersion',payload->>'engineVersion','policyDigest',policy.digest,'goalSnapshot',payload->'goalSnapshot','profileUpdatedAt',payload->>'profileUpdatedAt',
    'sourceFingerprint',payload->>'sourceFingerprint','sourceCapturedAt',to_timestamp(source_ms/1000),'today',payload->>'windowEndExclusive'),to_jsonb(g),c->'profile',to_jsonb(policy),readiness,snapshot);
  IF binding->>'status' IS DISTINCT FROM 'binding_validated' THEN reason:='rate_review_changed';EXIT admission;END IF;
  IF jsonb_typeof(target) IS DISTINCT FROM 'object' OR jsonb_typeof(macro) IS DISTINCT FROM 'object' THEN reason:='target_or_macro_invalid';EXIT admission;END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(target))<>5 OR NOT target ?& ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] THEN reason:='target_invalid';EXIT admission;END IF;
  FOREACH k IN ARRAY ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] LOOP
   IF jsonb_typeof(target->k) IS DISTINCT FROM 'number' THEN reason:='target_invalid';EXIT admission;END IF;
   n:=(target->>k)::numeric;IF n<>trunc(n) OR n<0 OR n>10000 THEN reason:='target_invalid';EXIT admission;END IF;
  END LOOP;
  IF (target->>'calories')::numeric<=0 OR abs((target->>'calories')::numeric-4*(target->>'proteinG')::numeric-4*(target->>'carbsG')::numeric-9*(target->>'fatsG')::numeric)>10 OR (target->>'fiberG')::integer IS DISTINCT FROM g.fiber_g THEN reason:='target_energy_invalid';EXIT admission;END IF;
  delta:=(target->>'calories')::integer-g.daily_calories;
  IF delta<=0 THEN reason:='individual_deficit_review_required';EXIT admission;END IF;
  net_delta:=(verified_chain->>'acceptedDeltaKcal')::integer+delta;
  IF payload->'deltaKcal' IS DISTINCT FROM to_jsonb(delta) OR payload->'netDeltaKcal' IS DISTINCT FROM to_jsonb(net_delta) THEN reason:='rate_delta_changed';EXIT admission;END IF;
  energy_input:=jsonb_build_object('current',jsonb_build_object('calories',g.daily_calories,'proteinG',g.protein_g,'carbsG',g.carbs_g,'fatsG',g.fats_g,'fiberG',g.fiber_g),'anchor',h.anchor,
   'policy',jsonb_build_object('reviewed',policy.reviewed,'maxStepKcal',policy.max_step_kcal,'maxStepFraction',policy.max_step_fraction,'maxNetDeltaKcal',policy.max_cumulative_delta_kcal,'reviewIntervalDays',policy.min_days_between_acceptances,'incrementKcal',policy.increment_kcal,'minIntakeKcal',policy.min_intake_kcal,'maxIntakeKcal',policy.max_intake_kcal),
   'evidence',jsonb_build_object('eligible',true,'modelReviewed',true,'logging','confirmed','capturedAt',source_ms,'fingerprint',payload->>'sourceFingerprint','stability','stable','goalDirectionValid',true),
   'chainSource',chain,'rateReview',payload->'rateArithmetic','macroBinding',payload->'macroBinding','now',at_ms);
  IF payload->'current' IS DISTINCT FROM energy_input->'current' THEN reason:='proposal_current_changed';EXIT admission;END IF;
  -- These booleans express already checked current eligibility + exact stored
  -- reviewed rate evidence. They are not received from the acceptance request.
  energy:=macrogoal_snapshot_review_private.validate_rate_energy_candidate_v1(energy_input,jsonb_build_object('deltaKcal',delta,'calories',target->'calories','netDeltaKcal',net_delta));
  IF energy->>'status' IS DISTINCT FROM 'energy_validated' THEN reason:='rate_energy_changed';EXIT admission;END IF;
  today:=(at_time AT TIME ZONE u.timezone)::date;
  IF u.date_of_birth IS NULL OR date_part('year',age(today,u.date_of_birth)) NOT BETWEEN 19 AND 100 THEN reason:='macro_review_age';EXIT admission;END IF;
  mb:=jsonb_build_object('ownerId',actor,'goalId',g.id,'goalRevision',g.updated_at,'preset',g.macro_preset,'sourceFingerprint',snapshot->>'sourceFingerprint','policyVersion',policy.version,'policyDigest',policy.digest);
  IF payload->'macroBinding' IS DISTINCT FROM mb OR macro->'binding' IS DISTINCT FROM mb OR macro->'current' IS DISTINCT FROM energy_input->'current' THEN reason:='macro_binding_changed';EXIT admission;END IF;
  SELECT * INTO nr FROM macrogoal_snapshot_review_private.nutrition_review_versions WHERE owner_id=actor AND goal_id=g.id ORDER BY review_version DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND OR nr.decision<>'eligible' OR nr.reviewed_at>at_time OR nr.verified_at>at_time OR nr.recorded_at>at_time OR nr.expires_at<=at_time OR nr.goal_revision IS DISTINCT FROM g.updated_at OR nr.profile_updated_at IS DISTINCT FROM u.updated_at OR
   nr.profile_binding IS DISTINCT FROM readiness->>'profileBinding' OR nr.journey_binding IS DISTINCT FROM readiness->>'journeyBinding' OR nr.preset IS DISTINCT FROM g.macro_preset OR nr.policy_version IS DISTINCT FROM policy.version OR nr.policy_digest IS DISTINCT FROM policy.digest OR nr.engine_version IS DISTINCT FROM policy.engine_version OR
   nr.current_calories IS DISTINCT FROM g.daily_calories OR nr.current_protein_g IS DISTINCT FROM g.protein_g OR nr.current_carbs_g IS DISTINCT FROM g.carbs_g OR nr.current_fats_g IS DISTINCT FROM g.fats_g OR nr.current_fiber_g IS DISTINCT FROM g.fiber_g THEN reason:='nutrition_review_changed';EXIT admission;END IF;
  expected_review:=jsonb_build_object('status','reviewed','reviewId',nr.review_id,'reviewVersion',nr.review_version,'approvalDigest',nr.approval_digest,'approvalVersion',nr.approval_version,
   'reviewedAt',floor(extract(epoch FROM nr.reviewed_at)*1000),'expiresAt',floor(extract(epoch FROM nr.expires_at)*1000),'ageYears',date_part('year',age(today,u.date_of_birth))::integer,'eligibility','eligible');
  expected_limits:=jsonb_build_object('proteinMinG',nr.protein_min_g,'proteinMaxG',nr.protein_max_g,'carbsMinG',nr.carbs_min_g,'carbsMaxG',nr.carbs_max_g,'fatsMinG',nr.fats_min_g,'fatsMaxG',nr.fats_max_g,'fatMinFraction',nr.fat_min_fraction,'fatMaxFraction',nr.fat_max_fraction);
  IF jsonb_typeof(payload#>'{reviewedRate,expiresAt}') IS DISTINCT FROM 'number' OR p.expires_at_ms IS DISTINCT FROM least(source_ms+30000,(payload#>>'{reviewedRate,expiresAt}')::numeric,floor(extract(epoch FROM policy.expires_at)*1000),floor(extract(epoch FROM nr.expires_at)*1000)) THEN reason:='proposal_expiry_changed';EXIT admission;END IF;
  IF macro->'review' IS DISTINCT FROM expected_review OR macro->'limits' IS DISTINCT FROM expected_limits THEN reason:='nutrition_review_changed';EXIT admission;END IF;
  SELECT * INTO mc FROM macrogoal_snapshot_review_private.macro_choices WHERE owner_id=actor AND goal_id=g.id ORDER BY choice_version DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND OR mc.mode IS NULL OR mc.mode NOT IN ('smart','preserve_percent') OR mc.copy_version IS DISTINCT FROM 'macro-choice-v1' OR mc.goal_updated_at IS DISTINCT FROM g.updated_at OR mc.profile_binding IS DISTINCT FROM readiness->>'profileBinding' OR mc.journey_binding IS DISTINCT FROM readiness->>'journeyBinding' OR
   mc.recorded_at>at_time OR extract(epoch FROM mc.recorded_at)*1000>source_ms THEN reason:='macro_choice_changed';EXIT admission;END IF;
  expected_choice:=jsonb_build_object('mode',mc.mode,'binding',mb,'consentId',mc.request_id,'acceptedAt',floor(extract(epoch FROM mc.recorded_at)*1000),'choiceVersion',mc.choice_version,'splitBps',mc.split_bps);
  IF macro->'customChoice' IS DISTINCT FROM expected_choice THEN reason:='macro_choice_changed';EXIT admission;END IF;
  IF mc.mode='preserve_percent' THEN
  IF payload->>'allocationMode' IS DISTINCT FROM 'manual-percent-nearest-gram-v1' OR jsonb_typeof(mc.split_bps) IS DISTINCT FROM 'object' THEN reason:='macro_allocation_changed';EXIT admission;END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(mc.split_bps))<>3 OR NOT mc.split_bps ?& ARRAY['protein','carbs','fats'] THEN reason:='macro_allocation_changed';EXIT admission;END IF;
  FOREACH k IN ARRAY ARRAY['protein','carbs','fats'] LOOP
   IF jsonb_typeof(mc.split_bps->k) IS DISTINCT FROM 'number' OR (mc.split_bps->>k)::numeric<>trunc((mc.split_bps->>k)::numeric) OR (mc.split_bps->>k)::numeric NOT BETWEEN 0 AND 10000 THEN reason:='macro_allocation_changed';EXIT admission;END IF;
  END LOOP;
  IF (mc.split_bps->>'protein')::numeric+(mc.split_bps->>'carbs')::numeric+(mc.split_bps->>'fats')::numeric<>10000 OR
   (target->>'proteinG')::numeric<>floor(((target->>'calories')::numeric*(mc.split_bps->>'protein')::numeric+20000)/40000) OR
   (target->>'carbsG')::numeric<>floor(((target->>'calories')::numeric*(mc.split_bps->>'carbs')::numeric+20000)/40000) OR
   (target->>'fatsG')::numeric<>floor(((target->>'calories')::numeric*(mc.split_bps->>'fats')::numeric+45000)/90000) THEN reason:='macro_allocation_changed';EXIT admission;END IF;
  IF (target->>'proteinG')::numeric NOT BETWEEN nr.protein_min_g AND nr.protein_max_g OR (target->>'carbsG')::numeric NOT BETWEEN nr.carbs_min_g AND nr.carbs_max_g OR (target->>'fatsG')::numeric NOT BETWEEN nr.fats_min_g AND nr.fats_max_g OR
   9*(target->>'fatsG')::numeric/(target->>'calories')::numeric NOT BETWEEN nr.fat_min_fraction AND nr.fat_max_fraction THEN reason:='macro_target_limits';EXIT admission;END IF;
  END IF; -- additional exact manual basis-point guards
  -- Rebuild allocator context from actual locked review/choice rows. Never pass
  -- the proposed macroEvidence as authority to the shared pure allocator.
  trusted_macro:=jsonb_build_object('binding',mb,'current',energy_input->'current','review',expected_review,'limits',expected_limits,'customChoice',expected_choice);
  allocation:=tdee_macro_math_private.adjust(jsonb_build_object('current',energy_input->'current','newCalories',target->'calories','now',at_ms,
   'sourceFingerprint',snapshot->>'sourceFingerprint','binding',mb,'context',trusted_macro));
  IF allocation->>'kind' IS DISTINCT FROM 'candidate' OR allocation->'actionable' IS DISTINCT FROM 'false'::jsonb OR allocation->'requiresAcceptance' IS DISTINCT FROM 'true'::jsonb OR
   allocation->'target' IS DISTINCT FROM target OR allocation->'allocationMode' IS DISTINCT FROM payload->'allocationMode' THEN reason:='macro_allocation_changed';EXIT admission;END IF;
  commit_obligations_verified:=true;
 END admission;
 IF NOT commit_obligations_verified THEN RETURN jsonb_build_object('status','rejected','reason',reason);END IF;
 RETURN jsonb_build_object('status','validated','anchorRow',to_jsonb(h),'profileRow',to_jsonb(u),'goalRow',to_jsonb(g),'policyRow',to_jsonb(policy),'nutritionRow',to_jsonb(nr),
  'payload',payload,'anchorReference',ref,'chain',chain,'verifiedChain',verified_chain,'binding',binding,'target',target,'sourceMs',source_ms,'delta',delta,'netDelta',net_delta,'acceptedCount',accepted_count);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.validate_rate_proposal_locked(uuid,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION tdee_rate_record_private.accept_rate_proposal(q jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' AS $fn$
DECLARE actor uuid:=tdee_rate_record_private.assert_rate_request(q); saved jsonb;admission_result jsonb;result jsonb;reason text:='rate_proposal_unavailable';
 p tdee_rate_record_private.proposals;h tdee_rate_anchor_private.anchors;u public.users;g public.goals;
 policy macrogoal_snapshot_review_private.policies;nr macrogoal_snapshot_review_private.nutrition_review_versions;mc macrogoal_snapshot_review_private.macro_choices;
 payload jsonb;ref jsonb;c jsonb;chain jsonb;verified_chain jsonb;source jsonb;derived jsonb;coverage jsonb;binding jsonb;energy jsonb;energy_input jsonb;
 snapshot jsonb;readiness jsonb;target jsonb;macro jsonb;mb jsonb;expected_review jsonb;expected_limits jsonb;expected_choice jsonb;allocation jsonb;trusted_macro jsonb;
 at_time timestamptz;at_ms bigint;source_ms numeric;today date;k text;n numeric;delta integer;net_delta integer;accepted_count integer;commit_obligations_verified boolean:=false;
 new_goal public.goals;unsigned_receipt jsonb;receipt_record jsonb;receipt_content text;receipt_hash text;final_context jsonb;final_access jsonb;changed_count integer;
BEGIN
 -- Owner lock serializes request replay, manual saves, anchor appends and future
 -- accepted writes. An app-held idempotency key alone never authorizes an effect.
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable';END IF;
 saved:=tdee_rate_record_private.read_exact_request(actor,(q->>'requestId')::uuid,q);
 IF saved IS NOT NULL THEN RETURN saved;END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 SELECT * INTO p FROM tdee_rate_record_private.proposals WHERE owner_id=actor AND id=(q->>'rateProposalId')::uuid FOR UPDATE;
 IF NOT FOUND OR p.digest IS DISTINCT FROM q->>'rateProposalDigest' OR p.record#>'{payload,anchorReference}' IS DISTINCT FROM q->'anchorReference' THEN
  admission_result:=jsonb_build_object('status','rejected','reason','rate_proposal_unavailable');
 ELSE
  admission_result:=tdee_rate_record_private.validate_rate_proposal_locked(actor,p.record,at_time);
 END IF;
 IF admission_result->>'status' IS DISTINCT FROM 'validated' THEN reason:=coalesce(admission_result->>'reason','rate_admission_unverified');
 ELSE
  h:=jsonb_populate_record(NULL::tdee_rate_anchor_private.anchors,admission_result->'anchorRow');
  u:=jsonb_populate_record(NULL::public.users,admission_result->'profileRow');g:=jsonb_populate_record(NULL::public.goals,admission_result->'goalRow');
  policy:=jsonb_populate_record(NULL::macrogoal_snapshot_review_private.policies,admission_result->'policyRow');
  nr:=jsonb_populate_record(NULL::macrogoal_snapshot_review_private.nutrition_review_versions,admission_result->'nutritionRow');
  payload:=admission_result->'payload';ref:=admission_result->'anchorReference';chain:=admission_result->'chain';verified_chain:=admission_result->'verifiedChain';binding:=admission_result->'binding';target:=admission_result->'target';
  source_ms:=(admission_result->>'sourceMs')::numeric;delta:=(admission_result->>'delta')::integer;net_delta:=(admission_result->>'netDelta')::integer;accepted_count:=(admission_result->>'acceptedCount')::integer;
  commit_obligations_verified:=true;
 END IF;
 IF commit_obligations_verified THEN
  -- Exact final current-source cut after all locks; later food changes belong to
  -- the next review, not an invented transaction-wide source barrier.
  final_context:=tdee_scheduler_private.read_context(actor);
  final_access:=macrogoal_observed_private.tester_access(actor);
  at_time:=date_trunc('milliseconds',clock_timestamp());at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
  IF final_context->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR final_context#>>'{observation,sourceFingerprint}' IS DISTINCT FROM payload->>'sourceFingerprint' OR
   final_context#>>'{readiness,profileBinding}' IS DISTINCT FROM payload->>'profileBinding' OR final_context#>>'{readiness,journeyBinding}' IS DISTINCT FROM payload->>'journeyBinding' OR
   final_context#>'{readiness,eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR final_context#>'{observation,context,premium}' IS DISTINCT FROM 'true'::jsonb OR
   final_context#>'{observation,context,enabled}' IS DISTINCT FROM 'true'::jsonb OR
   jsonb_typeof(final_context#>'{observation,context,accessValidUntil}') IS DISTINCT FROM 'number' OR (final_context#>>'{observation,context,accessValidUntil}')::numeric<=at_ms OR
   jsonb_typeof(final_access->'managed') IS DISTINCT FROM 'boolean' OR
   (final_access->'managed'='true'::jsonb AND (final_access->'allowed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(final_access->'validUntil') IS DISTINCT FROM 'number' OR (final_access->>'validUntil')::numeric<=at_ms)) OR
   at_ms-source_ms>30000 OR source_ms>at_ms OR p.expires_at_ms<=at_ms OR policy.expires_at<=at_time OR nr.expires_at<=at_time OR (binding->>'expiresAt')::timestamptz<=at_time OR
   at_time<=g.created_at OR at_ms-coalesce((verified_chain->>'lastAcceptedAt')::numeric,(h.anchor->>'acceptedAt')::numeric)<policy.min_days_between_acceptances*86400000::numeric THEN
   reason:='authority_or_source_expired';commit_obligations_verified:=false;
  ELSE
   UPDATE public.goals SET is_active=false WHERE id=g.id AND user_id=actor AND is_active=true AND to_jsonb(goals)=to_jsonb(g);
   GET DIAGNOSTICS changed_count=ROW_COUNT;
   IF changed_count<>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_goal_cas_conflict';END IF;
   INSERT INTO public.goals(user_id,goal_type,goal_intensity,target_weight,daily_calories,protein_g,carbs_g,fats_g,fiber_g,is_active,
    loss_rate_lbs_per_week,start_date,start_journey_date,macro_preset,base_daily_calories,last_adaptive_update,created_at,updated_at)
   VALUES(actor,g.goal_type,g.goal_intensity,g.target_weight,(target->>'calories')::integer,(target->>'proteinG')::integer,(target->>'carbsG')::integer,
    (target->>'fatsG')::integer,(target->>'fiberG')::integer,true,g.loss_rate_lbs_per_week,g.start_date,g.start_journey_date,g.macro_preset,
    (h.anchor->>'baselineIntakeKcal')::integer,at_time,at_time,at_time) RETURNING * INTO new_goal;
   IF new_goal.id=g.id OR new_goal.user_id IS DISTINCT FROM actor OR new_goal.is_active IS DISTINCT FROM true OR
    new_goal.created_at IS DISTINCT FROM at_time OR new_goal.updated_at IS DISTINCT FROM at_time OR new_goal.last_adaptive_update IS DISTINCT FROM at_time OR
    new_goal.daily_calories IS DISTINCT FROM (target->>'calories')::integer OR new_goal.protein_g IS DISTINCT FROM (target->>'proteinG')::integer OR
    new_goal.carbs_g IS DISTINCT FROM (target->>'carbsG')::integer OR new_goal.fats_g IS DISTINCT FROM (target->>'fatsG')::integer OR new_goal.fiber_g IS DISTINCT FROM (target->>'fiberG')::integer OR
    (to_jsonb(new_goal)-ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']) IS DISTINCT FROM
    (to_jsonb(g)-ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_goal_write_changed';END IF;
   unsigned_receipt:=jsonb_build_object('version','rate-acceptance-receipt-v1','status','committed','canonicalEncoding','pg-jsonb-v1','sequence',accepted_count+1,
    'request',q,'anchorReference',ref,'previousGoalSnapshot',to_jsonb(g),'acceptedGoalSnapshot',to_jsonb(new_goal),'acceptedAt',at_ms,'deltaKcal',delta,'netDeltaKcal',net_delta,
    'previousReceiptDigest',verified_chain->'lastReceiptDigest','acceptanceEvidence',jsonb_build_object('contract','rate-as-of-revalidated-v1','sourceFingerprint',payload->>'sourceFingerprint',
    'sourceCapturedAt',source_ms,'reviewId',payload#>'{reviewedRate,reviewId}','reviewVersion',payload#>'{reviewedRate,reviewVersion}','policyDigest',policy.digest,
    'profileBinding',payload->>'profileBinding','journeyBinding',payload->>'journeyBinding'));
   receipt_content:=unsigned_receipt::text;receipt_hash:=encode(sha256(convert_to(receipt_content,'UTF8')),'hex');
   receipt_record:=unsigned_receipt||jsonb_build_object('canonicalContent',receipt_content,'receiptDigest',receipt_hash);
   IF octet_length(receipt_record::text)>65536 OR NOT tdee_rate_record_private.valid_content(receipt_record,receipt_content,receipt_hash,'receiptDigest') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_receipt_encoding_invalid';END IF;
   INSERT INTO tdee_rate_record_private.requests(owner_id,request_id,request,result) VALUES(actor,(q->>'requestId')::uuid,q,receipt_record);
   INSERT INTO tdee_rate_record_private.receipts(owner_id,request_id,proposal_id,proposal_digest,anchor_version,source_request_id,source_goal_id,sequence,prior_sequence,
    previous_receipt_digest,receipt_digest,canonical_content,record,previous_goal,accepted_goal,accepted_at_ms)
   VALUES(actor,(q->>'requestId')::uuid,p.id,p.digest,h.version,h.source_request_id,h.source_goal_id,accepted_count+1,CASE WHEN accepted_count=0 THEN NULL ELSE accepted_count END,
    verified_chain->>'lastReceiptDigest',receipt_hash,receipt_content,receipt_record,to_jsonb(g),to_jsonb(new_goal),at_ms);
   -- Verify the actual persisted post-state, not a manufactured success envelope.
   chain:=tdee_rate_record_private.read_chain(actor);
   -- The outer statement timestamp predates this function's writes. Capture the
   -- actual post-read time explicitly; never rewrite proposal/provider expiry.
   at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
   chain:=jsonb_set(chain,'{capturedAt}',to_jsonb(at_ms));
   verified_chain:=tdee_rate_record_private.verify_chain(chain,at_ms);
   IF verified_chain->>'kind' IS DISTINCT FROM 'rate_chain_verified' OR (verified_chain->>'acceptedCount')::integer<>accepted_count+1 OR
    verified_chain->>'lastReceiptDigest' IS DISTINCT FROM receipt_hash OR verified_chain->'currentGoal' IS DISTINCT FROM to_jsonb(new_goal) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_postwrite_chain_invalid';END IF;
   RETURN receipt_record;
  END IF;
 END IF;
 result:=jsonb_build_object('version','rate-acceptance-receipt-v1','status','rejected','reason',reason,'request',q);
 INSERT INTO tdee_rate_record_private.requests(owner_id,request_id,request,result) VALUES(actor,(q->>'requestId')::uuid,q,result);
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.accept_rate_proposal(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_accept_rate_proposal_v1(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=tdee_rate_record_private.assert_rate_request(p_request);
BEGIN
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_acceptance_off');END IF;
 RETURN tdee_rate_record_private.accept_rate_proposal(p_request);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_accept_rate_proposal_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_accept_rate_proposal_v1(jsonb) TO authenticated;
ROLLBACK;
