-- LOCAL REVIEW CANDIDATE ONLY. NOT A MIGRATION. NOT DEPLOYED.
-- Requires exact live guard captured 2026-11-06. No existing authority context is reused.
BEGIN;
DO $preflight$ BEGIN
 IF md5(pg_get_functiondef('macrogoal_food_private.guard_food_nutrition_v1()'::regprocedure)) <> '990fd13f71e464d179da1e7db12135a9'
 THEN RAISE EXCEPTION 'live_guard_drift_stop'; END IF;
END $preflight$;
CREATE TABLE macrogoal_food_private.nutrition_refresh_state_v1 (
 food_id uuid PRIMARY KEY REFERENCES public.food_items(id) ON DELETE RESTRICT,
 provider text NOT NULL CHECK(provider IN ('usda','openfoodfacts')),
 source_id text NOT NULL,
 request_id uuid NOT NULL,
 expected_revision integer NOT NULL CHECK(expected_revision>=0),
 lease_until timestamptz NOT NULL,
 next_eligible_at timestamptz,
 identity_anchor jsonb,
 canonical_anchor jsonb
);
CREATE TABLE macrogoal_food_private.nutrition_refresh_receipts_v1 (
 request_id uuid PRIMARY KEY,
 food_id uuid NOT NULL REFERENCES public.food_items(id) ON DELETE RESTRICT,
 expected_revision integer NOT NULL,
 evidence jsonb NOT NULL,
 result jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE macrogoal_food_private.nutrition_enrichment_context_v1 (
 backend_pid integer NOT NULL, transaction_id bigint NOT NULL, food_id uuid NOT NULL,
 before_row jsonb NOT NULL, after_row jsonb NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id)
);
ALTER TABLE macrogoal_food_private.nutrition_refresh_state_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_refresh_state_v1 FORCE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_refresh_receipts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_refresh_receipts_v1 FORCE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_enrichment_context_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_enrichment_context_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.nutrition_refresh_state_v1,macrogoal_food_private.nutrition_refresh_receipts_v1,macrogoal_food_private.nutrition_enrichment_context_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION macrogoal_food_private.nutrient_map_v1() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $map$ SELECT '[{"key":"calcium_mg","legacy":"calcium","unit":"mg","usda":["1087"],"off":["calcium"],"aliases":["calcium","calcium"]},{"key":"iron_mg","legacy":"iron","unit":"mg","usda":["1089"],"off":["iron"],"aliases":["iron","iron"]},{"key":"magnesium_mg","legacy":"magnesium","unit":"mg","usda":["1090"],"off":["magnesium"],"aliases":["magnesium","magnesium"]},{"key":"phosphorus_mg","legacy":"phosphorus","unit":"mg","usda":["1091"],"off":["phosphorus"],"aliases":["phosphorus","phosphorus"]},{"key":"potassium_mg","legacy":"potassium","unit":"mg","usda":["1092"],"off":["potassium"],"aliases":["potassium","potassium"]},{"key":"sodium_mg","legacy":"sodium","unit":"mg","usda":["1093"],"off":["sodium"],"aliases":["sodium","sodium"]},{"key":"zinc_mg","legacy":"zinc","unit":"mg","usda":["1095"],"off":["zinc"],"aliases":["zinc","zinc"]},{"key":"copper_mg","legacy":"copper","unit":"mg","usda":["1098"],"off":["copper"],"aliases":["copper","copper"]},{"key":"manganese_mg","legacy":"manganese","unit":"mg","usda":["1101"],"off":["manganese"],"aliases":["manganese","manganese"]},{"key":"selenium_mcg","legacy":"selenium","unit":"mcg","usda":["1103"],"off":["selenium"],"aliases":["selenium","selenium"]},{"key":"vitamin_c_mg","legacy":"vitamin_c","unit":"mg","usda":["1162"],"off":["vitamin-c"],"aliases":["vitamin_c","vitamin_c"]},{"key":"vitamin_b1_mg","legacy":"vitamin_b1","unit":"mg","usda":["1165"],"off":["vitamin-b1"],"aliases":["thiamin","vitamin_b1"]},{"key":"vitamin_b2_mg","legacy":"vitamin_b2","unit":"mg","usda":["1166"],"off":["vitamin-b2"],"aliases":["riboflavin","vitamin_b2"]},{"key":"vitamin_b3_mg","legacy":"vitamin_b3","unit":"mg","usda":["1167"],"off":["vitamin-pp"],"aliases":["niacin","vitamin_b3"]},{"key":"vitamin_b6_mg","legacy":"vitamin_b6","unit":"mg","usda":["1175"],"off":["vitamin-b6"],"aliases":["vitamin_b6","vitamin_b6"]},{"key":"folate_mcg","legacy":"vitamin_b9","unit":"mcg","usda":["1177"],"off":["vitamin-b9"],"aliases":["folate","vitamin_b9","folates"]},{"key":"vitamin_b12_mcg","legacy":"vitamin_b12","unit":"mcg","usda":["1178"],"off":["vitamin-b12"],"aliases":["vitamin_b12","vitamin_b12"]},{"key":"vitamin_e_mg","legacy":"vitamin_e","unit":"mg","usda":["1109"],"off":["vitamin-e"],"aliases":["vitamin_e","vitamin_e"]},{"key":"vitamin_d_mcg","legacy":"vitamin_d","unit":"mcg","usda":["1114"],"off":["vitamin-d"],"aliases":["vitamin_d","vitamin_d"]},{"key":"vitamin_k_mcg","legacy":"vitamin_k","unit":"mcg","usda":["1185"],"off":["vitamin-k"],"aliases":["vitamin_k","vitamin_k"]}]'::jsonb $map$;
DO $preflight$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.nutrition_snapshot_v1(jsonb)'::regprocedure)) <> 'a607246db719d928d9ccefed9377b6f4' THEN RAISE EXCEPTION 'live_authority_drift_stop'; END IF; END $preflight$;
DO $preflight$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.audit_food_nutrition_v1()'::regprocedure)) <> '9f35470f0ac6944adc5332aeb2284f3b' THEN RAISE EXCEPTION 'live_authority_drift_stop'; END IF; END $preflight$;
-- Missing means SQL NULL only. A nested alias key, even null/malformed, is ambiguous evidence.
CREATE FUNCTION macrogoal_food_private.nutrient_occupied_v1(item jsonb,m jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE alias text; nested jsonb; k text;
BEGIN
 IF item->(m->>'key') IS DISTINCT FROM 'null'::jsonb AND item ? (m->>'key') THEN RETURN true; END IF;
 IF item->(m->>'legacy') IS DISTINCT FROM 'null'::jsonb AND item ? (m->>'legacy') THEN RETURN true; END IF;
 FOR alias IN SELECT jsonb_array_elements_text(jsonb_build_array(m->>'key',m->>'legacy') || (m->'aliases') || (m->'usda') || (m->'off')) LOOP
  FOREACH nested IN ARRAY ARRAY[item->'nutriments',item#>'{off_data,nutriments}',item->'micronutrients'] LOOP
   IF jsonb_typeof(nested)='object' THEN
    FOREACH k IN ARRAY ARRAY[alias,alias||'_100g',alias||'_serving',alias||'_value'] LOOP
     IF nested ? k THEN RETURN true; END IF;
    END LOOP;
   ELSIF nested IS NOT NULL AND nested<>'null'::jsonb THEN RETURN true;
   END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END $$;
CREATE FUNCTION macrogoal_food_private.canonical_anchor_v1(item jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(item)
 WHERE key=ANY(ARRAY['name','brand','brands','product_name','generic_name','source','source_id','usda_fdc_id','barcode','ingredients_text','calories','protein','carbs','fat','macros_per','serving_size','serving_unit','serving_quantity','serving_count','serving_description'])
$$;
CREATE FUNCTION macrogoal_food_private.missing_nutrient_delta_v1(old_item jsonb,new_item jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE m jsonb; strip text[]:='{}'; changed boolean:=false; a numeric; b numeric;
BEGIN
 IF old_item->>'macros_per' IS DISTINCT FROM '100g' OR old_item->>'macros_per' IS DISTINCT FROM new_item->>'macros_per' THEN RETURN false; END IF;
 FOR m IN SELECT * FROM jsonb_array_elements(macrogoal_food_private.nutrient_map_v1()) LOOP
  strip:=strip||ARRAY[m->>'key',m->>'legacy'];
  IF old_item->(m->>'key') IS DISTINCT FROM new_item->(m->>'key') OR old_item->(m->>'legacy') IS DISTINCT FROM new_item->(m->>'legacy') THEN
   IF macrogoal_food_private.nutrient_occupied_v1(old_item,m) OR jsonb_typeof(new_item->(m->>'key')) IS DISTINCT FROM 'number' OR new_item->(m->>'key') IS DISTINCT FROM new_item->(m->>'legacy') THEN RETURN false; END IF;
   a:=(new_item->>(m->>'key'))::numeric;
   IF a<0 OR a>(CASE m->>'unit' WHEN 'mg' THEN 100000 ELSE 100000000 END) THEN RETURN false; END IF;
   changed:=true;
  END IF;
 END LOOP;
 RETURN changed AND (old_item-strip)=(new_item-strip);
END $$;
CREATE FUNCTION macrogoal_food_private.validate_nutrient_evidence_v1(e jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n jsonb; v jsonb; field_name text; t timestamptz;
BEGIN
 IF NOT coalesce(jsonb_typeof(e)='object' AND octet_length(e::text)<=65536 AND e->'version'='2'::jsonb AND e->>'provider' IN ('usda','openfoodfacts') AND e->>'source_id' ~ '^[0-9]{1,20}$' AND jsonb_typeof(e->'nutrients')='array' AND jsonb_typeof(e->'identity')='object' AND e->'basis' IN ('{"kind":"per_100g"}'::jsonb,'{"kind":"provider_100"}'::jsonb) AND jsonb_typeof(e->'conflicts')='array',false)
 THEN RAISE EXCEPTION 'invalid_evidence' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(e) k WHERE k<>ALL(ARRAY['version','provider','source_id','captured_at','basis','identity','nutrients','conflicts'])) OR (SELECT count(*) FROM jsonb_object_keys(e))<>8 OR jsonb_array_length(e->'nutrients') NOT BETWEEN 1 AND 512 OR jsonb_array_length(e->'conflicts')>64 THEN RAISE EXCEPTION 'invalid_evidence_shape' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(e->'captured_at') IS DISTINCT FROM 'string' OR e->>'captured_at' !~ '^\d{4}-\d{2}-\d{2}T' OR length(e->>'captured_at')>40 THEN RAISE EXCEPTION 'invalid_capture_time' USING ERRCODE='22023'; END IF;
 t:=(e->>'captured_at')::timestamptz;
 IF NOT isfinite(t) OR t<clock_timestamp()-interval '24 hours' OR t>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'stale_or_future_evidence' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(e->'identity'))<>6 OR EXISTS(SELECT 1 FROM jsonb_object_keys(e->'identity') k WHERE k<>ALL(ARRAY['description','brand','ingredients_text','data_type','formulation','preparation'])) THEN RAISE EXCEPTION 'invalid_identity_shape' USING ERRCODE='22023'; END IF;
 FOR field_name,v IN SELECT * FROM jsonb_each(e->'identity') LOOP
  IF v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR length(v#>>'{}')>CASE WHEN field_name IN ('ingredients_text','formulation') THEN 4096 ELSE 160 END OR (v#>>'{}') ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'invalid_identity_field' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF coalesce(length(e#>>'{identity,description}'),0) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'missing_description' USING ERRCODE='22023'; END IF;
 FOR n IN SELECT * FROM jsonb_array_elements(e->'nutrients') LOOP
  IF NOT coalesce(jsonb_typeof(n)='object' AND n->>'key' ~ '^[a-z0-9_-]{1,100}$' AND n->>'provider_key' ~ '^[a-z0-9_-]{1,100}$' AND jsonb_typeof(n->'unit')='string' AND length(n->>'unit') BETWEEN 1 AND 24 AND n->'source'=jsonb_build_object('provider',e->>'provider','source_id',e->>'source_id') AND n->'captured_at'=e->'captured_at' AND n->'basis' IN ('{"kind":"per_100g"}'::jsonb,'{"kind":"provider_100"}'::jsonb,'{"kind":"serving"}'::jsonb,'{"kind":"unknown"}'::jsonb) AND n->>'status' IN ('valid','negative','missing'),false) THEN RAISE EXCEPTION 'invalid_nutrient' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(n) k WHERE k<>ALL(ARRAY['key','provider_key','amount','unit','basis','source','captured_at','status','label_unit'])) OR NOT (n ?& ARRAY['key','provider_key','amount','unit','basis','source','captured_at','status']) THEN RAISE EXCEPTION 'invalid_nutrient_shape' USING ERRCODE='22023'; END IF;
  IF n ? 'label_unit' AND n->'label_unit'<>'null'::jsonb AND (jsonb_typeof(n->'label_unit')<>'string' OR length(n->>'label_unit')>24) THEN RAISE EXCEPTION 'invalid_label_unit' USING ERRCODE='22023'; END IF;
  IF n->>'status'='missing' THEN
   IF n->'amount' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'invalid_missing_amount' USING ERRCODE='22023'; END IF;
  ELSE
   IF jsonb_typeof(n->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE='22023'; END IF;
   IF abs((n->>'amount')::numeric)>1000000000 OR ((n->>'amount')::numeric<0) IS DISTINCT FROM (n->>'status'='negative') THEN RAISE EXCEPTION 'invalid_amount_range' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 FOR n IN SELECT * FROM jsonb_array_elements(e->'conflicts') LOOP
  IF NOT coalesce(jsonb_typeof(n)='object' AND n->>'kind'='duplicate_nutrient' AND jsonb_typeof(n->'key')='string' AND n->>'key' ~ '^[a-z0-9_-]{1,100}$' AND n ?& ARRAY['kind','key'],false) OR (SELECT count(*) FROM jsonb_object_keys(n))<>2 THEN RAISE EXCEPTION 'invalid_conflict' USING ERRCODE='22023'; END IF;
 END LOOP;
END $$;
-- Independently derive canonical values from original provider keys and units. Never accept client candidates.
CREATE FUNCTION macrogoal_food_private.nutrient_value_v1(e jsonb,m jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n jsonb; amount numeric; seen numeric; found boolean:=false;
BEGIN
 FOR n IN SELECT * FROM jsonb_array_elements(e->'nutrients') LOOP
  IF n->>'status'<>'valid' OR n#>>'{basis,kind}'<>'per_100g' THEN CONTINUE; END IF;
  IF e->>'provider'='usda' THEN
   IF NOT (m->'usda' ? (n->>'provider_key')) THEN CONTINUE; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(m->'off') k WHERE k||'_100g'=n->>'provider_key') OR n->>'unit'<>'g' THEN CONTINUE; END IF;
  END IF;
  IF n->>'key' IS DISTINCT FROM m->>'key' OR n->>'unit' NOT IN ('g','mg','mcg') THEN CONTINUE; END IF;
  amount:=(n->>'amount')::numeric * CASE n->>'unit' WHEN 'g' THEN 1000000 WHEN 'mg' THEN 1000 ELSE 1 END / CASE m->>'unit' WHEN 'mg' THEN 1000 ELSE 1 END;
  IF amount>(CASE m->>'unit' WHEN 'mg' THEN 100000 ELSE 100000000 END) THEN RETURN NULL; END IF;
  IF found AND seen<>amount THEN RETURN NULL; END IF;
  seen:=amount;found:=true;
 END LOOP;
 RETURN seen;
END $$;
CREATE FUNCTION macrogoal_food_private.macros_coherent_v1(item jsonb,e jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE names text[]:=ARRAY['calories','protein','carbs','fat']; usda text[]:=ARRAY['1008','1003','1005','1004']; offkeys text[]:=ARRAY['energy-kcal_100g','proteins_100g','carbohydrates_100g','fat_100g']; i integer; values_ numeric[]; a numeric; b numeric; provider_key text;
BEGIN
 FOR i IN 1..4 LOOP
  IF jsonb_typeof(item->names[i]) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  provider_key:=CASE e->>'provider' WHEN 'usda' THEN usda[i] ELSE offkeys[i] END;
  IF e->>'provider'='usda' AND i=1 THEN
   SELECT preferred.key INTO provider_key FROM unnest(ARRAY['1008','2048','2047']) WITH ORDINALITY preferred(key,priority)
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(e->'nutrients') n WHERE n->>'provider_key'=preferred.key AND n->>'status'='valid' AND n#>>'{basis,kind}'='per_100g' AND n->>'unit'='kcal') ORDER BY preferred.priority LIMIT 1;
  END IF;
  SELECT array_agg(DISTINCT (n->>'amount')::numeric) INTO values_ FROM jsonb_array_elements(e->'nutrients') n
   WHERE n->>'provider_key'=provider_key AND n->>'status'='valid' AND n#>>'{basis,kind}'='per_100g' AND n->>'unit'=CASE WHEN i=1 THEN 'kcal' ELSE 'g' END;
  IF coalesce(array_length(values_,1),0)<>1 THEN RETURN false; END IF;
  a:=(item->>names[i])::numeric;b:=values_[1];
  IF a=0 AND b<>0 OR a<>0 AND abs(a-b)>greatest(0.1,abs(a)*0.01) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE FUNCTION macrogoal_food_private.optional_nutrition_coherent_v1(item jsonb,e jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE m jsonb; n jsonb; provider_key text; old_value jsonb; amount numeric;
BEGIN
 FOR m IN SELECT * FROM jsonb_array_elements('[{"key":"fiber","legacy":"fiber","unit":"g","usda":["1079"],"off":["fiber"],"aliases":[]},{"key":"sugar_g","legacy":"sugar","unit":"g","usda":["2000","1063"],"off":["sugars"],"aliases":[]},{"key":"saturated_fat_g","legacy":"saturated_fat","unit":"g","usda":["1258"],"off":["saturated-fat"],"aliases":[]},{"key":"trans_fat_g","legacy":"trans_fat","unit":"g","usda":["1257"],"off":["trans-fat"],"aliases":[]},{"key":"polyunsaturated_fat_g","legacy":"polyunsaturated_fat","unit":"g","usda":["1293"],"off":["polyunsaturated-fat"],"aliases":[]},{"key":"monounsaturated_fat_g","legacy":"monounsaturated_fat","unit":"g","usda":["1292"],"off":["monounsaturated-fat"],"aliases":[]},{"key":"cholesterol_mg","legacy":"cholesterol","unit":"mg","usda":["1253"],"off":["cholesterol"],"aliases":[]},{"key":"added_sugar_g","legacy":"added_sugars","unit":"g","usda":["1235"],"off":["added-sugars"],"aliases":[]},{"key":"soluble_fiber_g","legacy":"soluble_fiber","unit":"g","usda":["1082"],"off":["soluble-fiber"],"aliases":[]},{"key":"insoluble_fiber_g","legacy":"insoluble_fiber","unit":"g","usda":["1084"],"off":["insoluble-fiber"],"aliases":[]},{"key":"starch","legacy":"starch","unit":"g","usda":["1009"],"off":["starch"],"aliases":[]},{"key":"water_g","legacy":"water_g","unit":"g","usda":["1051"],"off":["water"],"aliases":[]},{"key":"alcohol_g","legacy":"alcohol_g","unit":"g","usda":["1018"],"off":[],"aliases":[]},{"key":"sugar_alcohols","legacy":"sugar_alcohols","unit":"g","usda":[],"off":["sugar-alcohols"],"aliases":[]}]'::jsonb) LOOP
  SELECT preferred.key INTO provider_key FROM jsonb_array_elements_text(CASE e->>'provider' WHEN 'usda' THEN m->'usda' ELSE m->'off' END) WITH ORDINALITY preferred(key,priority)
  WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(e->'nutrients') f WHERE f->>'provider_key'=CASE e->>'provider' WHEN 'usda' THEN preferred.key ELSE preferred.key||'_100g' END AND f->>'status'='valid' AND f#>>'{basis,kind}'='per_100g') ORDER BY preferred.priority LIMIT 1;
  IF provider_key IS NULL THEN CONTINUE; END IF;
  IF macrogoal_food_private.nutrient_occupied_v1(item - ARRAY[m->>'key',m->>'legacy'],m) THEN RETURN false; END IF;
  FOR n IN SELECT * FROM jsonb_array_elements(e->'nutrients') f WHERE f->>'provider_key'=CASE e->>'provider' WHEN 'usda' THEN provider_key ELSE provider_key||'_100g' END AND f->>'status'='valid' AND f#>>'{basis,kind}'='per_100g' LOOP
   FOREACH old_value IN ARRAY ARRAY[item->(m->>'key'),item->(m->>'legacy')] LOOP
    IF old_value IS NULL OR old_value='null'::jsonb THEN CONTINUE; END IF;
    IF jsonb_typeof(old_value)<>'number' OR n->>'unit' NOT IN ('g','mg','mcg') THEN RETURN false; END IF;
    amount:=(n->>'amount')::numeric * (CASE n->>'unit' WHEN 'g' THEN 1000000 WHEN 'mg' THEN 1000 ELSE 1 END) / (CASE m->>'unit' WHEN 'g' THEN 1000000 WHEN 'mg' THEN 1000 ELSE 1 END);
    IF abs((old_value#>>'{}')::numeric-amount)>greatest(0.00000001,abs((old_value#>>'{}')::numeric)*0.000001) THEN RETURN false; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION macrogoal_food_private.claim_refresh_v1(p_food_id uuid,p_expected_revision integer,p_request_id uuid,p_provider text,p_source_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.food_items%ROWTYPE; state macrogoal_food_private.nutrition_refresh_state_v1%ROWTYPE; rev integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_provider IS NULL OR p_provider NOT IN ('usda','openfoodfacts') OR p_source_id IS NULL OR p_source_id !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'invalid_claim' USING ERRCODE='22023'; END IF;
 SELECT * INTO item FROM public.food_items WHERE id=p_food_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE='22023'; END IF;
 IF (CASE p_provider WHEN 'usda' THEN item.usda_fdc_id ELSE item.barcode END) IS DISTINCT FROM p_source_id THEN RETURN '{"status":"identity_conflict"}'::jsonb; END IF;
 SELECT revision INTO rev FROM macrogoal_food_private.nutrition_current WHERE food_id=p_food_id;
 IF coalesce(rev,0)<>p_expected_revision THEN RETURN jsonb_build_object('status','revision_conflict','revision',coalesce(rev,0)); END IF;
 IF EXISTS(SELECT 1 FROM macrogoal_food_private.nutrition_refresh_receipts_v1 WHERE request_id=p_request_id) THEN RETURN '{"status":"already_completed"}'::jsonb; END IF;
 SELECT * INTO state FROM macrogoal_food_private.nutrition_refresh_state_v1 WHERE food_id=p_food_id;
 IF state.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('status','busy','lease_until',state.lease_until); END IF;
 IF state.next_eligible_at>clock_timestamp() THEN RETURN jsonb_build_object('status','fresh','next_eligible_at',state.next_eligible_at); END IF;
 INSERT INTO macrogoal_food_private.nutrition_refresh_state_v1(food_id,provider,source_id,request_id,expected_revision,lease_until)
 VALUES(p_food_id,p_provider,p_source_id,p_request_id,p_expected_revision,clock_timestamp()+interval '2 minutes')
 ON CONFLICT(food_id) DO UPDATE SET provider=excluded.provider,source_id=excluded.source_id,request_id=excluded.request_id,expected_revision=excluded.expected_revision,lease_until=excluded.lease_until;
 UPDATE macrogoal_food_private.nutrition_refresh_state_v1 SET next_eligible_at=clock_timestamp()+interval '1 hour' WHERE food_id=p_food_id;
 RETURN jsonb_build_object('status','claimed','revision',p_expected_revision,'lease_seconds',120);
END $$;
CREATE FUNCTION macrogoal_food_private.refresh_nutrients_v1(p_food_id uuid,p_expected_revision integer,p_request_id uuid,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.food_items%ROWTYPE; patched public.food_items%ROWTYPE; state macrogoal_food_private.nutrition_refresh_state_v1%ROWTYPE; receipt macrogoal_food_private.nutrition_refresh_receipts_v1%ROWTYPE; before_json jsonb; patch jsonb:='{}'; anchor jsonb; m jsonb; amount numeric; reason text; result jsonb; rev integer; ev_rev integer; generic_usda boolean;
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
 PERFORM macrogoal_food_private.validate_nutrient_evidence_v1(p_evidence);
 SELECT * INTO state FROM macrogoal_food_private.nutrition_refresh_state_v1 WHERE food_id=p_food_id;
 IF state.request_id IS DISTINCT FROM p_request_id OR state.expected_revision IS DISTINCT FROM p_expected_revision OR state.lease_until IS NULL OR state.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'missing_or_expired_claim' USING ERRCODE='40001'; END IF;
 SELECT revision INTO rev FROM macrogoal_food_private.nutrition_current WHERE food_id=p_food_id;
 before_json:=to_jsonb(item);anchor:=macrogoal_food_private.canonical_anchor_v1(before_json);
 IF coalesce(rev,0)<>p_expected_revision THEN reason:='revision_conflict';
 ELSIF state.provider IS DISTINCT FROM p_evidence->>'provider' OR state.source_id IS DISTINCT FROM p_evidence->>'source_id' OR (CASE p_evidence->>'provider' WHEN 'usda' THEN item.usda_fdc_id ELSE item.barcode END) IS DISTINCT FROM p_evidence->>'source_id' THEN reason:='source_identity_conflict';
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
 INSERT INTO macrogoal_food_private.nutrition_evidence(food_id,revision,payload) VALUES(p_food_id,ev_rev,p_evidence);
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
 INSERT INTO macrogoal_food_private.nutrition_refresh_receipts_v1(request_id,food_id,expected_revision,evidence,result) VALUES(p_request_id,p_food_id,p_expected_revision,p_evidence,result);
 UPDATE macrogoal_food_private.nutrition_refresh_state_v1 SET lease_until=clock_timestamp(),next_eligible_at=clock_timestamp()+interval '30 days' WHERE food_id=p_food_id;
 RETURN result;
END $$;
CREATE FUNCTION public.claim_food_nutrition_refresh_v1(p_food_id uuid,p_expected_revision integer,p_request_id uuid,p_provider text,p_source_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 RETURN macrogoal_food_private.claim_refresh_v1(p_food_id,p_expected_revision,p_request_id,p_provider,p_source_id);
END $$;
CREATE FUNCTION public.refresh_food_nutrition_v1(p_food_id uuid,p_expected_revision integer,p_request_id uuid,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 RETURN macrogoal_food_private.refresh_nutrients_v1(p_food_id,p_expected_revision,p_request_id,p_evidence);
END $$;

CREATE FUNCTION macrogoal_food_private.read_refresh_state_v1(p_food_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('revision',coalesce(n.revision,0),'captured_at',r.evidence->>'captured_at','next_eligible_at',s.next_eligible_at,'provider',CASE WHEN f.source='usda' THEN 'usda' WHEN f.barcode IS NOT NULL THEN 'openfoodfacts' END,'source_id',CASE WHEN f.source='usda' THEN f.usda_fdc_id ELSE f.barcode END)
 INTO result FROM public.food_items f LEFT JOIN macrogoal_food_private.nutrition_current n ON n.food_id=f.id LEFT JOIN macrogoal_food_private.nutrition_refresh_state_v1 s ON s.food_id=f.id LEFT JOIN macrogoal_food_private.nutrition_refresh_receipts_v1 r ON r.request_id=s.request_id WHERE f.id=p_food_id;
 IF result IS NULL THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.read_food_nutrition_refresh_state_v1(p_food_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 RETURN macrogoal_food_private.read_refresh_state_v1(p_food_id);
END $$;

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
 -- ADDITIVE CAPABILITY: no GUC, public flag, or confirmed_v1 authorization.
 -- Full OLD/NEW image, food, backend PID and transaction must match a private RPC grant.
 IF backend AND EXISTS (
  SELECT 1 FROM macrogoal_food_private.nutrition_enrichment_context_v1 c
  WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
    AND c.food_id=OLD.id AND c.before_row=to_jsonb(OLD) AND c.after_row=to_jsonb(NEW)
 ) AND macrogoal_food_private.missing_nutrient_delta_v1(to_jsonb(OLD),to_jsonb(NEW))
 THEN RETURN NEW; END IF;
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
-- Revoke PUBLIC defaults explicitly. Helpers never exposed to API roles.
REVOKE ALL ON FUNCTION macrogoal_food_private.nutrient_map_v1(),macrogoal_food_private.nutrient_occupied_v1(jsonb,jsonb),macrogoal_food_private.canonical_anchor_v1(jsonb),macrogoal_food_private.missing_nutrient_delta_v1(jsonb,jsonb),macrogoal_food_private.validate_nutrient_evidence_v1(jsonb),macrogoal_food_private.nutrient_value_v1(jsonb,jsonb),macrogoal_food_private.macros_coherent_v1(jsonb,jsonb),macrogoal_food_private.claim_refresh_v1(uuid,integer,uuid,text,text),macrogoal_food_private.refresh_nutrients_v1(uuid,integer,uuid,jsonb),public.claim_food_nutrition_refresh_v1(uuid,integer,uuid,text,text),public.refresh_food_nutrition_v1(uuid,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_food_private.claim_refresh_v1(uuid,integer,uuid,text,text),macrogoal_food_private.refresh_nutrients_v1(uuid,integer,uuid,jsonb),public.claim_food_nutrition_refresh_v1(uuid,integer,uuid,text,text),public.refresh_food_nutrition_v1(uuid,integer,uuid,jsonb) TO service_role;

REVOKE ALL ON FUNCTION macrogoal_food_private.read_refresh_state_v1(uuid),public.read_food_nutrition_refresh_state_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_food_private.read_refresh_state_v1(uuid),public.read_food_nutrition_refresh_state_v1(uuid) TO service_role;

REVOKE ALL ON FUNCTION macrogoal_food_private.optional_nutrition_coherent_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
