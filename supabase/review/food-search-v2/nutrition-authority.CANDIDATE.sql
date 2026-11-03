-- CANDIDATE ONLY. Requires security review and action-specific activation approval.
-- Coordinate with vision-nutrition-extract and retain exact live recovery rollback.
BEGIN;
CREATE TABLE macrogoal_food_private.nutrition_current(food_id uuid PRIMARY KEY,revision integer NOT NULL,confirmed boolean NOT NULL,snapshot jsonb NOT NULL);
CREATE TABLE macrogoal_food_private.nutrition_changes(food_id uuid NOT NULL,revision integer NOT NULL,before_snapshot jsonb,after_snapshot jsonb NOT NULL,confirmed boolean NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(food_id,revision));
ALTER TABLE macrogoal_food_private.nutrition_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_current FORCE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_changes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.nutrition_current,macrogoal_food_private.nutrition_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON macrogoal_food_private.nutrition_current TO service_role;
GRANT SELECT,INSERT ON macrogoal_food_private.nutrition_changes TO service_role;
CREATE FUNCTION macrogoal_food_private.nutrition_snapshot_v1(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(p)
 WHERE key=ANY(ARRAY['name','brand','product_name','generic_name','brands','verified','ai_verified','ai_verified_source','confidence','last_verified_at','barcode','usda_fdc_id','source_id','source','calories','protein','carbs','fat','fiber','sugar','sodium','saturated_fat','trans_fat','polyunsaturated_fat','monounsaturated_fat','cholesterol','added_sugars','sugar_alcohols','soluble_fiber','insoluble_fiber','starch','biotin','choline','calcium','iron','potassium','phosphorus','magnesium','zinc','selenium','copper','manganese','chromium','molybdenum','iodine','chloride','nutriments','macros_per','serving_size','serving_quantity','serving_unit','serving_count','serving_description']) OR key LIKE 'vitamin_%' OR key ~ '(_g|_mg|_mcg)$';
$fn$;
REVOKE ALL ON FUNCTION macrogoal_food_private.nutrition_snapshot_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION macrogoal_food_private.nutrition_snapshot_v1(jsonb) TO service_role;
CREATE FUNCTION macrogoal_food_private.guard_food_nutrition_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE before_value jsonb; after_value jsonb; state macrogoal_food_private.nutrition_current%ROWTYPE; explicit_correction boolean; next_revision integer;
BEGIN
 after_value:=macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(NEW));
 IF TG_OP='UPDATE' THEN before_value:=macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(OLD)); END IF;
 explicit_correction:=current_setting('role',true)='service_role' AND current_setting('macrogoal.correction_context',true)='confirmed_v1';
 SELECT * INTO state FROM macrogoal_food_private.nutrition_current WHERE food_id=NEW.id FOR UPDATE;
 IF TG_OP='UPDATE' AND before_value IS NOT DISTINCT FROM after_value THEN RETURN NEW; END IF;
 IF (coalesce(state.confirmed,false) OR (TG_OP='UPDATE' AND (coalesce(OLD.verified,false) OR coalesce(OLD.ai_verified,false) OR coalesce(OLD.ai_verified_source,'') LIKE 'barcode_recovery:%'))) AND NOT coalesce(explicit_correction,false)
 THEN RAISE EXCEPTION 'confirmed_nutrition_protected' USING ERRCODE='40001'; END IF;
 next_revision:=coalesce(state.revision,0)+1;
 INSERT INTO macrogoal_food_private.nutrition_changes VALUES(NEW.id,next_revision,before_value,after_value,coalesce(explicit_correction,false),now());
 INSERT INTO macrogoal_food_private.nutrition_current VALUES(NEW.id,next_revision,coalesce(state.confirmed,false) OR coalesce(explicit_correction,false),after_value)
 ON CONFLICT(food_id) DO UPDATE SET revision=excluded.revision,confirmed=excluded.confirmed,snapshot=excluded.snapshot;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION macrogoal_food_private.guard_food_nutrition_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_food_nutrition_v1 BEFORE INSERT OR UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION macrogoal_food_private.guard_food_nutrition_v1();
CREATE FUNCTION public.apply_verified_food_correction_v1(p_id uuid,p_expected_updated_at timestamptz,p_values jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE item public.food_items%ROWTYPE; replacement public.food_items%ROWTYPE; saved public.food_items%ROWTYPE; patch jsonb; k text; assignments text; old_context text:=current_setting('macrogoal.correction_context',true);
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(jsonb_typeof(p_values)='object' AND length(p_values->>'name') BETWEEN 1 AND 160 AND jsonb_typeof(p_values->'serving_size')='number' AND (p_values->>'serving_size')::numeric>0 AND p_values->>'macros_per'='serving',false) THEN RAISE EXCEPTION 'invalid correction' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['calories','protein','carbs','fat'] LOOP
  IF NOT coalesce(jsonb_typeof(p_values->k)='number' AND (p_values->>k)::numeric>=0,false) THEN RAISE EXCEPTION 'invalid nutrient' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_values->'fiber' IS NOT NULL AND p_values->'fiber'<>'null'::jsonb AND NOT coalesce(jsonb_typeof(p_values->'fiber')='number' AND (p_values->>'fiber')::numeric>=0,false) THEN RAISE EXCEPTION 'invalid fiber' USING ERRCODE='22023'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO item FROM public.food_items WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'catalog_changed' USING ERRCODE='40001'; END IF;
  IF item.barcode IS DISTINCT FROM p_values->>'barcode' THEN RAISE EXCEPTION 'identity conflict' USING ERRCODE='40001'; END IF;
 END IF;
 PERFORM set_config('macrogoal.correction_context','confirmed_v1',true);
 IF p_id IS NULL THEN
  INSERT INTO public.food_items(name,brand,barcode,calories,protein,carbs,fat,fiber,serving_size,serving_quantity,serving_unit,macros_per,source,verified,ai_verified,confidence)
  VALUES(p_values->>'name',p_values->>'brand',p_values->>'barcode',(p_values->>'calories')::numeric,(p_values->>'protein')::numeric,(p_values->>'carbs')::numeric,(p_values->>'fat')::numeric,(p_values->>'fiber')::numeric,(p_values->>'serving_size')::numeric,p_values->>'serving_quantity','g','serving','user',true,true,'high') RETURNING * INTO saved;
 ELSE
  -- Reset all older nutrition/basis evidence before applying this complete label.
  SELECT jsonb_object_agg(key,'null'::jsonb) INTO patch FROM jsonb_each(macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(item)));
  patch:=to_jsonb(item)||patch||jsonb_build_object('name',p_values->>'name','brand',p_values->>'brand','barcode',item.barcode,'calories',p_values->'calories','protein',p_values->'protein','carbs',p_values->'carbs','fat',p_values->'fat','fiber',p_values->'fiber','serving_size',p_values->'serving_size','serving_quantity',p_values->>'serving_quantity','serving_unit','g','macros_per','serving','source','user','verified',true,'ai_verified',true,'confidence','high','nutriments','{}'::jsonb,'off_data',null,'product_name',p_values->>'name','generic_name',null,'brands',p_values->>'brand','ingredients_text',null,'allergens',null,'nutriscore_grade',null,'image_url',null,'ai_verified_source','two_read_correction_v1','last_verified_at',now(),'updated_at',now());
  replacement:=jsonb_populate_record(NULL::public.food_items,patch);
  SELECT string_agg(format('%I=($1).%I',key,key),',') INTO assignments FROM jsonb_each(patch) WHERE key IN (SELECT key FROM jsonb_each(macrogoal_food_private.nutrition_snapshot_v1(patch))) OR key=ANY(ARRAY['verified','ai_verified','confidence','off_data','ingredients_text','allergens','nutriscore_grade','image_url','updated_at']);
  EXECUTE 'UPDATE public.food_items SET '||assignments||' WHERE id=$2 RETURNING *' INTO saved USING replacement,p_id;
 END IF;
 PERFORM set_config('macrogoal.correction_context',coalesce(old_context,''),true);
 RETURN to_jsonb(saved);
END;
$fn$;
REVOKE ALL ON FUNCTION public.apply_verified_food_correction_v1(uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_food_correction_v1(uuid,timestamptz,jsonb) TO service_role;
-- Preserve the actual deployed recovery validation, idempotency and micronutrient reset.
DO $patch$
DECLARE original text; changed text;
BEGIN
 original:=pg_get_functiondef('public.confirm_barcode_recovery(uuid,uuid,jsonb)'::regprocedure);
 IF md5(original)<>'945fc10d72f144171132e0a56e8b3e43' THEN RAISE EXCEPTION 'recovery baseline drift'; END IF;
 changed:=replace(original,'declare s public.food_submissions;','declare old_context text:=current_setting(''macrogoal.correction_context'',true); s public.food_submissions;');
 changed:=replace(changed,'  if item.id is null then','  perform set_config(''macrogoal.correction_context'',''confirmed_v1'',true);'||chr(10)||'  if item.id is null then');
 changed:=replace(changed,'  return to_jsonb(saved);','  perform set_config(''macrogoal.correction_context'',coalesce(old_context,''''),true);'||chr(10)||'  return to_jsonb(saved);');
 IF changed=original THEN RAISE EXCEPTION 'patch not applied'; END IF;
 EXECUTE changed;
END;
$patch$;
COMMIT;
-- Rollback order: restore prior Edge and exact recovery function, then remove trigger.
-- Do not drop history. Requires coordinated activation; never apply this file alone.
