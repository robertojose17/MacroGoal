-- PREPARED, NOT RUN. No claim of compilation, ACL or concurrency PASS.
-- Run ONLY after review/authorization, in the SAME rollback transaction as the
-- candidate definitions (replace their final ROLLBACK with this tail).
-- Harness must set authentic own-user JWT claims and SET LOCAL ROLE authenticated.
-- test.nutrition_item_id must be a dedicated authorized own-account fixture with
-- nonnull revision and consumed status. Never create/relog an item automatically.
-- For explicit-zero coverage the fixture must have calories=0, supplied separately.
DO $tests$
DECLARE iid uuid:=nullif(current_setting('test.nutrition_item_id',true),'')::uuid;
 s jsonb; r jsonb; q jsonb; oldq jsonb; bad jsonb; revq jsonb; error_seen boolean;
 rid uuid:=gen_random_uuid(); rejected_id uuid:=gen_random_uuid();
BEGIN
 IF iid IS NULL THEN RAISE EXCEPTION 'fixture_item_required'; END IF;
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'authenticated_role_required'; END IF;
 s:=public.tdee_read_logged_nutrition_evidence_v1(iid,NULL);
 IF s->>'revision' IS NULL OR (s#>>'{expected,portion,is_scheduled}')::boolean IS DISTINCT FROM false
 OR jsonb_typeof(s#>'{expected,values,calories}') IS DISTINCT FROM 'number'
 THEN RAISE EXCEPTION 'revision_consumed_numeric_fixture_required'; END IF;
 IF (s->>'evidenceVersion')::bigint<>0 THEN RAISE EXCEPTION 'fresh_candidate_fixture_required'; END IF;
 q:=jsonb_build_object('version','user-entered-v1','kind','register','requestId',rid,
  'itemId',iid,'revision',s->'revision','expectedEvidenceVersion',0,
  'expected',s->'expected','declaredFields',jsonb_build_array('calories'));
 r:=public.tdee_register_logged_nutrition_evidence_v1(q);
 IF r#>>'{evidence,status}' IS DISTINCT FROM 'active' OR
 r#>'{evidence,values}' IS DISTINCT FROM s#>'{expected,values}' OR
 r#>'{evidence,declaredFields}' IS DISTINCT FROM '["calories"]'::jsonb OR
 (r->>'evidenceVersion')::bigint<>1 THEN RAISE EXCEPTION 'registration_assertion'; END IF;
 IF public.tdee_register_logged_nutrition_evidence_v1(q) IS DISTINCT FROM r
 THEN RAISE EXCEPTION 'replay_changed_state'; END IF;
 oldq:=q;

 bad:=q||jsonb_build_object('declaredFields',jsonb_build_array('protein'));
 error_seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '22023' THEN error_seen:=SQLERRM='request_id_mismatch'; END;
 IF NOT error_seen THEN RAISE EXCEPTION 'same_id_different_payload_not_rejected'; END IF;

 bad:=q||jsonb_build_object('requestId',rejected_id,'expectedEvidenceVersion',1,'revision',gen_random_uuid());
 error_seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '40001' THEN error_seen:=SQLERRM='nutrition_binding_changed'; END;
 IF NOT error_seen THEN RAISE EXCEPTION 'stale_revision_not_rejected'; END IF;
 IF public.tdee_read_logged_nutrition_evidence_v1(iid,rejected_id)->'receipt' IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'rejected_request_left_receipt'; END IF;

 bad:=q||jsonb_build_object('requestId',gen_random_uuid(),'expectedEvidenceVersion',1,
   'expected',jsonb_set(q->'expected','{portion,quantity}','999999'::jsonb));
 error_seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '40001' THEN error_seen:=SQLERRM='nutrition_binding_changed'; END;
 IF NOT error_seen THEN RAISE EXCEPTION 'portion_mismatch_not_rejected'; END IF;

 bad:=q||jsonb_build_object('requestId',gen_random_uuid(),'expectedEvidenceVersion',1,
  'declaredFields',jsonb_build_array('calories','calories'));
 error_seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '22023' THEN error_seen:=SQLERRM='invalid_declared_fields'; END;
 IF NOT error_seen THEN RAISE EXCEPTION 'duplicate_declaration_not_rejected'; END IF;

 revq:=jsonb_build_object('version','user-entered-v1','kind','revoke','requestId',gen_random_uuid(),
  'itemId',iid,'expectedEvidenceVersion',1);
 r:=public.tdee_register_logged_nutrition_evidence_v1(revq);
 IF r->'evidence' IS DISTINCT FROM 'null'::jsonb OR (r->>'evidenceVersion')::bigint<>2
 THEN RAISE EXCEPTION 'revocation_assertion'; END IF;
 r:=public.tdee_register_logged_nutrition_evidence_v1(oldq);
 IF r->'evidence' IS DISTINCT FROM 'null'::jsonb OR (r->>'evidenceVersion')::bigint<>2
 OR r#>>'{receipt,status}' IS DISTINCT FROM 'active' OR (r#>>'{receipt,eventVersion}')::bigint<>1
 THEN RAISE EXCEPTION 'historic_replay_resurrected_or_lost_receipt'; END IF;

 IF has_schema_privilege('authenticated','macrogoal_logged_nutrition_private','USAGE')
 OR has_table_privilege('authenticated','macrogoal_logged_nutrition_private.evidence_events','SELECT')
 OR has_function_privilege('anon','public.tdee_register_logged_nutrition_evidence_v1(jsonb)','EXECUTE')
 OR has_function_privilege('service_role','public.tdee_register_logged_nutrition_evidence_v1(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'private_acl_assertion'; END IF;
END $tests$;
ROLLBACK;
-- Still required separately: known foreign-owned item, missing/anonymous claims,
-- actual revision rotation and legacy NULL, meal date/owner move, source snapshot
-- projection, lost network response recovery, and multi-session contention tests.
-- A random nonexistent item is NOT a foreign ownership test.
