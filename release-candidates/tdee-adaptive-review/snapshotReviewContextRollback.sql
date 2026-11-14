-- REVIEW ONLY. Compose as ONE statement batch:
-- 1 registryCandidate.sql (snapshotRegistryCandidate.sql), removing its final COMMIT;
-- 2 snapshotReviewContextCandidate.sql, removing its BEGIN and final COMMIT;
-- 3 this tail. The installed readiness API is reused, not replaced.
-- No grants or policy seeds. Set macrogoal.qa_owner privately only if authorized
-- runtime own-account invocation is desired. Claims simulation is NOT UI/JWT QA.
DO $review$
DECLARE f record; result jsonb; a uuid:=nullif(current_setting('macrogoal.qa_owner',true),'')::uuid;
BEGIN
 SELECT p.provolatile,p.prosecdef,p.proacl INTO f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='macrogoal_snapshot_review_private' AND p.proname='read_review_context' AND p.pronargs=0;
 IF NOT FOUND OR f.provolatile<>'s' OR f.prosecdef IS DISTINCT FROM true THEN RAISE EXCEPTION 'context_function_contract'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) role_name
 WHERE has_function_privilege(role_name,'macrogoal_snapshot_review_private.read_review_context()','EXECUTE')) THEN
 RAISE EXCEPTION 'context_function_exposed'; END IF;
 IF EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.policies) OR
 EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.anchors) OR
 EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.receipts) THEN RAISE EXCEPTION 'unexpected_seed'; END IF;
 IF a IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=a) THEN RAISE EXCEPTION 'qa_owner_missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 result:=macrogoal_snapshot_review_private.read_review_context();
 IF result->>'version' IS DISTINCT FROM 'snapshot-review-context-v1' OR result->>'actor' IS DISTINCT FROM a::text OR
 result->'actionable' IS DISTINCT FROM 'false'::jsonb OR result->>'evidenceStatus' IS DISTINCT FROM 'unverified' OR
 result->'anchor' IS DISTINCT FROM 'null'::jsonb OR result->'policy' IS DISTINCT FROM 'null'::jsonb OR
 result#>'{receiptChain,totalCount}' IS DISTINCT FROM '0'::jsonb OR
 result#>'{receiptChain,rows}' IS DISTINCT FROM '[]'::jsonb OR
 result->>'readinessFingerprint' IS DISTINCT FROM
 encode(sha256(convert_to((result->'readiness'-'capturedAt')::text,'UTF8')),'hex') THEN
 RAISE EXCEPTION 'coherent_empty_registry_contract'; END IF;
 RAISE NOTICE 'Own actor context query executed; no policy/anchor/receipt invented';
 ELSE RAISE NOTICE 'SKIP runtime query; PLpgSQL compilation alone does not validate deferred query execution'; END IF;
END $review$;
ROLLBACK;
-- Post-run separate read-only check: to_regnamespace('macrogoal_snapshot_review_private')
-- must remain NULL if absent before; verify readiness function hashes unchanged.
