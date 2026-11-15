-- SOURCE ONLY. NOT INSTALLED, NOT COMPILED, NOT EXECUTED.
-- Requires reviewed revision + evidence migrations. Original authority unchanged.
-- Real rollout needs separate reviewed install script; this is not a tool dry run.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $patch$
DECLARE old_body text; new_body text; actual text; before_acl aclitem[]; after_acl aclitem[]; original_owner oid; new_owner oid;
 old_projection text:='SELECT i.id,i.meal_id,i.calories,i.is_scheduled,i.protein,i.carbs,i.fats,i.fiber';
 new_projection text:='SELECT i.id,i.meal_id,i.calories,i.is_scheduled,i.protein,i.carbs,i.fats,i.fiber,i.nutrition_revision,
      CASE WHEN i.nutrition_revision IS NOT NULL THEN
        public.tdee_read_logged_nutrition_evidence_v1(i.id,NULL)->''evidence''
      ELSE NULL END AS nutrition_evidence';
 old_marker text:='''nutritionFieldsVersion'',''logged-macros-v1''';
 new_marker text:='''nutritionFieldsVersion'',''logged-macros-v1'',''nutritionEvidenceVersion'',''user-entered-v1''';
BEGIN
 SELECT pg_get_functiondef(p.oid),p.proacl,p.proowner INTO old_body,before_acl,original_owner
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.observed_get_tdee_snapshot_v1()')
 AND NOT p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp'];
 IF NOT FOUND OR old_body IS NULL OR md5(old_body)<>'978feafb4d1d480f8d93b76ab0737a98'
 OR before_acl IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 THEN RAISE EXCEPTION 'snapshot_requires_fresh_review'; END IF;
 PERFORM 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid)')
 AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
 AND p.proacl='{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]
 AND p.prosrc IS NOT DISTINCT FROM $expected_reader$DECLARE a uuid:=macrogoal_logged_nutrition_private.actor(); result jsonb;
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
END $expected_reader$;
 IF NOT FOUND THEN RAISE EXCEPTION 'evidence_reader_requires_review'; END IF;
 IF (length(old_body)-length(replace(old_body,old_projection,'')))/length(old_projection)<>1
 OR (length(old_body)-length(replace(old_body,old_marker,'')))/length(old_marker)<>1
 THEN RAISE EXCEPTION 'snapshot_anchor_not_unique'; END IF;
 new_body:=replace(replace(old_body,old_projection,new_projection),old_marker,new_marker);
 IF replace(replace(new_body,new_projection,old_projection),new_marker,old_marker) IS DISTINCT FROM old_body
 THEN RAISE EXCEPTION 'snapshot_unrelated_change'; END IF;
 EXECUTE new_body;
 SELECT pg_get_functiondef(p.oid),p.proacl,p.proowner INTO actual,after_acl,new_owner
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.observed_get_tdee_snapshot_v1()')
 AND NOT p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp'];
 IF NOT FOUND OR actual IS DISTINCT FROM new_body OR after_acl IS DISTINCT FROM before_acl OR new_owner IS DISTINCT FROM original_owner
 THEN RAISE EXCEPTION 'snapshot_verification_failed'; END IF;
END $patch$;
ROLLBACK;
-- SQL execution tests pending: STABLE snapshot coherence, private ACL, concurrent
-- revoke/edit, NULL legacy skipping, maximum-row cost, and post-write receipts.
-- Do not submit this file to apply_migration as a supported dry-run.
