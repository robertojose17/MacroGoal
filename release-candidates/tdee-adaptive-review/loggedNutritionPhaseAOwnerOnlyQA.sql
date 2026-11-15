-- PREPARED, NOT RUN. Functional logic as postgres with synthetic own-user claims.
-- NOT positive authenticated ACL, JWT validation, PostgREST login or app E2E.
-- No GRANT or DDL. No parent meal creation. All fixture writes ROLLBACK.
-- Supply approved UUID in test.fixture_owner and optional test.fixture_meal GUC
-- through a reviewed harness. They are NOT authorizations by themselves.
BEGIN;
SET LOCAL lock_timeout='250ms';
SET LOCAL statement_timeout='2s';
SET LOCAL transaction_timeout='3s';
DO $owner_qa$
DECLARE owner_id uuid:=nullif(current_setting('test.fixture_owner',true),'')::uuid;
 requested_meal_id uuid:=nullif(current_setting('test.fixture_meal',true),'')::uuid;
 meal_id uuid;
 iid uuid:=gen_random_uuid(); invalid_iid uuid:=gen_random_uuid();
 client_revision uuid:=gen_random_uuid(); original_revision uuid; next_revision uuid;
 rid uuid:=gen_random_uuid(); badrid uuid:=gen_random_uuid();
 s jsonb; r jsonb; q jsonb; original_q jsonb; bad jsonb; revoke_q jsonb;
 claims jsonb; seen boolean;
BEGIN
 IF current_user<>'postgres' OR owner_id IS NULL
 THEN RAISE EXCEPTION 'approved_owner_executor_and_fixture_required'; END IF;
 SELECT m.id INTO meal_id FROM public.meals m
 WHERE m.user_id=owner_id AND (requested_meal_id IS NULL OR m.id=requested_meal_id)
 ORDER BY m.id LIMIT 1 FOR SHARE;
 IF NOT FOUND
 THEN RAISE EXCEPTION 'existing_own_meal_required'; END IF;
 IF to_regclass('macrogoal_logged_nutrition_private.evidence_events') IS NULL
 THEN RAISE EXCEPTION 'phase_a_not_installed'; END IF;
 IF has_function_privilege('authenticated','public.tdee_register_logged_nutrition_evidence_v1(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'phase_a_surface_not_closed'; END IF;
 -- Claims are explicitly synthetic and do not authenticate this session.
 claims:=jsonb_build_object('sub',owner_id,'role','authenticated','is_anonymous',false);
 PERFORM set_config('request.jwt.claims',claims::text,true);
 IF auth.uid() IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'synthetic_claim_binding_failed'; END IF;

 -- Metadata read confirmed numeric NOT NULL values, nullable food FKs and no
 -- CHECK constraints on these values. No real food identity/value is copied.
 INSERT INTO public.meal_items(id,meal_id,food_id,food_item_id,food_name,food_brand,
  calories,protein,carbs,fats,fiber,grams,quantity,serving_description,serving_unit,
  is_scheduled,nutrition_revision)
 VALUES(iid,meal_id,NULL,NULL,'Synthetic evidence rollback fixture',NULL,
  0,0,0,0,0,1,1,'Synthetic portion','g',false,client_revision)
 RETURNING nutrition_revision INTO original_revision;
 IF original_revision IS NULL OR original_revision=client_revision
 THEN RAISE EXCEPTION 'insert_did_not_rotate_revision'; END IF;
 s:=public.tdee_read_logged_nutrition_evidence_v1(iid,NULL);
 IF (s->>'evidenceVersion')::bigint<>0 OR s->'evidence' IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'fixture_unexpected_prior_evidence'; END IF;
 q:=jsonb_build_object('version','user-entered-v1','kind','register','requestId',rid,
  'itemId',iid,'revision',original_revision,'expectedEvidenceVersion',0,
  'expected',s->'expected','declaredFields',jsonb_build_array('calories'));
 r:=public.tdee_register_logged_nutrition_evidence_v1(q);
 IF r#>>'{evidence,status}' IS DISTINCT FROM 'active' OR
  r#>'{evidence,values}' IS DISTINCT FROM s#>'{expected,values}' OR
  r#>'{evidence,declaredFields}' IS DISTINCT FROM '["calories"]'::jsonb OR
  r#>'{evidence,values,calories}' IS DISTINCT FROM '0'::jsonb OR
  (r->>'evidenceVersion')::bigint<>1
 THEN RAISE EXCEPTION 'registration_or_nested_stable_readback_failed'; END IF;
 IF public.tdee_register_logged_nutrition_evidence_v1(q) IS DISTINCT FROM r
 OR public.tdee_read_logged_nutrition_evidence_v1(iid,rid) IS DISTINCT FROM r
 OR (SELECT count(*) FROM macrogoal_logged_nutrition_private.evidence_events e WHERE e.item_id=iid)<>1
 THEN RAISE EXCEPTION 'exact_replay_or_separate_read_failed'; END IF;
 original_q:=q;

 bad:=q||jsonb_build_object('declaredFields',jsonb_build_array('protein'));
 seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '22023' THEN seen:=SQLERRM='request_id_mismatch'; END;
 IF NOT seen THEN RAISE EXCEPTION 'request_id_reuse_not_rejected'; END IF;
 bad:=q||jsonb_build_object('requestId',badrid,'revision',gen_random_uuid(),'expectedEvidenceVersion',1);
 seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '40001' THEN seen:=SQLERRM='nutrition_binding_changed'; END;
 IF NOT seen OR public.tdee_read_logged_nutrition_evidence_v1(iid,badrid)->'receipt' IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'stale_revision_or_partial_receipt_failed'; END IF;
 bad:=q||jsonb_build_object('requestId',gen_random_uuid(),'expectedEvidenceVersion',1,
  'expected',jsonb_set(q->'expected','{portion,quantity}','2'::jsonb));
 seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '40001' THEN seen:=SQLERRM='nutrition_binding_changed'; END;
 IF NOT seen THEN RAISE EXCEPTION 'portion_mismatch_not_rejected'; END IF;
 bad:=q||jsonb_build_object('requestId',gen_random_uuid(),'expectedEvidenceVersion',1,
  'declaredFields',jsonb_build_array('calories','calories'));
 seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '22023' THEN seen:=SQLERRM='invalid_declared_fields'; END;
 IF NOT seen THEN RAISE EXCEPTION 'duplicate_fields_not_rejected'; END IF;

 revoke_q:=jsonb_build_object('version','user-entered-v1','kind','revoke','requestId',gen_random_uuid(),
  'itemId',iid,'expectedEvidenceVersion',1);
 r:=public.tdee_register_logged_nutrition_evidence_v1(revoke_q);
 IF r->'evidence' IS DISTINCT FROM 'null'::jsonb OR (r->>'evidenceVersion')::bigint<>2
 THEN RAISE EXCEPTION 'revocation_failed'; END IF;
 r:=public.tdee_register_logged_nutrition_evidence_v1(original_q);
 IF r->'evidence' IS DISTINCT FROM 'null'::jsonb OR (r->>'evidenceVersion')::bigint<>2
 OR r#>>'{receipt,status}' IS DISTINCT FROM 'active' OR (r#>>'{receipt,eventVersion}')::bigint<>1
 THEN RAISE EXCEPTION 'historical_replay_resurrected_evidence'; END IF;
 q:=original_q||jsonb_build_object('requestId',gen_random_uuid(),'expectedEvidenceVersion',2);
 r:=public.tdee_register_logged_nutrition_evidence_v1(q);
 IF r#>>'{evidence,status}' IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'new_version_registration_failed'; END IF;
 UPDATE public.meal_items i SET off_data='{"synthetic_metadata":true}'::jsonb WHERE i.id=iid;
 SELECT i.nutrition_revision INTO next_revision FROM public.meal_items i WHERE i.id=iid;
 IF next_revision IS DISTINCT FROM original_revision THEN RAISE EXCEPTION 'metadata_rotated_revision'; END IF;
 UPDATE public.meal_items i SET calories=1 WHERE i.id=iid RETURNING nutrition_revision INTO next_revision;
 IF next_revision IS NULL OR next_revision=original_revision
 OR public.tdee_read_logged_nutrition_evidence_v1(iid,NULL)->'evidence' IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'nutrient_edit_not_invalidated'; END IF;

 -- Actual catalog has no nonnegative CHECK: negative undeclared protein is a
 -- permitted synthetic fixture, NOT a production value or a weakened constraint.
 INSERT INTO public.meal_items(id,meal_id,calories,protein,carbs,fats,fiber,quantity,is_scheduled)
 VALUES(invalid_iid,meal_id,1,-1,0,0,0,1,false);
 s:=public.tdee_read_logged_nutrition_evidence_v1(invalid_iid,NULL);
 bad:=jsonb_build_object('version','user-entered-v1','kind','register','requestId',gen_random_uuid(),
  'itemId',invalid_iid,'revision',s->'revision','expectedEvidenceVersion',0,
  'expected',s->'expected','declaredFields',jsonb_build_array('calories'));
 seen:=false;
 BEGIN PERFORM public.tdee_register_logged_nutrition_evidence_v1(bad);
 EXCEPTION WHEN SQLSTATE '22023' THEN seen:=SQLERRM='stored_nutrient_invalid'; END;
 IF NOT seen OR public.tdee_read_logged_nutrition_evidence_v1(invalid_iid,(bad->>'requestId')::uuid)->'receipt' IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'invalid_undeclared_value_accepted'; END IF;

 PERFORM set_config('request.jwt.claims','{}',true);
 seen:=false;
 BEGIN PERFORM public.tdee_read_logged_nutrition_evidence_v1(iid,NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN seen:=SQLERRM='authentication_required'; END;
 IF NOT seen THEN RAISE EXCEPTION 'missing_claims_accepted'; END IF;
 PERFORM set_config('request.jwt.claims',(claims||'{"is_anonymous":true}'::jsonb)::text,true);
 seen:=false;
 BEGIN PERFORM public.tdee_read_logged_nutrition_evidence_v1(iid,NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN seen:=SQLERRM='authentication_required'; END;
 IF NOT seen THEN RAISE EXCEPTION 'anonymous_claims_accepted'; END IF;
 PERFORM set_config('request.jwt.claims',claims::text,true);

 -- NEGATIVE authenticated privilege test only. No GRANT and no asserted login.
 EXECUTE 'SET LOCAL ROLE authenticated';
 seen:=false;
 BEGIN EXECUTE 'SELECT public.tdee_read_logged_nutrition_evidence_v1($1,NULL)' USING iid;
 EXCEPTION WHEN SQLSTATE '42501' THEN seen:=true; END;
 IF NOT seen THEN RAISE EXCEPTION 'closed_reader_callable_by_authenticated'; END IF;
 seen:=false;
 BEGIN EXECUTE 'SELECT public.tdee_register_logged_nutrition_evidence_v1($1)' USING original_q;
 EXCEPTION WHEN SQLSTATE '42501' THEN seen:=true; END;
 IF NOT seen THEN RAISE EXCEPTION 'closed_writer_callable_by_authenticated'; END IF;
 EXECUTE 'RESET ROLE';
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'owner_role_restore_failed'; END IF;
 IF has_schema_privilege('authenticated','macrogoal_logged_nutrition_private','USAGE')
 OR has_table_privilege('authenticated','macrogoal_logged_nutrition_private.evidence_events','SELECT')
 OR has_function_privilege('anon','public.tdee_register_logged_nutrition_evidence_v1(jsonb)','EXECUTE')
 OR has_function_privilege('service_role','public.tdee_register_logged_nutrition_evidence_v1(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'private_acl_boundary_failed'; END IF;
END $owner_qa$;
ROLLBACK;
-- No positive authenticated/PostgREST E2E, concurrency, foreign-owner or network
-- recovery claim. On any error/timeout verify rollback with the separate digest
-- query before further actions. Never retry or increase limits automatically.
