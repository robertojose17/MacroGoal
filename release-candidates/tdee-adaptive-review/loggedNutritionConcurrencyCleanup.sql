-- PREPARED NOT RUN. Deletes ONLY the verified synthetic item and its FK events.
-- Supply reviewed private test.fixture_manifest within this transaction.
-- Never execute until both session calls have ended and outcome is inspected.
BEGIN;
SET LOCAL lock_timeout='250ms';
SET LOCAL statement_timeout='2s';
SET LOCAL transaction_timeout='3s';
DO $cleanup$
DECLARE m jsonb:=current_setting('test.fixture_manifest')::jsonb;
 actor uuid:=(m->>'ownerId')::uuid; iid uuid:=(m->>'itemId')::uuid;
 mid uuid:=(m->>'mealId')::uuid; image jsonb; ev record; q jsonb;
 n bigint; deleted bigint;
BEGIN
 IF current_user<>'postgres' OR actor IS NULL OR iid IS NULL OR mid IS NULL
 OR m->>'version' IS DISTINCT FROM 'nutrition-concurrency-fixture-v1'
 OR jsonb_typeof(m->'itemSnapshot') IS DISTINCT FROM 'object'
 OR jsonb_typeof(m->'requestIds') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'reviewed_fixture_manifest_required'; END IF;
 IF jsonb_array_length(m->'requestIds')<>2 OR m#>>'{requestIds,0}'=m#>>'{requestIds,1}'
 THEN RAISE EXCEPTION 'invalid_fixture_requests'; END IF;
 PERFORM 1 FROM public.meals WHERE id=mid AND user_id=actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'own_parent_missing_review_required'; END IF;
 SELECT to_jsonb(i) INTO image FROM public.meal_items i WHERE id=iid AND meal_id=mid FOR UPDATE;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM public.meal_items WHERE id=iid)
  THEN RAISE EXCEPTION 'fixture_moved_cleanup_aborted'; END IF;
  -- Absence is acceptable only if absolutely no remaining event references it.
  IF EXISTS(SELECT 1 FROM macrogoal_logged_nutrition_private.evidence_events WHERE item_id=iid)
  THEN RAISE EXCEPTION 'unexpected_orphan_fixture_event'; END IF;
  PERFORM set_config('test.fixture_cleanup_result','already_absent',true);
  RETURN;
 END IF;
 IF image IS DISTINCT FROM m->'itemSnapshot'
 OR image->>'food_name' IS DISTINCT FROM 'Synthetic temporary concurrency fixture'
 OR image->'nutrition_revision' IS DISTINCT FROM m->'revision'
 THEN RAISE EXCEPTION 'fixture_edited_cleanup_aborted'; END IF;
 SELECT count(*) INTO n FROM macrogoal_logged_nutrition_private.evidence_events WHERE item_id=iid;
 IF n>1 THEN RAISE EXCEPTION 'unexpected_fixture_event_count'; END IF;
 FOR ev IN SELECT * FROM macrogoal_logged_nutrition_private.evidence_events WHERE item_id=iid FOR UPDATE LOOP
  q:=jsonb_build_object('version','user-entered-v1','kind','register','requestId',ev.request_id,
   'itemId',iid,'revision',m->'revision','expectedEvidenceVersion',0,
   'expected',m->'expected','declaredFields',jsonb_build_array('calories'));
  IF ev.owner_id IS DISTINCT FROM actor OR ev.event_version<>1 OR ev.status<>'active'
   OR NOT (m->'requestIds' @> jsonb_build_array(ev.request_id::text))
   OR ev.revision IS DISTINCT FROM (m->>'revision')::uuid
   OR ev.item_snapshot IS DISTINCT FROM m->'expected'
   OR ev.declared_fields IS DISTINCT FROM '["calories"]'::jsonb
   OR ev.request IS DISTINCT FROM q
   OR ev.request_digest IS DISTINCT FROM encode(sha256(convert_to(q::text,'UTF8')),'hex')
  THEN RAISE EXCEPTION 'unexpected_fixture_event_cleanup_aborted'; END IF;
 END LOOP;
 DELETE FROM public.meal_items i USING public.meals p
 WHERE i.id=iid AND i.meal_id=mid AND p.id=i.meal_id AND p.user_id=actor
 AND to_jsonb(i)=m->'itemSnapshot';
 GET DIAGNOSTICS deleted=ROW_COUNT;
 IF deleted<>1 OR EXISTS(SELECT 1 FROM macrogoal_logged_nutrition_private.evidence_events WHERE item_id=iid)
 THEN RAISE EXCEPTION 'fixture_cleanup_incomplete'; END IF;
 PERFORM set_config('test.fixture_cleanup_result','deleted_exact_fixture',true);
END $cleanup$;
SELECT current_setting('test.fixture_cleanup_result') AS cleanup_result;
COMMIT;
-- Independently verify item absence by UUID alone (no old-meal filter), evidence
-- absence by item UUID, and compare baseline own digests after COMMIT.
-- Never overwrite legitimate intervening user edits to force digest equality.
