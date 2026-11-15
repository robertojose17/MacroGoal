-- SOURCE-ONLY candidate. NOT EXECUTED. No clinical evidence, policies or target writes.
-- Existing private schema required. The final ROLLBACK is deliberate.
BEGIN;
CREATE FUNCTION macrogoal_snapshot_review_private.macro_split_valid(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE k text; n numeric; total numeric:=0;
BEGIN
 IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF NOT p ?& ARRAY['protein','carbs','fats'] OR (SELECT count(*) FROM jsonb_object_keys(p))<>3 THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['protein','carbs','fats'] LOOP
  IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n:=(p->>k)::numeric;
  IF n<0 OR n>10000 OR n<>trunc(n) THEN RETURN false; END IF;
  total:=total+n;
 END LOOP;
 RETURN total=10000;
END $f$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.macro_split_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE macrogoal_snapshot_review_private.macro_choices(
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
 choice_version bigint NOT NULL CHECK(choice_version BETWEEN 1 AND 9007199254740991),
 request_id uuid NOT NULL,
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object' AND octet_length(request_payload::text)<=4096),
 goal_updated_at timestamptz NOT NULL CHECK(isfinite(goal_updated_at)),
 profile_binding text NOT NULL CHECK(profile_binding ~ '^[a-f0-9]{64}$'),
 journey_binding text NOT NULL CHECK(journey_binding ~ '^[a-f0-9]{64}$'),
 copy_version text NOT NULL CHECK(copy_version='macro-choice-v1'),
 mode text NOT NULL CHECK(mode IN ('smart','preserve_percent','revoked')),
 split_bps jsonb,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(recorded_at)),
 PRIMARY KEY(owner_id,goal_id,choice_version),UNIQUE(owner_id,request_id),
 CHECK((mode='preserve_percent' AND macrogoal_snapshot_review_private.macro_split_valid(split_bps)) OR
 (mode IN ('smart','revoked') AND split_bps IS NULL))
);
ALTER TABLE macrogoal_snapshot_review_private.macro_choices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE macrogoal_snapshot_review_private.macro_choices FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION macrogoal_snapshot_review_private.macro_choice_state()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid:=macrogoal_readiness_private.actor(); g public.goals;
 c macrogoal_snapshot_review_private.macro_choices; r jsonb; has_choice boolean; matches boolean:=false;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='active_goal_required'; END IF;
 SELECT * INTO g FROM public.goals WHERE user_id=actor AND is_active=true;
 IF g.id IS NULL OR g.updated_at IS NULL OR NOT isfinite(g.updated_at) THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='active_goal_required'; END IF;
 SELECT * INTO c FROM macrogoal_snapshot_review_private.macro_choices WHERE owner_id=actor AND goal_id=g.id ORDER BY choice_version DESC LIMIT 1;
 has_choice:=FOUND;
 -- Reuse existing binding implementation, not its eligibility as clinical approval.
 BEGIN
  r:=macrogoal_readiness_private.read_state();
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM NOT IN ('source_limit','profile_unavailable') THEN RAISE; END IF;
  r:=NULL; -- Choice can still be displayed/revoked; no granting state is current.
 END;
 IF r IS NOT NULL THEN
  IF r->>'ownerId' IS DISTINCT FROM actor::text OR r->>'version' IS DISTINCT FROM 'tdee-readiness-v1' OR
  coalesce(r->>'profileBinding','') !~ '^[a-f0-9]{64}$' OR coalesce(r->>'journeyBinding','') !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='readiness_binding_unavailable'; END IF;
  matches:=has_choice AND c.goal_updated_at=g.updated_at AND c.profile_binding=r->>'profileBinding' AND c.journey_binding=r->>'journeyBinding';
 END IF;
 RETURN jsonb_build_object('version','macro-choice-state-v1','ownerId',actor,'capturedAt',clock_timestamp(),
 'copyVersion','macro-choice-v1','goalId',g.id,'goalUpdatedAt',g.updated_at,
 'bindingStatus',CASE WHEN r IS NULL THEN 'unavailable' ELSE 'available' END,
 'profileBinding',r->>'profileBinding','journeyBinding',r->>'journeyBinding',
 'choiceVersion',CASE WHEN has_choice THEN c.choice_version ELSE 0 END,
 'choice',CASE WHEN has_choice THEN jsonb_build_object('requestId',c.request_id,'choiceVersion',c.choice_version,
 'mode',c.mode,'splitBps',c.split_bps,'recordedAt',c.recorded_at,'goalUpdatedAt',c.goal_updated_at,
 'profileBinding',c.profile_binding,'journeyBinding',c.journey_binding,'copyVersion',c.copy_version,
 'current',coalesce(matches,false) AND c.mode<>'revoked') ELSE NULL END,'actionable',false);
END $f$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.macro_choice_state() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION macrogoal_snapshot_review_private.macro_choice_write(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid:=macrogoal_readiness_private.actor(); u public.users; g public.goals;
 previous macrogoal_snapshot_review_private.macro_choices; replay_row macrogoal_snapshot_review_private.macro_choices;
 saved macrogoal_snapshot_review_private.macro_choices;
 rid uuid; gid uuid; expected bigint; actual bigint; revision timestamptz; r jsonb;
 pb text; jb text; split jsonb; n numeric; k text; selected_mode text;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>4096 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_choice_invalid'; END IF;
 IF NOT p_request ?& ARRAY['requestId','expectedChoiceVersion','goalId','goalUpdatedAt','profileBinding','journeyBinding','copyVersion','mode','splitBps'] OR
 (SELECT count(*) FROM jsonb_object_keys(p_request))<>9 OR p_request->>'copyVersion' IS DISTINCT FROM 'macro-choice-v1' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_choice_invalid'; END IF;
 FOREACH k IN ARRAY ARRAY['requestId','goalId','goalUpdatedAt','profileBinding','journeyBinding','copyVersion','mode'] LOOP
  IF jsonb_typeof(p_request->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_choice_invalid'; END IF;
 END LOOP;
 IF p_request->>'requestId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR
 p_request->>'goalId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR
 p_request->>'goalUpdatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' OR
 p_request->>'profileBinding' !~ '^[a-f0-9]{64}$' OR p_request->>'journeyBinding' !~ '^[a-f0-9]{64}$' OR
 jsonb_typeof(p_request->'expectedChoiceVersion') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_choice_invalid'; END IF;
 n:=(p_request->>'expectedChoiceVersion')::numeric;
 IF n<0 OR n>9007199254740990 OR n<>trunc(n) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_choice_invalid'; END IF;
 expected:=n::bigint;rid:=(p_request->>'requestId')::uuid;gid:=(p_request->>'goalId')::uuid;
 BEGIN revision:=(p_request->>'goalUpdatedAt')::timestamptz;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_choice_invalid'; END;
 IF NOT isfinite(revision) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_choice_invalid'; END IF;
 selected_mode:=p_request->>'mode';split:=p_request->'splitBps';
 IF selected_mode NOT IN ('smart','preserve_percent','revoked') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_choice_invalid'; END IF;
 IF selected_mode='preserve_percent' THEN
  IF NOT macrogoal_snapshot_review_private.macro_split_valid(split) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_split_invalid'; END IF;
 ELSE
  IF split IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='macro_split_invalid'; END IF;
  split:=NULL;
 END IF;
 -- All own-actor preference writers serialize on U, then G (manual-goal order).
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 SELECT * INTO replay_row FROM macrogoal_snapshot_review_private.macro_choices WHERE owner_id=actor AND request_id=rid;
 IF FOUND THEN
  IF replay_row.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='request_id_conflict'; END IF;
  RETURN jsonb_build_object('version','macro-choice-write-v1','replayed',true,
   'receipt',jsonb_build_object('requestId',replay_row.request_id,'goalId',replay_row.goal_id,'choiceVersion',replay_row.choice_version,'mode',replay_row.mode,'recordedAt',replay_row.recorded_at),
   'latestChoice',(SELECT jsonb_build_object('choiceVersion',choice_version,'mode',mode) FROM macrogoal_snapshot_review_private.macro_choices WHERE owner_id=actor AND goal_id=replay_row.goal_id ORDER BY choice_version DESC LIMIT 1),'actionable',false);
 END IF;
 SELECT * INTO g FROM public.goals WHERE id=gid AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='goal_changed'; END IF;
 SELECT * INTO previous FROM macrogoal_snapshot_review_private.macro_choices WHERE owner_id=actor AND goal_id=gid ORDER BY choice_version DESC LIMIT 1;
 actual:=CASE WHEN FOUND THEN previous.choice_version ELSE 0 END;
 IF actual<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='macro_choice_changed'; END IF;
 IF selected_mode='revoked' THEN
  IF actual=0 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='macro_choice_missing'; END IF;
  -- Restrictive action ignores stale granting bindings; retain prior stored provenance.
  revision:=previous.goal_updated_at;pb:=previous.profile_binding;jb:=previous.journey_binding;
 ELSE
  IF g.is_active IS DISTINCT FROM true OR g.updated_at IS DISTINCT FROM revision OR
  (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='goal_changed'; END IF;
  r:=macrogoal_readiness_private.read_state();
  IF r->>'ownerId' IS DISTINCT FROM actor::text OR r->>'version' IS DISTINCT FROM 'tdee-readiness-v1' OR
  coalesce(r->>'profileBinding','') !~ '^[a-f0-9]{64}$' OR coalesce(r->>'journeyBinding','') !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='readiness_binding_unavailable'; END IF;
  pb:=r->>'profileBinding';jb:=r->>'journeyBinding';
  IF pb IS DISTINCT FROM p_request->>'profileBinding' OR jb IS DISTINCT FROM p_request->>'journeyBinding' THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='profile_or_journey_changed'; END IF;
 END IF;
 INSERT INTO macrogoal_snapshot_review_private.macro_choices(owner_id,goal_id,choice_version,request_id,request_payload,goal_updated_at,profile_binding,journey_binding,copy_version,mode,split_bps)
 VALUES(actor,gid,actual+1,rid,p_request,revision,pb,jb,'macro-choice-v1',selected_mode,split) RETURNING * INTO saved;
 RETURN jsonb_build_object('version','macro-choice-write-v1','replayed',false,
  'receipt',jsonb_build_object('requestId',saved.request_id,'goalId',saved.goal_id,'choiceVersion',saved.choice_version,'mode',saved.mode,'recordedAt',saved.recorded_at),
  'latestChoice',jsonb_build_object('choiceVersion',saved.choice_version,'mode',saved.mode),'actionable',false);
END $f$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.macro_choice_write(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Narrow public SECURITY DEFINER wrappers are justified to avoid granting schema
-- USAGE or helper access across the existing private schema. Identity is checked first.
CREATE FUNCTION public.tdee_read_macro_choice_v1() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
 PERFORM macrogoal_readiness_private.actor();
 IF auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 RETURN macrogoal_snapshot_review_private.macro_choice_state();
END $f$;
CREATE FUNCTION public.tdee_save_macro_choice_v1(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
 PERFORM macrogoal_readiness_private.actor();
 IF auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 RETURN macrogoal_snapshot_review_private.macro_choice_write(p_request);
END $f$;
CREATE FUNCTION public.tdee_revoke_macro_choice_v1(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
 PERFORM macrogoal_readiness_private.actor();
 IF auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR
 p_request->>'mode' IS DISTINCT FROM 'revoked' OR p_request->'splitBps' IS DISTINCT FROM 'null'::jsonb THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='revocation_required'; END IF;
 RETURN macrogoal_snapshot_review_private.macro_choice_write(p_request);
END $f$;
REVOKE ALL ON FUNCTION public.tdee_read_macro_choice_v1(),public.tdee_save_macro_choice_v1(jsonb),public.tdee_revoke_macro_choice_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Only these own-actor public entry points. No private-schema USAGE/helper/table grants.
GRANT EXECUTE ON FUNCTION public.tdee_read_macro_choice_v1(),public.tdee_save_macro_choice_v1(jsonb),public.tdee_revoke_macro_choice_v1(jsonb) TO authenticated;
ROLLBACK;
