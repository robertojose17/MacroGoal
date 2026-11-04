-- CANDIDATE ONLY. Requires separate review and explicit activation approval.
-- Append-only provider facts; no food_items/history/policy updates in this migration.
BEGIN;
CREATE TABLE macrogoal_food_private.nutrition_evidence (
 food_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(food_id,revision)
);
ALTER TABLE macrogoal_food_private.nutrition_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.nutrition_evidence FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.nutrition_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON macrogoal_food_private.nutrition_evidence TO service_role;
CREATE FUNCTION public.record_food_nutrition_evidence_v1(p_food_id uuid,p_expected_revision integer,p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
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
$fn$;
REVOKE ALL ON FUNCTION public.record_food_nutrition_evidence_v1(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_food_nutrition_evidence_v1(uuid,integer,jsonb) TO service_role;
COMMIT;
-- This stores evidence only. It is NOT a global correction lock or canonical merge.
-- Integrate the guarded correction/refresh writer before activating canonical updates.
-- No user/account IDs, photo URLs or provider credentials belong in payload.
