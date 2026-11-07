BEGIN;
DO $owner_preflight$ BEGIN
 IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres' AND (rolsuper OR rolbypassrls))
 THEN RAISE EXCEPTION 'mass_privileged_owner_required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='macrogoal_food_private' AND p.proname IN ('guard_food_nutrition_v1','audit_food_nutrition_v1','nutrition_snapshot_v1','claim_refresh_v1','refresh_nutrients_v1','read_refresh_state_v1') AND pg_get_userbyid(p.proowner)<>'postgres')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname='food_items' OR n.nspname='macrogoal_food_private' AND c.relname IN ('nutrition_current','nutrition_changes','nutrition_evidence','nutrition_write_context','nutrition_enrichment_context_v1','nutrition_refresh_state_v1','nutrition_refresh_receipts_v1')) AND pg_get_userbyid(c.relowner)<>'postgres')
 THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF;
END $owner_preflight$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.guard_food_nutrition_v1()'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.guard_food_nutrition_v1()'::regprocedure))<>'ae00147e4dcf660a7575a74e9ca62ad8' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.audit_food_nutrition_v1()'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.audit_food_nutrition_v1()'::regprocedure))<>'9f35470f0ac6944adc5332aeb2284f3b' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.nutrition_snapshot_v1(jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.nutrition_snapshot_v1(jsonb)'::regprocedure))<>'a607246db719d928d9ccefed9377b6f4' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.canonical_anchor_v1(jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.canonical_anchor_v1(jsonb)'::regprocedure))<>'730a0ccc71e25933220aeea9f010e1c0' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.macros_coherent_v1(jsonb,jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.macros_coherent_v1(jsonb,jsonb)'::regprocedure))<>'543e5c1f8f5d1a74695485409f9070f4' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.optional_nutrition_coherent_v1(jsonb,jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.optional_nutrition_coherent_v1(jsonb,jsonb)'::regprocedure))<>'91dcfb46e70694791e711793d86c2ce0' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.missing_nutrient_delta_v1(jsonb,jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.missing_nutrient_delta_v1(jsonb,jsonb)'::regprocedure))<>'ff9b04a730873a73cf0c62a8606de537' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.validate_nutrient_evidence_v1(jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.validate_nutrient_evidence_v1(jsonb)'::regprocedure))<>'3bf90f6a42d3b401cc89c856d81f845b' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.nutrient_value_v1(jsonb,jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.nutrient_value_v1(jsonb,jsonb)'::regprocedure))<>'0e98650b70b7cd954d529e46163501e9' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.nutrient_map_v1()'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.nutrient_map_v1()'::regprocedure))<>'eb00d11456cd2461a6d806d394462cb5' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.claim_refresh_v1(uuid,integer,uuid,text,text)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.claim_refresh_v1(uuid,integer,uuid,text,text)'::regprocedure))<>'1621919c405d20938e0f6e5805fa98da' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.refresh_nutrients_v1(uuid,integer,uuid,jsonb)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.refresh_nutrients_v1(uuid,integer,uuid,jsonb)'::regprocedure))<>'9c5bd492146343e3dd54fa44837c86c6' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
DO $$ BEGIN IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='macrogoal_food_private.read_refresh_state_v1(uuid)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'mass_dependency_owner_drift'; END IF; END $$;
DO $$ BEGIN IF md5(pg_get_functiondef('macrogoal_food_private.read_refresh_state_v1(uuid)'::regprocedure))<>'1dc61faa91e66722882fe98d6f0935b2' THEN RAISE EXCEPTION 'mass_dependency_drift_stop'; END IF; END $$;
-- LOCAL REVIEW CANDIDATE ONLY. Additive AFTER the frozen nutrition-v1 candidate.
-- No food rows are migrated, overwritten, or re-anchored. No guard/audit changes here.
CREATE FUNCTION macrogoal_food_private.canonical_gtin_mass_v1(code text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE i integer; j integer:=0; total integer:=0;
BEGIN
 IF code !~ '^[0-9]{12,13}$' THEN RETURN NULL; END IF;
 FOR i IN REVERSE length(code)-1..1 LOOP
  total:=total+substring(code,i,1)::integer*CASE WHEN j%2=0 THEN 3 ELSE 1 END;j:=j+1;
 END LOOP;
 IF (10-total%10)%10<>right(code,1)::integer THEN RETURN NULL; END IF;
 RETURN CASE WHEN length(code)=12 THEN '0'||code ELSE code END;
END $$;
-- Acquire the food write lock before historical registry capture and keep it through
-- trigger installation/COMMIT. No old food row is updated. Abort, do not wait forever.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.food_items IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE macrogoal_food_private.food_identity_reservations_mass_v1(
 canonical_code text PRIMARY KEY CHECK(macrogoal_food_private.canonical_gtin_mass_v1(canonical_code) IS NOT NULL AND canonical_code=macrogoal_food_private.canonical_gtin_mass_v1(canonical_code)),
 member_food_ids uuid[] NOT NULL CHECK(cardinality(member_food_ids)>=1 AND array_position(member_food_ids,NULL) IS NULL),
 historical_ambiguous boolean NOT NULL,
 touch_revision bigint NOT NULL DEFAULT 1 CHECK(touch_revision>0),
 CHECK(historical_ambiguous=(cardinality(member_food_ids)>1))
);
ALTER TABLE macrogoal_food_private.food_identity_reservations_mass_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.food_identity_reservations_mass_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.food_identity_reservations_mass_v1 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO macrogoal_food_private.food_identity_reservations_mass_v1(canonical_code,member_food_ids,historical_ambiguous)
 SELECT macrogoal_food_private.canonical_gtin_mass_v1(barcode),array_agg(id ORDER BY id),count(*)>1
 FROM public.food_items WHERE macrogoal_food_private.canonical_gtin_mass_v1(barcode) IS NOT NULL
 GROUP BY macrogoal_food_private.canonical_gtin_mass_v1(barcode);

CREATE FUNCTION macrogoal_food_private.reserve_food_identity_mass_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE code text; reservation macrogoal_food_private.food_identity_reservations_mass_v1%ROWTYPE;
BEGIN
 -- Ordinary updates of old duplicate records are intentionally unaffected.
 IF TG_OP='UPDATE' AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode THEN RETURN NEW; END IF;
 code:=macrogoal_food_private.canonical_gtin_mass_v1(NEW.barcode);
 IF code IS NULL THEN RETURN NEW; END IF; -- No trimming/padding of invalid legacy identities.
 IF NEW.id IS NULL THEN RAISE EXCEPTION 'food_identity_id_required' USING ERRCODE='23502'; END IF;
 INSERT INTO macrogoal_food_private.food_identity_reservations_mass_v1 AS locked(canonical_code,member_food_ids,historical_ambiguous)
 VALUES(code,ARRAY[NEW.id],false)
 ON CONFLICT(canonical_code) DO UPDATE SET touch_revision=locked.touch_revision+1
 RETURNING * INTO reservation;
 -- Unique-row update forces a 40001 for stale snapshots rather than reading an old
 -- advisory-lock snapshot. Membership is immutable after migration/first insertion.
 IF reservation.historical_ambiguous OR reservation.member_food_ids IS DISTINCT FROM ARRAY[NEW.id]
 THEN RAISE EXCEPTION 'canonical_package_identity_reserved' USING ERRCODE='23505',CONSTRAINT='food_identity_reservations_mass_v1_pkey'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION macrogoal_food_private.reserve_food_identity_mass_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER identity_reservation_mass_v1 BEFORE INSERT OR UPDATE OF barcode ON public.food_items
 FOR EACH ROW EXECUTE FUNCTION macrogoal_food_private.reserve_food_identity_mass_v1();
-- Replication/import sessions still cannot silently manufacture new alias collisions.
ALTER TABLE public.food_items ENABLE ALWAYS TRIGGER identity_reservation_mass_v1;

CREATE TABLE macrogoal_food_private.off_source_bindings_v1(
 food_id uuid PRIMARY KEY REFERENCES public.food_items(id) ON DELETE RESTRICT,
 canonical_code text UNIQUE NOT NULL CHECK(macrogoal_food_private.canonical_gtin_mass_v1(canonical_code) IS NOT NULL AND canonical_code=macrogoal_food_private.canonical_gtin_mass_v1(canonical_code)),
 provider_code text UNIQUE NOT NULL CHECK(macrogoal_food_private.canonical_gtin_mass_v1(provider_code) IS NOT NULL AND macrogoal_food_private.canonical_gtin_mass_v1(provider_code)=canonical_code),
 source_schema text NOT NULL CHECK(source_schema='off_legacy_serving_v1'),
 initial_identity jsonb NOT NULL,
 creation_request_id uuid UNIQUE NOT NULL,
 captured_at timestamptz NOT NULL
);
CREATE TABLE macrogoal_food_private.off_creation_receipts_v1(
 request_id uuid PRIMARY KEY, expected_code text NOT NULL,evidence jsonb NOT NULL,
 food_id uuid REFERENCES public.food_items(id) ON DELETE RESTRICT,
 result jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE macrogoal_food_private.off_source_bindings_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.off_source_bindings_v1 FORCE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.off_creation_receipts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.off_creation_receipts_v1 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.off_source_bindings_v1,macrogoal_food_private.off_creation_receipts_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION macrogoal_food_private.derive_off_mass_v1(e jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s jsonb; nutrients jsonb; k text; v jsonb; n jsonb; base text; unit_ text; display_unit text; factor numeric; logical text;
 gram_weight numeric; amount numeric; amount100 numeric; other numeric; code text; m jsonb; derived jsonb:='[]'; result jsonb;
 masses text[]:=ARRAY['fat','proteins','carbohydrates','fiber','sugars','salt','saturated-fat','trans-fat','polyunsaturated-fat','monounsaturated-fat','added-sugars','soluble-fiber','insoluble-fiber','starch','water','cholesterol','calcium','iron','magnesium','phosphorus','potassium','sodium','zinc','copper','manganese','selenium','vitamin-c','vitamin-b1','vitamin-b2','vitamin-pp','vitamin-b6','vitamin-b9','vitamin-b12','vitamin-e','vitamin-d','vitamin-k'
 ];
BEGIN
 IF NOT coalesce(jsonb_typeof(e)='object' AND e->'version'='3'::jsonb AND e->>'provider'='openfoodfacts' AND jsonb_typeof(e->'source_id')='string' AND jsonb_typeof(e->'snapshot')='object' AND octet_length(e::text)<=65536,false)
 OR (SELECT count(*) FROM jsonb_object_keys(e))<>5 OR NOT(e ?& ARRAY['version','provider','source_id','captured_at','snapshot']) THEN RAISE EXCEPTION 'invalid_mass_envelope' USING ERRCODE='22023'; END IF;
 s:=e->'snapshot';code:=macrogoal_food_private.canonical_gtin_mass_v1(s->>'code');
 IF code IS NULL OR jsonb_typeof(s->'code') IS DISTINCT FROM 'string' OR s->>'code' IS DISTINCT FROM e->>'source_id' THEN RAISE EXCEPTION 'invalid_package_identity' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(s))<>11 OR NOT(s ?& ARRAY['code','product_name','brands','ingredients_text','nutrition_data_per','nutrition_data_prepared_per','preparation','serving_quantity','serving_quantity_unit','serving_size','nutriments']) THEN RAISE EXCEPTION 'invalid_mass_snapshot_shape' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['product_name','brands','ingredients_text'] LOOP
  IF jsonb_typeof(s->k) IS DISTINCT FROM 'string' OR length(s->>k) NOT BETWEEN 1 AND (CASE WHEN k='ingredients_text' THEN 4096 ELSE 160 END) OR s->>k<>btrim(s->>k) OR s->>k ~ '[[:cntrl:]<>]' THEN RAISE EXCEPTION 'incomplete_formulation_identity' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF s->>'nutrition_data_per' IS DISTINCT FROM 'serving' OR s->'nutrition_data_prepared_per' IS DISTINCT FROM 'null'::jsonb OR s->'preparation' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'unsupported_preparation_or_basis' USING ERRCODE='22023'; END IF;
 IF s->>'serving_quantity_unit' IS DISTINCT FROM 'g' OR jsonb_typeof(s->'serving_quantity') NOT IN ('string','number') OR s->>'serving_quantity' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN RAISE EXCEPTION 'mass_not_explicit' USING ERRCODE='22023'; END IF;
 gram_weight:=(s->>'serving_quantity')::numeric;
 IF gram_weight<=0 OR gram_weight>10000 OR jsonb_typeof(s->'serving_size') IS DISTINCT FROM 'string' OR s->>'serving_size' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)? g$' THEN RAISE EXCEPTION 'inconsistent_mass_label' USING ERRCODE='22023'; END IF;
 IF split_part(s->>'serving_size',' ',1)::numeric<>gram_weight THEN RAISE EXCEPTION 'inconsistent_mass_label' USING ERRCODE='22023'; END IF;
 nutrients:=s->'nutriments';
 IF jsonb_typeof(nutrients) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_nutriments' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(nutrients)) NOT BETWEEN 4 AND 512 THEN RAISE EXCEPTION 'invalid_nutriments' USING ERRCODE='22023'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(nutrients) LOOP
  IF k !~ '^[a-z0-9][a-z0-9_-]{0,79}$' OR k LIKE '%\_prepared%' ESCAPE '\' THEN RAISE EXCEPTION 'unsupported_nutrient_namespace' USING ERRCODE='22023'; END IF;
  IF k ~ '_(unit|modifier)$' THEN
   IF v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR length(v#>>'{}')>24 OR v#>>'{}' ~ '[[:cntrl:]<>]') THEN RAISE EXCEPTION 'invalid_nutrient_metadata' USING ERRCODE='22023'; END IF;
  ELSIF v<>'null'::jsonb THEN
   IF jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'invalid_nutrient_amount' USING ERRCODE='22023'; END IF;
   IF abs((v#>>'{}')::numeric)>1000000000 THEN RAISE EXCEPTION 'invalid_nutrient_amount' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 FOREACH base IN ARRAY ARRAY['energy-kcal','proteins','carbohydrates','fat'] LOOP
  IF jsonb_typeof(nutrients->(base||'_serving')) IS DISTINCT FROM 'number' OR (nutrients->>(base||'_serving'))::numeric<0 THEN RAISE EXCEPTION 'incomplete_core_serving' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH base IN ARRAY masses||ARRAY['energy-kcal','energy-kj','energy'] LOOP
  IF NOT(nutrients ? (base||'_serving')) OR nutrients->(base||'_serving')='null'::jsonb THEN CONTINUE; END IF;
  amount:=(nutrients->>(base||'_serving'))::numeric;IF amount<0 THEN CONTINUE; END IF;
  display_unit:=lower(nutrients->>(base||'_unit'));
  IF display_unit IN ('ug','μg','µg') THEN display_unit:='mcg'; END IF;
  IF display_unit IS NOT NULL AND NOT(CASE WHEN base IN ('energy','energy-kj','energy-kcal') THEN display_unit IN ('kcal','kj') ELSE display_unit IN ('g','mg','mcg') END) THEN RAISE EXCEPTION 'unsupported_source_unit' USING ERRCODE='22023'; END IF;
  IF nutrients ? base AND nutrients->base IS DISTINCT FROM nutrients->(base||'_serving') THEN RAISE EXCEPTION 'contradictory_original_amount' USING ERRCODE='22023'; END IF;
  IF nutrients ? (base||'_value') AND display_unit IS NOT NULL THEN
   IF jsonb_typeof(nutrients->(base||'_value')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'contradictory_original_amount' USING ERRCODE='22023'; END IF;
   other:=(nutrients->>(base||'_value'))::numeric;
   factor:=CASE WHEN base='energy-kcal' THEN CASE WHEN display_unit='kj' THEN 1/4.184 ELSE 1 END WHEN base IN ('energy','energy-kj') THEN CASE WHEN display_unit='kcal' THEN 4.184 ELSE 1 END ELSE CASE display_unit WHEN 'g' THEN 1 WHEN 'mg' THEN .001 ELSE .000001 END END;
   IF other<0 OR abs(other*factor-amount)>greatest(0.00000001,abs(amount)*0.000001) THEN RAISE EXCEPTION 'contradictory_original_amount' USING ERRCODE='22023'; END IF;
  END IF;
  IF coalesce(nutrients->>(base||'_modifier'),'')<>'' THEN RAISE EXCEPTION 'qualified_nutrient_value' USING ERRCODE='22023'; END IF;
  amount100:=amount*100/gram_weight;
  IF amount100>(CASE WHEN base='energy-kcal' THEN 1000 WHEN base IN ('energy','energy-kj') THEN 4184 ELSE 100 END) THEN RAISE EXCEPTION 'implausible_mass_nutrition' USING ERRCODE='22023'; END IF;
  IF nutrients ? (base||'_100g') THEN
   IF jsonb_typeof(nutrients->(base||'_100g')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'contradictory_nutrient_basis' USING ERRCODE='22023'; END IF;
   other:=(nutrients->>(base||'_100g'))::numeric;
   IF other<0 OR abs(other-amount100)>greatest(0.00000001,abs(amount100)*0.000001) THEN RAISE EXCEPTION 'contradictory_nutrient_basis' USING ERRCODE='22023'; END IF;
  END IF;
  unit_:=CASE WHEN base='energy-kcal' THEN 'kcal' WHEN base IN ('energy','energy-kj') THEN 'kj' ELSE 'g' END;
  SELECT value->>'key' INTO logical FROM jsonb_array_elements(macrogoal_food_private.nutrient_map_v1()) WHERE value->'off' ? base;
  logical:=coalesce(logical,'off_'||base);
  derived:=derived||jsonb_build_array(jsonb_build_object('key',logical,'provider_key',base||'_100g','amount',amount100,'unit',unit_,'label_unit',nutrients->(base||'_unit'),'basis',jsonb_build_object('kind','per_100g'),'source',jsonb_build_object('provider','openfoodfacts','source_id',s->>'code'),'captured_at',e->'captured_at','status','valid'));
 END LOOP;
 FOREACH base IN ARRAY ARRAY['energy','energy-kj'] LOOP
  IF nutrients ? (base||'_serving') THEN
   IF jsonb_typeof(nutrients->(base||'_serving')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'contradictory_energy' USING ERRCODE='22023'; END IF;
   other:=(nutrients->>(base||'_serving'))::numeric;amount:=(nutrients->>'energy-kcal_serving')::numeric*4.184;
   IF other<0 OR abs(other-amount)>greatest(0.1,amount*0.01) THEN RAISE EXCEPTION 'contradictory_energy' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 result:=jsonb_build_object('version',2,'provider','openfoodfacts','source_id',s->>'code','captured_at',e->'captured_at','basis',jsonb_build_object('kind','per_100g'),'identity',jsonb_build_object('description',s->>'product_name','brand',s->>'brands','ingredients_text',s->>'ingredients_text','formulation',s->>'ingredients_text','preparation','as_sold','data_type',null),'nutrients',derived,'conflicts','[]'::jsonb);
 PERFORM macrogoal_food_private.validate_nutrient_evidence_v1(result);
 RETURN result; -- Internal computation only. The immutable evidence ledger stores e unchanged.
END $$;

CREATE FUNCTION macrogoal_food_private.source_matches_mass_v1(item jsonb,provider text,code text) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN provider='usda' THEN item->>'usda_fdc_id'=code
 WHEN EXISTS(SELECT 1 FROM macrogoal_food_private.off_source_bindings_v1 b WHERE b.food_id=(item->>'id')::uuid)
 THEN EXISTS(SELECT 1 FROM macrogoal_food_private.off_source_bindings_v1 b WHERE b.food_id=(item->>'id')::uuid AND b.provider_code=code AND b.canonical_code=item->>'barcode' AND item->>'source'='openfoodfacts')
 ELSE item->>'barcode'=code END
$$;

CREATE FUNCTION macrogoal_food_private.create_off_mass_v1(p_request_id uuid,p_expected_code text,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 e:=macrogoal_food_private.derive_off_mass_v1(p_evidence);s:=p_evidence->'snapshot';code:=macrogoal_food_private.canonical_gtin_mass_v1(s->>'code');
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
   (s#>>'{nutriments,energy-kcal_serving}')::numeric*100/(s->>'serving_quantity')::numeric,
   (s#>>'{nutriments,proteins_serving}')::numeric*100/(s->>'serving_quantity')::numeric,
   (s#>>'{nutriments,carbohydrates_serving}')::numeric*100/(s->>'serving_quantity')::numeric,
   (s#>>'{nutriments,fat_serving}')::numeric*100/(s->>'serving_quantity')::numeric,
   (s->>'serving_quantity')::numeric,s->>'serving_quantity','g',false,false,
   item.calcium_mg,item.calcium,item.iron_mg,item.iron,item.magnesium_mg,item.magnesium,item.phosphorus_mg,item.phosphorus,item.potassium_mg,item.potassium,item.sodium_mg,item.sodium,item.zinc_mg,item.zinc,item.copper_mg,item.copper,item.manganese_mg,item.manganese,item.selenium_mcg,item.selenium,item.vitamin_c_mg,item.vitamin_c,item.vitamin_b1_mg,item.vitamin_b1,item.vitamin_b2_mg,item.vitamin_b2,item.vitamin_b3_mg,item.vitamin_b3,item.vitamin_b6_mg,item.vitamin_b6,item.folate_mcg,item.vitamin_b9,item.vitamin_b12_mcg,item.vitamin_b12,item.vitamin_e_mg,item.vitamin_e,item.vitamin_d_mcg,item.vitamin_d,item.vitamin_k_mcg,item.vitamin_k,item.fiber,item.sugar_g,item.sugar,item.saturated_fat_g,item.saturated_fat,item.trans_fat_g,item.trans_fat,item.polyunsaturated_fat_g,item.polyunsaturated_fat,item.monounsaturated_fat_g,item.monounsaturated_fat,item.cholesterol_mg,item.cholesterol,item.added_sugar_g,item.added_sugars,item.soluble_fiber_g,item.soluble_fiber,item.insoluble_fiber_g,item.insoluble_fiber,item.starch,item.water_g,item.alcohol_g,item.sugar_alcohols
  ) RETURNING * INTO item;
  IF FOUND THEN
   SELECT revision INTO revision_ FROM macrogoal_food_private.nutrition_current WHERE food_id=item.id;
   IF revision_ IS NULL THEN RAISE EXCEPTION 'nutrition_audit_missing'; END IF;
   INSERT INTO macrogoal_food_private.nutrition_evidence(food_id,revision,payload) VALUES(item.id,1,p_evidence);
   INSERT INTO macrogoal_food_private.off_source_bindings_v1 VALUES(item.id,code,s->>'code','off_legacy_serving_v1',e->'identity',p_request_id,(e->>'captured_at')::timestamptz);
   INSERT INTO macrogoal_food_private.nutrition_refresh_state_v1 VALUES(item.id,'openfoodfacts',s->>'code',p_request_id,revision_,clock_timestamp(),clock_timestamp()+interval '30 days',e->'identity',macrogoal_food_private.canonical_anchor_v1(to_jsonb(item)));
   result:=jsonb_build_object('status','created','food_item',to_jsonb(item),'revision',revision_);
  END IF;
 END IF;
 IF result IS NULL THEN result:=jsonb_build_object('status','existing','food_item',to_jsonb(item)); END IF;
 INSERT INTO macrogoal_food_private.off_creation_receipts_v1(request_id,expected_code,evidence,food_id,result) VALUES(p_request_id,p_expected_code,p_evidence,item.id,result);
 RETURN result;
END $$;
CREATE FUNCTION public.create_off_mass_food_v1(p_request_id uuid,p_expected_code text,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 RETURN macrogoal_food_private.create_off_mass_v1(p_request_id,p_expected_code,p_evidence);
END $$;

CREATE OR REPLACE FUNCTION macrogoal_food_private.claim_refresh_v1(p_food_id uuid,p_expected_revision integer,p_request_id uuid,p_provider text,p_source_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.food_items%ROWTYPE; state macrogoal_food_private.nutrition_refresh_state_v1%ROWTYPE; rev integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_provider IS NULL OR p_provider NOT IN ('usda','openfoodfacts') OR p_source_id IS NULL OR p_source_id !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'invalid_claim' USING ERRCODE='22023'; END IF;
 SELECT * INTO item FROM public.food_items WHERE id=p_food_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE='22023'; END IF;
 IF NOT coalesce(macrogoal_food_private.source_matches_mass_v1(to_jsonb(item),p_provider,p_source_id),false) THEN RETURN '{"status":"identity_conflict"}'::jsonb; END IF;
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
CREATE OR REPLACE FUNCTION macrogoal_food_private.refresh_nutrients_v1(p_food_id uuid,p_expected_revision integer,p_request_id uuid,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF p_evidence->'version'='3'::jsonb THEN p_evidence:=macrogoal_food_private.derive_off_mass_v1(p_evidence); END IF;
 PERFORM macrogoal_food_private.validate_nutrient_evidence_v1(p_evidence);
 SELECT * INTO state FROM macrogoal_food_private.nutrition_refresh_state_v1 WHERE food_id=p_food_id;
 IF state.request_id IS DISTINCT FROM p_request_id OR state.expected_revision IS DISTINCT FROM p_expected_revision OR state.lease_until IS NULL OR state.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'missing_or_expired_claim' USING ERRCODE='40001'; END IF;
 SELECT revision INTO rev FROM macrogoal_food_private.nutrition_current WHERE food_id=p_food_id;
 before_json:=to_jsonb(item);anchor:=macrogoal_food_private.canonical_anchor_v1(before_json);
 IF coalesce(rev,0)<>p_expected_revision THEN reason:='revision_conflict';
 ELSIF state.provider IS DISTINCT FROM p_evidence->>'provider' OR state.source_id IS DISTINCT FROM p_evidence->>'source_id' OR NOT coalesce(macrogoal_food_private.source_matches_mass_v1(to_jsonb(item),p_evidence->>'provider',p_evidence->>'source_id'),false) THEN reason:='source_identity_conflict';
 ELSIF EXISTS(SELECT 1 FROM macrogoal_food_private.off_source_bindings_v1 b WHERE b.food_id=p_food_id) AND original_evidence->'version' IS DISTINCT FROM '3'::jsonb THEN reason:='mass_proof_required';
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
END $$;
CREATE OR REPLACE FUNCTION macrogoal_food_private.read_refresh_state_v1(p_food_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('revision',coalesce(n.revision,0),'captured_at',coalesce(r.evidence->>'captured_at',b.captured_at::text),'mass_bound',b.food_id IS NOT NULL,'next_eligible_at',s.next_eligible_at,'provider',CASE WHEN f.source='usda' THEN 'usda' WHEN f.barcode IS NOT NULL THEN 'openfoodfacts' END,'source_id',CASE WHEN f.source='usda' THEN f.usda_fdc_id ELSE coalesce(b.provider_code,f.barcode) END)
 INTO result FROM public.food_items f LEFT JOIN macrogoal_food_private.nutrition_current n ON n.food_id=f.id LEFT JOIN macrogoal_food_private.nutrition_refresh_state_v1 s ON s.food_id=f.id LEFT JOIN macrogoal_food_private.nutrition_refresh_receipts_v1 r ON r.request_id=s.request_id LEFT JOIN macrogoal_food_private.off_source_bindings_v1 b ON b.food_id=f.id WHERE f.id=p_food_id;
 IF result IS NULL THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION macrogoal_food_private.canonical_gtin_mass_v1(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION macrogoal_food_private.derive_off_mass_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION macrogoal_food_private.source_matches_mass_v1(jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION macrogoal_food_private.create_off_mass_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_food_private.canonical_gtin_mass_v1(text) TO service_role,authenticated,anon;
GRANT EXECUTE ON FUNCTION macrogoal_food_private.create_off_mass_v1(uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.create_off_mass_food_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_off_mass_food_v1(uuid,text,jsonb) TO service_role;
COMMIT;
