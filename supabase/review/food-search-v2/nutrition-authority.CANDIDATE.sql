-- CANDIDATE ONLY. Requires security review and action-specific activation approval.
-- Coordinate with vision-nutrition-extract and retain exact live recovery rollback.
BEGIN;
CREATE TABLE macrogoal_food_private.nutrition_current(food_id uuid PRIMARY KEY REFERENCES public.food_items(id) ON DELETE RESTRICT,revision integer NOT NULL,confirmed boolean NOT NULL,snapshot jsonb NOT NULL);
CREATE TABLE macrogoal_food_private.nutrition_changes(food_id uuid NOT NULL REFERENCES public.food_items(id) ON DELETE RESTRICT,revision integer NOT NULL,before_snapshot jsonb,after_snapshot jsonb NOT NULL,confirmed boolean NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(food_id,revision));
ALTER TABLE macrogoal_food_private.nutrition_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_current FORCE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_changes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.nutrition_current,macrogoal_food_private.nutrition_changes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON macrogoal_food_private.nutrition_current TO service_role;
GRANT SELECT,INSERT ON macrogoal_food_private.nutrition_changes TO service_role;
CREATE FUNCTION macrogoal_food_private.nutrition_snapshot_v1(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(p)
 WHERE key=ANY(ARRAY['name','brand','product_name','generic_name','brands','verified','ai_verified','ai_verified_source','confidence','last_verified_at','ai_verified_at','data_quality_score','off_data','ingredients_text','allergens','nutriscore_grade','image_url','barcode','usda_fdc_id','source_id','source','calories','protein','carbs','fat','fiber','sugar','sodium','saturated_fat','trans_fat','polyunsaturated_fat','monounsaturated_fat','cholesterol','added_sugars','sugar_alcohols','soluble_fiber','insoluble_fiber','starch','biotin','choline','calcium','iron','potassium','phosphorus','magnesium','zinc','selenium','copper','manganese','chromium','molybdenum','iodine','chloride','nutriments','macros_per','serving_size','serving_quantity','serving_unit','serving_count','serving_description']) OR key LIKE 'vitamin_%' OR key ~ '(_g|_mg|_mcg)$';
$fn$;
REVOKE ALL ON FUNCTION macrogoal_food_private.nutrition_snapshot_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION macrogoal_food_private.nutrition_snapshot_v1(jsonb) TO service_role;
-- Importer access must be narrowed by the separately approved ACL candidate first.
DO $access$
BEGIN
 IF has_function_privilege('anon','public.import_usda_page(text,integer)','EXECUTE') OR has_function_privilege('authenticated','public.import_usda_page(text,integer)','EXECUTE') THEN RAISE EXCEPTION 'close_importer_access_first'; END IF;
END;
$access$;
CREATE FUNCTION macrogoal_food_private.guard_food_nutrition_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
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
 explicit_correction:=backend AND current_setting('macrogoal.correction_context',true)='confirmed_v1';
 SELECT confirmed INTO locked FROM macrogoal_food_private.nutrition_current WHERE food_id=OLD.id;
 -- Existing verification markers are retained conservatively, not used to create private authority.
 IF (coalesce(locked,false) OR coalesce(OLD.verified,false) OR coalesce(OLD.ai_verified,false) OR coalesce(OLD.ai_verified_source,'') LIKE 'barcode_recovery:%') AND NOT coalesce(explicit_correction,false) THEN
  -- Preserve the winner without aborting import pages that use ON CONFLICT DO UPDATE.
  RETURN OLD;
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION macrogoal_food_private.guard_food_nutrition_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_food_nutrition_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.food_items FOR EACH ROW EXECUTE FUNCTION macrogoal_food_private.guard_food_nutrition_v1();
CREATE FUNCTION macrogoal_food_private.audit_food_nutrition_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE before_value jsonb; after_value jsonb; state macrogoal_food_private.nutrition_current%ROWTYPE; explicit_correction boolean; next_revision integer;
BEGIN
 after_value:=macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(NEW));
 IF TG_OP='UPDATE' THEN before_value:=macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(OLD)); END IF;
 IF TG_OP='UPDATE' AND before_value IS NOT DISTINCT FROM after_value THEN RETURN NEW; END IF;
 explicit_correction:=current_setting('role',true)='service_role' AND current_setting('macrogoal.correction_context',true)='confirmed_v1';
 SELECT * INTO state FROM macrogoal_food_private.nutrition_current WHERE food_id=NEW.id FOR UPDATE;
 next_revision:=coalesce(state.revision,0)+1;
 INSERT INTO macrogoal_food_private.nutrition_changes VALUES(NEW.id,next_revision,before_value,after_value,coalesce(explicit_correction,false),now());
 INSERT INTO macrogoal_food_private.nutrition_current VALUES(NEW.id,next_revision,coalesce(state.confirmed,false) OR coalesce(explicit_correction,false),after_value)
 ON CONFLICT(food_id) DO UPDATE SET revision=excluded.revision,confirmed=excluded.confirmed,snapshot=excluded.snapshot;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION macrogoal_food_private.audit_food_nutrition_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_food_nutrition_v1 AFTER INSERT OR UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION macrogoal_food_private.audit_food_nutrition_v1();
CREATE FUNCTION public.read_food_correction_targets_v1(p_id uuid,p_barcodes text[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL AND (coalesce(cardinality(p_barcodes),0) NOT BETWEEN 1 AND 4 OR EXISTS(SELECT 1 FROM unnest(p_barcodes) x WHERE x IS NULL OR x !~ '^[0-9]{8,14}$')) THEN RAISE EXCEPTION 'invalid identity' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(entry),'[]'::jsonb) INTO result FROM (
  SELECT to_jsonb(i)||jsonb_build_object('_nutrition_revision',coalesce(c.revision,0)) AS entry
  FROM public.food_items i LEFT JOIN macrogoal_food_private.nutrition_current c ON c.food_id=i.id
  WHERE (p_id IS NOT NULL AND i.id=p_id) OR (p_id IS NULL AND i.barcode=ANY(p_barcodes)) LIMIT 3
 ) target;
 RETURN result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.read_food_correction_targets_v1(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_food_correction_targets_v1(uuid,text[]) TO service_role;
CREATE FUNCTION public.apply_verified_food_correction_v1(p_id uuid,p_expected_revision integer,p_values jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE item public.food_items%ROWTYPE; replacement public.food_items%ROWTYPE; saved public.food_items%ROWTYPE; patch jsonb; k text; assignments text; columns_list text; values_list text; revision integer; old_context text:=current_setting('macrogoal.correction_context',true);
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF octet_length(p_values::text)>32768 OR (p_values - ARRAY['name','brand','barcode','calories','protein','carbs','fat','fiber','serving_size','serving_quantity','serving_unit','macros_per','source','verified','ai_verified','confidence'])<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid correction fields' USING ERRCODE='22023'; END IF;
 IF p_id IS NULL AND NOT coalesce(p_values->>'barcode' ~ '^[0-9]{8,14}$',false) THEN RAISE EXCEPTION 'invalid barcode' USING ERRCODE='22023'; END IF;
 IF NOT coalesce(jsonb_typeof(p_values)='object' AND length(p_values->>'serving_quantity') BETWEEN 1 AND 160 AND length(p_values->>'name') BETWEEN 1 AND 160 AND jsonb_typeof(p_values->'serving_size')='number' AND (p_values->>'serving_size')::numeric>0 AND p_values->>'macros_per'='serving',false) THEN RAISE EXCEPTION 'invalid correction' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['calories','protein','carbs','fat'] LOOP
  IF NOT coalesce(jsonb_typeof(p_values->k)='number' AND (p_values->>k)::numeric>=0,false) THEN RAISE EXCEPTION 'invalid nutrient' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_values->'fiber' IS NOT NULL AND p_values->'fiber'<>'null'::jsonb AND NOT coalesce(jsonb_typeof(p_values->'fiber')='number' AND (p_values->>'fiber')::numeric>=0,false) THEN RAISE EXCEPTION 'invalid fiber' USING ERRCODE='22023'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO item FROM public.food_items WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog_changed' USING ERRCODE='40001'; END IF;
  SELECT coalesce((SELECT c.revision FROM macrogoal_food_private.nutrition_current c WHERE c.food_id=p_id),0) INTO revision;
  IF p_expected_revision IS NULL OR revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'catalog_changed' USING ERRCODE='40001'; END IF;
  IF item.barcode IS DISTINCT FROM p_values->>'barcode' THEN RAISE EXCEPTION 'identity conflict' USING ERRCODE='40001'; END IF;
 END IF;
 -- One explicit normalized patch for INSERT and UPDATE; never inherit DEFAULT sugar=0.
 SELECT jsonb_object_agg(key,'null'::jsonb) INTO patch FROM jsonb_each(macrogoal_food_private.nutrition_snapshot_v1(to_jsonb(jsonb_populate_record(NULL::public.food_items,'{}'::jsonb))));
 patch:=patch||jsonb_build_object('name',p_values->>'name','brand',p_values->>'brand','barcode',CASE WHEN p_id IS NULL THEN p_values->>'barcode' ELSE item.barcode END,'calories',p_values->'calories','protein',p_values->'protein','carbs',p_values->'carbs','fat',p_values->'fat','fiber',p_values->'fiber','serving_size',p_values->'serving_size','serving_quantity',p_values->>'serving_quantity','serving_unit','g','macros_per','serving','source','user','verified',true,'ai_verified',true,'confidence','high','nutriments','{}'::jsonb,'product_name',p_values->>'name','brands',p_values->>'brand','ai_verified_source','two_read_correction_v1','ai_verified_at',now(),'last_verified_at',now(),'updated_at',now());
 replacement:=jsonb_populate_record(NULL::public.food_items,patch);
 SELECT string_agg(format('%I=($1).%I',key,key),','),string_agg(format('%I',key),','),string_agg(format('($1).%I',key),',') INTO assignments,columns_list,values_list FROM jsonb_each(patch);
 PERFORM set_config('macrogoal.correction_context','confirmed_v1',true);
 IF p_id IS NULL THEN
  EXECUTE 'INSERT INTO public.food_items('||columns_list||') SELECT '||values_list||' RETURNING *' INTO saved USING replacement;
 ELSE
  EXECUTE 'UPDATE public.food_items SET '||assignments||' WHERE id=$2 RETURNING *' INTO saved USING replacement,p_id;
 END IF;
 PERFORM set_config('macrogoal.correction_context',coalesce(old_context,''),true);
 RETURN to_jsonb(saved);
END;
$fn$;
REVOKE ALL ON FUNCTION public.apply_verified_food_correction_v1(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_food_correction_v1(uuid,integer,jsonb) TO service_role;
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
