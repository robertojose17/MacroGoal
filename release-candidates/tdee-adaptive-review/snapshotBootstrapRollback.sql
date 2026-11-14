-- Append to bootstrap writer BEGIN in an authorized own-actor transaction with macrogoal.qa_owner GUC. Synthetic fixture flags are not clinical evidence. Mandatory ROLLBACK.
DO $qa$
DECLARE actor uuid:=nullif(current_setting('macrogoal.qa_owner',true),'')::uuid; u public.users;g public.goals;s jsonb;r jsonb;x jsonb; y jsonb; pv text:='bootstrap-rollback-'||gen_random_uuid()::text; cap timestamptz:=clock_timestamp(); caught boolean:=false;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'qa actor missing';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','is_anonymous',false)::text,true);
 SELECT * INTO STRICT u FROM public.users WHERE id=actor FOR UPDATE;
 SELECT * INTO STRICT g FROM public.goals WHERE user_id=actor AND is_active=true FOR UPDATE;
 s:=public.tdee_read_readiness_v1();
 s:=public.tdee_confirm_readiness_v1(jsonb_build_object('requestId',gen_random_uuid(),'kind','eligibility','version','general-adult-v1','profileBinding',s->>'profileBinding','journeyBinding',s->>'journeyBinding','response','criteria_confirmed'));
 INSERT INTO macrogoal_snapshot_review_private.policies VALUES(pv,'fixture-only',repeat('a',64),true,true,true,200,0.05,14,400,1500,5000,cap+interval '5 minutes');
 r:=jsonb_build_object('kind','bootstrap_draft','actionable',false,'ownerId',actor,'expectedProfileUpdatedAt',u.updated_at,'expectedGoalSnapshot',to_jsonb(g),'journeyBinding',s->>'journeyBinding','sourceFingerprint',repeat('b',64),'readinessFingerprint',repeat('c',64),'sourceCapturedAt',cap,'policyVersion',pv,'policyDigest',repeat('a',64),'engineVersion','fixture-only','baseline',jsonb_build_object('intakeKcal',g.daily_calories,'expenditureKcal',g.daily_calories+100,'capturedAt',cap),'eligibilityEvidence',jsonb_build_object('responseVersion','general-adult-v1','readinessVerified',true,'completeDaysVerified',true,'windowStart','2026-10-16','asOf','2026-11-13','expiresAt',cap+interval '4 minutes'));
 BEGIN PERFORM macrogoal_snapshot_review_private.bootstrap(r);EXCEPTION WHEN insufficient_privilege THEN caught:=true;END;
 IF NOT caught THEN RAISE EXCEPTION 'auth can issue bootstrap';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 x:=macrogoal_snapshot_review_private.bootstrap(r);
 IF x->>'status'<>'created' THEN RAISE EXCEPTION 'not created';END IF;
 y:=macrogoal_snapshot_review_private.bootstrap(r);
 IF y->>'status'<>'existing' OR x->>'anchorId'<>y->>'anchorId' OR x->'baselineCapturedAt'<>y->'baselineCapturedAt' THEN RAISE EXCEPTION 'idempotence fail';END IF;
 IF (SELECT to_jsonb(v) FROM public.goals v WHERE id=g.id) IS DISTINCT FROM to_jsonb(g) THEN RAISE EXCEPTION 'goal mutated';END IF;
 caught:=false;BEGIN PERFORM macrogoal_snapshot_review_private.bootstrap(r||jsonb_build_object('journeyBinding',repeat('d',64)));EXCEPTION WHEN serialization_failure THEN caught:=true;END;
 IF NOT caught THEN RAISE EXCEPTION 'journey mismatch accepted';END IF;
 caught:=false;BEGIN PERFORM macrogoal_snapshot_review_private.bootstrap(jsonb_set(r,'{expectedGoalSnapshot,protein_g}','999'::jsonb));EXCEPTION WHEN serialization_failure THEN caught:=true;END;
 IF NOT caught THEN RAISE EXCEPTION 'goal mismatch accepted';END IF;
 RAISE NOTICE 'PASS bootstrap service-only, created, repeated no reset, unchanged goal, stale journey/goal denied. rollback';
END $qa$;
ROLLBACK;