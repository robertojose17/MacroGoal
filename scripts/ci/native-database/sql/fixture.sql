CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE SCHEMA macrogoal_food_private;GRANT USAGE ON SCHEMA macrogoal_food_private TO service_role;
CREATE TABLE public.food_items("id" uuid DEFAULT gen_random_uuid() NOT NULL,"barcode" text,"name" text NOT NULL,"brand" text,"calories" numeric DEFAULT 0,"protein" numeric DEFAULT 0,"carbs" numeric DEFAULT 0,"fat" numeric DEFAULT 0,"fiber" numeric DEFAULT 0,"sugar" numeric DEFAULT 0,"sodium" numeric,"serving_size" numeric DEFAULT 100,"serving_unit" text,"image_url" text,"source" text DEFAULT 'openfoodfacts'::text NOT NULL,"off_data" jsonb,"popularity_score" numeric DEFAULT 0 NOT NULL,"created_at" timestamptz DEFAULT now() NOT NULL,"updated_at" timestamptz DEFAULT now() NOT NULL,"product_name" text DEFAULT ''::text,"generic_name" text,"brands" text,"serving_quantity" text,"nutriments" jsonb DEFAULT '{}'::jsonb NOT NULL,"search_count" int4 DEFAULT 0 NOT NULL,"last_searched_at" timestamptz,"search_vector" tsvector,"saturated_fat" numeric,"trans_fat" numeric,"polyunsaturated_fat" numeric,"monounsaturated_fat" numeric,"cholesterol" numeric,"added_sugars" numeric,"sugar_alcohols" numeric,"soluble_fiber" numeric,"insoluble_fiber" numeric,"starch" numeric,"vitamin_a" numeric,"vitamin_c" numeric,"vitamin_d" numeric,"vitamin_e" numeric,"vitamin_k" numeric,"vitamin_b1" numeric,"vitamin_b2" numeric,"vitamin_b3" numeric,"vitamin_b5" numeric,"vitamin_b6" numeric,"vitamin_b9" numeric,"vitamin_b12" numeric,"biotin" numeric,"choline" numeric,"calcium" numeric,"iron" numeric,"potassium" numeric,"phosphorus" numeric,"magnesium" numeric,"zinc" numeric,"selenium" numeric,"copper" numeric,"manganese" numeric,"chromium" numeric,"molybdenum" numeric,"iodine" numeric,"chloride" numeric,"confidence" text DEFAULT 'high'::text,"verified" bool DEFAULT false,"nutriscore_grade" text,"logs_last_30d" int4 DEFAULT 0 NOT NULL,"logs_last_90d" int4 DEFAULT 0 NOT NULL,"logs_total" int4 DEFAULT 0 NOT NULL,"serving_description" text,"serving_count" numeric,"source_id" text,"macros_per" text DEFAULT 'serving'::text,"saturated_fat_g" numeric,"polyunsaturated_fat_g" numeric,"monounsaturated_fat_g" numeric,"trans_fat_g" numeric,"cholesterol_mg" numeric,"sugar_g" numeric,"added_sugar_g" numeric,"soluble_fiber_g" numeric,"insoluble_fiber_g" numeric,"water_g" numeric,"alcohol_g" numeric,"vitamin_a_mcg" numeric,"vitamin_c_mg" numeric,"vitamin_d_mcg" numeric,"vitamin_e_mg" numeric,"vitamin_k_mcg" numeric,"vitamin_b1_mg" numeric,"vitamin_b2_mg" numeric,"vitamin_b3_mg" numeric,"vitamin_b6_mg" numeric,"vitamin_b12_mcg" numeric,"folate_mcg" numeric,"biotin_mcg" numeric,"pantothenic_acid_mg" numeric,"choline_mg" numeric,"calcium_mg" numeric,"iron_mg" numeric,"magnesium_mg" numeric,"phosphorus_mg" numeric,"potassium_mg" numeric,"sodium_mg" numeric,"zinc_mg" numeric,"copper_mg" numeric,"manganese_mg" numeric,"selenium_mcg" numeric,"chromium_mcg" numeric,"iodine_mcg" numeric,"usda_fdc_id" text,"data_quality_score" int4 DEFAULT 0,"last_verified_at" timestamptz,"ingredients_text" text,"allergens" text[],"total_logs" int4 DEFAULT 0,"last_logged_at" timestamptz,"ai_verified" bool DEFAULT false,"ai_verified_at" timestamptz,"ai_verified_source" text,PRIMARY KEY(id));ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;ALTER TABLE public.food_items FORCE ROW LEVEL SECURITY;
CREATE TABLE macrogoal_food_private.nutrition_current("food_id" uuid NOT NULL,"revision" int4 NOT NULL,"confirmed" bool NOT NULL,"snapshot" jsonb NOT NULL,PRIMARY KEY(food_id));ALTER TABLE macrogoal_food_private.nutrition_current ENABLE ROW LEVEL SECURITY;ALTER TABLE macrogoal_food_private.nutrition_current FORCE ROW LEVEL SECURITY;
CREATE TABLE macrogoal_food_private.nutrition_changes("food_id" uuid NOT NULL,"revision" int4 NOT NULL,"before_snapshot" jsonb,"after_snapshot" jsonb NOT NULL,"confirmed" bool NOT NULL,"received_at" timestamptz DEFAULT now() NOT NULL,PRIMARY KEY(food_id,revision));ALTER TABLE macrogoal_food_private.nutrition_changes ENABLE ROW LEVEL SECURITY;ALTER TABLE macrogoal_food_private.nutrition_changes FORCE ROW LEVEL SECURITY;
CREATE TABLE macrogoal_food_private.nutrition_evidence("food_id" uuid NOT NULL,"revision" int4 NOT NULL,"payload" jsonb NOT NULL,"received_at" timestamptz DEFAULT now() NOT NULL,PRIMARY KEY(food_id,revision));ALTER TABLE macrogoal_food_private.nutrition_evidence ENABLE ROW LEVEL SECURITY;ALTER TABLE macrogoal_food_private.nutrition_evidence FORCE ROW LEVEL SECURITY;
CREATE TABLE macrogoal_food_private.nutrition_write_context("backend_pid" int4 NOT NULL,"transaction_id" int8 NOT NULL,"token" uuid NOT NULL,"purpose" text NOT NULL,"food_id" uuid,"barcode" text,PRIMARY KEY(backend_pid,transaction_id));ALTER TABLE macrogoal_food_private.nutrition_write_context ENABLE ROW LEVEL SECURITY;ALTER TABLE macrogoal_food_private.nutrition_write_context FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION macrogoal_food_private.guard_food_nutrition_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE backend boolean:=coalesce(current_setting('role',true)='service_role' OR (session_user='postgres' AND current_setting('role',true) IN ('none','postgres')),false); explicit_correction boolean; locked boolean; old_value jsonb; new_value jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'catalog_delete_requires_separate_migration' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'food_identity_immutable' USING ERRCODE='22023'; END IF;
 -- Public flags are not an authorization mechanism. Clients cannot manufacture them.
 IF NOT backend THEN
  IF TG_OP='INSERT' THEN
   IF coalesce(NEW.verified,false) OR coalesce(NEW.ai_verified,false) OR NEW.ai_verified_source IS NOT NULL OR NEW.ai_verified_at IS NOT NULL OR NEW.last_verified_at IS NOT NULL THEN RAISE EXCEPTION 'verification_metadata_server_only' USING ERRCODE='42501'; END IF;
  ELSIF ROW(NEW.verified,NEW.ai_verified,NEW.ai_verified_source,NEW.ai_verified_at,NEW.last_verified_at) IS DISTINCT FROM ROW(OLD.verified,OLD.ai_verified,OLD.ai_verified_source,OLD.ai_verified_at,OLD.last_verified_at) THEN RAISE EXCEPTION 'verification_metadata_server_only' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='INSERT' THEN RETURN NEW; END IF;
 old_value:=macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(OLD));new_value:=macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(NEW));
 IF old_value IS NOT DISTINCT FROM new_value THEN RETURN NEW; END IF;
 explicit_correction:=backend AND EXISTS(SELECT 1 FROM macrogoal_food_private.nutrition_write_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.purpose='confirmed_v1' AND (c.food_id=OLD.id OR (c.food_id IS NULL AND c.barcode=OLD.barcode)));
 SELECT confirmed INTO locked FROM macrogoal_food_private.nutrition_current WHERE food_id=OLD.id;
 -- Existing verification markers are retained conservatively, not used to create private authority.
 IF (coalesce(locked,false) OR coalesce(OLD.verified,false) OR coalesce(OLD.ai_verified,false) OR coalesce(OLD.ai_verified_source,'') LIKE 'barcode_recovery:%') AND NOT coalesce(explicit_correction,false) THEN
  -- Only the approved importer skips protected winners; corrections must not report false success.
  IF backend AND EXISTS(SELECT 1 FROM macrogoal_food_private.nutrition_write_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.purpose='usda_import_v1') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'confirmed_nutrition_protected' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION macrogoal_food_private.nutrition_snapshot_v1(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(p)
 WHERE key=ANY(ARRAY['name','brand','product_name','generic_name','brands','verified','ai_verified','ai_verified_source','confidence','last_verified_at','ai_verified_at','data_quality_score','off_data','ingredients_text','allergens','nutriscore_grade','image_url','barcode','usda_fdc_id','source_id','source','calories','protein','carbs','fat','fiber','sugar','sodium','saturated_fat','trans_fat','polyunsaturated_fat','monounsaturated_fat','cholesterol','added_sugars','sugar_alcohols','soluble_fiber','insoluble_fiber','starch','biotin','choline','calcium','iron','potassium','phosphorus','magnesium','zinc','selenium','copper','manganese','chromium','molybdenum','iodine','chloride','nutriments','macros_per','serving_size','serving_quantity','serving_unit','serving_count','serving_description']) OR key LIKE 'vitamin_%' OR key ~ '(_g|_mg|_mcg)$';
$function$
;
CREATE OR REPLACE FUNCTION macrogoal_food_private.audit_food_nutrition_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE before_value jsonb; after_value jsonb; state macrogoal_food_private.nutrition_current%ROWTYPE; explicit_correction boolean; next_revision integer;
BEGIN
 after_value:=macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(NEW));
 IF TG_OP='UPDATE' THEN before_value:=macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(OLD)); END IF;
 IF TG_OP='UPDATE' AND before_value IS NOT DISTINCT FROM after_value THEN RETURN NEW; END IF;
 explicit_correction:=current_setting('role',true)='service_role' AND EXISTS(SELECT 1 FROM macrogoal_food_private.nutrition_write_context c WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.purpose='confirmed_v1' AND (c.food_id=NEW.id OR (c.food_id IS NULL AND c.barcode=NEW.barcode)));
 SELECT * INTO state FROM macrogoal_food_private.nutrition_current WHERE food_id=NEW.id FOR UPDATE;
 next_revision:=coalesce(state.revision,0)+1;
 INSERT INTO macrogoal_food_private.nutrition_changes VALUES(NEW.id,next_revision,before_value,after_value,coalesce(explicit_correction,false),now());
 INSERT INTO macrogoal_food_private.nutrition_current VALUES(NEW.id,next_revision,coalesce(state.confirmed,false) OR coalesce(explicit_correction,false),after_value)
 ON CONFLICT(food_id) DO UPDATE SET revision=excluded.revision,confirmed=excluded.confirmed,snapshot=excluded.snapshot;
 RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.record_food_nutrition_evidence_v1(p_food_id uuid, p_expected_revision integer, p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE item public.food_items%ROWTYPE; previous macrogoal_food_private.nutrition_evidence%ROWTYPE; f record;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(jsonb_typeof(p_payload)='object' AND p_payload->>'version'='1'
  AND p_payload->>'provider' IN ('usda','openfoodfacts')
  AND length(p_payload->>'identity') BETWEEN 1 AND 20
  AND length(p_payload->>'description') BETWEEN 1 AND 160
  AND jsonb_typeof(p_payload->'facts')='object'
  AND octet_length(p_payload::text)<=65536,false)
 THEN RAISE EXCEPTION 'invalid evidence' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM jsonb_each(p_payload->'facts')) NOT BETWEEN 1 AND 512
 THEN RAISE EXCEPTION 'invalid facts' USING ERRCODE='22023'; END IF;
 FOR f IN SELECT * FROM jsonb_each(p_payload->'facts') LOOP
  IF NOT coalesce(length(f.key) BETWEEN 1 AND 100 AND jsonb_typeof(f.value)='object'
   AND jsonb_typeof(f.value->'value')='number' AND (f.value->>'value')::numeric>=0
   AND length(f.value->>'unit') BETWEEN 1 AND 24
   AND f.value->>'basis' IN ('100g','provider_100','serving'),false)
  THEN RAISE EXCEPTION 'invalid nutrient' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT * INTO item FROM public.food_items WHERE id=p_food_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'food unavailable' USING ERRCODE='22023'; END IF;
 IF p_payload->>'provider'='usda' THEN
  IF item.usda_fdc_id IS DISTINCT FROM p_payload->>'identity'
   OR lower(trim(item.name)) IS DISTINCT FROM lower(trim(p_payload->>'description'))
  THEN RAISE EXCEPTION 'identity conflict' USING ERRCODE='40001'; END IF;
 ELSE
  IF item.barcode IS DISTINCT FROM p_payload->>'identity'
   AND item.barcode IS DISTINCT FROM ('0'||(p_payload->>'identity'))
  THEN RAISE EXCEPTION 'identity conflict' USING ERRCODE='40001'; END IF;
 END IF;
 SELECT * INTO previous FROM macrogoal_food_private.nutrition_evidence WHERE food_id=p_food_id ORDER BY revision DESC LIMIT 1;
 IF previous.payload=p_payload THEN RETURN previous.revision; END IF;
 IF p_expected_revision IS NOT NULL AND coalesce(previous.revision,0) IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
 INSERT INTO macrogoal_food_private.nutrition_evidence(food_id,revision,payload)
 VALUES(p_food_id,coalesce(previous.revision,0)+1,p_payload);
 RETURN coalesce(previous.revision,0)+1;
END;
$function$
;
CREATE TRIGGER audit_food_nutrition_v1 AFTER INSERT OR UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION macrogoal_food_private.audit_food_nutrition_v1();
CREATE TRIGGER guard_food_nutrition_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION macrogoal_food_private.guard_food_nutrition_v1();
GRANT SELECT,INSERT,UPDATE ON public.food_items TO service_role;GRANT SELECT,INSERT,UPDATE ON macrogoal_food_private.nutrition_current TO service_role;GRANT SELECT,INSERT ON macrogoal_food_private.nutrition_changes,macrogoal_food_private.nutrition_evidence,macrogoal_food_private.nutrition_write_context TO service_role;REVOKE ALL ON ALL FUNCTIONS IN SCHEMA macrogoal_food_private FROM PUBLIC,anon,authenticated;