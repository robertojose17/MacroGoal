-- CANDIDATE ONLY: not installed or executed.
-- Prerequisite for future per-item evidence; does not create/authorize evidence.
-- Migration DDL takes a table lock; use bounded lock timeout and approved rollout.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $guard$
BEGIN
 IF to_regclass('public.meal_items') IS NULL OR
    to_regnamespace('macrogoal_readiness_private') IS NULL OR
    to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
 THEN RAISE EXCEPTION 'nutrition_revision_prerequisite_missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.meal_items'::regclass AND attname='nutrition_revision' AND NOT attisdropped)
 OR to_regprocedure('macrogoal_readiness_private.rotate_nutrition_revision_v1()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.meal_items'::regclass AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'nutrition_revision_requires_fresh_review'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='meal_items'
 AND column_name IN ('calories','protein','carbs','fats','fiber','grams','quantity','serving_description','serving_unit','food_id','food_item_id','food_name','food_brand','meal_id','is_scheduled','logged_at'))<>16
 THEN RAISE EXCEPTION 'nutrition_revision_schema_changed'; END IF;
END $guard$;
ALTER TABLE public.meal_items ADD COLUMN nutrition_revision uuid;
CREATE FUNCTION macrogoal_readiness_private.rotate_nutrition_revision_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $body$
BEGIN
 NEW.nutrition_revision := pg_catalog.gen_random_uuid();
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION macrogoal_readiness_private.rotate_nutrition_revision_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER rotate_nutrition_revision_v1
BEFORE INSERT OR UPDATE OF calories,protein,carbs,fats,fiber,grams,quantity,
 serving_description,serving_unit,food_id,food_item_id,food_name,food_brand,
 meal_id,is_scheduled,logged_at,nutrition_revision
ON public.meal_items FOR EACH ROW
EXECUTE FUNCTION macrogoal_readiness_private.rotate_nutrition_revision_v1();
COMMIT;
-- No rows are backfilled. Legacy rows remain NULL until a relevant new write.
-- No changes to log_food signature/body/grants, table grants or RLS.
-- Runtime trigger does not query tables or acquire explicit/advisory global locks.
-- Runtime errors can still abort the initiating statement; never claim zero risk.
