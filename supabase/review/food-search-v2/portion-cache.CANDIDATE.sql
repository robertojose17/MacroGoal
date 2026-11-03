-- SOURCE CANDIDATE ONLY: explicit activation approval required.
-- No existing food_items policies, nutrients, user data or identifiers are changed.
BEGIN;
CREATE SCHEMA IF NOT EXISTS macrogoal_food_private;
REVOKE ALL ON SCHEMA macrogoal_food_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA macrogoal_food_private TO service_role;
CREATE TABLE macrogoal_food_private.usda_portions (
 fdc_id text PRIMARY KEY CHECK (fdc_id ~ '^[0-9]{1,20}$'),
 payload jsonb NOT NULL CHECK (COALESCE((
  jsonb_typeof(payload)='object' AND payload->>'provider'='usda'
  AND payload->>'version'='1' AND payload->>'fdcId'=fdc_id
  AND jsonb_typeof(payload->'portions')='array'
  AND jsonb_array_length(payload->'portions') BETWEEN 1 AND 64
 ),false)),
 fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE macrogoal_food_private.usda_portions ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.usda_portions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.usda_portions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON macrogoal_food_private.usda_portions TO service_role;

CREATE FUNCTION public.read_usda_portions_v1(p_fdc_ids text[])
RETURNS TABLE(fdc_id text,payload jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF coalesce(cardinality(p_fdc_ids),0) NOT BETWEEN 1 AND 100 OR EXISTS(
  SELECT 1 FROM unnest(p_fdc_ids) x WHERE x IS NULL OR x !~ '^[0-9]{1,20}$'
 ) THEN RAISE EXCEPTION 'invalid identifiers' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT c.fdc_id,c.payload FROM macrogoal_food_private.usda_portions c
  WHERE c.fdc_id=ANY(p_fdc_ids) AND c.fetched_at > now()-interval '30 days';
END;
$fn$;
CREATE FUNCTION public.record_usda_portions_v1(p_fdc_id text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v jsonb;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(p_fdc_id ~ '^[0-9]{1,20}$' AND jsonb_typeof(p_payload)='object'
  AND p_payload->>'provider'='usda' AND p_payload->>'version'='1'
  AND p_payload->>'fdcId'=p_fdc_id AND length(p_payload->>'foodDescription') BETWEEN 1 AND 160
  AND jsonb_typeof(p_payload->'portions')='array'
  AND jsonb_array_length(p_payload->'portions') BETWEEN 1 AND 64
  AND octet_length(p_payload::text)<=32768,false)
 THEN RAISE EXCEPTION 'invalid portion provenance' USING ERRCODE='22023'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_payload->'portions') LOOP
  IF NOT coalesce(jsonb_typeof(v)='object' AND jsonb_typeof(v->'grams')='number'
   AND (v->>'grams')::numeric > 0 AND (v->>'grams')::numeric <= 100000
   AND jsonb_typeof(v->'amount')='number' AND (v->>'amount')::numeric > 0
   AND (v->>'amount')::numeric <= 100000
   AND length(v->>'description') BETWEEN 1 AND 160,false)
  THEN RAISE EXCEPTION 'invalid portion' USING ERRCODE='22023'; END IF;
 END LOOP;
 INSERT INTO macrogoal_food_private.usda_portions(fdc_id,payload) VALUES(p_fdc_id,p_payload)
  ON CONFLICT(fdc_id) DO UPDATE SET payload=excluded.payload,fetched_at=now();
END;
$fn$;
REVOKE ALL ON FUNCTION public.read_usda_portions_v1(text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_usda_portions_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_usda_portions_v1(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_usda_portions_v1(text,jsonb) TO service_role;
COMMIT;
