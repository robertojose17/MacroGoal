-- PREPARED FUNCTIONAL ROLLBACK / QUARANTINE. NOT RUN.
-- Phase A ONLY. If snapshot projection exists, STOP and review its reversal first.
-- Preserve evidence history, column, schema, functions and all user diary rows.
-- No DROP, DELETE, TRUNCATE, CASCADE or evidence-history mutation.
-- Preconditions: consumer off, calls drained, exact reviewed Phase A definitions.
BEGIN;
SET LOCAL lock_timeout='250ms';
SET LOCAL statement_timeout='2s';
SET LOCAL transaction_timeout='3s';

DO $projection_gate$
DECLARE p pg_proc;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'reviewed_postgres_executor_required'; END IF;
 -- Operational acknowledgement, NOT proof of drained sessions or authorization.
 -- Caller must disable the real consumer and drain calls BEFORE this transaction.
 IF current_setting('macrogoal.evidence_consumer_gate',true) IS DISTINCT FROM 'off_and_drained'
 THEN RAISE EXCEPTION 'consumer_disable_and_drain_required'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.observed_get_tdee_snapshot_v1()');
 IF NOT FOUND OR md5(pg_get_functiondef(p.oid))<>'978feafb4d1d480f8d93b76ab0737a98'
 OR p.prosecdef OR p.provolatile<>'s'
 OR p.proacl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 THEN RAISE EXCEPTION 'projection_present_or_snapshot_drift'; END IF;
END $projection_gate$;

LOCK TABLE public.meal_items IN ACCESS EXCLUSIVE MODE;
DO $exact_definitions$
DECLARE p pg_proc;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('macrogoal_readiness_private.rotate_nutrition_revision_v1()');
 IF NOT FOUND OR p.proowner<>'postgres'::regrole OR p.prokind<>'f'
 OR p.prosecdef IS DISTINCT FROM false
 OR p.provolatile<>'v' OR p.proretset OR p.proleakproof
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
 OR p.prosrc IS DISTINCT FROM $reviewed_0$
BEGIN
 NEW.nutrition_revision := pg_catalog.gen_random_uuid();
 RETURN NEW;
END;
$reviewed_0$
 THEN RAISE EXCEPTION 'quarantine_function_drift_0'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('macrogoal_logged_nutrition_private.actor()');
 IF NOT FOUND OR p.proowner<>'postgres'::regrole OR p.prokind<>'f'
 OR p.prosecdef IS DISTINCT FROM false
 OR p.provolatile<>'s' OR p.proretset OR p.proleakproof
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
 OR p.prosrc IS DISTINCT FROM $reviewed_1$
DECLARE a uuid:=auth.uid();
BEGIN
 IF a IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
    OR auth.jwt()->>'is_anonymous'='true' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
 END IF;
 RETURN a;
END $reviewed_1$
 THEN RAISE EXCEPTION 'quarantine_function_drift_1'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('macrogoal_logged_nutrition_private.item_binding(jsonb,jsonb)');
 IF NOT FOUND OR p.proowner<>'postgres'::regrole OR p.prokind<>'f'
 OR p.prosecdef IS DISTINCT FROM false
 OR p.provolatile<>'i' OR p.proretset OR p.proleakproof
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
 OR p.prosrc IS DISTINCT FROM $reviewed_2$
 SELECT jsonb_build_object(
  'values',jsonb_build_object('calories',i->'calories','protein',i->'protein',
   'carbs',i->'carbs','fats',i->'fats','fiber',i->'fiber'),
  'portion',jsonb_build_object('grams',i->'grams','quantity',i->'quantity',
   'serving_description',i->'serving_description','serving_unit',i->'serving_unit',
   'food_id',i->'food_id','food_item_id',i->'food_item_id','food_name',i->'food_name',
   'food_brand',i->'food_brand','meal_id',i->'meal_id','is_scheduled',i->'is_scheduled',
   'logged_at',i->'logged_at'))
$reviewed_2$
 THEN RAISE EXCEPTION 'quarantine_function_drift_2'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid)');
 IF NOT FOUND OR p.proowner<>'postgres'::regrole OR p.prokind<>'f'
 OR p.prosecdef IS DISTINCT FROM true
 OR p.provolatile<>'s' OR p.proretset OR p.proleakproof
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
 OR p.prosrc IS DISTINCT FROM $reviewed_3$
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
END $reviewed_3$
 THEN RAISE EXCEPTION 'quarantine_function_drift_3'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.tdee_register_logged_nutrition_evidence_v1(jsonb)');
 IF NOT FOUND OR p.proowner<>'postgres'::regrole OR p.prokind<>'f'
 OR p.prosecdef IS DISTINCT FROM true
 OR p.provolatile<>'v' OR p.proretset OR p.proleakproof
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
 OR p.prosrc IS DISTINCT FROM $reviewed_4$
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
END $reviewed_4$
 THEN RAISE EXCEPTION 'quarantine_function_drift_4'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='macrogoal_logged_nutrition_private' AND c.relname='evidence_events'
   AND c.relkind='r' AND c.relrowsecurity AND c.relowner='postgres'::regrole)
 THEN RAISE EXCEPTION 'quarantine_table_drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.meal_items'::regclass
   AND attname='nutrition_revision' AND atttypid='uuid'::regtype AND NOT attisdropped)
 THEN RAISE EXCEPTION 'quarantine_revision_missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.meal_items'::regclass
  AND tgname='rotate_nutrition_revision_v1' AND NOT tgisinternal
  AND tgfoid=to_regprocedure('macrogoal_readiness_private.rotate_nutrition_revision_v1()')
  AND tgenabled IN ('O','A'))
 THEN RAISE EXCEPTION 'quarantine_trigger_drift'; END IF;
END $exact_definitions$;
-- New callers lose the public surface. Do not grant any private replacement.
REVOKE ALL ON FUNCTION public.tdee_register_logged_nutrition_evidence_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.meal_items DISABLE TRIGGER rotate_nutrition_revision_v1;
COMMIT;
-- Evidence revisions can now stop tracking edits. DO NOT regrant/re-enable later
-- without a reviewed invalidation plan: old evidence must never become valid again
-- solely because values were restored while the trigger was disabled.
-- The unchanged baseline snapshot exposes no evidence marker. Postgres retains
-- administrative access/history; quarantine is not physical schema restoration.

