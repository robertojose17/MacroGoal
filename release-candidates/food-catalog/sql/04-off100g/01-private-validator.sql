-- REVIEW ONLY. Not deployed. New private pure validator; no v3 changes.
-- Requires existing canonical_gtin_mass_v1. Not a creation/refresh RPC.
CREATE FUNCTION macrogoal_food_private.derive_off_100g_v4(e jsonb, expected_code text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE s jsonb; n jsonb; k text; val jsonb; base text; amt numeric; grams numeric;
 label_parts text[]; label_ text; unit_ text; source_unit text; factor numeric;
 result jsonb:='[]'::jsonb; state_ text; core text[]:=ARRAY['energy-kcal','proteins','carbohydrates','fat'];
 bases text[]:=ARRAY['fat','proteins','carbohydrates','fiber','sugars','salt','saturated-fat','trans-fat','polyunsaturated-fat','monounsaturated-fat','added-sugars','soluble-fiber','insoluble-fiber','starch','water','cholesterol','calcium','iron','magnesium','phosphorus','potassium','sodium','zinc','copper','manganese','selenium','vitamin-c','vitamin-b1','vitamin-b2','vitamin-pp','vitamin-b6','vitamin-b9','vitamin-b12','vitamin-e','vitamin-d','vitamin-k','energy-kcal','energy-kj','energy'];
BEGIN
 IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR e->'version' IS DISTINCT FROM '4'::jsonb
 OR e->>'provider' IS DISTINCT FROM 'openfoodfacts' OR jsonb_typeof(e->'snapshot') IS DISTINCT FROM 'object'
 OR NOT(e ?& ARRAY['version','provider','source_id','captured_at','snapshot'])
 OR (SELECT count(*) FROM jsonb_object_keys(e))<>5 OR octet_length(e::text)>65536
 THEN RAISE EXCEPTION 'invalid_envelope' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(e->'captured_at') IS DISTINCT FROM 'string' OR NOT isfinite((e->>'captured_at')::timestamptz)
 THEN RAISE EXCEPTION 'invalid_capture_time' USING ERRCODE='22023'; END IF;
 s:=e->'snapshot';
 IF (SELECT count(*) FROM jsonb_object_keys(s))<>11 OR NOT(s ?& ARRAY['code','product_name','brands','ingredients_text','nutrition_data_per','nutrition_data_prepared_per','preparation','serving_quantity','serving_quantity_unit','serving_size','nutriments'])
 THEN RAISE EXCEPTION 'invalid_snapshot_shape' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(s->'code') IS DISTINCT FROM 'string' OR s->>'code' IS DISTINCT FROM e->>'source_id'
 OR macrogoal_food_private.canonical_gtin_mass_v1(s->>'code') IS NULL
 OR macrogoal_food_private.canonical_gtin_mass_v1(s->>'code') IS DISTINCT FROM macrogoal_food_private.canonical_gtin_mass_v1(expected_code)
 THEN RAISE EXCEPTION 'identity_mismatch' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['product_name','brands','ingredients_text'] LOOP
  IF jsonb_typeof(s->k) IS DISTINCT FROM 'string' OR length(s->>k) NOT BETWEEN 1 AND (CASE WHEN k='ingredients_text' THEN 4096 ELSE 160 END)
  OR s->>k<>btrim(s->>k) OR s->>k ~ '[[:cntrl:]<>]' THEN RAISE EXCEPTION 'incomplete_formulation_identity' USING ERRCODE='22023'; END IF;
 END LOOP;
 -- Prepared_per alone is metadata. Prepared namespaces are retained but excluded below.
 IF s->>'nutrition_data_per' IS DISTINCT FROM '100g' OR s->'preparation' IS DISTINCT FROM 'null'::jsonb
 OR NOT(s->'nutrition_data_prepared_per'='null'::jsonb OR s->>'nutrition_data_prepared_per' IN ('100g','serving'))
 THEN RAISE EXCEPTION 'unsupported_preparation_or_basis' USING ERRCODE='22023'; END IF;
 IF s->>'serving_quantity_unit' IS DISTINCT FROM 'g' OR jsonb_typeof(s->'serving_quantity') NOT IN ('number','string')
 OR s->>'serving_quantity' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN RAISE EXCEPTION 'mass_not_explicit' USING ERRCODE='22023'; END IF;
 grams:=(s->>'serving_quantity')::numeric;
 IF grams<=0 OR grams>10000 THEN RAISE EXCEPTION 'invalid_mass' USING ERRCODE='22023'; END IF;
 label_:=s->>'serving_size';
 IF jsonb_typeof(s->'serving_size') IS DISTINCT FROM 'string' OR length(label_)>160 OR label_ ~ '[[:cntrl:]<>]' THEN RAISE EXCEPTION 'invalid_mass_label' USING ERRCODE='22023'; END IF;
 IF label_ ~ '^(0|[1-9][0-9]*)(\.[0-9]+)? g$' THEN
  IF split_part(label_,' ',1)::numeric<>grams THEN RAISE EXCEPTION 'mass_label_mismatch' USING ERRCODE='22023'; END IF;
 ELSE
  label_parts:=regexp_match(label_,'^([A-Za-z0-9 ./-]+) \(((?:0|[1-9][0-9]*)(?:\.[0-9]+)?) g\)$');
  IF label_parts IS NULL THEN RAISE EXCEPTION 'ambiguous_mass_label' USING ERRCODE='22023'; END IF;
  IF label_parts[1] ~* '\m(g|kg|mg|grams?)\M' THEN RAISE EXCEPTION 'multiple_mass_declarations' USING ERRCODE='22023'; END IF;
  IF label_parts[2]::numeric<>grams THEN RAISE EXCEPTION 'mass_label_mismatch' USING ERRCODE='22023'; END IF;
 END IF;
 n:=s->'nutriments';
 IF jsonb_typeof(n) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(n)) NOT BETWEEN 4 AND 512 THEN RAISE EXCEPTION 'invalid_nutrients' USING ERRCODE='22023'; END IF;
 FOR k,val IN SELECT * FROM jsonb_each(n) LOOP
  IF k !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN RAISE EXCEPTION 'unsupported_nutrient_namespace' USING ERRCODE='22023'; END IF;
  IF k ~ '_(unit|label|modifier)$' THEN
   IF val<>'null'::jsonb AND (jsonb_typeof(val)<>'string' OR length(val#>>'{}')>160 OR val#>>'{}' ~ '[[:cntrl:]<>]') THEN RAISE EXCEPTION 'invalid_nutrient_metadata' USING ERRCODE='22023'; END IF;
  ELSIF val<>'null'::jsonb THEN
   IF jsonb_typeof(val)<>'number' OR (val#>>'{}')::numeric<0 OR (val#>>'{}')::numeric>1000000000 THEN RAISE EXCEPTION 'invalid_nutrient_amount' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 FOREACH base IN ARRAY core LOOP
  IF jsonb_typeof(n->(base||'_100g')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'incomplete_core_100g' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH base IN ARRAY bases LOOP
  unit_:=CASE WHEN base='energy-kcal' THEN 'kcal' WHEN base IN ('energy','energy-kj') THEN 'kJ' ELSE 'g' END;
  state_:='valid';amt:=NULL;
  IF NOT(n ? (base||'_100g')) OR n->(base||'_100g')='null'::jsonb THEN state_:='missing';
  ELSE
   amt:=(n->>(base||'_100g'))::numeric;
   IF amt>(CASE WHEN base='energy-kcal' THEN 1000 WHEN base IN ('energy','energy-kj') THEN 4184 ELSE 100 END) THEN RAISE EXCEPTION 'implausible_nutrition' USING ERRCODE='22023'; END IF;
   IF coalesce(n->>(base||'_modifier'),'')<>'' THEN
    IF base=ANY(core) THEN RAISE EXCEPTION 'qualified_core' USING ERRCODE='22023'; END IF;
    state_:='qualified';amt:=NULL;
   ELSIF base IN ('energy','energy-kj') AND abs(amt-(n->>'energy-kcal_100g')::numeric*4.184)>greatest(.1,(n->>'energy-kcal_100g')::numeric*4.184*.01) THEN state_:='conflict';amt:=NULL;
   ELSE
    IF n ? base AND n->base IS DISTINCT FROM n->(base||'_100g') THEN RAISE EXCEPTION 'contradictory_original_amount' USING ERRCODE='22023'; END IF;
    source_unit:=lower(n->>(base||'_unit'));factor:=1;
    IF source_unit IN ('ug','μg','µg') THEN source_unit:='mcg'; END IF;
    IF source_unit IS NOT NULL THEN
     IF base IN ('energy','energy-kj','energy-kcal') THEN
      IF source_unit NOT IN ('kj','kcal') THEN RAISE EXCEPTION 'unsupported_source_unit' USING ERRCODE='22023'; END IF;
      factor:=CASE WHEN base='energy-kcal' THEN CASE WHEN source_unit='kj' THEN 1/4.184 ELSE 1 END ELSE CASE WHEN source_unit='kcal' THEN 4.184 ELSE 1 END END;
     ELSE
      IF source_unit NOT IN ('g','mg','mcg') THEN RAISE EXCEPTION 'unsupported_source_unit' USING ERRCODE='22023'; END IF;
      factor:=CASE source_unit WHEN 'g' THEN 1 WHEN 'mg' THEN .001 ELSE .000001 END;
     END IF;
    END IF;
    IF n ? (base||'_value') THEN
     IF source_unit IS NULL OR jsonb_typeof(n->(base||'_value')) IS DISTINCT FROM 'number' OR abs(amt-(n->>(base||'_value'))::numeric*factor)>greatest(.00000001,abs(amt)*.000001) THEN RAISE EXCEPTION 'contradictory_original_amount' USING ERRCODE='22023'; END IF;
    END IF;
    IF n ? (base||'_serving') THEN
     IF jsonb_typeof(n->(base||'_serving')) IS DISTINCT FROM 'number' OR abs(amt*grams/100-(n->>(base||'_serving'))::numeric)>greatest(.00000001,abs(amt*grams/100)*.000001) THEN RAISE EXCEPTION 'contradictory_serving' USING ERRCODE='22023'; END IF;
    END IF;
   END IF;
  END IF;
  result:=result||jsonb_build_array(jsonb_build_object('provider_key',base||'_100g','amount',amt,'status',state_,'unit',unit_));
 END LOOP;
 RETURN jsonb_build_object('canonical_code',macrogoal_food_private.canonical_gtin_mass_v1(s->>'code'),'servingGrams',grams,'basis','per_100g','nutrients',result);
END
$fn$;
REVOKE ALL ON FUNCTION macrogoal_food_private.derive_off_100g_v4(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
