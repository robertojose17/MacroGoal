-- PREPARED ONLY. Close the two Phase B RPCs without deleting evidence or foods.
-- Before use, stop evidence callers and inspect pending outcomes; revocation does
-- not cancel transactions already in progress. Do not treat this as data rollback.
BEGIN;
SET LOCAL lock_timeout='250ms';
SET LOCAL statement_timeout='2s';
SET LOCAL transaction_timeout='3s';
-- SOURCE ONLY. Reusable dependency preflight, no GRANT/data writes.
-- Include inside the bounded Phase B transaction BEFORE access change.
-- Public RPC ACL mode remains checked by the enclosing open/revoke script.
-- No claim this prevents concurrent administrative DDL or proves runtime JWT QA.
DO $dependencies$
DECLARE spec record; p pg_proc; role_name text; signature text;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'reviewed_postgres_executor_required'; END IF;
 FOR spec IN SELECT * FROM (VALUES
 ('macrogoal_logged_nutrition_private.actor()','s','uuid',$body_expected$
DECLARE a uuid:=auth.uid();
BEGIN
 IF a IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
    OR auth.jwt()->>'is_anonymous'='true' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
 END IF;
 RETURN a;
END $body_expected$),
 ('macrogoal_logged_nutrition_private.item_binding(jsonb,jsonb)','i','jsonb',$body_expected$
 SELECT jsonb_build_object(
  'values',jsonb_build_object('calories',i->'calories','protein',i->'protein',
   'carbs',i->'carbs','fats',i->'fats','fiber',i->'fiber'),
  'portion',jsonb_build_object('grams',i->'grams','quantity',i->'quantity',
   'serving_description',i->'serving_description','serving_unit',i->'serving_unit',
   'food_id',i->'food_id','food_item_id',i->'food_item_id','food_name',i->'food_name',
   'food_brand',i->'food_brand','meal_id',i->'meal_id','is_scheduled',i->'is_scheduled',
   'logged_at',i->'logged_at'))
$body_expected$),
 ('macrogoal_readiness_private.rotate_nutrition_revision_v1()','v','trigger',$body_expected$
BEGIN
 NEW.nutrition_revision := pg_catalog.gen_random_uuid();
 RETURN NEW;
END;
$body_expected$)
 ) v(signature,volatility,return_type,body) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(spec.signature);
  IF NOT FOUND THEN RAISE EXCEPTION 'phase_b_dependency_missing: %',spec.signature; END IF;
  IF p.proowner<>'postgres'::regrole OR p.prokind<>'f' OR p.prosecdef
   OR p.provolatile::text<>spec.volatility OR p.proretset OR p.proleakproof OR p.proisstrict
   OR p.prorettype<>spec.return_type::regtype
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
   OR p.proacl IS DISTINCT FROM '{postgres=X/postgres}'::aclitem[]
   OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM (CASE spec.signature WHEN 'macrogoal_logged_nutrition_private.actor()' THEN '83fbb03fc1898eac1151e0c3f1ea7225' WHEN 'macrogoal_logged_nutrition_private.item_binding(jsonb,jsonb)' THEN 'fcd995c4c48980d161799f67a5117c46' WHEN 'macrogoal_readiness_private.rotate_nutrition_revision_v1()' THEN '0781b3a7666d81ccb44526ed13b5bf5b' END)
   OR p.prosrc IS DISTINCT FROM spec.body
  THEN RAISE EXCEPTION 'phase_b_dependency_changed: %',spec.signature; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.meal_items'::regclass
  AND a.attname='nutrition_revision' AND NOT a.attisdropped AND a.atttypid='uuid'::regtype
  AND NOT a.attnotnull AND NOT a.atthasdef AND a.attidentity='' AND a.attgenerated=''
  AND a.attacl IS NULL)
 THEN RAISE EXCEPTION 'phase_b_revision_column_changed'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.meal_items'::regclass AND NOT tgisinternal)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.meal_items'::regclass
  AND t.tgname='rotate_nutrition_revision_v1' AND t.tgenabled='O'
  AND NOT t.tgisinternal AND t.tgtype=23 AND t.tgconstraint=0 AND NOT t.tgdeferrable
  AND NOT t.tginitdeferred AND t.tgnargs=0 AND octet_length(t.tgargs)=0
  AND t.tgqual IS NULL AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
  AND t.tgfoid=to_regprocedure('macrogoal_readiness_private.rotate_nutrition_revision_v1()')
  AND ARRAY(SELECT a.attname::text FROM unnest(t.tgattr::smallint[]) x(attnum)
   JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=x.attnum ORDER BY a.attname::text)
  =ARRAY['calories','carbs','fats','fiber','food_brand','food_id','food_item_id','food_name','grams','is_scheduled','logged_at','meal_id','nutrition_revision','protein','quantity','serving_description','serving_unit'])
 THEN RAISE EXCEPTION 'phase_b_revision_trigger_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='macrogoal_logged_nutrition_private'
  AND nspowner='postgres'::regrole AND nspacl='{postgres=UC/postgres}'::aclitem[])
 THEN RAISE EXCEPTION 'phase_b_private_schema_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='macrogoal_logged_nutrition_private.evidence_events'::regclass
  AND relowner='postgres'::regrole AND relkind='r' AND relpersistence='p' AND relrowsecurity
  AND NOT relforcerowsecurity AND relacl='{postgres=arwdDxtm/postgres}'::aclitem[])
 THEN RAISE EXCEPTION 'phase_b_private_table_changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='macrogoal_logged_nutrition_private.evidence_events'::regclass)
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='macrogoal_logged_nutrition_private.evidence_events'::regclass AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'phase_b_private_policy_trigger_changed'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_schema_privilege(role_name,'macrogoal_logged_nutrition_private','USAGE,CREATE')
   OR has_table_privilege(role_name,'macrogoal_logged_nutrition_private.evidence_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR has_any_column_privilege(role_name,'macrogoal_logged_nutrition_private.evidence_events','SELECT,INSERT,UPDATE,REFERENCES')
  THEN RAISE EXCEPTION 'phase_b_private_privilege_changed: %',role_name; END IF;
  FOREACH signature IN ARRAY ARRAY['macrogoal_logged_nutrition_private.actor()',
   'macrogoal_logged_nutrition_private.item_binding(jsonb,jsonb)',
   'macrogoal_readiness_private.rotate_nutrition_revision_v1()'] LOOP
   IF has_function_privilege(role_name,signature,'EXECUTE')
   THEN RAISE EXCEPTION 'phase_b_helper_privilege_changed: %',role_name; END IF;
  END LOOP;
 END LOOP;
 IF (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
  'default',pg_get_expr(d.adbin,d.adrelid),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated)
  ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='macrogoal_logged_nutrition_private.evidence_events'::regclass AND a.attnum>0 AND NOT a.attisdropped)
 IS DISTINCT FROM $expected_columns$[{"name": "owner_id", "type": "uuid", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "item_id", "type": "uuid", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "event_version", "type": "bigint", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "request_id", "type": "uuid", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "request", "type": "jsonb", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "request_digest", "type": "text", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "status", "type": "text", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "revision", "type": "uuid", "default": null, "notNull": false, "identity": "", "generated": ""}, {"name": "item_snapshot", "type": "jsonb", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "declared_fields", "type": "jsonb", "default": null, "notNull": true, "identity": "", "generated": ""}, {"name": "recorded_at", "type": "timestamp with time zone", "default": "clock_timestamp()", "notNull": true, "identity": "", "generated": ""}]$expected_columns$::jsonb
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='macrogoal_logged_nutrition_private.evidence_events'::regclass
  AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL)
 THEN RAISE EXCEPTION 'phase_b_evidence_columns_changed'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'validated',convalidated,
  'deferrable',condeferrable,'definition',replace(pg_get_constraintdef(oid),'REFERENCES public.','REFERENCES ')) ORDER BY conname)
  FROM pg_constraint WHERE conrelid='macrogoal_logged_nutrition_private.evidence_events'::regclass)
 IS DISTINCT FROM $expected_constraints$[{"name": "evidence_events_check", "type": "c", "validated": true, "deferrable": false, "definition": "CHECK (((status <> 'active'::text) OR (revision IS NOT NULL)))"}, {"name": "evidence_events_declared_fields_check", "type": "c", "validated": true, "deferrable": false, "definition": "CHECK ((jsonb_typeof(declared_fields) = 'array'::text))"}, {"name": "evidence_events_event_version_check", "type": "c", "validated": true, "deferrable": false, "definition": "CHECK (((event_version >= 1) AND (event_version <= '9007199254740991'::bigint)))"}, {"name": "evidence_events_item_id_fkey", "type": "f", "validated": true, "deferrable": false, "definition": "FOREIGN KEY (item_id) REFERENCES meal_items(id) ON DELETE CASCADE"}, {"name": "evidence_events_item_snapshot_check", "type": "c", "validated": true, "deferrable": false, "definition": "CHECK ((jsonb_typeof(item_snapshot) = 'object'::text))"}, {"name": "evidence_events_owner_id_fkey", "type": "f", "validated": true, "deferrable": false, "definition": "FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE"}, {"name": "evidence_events_owner_id_request_id_key", "type": "u", "validated": true, "deferrable": false, "definition": "UNIQUE (owner_id, request_id)"}, {"name": "evidence_events_pkey", "type": "p", "validated": true, "deferrable": false, "definition": "PRIMARY KEY (owner_id, item_id, event_version)"}, {"name": "evidence_events_recorded_at_check", "type": "c", "validated": true, "deferrable": false, "definition": "CHECK (isfinite(recorded_at))"}, {"name": "evidence_events_request_check", "type": "c", "validated": true, "deferrable": false, "definition": "CHECK ((jsonb_typeof(request) = 'object'::text))"}, {"name": "evidence_events_request_digest_check", "type": "c", "validated": true, "deferrable": false, "definition": "CHECK ((request_digest ~ '^[a-f0-9]{64}$'::text))"}, {"name": "evidence_events_status_check", "type": "c", "validated": true, "deferrable": false, "definition": "CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))"}]$expected_constraints$::jsonb
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='macrogoal_logged_nutrition_private.evidence_events'::regclass
  AND (condeferred OR (contype='f' AND (confrelid NOT IN ('public.users'::regclass,'public.meal_items'::regclass)
   OR confdeltype<>'c' OR confupdtype<>'a' OR confmatchtype<>'s'))))
 THEN RAISE EXCEPTION 'phase_b_evidence_constraints_changed'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('valid',indisvalid,'unique',indisunique,
  'definition',pg_get_indexdef(indexrelid)) ORDER BY pg_get_indexdef(indexrelid))
  FROM pg_index WHERE indrelid='macrogoal_logged_nutrition_private.evidence_events'::regclass)
 IS DISTINCT FROM $expected_indexes$[{"valid": true, "unique": true, "definition": "CREATE UNIQUE INDEX evidence_events_owner_id_request_id_key ON macrogoal_logged_nutrition_private.evidence_events USING btree (owner_id, request_id)"}, {"valid": true, "unique": true, "definition": "CREATE UNIQUE INDEX evidence_events_pkey ON macrogoal_logged_nutrition_private.evidence_events USING btree (owner_id, item_id, event_version)"}]$expected_indexes$::jsonb
 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='macrogoal_logged_nutrition_private.evidence_events'::regclass
  AND (NOT indisready OR NOT indislive OR NOT indimmediate))
 THEN RAISE EXCEPTION 'phase_b_evidence_indexes_changed'; END IF;
END $dependencies$;

DO $guard$
DECLARE spec record; p record;
BEGIN
 FOR spec IN SELECT * FROM (VALUES
 ('public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid)','0b458fa52bc72254f2b7d3a44ab2c855'),
 ('public.tdee_register_logged_nutrition_evidence_v1(jsonb)','1d8ab7e38587594fed9269ad56bda226')
 ) v(signature,definition_hash) LOOP
  SELECT x.*,pg_get_userbyid(x.proowner) AS owner_name INTO p
   FROM pg_proc x WHERE x.oid=to_regprocedure(spec.signature);
  IF NOT FOUND THEN RAISE EXCEPTION 'phase_b_function_missing'; END IF;
  IF p.owner_name<>'postgres' OR NOT p.prosecdef
   OR md5(pg_get_functiondef(p.oid))<>spec.definition_hash
   OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  THEN RAISE EXCEPTION 'phase_b_baseline_changed'; END IF;
 END LOOP;
END $guard$;
REVOKE EXECUTE ON FUNCTION public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tdee_register_logged_nutrition_evidence_v1(jsonb) FROM authenticated;
DO $verify$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid)',
 'public.tdee_register_logged_nutrition_evidence_v1(jsonb)'] LOOP
  IF has_function_privilege('authenticated',signature,'EXECUTE')
   OR has_function_privilege('anon',signature,'EXECUTE')
   OR has_function_privilege('service_role',signature,'EXECUTE')
  THEN RAISE EXCEPTION 'phase_b_revoke_mismatch'; END IF;
 END LOOP;
END $verify$;
COMMIT;
-- Independent catalog readback required; no automatic repeat after uncertainty.
