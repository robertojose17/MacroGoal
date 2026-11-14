-- REVIEW-ONLY ROLLBACK TAIL. Never execute standalone or substitute COMMIT.
-- Runner: BEGIN; SET LOCAL macrogoal.qa_owner = private own-account UUID;
-- append snapshotRegistryCandidate.sql WITHOUT its BEGIN/COMMIT; append this tail.
-- No entitlement writes, grants, nutrition-model validation, or persistent policy.
-- All synthetic reviewed flags below are fixtures, NOT evidence of clinical review.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $qa$
DECLARE
 actor uuid:=nullif(current_setting('macrogoal.qa_owner',true),'')::uuid;
 claims jsonb; access jsonb; u public.users; g public.goals; old_goal jsonb;
 state jsonb; snap jsonb; payload jsonb; offer jsonb; req jsonb; answer jsonb; replay jsonb;
 v_anchor_id uuid:=gen_random_uuid(); v_proposal_id uuid; v_request_id uuid; accepted_id uuid;
 pv text:='rollback-fixture-'||gen_random_uuid()::text;
 pd text:=repeat('a',64); ed text:=repeat('b',64); before_count bigint; after_count bigint;
 target_cal integer; target_protein integer; target_carbs integer; target_fat integer;
 mode integer; mismatch boolean:=false; trigger_body text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'private own-actor GUC required'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'READ COMMITTED required'; END IF;
 claims:=jsonb_build_object('sub',actor,'role','authenticated','is_anonymous',false);
 PERFORM set_config('request.jwt.claims',claims::text,true);
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 -- This calls the real official-cache decision. Never renew/seed a tester binding.
 access:=macrogoal_observed_private.tester_access(actor);
 IF access->'allowed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'real premium access unavailable; refresh official evidence first'; END IF;
 -- Reject any new custom trigger before goal/settings/readiness writes.
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.goals'::regclass AND NOT tgisinternal AND tgenabled<>'D')<>1 OR
 NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.goals'::regclass AND NOT tgisinternal
 AND tgname='update_goals_updated_at' AND tgfoid='public.update_updated_at_column()'::regprocedure
 AND tgtype=19 AND tgenabled IN ('O','A')) THEN RAISE EXCEPTION 'unreviewed goal triggers'; END IF;
 SELECT regexp_replace(prosrc,'\s','','g') INTO trigger_body FROM pg_proc WHERE oid='public.update_updated_at_column()'::regprocedure;
 IF lower(trigger_body)<>'beginnew.updated_at=now();returnnew;end;' THEN RAISE EXCEPTION 'timestamp trigger changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('macrogoal_observed_private.settings'::regclass,
 'macrogoal_readiness_private.attestations'::regclass,'macrogoal_readiness_private.requests'::regclass)
 AND NOT tgisinternal AND tgenabled<>'D') THEN RAISE EXCEPTION 'unreviewed fixture-table trigger'; END IF;
 SELECT * INTO STRICT u FROM public.users WHERE id=actor FOR UPDATE;
 SELECT * INTO STRICT g FROM public.goals WHERE user_id=actor AND is_active=true FOR UPDATE;
 old_goal:=to_jsonb(g);
 SELECT count(*) INTO before_count FROM public.goals WHERE user_id=actor;
 IF u.updated_at IS NULL OR g.updated_at IS NULL OR g.daily_calories IS NULL OR g.daily_calories<1500 OR
 g.daily_calories>3975 OR g.fiber_g IS NULL OR g.fiber_g<0 THEN RAISE EXCEPTION 'actual goal unsuitable for bounded SQL fixture'; END IF;
 INSERT INTO macrogoal_observed_private.settings(user_id,enabled,review_day,started_on)
 VALUES(actor,true,0,(clock_timestamp() AT TIME ZONE u.timezone)::date)
 ON CONFLICT(user_id) DO UPDATE SET enabled=true;
 state:=public.tdee_read_readiness_v1();
 IF state#>'{eligibility,adult}' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'actual adult profile required'; END IF;
 state:=public.tdee_confirm_readiness_v1(jsonb_build_object('requestId',gen_random_uuid(),'kind','eligibility',
 'version','general-adult-v1','profileBinding',state->>'profileBinding','journeyBinding',state->>'journeyBinding',
 'response','criteria_confirmed'));
 snap:=public.observed_get_tdee_snapshot_v1();
 IF snap#>'{context,premium}' IS DISTINCT FROM 'true'::jsonb OR snap#>'{context,enabled}' IS DISTINCT FROM 'true'::jsonb THEN
 RAISE EXCEPTION 'actual snapshot context unavailable'; END IF;
 -- Fixture target is deliberately small and macro-consistent, not a recommendation.
 target_cal:=g.daily_calories+25;
 target_protein:=round(target_cal*0.25/4)::integer;
 target_fat:=round(target_cal*0.25/9)::integer;
 target_carbs:=round((target_cal-4*target_protein-9*target_fat)::numeric/4)::integer;
 INSERT INTO macrogoal_snapshot_review_private.policies VALUES(pv,'rollback-fixture-only',pd,true,true,true,200,0.2,14,500,1500,4000,clock_timestamp()+interval '10 minutes');
 INSERT INTO macrogoal_snapshot_review_private.anchors(id,owner_id,policy_version,active_goal_id,baseline_intake_kcal,baseline_expenditure_kcal,baseline_captured_at)
 VALUES(v_anchor_id,actor,pv,g.id,g.daily_calories,g.daily_calories+100,clock_timestamp()-interval '15 days');
 INSERT INTO macrogoal_snapshot_review_private.eligibility VALUES(actor,pv,ed,true,true,snap->>'sourceFingerprint',clock_timestamp()+interval '10 minutes');
 FOR mode IN 1..2 LOOP
  -- Re-read current readiness after the revoked-fixture case was restored.
  state:=public.tdee_read_readiness_v1();
  snap:=public.observed_get_tdee_snapshot_v1();
  payload:=jsonb_build_object('snapshotSemantics','as-of-revalidated-v1','sourceFingerprint',snap->>'sourceFingerprint',
  'sourceCapturedAt',snap->>'capturedAt','readinessFingerprint',encode(sha256(convert_to((state-'capturedAt')::text,'UTF8')),'hex'),
  'goalId',g.id,'goalUpdatedAt',g.updated_at,'profileUpdatedAt',u.updated_at,'goalSnapshot',old_goal,
  'policyDigest',pd,'eligibilityDigest',ed,'engineVersion','rollback-fixture-only','today',state->>'today',
  'sourceDate',((state->>'today')::date-1)::text,
  'current',jsonb_build_object('calories',g.daily_calories,'proteinG',g.protein_g,'carbsG',g.carbs_g,'fatsG',g.fats_g,'fiberG',g.fiber_g),
  'target',jsonb_build_object('calories',target_cal,'proteinG',target_protein,'carbsG',target_carbs,'fatsG',target_fat,'fiberG',g.fiber_g),'deltaKcal',25);
  v_proposal_id:=gen_random_uuid(); v_request_id:=gen_random_uuid();
  -- Simulated issuer role exercises private issue_proposal only; no grant or entitlement fabrication.
  PERFORM set_config('request.jwt.claims',(claims||jsonb_build_object('role','service_role'))::text,true);
  offer:=macrogoal_snapshot_review_private.issue_proposal(v_proposal_id,actor,pv,v_anchor_id,
   (snap->>'capturedAt')::timestamptz+interval '4 minutes',payload);
  PERFORM set_config('request.jwt.claims',claims::text,true);
  req:=jsonb_build_object('ownerId',actor,'requestId',v_request_id,'proposalId',v_proposal_id,'proposalDigest',offer->>'digest');
  IF mode=1 THEN
   state:=public.tdee_confirm_readiness_v1(jsonb_build_object('requestId',gen_random_uuid(),'kind','eligibility',
    'version','general-adult-v1','profileBinding',state->>'profileBinding','journeyBinding',state->>'journeyBinding','response','not_confirmed'));
   answer:=macrogoal_snapshot_review_private.accept_proposal(req);
   IF answer->>'status' IS DISTINCT FROM 'rejected' OR answer->>'reason' IS DISTINCT FROM 'readiness_changed' THEN
    RAISE EXCEPTION 'readiness revoke failed: %',answer; END IF;
   IF (SELECT to_jsonb(x) FROM public.goals x WHERE id=g.id) IS DISTINCT FROM old_goal OR
    (SELECT count(*) FROM public.goals WHERE user_id=actor)<>before_count OR
    EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.proposals WHERE id=v_proposal_id AND consumed_request IS NOT NULL) THEN
    RAISE EXCEPTION 'rejected request mutated goal/consumption'; END IF;
   state:=public.tdee_confirm_readiness_v1(jsonb_build_object('requestId',gen_random_uuid(),'kind','eligibility',
    'version','general-adult-v1','profileBinding',state->>'profileBinding','journeyBinding',state->>'journeyBinding','response','criteria_confirmed'));
  ELSE
   answer:=macrogoal_snapshot_review_private.accept_proposal(req);
   IF answer->>'status' IS DISTINCT FROM 'committed' THEN RAISE EXCEPTION 'acceptance failed: %',answer; END IF;
   accepted_id:=(answer#>>'{acceptedGoal,id}')::uuid;
   IF (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 OR
    NOT EXISTS(SELECT 1 FROM public.goals WHERE id=accepted_id AND user_id=actor AND is_active AND daily_calories=target_cal
      AND protein_g=target_protein AND carbs_g=target_carbs AND fats_g=target_fat AND fiber_g=g.fiber_g) OR
    NOT EXISTS(SELECT 1 FROM public.goals WHERE id=g.id AND user_id=actor AND NOT is_active) OR
    (SELECT count(*) FROM public.goals WHERE user_id=actor)<>before_count+1 OR
    NOT EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.anchors WHERE id=v_anchor_id AND active_goal_id=accepted_id AND accepted_delta_kcal=25 AND last_accepted_at IS NOT NULL) OR
    NOT EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.proposals WHERE id=v_proposal_id AND consumed_request=v_request_id) OR
    NOT EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.receipts r JOIN public.goals x ON x.id=r.accepted_goal_id
     WHERE r.owner_id=actor AND r.request_id=v_request_id AND r.status='committed' AND r.anchor_id=v_anchor_id
     AND r.accepted_goal=to_jsonb(x) AND r.acceptance_evidence->>'contract'='as-of-revalidated-v1') THEN
    RAISE EXCEPTION 'atomic goal/anchor/proposal/receipt invariant failed'; END IF;
   replay:=macrogoal_snapshot_review_private.accept_proposal(req);
   IF replay IS DISTINCT FROM answer OR (SELECT count(*) FROM public.goals WHERE user_id=actor)<>before_count+1 OR
    (SELECT count(*) FROM macrogoal_snapshot_review_private.receipts WHERE owner_id=actor AND status='committed')<>1 THEN
    RAISE EXCEPTION 'idempotent replay failed'; END IF;
   replay:=macrogoal_snapshot_review_private.accept_proposal(req||jsonb_build_object('requestId',gen_random_uuid()));
   IF replay->>'status' IS DISTINCT FROM 'rejected' OR replay->>'reason' IS DISTINCT FROM 'proposal_consumed' THEN
    RAISE EXCEPTION 'consumed proposal reuse failed'; END IF;
   BEGIN
    PERFORM macrogoal_snapshot_review_private.accept_proposal(req||jsonb_build_object('proposalDigest',repeat('c',64)));
   EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM='request_mismatch' THEN mismatch:=true; ELSE RAISE; END IF;
   END;
   IF NOT mismatch THEN RAISE EXCEPTION 'same request ID mismatch not rejected'; END IF;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS: actual premium gate; readiness revoke; atomic goal+receipt; replay; consumed reuse; request mismatch. ROLLBACK follows.';
END $qa$;
ROLLBACK;
-- Runner must then independently verify candidate schema absent and original own-goal/settings/readiness restored.
