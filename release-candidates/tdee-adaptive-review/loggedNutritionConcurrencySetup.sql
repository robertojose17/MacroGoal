-- PREPARED NOT RUN. Temporarily COMMITS ONE synthetic own-account item.
-- Supply test.fixture_owner within this transaction, never assume connection reuse.
-- First capture IDs with an independent read-only SELECT gen_random_uuid() AS
-- item_id, gen_random_uuid() AS request_a, gen_random_uuid() AS request_b;
-- supply those captured values as test.fixture_item/request_a/request_b. This
-- recovery seed must exist before INSERT, even if setup response is lost.
-- No parent insert, DDL, GRANT or authenticating a real JWT.
BEGIN;
SET LOCAL lock_timeout='250ms';
SET LOCAL statement_timeout='2s';
SET LOCAL transaction_timeout='3s';
DO $setup$
DECLARE actor uuid:=nullif(current_setting('test.fixture_owner',true),'')::uuid;
 mid uuid; iid uuid:=current_setting('test.fixture_item')::uuid;
 a uuid:=current_setting('test.fixture_request_a')::uuid; b uuid:=current_setting('test.fixture_request_b')::uuid;
 row_image jsonb; s jsonb; manifest jsonb;
BEGIN
 IF current_user<>'postgres' OR actor IS NULL THEN RAISE EXCEPTION 'approved_fixture_owner_required'; END IF;
 IF iid IS NULL OR a IS NULL OR b IS NULL OR a=b THEN RAISE EXCEPTION 'captured_recovery_seed_required'; END IF;
 IF has_function_privilege('authenticated','public.tdee_register_logged_nutrition_evidence_v1(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'phase_a_surface_not_closed'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.meal_items'::regclass AND NOT tgisinternal)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.meal_items'::regclass
  AND tgname='rotate_nutrition_revision_v1' AND tgenabled IN ('O','A') AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'trigger_catalog_requires_review'; END IF;
 SELECT id INTO mid FROM public.meals WHERE user_id=actor ORDER BY id LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'existing_own_meal_required'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','is_anonymous',false)::text,true);
 INSERT INTO public.meal_items AS i(id,meal_id,food_id,food_item_id,food_name,food_brand,
  calories,protein,carbs,fats,fiber,grams,quantity,serving_description,serving_unit,is_scheduled)
 VALUES(iid,mid,NULL,NULL,'Synthetic temporary concurrency fixture',NULL,
  0,0,0,0,0,1,1,'Synthetic portion','g',false)
 RETURNING to_jsonb(i) INTO row_image;
 s:=public.tdee_read_logged_nutrition_evidence_v1(iid,NULL);
 IF row_image->>'nutrition_revision' IS NULL OR s->'expected' IS NULL
 OR s->'evidenceVersion' IS DISTINCT FROM '0'::jsonb
 THEN RAISE EXCEPTION 'fixture_initial_state_invalid'; END IF;
 manifest:=jsonb_build_object('version','nutrition-concurrency-fixture-v1',
  'ownerId',actor,'itemId',iid,'mealId',mid,'revision',row_image->'nutrition_revision',
  'expected',s->'expected','requestIds',jsonb_build_array(a,b),'itemSnapshot',row_image);
 PERFORM set_config('test.fixture_manifest_output',manifest::text,true);
END $setup$;
SELECT current_setting('test.fixture_manifest_output')::jsonb AS private_fixture_manifest;
COMMIT;
-- Independently verify the captured itemSnapshot, own parent, revision and zero
-- evidence before launching sessions. Output preceding COMMIT is not proof.
-- If manifest output is lost, STOP and inspect ONLY the pre-captured item UUID
-- and own parent; no blind rerun or name-based cleanup. Reconstructing the full
-- snapshot requires coordinator review before cleanup; it is not auto-authorized.
