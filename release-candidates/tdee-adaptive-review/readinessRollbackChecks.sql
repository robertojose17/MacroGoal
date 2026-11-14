-- APPEND to readinessAttestationsCandidate.sql with its final COMMIT removed.
-- Execute ONE transaction; final ROLLBACK is mandatory. Never execute standalone.
-- Operator must privately set macrogoal.qa_owner to the verified, authorized own
-- account UUID before this tail. No account ID or real source data belongs in repo.
-- SQL auth simulation only: not native/JWT/E2E proof. No original meals modified.
GRANT USAGE ON SCHEMA macrogoal_readiness_private TO authenticated;
GRANT EXECUTE ON FUNCTION macrogoal_readiness_private.read_state() TO authenticated;
GRANT EXECUTE ON FUNCTION macrogoal_readiness_private.save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tdee_read_readiness_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tdee_confirm_readiness_v1(jsonb) TO authenticated;
DO $test$
DECLARE a uuid:=nullif(current_setting('macrogoal.qa_owner',true),'')::uuid;
 s jsonb; out_state jsonb; req jsonb; day_row jsonb; req2 jsonb;
 saved_at timestamptz; expires timestamptz; after_at timestamptz; after_exp timestamptz;
 error_seen boolean; n integer:=0; actual_role text:=current_user;
BEGIN
 IF a IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=a) THEN RAISE EXCEPTION 'verified_qa_owner_required'; END IF;
 -- Fresh schema is required: candidate CREATE SCHEMA must have succeeded.
 IF EXISTS(SELECT 1 FROM macrogoal_readiness_private.attestations) OR
 EXISTS(SELECT 1 FROM macrogoal_readiness_private.complete_days) OR
 EXISTS(SELECT 1 FROM macrogoal_readiness_private.requests) THEN RAISE EXCEPTION 'fresh_private_schema_required'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM set_config('role','authenticated',true);
 s:=public.tdee_read_readiness_v1();
 IF s->>'version'<>'tdee-readiness-v1' OR s->>'ownerId'<>a::text OR
 jsonb_array_length(s->'days')>29 OR s->>'profileBinding' !~ '^[a-f0-9]{64}$' OR
 s->>'journeyBinding' !~ '^[a-f0-9]{64}$' OR
 EXISTS(SELECT 1 FROM jsonb_array_elements(s->'days') d WHERE d->>'date'>=s->>'today' OR
 d->>'contentHash' !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'read_shape_failed'; END IF; n:=n+1;
 req:=jsonb_build_object('requestId',gen_random_uuid(),'kind','eligibility','version','general-adult-v1',
 'profileBinding',s->>'profileBinding','journeyBinding',s->>'journeyBinding','response','unsure');
 out_state:=public.tdee_confirm_readiness_v1(req);
 IF out_state#>'{eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR
 out_state#>>'{eligibility,response}' IS DISTINCT FROM 'unsure' THEN RAISE EXCEPTION 'save_readback_not_current'; END IF; n:=n+1;
 PERFORM set_config('role',actual_role,true);
 SELECT accepted_at,expires_at INTO saved_at,expires FROM macrogoal_readiness_private.attestations WHERE owner_id=a;
 PERFORM set_config('role','authenticated',true);
 PERFORM public.tdee_confirm_readiness_v1(req);
 PERFORM set_config('role',actual_role,true);
 SELECT accepted_at,expires_at INTO after_at,after_exp FROM macrogoal_readiness_private.attestations WHERE owner_id=a;
 IF saved_at IS DISTINCT FROM after_at OR expires IS DISTINCT FROM after_exp THEN RAISE EXCEPTION 'replay_renewed_confirmation'; END IF; n:=n+1;
 PERFORM set_config('role','authenticated',true);
 error_seen:=false;
 BEGIN PERFORM public.tdee_confirm_readiness_v1(req||jsonb_build_object('response','not_confirmed'));
 EXCEPTION WHEN SQLSTATE '22023' THEN error_seen:=SQLERRM='request_mismatch'; END;
 IF NOT error_seen THEN RAISE EXCEPTION 'request_mismatch_not_rejected'; END IF; n:=n+1;
 -- Use only an existing own-account day, never create fake nutrition evidence.
 SELECT value INTO day_row FROM jsonb_array_elements(s->'days') WHERE value->'confirmable'='true'::jsonb LIMIT 1;
 IF FOUND THEN
 req2:=jsonb_build_object('requestId',gen_random_uuid(),'kind','days','version','complete-day-v1',
 'journeyBinding',s->>'journeyBinding','days',jsonb_build_array(jsonb_build_object('date',day_row->>'date',
 'contentHash',day_row->>'contentHash','confirmed',true)));
 out_state:=public.tdee_confirm_readiness_v1(req2);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(out_state->'days') d WHERE d->>'date'=day_row->>'date'
 AND d->'confirmed'='true'::jsonb) THEN RAISE EXCEPTION 'complete_day_readback_failed'; END IF; n:=n+1;
 req2:=jsonb_set(req2,'{requestId}',to_jsonb(gen_random_uuid()::text));
 req2:=jsonb_set(req2,'{days,0,confirmed}','false'::jsonb);
 out_state:=public.tdee_confirm_readiness_v1(req2);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(out_state->'days') d WHERE d->>'date'=day_row->>'date'
 AND d->'confirmed'='false'::jsonb) THEN RAISE EXCEPTION 'revoke_day_failed'; END IF; n:=n+1;
 ELSE RAISE NOTICE 'SKIP mark/revoke: no existing confirmable own day'; END IF;
 SELECT value INTO day_row FROM jsonb_array_elements(s->'days') LIMIT 1;
 IF FOUND THEN
 error_seen:=false;
 BEGIN PERFORM public.tdee_confirm_readiness_v1(jsonb_build_object('requestId',gen_random_uuid(),'kind','days',
 'version','complete-day-v1','journeyBinding',s->>'journeyBinding','days',
 jsonb_build_array(jsonb_build_object('date',day_row->>'date','contentHash',repeat('0',64),'confirmed',false))));
 EXCEPTION WHEN SQLSTATE '40001' THEN error_seen:=SQLERRM='day_changed_or_unavailable'; END;
 IF NOT error_seen THEN RAISE EXCEPTION 'stale_day_hash_not_rejected'; END IF; n:=n+1;
 ELSE RAISE NOTICE 'SKIP stale day: empty journey window'; END IF;
 error_seen:=false;
 BEGIN PERFORM 1 FROM macrogoal_readiness_private.attestations;
 EXCEPTION WHEN insufficient_privilege THEN error_seen:=true; END;
 IF NOT error_seen THEN RAISE EXCEPTION 'private_table_exposed'; END IF; n:=n+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',true)::text,true);
 error_seen:=false;
 BEGIN PERFORM public.tdee_read_readiness_v1();
 EXCEPTION WHEN insufficient_privilege THEN error_seen:=SQLERRM='authentication_required'; END;
 IF NOT error_seen THEN RAISE EXCEPTION 'anonymous_not_rejected'; END IF; n:=n+1;
 PERFORM set_config('role',actual_role,true);
 RAISE NOTICE 'PASS % readiness SQL checks; entire transaction MUST ROLLBACK',n;
END $test$;
ROLLBACK;
-- Separate post-run read-only verification must confirm schema and both wrappers absent.
