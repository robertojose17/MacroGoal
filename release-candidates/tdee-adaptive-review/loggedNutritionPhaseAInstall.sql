-- PREPARED INSTALLATION SOURCE. NOT EXECUTED OR COMPILED.
-- Phase A only: revision + evidence. NO snapshot projection, fixtures or QA.
-- Pinned source commit 095cb718. Requires fresh baseline review before use.
-- DDL obtains transient table locks; timeout aborts the entire transaction.
BEGIN;
SET LOCAL lock_timeout='250ms';
SET LOCAL statement_timeout='2s';
-- PostgreSQL 17 required. Local transaction budget, not a global server change.
SET LOCAL transaction_timeout='3s';

DO $baseline$
DECLARE f pg_proc;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'reviewed_postgres_executor_required'; END IF;
 SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure('public.observed_get_tdee_snapshot_v1()');
 IF NOT FOUND OR md5(pg_get_functiondef(f.oid))<>'978feafb4d1d480f8d93b76ab0737a98'
 OR f.prosecdef OR f.provolatile<>'s' OR f.proowner<>'postgres'::regrole
 OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
 OR f.proacl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 THEN RAISE EXCEPTION 'snapshot_baseline_requires_review'; END IF;
END $baseline$;

LOCK TABLE public.meal_items IN ACCESS EXCLUSIVE MODE;
DO $absence$
BEGIN
 IF to_regnamespace('macrogoal_logged_nutrition_private') IS NOT NULL
 OR to_regprocedure('public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('public.tdee_register_logged_nutrition_evidence_v1(jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION 'evidence_install_requires_fresh_review'; END IF;
END $absence$;
-- Exact revision candidate body; no intermediate COMMIT.
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
-- Exact evidence candidate body; no intermediate ROLLBACK.
DO $precondition$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.meal_items'::regclass
   AND attname='nutrition_revision' AND atttypid='uuid'::regtype AND NOT attisdropped)
 THEN RAISE EXCEPTION 'nutrition_revision_required'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE t.tgrelid='public.meal_items'::regclass
   AND t.tgname='rotate_nutrition_revision_v1' AND t.tgenabled IN ('O','A')
   AND NOT t.tgisinternal AND t.tgtype=23 AND t.tgconstraint=0
   AND t.tgnargs=0 AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
   AND t.tgfoid=to_regprocedure('macrogoal_readiness_private.rotate_nutrition_revision_v1()')
   AND p.proowner='postgres'::regrole AND p.prokind='f'
   AND NOT p.prosecdef AND p.provolatile='v' AND NOT p.proretset
   AND p.prorettype='trigger'::regtype AND NOT p.proleakproof
   AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
   AND p.prosrc IS NOT DISTINCT FROM $expected_trigger$
BEGIN
 NEW.nutrition_revision := pg_catalog.gen_random_uuid();
 RETURN NEW;
END;
$expected_trigger$
   AND ARRAY(SELECT a.attname::text FROM unnest(t.tgattr::smallint[]) x(attnum)
     JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=x.attnum
     ORDER BY a.attname::text)=ARRAY['calories','carbs','fats','fiber','food_brand','food_id','food_item_id','food_name','grams','is_scheduled','logged_at','meal_id','nutrition_revision','protein','quantity','serving_description','serving_unit']
 ) THEN RAISE EXCEPTION 'nutrition_revision_trigger_requires_review'; END IF;
END $precondition$;

CREATE SCHEMA macrogoal_logged_nutrition_private;
REVOKE ALL ON SCHEMA macrogoal_logged_nutrition_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE macrogoal_logged_nutrition_private.evidence_events (
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.meal_items(id) ON DELETE CASCADE,
 event_version bigint NOT NULL CHECK(event_version BETWEEN 1 AND 9007199254740991),
 request_id uuid NOT NULL,
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN ('active','revoked')),
 revision uuid,
 item_snapshot jsonb NOT NULL CHECK(jsonb_typeof(item_snapshot)='object'),
 declared_fields jsonb NOT NULL CHECK(jsonb_typeof(declared_fields)='array'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(recorded_at)),
 PRIMARY KEY(owner_id,item_id,event_version),
 UNIQUE(owner_id,request_id),
 CHECK(status<>'active' OR revision IS NOT NULL)
);
ALTER TABLE macrogoal_logged_nutrition_private.evidence_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE macrogoal_logged_nutrition_private.evidence_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION macrogoal_logged_nutrition_private.actor()
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE a uuid:=auth.uid();
BEGIN
 IF a IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
    OR auth.jwt()->>'is_anonymous'='true' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
 END IF;
 RETURN a;
END $fn$;

-- Exact JSON comparisons retain database numeric precision and NULL values.
-- Evidence covers item nutrients/portion/identity, NOT consumption on a date.
-- Current owner is checked separately; daily completeness belongs to readiness.
CREATE FUNCTION macrogoal_logged_nutrition_private.item_binding(i jsonb,m jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fn$
 SELECT jsonb_build_object(
  'values',jsonb_build_object('calories',i->'calories','protein',i->'protein',
   'carbs',i->'carbs','fats',i->'fats','fiber',i->'fiber'),
  'portion',jsonb_build_object('grams',i->'grams','quantity',i->'quantity',
   'serving_description',i->'serving_description','serving_unit',i->'serving_unit',
   'food_id',i->'food_id','food_item_id',i->'food_item_id','food_name',i->'food_name',
   'food_brand',i->'food_brand','meal_id',i->'meal_id','is_scheduled',i->'is_scheduled',
   'logged_at',i->'logged_at'))
$fn$;

-- STABLE fixes the view at the invoking SQL query's snapshot, so a future
-- same-statement source projection can call this without private SELECT grants.
-- Historical receipt and current evidence are distinct. No locks on read.
-- This is as-of evidence, not a commit-time guarantee or read-after-write proof.
CREATE FUNCTION public.tdee_read_logged_nutrition_evidence_v1(p_item_id uuid,p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE a uuid:=macrogoal_logged_nutrition_private.actor(); result jsonb;
BEGIN
 SELECT jsonb_build_object('version','logged-nutrition-evidence-state-v1',
  'ownerId',a,'itemId',i.id,'revision',i.nutrition_revision,
  'expected',b.binding,'evidenceVersion',coalesce(e.event_version,0),
  'evidence',CASE WHEN e.status='active' AND i.nutrition_revision IS NOT NULL
    AND e.revision=i.nutrition_revision AND e.item_snapshot=b.binding
    AND i.is_scheduled IS FALSE THEN
   jsonb_build_object('version','user-entered-v1','ownerId',a,'itemId',i.id,
    'revision',i.nutrition_revision,'status','active','declaredFields',e.declared_fields,
    'values',b.binding->'values') ELSE NULL END,
  'receipt',CASE WHEN r.request_id IS NOT NULL THEN jsonb_build_object(
    'requestId',r.request_id,'requestDigest',r.request_digest,
    'eventVersion',r.event_version,'status',r.status) ELSE NULL END)
 INTO result
 FROM public.meal_items i JOIN public.meals m ON m.id=i.meal_id AND m.user_id=a
 CROSS JOIN LATERAL(SELECT macrogoal_logged_nutrition_private.item_binding(to_jsonb(i),to_jsonb(m)) AS binding)b
 LEFT JOIN LATERAL(SELECT * FROM macrogoal_logged_nutrition_private.evidence_events
   WHERE owner_id=a AND item_id=i.id ORDER BY event_version DESC LIMIT 1)e ON true
 LEFT JOIN macrogoal_logged_nutrition_private.evidence_events r
   ON r.owner_id=a AND r.item_id=i.id AND r.request_id=p_request_id
 WHERE i.id=p_item_id;
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='item_unavailable'; END IF;
 RETURN result;
END $fn$;

-- register: exact request keys below; revoke: no current nutrient claims needed.
-- Locks only this meal (SHARE), then this item (UPDATE), never all users/items.
-- Register after existing log_food has returned an item id. NEVER retry log_food
-- in response to evidence failure or an uncertain registration response.
CREATE FUNCTION public.tdee_register_logged_nutrition_evidence_v1(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE a uuid:=macrogoal_logged_nutrition_private.actor();
 iid uuid; rid uuid; mid uuid; req_revision uuid; expected_version bigint;
 item public.meal_items; meal public.meals;
 prior macrogoal_logged_nutrition_private.evidence_events;
 latest macrogoal_logged_nutrition_private.evidence_events;
 binding jsonb; fields jsonb; digest text; next_version bigint; k text; n numeric;
 kind text; keys text[];
BEGIN
 IF current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='isolation_unsupported'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>16000
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
 kind:=p_request->>'kind';
 keys:=CASE WHEN kind='register' THEN ARRAY['version','requestId','kind','itemId','revision','expectedEvidenceVersion','expected','declaredFields']
  WHEN kind='revoke' THEN ARRAY['version','requestId','kind','itemId','expectedEvidenceVersion'] ELSE NULL END;
 IF keys IS NULL OR p_request->>'version' IS DISTINCT FROM 'user-entered-v1'
 OR NOT p_request ?& keys OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) x WHERE NOT x=ANY(keys))
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
 FOREACH k IN ARRAY ARRAY['requestId','itemId'] LOOP
  IF jsonb_typeof(p_request->k) IS DISTINCT FROM 'string' OR
   (p_request->>k) !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_identity'; END IF;
 END LOOP;
 IF jsonb_typeof(p_request->'expectedEvidenceVersion') IS DISTINCT FROM 'number'
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_version'; END IF;
 n:=(p_request->>'expectedEvidenceVersion')::numeric;
 IF n<0 OR n<>trunc(n) OR n>=9007199254740991
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_version'; END IF;
 expected_version:=n::bigint; iid:=(p_request->>'itemId')::uuid; rid:=(p_request->>'requestId')::uuid;
 digest:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');

 -- Discover the meal then acquire locks in meal->item order. A concurrent move
 -- is rejected after the locks, not followed into another owner's meal.
 SELECT i.meal_id INTO mid FROM public.meal_items i JOIN public.meals m ON m.id=i.meal_id
  WHERE i.id=iid AND m.user_id=a;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='item_unavailable'; END IF;
 SELECT * INTO meal FROM public.meals WHERE id=mid AND user_id=a FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='item_unavailable'; END IF;
 SELECT * INTO item FROM public.meal_items WHERE id=iid FOR UPDATE;
 IF NOT FOUND OR item.meal_id IS DISTINCT FROM meal.id
 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='item_changed'; END IF;
 SELECT * INTO prior FROM macrogoal_logged_nutrition_private.evidence_events WHERE owner_id=a AND request_id=rid;
 IF FOUND THEN
  IF prior.request IS DISTINCT FROM p_request OR prior.request_digest IS DISTINCT FROM digest
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='request_id_mismatch'; END IF;
  RETURN public.tdee_read_logged_nutrition_evidence_v1(iid,rid);
 END IF;
 SELECT * INTO latest FROM macrogoal_logged_nutrition_private.evidence_events
  WHERE owner_id=a AND item_id=iid ORDER BY event_version DESC LIMIT 1;
 IF coalesce(latest.event_version,0)<>expected_version
 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='evidence_version_changed'; END IF;
 next_version:=expected_version+1;
 IF kind='register' THEN
  IF jsonb_typeof(p_request->'revision') IS DISTINCT FROM 'string' OR
   (p_request->>'revision') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='revision_required'; END IF;
  req_revision:=(p_request->>'revision')::uuid;
  binding:=macrogoal_logged_nutrition_private.item_binding(to_jsonb(item),to_jsonb(meal));
  IF item.nutrition_revision IS NULL OR item.nutrition_revision IS DISTINCT FROM req_revision
   OR item.is_scheduled IS DISTINCT FROM false OR p_request->'expected' IS DISTINCT FROM binding
  THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='nutrition_binding_changed'; END IF;
  -- Match the consumer contract for ALL stored values, not merely declared ones.
  -- Declaration controls provenance; it does not repair an unknown stored value.
  FOREACH k IN ARRAY ARRAY['calories','protein','carbs','fats','fiber'] LOOP
   IF jsonb_typeof(binding#>ARRAY['values',k]) IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='stored_nutrient_unknown'; END IF;
   n:=(binding#>>ARRAY['values',k])::numeric;
   IF n<0 OR n::text IN ('NaN','Infinity','-Infinity')
   THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='stored_nutrient_invalid'; END IF;
  END LOOP;
  fields:=p_request->'declaredFields';
  IF jsonb_typeof(fields) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_declared_fields'; END IF;
  IF jsonb_array_length(fields)<1 OR jsonb_array_length(fields)>5 OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(fields) f WHERE jsonb_typeof(f)<>'string')
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_declared_fields'; END IF;
  IF (SELECT count(DISTINCT f) FROM jsonb_array_elements_text(fields) f)<>jsonb_array_length(fields)
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_declared_fields'; END IF;
  FOR k IN SELECT jsonb_array_elements_text(fields) LOOP
   IF k NOT IN ('calories','protein','carbs','fats','fiber')
    OR jsonb_typeof(binding#>ARRAY['values',k]) IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='declared_value_unknown'; END IF;
   n:=(binding#>>ARRAY['values',k])::numeric;
   IF n<0 OR n::text IN ('NaN','Infinity','-Infinity')
   THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='declared_value_invalid'; END IF;
  END LOOP;
 ELSE
  IF latest.event_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='evidence_unavailable'; END IF;
  -- Revocation remains possible after data changes and retains the old binding.
  req_revision:=latest.revision; binding:=latest.item_snapshot; fields:='[]'::jsonb;
 END IF;
 INSERT INTO macrogoal_logged_nutrition_private.evidence_events
  (owner_id,item_id,event_version,request_id,request,request_digest,status,revision,item_snapshot,declared_fields)
 VALUES(a,iid,next_version,rid,p_request,digest,CASE WHEN kind='register' THEN 'active' ELSE 'revoked' END,req_revision,binding,fields)
 ON CONFLICT(owner_id,request_id) DO NOTHING;
 -- Cross-item reuse of the same request id may have raced the initial lookup.
 SELECT * INTO prior FROM macrogoal_logged_nutrition_private.evidence_events WHERE owner_id=a AND request_id=rid;
 IF NOT FOUND OR prior.request IS DISTINCT FROM p_request OR prior.request_digest IS DISTINCT FROM digest
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='request_id_mismatch'; END IF;
 RETURN public.tdee_read_logged_nutrition_evidence_v1(iid,rid);
END $fn$;

REVOKE ALL ON FUNCTION macrogoal_logged_nutrition_private.actor() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION macrogoal_logged_nutrition_private.item_binding(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_register_logged_nutrition_evidence_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tdee_register_logged_nutrition_evidence_v1(jsonb) TO authenticated;
-- Wrappers need narrow definer privilege for the unexposed table; actor and
-- ownership are checked explicitly. No caller gets private schema/table access.
-- Bounded metadata assertion, not functional QA.

DO $baseline$
DECLARE f pg_proc;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'reviewed_postgres_executor_required'; END IF;
 SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure('public.observed_get_tdee_snapshot_v1()');
 IF NOT FOUND OR md5(pg_get_functiondef(f.oid))<>'978feafb4d1d480f8d93b76ab0737a98'
 OR f.prosecdef OR f.provolatile<>'s' OR f.proowner<>'postgres'::regrole
 OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
 OR f.proacl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 THEN RAISE EXCEPTION 'snapshot_baseline_requires_review'; END IF;
END $baseline$;

-- Phase A remains closed pending functional QA. These revocations are part of
-- the same transaction, so the candidate's preceding grants are never exposed.
REVOKE ALL ON FUNCTION public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.tdee_register_logged_nutrition_evidence_v1(jsonb) FROM authenticated;
COMMIT;
-- No user rows are seeded/backfilled. log_food is untouched.

