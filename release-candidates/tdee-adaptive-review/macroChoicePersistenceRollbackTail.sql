-- PREPARED, NOT EXECUTED. Append inside candidate transaction in place of its
-- final ROLLBACK, only after independent approval for this own-account test.
-- Requires a verified existing owner's authenticated request context already set
-- by the approved harness. This file does not create users or fabricate JWTs.
-- No goals, profiles, policies, entitlements or purchases are modified.
DO $t$
BEGIN
 IF auth.uid() IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
  RAISE EXCEPTION 'verified_own_actor_context_required'; END IF;
 IF has_table_privilege('authenticated','macrogoal_snapshot_review_private.macro_choices','SELECT') OR
 has_table_privilege('authenticated','macrogoal_snapshot_review_private.macro_choices','INSERT') OR
 has_function_privilege('anon','public.tdee_save_macro_choice_v1(jsonb)','EXECUTE') OR
 has_function_privilege('service_role','public.tdee_save_macro_choice_v1(jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'acl_unexpected'; END IF;
 IF has_function_privilege('authenticated','macrogoal_snapshot_review_private.macro_choice_write(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'private_helper_access'; END IF;
 IF NOT has_function_privilege('authenticated','public.tdee_save_macro_choice_v1(jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'own_actor_rpc_unavailable'; END IF;
 PERFORM set_config('macrogoal.choice_goal_before',
  (SELECT to_jsonb(g)::text FROM public.goals g WHERE g.user_id=auth.uid() AND g.is_active=true),true);
END $t$;
SET LOCAL ROLE authenticated;
DO $t$
DECLARE s jsonb; p jsonb; a jsonb; b jsonb; q jsonb; version bigint; old_time text;
BEGIN
 s:=public.tdee_read_macro_choice_v1();
 IF s->>'ownerId' IS DISTINCT FROM auth.uid()::text OR s->>'bindingStatus' IS DISTINCT FROM 'available' THEN
  RAISE EXCEPTION 'usable_own_state_required'; END IF;
 version:=(s->>'choiceVersion')::bigint;
 p:=jsonb_build_object('requestId',gen_random_uuid(),'expectedChoiceVersion',version,
 'goalId',s->'goalId','goalUpdatedAt',s->'goalUpdatedAt','profileBinding',s->'profileBinding',
 'journeyBinding',s->'journeyBinding','copyVersion','macro-choice-v1','mode','smart','splitBps',NULL);
 a:=public.tdee_save_macro_choice_v1(p);
 IF a->'replayed' IS DISTINCT FROM 'false'::jsonb OR (a#>>'{receipt,choiceVersion}')::bigint<>version+1 THEN RAISE EXCEPTION 'save_failed'; END IF;
 old_time:=a#>>'{receipt,recordedAt}';
 b:=public.tdee_save_macro_choice_v1(p);
 IF b->'replayed' IS DISTINCT FROM 'true'::jsonb OR b->'receipt' IS DISTINCT FROM a->'receipt' THEN RAISE EXCEPTION 'replay_changed'; END IF;
 BEGIN
  PERFORM public.tdee_save_macro_choice_v1(p||jsonb_build_object('mode','revoked'));
  RAISE EXCEPTION 'expected_id_conflict';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM<>'request_id_conflict' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.tdee_save_macro_choice_v1(p||jsonb_build_object('requestId',gen_random_uuid()));
  RAISE EXCEPTION 'expected_version_conflict';
 EXCEPTION WHEN SQLSTATE '40001' THEN
  IF SQLERRM<>'macro_choice_changed' THEN RAISE; END IF;
 END;
 q:=p||jsonb_build_object('requestId',gen_random_uuid(),'expectedChoiceVersion',version+1,
 'mode','preserve_percent','splitBps',jsonb_build_object('protein',3000,'carbs',4000,'fats',3000));
 b:=public.tdee_save_macro_choice_v1(q);
 IF b#>>'{receipt,mode}' IS DISTINCT FROM 'preserve_percent' THEN RAISE EXCEPTION 'split_not_saved'; END IF;
 s:=public.tdee_read_macro_choice_v1();
 IF s#>'{choice,splitBps}' IS DISTINCT FROM q->'splitBps' OR s#>'{choice,current}' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'split_not_exact'; END IF;
 BEGIN
  PERFORM public.tdee_save_macro_choice_v1(q||jsonb_build_object('requestId',gen_random_uuid(),'expectedChoiceVersion',version+2,
  'splitBps',jsonb_build_object('protein',2950,'carbs',4000,'fats',3000)));
  RAISE EXCEPTION 'expected_split_rejection';
 EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'macro_split_invalid' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.tdee_save_macro_choice_v1(q||jsonb_build_object('requestId',gen_random_uuid(),'expectedChoiceVersion',version+2,
  'splitBps',jsonb_build_object('protein','3000','carbs',4000,'fats',3000)));
  RAISE EXCEPTION 'expected_type_rejection';
 EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'macro_split_invalid' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.tdee_save_macro_choice_v1(p||jsonb_build_object('requestId',gen_random_uuid(),'expectedChoiceVersion',version+2,'ownerId',gen_random_uuid()));
  RAISE EXCEPTION 'expected_owner_injection_rejection';
 EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'macro_choice_invalid' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.tdee_save_macro_choice_v1(p||jsonb_build_object('requestId',gen_random_uuid(),'expectedChoiceVersion',version+2,'goalId',gen_random_uuid()));
  RAISE EXCEPTION 'expected_foreign_goal_rejection';
 EXCEPTION WHEN SQLSTATE '40001' THEN IF SQLERRM<>'goal_changed' THEN RAISE; END IF; END;
 -- Stale granting bindings cannot block restrictive revocation.
 b:=public.tdee_revoke_macro_choice_v1(p||jsonb_build_object('requestId',gen_random_uuid(),
 'expectedChoiceVersion',version+2,'goalUpdatedAt','2000-01-01T00:00:00Z','profileBinding',repeat('b',64),
 'journeyBinding',repeat('b',64),'mode','revoked'));
 IF b#>>'{latestChoice,mode}' IS DISTINCT FROM 'revoked' THEN RAISE EXCEPTION 'revoke_failed'; END IF;
 s:=public.tdee_read_macro_choice_v1();
 IF s#>'{choice,current}' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'revocation_current'; END IF;
 b:=public.tdee_save_macro_choice_v1(p);
 IF b#>>'{receipt,recordedAt}' IS DISTINCT FROM old_time OR b#>>'{latestChoice,mode}' IS DISTINCT FROM 'revoked' OR
 (b#>>'{latestChoice,choiceVersion}')::bigint<>version+3 THEN RAISE EXCEPTION 'replay_reactivated_choice'; END IF;
 BEGIN
  PERFORM 1 FROM macrogoal_snapshot_review_private.macro_choices LIMIT 1;
  RAISE EXCEPTION 'table_access_granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
 IF current_setting('macrogoal.choice_goal_before',true)::jsonb IS DISTINCT FROM
 (SELECT to_jsonb(g) FROM public.goals g WHERE g.user_id=auth.uid() AND g.is_active=true) THEN
  RAISE EXCEPTION 'goal_changed_by_choice_test'; END IF;
END $t$;
-- Additional reviewed multi-session tests still required: concurrent CAS writers;
-- deleted actor/goal cascades; stale profile/journey races; anonymous JWT; readiness
-- source-limit read fallback; revoked old inactive goal; ACL under actual API.
ROLLBACK;
