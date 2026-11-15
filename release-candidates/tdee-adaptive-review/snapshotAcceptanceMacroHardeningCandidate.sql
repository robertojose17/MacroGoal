-- NEW HARDENING CANDIDATE, NOT INSTALLED. No caps/grants changed.
-- Distinct from the rejected cap-nullability operation. Source stays OFF.
-- Only the new review table gets a scoped own-user serialization trigger.
-- Review records remain administrative; no approved records or policy seeds.
BEGIN;

CREATE FUNCTION macrogoal_snapshot_review_private.serialize_nutrition_review_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $guard$
BEGIN
 IF TG_OP='UPDATE' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='review_append_new_version';
 END IF;
 IF TG_OP='DELETE' THEN
  -- Normal account/goal cascade removes an already absent parent. Preserve that
  -- behavior without taking a review-row -> user lock in reverse order.
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.owner_id) OR
     NOT EXISTS(SELECT 1 FROM public.goals WHERE id=OLD.goal_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='review_append_revocation_instead';
 END IF;
 -- INSERT only: serialize with acceptance before adding a possible latest row.
 PERFORM 1 FROM public.users WHERE id=NEW.owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='review_owner_missing'; END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.serialize_nutrition_review_write() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER serialize_nutrition_review_write
 BEFORE INSERT OR UPDATE OR DELETE ON macrogoal_snapshot_review_private.nutrition_review_versions
 FOR EACH ROW EXECUTE FUNCTION macrogoal_snapshot_review_private.serialize_nutrition_review_write();

CREATE OR REPLACE FUNCTION macrogoal_snapshot_review_private.accept_proposal(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=macrogoal_snapshot_review_private.assert_request(p_request); prior jsonb;
 p macrogoal_snapshot_review_private.proposals; policy macrogoal_snapshot_review_private.policies;
 anchor macrogoal_snapshot_review_private.anchors; e macrogoal_snapshot_review_private.eligibility;
 u public.users; g public.goals; result public.goals; snapshot jsonb; readiness jsonb; target jsonb;
 k text; n numeric; delta integer; accepted_at timestamptz; today date;
 nr macrogoal_snapshot_review_private.nutrition_review_versions;
 mc macrogoal_snapshot_review_private.macro_choices;
 me jsonb; mb jsonb; expected_review jsonb; expected_limits jsonb; expected_choice jsonb;
 final_tester_access jsonb;
BEGIN
 -- Replay is available even when the feature/policy is OFF or proposal expired.
 prior:=macrogoal_snapshot_review_private.read_receipt(p_request);
 IF prior->>'status'<>'not_found' THEN RETURN prior; END IF;
 -- Same owner serializes requests before receipt/proposal consumption. Lock order
 -- agrees with manual save/restart and the candidate source barrier.
 -- Real source-writer interleavings are not yet verified in PostgreSQL.
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable'; END IF;
 prior:=macrogoal_snapshot_review_private.read_receipt(p_request);
 IF prior->>'status'<>'not_found' THEN RETURN prior; END IF;
 SELECT * INTO p FROM macrogoal_snapshot_review_private.proposals WHERE id=(p_request->>'proposalId')::uuid AND owner_id=actor;
 IF NOT FOUND OR p.digest IS DISTINCT FROM p_request->>'proposalDigest' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_unavailable'); END IF;
 IF p.consumed_request IS NOT NULL THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_consumed'); END IF;
 IF p.expires_at<=clock_timestamp() THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_expired'); END IF;
 -- Typed persisted payload was issued by the trusted server, never the accept body.
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'isolation_unsupported'); END IF;
 IF NOT p.payload ?& ARRAY['goalId','goalUpdatedAt','profileUpdatedAt','goalSnapshot','sourceFingerprint','sourceCapturedAt','snapshotSemantics'] OR
    jsonb_typeof(p.payload->'profileUpdatedAt') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p.payload->'goalUpdatedAt') IS DISTINCT FROM 'string' OR
    u.updated_at IS NULL OR u.updated_at IS DISTINCT FROM (p.payload->>'profileUpdatedAt')::timestamptz THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'profile_changed'); END IF;
 SELECT * INTO g FROM public.goals WHERE id=(p.payload->>'goalId')::uuid AND user_id=actor AND is_active=true FOR UPDATE;
 IF NOT FOUND OR g.updated_at IS NULL OR g.updated_at IS DISTINCT FROM (p.payload->>'goalUpdatedAt')::timestamptz OR
    to_jsonb(g) IS DISTINCT FROM p.payload->'goalSnapshot' OR
    (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'goal_changed'); END IF;
 SELECT * INTO p FROM macrogoal_snapshot_review_private.proposals WHERE id=(p_request->>'proposalId')::uuid AND owner_id=actor FOR UPDATE;
 IF NOT FOUND OR p.owner_id IS DISTINCT FROM actor OR p.digest IS DISTINCT FROM p_request->>'proposalDigest' OR
    p.payload->>'goalId' IS DISTINCT FROM g.id::text OR p.expires_at<=clock_timestamp() OR p.consumed_request IS NOT NULL THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_expired_or_consumed'); END IF;
 SELECT * INTO policy FROM macrogoal_snapshot_review_private.policies WHERE version=p.policy_version FOR SHARE;
 IF NOT FOUND OR NOT policy.enabled OR NOT policy.reviewed OR NOT policy.snapshot_contract_reviewed OR policy.expires_at<=clock_timestamp() THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'safety_review_required'); END IF;
 SELECT * INTO anchor FROM macrogoal_snapshot_review_private.anchors WHERE id=p.anchor_id AND owner_id=actor FOR UPDATE;
 IF NOT FOUND OR anchor.revoked OR anchor.policy_version<>policy.version OR anchor.active_goal_id IS DISTINCT FROM (p.payload->>'goalId')::uuid THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'anchor_changed'); END IF;
 SELECT * INTO e FROM macrogoal_snapshot_review_private.eligibility WHERE owner_id=actor AND policy_version=policy.version FOR SHARE;
 IF NOT FOUND OR NOT e.eligible OR NOT e.complete_days_verified OR e.expires_at<=clock_timestamp() OR
   e.digest IS DISTINCT FROM p.payload->>'eligibilityDigest' OR e.source_fingerprint IS DISTINCT FROM p.payload->>'sourceFingerprint' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'eligibility_review_required'); END IF;
 -- User can revoke self-confirmation without changing food/weight inputs.
 -- No actor parameter is accepted by the readiness API.
 readiness:=public.tdee_read_readiness_v1();
 IF readiness->>'version' IS DISTINCT FROM 'tdee-readiness-v1' OR readiness->>'ownerId' IS DISTINCT FROM actor::text OR
    readiness#>'{eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR
    readiness#>'{eligibility,adult}' IS DISTINCT FROM 'true'::jsonb OR
    readiness#>>'{eligibility,response}' IS DISTINCT FROM 'criteria_confirmed' OR
    coalesce(p.payload->>'readinessFingerprint','') !~ '^[a-f0-9]{64}$' OR
    encode(sha256(convert_to((readiness-'capturedAt')::text,'UTF8')),'hex') IS DISTINCT FROM p.payload->>'readinessFingerprint' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'readiness_changed'); END IF;
 IF anchor.journey_binding IS DISTINCT FROM readiness->>'journeyBinding' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'journey_changed'); END IF;
 IF anchor.last_accepted_at IS NULL AND anchor.baseline_goal_snapshot IS DISTINCT FROM to_jsonb(g) THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'baseline_goal_changed'); END IF;
 -- Revalidated snapshot; source writes after this cut may enter the next review.
 snapshot:=public.observed_get_tdee_snapshot_v1();
 IF jsonb_typeof(snapshot) IS DISTINCT FROM 'object' OR snapshot->>'version' IS DISTINCT FROM 'observed-snapshot-v1' OR
    snapshot->>'ownerId' IS DISTINCT FROM actor::text OR snapshot#>>'{context,ownerId}' IS DISTINCT FROM actor::text OR
    coalesce(snapshot->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$' OR coalesce(p.payload->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$' OR
    p.payload->>'snapshotSemantics' IS DISTINCT FROM 'as-of-revalidated-v1' OR
    NOT macrogoal_snapshot_review_private.snapshot_time_valid(snapshot->>'capturedAt',clock_timestamp()) OR
    (p.payload->>'sourceCapturedAt')::timestamptz>(snapshot->>'capturedAt')::timestamptz OR
    snapshot->>'sourceFingerprint' IS DISTINCT FROM p.payload->>'sourceFingerprint' OR
   snapshot#>'{context,premium}' IS DISTINCT FROM 'true'::jsonb OR snapshot#>'{context,enabled}' IS DISTINCT FROM 'true'::jsonb THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'context_changed'); END IF;
 SELECT * INTO g FROM public.goals WHERE id=anchor.active_goal_id AND user_id=actor AND is_active=true;
 IF NOT FOUND OR to_jsonb(g) IS DISTINCT FROM p.payload->'goalSnapshot' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'goal_changed'); END IF;
 IF p.payload->>'policyDigest' IS DISTINCT FROM policy.digest OR p.payload->>'engineVersion' IS DISTINCT FROM policy.engine_version THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'policy_changed'); END IF;
 today:=(clock_timestamp() AT TIME ZONE u.timezone)::date;
 IF p.payload->>'today' IS DISTINCT FROM today::text OR u.date_of_birth IS NULL OR u.sex NOT IN ('female','male') OR u.sex IS NULL OR
    u.date_of_birth>(today-interval '18 years')::date OR u.date_of_birth<(today-interval '100 years')::date THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'profile_review_required'); END IF;
 target:=p.payload->'target';
 IF target IS NULL OR jsonb_typeof(target)<>'object' OR NOT target ?& ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] OR
   EXISTS(SELECT 1 FROM jsonb_object_keys(target) key WHERE key NOT IN ('calories','proteinG','carbsG','fatsG','fiberG')) THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'invalid_target'); END IF;
 FOREACH k IN ARRAY ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] LOOP
  IF jsonb_typeof(target->k) IS DISTINCT FROM 'number' THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'invalid_target'); END IF;
  n:=(target->>k)::numeric;
  IF n<>trunc(n) OR n<0 OR n>10000 THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'invalid_target'); END IF;
 END LOOP;
 IF g.daily_calories IS NULL OR g.daily_calories<=0 OR g.protein_g IS NULL OR g.protein_g<0 OR
    g.carbs_g IS NULL OR g.carbs_g<0 OR g.fats_g IS NULL OR g.fats_g<0 OR g.fiber_g IS NULL OR g.fiber_g<0 THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'existing_goal_invalid'); END IF;
 delta:=(target->>'calories')::integer-g.daily_calories;
 -- Bidirectional bound, not a reviewed nutritional policy.
 IF delta=0 OR abs(delta)>policy.max_step_kcal OR abs(delta)>g.daily_calories*policy.max_step_fraction OR
   anchor.baseline_intake_kcal+anchor.accepted_delta_kcal<>g.daily_calories OR
   abs(anchor.accepted_delta_kcal+delta)>policy.max_cumulative_delta_kcal OR
   (target->>'calories')::integer<greatest(policy.min_intake_kcal,CASE WHEN u.sex='female' THEN 1200 ELSE 1500 END) OR
   (target->>'calories')::integer>policy.max_intake_kcal OR (target->>'fiberG')::integer IS DISTINCT FROM g.fiber_g OR
   abs((target->>'calories')::integer-4*(target->>'proteinG')::integer-4*(target->>'carbsG')::integer-9*(target->>'fatsG')::integer)>10 THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'target_limits'); END IF;

 -- NEW versioned Smart allocation checks. No caps or previous guards are replaced.
 me:=p.payload->'macroEvidence';
 IF jsonb_typeof(me) IS DISTINCT FROM 'object' OR
 me->>'version' IS DISTINCT FROM 'snapshot-macro-context-v1' OR
 me->>'allocationMode' IS DISTINCT FROM 'smart-preserve-adequate-protein-v1' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'macro_contract_required'); END IF;
 -- Match the existing engine suspension; a macro review is not a total-deficit review.
 IF delta<0 THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'individual_deficit_review_required'); END IF;
 mb:=jsonb_build_object('ownerId',actor,'goalId',g.id,'goalRevision',g.updated_at,'preset',g.macro_preset,
  'sourceFingerprint',snapshot->>'sourceFingerprint','policyVersion',policy.version,'policyDigest',policy.digest);
 IF me->'binding' IS DISTINCT FROM mb THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'macro_binding_changed'); END IF;
 -- Administrative review writers serialize on the same user lock through the
 -- narrowly scoped review-table trigger. Never select an older applicable review.
 SELECT * INTO nr FROM macrogoal_snapshot_review_private.nutrition_review_versions
 WHERE owner_id=actor AND goal_id=g.id ORDER BY review_version DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND OR nr.decision<>'eligible' OR nr.reviewed_at>clock_timestamp() OR nr.verified_at>clock_timestamp() OR
 nr.recorded_at>clock_timestamp() OR nr.expires_at<=clock_timestamp() OR
 nr.goal_revision IS DISTINCT FROM g.updated_at OR nr.profile_updated_at IS DISTINCT FROM u.updated_at OR
 nr.profile_binding IS DISTINCT FROM readiness->>'profileBinding' OR nr.journey_binding IS DISTINCT FROM readiness->>'journeyBinding' OR
 nr.preset IS DISTINCT FROM g.macro_preset OR nr.policy_version IS DISTINCT FROM policy.version OR
 nr.policy_digest IS DISTINCT FROM policy.digest OR nr.engine_version IS DISTINCT FROM policy.engine_version OR
 nr.current_calories IS DISTINCT FROM g.daily_calories OR nr.current_protein_g IS DISTINCT FROM g.protein_g OR
 nr.current_carbs_g IS DISTINCT FROM g.carbs_g OR nr.current_fats_g IS DISTINCT FROM g.fats_g OR nr.current_fiber_g IS DISTINCT FROM g.fiber_g THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'macro_review_changed'); END IF;
 IF date_part('year',age(today,u.date_of_birth))<19 THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'macro_review_age'); END IF;
 expected_review:=jsonb_build_object('status','reviewed','reviewId',nr.review_id,'reviewVersion',nr.review_version,
  'approvalDigest',nr.approval_digest,'approvalVersion',nr.approval_version,
  'reviewedAt',floor(extract(epoch FROM nr.reviewed_at)*1000),'expiresAt',floor(extract(epoch FROM nr.expires_at)*1000),
  'ageYears',date_part('year',age(today,u.date_of_birth))::integer,'eligibility','eligible');
 expected_limits:=jsonb_build_object('proteinMinG',nr.protein_min_g,'proteinMaxG',nr.protein_max_g,
  'carbsMinG',nr.carbs_min_g,'carbsMaxG',nr.carbs_max_g,'fatsMinG',nr.fats_min_g,'fatsMaxG',nr.fats_max_g,
  'fatMinFraction',nr.fat_min_fraction,'fatMaxFraction',nr.fat_max_fraction);
 IF me->'review' IS DISTINCT FROM expected_review OR me->'limits' IS DISTINCT FROM expected_limits THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'macro_review_changed'); END IF;
 -- Preference save/revoke already takes this same user's lock before the goal.
 SELECT * INTO mc FROM macrogoal_snapshot_review_private.macro_choices
 WHERE owner_id=actor AND goal_id=g.id ORDER BY choice_version DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND OR mc.mode<>'smart' OR mc.split_bps IS NOT NULL OR mc.copy_version<>'macro-choice-v1' OR
 mc.goal_updated_at IS DISTINCT FROM g.updated_at OR mc.profile_binding IS DISTINCT FROM readiness->>'profileBinding' OR
 mc.journey_binding IS DISTINCT FROM readiness->>'journeyBinding' OR mc.recorded_at>clock_timestamp() OR
 mc.recorded_at>(p.payload->>'sourceCapturedAt')::timestamptz THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'macro_choice_changed'); END IF;
 expected_choice:=jsonb_build_object('mode','smart','binding',mb,'consentId',mc.request_id,
  'acceptedAt',floor(extract(epoch FROM mc.recorded_at)*1000),'choiceVersion',mc.choice_version,'splitBps',NULL);
 IF me->'choice' IS DISTINCT FROM expected_choice THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'macro_choice_changed'); END IF;
 -- Exact protein preservation belongs ONLY to this explicit Smart contract.
 -- No manual-percent or protein-correction contract is silently treated as Smart.
 IF (target->>'proteinG')::integer IS DISTINCT FROM g.protein_g OR
 (target->>'proteinG')::numeric NOT BETWEEN nr.protein_min_g AND nr.protein_max_g OR
 (target->>'carbsG')::numeric NOT BETWEEN nr.carbs_min_g AND nr.carbs_max_g OR
 (target->>'fatsG')::numeric NOT BETWEEN nr.fats_min_g AND nr.fats_max_g OR
 (9*(target->>'fatsG')::numeric/(target->>'calories')::numeric) NOT BETWEEN nr.fat_min_fraction AND nr.fat_max_fraction THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'macro_target_limits'); END IF;

 IF anchor.baseline_captured_at>clock_timestamp() OR
    (anchor.last_accepted_at IS NULL AND anchor.baseline_captured_at+make_interval(days=>policy.min_days_between_acceptances)>clock_timestamp()) OR
    (anchor.accepted_delta_kcal<>0 AND anchor.last_accepted_at IS NULL) OR
    (anchor.last_accepted_at IS NOT NULL AND anchor.last_accepted_at+make_interval(days=>policy.min_days_between_acceptances)>clock_timestamp()) THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'review_cooldown'); END IF;
 IF p.expires_at<=clock_timestamp() OR policy.expires_at<=clock_timestamp() OR e.expires_at<=clock_timestamp() OR nr.expires_at<=clock_timestamp() OR
    NOT macrogoal_snapshot_review_private.snapshot_time_valid(snapshot->>'capturedAt',clock_timestamp()) THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'source_expired'); END IF;
 -- Recheck managed tester authority after review/preference locks, not just at
 -- snapshot capture. This never extends proof/binding expiry or grants access.
 final_tester_access:=macrogoal_observed_private.tester_access(actor);
 IF jsonb_typeof(final_tester_access) IS DISTINCT FROM 'object' OR
    jsonb_typeof(final_tester_access->'managed') IS DISTINCT FROM 'boolean' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'premium_authority_unavailable'); END IF;
 IF final_tester_access->'managed'='true'::jsonb THEN
  IF final_tester_access->'allowed' IS DISTINCT FROM 'true'::jsonb OR
     jsonb_typeof(final_tester_access->'validUntil') IS DISTINCT FROM 'number' THEN
   RETURN macrogoal_snapshot_review_private.reject_request(p_request,'premium_authority_expired'); END IF;
  IF (final_tester_access->>'validUntil')::numeric<=extract(epoch FROM clock_timestamp())*1000 THEN
   RETURN macrogoal_snapshot_review_private.reject_request(p_request,'premium_authority_expired'); END IF;
 END IF;
 accepted_at:=macrogoal_goal_write_private.accepted_timestamp(g.created_at);
 UPDATE public.goals SET is_active=false WHERE id=g.id AND user_id=actor;
 INSERT INTO public.goals(user_id,goal_type,goal_intensity,target_weight,daily_calories,protein_g,carbs_g,fats_g,fiber_g,is_active,
  loss_rate_lbs_per_week,start_date,start_journey_date,macro_preset,base_daily_calories,last_adaptive_update,created_at,updated_at)
 VALUES(actor,g.goal_type,g.goal_intensity,g.target_weight,(target->>'calories')::integer,(target->>'proteinG')::integer,
  (target->>'carbsG')::integer,(target->>'fatsG')::integer,(target->>'fiberG')::integer,true,g.loss_rate_lbs_per_week,
  g.start_date,g.start_journey_date,g.macro_preset,anchor.baseline_intake_kcal,accepted_at,accepted_at,accepted_at) RETURNING * INTO result;
 UPDATE macrogoal_snapshot_review_private.anchors SET active_goal_id=result.id,accepted_delta_kcal=accepted_delta_kcal+delta,last_accepted_at=accepted_at WHERE id=anchor.id;
 UPDATE macrogoal_snapshot_review_private.proposals SET consumed_request=(p_request->>'requestId')::uuid WHERE id=p.id;
 INSERT INTO macrogoal_snapshot_review_private.receipts(owner_id,request_id,request,status,anchor_id,accepted_goal_id,accepted_goal,acceptance_evidence)
 VALUES(actor,(p_request->>'requestId')::uuid,p_request,'committed',anchor.id,result.id,to_jsonb(result),
 jsonb_build_object('contract','as-of-revalidated-v1','fingerprint',snapshot->>'sourceFingerprint','capturedAt',snapshot->>'capturedAt',
 'macroReviewId',nr.review_id,'macroReviewVersion',nr.review_version,'macroChoiceId',mc.request_id,'macroChoiceVersion',mc.choice_version,
 'macroAllocationMode','smart-preserve-adequate-protein-v1'));
 RETURN jsonb_build_object('version','adaptive-receipt-v1','status','committed','request',p_request,
   'acceptedGoal',jsonb_build_object('id',result.id,'updatedAt',result.updated_at),'goalState','current');
END $fn$;
ROLLBACK;
