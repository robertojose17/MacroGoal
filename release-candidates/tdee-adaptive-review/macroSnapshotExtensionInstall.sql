-- PRODUCTION INSTALL CANDIDATE. Not executed. Real migration, NOT a dry run.
-- Requires independent review and supported migration-tool authorization.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $candidate$
DECLARE before_body text; after_body text; before_acl aclitem[]; after_acl aclitem[]; verified_body text; before_owner oid; after_owner oid;
 old_projection text := 'SELECT i.id,i.meal_id,i.calories,i.is_scheduled';
 new_projection text := 'SELECT i.id,i.meal_id,i.calories,i.is_scheduled,i.protein,i.carbs,i.fats,i.fiber';
 old_marker text := '''trackers'',a.trackers,''trackerWeights'',a.entries,''checkIns'',a.checkins,''meals'',a.meals,''items'',a.items)';
 new_marker text := '''nutritionFieldsVersion'',''logged-macros-v1'',''trackers'',a.trackers,''trackerWeights'',a.entries,''checkIns'',a.checkins,''meals'',a.meals,''items'',a.items)';
BEGIN
 SELECT pg_get_functiondef(p.oid),p.proacl,p.proowner INTO before_body,before_acl,before_owner
 FROM pg_proc p WHERE p.oid='public.observed_get_tdee_snapshot_v1()'::regprocedure
 AND p.prosecdef=false AND p.provolatile='s'
 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp'];
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_missing_or_properties_changed'; END IF;
 IF before_acl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 THEN RAISE EXCEPTION 'snapshot_acl_changed'; END IF;
 IF before_body IS NULL OR md5(before_body)<>'a8e6453f42dfcf4bbccb9640534c5130'
 THEN RAISE EXCEPTION 'snapshot_definition_changed'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
 AND table_name='meal_items' AND column_name IN ('protein','carbs','fats','fiber')
 AND data_type='numeric')<>4 THEN RAISE EXCEPTION 'macro_schema_changed'; END IF;
 IF (length(before_body)-length(replace(before_body,old_projection,'')))/length(old_projection)<>1
 OR (length(before_body)-length(replace(before_body,old_marker,'')))/length(old_marker)<>1
 THEN RAISE EXCEPTION 'projection_anchor_not_unique'; END IF;
 after_body:=replace(replace(before_body,old_projection,new_projection),old_marker,new_marker);
 -- Inverse equality proves no unrelated source change in this patch.
 IF replace(replace(after_body,new_projection,old_projection),new_marker,old_marker)<>before_body
 THEN RAISE EXCEPTION 'unrelated_change'; END IF;
 EXECUTE after_body;
 SELECT p.proacl,p.proowner,pg_get_functiondef(p.oid) INTO after_acl,after_owner,verified_body FROM pg_proc p
 WHERE p.oid='public.observed_get_tdee_snapshot_v1()'::regprocedure
 AND p.prosecdef=false AND p.provolatile='s'
 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp'];
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_missing_or_properties_changed_after'; END IF;
 IF verified_body IS DISTINCT FROM after_body OR after_owner IS DISTINCT FROM before_owner
 THEN RAISE EXCEPTION 'snapshot_body_or_owner_changed'; END IF;
 IF after_acl IS DISTINCT FROM before_acl THEN RAISE EXCEPTION 'acl_or_security_changed'; END IF;
END $candidate$;
SELECT md5(pg_get_functiondef('public.observed_get_tdee_snapshot_v1()'::regprocedure)) AS candidate_body_md5;
COMMIT;
-- This projection-only migration does not deploy the macro consumer or activate TDEE.
-- Authenticated integration and recommendation validation remain separate release gates.
