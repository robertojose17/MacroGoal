-- Authorized own-actor QA tail: append inside BEGIN with private macrogoal.qa_owner GUC. Synthetic offers/receipt fixtures never persist. Mandatory ROLLBACK.
DO $seed$
DECLARE a uuid:=nullif(current_setting('macrogoal.qa_owner',true),'')::uuid;g public.goals; aid uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();v text:='recovery-fixture-'||gen_random_uuid()::text;req jsonb;future_req jsonb;payload jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'qa owner required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='macrogoal_snapshot_review_private.receipts'::regclass AND NOT tgisinternal AND tgenabled<>'D') THEN RAISE EXCEPTION 'unreviewed receipt triggers';END IF;
 SELECT * INTO STRICT g FROM public.goals WHERE user_id=a AND is_active;
 INSERT INTO macrogoal_snapshot_review_private.policies VALUES(v,'fixture',repeat('a',64),true,true,true,200,0.05,14,400,1500,5000,clock_timestamp()+interval '5 minutes');
 INSERT INTO macrogoal_snapshot_review_private.anchors(id,owner_id,policy_version,active_goal_id,baseline_intake_kcal,baseline_expenditure_kcal,baseline_captured_at,journey_binding,baseline_goal_snapshot)
 VALUES(aid,a,v,g.id,g.daily_calories,g.daily_calories,clock_timestamp(),repeat('b',64),to_jsonb(g));
 payload:=jsonb_build_object('current',jsonb_build_object('calories',2000,'proteinG',150,'carbsG',215,'fatsG',60,'fiberG',30),'target',jsonb_build_object('calories',2025,'proteinG',150,'carbsG',221,'fatsG',60,'fiberG',30),'deltaKcal',25,'sourceDate','2026-11-13');
 INSERT INTO macrogoal_snapshot_review_private.proposals(id,owner_id,policy_version,anchor_id,digest,payload,expires_at) VALUES
 (pid,a,v,aid,repeat('c',64),payload,clock_timestamp()-interval '1 minute'),
 (fid,a,v,aid,repeat('d',64),payload,clock_timestamp()+interval '4 minutes');
 req:=jsonb_build_object('ownerId',a,'requestId',gen_random_uuid(),'proposalId',pid,'proposalDigest',repeat('c',64));
 future_req:=jsonb_build_object('ownerId',a,'requestId',gen_random_uuid(),'proposalId',fid,'proposalDigest',repeat('d',64));
 PERFORM set_config('macrogoal.qa_request',req::text,true);
 PERFORM set_config('macrogoal.qa_committed_request',(req||jsonb_build_object('requestId',gen_random_uuid()))::text,true);
 INSERT INTO macrogoal_snapshot_review_private.receipts(owner_id,request_id,request,status,anchor_id,accepted_goal_id,accepted_goal,acceptance_evidence)
 VALUES(a,((current_setting('macrogoal.qa_committed_request')::jsonb)->>'requestId')::uuid,current_setting('macrogoal.qa_committed_request')::jsonb,'committed',aid,g.id,to_jsonb(g),jsonb_build_object('fixture',true));PERFORM set_config('macrogoal.qa_future_request',future_req::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
END $seed$;
SET LOCAL ROLE authenticated;
DO $qa$
DECLARE r jsonb:=current_setting('macrogoal.qa_request')::jsonb;f jsonb:=current_setting('macrogoal.qa_future_request')::jsonb;v jsonb;w jsonb;denied boolean:=false;
BEGIN
 v:=public.tdee_read_snapshot_offer_v1(r);
 IF v->>'status'<>'expired' OR v->'proposal' IS DISTINCT FROM 'null'::jsonb OR v->'request' IS DISTINCT FROM r THEN RAISE EXCEPTION 'expired read failed';END IF;
 v:=public.tdee_read_snapshot_offer_v1(f);
 IF v->>'status'<>'available' OR v#>>'{proposal,id}'<>f->>'proposalId' THEN RAISE EXCEPTION 'available exact read failed';END IF;
 v:=public.tdee_close_expired_snapshot_request_v1(f);
 IF v->>'status'<>'not_found' THEN RAISE EXCEPTION 'future offer closed';END IF;
 v:=public.tdee_close_expired_snapshot_request_v1(r);
 IF v->>'status'<>'rejected' OR v->>'reason'<>'proposal_expired' OR v->'request' IS DISTINCT FROM r THEN RAISE EXCEPTION 'expiry close failed';END IF;
 w:=public.tdee_close_expired_snapshot_request_v1(r);IF w IS DISTINCT FROM v THEN RAISE EXCEPTION 'close not idempotent';END IF;
 w:=public.tdee_read_snapshot_receipt_v1(r);IF w IS DISTINCT FROM v THEN RAISE EXCEPTION 'receipt mismatch';END IF;
 BEGIN PERFORM public.tdee_read_snapshot_offer_v1(r||jsonb_build_object('ownerId',gen_random_uuid()));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'crossowner not denied';END IF;
 denied:=false;BEGIN PERFORM public.tdee_close_expired_snapshot_request_v1(r||jsonb_build_object('proposalDigest',repeat('e',64)));EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'same request mismatch not denied';END IF;
 v:=public.tdee_close_expired_snapshot_request_v1(current_setting('macrogoal.qa_committed_request')::jsonb);
 IF v->>'status'<>'committed' OR v->>'goalState'<>'current' THEN RAISE EXCEPTION 'prior commit not preserved';END IF;
 w:=public.tdee_close_expired_snapshot_request_v1(current_setting('macrogoal.qa_committed_request')::jsonb);
 IF w IS DISTINCT FROM v THEN RAISE EXCEPTION 'prior commit replay differs';END IF;
 IF has_function_privilege('anon','public.tdee_read_snapshot_offer_v1(jsonb)','execute') OR has_function_privilege('anon','public.tdee_close_expired_snapshot_request_v1(jsonb)','execute') THEN RAISE EXCEPTION 'anon granted';END IF;
 RAISE NOTICE 'PASS own offer read, expired closure, future no-op, repeat receipt, crossowner and mismatch denied';
END $qa$;
RESET ROLE;
ROLLBACK;