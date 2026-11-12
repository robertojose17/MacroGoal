-- REVIEW CANDIDATE. Exact live-source drift guards. No deployment executed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$ BEGIN
IF current_user<>'postgres' THEN RAISE EXCEPTION 'expected_migration_owner'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.canonical_gtin_mass_v1(text)'::regprocedure))<>'8ce20d680e6299785b7dd28f4639143f' THEN RAISE EXCEPTION 'dependency_drift: canonical_gtin_mass_v1'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.canonical_gtin_mass_v1(text)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres,anon=X/postgres}' THEN RAISE EXCEPTION 'acl_drift'; END IF;
IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.canonical_gtin_mass_v1(text)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'owner_drift'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.create_off_mass_v1(uuid,text,jsonb)'::regprocedure))<>'5626b4c1d6b7e7ea8a2b101a463a281e' THEN RAISE EXCEPTION 'dependency_drift: create_off_mass_v1'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.create_off_mass_v1(uuid,text,jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'acl_drift'; END IF;
IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.create_off_mass_v1(uuid,text,jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'owner_drift'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.derive_off_mass_v1(jsonb)'::regprocedure))<>'c5b8ce30d6632b84fb3cdc340a822531' THEN RAISE EXCEPTION 'dependency_drift: derive_off_mass_v1'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.derive_off_mass_v1(jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}' THEN RAISE EXCEPTION 'acl_drift'; END IF;
IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.derive_off_mass_v1(jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'owner_drift'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.nutrient_map_v1()'::regprocedure))<>'eb00d11456cd2461a6d806d394462cb5' THEN RAISE EXCEPTION 'dependency_drift: nutrient_map_v1'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.nutrient_map_v1()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}' THEN RAISE EXCEPTION 'acl_drift'; END IF;
IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.nutrient_map_v1()'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'owner_drift'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.nutrient_value_v1(jsonb,jsonb)'::regprocedure))<>'0e98650b70b7cd954d529e46163501e9' THEN RAISE EXCEPTION 'dependency_drift: nutrient_value_v1'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.nutrient_value_v1(jsonb,jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}' THEN RAISE EXCEPTION 'acl_drift'; END IF;
IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.nutrient_value_v1(jsonb,jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'owner_drift'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.source_matches_mass_v1(jsonb,text,text)'::regprocedure))<>'e6d3354b494a5f5baef13d5be23b6bb4' THEN RAISE EXCEPTION 'dependency_drift: source_matches_mass_v1'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.source_matches_mass_v1(jsonb,text,text)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}' THEN RAISE EXCEPTION 'acl_drift'; END IF;
IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.source_matches_mass_v1(jsonb,text,text)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'owner_drift'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.validate_nutrient_evidence_v1(jsonb)'::regprocedure))<>'3bf90f6a42d3b401cc89c856d81f845b' THEN RAISE EXCEPTION 'dependency_drift: validate_nutrient_evidence_v1'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.validate_nutrient_evidence_v1(jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}' THEN RAISE EXCEPTION 'acl_drift'; END IF;
IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.validate_nutrient_evidence_v1(jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'owner_drift'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.refresh_nutrients_v1(uuid,integer,uuid,jsonb)'::regprocedure))<>'9db02f269902aeb61bbf3091fbcf614d' THEN RAISE EXCEPTION 'dependency_drift: refresh_nutrients_v1'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.refresh_nutrients_v1(uuid,integer,uuid,jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'acl_drift'; END IF;
IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.refresh_nutrients_v1(uuid,integer,uuid,jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'owner_drift'; END IF;
IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='macrogoal_food_private.off_source_bindings_v1'::regclass AND conname='off_source_bindings_v1_source_schema_check') IS DISTINCT FROM $$CHECK ((source_schema = 'off_legacy_serving_v1'::text))$$ THEN RAISE EXCEPTION 'binding_check_drift'; END IF;
END $preflight$;
DO $helper$ BEGIN
IF md5(pg_get_functiondef('macrogoal_food_private.derive_off_100g_v4(jsonb,text)'::regprocedure))<>'43c1f4d177efbf8bd915ca045a0c872a' THEN RAISE EXCEPTION 'pure_helper_drift'; END IF;
IF (SELECT proacl::text FROM pg_proc WHERE oid='macrogoal_food_private.derive_off_100g_v4(jsonb,text)'::regprocedure)<>'{postgres=X/postgres}' THEN RAISE EXCEPTION 'pure_helper_acl_drift'; END IF;
END $helper$;


-- Only eligible values enter the existing v2 internal authority representation.
-- Raw v4 evidence (including qualification/conflict evidence) is stored unchanged.
CREATE FUNCTION macrogoal_food_private.derive_off_mass_v4(e jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $v4$
DECLARE checked jsonb; n jsonb; s jsonb; base text; logical text; derived jsonb:='[]'::jsonb; out_ jsonb;
BEGIN
 checked:=macrogoal_food_private.derive_off_100g_v4(e,e->>'source_id');s:=e->'snapshot';
 FOR n IN SELECT * FROM jsonb_array_elements(checked->'nutrients') LOOP
  IF n->>'status'<>'valid' THEN CONTINUE; END IF;
  base:=regexp_replace(n->>'provider_key','_100g$','');
  SELECT value->>'key' INTO logical FROM jsonb_array_elements(macrogoal_food_private.nutrient_map_v1()) WHERE value->'off' ? base;
  logical:=coalesce(logical,'off_'||base);
  derived:=derived||jsonb_build_array(jsonb_build_object('key',logical,'provider_key',n->>'provider_key','amount',n->'amount','unit',lower(n->>'unit'),'label_unit',s->'nutriments'->(base||'_unit'),'basis',jsonb_build_object('kind','per_100g'),'source',jsonb_build_object('provider','openfoodfacts','source_id',s->>'code'),'captured_at',e->'captured_at','status','valid'));
 END LOOP;
 out_:=jsonb_build_object('version',2,'provider','openfoodfacts','source_id',s->>'code','captured_at',e->'captured_at','basis',jsonb_build_object('kind','per_100g'),'identity',jsonb_build_object('description',s->>'product_name','brand',s->>'brands','ingredients_text',s->>'ingredients_text','formulation',s->>'ingredients_text','preparation','as_sold','data_type',null),'nutrients',derived,'conflicts','[]'::jsonb);
 PERFORM macrogoal_food_private.validate_nutrient_evidence_v1(out_);
 RETURN out_;
END $v4$;
REVOKE ALL ON FUNCTION macrogoal_food_private.derive_off_mass_v4(jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE macrogoal_food_private.off_source_bindings_v1
 DROP CONSTRAINT off_source_bindings_v1_source_schema_check,
 ADD CONSTRAINT off_source_bindings_v1_source_schema_check
 CHECK(source_schema IN ('off_legacy_serving_v1','off_legacy_100g_mass_v4'));
CREATE OR REPLACE FUNCTION macrogoal_food_private.create_off_mass_v1(p_request_id uuid, p_expected_code text, p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e jsonb; s jsonb; code text; item public.food_items%ROWTYPE; patch jsonb:='{}'; m jsonb; amount numeric; receipt macrogoal_food_private.off_creation_receipts_v1%ROWTYPE; result jsonb; revision_ integer; new_food_id uuid:=gen_random_uuid(); reservation macrogoal_food_private.food_identity_reservations_mass_v1%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_code IS NULL THEN RAISE EXCEPTION 'mandatory_request_and_identity' USING ERRCODE='22023'; END IF;
 -- Hash collision only serializes unrelated requests, never grants authority.
 PERFORM pg_advisory_xact_lock(hashtextextended('off_mass_request:'||p_request_id::text,0));
 SELECT * INTO receipt FROM macrogoal_food_private.off_creation_receipts_v1 WHERE request_id=p_request_id;
 IF FOUND THEN
  IF receipt.expected_code IS DISTINCT FROM p_expected_code OR receipt.evidence IS DISTINCT FROM p_evidence THEN RAISE EXCEPTION 'request_id_reused' USING ERRCODE='22023'; END IF;
  -- Idempotent outcome/food identity, but never send a stale pre-correction food
  -- snapshot on retry. The stored receipt remains immutable; response reads current.
  IF receipt.food_id IS NOT NULL AND receipt.result ? 'food_item' THEN
   SELECT * INTO item FROM public.food_items WHERE id=receipt.food_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'receipt_food_unavailable' USING ERRCODE='40001'; END IF;
   SELECT revision INTO revision_ FROM macrogoal_food_private.nutrition_current WHERE food_id=receipt.food_id;
   IF revision_ IS NULL THEN RAISE EXCEPTION 'receipt_nutrition_audit_missing' USING ERRCODE='40001'; END IF;
   RETURN jsonb_set(receipt.result,'{food_item}',to_jsonb(item))||jsonb_build_object('revision',revision_);
  END IF;
  RETURN receipt.result;
 END IF;
 IF p_evidence->'version'='4'::jsonb THEN e:=macrogoal_food_private.derive_off_mass_v4(p_evidence);
 ELSE e:=macrogoal_food_private.derive_off_mass_v1(p_evidence); END IF;s:=p_evidence->'snapshot';code:=macrogoal_food_private.canonical_gtin_mass_v1(s->>'code');
 IF macrogoal_food_private.canonical_gtin_mass_v1(p_expected_code) IS DISTINCT FROM code THEN RAISE EXCEPTION 'requested_identity_mismatch' USING ERRCODE='22023'; END IF;
 -- Read/claim the durable identity row in one unique upsert, not an advisory read.
 INSERT INTO macrogoal_food_private.food_identity_reservations_mass_v1 AS locked(canonical_code,member_food_ids,historical_ambiguous)
 VALUES(code,ARRAY[new_food_id],false)
 ON CONFLICT(canonical_code) DO UPDATE SET touch_revision=locked.touch_revision+1
 RETURNING * INTO reservation;
 IF reservation.historical_ambiguous THEN
  result:=jsonb_build_object('status','ambiguous_existing');
 ELSIF reservation.member_food_ids<>ARRAY[new_food_id] THEN
  SELECT * INTO item FROM public.food_items WHERE id=reservation.member_food_ids[1] AND macrogoal_food_private.canonical_gtin_mass_v1(barcode)=code FOR UPDATE;
  IF FOUND THEN result:=jsonb_build_object('status','existing','food_item',to_jsonb(item));
  ELSE result:=jsonb_build_object('status','identity_reserved'); END IF;
 ELSE
  FOR m IN SELECT * FROM jsonb_array_elements(macrogoal_food_private.nutrient_map_v1()) LOOP
   amount:=macrogoal_food_private.nutrient_value_v1(e,m);IF amount IS NOT NULL THEN patch:=patch||jsonb_build_object(m->>'key',amount,m->>'legacy',amount); END IF;
  END LOOP;
  -- Optional facts must override legacy zero defaults: unsupported/absent stays SQL NULL.
  FOR m IN SELECT * FROM jsonb_array_elements('[{"key":"fiber","legacy":"fiber","unit":"g","usda":["1079"],"off":["fiber"],"aliases":[]},{"key":"sugar_g","legacy":"sugar","unit":"g","usda":["2000","1063"],"off":["sugars"],"aliases":[]},{"key":"saturated_fat_g","legacy":"saturated_fat","unit":"g","usda":["1258"],"off":["saturated-fat"],"aliases":[]},{"key":"trans_fat_g","legacy":"trans_fat","unit":"g","usda":["1257"],"off":["trans-fat"],"aliases":[]},{"key":"polyunsaturated_fat_g","legacy":"polyunsaturated_fat","unit":"g","usda":["1293"],"off":["polyunsaturated-fat"],"aliases":[]},{"key":"monounsaturated_fat_g","legacy":"monounsaturated_fat","unit":"g","usda":["1292"],"off":["monounsaturated-fat"],"aliases":[]},{"key":"cholesterol_mg","legacy":"cholesterol","unit":"mg","usda":["1253"],"off":["cholesterol"],"aliases":[]},{"key":"added_sugar_g","legacy":"added_sugars","unit":"g","usda":["1235"],"off":["added-sugars"],"aliases":[]},{"key":"soluble_fiber_g","legacy":"soluble_fiber","unit":"g","usda":["1082"],"off":["soluble-fiber"],"aliases":[]},{"key":"insoluble_fiber_g","legacy":"insoluble_fiber","unit":"g","usda":["1084"],"off":["insoluble-fiber"],"aliases":[]},{"key":"starch","legacy":"starch","unit":"g","usda":["1009"],"off":["starch"],"aliases":[]},{"key":"water_g","legacy":"water_g","unit":"g","usda":["1051"],"off":["water"],"aliases":[]},{"key":"alcohol_g","legacy":"alcohol_g","unit":"g","usda":["1018"],"off":[],"aliases":[]},{"key":"sugar_alcohols","legacy":"sugar_alcohols","unit":"g","usda":[],"off":["sugar-alcohols"],"aliases":[]}]'::jsonb) LOOP
   SELECT (n->>'amount')::numeric * CASE m->>'unit' WHEN 'mg' THEN 1000 ELSE 1 END INTO amount
   FROM jsonb_array_elements(e->'nutrients') n
   WHERE n->>'provider_key'=(m->'off'->>0)||'_100g' AND n->>'unit'='g' AND n->>'status'='valid';
   patch:=patch||jsonb_build_object(m->>'key',amount,m->>'legacy',amount);
  END LOOP;
  SELECT * INTO item FROM jsonb_populate_record(NULL::public.food_items,patch);
  INSERT INTO public.food_items(id,name,brand,brands,barcode,source,source_id,ingredients_text,macros_per,calories,protein,carbs,fat,serving_size,serving_quantity,serving_unit,verified,ai_verified,
   calcium_mg,calcium,iron_mg,iron,magnesium_mg,magnesium,phosphorus_mg,phosphorus,potassium_mg,potassium,sodium_mg,sodium,zinc_mg,zinc,copper_mg,copper,manganese_mg,manganese,selenium_mcg,selenium,vitamin_c_mg,vitamin_c,vitamin_b1_mg,vitamin_b1,vitamin_b2_mg,vitamin_b2,vitamin_b3_mg,vitamin_b3,vitamin_b6_mg,vitamin_b6,folate_mcg,vitamin_b9,vitamin_b12_mcg,vitamin_b12,vitamin_e_mg,vitamin_e,vitamin_d_mcg,vitamin_d,vitamin_k_mcg,vitamin_k,fiber,sugar_g,sugar,saturated_fat_g,saturated_fat,trans_fat_g,trans_fat,polyunsaturated_fat_g,polyunsaturated_fat,monounsaturated_fat_g,monounsaturated_fat,cholesterol_mg,cholesterol,added_sugar_g,added_sugars,soluble_fiber_g,soluble_fiber,insoluble_fiber_g,insoluble_fiber,starch,water_g,alcohol_g,sugar_alcohols
  ) VALUES(new_food_id,s->>'product_name',s->>'brands',s->>'brands',code,'openfoodfacts',s->>'code',s->>'ingredients_text','100g',
   CASE WHEN p_evidence->'version'='4'::jsonb THEN (s#>>'{nutriments,energy-kcal_100g}')::numeric ELSE (s#>>'{nutriments,energy-kcal_serving}')::numeric*100/(s->>'serving_quantity')::numeric END,
   CASE WHEN p_evidence->'version'='4'::jsonb THEN (s#>>'{nutriments,proteins_100g}')::numeric ELSE (s#>>'{nutriments,proteins_serving}')::numeric*100/(s->>'serving_quantity')::numeric END,
   CASE WHEN p_evidence->'version'='4'::jsonb THEN (s#>>'{nutriments,carbohydrates_100g}')::numeric ELSE (s#>>'{nutriments,carbohydrates_serving}')::numeric*100/(s->>'serving_quantity')::numeric END,
   CASE WHEN p_evidence->'version'='4'::jsonb THEN (s#>>'{nutriments,fat_100g}')::numeric ELSE (s#>>'{nutriments,fat_serving}')::numeric*100/(s->>'serving_quantity')::numeric END,
   (s->>'serving_quantity')::numeric,s->>'serving_quantity','g',false,false,
   item.calcium_mg,item.calcium,item.iron_mg,item.iron,item.magnesium_mg,item.magnesium,item.phosphorus_mg,item.phosphorus,item.potassium_mg,item.potassium,item.sodium_mg,item.sodium,item.zinc_mg,item.zinc,item.copper_mg,item.copper,item.manganese_mg,item.manganese,item.selenium_mcg,item.selenium,item.vitamin_c_mg,item.vitamin_c,item.vitamin_b1_mg,item.vitamin_b1,item.vitamin_b2_mg,item.vitamin_b2,item.vitamin_b3_mg,item.vitamin_b3,item.vitamin_b6_mg,item.vitamin_b6,item.folate_mcg,item.vitamin_b9,item.vitamin_b12_mcg,item.vitamin_b12,item.vitamin_e_mg,item.vitamin_e,item.vitamin_d_mcg,item.vitamin_d,item.vitamin_k_mcg,item.vitamin_k,item.fiber,item.sugar_g,item.sugar,item.saturated_fat_g,item.saturated_fat,item.trans_fat_g,item.trans_fat,item.polyunsaturated_fat_g,item.polyunsaturated_fat,item.monounsaturated_fat_g,item.monounsaturated_fat,item.cholesterol_mg,item.cholesterol,item.added_sugar_g,item.added_sugars,item.soluble_fiber_g,item.soluble_fiber,item.insoluble_fiber_g,item.insoluble_fiber,item.starch,item.water_g,item.alcohol_g,item.sugar_alcohols
  ) RETURNING * INTO item;
  IF FOUND THEN
   SELECT revision INTO revision_ FROM macrogoal_food_private.nutrition_current WHERE food_id=item.id;
   IF revision_ IS NULL THEN RAISE EXCEPTION 'nutrition_audit_missing'; END IF;
   INSERT INTO macrogoal_food_private.nutrition_evidence(food_id,revision,payload) VALUES(item.id,1,p_evidence);
   INSERT INTO macrogoal_food_private.off_source_bindings_v1 VALUES(item.id,code,s->>'code',CASE WHEN p_evidence->'version'='4'::jsonb THEN 'off_legacy_100g_mass_v4' ELSE 'off_legacy_serving_v1' END,e->'identity',p_request_id,(e->>'captured_at')::timestamptz);
   INSERT INTO macrogoal_food_private.nutrition_refresh_state_v1 VALUES(item.id,'openfoodfacts',s->>'code',p_request_id,revision_,clock_timestamp(),clock_timestamp()+interval '30 days',e->'identity',macrogoal_food_private.canonical_anchor_v1(to_jsonb(item)));
   result:=jsonb_build_object('status','created','food_item',to_jsonb(item),'revision',revision_);
  END IF;
 END IF;
 IF result IS NULL THEN result:=jsonb_build_object('status','existing','food_item',to_jsonb(item)); END IF;
 INSERT INTO macrogoal_food_private.off_creation_receipts_v1(request_id,expected_code,evidence,food_id,result) VALUES(p_request_id,p_expected_code,p_evidence,item.id,result);
 RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION macrogoal_food_private.refresh_nutrients_v1(p_food_id uuid, p_expected_revision integer, p_request_id uuid, p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE item public.food_items%ROWTYPE; patched public.food_items%ROWTYPE; state macrogoal_food_private.nutrition_refresh_state_v1%ROWTYPE; receipt macrogoal_food_private.nutrition_refresh_receipts_v1%ROWTYPE; before_json jsonb; patch jsonb:='{}'; anchor jsonb; m jsonb; amount numeric; reason text; result jsonb; rev integer; ev_rev integer; generic_usda boolean; original_evidence jsonb:=p_evidence;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'mandatory_revision_and_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO item FROM public.food_items WHERE id=p_food_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO receipt FROM macrogoal_food_private.nutrition_refresh_receipts_v1 WHERE request_id=p_request_id;
 IF FOUND THEN
  IF receipt.food_id IS DISTINCT FROM p_food_id OR receipt.expected_revision IS DISTINCT FROM p_expected_revision OR receipt.evidence IS DISTINCT FROM p_evidence THEN RAISE EXCEPTION 'request_id_reused' USING ERRCODE='22023'; END IF;
  RETURN receipt.result; -- exact retry remains valid even after capture-time freshness elapsed
 END IF;
 IF p_evidence->'version'='3'::jsonb THEN p_evidence:=macrogoal_food_private.derive_off_mass_v1(p_evidence);
 ELSIF p_evidence->'version'='4'::jsonb THEN p_evidence:=macrogoal_food_private.derive_off_mass_v4(p_evidence); END IF;
 PERFORM macrogoal_food_private.validate_nutrient_evidence_v1(p_evidence);
 SELECT * INTO state FROM macrogoal_food_private.nutrition_refresh_state_v1 WHERE food_id=p_food_id;
 IF state.request_id IS DISTINCT FROM p_request_id OR state.expected_revision IS DISTINCT FROM p_expected_revision OR state.lease_until IS NULL OR state.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'missing_or_expired_claim' USING ERRCODE='40001'; END IF;
 SELECT revision INTO rev FROM macrogoal_food_private.nutrition_current WHERE food_id=p_food_id;
 before_json:=to_jsonb(item);anchor:=macrogoal_food_private.canonical_anchor_v1(before_json);
 IF coalesce(rev,0)<>p_expected_revision THEN reason:='revision_conflict';
 ELSIF state.provider IS DISTINCT FROM p_evidence->>'provider' OR state.source_id IS DISTINCT FROM p_evidence->>'source_id' OR NOT coalesce(macrogoal_food_private.source_matches_mass_v1(to_jsonb(item),p_evidence->>'provider',p_evidence->>'source_id'),false) THEN reason:='source_identity_conflict';
 ELSIF EXISTS(SELECT 1 FROM macrogoal_food_private.off_source_bindings_v1 b WHERE b.food_id=p_food_id AND (
   (b.source_schema='off_legacy_serving_v1' AND original_evidence->'version' IS DISTINCT FROM '3'::jsonb) OR
   (b.source_schema='off_legacy_100g_mass_v4' AND original_evidence->'version' IS DISTINCT FROM '4'::jsonb))) THEN reason:='mass_proof_required';
 ELSIF item.macros_per IS DISTINCT FROM '100g' OR p_evidence#>>'{basis,kind}' IS DISTINCT FROM 'per_100g' THEN reason:='basis_not_proven';
 ELSIF lower(btrim(item.name)) IS DISTINCT FROM lower(btrim(p_evidence#>>'{identity,description}')) THEN reason:='description_conflict';
 ELSIF NOT macrogoal_food_private.macros_coherent_v1(before_json,p_evidence) THEN reason:='provider_macro_conflict';
 ELSIF NOT macrogoal_food_private.optional_nutrition_coherent_v1(before_json,p_evidence) THEN reason:='known_optional_nutrition_conflict';
 ELSIF state.identity_anchor IS NOT NULL AND (state.identity_anchor IS DISTINCT FROM p_evidence->'identity' OR state.canonical_anchor IS DISTINCT FROM anchor) THEN reason:='identity_or_canonical_changed';
 ELSE
  generic_usda:=p_evidence->>'provider'='usda' AND p_evidence#>>'{identity,data_type}' IN ('Foundation','SR Legacy','Survey (FNDDS)') AND p_evidence#>>'{identity,preparation}'=p_evidence#>>'{identity,description}' AND p_evidence#>>'{identity,formulation}'=p_evidence#>>'{identity,data_type}' AND p_evidence#>>'{identity,brand}' IS NULL AND p_evidence#>>'{identity,ingredients_text}' IS NULL;
  IF state.identity_anchor IS NULL THEN
   IF NOT coalesce(generic_usda,false) OR coalesce(btrim(item.brand),'')<>'' OR coalesce(btrim(item.brands),'')<>'' OR coalesce(btrim(item.ingredients_text),'')<>''
     OR (coalesce(btrim(item.product_name),'')<>'' AND lower(btrim(item.product_name))<>lower(btrim(item.name)))
     OR (coalesce(btrim(item.generic_name),'')<>'' AND lower(btrim(item.generic_name))<>lower(btrim(item.name)))
   THEN reason:='unanchored_formulation';
   ELSIF item.source IS DISTINCT FROM 'usda' OR NOT macrogoal_food_private.macros_coherent_v1(before_json,p_evidence) THEN reason:='unanchored_or_corrected_nutrition'; END IF;
  END IF;
 END IF;
 -- Capture is append-only and independent of the canonical nutrition revision.
 SELECT coalesce(max(revision),0)+1 INTO ev_rev FROM macrogoal_food_private.nutrition_evidence WHERE food_id=p_food_id;
 INSERT INTO macrogoal_food_private.nutrition_evidence(food_id,revision,payload) VALUES(p_food_id,ev_rev,original_evidence);
 IF reason IS NULL AND (jsonb_array_length(p_evidence->'conflicts')>0 OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_evidence->'nutrients') n
  GROUP BY n->>'provider_key',n->'basis' HAVING count(DISTINCT jsonb_build_object('amount',n->'amount','unit',n->'unit','status',n->'status'))>1
 )) THEN reason:='provider_nutrient_conflict'; END IF;
 IF reason IS NULL THEN
  -- Known contradictions quarantine the entire provider snapshot, not just its changed fields.
  FOR m IN SELECT * FROM jsonb_array_elements(macrogoal_food_private.nutrient_map_v1()) LOOP
   amount:=macrogoal_food_private.nutrient_value_v1(p_evidence,m);
   IF amount IS NOT NULL THEN
    IF macrogoal_food_private.nutrient_occupied_v1(before_json - ARRAY[m->>'key',m->>'legacy'],m)
    THEN reason:='existing_nested_nutrient_unresolved';EXIT; END IF;
    IF (jsonb_typeof(before_json->(m->>'key'))='number' AND (before_json->>(m->>'key'))::numeric<>amount)
       OR (jsonb_typeof(before_json->(m->>'legacy'))='number' AND (before_json->>(m->>'legacy'))::numeric<>amount)
    THEN reason:='known_nutrient_conflict';EXIT; END IF;
   END IF;
  END LOOP;
 END IF;
 IF reason IS NULL THEN
  FOR m IN SELECT * FROM jsonb_array_elements(macrogoal_food_private.nutrient_map_v1()) LOOP
   IF macrogoal_food_private.nutrient_occupied_v1(before_json,m) THEN CONTINUE; END IF;
   amount:=macrogoal_food_private.nutrient_value_v1(p_evidence,m);
   IF amount IS NOT NULL THEN patch:=patch||jsonb_build_object(m->>'key',amount,m->>'legacy',amount); END IF;
  END LOOP;
  IF patch<>'{}'::jsonb THEN
   SELECT * INTO patched FROM jsonb_populate_record(item,patch);
   IF NOT macrogoal_food_private.missing_nutrient_delta_v1(before_json,to_jsonb(patched)) THEN RAISE EXCEPTION 'invalid_enrichment_delta'; END IF;
   INSERT INTO macrogoal_food_private.nutrition_enrichment_context_v1 VALUES(pg_backend_pid(),txid_current(),p_food_id,before_json,to_jsonb(patched));
   UPDATE public.food_items SET
 calcium_mg=patched.calcium_mg,
 calcium=patched.calcium,
 iron_mg=patched.iron_mg,
 iron=patched.iron,
 magnesium_mg=patched.magnesium_mg,
 magnesium=patched.magnesium,
 phosphorus_mg=patched.phosphorus_mg,
 phosphorus=patched.phosphorus,
 potassium_mg=patched.potassium_mg,
 potassium=patched.potassium,
 sodium_mg=patched.sodium_mg,
 sodium=patched.sodium,
 zinc_mg=patched.zinc_mg,
 zinc=patched.zinc,
 copper_mg=patched.copper_mg,
 copper=patched.copper,
 manganese_mg=patched.manganese_mg,
 manganese=patched.manganese,
 selenium_mcg=patched.selenium_mcg,
 selenium=patched.selenium,
 vitamin_c_mg=patched.vitamin_c_mg,
 vitamin_c=patched.vitamin_c,
 vitamin_b1_mg=patched.vitamin_b1_mg,
 vitamin_b1=patched.vitamin_b1,
 vitamin_b2_mg=patched.vitamin_b2_mg,
 vitamin_b2=patched.vitamin_b2,
 vitamin_b3_mg=patched.vitamin_b3_mg,
 vitamin_b3=patched.vitamin_b3,
 vitamin_b6_mg=patched.vitamin_b6_mg,
 vitamin_b6=patched.vitamin_b6,
 folate_mcg=patched.folate_mcg,
 vitamin_b9=patched.vitamin_b9,
 vitamin_b12_mcg=patched.vitamin_b12_mcg,
 vitamin_b12=patched.vitamin_b12,
 vitamin_e_mg=patched.vitamin_e_mg,
 vitamin_e=patched.vitamin_e,
 vitamin_d_mcg=patched.vitamin_d_mcg,
 vitamin_d=patched.vitamin_d,
 vitamin_k_mcg=patched.vitamin_k_mcg,
 vitamin_k=patched.vitamin_k
   WHERE id=p_food_id;
   DELETE FROM macrogoal_food_private.nutrition_enrichment_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
  END IF;
  UPDATE macrogoal_food_private.nutrition_refresh_state_v1 SET identity_anchor=p_evidence->'identity',canonical_anchor=anchor WHERE food_id=p_food_id;
 END IF;
 SELECT revision INTO rev FROM macrogoal_food_private.nutrition_current WHERE food_id=p_food_id;
 result:=jsonb_build_object('status',CASE WHEN patch<>'{}'::jsonb THEN 'applied' ELSE 'evidence_only' END,'reason',coalesce(reason,CASE WHEN patch<>'{}'::jsonb THEN 'missing_only' ELSE 'no_missing_eligible_nutrients' END),'revision',coalesce(rev,0),'evidence_revision',ev_rev,'added',ARRAY(SELECT key FROM jsonb_each(patch)));
 INSERT INTO macrogoal_food_private.nutrition_refresh_receipts_v1(request_id,food_id,expected_revision,evidence,result) VALUES(p_request_id,p_food_id,p_expected_revision,original_evidence,result);
 UPDATE macrogoal_food_private.nutrition_refresh_state_v1 SET lease_until=clock_timestamp(),next_eligible_at=clock_timestamp()+interval '30 days' WHERE food_id=p_food_id;
 RETURN result;
END $function$;

DO $checks$ DECLARE source_ jsonb:='{"version":4,"provider":"openfoodfacts","source_id":"0044000060114","captured_at":"2026-11-12T21:19:57.243Z","snapshot":{"code":"0044000060114","product_name":"Chocolate Sandwich Cookies","brands":"Oreo","ingredients_text":"Unbleached enriched flour (wheat flour, niacin, reduced iron, thiamine mononitrate [vitamin B1], riboflavin [vitamin B2], folic acid), sugar, palm oil, soybean oil and/or canola oil, cocoa (processed with alkali), high fructose corn syrup, leavening (baking soda and/or calcium phosphate), salt, soy lecithin, chocolate, artificial flavor.","nutrition_data_per":"100g","nutrition_data_prepared_per":"100g","preparation":null,"serving_quantity":34,"serving_quantity_unit":"g","serving_size":"3 cookies (34 g)","nutriments":{"fat":20.5882352941176,"iron":0.00411764705882353,"salt":0.955882352941177,"fiber":2.94117647058824,"energy":2085.29411764706,"sodium":0.382352941176471,"starch":0,"sugars":41.1764705882353,"calcium":0.0294117647058824,"choline":0,"fat_100g":20.5882352941176,"fat_unit":"g","proteins":2.94117647058824,"energy-kj":2085.29411764706,"fat_value":20.5882352941176,"iron_100g":0.00411764705882353,"iron_unit":"g","potassium":0.147058823529412,"salt_100g":0.955882352941177,"salt_unit":"g","fiber_100g":2.94117647058824,"fiber_unit":"g","iron_value":0.00411764705882353,"nova-group":4,"salt_value":0.955882352941177,"energy-kcal":470.588235294118,"energy_100g":2085.29411764706,"energy_unit":"kJ","fat_serving":7,"fiber_value":2.94117647058824,"sodium_100g":0.382352941176471,"sodium_unit":"g","starch_100g":0,"starch_unit":"g","sugars_100g":41.1764705882353,"sugars_unit":"g","added-sugars":38.2352941176471,"calcium_100g":0.0294117647058824,"calcium_unit":"g","choline_100g":0,"choline_unit":"g","energy_value":2085.29411764706,"iron_serving":0.0014,"salt_serving":0.325,"sodium_value":0.382352941176471,"starch_value":0,"sugars_value":41.1764705882353,"calcium_value":0.0294117647058824,"carbohydrates":73.5294117647059,"choline_value":0,"fiber_serving":1,"proteins_100g":2.94117647058824,"proteins_unit":"g","saturated-fat":5.88235294117647,"energy-kj_100g":2085.29411764706,"energy-kj_unit":"kJ","energy_serving":709,"potassium_100g":0.147058823529412,"potassium_unit":"g","proteins_value":2.94117647058824,"sodium_serving":0.13,"starch_serving":0,"sugars_serving":14,"calcium_serving":0.01,"choline_serving":0,"energy-kj_value":2085.29411764706,"energy_modifier":"~","nova-group_100g":4,"nova-group_unit":"","potassium_value":0.147058823529412,"energy-kcal_100g":470.588235294118,"energy-kcal_unit":"kcal","nova-group_value":4,"proteins_serving":1,"added-sugars_100g":38.2352941176471,"added-sugars_unit":"g","energy-kcal_value":470.588235294118,"energy-kj_serving":709,"potassium_serving":0.05,"added-sugars_value":38.2352941176471,"carbohydrates_100g":73.5294117647059,"carbohydrates_unit":"g","energy-kj_modifier":"~","nova-group_serving":4,"saturated-fat_100g":5.88235294117647,"saturated-fat_unit":"g","carbohydrates_value":73.5294117647059,"energy-kcal_serving":160,"saturated-fat_value":5.88235294117647,"added-sugars_serving":13,"carbohydrates_serving":25,"saturated-fat_serving":2,"fruits-vegetables-nuts-estimate-from-ingredients_100g":4.68,"fruits-vegetables-legumes-estimate-from-ingredients_100g":0}}}'::jsonb; derived_ jsonb; BEGIN
source_:=jsonb_set(source_,'{captured_at}',to_jsonb(to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
derived_:=macrogoal_food_private.derive_off_mass_v4(source_);
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(derived_->'nutrients') n WHERE n->>'provider_key'='energy-kcal_100g' AND (n->>'amount')::numeric=(source_#>>'{snapshot,nutriments,energy-kcal_100g}')::numeric AND n->>'status'='valid') THEN RAISE EXCEPTION 'canonical_energy_assertion'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(derived_->'nutrients') n WHERE n->>'provider_key' IN ('energy_100g','energy-kj_100g')) THEN RAISE EXCEPTION 'qualified_energy_assertion'; END IF;
IF md5(pg_get_functiondef('macrogoal_food_private.derive_off_mass_v1(jsonb)'::regprocedure))<>'c5b8ce30d6632b84fb3cdc340a822531' THEN RAISE EXCEPTION 'v3_implementation_changed'; END IF;
IF has_function_privilege('anon','public.create_off_mass_food_v1(uuid,text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.create_off_mass_food_v1(uuid,text,jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.create_off_mass_food_v1(uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'public_create_acl_changed'; END IF;
IF has_function_privilege('service_role','macrogoal_food_private.derive_off_mass_v4(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'helper_acl_expanded'; END IF;
END $checks$;

-- Existing public and definer entrypoints retain their ACLs/owners via CREATE OR REPLACE.
-- No new public or service-callable endpoint; helper invocation is through checked definer.
DO $test$ DECLARE e jsonb:='{"version":4,"provider":"openfoodfacts","source_id":"0044000060114","captured_at":"2026-11-12T21:22:03.778Z","snapshot":{"code":"0044000060114","product_name":"Chocolate Sandwich Cookies","brands":"Oreo","ingredients_text":"Unbleached enriched flour (wheat flour, niacin, reduced iron, thiamine mononitrate [vitamin B1], riboflavin [vitamin B2], folic acid), sugar, palm oil, soybean oil and/or canola oil, cocoa (processed with alkali), high fructose corn syrup, leavening (baking soda and/or calcium phosphate), salt, soy lecithin, chocolate, artificial flavor.","nutrition_data_per":"100g","nutrition_data_prepared_per":"100g","preparation":null,"serving_quantity":34,"serving_quantity_unit":"g","serving_size":"3 cookies (34 g)","nutriments":{"fat":20.5882352941176,"iron":0.00411764705882353,"salt":0.955882352941177,"fiber":2.94117647058824,"energy":2085.29411764706,"sodium":0.382352941176471,"starch":0,"sugars":41.1764705882353,"calcium":0.0294117647058824,"choline":0,"fat_100g":20.5882352941176,"fat_unit":"g","proteins":2.94117647058824,"energy-kj":2085.29411764706,"fat_value":20.5882352941176,"iron_100g":0.00411764705882353,"iron_unit":"g","potassium":0.147058823529412,"salt_100g":0.955882352941177,"salt_unit":"g","fiber_100g":2.94117647058824,"fiber_unit":"g","iron_value":0.00411764705882353,"nova-group":4,"salt_value":0.955882352941177,"energy-kcal":470.588235294118,"energy_100g":2085.29411764706,"energy_unit":"kJ","fat_serving":7,"fiber_value":2.94117647058824,"sodium_100g":0.382352941176471,"sodium_unit":"g","starch_100g":0,"starch_unit":"g","sugars_100g":41.1764705882353,"sugars_unit":"g","added-sugars":38.2352941176471,"calcium_100g":0.0294117647058824,"calcium_unit":"g","choline_100g":0,"choline_unit":"g","energy_value":2085.29411764706,"iron_serving":0.0014,"salt_serving":0.325,"sodium_value":0.382352941176471,"starch_value":0,"sugars_value":41.1764705882353,"calcium_value":0.0294117647058824,"carbohydrates":73.5294117647059,"choline_value":0,"fiber_serving":1,"proteins_100g":2.94117647058824,"proteins_unit":"g","saturated-fat":5.88235294117647,"energy-kj_100g":2085.29411764706,"energy-kj_unit":"kJ","energy_serving":709,"potassium_100g":0.147058823529412,"potassium_unit":"g","proteins_value":2.94117647058824,"sodium_serving":0.13,"starch_serving":0,"sugars_serving":14,"calcium_serving":0.01,"choline_serving":0,"energy-kj_value":2085.29411764706,"energy_modifier":"~","nova-group_100g":4,"nova-group_unit":"","potassium_value":0.147058823529412,"energy-kcal_100g":470.588235294118,"energy-kcal_unit":"kcal","nova-group_value":4,"proteins_serving":1,"added-sugars_100g":38.2352941176471,"added-sugars_unit":"g","energy-kcal_value":470.588235294118,"energy-kj_serving":709,"potassium_serving":0.05,"added-sugars_value":38.2352941176471,"carbohydrates_100g":73.5294117647059,"carbohydrates_unit":"g","energy-kj_modifier":"~","nova-group_serving":4,"saturated-fat_100g":5.88235294117647,"saturated-fat_unit":"g","carbohydrates_value":73.5294117647059,"energy-kcal_serving":160,"saturated-fat_value":5.88235294117647,"added-sugars_serving":13,"carbohydrates_serving":25,"saturated-fat_serving":2,"fruits-vegetables-nuts-estimate-from-ingredients_100g":4.68,"fruits-vegetables-legumes-estimate-from-ingredients_100g":0}}}'::jsonb; changed jsonb; output jsonb; retried jsonb; f public.food_items%ROWTYPE; id_ uuid; rev integer; rejected boolean; result jsonb;
create_req uuid:='24a4ce8b-b9cc-4f21-8796-f37ee93968e1';refresh_req uuid:='24a4ce8b-b9cc-4f21-8796-f37ee93968e2';
BEGIN
 BEGIN
 IF EXISTS(SELECT 1 FROM public.food_items WHERE macrogoal_food_private.canonical_gtin_mass_v1(barcode)='0044000060114') THEN RAISE EXCEPTION 'test_precondition_product_already_exists'; END IF;
 e:=jsonb_set(e,'{captured_at}',to_jsonb(to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 PERFORM set_config('role','service_role',true);
 output:=public.create_off_mass_food_v1(create_req,'0044000060114',e);
 retried:=public.create_off_mass_food_v1(create_req,'0044000060114',e);
 PERFORM set_config('role','none',true);
 IF output->>'status'<>'created' OR retried IS DISTINCT FROM output THEN RAISE EXCEPTION 'create_or_exact_retry_failed'; END IF;
 id_:=(output#>>'{food_item,id}')::uuid;rev:=(output->>'revision')::integer;
 SELECT * INTO f FROM public.food_items WHERE id=id_;
 IF f.calories IS DISTINCT FROM (e#>>'{snapshot,nutriments,energy-kcal_100g}')::numeric OR f.protein IS DISTINCT FROM (e#>>'{snapshot,nutriments,proteins_100g}')::numeric OR f.serving_size<>34 OR f.macros_per<>'100g' THEN RAISE EXCEPTION 'canonical_macros_or_serving_failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM macrogoal_food_private.nutrition_evidence WHERE food_id=id_ AND payload=e) THEN RAISE EXCEPTION 'raw_evidence_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM macrogoal_food_private.off_source_bindings_v1 WHERE food_id=id_ AND source_schema='off_legacy_100g_mass_v4') THEN RAISE EXCEPTION 'binding_failed'; END IF;
 IF f.vitamin_b12_mcg IS NOT NULL THEN RAISE EXCEPTION 'test_precondition_b12_occupied'; END IF;
 changed:=jsonb_set(e,'{snapshot,product_name}','"Changed formula"');
 rejected:=false;
 PERFORM set_config('role','service_role',true);
 BEGIN PERFORM public.create_off_mass_food_v1(create_req,'0044000060114',changed); EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true; END;
 PERFORM set_config('role','none',true);
 IF NOT rejected THEN RAISE EXCEPTION 'changed_request_must_reject'; END IF;
 -- Exact alternate identity must return same owner without overwriting source/canonical facts.
 PERFORM set_config('role','service_role',true);
 result:=public.create_off_mass_food_v1('24a4ce8b-b9cc-4f21-8796-f37ee93968e3','044000060114',e);
 PERFORM set_config('role','none',true);
 IF result->>'status'<>'existing' OR result#>>'{food_item,id}'<>id_::text THEN RAISE EXCEPTION 'alias_owner_changed'; END IF;
 -- Exercise claim/refresh on temporary new row; no real food is altered.
 UPDATE macrogoal_food_private.nutrition_refresh_state_v1 SET next_eligible_at=clock_timestamp()-interval '1 second' WHERE food_id=id_;
 changed:=jsonb_set(e,'{snapshot,nutriments}',(e#>'{snapshot,nutriments}')||'{"vitamin-b12":0.000001,"vitamin-b12_100g":0.000001,"vitamin-b12_serving":0.00000034,"vitamin-b12_unit":"mcg","vitamin-b12_value":1}'::jsonb);
 PERFORM set_config('role','service_role',true);
 result:=public.claim_food_nutrition_refresh_v1(id_,rev,refresh_req,'openfoodfacts','0044000060114');
 result:=public.refresh_food_nutrition_v1(id_,rev,refresh_req,changed);
 retried:=public.refresh_food_nutrition_v1(id_,rev,refresh_req,changed);
 PERFORM set_config('role','none',true);
 IF result->>'status'<>'applied' OR result IS DISTINCT FROM retried THEN RAISE EXCEPTION 'refresh_or_retry_failed: %',result; END IF;
 SELECT * INTO f FROM public.food_items WHERE id=id_;
 IF f.vitamin_b12_mcg<>1 OR f.vitamin_b12<>1 OR f.calories IS DISTINCT FROM (e#>>'{snapshot,nutriments,energy-kcal_100g}')::numeric THEN RAISE EXCEPTION 'refresh_unit_or_macro_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM macrogoal_food_private.nutrition_evidence WHERE food_id=id_ AND payload=changed) THEN RAISE EXCEPTION 'refresh_evidence_changed'; END IF;
RAISE EXCEPTION 'v4_validation_rollback' USING ERRCODE='PZ001';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM macrogoal_food_private.off_creation_receipts_v1 WHERE request_id IN ('24a4ce8b-b9cc-4f21-8796-f37ee93968e1','24a4ce8b-b9cc-4f21-8796-f37ee93968e3')) OR EXISTS(SELECT 1 FROM macrogoal_food_private.nutrition_refresh_receipts_v1 WHERE request_id='24a4ce8b-b9cc-4f21-8796-f37ee93968e2') THEN RAISE EXCEPTION 'validation_left_residue'; END IF;
END $test$;

COMMIT;
