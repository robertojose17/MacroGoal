-- Review-only test tail. Combine reviewed candidate body (without BEGIN/COMMIT)
-- inside BEGIN, set LOCAL macrogoal.qa_owner privately, append this tail.
-- Synthetic policy/anchor/eligibility only inside ROLLBACK; no model validation.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $qa$
DECLARE
 actor uuid:=nullif(current_setting('macrogoal.qa_owner',true),'')::uuid;
 claims jsonb; u public.users; g public.goals; old_goal jsonb; state jsonb; snap jsonb;
 aid uuid:=gen_random_uuid(); pv text:='refresh-rollback-'||gen_random_uuid()::text;
 pd text; anchor_snapshot jsonb; record jsonb; answer jsonb; replay jsonb; bad jsonb;
 expected_digest text; prior_eligibility jsonb; current_eligibility jsonb;
 before_receipts bigint; before_proposals bigint; before_anchors bigint; before_goals bigint;
 failed boolean; why text; today date; first_day date; stamp timestamptz;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'private own actor required'; END IF;
 pd:=encode(sha256(convert_to(pv,'UTF8')),'hex');
 claims:=jsonb_build_object('sub',actor,'role','authenticated','is_anonymous',false);
 PERFORM set_config('request.jwt.claims',claims::text,true);
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF macrogoal_observed_private.tester_access(actor)->'allowed' IS DISTINCT FROM 'true'::jsonb THEN
 RAISE EXCEPTION 'refresh real premium evidence first'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN
 ('macrogoal_readiness_private.attestations'::regclass,'macrogoal_readiness_private.requests'::regclass,
 'macrogoal_snapshot_review_private.policies'::regclass,'macrogoal_snapshot_review_private.anchors'::regclass,
 'macrogoal_snapshot_review_private.eligibility'::regclass) AND NOT tgisinternal AND tgenabled<>'D') THEN
 RAISE EXCEPTION 'unreviewed fixture-table triggers'; END IF;
 SELECT * INTO STRICT u FROM public.users WHERE id=actor FOR UPDATE;
 SELECT * INTO STRICT g FROM public.goals WHERE user_id=actor AND is_active=true FOR UPDATE;
 old_goal:=to_jsonb(g);
 IF EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.anchors WHERE owner_id=actor AND active_goal_id=g.id) THEN
 RAISE EXCEPTION 'existing current anchor; do not overwrite for test'; END IF;
 state:=public.tdee_read_readiness_v1();today:=(state->>'today')::date;
 first_day:=greatest(today-2,coalesce(u.journey_start_date,today-2));
 IF first_day>=today-1 THEN RAISE EXCEPTION 'no closed interval for bounded fixture'; END IF;
 state:=public.tdee_confirm_readiness_v1(jsonb_build_object('requestId',gen_random_uuid(),'kind','eligibility',
 'version','general-adult-v1','profileBinding',state->>'profileBinding','journeyBinding',state->>'journeyBinding','response','criteria_confirmed'));
 snap:=public.observed_get_tdee_snapshot_v1();
 IF snap#>'{context,premium}' IS DISTINCT FROM 'true'::jsonb OR snap#>'{context,enabled}' IS DISTINCT FROM 'true'::jsonb THEN
 RAISE EXCEPTION 'actual snapshot must be enabled and premium'; END IF;
 INSERT INTO macrogoal_snapshot_review_private.policies VALUES
 (pv,'refresh-rollback-fixture-only',pd,true,true,true,200,0.2,14,500,1500,4000,clock_timestamp()+interval '10 minutes');
 INSERT INTO macrogoal_snapshot_review_private.anchors
 (id,owner_id,policy_version,active_goal_id,baseline_intake_kcal,baseline_expenditure_kcal,baseline_captured_at,journey_binding,baseline_goal_snapshot)
 VALUES(aid,actor,pv,g.id,g.daily_calories,g.daily_calories,(snap->>'capturedAt')::timestamptz,state->>'journeyBinding',old_goal);
 SELECT to_jsonb(a) INTO anchor_snapshot FROM macrogoal_snapshot_review_private.anchors a WHERE id=aid;
 SELECT count(*) INTO before_receipts FROM macrogoal_snapshot_review_private.receipts WHERE owner_id=actor;
 SELECT count(*) INTO before_proposals FROM macrogoal_snapshot_review_private.proposals WHERE owner_id=actor;
 SELECT count(*) INTO before_anchors FROM macrogoal_snapshot_review_private.anchors WHERE owner_id=actor;
 SELECT count(*) INTO before_goals FROM public.goals WHERE user_id=actor;
 record:=jsonb_build_object('kind','eligibility_refresh_draft','actionable',false,'ownerId',actor,
 'expectedProfileUpdatedAt',u.updated_at,'expectedGoalSnapshot',old_goal,'journeyBinding',state->>'journeyBinding',
 'sourceFingerprint',snap->>'sourceFingerprint','readinessFingerprint',encode(sha256(convert_to((state-'capturedAt')::text,'UTF8')),'hex'),
 'sourceCapturedAt',snap->>'capturedAt','policyVersion',pv,'policyDigest',pd,'engineVersion','refresh-rollback-fixture-only',
 'anchorId',aid,'expectedAnchorSnapshot',anchor_snapshot,'eligibilityEvidence',jsonb_build_object('responseVersion','general-adult-v1',
 'readinessVerified',true,'completeDaysVerified',true,'windowStart',first_day,'asOf',today-1,
 'expiresAt',(snap->>'capturedAt')::timestamptz+interval '4 minutes'));
 -- Ordinary authenticated requests must not gain issuer authority.
 failed:=false;
 BEGIN PERFORM public.tdee_refresh_snapshot_eligibility_v1(record);
 EXCEPTION WHEN SQLSTATE '42501' THEN IF SQLERRM='issuer_required' THEN failed:=true; ELSE RAISE; END IF; END;
 IF NOT failed THEN RAISE EXCEPTION 'authenticated caller accepted'; END IF;
 PERFORM set_config('request.jwt.claims',(claims||jsonb_build_object('role','service_role'))::text,true);
 answer:=public.tdee_refresh_snapshot_eligibility_v1(record);
 IF answer->>'status' IS DISTINCT FROM 'refreshed' OR answer->'actionable' IS DISTINCT FROM 'false'::jsonb THEN
 RAISE EXCEPTION 'refresh did not persist'; END IF;
 expected_digest:=encode(sha256(convert_to(jsonb_build_object('ownerId',actor,'anchorId',aid,'policyDigest',pd,
 'sourceFingerprint',record->>'sourceFingerprint','readinessFingerprint',record->>'readinessFingerprint',
 'evidence',record->'eligibilityEvidence')::text,'UTF8')),'hex');
 IF answer->>'eligibilityDigest' IS DISTINCT FROM expected_digest THEN RAISE EXCEPTION 'canonical digest mismatch'; END IF;
 SELECT to_jsonb(e) INTO prior_eligibility FROM macrogoal_snapshot_review_private.eligibility e WHERE owner_id=actor AND policy_version=pv;
 IF prior_eligibility->'eligible' IS DISTINCT FROM 'true'::jsonb OR
 prior_eligibility->>'source_fingerprint' IS DISTINCT FROM snap->>'sourceFingerprint' THEN RAISE EXCEPTION 'eligibility row mismatch'; END IF;
 replay:=public.tdee_refresh_snapshot_eligibility_v1(record);
 IF replay IS DISTINCT FROM answer THEN RAISE EXCEPTION 'same evidence refresh renewed or changed'; END IF;
 -- Failure cases must leave the already written evidence byte-identical.
 FOR bad,why IN SELECT value,reason FROM (VALUES
 (jsonb_set(record,'{expectedAnchorSnapshot,accepted_delta_kcal}','25'::jsonb),'anchor_changed'),
 (jsonb_set(record,'{expectedGoalSnapshot,daily_calories}','1'::jsonb),'goal_changed'),
 (jsonb_set(record,'{policyDigest}',to_jsonb(repeat('c',64))),'safety_review_required'),
 (jsonb_set(record,'{sourceCapturedAt}',to_jsonb(to_char((clock_timestamp()-interval '31 seconds') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),'refresh_evidence_invalid'),
 (jsonb_set(record,'{eligibilityEvidence,completeDaysVerified}','false'::jsonb),'eligibility_evidence_invalid'),
 (jsonb_set(record,'{eligibilityEvidence,expiresAt}',to_jsonb((snap->>'capturedAt')::timestamptz+interval '6 minutes')),'eligibility_expired')
 ) AS cases(value,reason) LOOP
  failed:=false;
  BEGIN PERFORM public.tdee_refresh_snapshot_eligibility_v1(bad);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM=why THEN failed:=true; ELSE RAISE; END IF; END;
  IF NOT failed THEN RAISE EXCEPTION 'failure case did not reject: %',why; END IF;
  SELECT to_jsonb(e) INTO current_eligibility FROM macrogoal_snapshot_review_private.eligibility e WHERE owner_id=actor AND policy_version=pv;
  IF current_eligibility IS DISTINCT FROM prior_eligibility THEN RAISE EXCEPTION 'failed refresh changed eligibility'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims',claims::text,true);
 state:=public.tdee_confirm_readiness_v1(jsonb_build_object('requestId',gen_random_uuid(),'kind','eligibility',
 'version','general-adult-v1','profileBinding',state->>'profileBinding','journeyBinding',state->>'journeyBinding','response','not_confirmed'));
 PERFORM set_config('request.jwt.claims',(claims||jsonb_build_object('role','service_role'))::text,true);
 failed:=false;
 BEGIN PERFORM public.tdee_refresh_snapshot_eligibility_v1(record);
 EXCEPTION WHEN SQLSTATE '40001' THEN IF SQLERRM='readiness_changed' THEN failed:=true; ELSE RAISE; END IF; END;
 IF NOT failed THEN RAISE EXCEPTION 'revoked readiness accepted'; END IF;
 IF (SELECT to_jsonb(a) FROM macrogoal_snapshot_review_private.anchors a WHERE id=aid) IS DISTINCT FROM anchor_snapshot OR
 (SELECT to_jsonb(x) FROM public.goals x WHERE id=g.id) IS DISTINCT FROM old_goal OR
 (SELECT count(*) FROM public.goals WHERE user_id=actor)<>before_goals OR
 (SELECT count(*) FROM macrogoal_snapshot_review_private.anchors WHERE owner_id=actor)<>before_anchors OR
 (SELECT count(*) FROM macrogoal_snapshot_review_private.receipts WHERE owner_id=actor)<>before_receipts OR
 (SELECT count(*) FROM macrogoal_snapshot_review_private.proposals WHERE owner_id=actor)<>before_proposals THEN
 RAISE EXCEPTION 'refresh modified calibration/goals/receipts/proposals'; END IF;
 RAISE NOTICE 'PASS eligibility refresh, service-only, CAS, TTL, canonical digest, revocation, no goal/anchor writes; ROLLBACK follows';
END $qa$;
ROLLBACK;
-- Verify separately: candidate functions absent if freshly compiled, existing readiness restored,
-- original goals unchanged, and no refresh-rollback policy/anchor/evidence retained.
