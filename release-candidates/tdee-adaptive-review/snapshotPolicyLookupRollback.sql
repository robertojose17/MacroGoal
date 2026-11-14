-- Append inside candidate transaction, replacing final COMMIT with this tail.
-- All test policies and role settings are transaction-local and rolled back.
-- Numeric values are synthetic schema fixtures, NOT approved policy or clinical limits.
DO $test$
DECLARE acl record;
BEGIN
 IF has_function_privilege('anon','public.tdee_read_snapshot_policy_v1(text,text,text)','EXECUTE') OR
 has_function_privilege('authenticated','public.tdee_read_snapshot_policy_v1(text,text,text)','EXECUTE') OR
 has_function_privilege('anon','macrogoal_snapshot_review_private.read_policy(text,text,text)','EXECUTE') OR
 has_function_privilege('authenticated','macrogoal_snapshot_review_private.read_policy(text,text,text)','EXECUTE') OR
 NOT has_function_privilege('service_role','public.tdee_read_snapshot_policy_v1(text,text,text)','EXECUTE') OR
 NOT has_function_privilege('service_role','macrogoal_snapshot_review_private.read_policy(text,text,text)','EXECUTE') OR
 has_table_privilege('service_role','macrogoal_snapshot_review_private.policies','SELECT') THEN
 RAISE EXCEPTION 'policy getter ACL failure'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.tdee_read_snapshot_policy_v1(text,text,text)'::regprocedure) OR
 NOT (SELECT prosecdef FROM pg_proc WHERE oid='macrogoal_snapshot_review_private.read_policy(text,text,text)'::regprocedure) THEN
 RAISE EXCEPTION 'policy getter security mode failure'; END IF;
END $test$;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
BEGIN
 IF public.tdee_read_snapshot_policy_v1('nonexistent-rollback-policy',repeat('a',64),'observed-v1/snapshot-adjustment-v1') IS NOT NULL THEN RAISE EXCEPTION 'missing lookup not null'; END IF;
 IF public.tdee_read_snapshot_policy_v1(NULL,repeat('a',64),'x') IS NOT NULL OR
 public.tdee_read_snapshot_policy_v1('',repeat('a',64),'x') IS NOT NULL OR
 public.tdee_read_snapshot_policy_v1(repeat('v',129),repeat('a',64),'x') IS NOT NULL OR
 public.tdee_read_snapshot_policy_v1('x','not-a-digest','x') IS NOT NULL OR
 public.tdee_read_snapshot_policy_v1('x',repeat('a',64),NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid input not null'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 BEGIN
  PERFORM public.tdee_read_snapshot_policy_v1('x',repeat('a',64),'x');
  RAISE EXCEPTION 'role defense failed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
BEGIN
 BEGIN PERFORM public.tdee_read_snapshot_policy_v1('x',repeat('a',64),'x'); RAISE EXCEPTION 'auth ACL bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
 BEGIN PERFORM public.tdee_read_snapshot_policy_v1('x',repeat('a',64),'x'); RAISE EXCEPTION 'anon ACL bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $fixture$
DECLARE prefix text:='getter-rollback-'||gen_random_uuid()::text; k text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='macrogoal_snapshot_review_private.policies'::regclass AND NOT tgisinternal AND tgenabled<>'D') THEN RAISE EXCEPTION 'policy triggers changed'; END IF;
 PERFORM set_config('macrogoal.policy_test_prefix',prefix,true);
 FOREACH k IN ARRAY ARRAY['good','disabled','unreviewed','contract','expired'] LOOP
 INSERT INTO macrogoal_snapshot_review_private.policies(version,engine_version,digest,enabled,reviewed,snapshot_contract_reviewed,max_step_kcal,max_step_fraction,min_days_between_acceptances,max_cumulative_delta_kcal,min_intake_kcal,max_intake_kcal,expires_at)
 VALUES(prefix||'-'||k,'fixture-engine-v1',encode(sha256(convert_to(prefix||'-'||k,'UTF8')),'hex'),k<>'disabled',k<>'unreviewed',k<>'contract',200,0.05,14,400,1500,4000,statement_timestamp()+CASE WHEN k='expired' THEN interval '-1 day' ELSE interval '1 day' END);
 END LOOP;
END $fixture$;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $fixture$
DECLARE prefix text:=current_setting('macrogoal.policy_test_prefix'); version text; dg text; result jsonb; k text;
BEGIN
 version:=prefix||'-good';dg:=encode(sha256(convert_to(version,'UTF8')),'hex');
 result:=public.tdee_read_snapshot_policy_v1(version,dg,'fixture-engine-v1');
 IF result IS NULL OR result->>'version' IS DISTINCT FROM version OR result->>'digest' IS DISTINCT FROM dg OR
 result->>'engine_version' IS DISTINCT FROM 'fixture-engine-v1' OR result->'enabled' IS DISTINCT FROM 'true'::jsonb OR
 result->'reviewed' IS DISTINCT FROM 'true'::jsonb OR result->'snapshot_contract_reviewed' IS DISTINCT FROM 'true'::jsonb OR
 (SELECT count(*) FROM jsonb_object_keys(result))<>13 THEN RAISE EXCEPTION 'successful exact lookup mismatch'; END IF;
 IF public.tdee_read_snapshot_policy_v1(version,repeat('a',64),'fixture-engine-v1') IS NOT NULL OR
 public.tdee_read_snapshot_policy_v1(version,dg,'wrong-engine') IS NOT NULL OR
 public.tdee_read_snapshot_policy_v1(version||'-wrong',dg,'fixture-engine-v1') IS NOT NULL THEN
 RAISE EXCEPTION 'exact binding mismatch not null'; END IF;
 FOREACH k IN ARRAY ARRAY['disabled','unreviewed','contract','expired'] LOOP
 version:=prefix||'-'||k;dg:=encode(sha256(convert_to(version,'UTF8')),'hex');
 IF public.tdee_read_snapshot_policy_v1(version,dg,'fixture-engine-v1') IS NOT NULL THEN
 RAISE EXCEPTION 'policy gate failure %',k; END IF;
 END LOOP;
END $fixture$;
RESET ROLE;

ROLLBACK;
