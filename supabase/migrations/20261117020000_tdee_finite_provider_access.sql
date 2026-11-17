-- Generic finite-provider TDEE access. No release gates or cron changes.
-- Reviewed function bodies unchanged; fail closed if installed baseline differs.
BEGIN;
SET LOCAL lock_timeout='500ms';
DO $upgrade_fence$
BEGIN
 IF to_regprocedure('macrogoal_observed_private.context_for_actor(uuid)') IS NULL OR md5(pg_get_functiondef(to_regprocedure('macrogoal_observed_private.context_for_actor(uuid)'))) IS DISTINCT FROM '22cad0fa5b343bfb04724ab9458aa96a' THEN
  RAISE EXCEPTION 'tdee_finite_access_source_changed_review_required'; END IF;
 IF to_regprocedure('public.observed_get_tdee_snapshot_v1()') IS NULL OR md5(pg_get_functiondef(to_regprocedure('public.observed_get_tdee_snapshot_v1()'))) IS DISTINCT FROM '2f8a64435279c6a15c4dba5108992929' THEN
  RAISE EXCEPTION 'tdee_finite_access_source_changed_review_required'; END IF;
 IF to_regprocedure('tdee_scheduler_private.read_observation(uuid)') IS NULL OR md5(pg_get_functiondef(to_regprocedure('tdee_scheduler_private.read_observation(uuid)'))) IS DISTINCT FROM '9fc0558d3e3a94ea4b7994ce1e4c0af6' THEN
  RAISE EXCEPTION 'tdee_finite_access_source_changed_review_required'; END IF;
 IF to_regprocedure('tdee_rules14_private.accept_rate_proposal(jsonb)') IS NULL OR md5(pg_get_functiondef(to_regprocedure('tdee_rules14_private.accept_rate_proposal(jsonb)'))) IS DISTINCT FROM '703bafec9abd3509662c8299a3c1706d' THEN
  RAISE EXCEPTION 'tdee_finite_access_source_changed_review_required'; END IF;
 IF to_regprocedure('tdee_scheduler_private.read_access(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'tdee_finite_access_helper_exists_review_required'; END IF;
 IF to_regprocedure('macrogoal_observed_private.finite_access(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'tdee_finite_access_helper_exists_review_required'; END IF;
 IF md5(pg_get_functiondef('tdee_rules14_chain_private.verify_chain(jsonb,bigint)'::regprocedure)) IS DISTINCT FROM '563e6041911a00b39413a0b136dd860b' THEN RAISE EXCEPTION 'rules14_date_chain_source_changed_review_required'; END IF;
END $upgrade_fence$;
-- SOURCE ONLY. Finite-provider-validity access for TDEE; no release flags changed.
-- Uses existing server-verified cache and unchanged 30-second decision validator.
CREATE OR REPLACE FUNCTION tdee_scheduler_private.read_access(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $access$
DECLARE status jsonb; scope entitlement_cache_candidate.scopes; env text; expiry numeric; candidate_expiry numeric; active_env text;
BEGIN
 -- Existing identity and protected registry validation: service or genuine self only.
 status:=entitlement_cache_candidate.tester_status(p_owner);
 FOREACH env IN ARRAY ARRAY['PRODUCTION','SANDBOX'] LOOP
  IF env='SANDBOX' AND NOT coalesce((status->>'enabled')::boolean,false) THEN CONTINUE; END IF;
  SELECT * INTO scope FROM entitlement_cache_candidate.scopes WHERE owner_id=p_owner AND environment=env;
  IF FOUND AND NOT scope.dirty AND entitlement_cache_candidate.decision(p_owner,env,scope.proof)='active' THEN
   candidate_expiry:=(scope.proof->>'validUntil')::numeric;
   IF env='SANDBOX' THEN candidate_expiry:=least(candidate_expiry,(status->>'expiresAt')::numeric); END IF;
   expiry:=least(expiry,candidate_expiry);active_env:=coalesce(active_env,env);
  END IF;
 END LOOP;
 IF expiry IS NOT NULL THEN RETURN jsonb_build_object('ownerId',p_owner,'allowed',true,'validUntil',expiry,'environment',active_env); END IF;
 -- No subscription-table or lifetime fallback. Missing/dirty/stale proof never grants.
 RETURN jsonb_build_object('ownerId',p_owner,'allowed',false,'validUntil',NULL,'environment',NULL);
END $access$;
REVOKE ALL ON FUNCTION tdee_scheduler_private.read_access(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION macrogoal_observed_private.finite_access(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $own$
BEGIN
 IF p_actor IS DISTINCT FROM macrogoal_observed_private.require_actor() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 RETURN tdee_scheduler_private.read_access(p_actor);
END $own$;
REVOKE ALL ON FUNCTION macrogoal_observed_private.finite_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_observed_private.finite_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION macrogoal_observed_private.context_for_actor(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE tz text; dob date; journey date; today date; due date; day integer;
  setting macrogoal_observed_private.settings; goal jsonb; is_premium boolean; payload jsonb; access_info jsonb;
BEGIN
  IF p_actor IS DISTINCT FROM macrogoal_observed_private.require_actor() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
  END IF;
  SELECT timezone,date_of_birth,journey_start_date INTO tz,dob,journey
    FROM public.users WHERE id=p_actor;
  IF NOT FOUND OR tz IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=tz) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='profile_unavailable';
  END IF;
  today := (now() AT TIME ZONE tz)::date;
  SELECT * INTO setting FROM macrogoal_observed_private.settings WHERE user_id=p_actor;
  -- Scalar subquery rejects duplicate active goals instead of choosing arbitrarily.
  goal := (SELECT jsonb_build_object('id',g.id,'daily_calories',g.daily_calories,
    'protein_g',g.protein_g,'carbs_g',g.carbs_g,'fats_g',g.fats_g,'fiber_g',g.fiber_g,
    'macro_preset',g.macro_preset,'goal_type',g.goal_type,'loss_rate_lbs_per_week',g.loss_rate_lbs_per_week)
    FROM public.goals g WHERE g.user_id=p_actor AND g.is_active=true);
  IF goal IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_each(goal) kv
    WHERE kv.key IN ('daily_calories','protein_g','carbs_g','fats_g','fiber_g')
    AND (jsonb_typeof(kv.value) IS DISTINCT FROM 'number' OR
      CASE WHEN jsonb_typeof(kv.value)='number' THEN (kv.value::text)::numeric<0 ELSE false END)) THEN
    goal := NULL;
  END IF;
  IF goal IS NOT NULL AND (goal->>'daily_calories')::numeric<=0 THEN goal:=NULL; END IF;
  access_info:=macrogoal_observed_private.finite_access(p_actor);
  is_premium:=coalesce((access_info->>'allowed')::boolean,false);
  day := coalesce(setting.review_day,0);
  due := coalesce(setting.started_on,today);
  due := due + ((day-extract(dow FROM due)::integer+7)%7);
  -- This fingerprint detects context changes only. It is NOT a source-write lock
  -- or a coherent database snapshot across the separate caller-scoped source reads.
  payload := jsonb_build_object('ownerId',p_actor,'today',today,'timezone',tz,
    'dateOfBirth',dob,'journeyStartDate',journey,'currentGoal',goal,'premium',is_premium,
    'settings',to_jsonb(setting));
  RETURN jsonb_build_object('ownerId',p_actor,'premium',is_premium,
    'enabled',coalesce(setting.enabled,false),'reviewDay',day,'today',today,
    'nextReviewDate',due,'reviewDue',false,'currentGoal',goal,'proposal',NULL,
    'profile',jsonb_build_object('journey_start_date',journey),
    'fingerprint',encode(sha256(convert_to(payload::text,'UTF8')),'hex'),
    -- No policy table or write API exists that could enable recommendations.
    'safety',jsonb_build_object('enabled',false,'eligibility','unverified')) ||
    CASE WHEN is_premium THEN jsonb_build_object('accessValidUntil',access_info->'validUntil')
    ELSE '{}'::jsonb END;
END $function$;

CREATE OR REPLACE FUNCTION public.observed_get_tdee_snapshot_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  actor uuid := auth.uid();
  captured_at timestamptz := statement_timestamp();
  result jsonb;
  profile_ok boolean;
  goal_count bigint;
  tracker_count bigint;
  checkin_count bigint;
  entry_count bigint;
  meal_count bigint;
  item_count bigint;
BEGIN
  IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
  END IF;

  -- Do not call the old VOLATILE context helper here. All database inputs are
  -- materialized by this single query, under caller RLS and explicit owner scope.
  WITH profile AS MATERIALIZED (
    SELECT u.id,u.timezone,u.date_of_birth,u.journey_start_date,u.updated_at,
      EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=u.timezone) AS valid_zone
    FROM public.users u WHERE u.id=actor
  ), access_snapshot AS MATERIALIZED (
    SELECT macrogoal_observed_private.finite_access(actor) AS value
  ), context_input AS MATERIALIZED (
    SELECT p.*,a.value AS access_info,
      CASE WHEN p.valid_zone THEN (captured_at AT TIME ZONE p.timezone)::date END AS today,
      coalesce(s.enabled,false) AS enabled, coalesce(s.review_day,0) AS review_day,
      s.started_on, to_jsonb(s) AS settings_record,
      coalesce((a.value->>'allowed')::boolean,false) AS premium
    FROM profile p CROSS JOIN access_snapshot a LEFT JOIN macrogoal_observed_private.settings s ON s.user_id=actor
  ), goal_rows AS MATERIALIZED (
    SELECT g.id,g.daily_calories,g.protein_g,g.carbs_g,g.fats_g,g.fiber_g,
      g.macro_preset,g.goal_type,g.loss_rate_lbs_per_week,g.updated_at
    FROM public.goals g WHERE g.user_id=actor AND g.is_active=true
    ORDER BY g.id LIMIT 2
  ), goal_data AS MATERIALIZED (
    SELECT count(*) AS n,
      CASE WHEN count(*)=1 THEN (jsonb_agg(to_jsonb(g)-'updated_at' ORDER BY g.id))->0 END AS raw_goal,
      CASE WHEN count(*)=1 THEN (jsonb_agg(to_jsonb(g.updated_at) ORDER BY g.id))->0 END AS goal_updated_at
    FROM goal_rows g
  ), goal_checked AS MATERIALIZED (
    SELECT n,goal_updated_at,
      CASE WHEN raw_goal IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM jsonb_each(raw_goal) kv
          WHERE kv.key IN ('daily_calories','protein_g','carbs_g','fats_g','fiber_g')
          AND (jsonb_typeof(kv.value) IS DISTINCT FROM 'number' OR
            CASE WHEN jsonb_typeof(kv.value)='number' THEN (kv.value::text)::numeric<0 ELSE false END))
        AND (raw_goal->>'daily_calories')::numeric>0
      THEN raw_goal ELSE NULL END AS goal
    FROM goal_data
  ), scoped AS MATERIALIZED (
    SELECT c.*,g.n AS goal_count,g.goal,g.goal_updated_at,
      c.today-29 AS window_start,
      coalesce(c.started_on,c.today)+((c.review_day-extract(dow FROM coalesce(c.started_on,c.today))::integer+7)%7) AS due
    FROM context_input c CROSS JOIN goal_checked g
  ), tracker_rows AS MATERIALIZED (
    SELECT t.id,t.unit FROM public.trackers t CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND t.user_id=actor AND t.is_default=true
      AND t.name ILIKE 'weight'
    ORDER BY t.id LIMIT 2
  ), checkin_rows AS MATERIALIZED (
    SELECT w.id,w.date,w.weight,w.updated_at,w.created_at
    FROM public.check_ins w CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND w.user_id=actor AND w.weight IS NOT NULL
      AND w.date>=c.window_start AND w.date<c.today
    ORDER BY w.id LIMIT 5001
  ), entry_rows AS MATERIALIZED (
    SELECT w.id,w.tracker_id,w.date,w.value,w.created_at
    FROM public.tracker_entries w JOIN tracker_rows t ON t.id=w.tracker_id CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND w.user_id=actor
      AND w.date>=c.window_start AND w.date<c.today
    ORDER BY w.id LIMIT 5001
  ), meal_rows AS MATERIALIZED (
    SELECT m.id,m.date,m.meal_type FROM public.meals m CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND m.user_id=actor
      AND m.date>=c.window_start AND m.date<c.today
    ORDER BY m.id LIMIT 501
  ), item_rows AS MATERIALIZED (
    SELECT i.id,i.meal_id,i.calories,i.is_scheduled,i.protein,i.carbs,i.fats,i.fiber,i.nutrition_revision,
      CASE WHEN i.nutrition_revision IS NOT NULL THEN
        public.tdee_read_logged_nutrition_evidence_v1(i.id,NULL)->'evidence'
      ELSE NULL END AS nutrition_evidence
    FROM public.meal_items i JOIN meal_rows m ON m.id=i.meal_id
    WHERE i.is_scheduled=false
    ORDER BY i.id LIMIT 5001
  ), arrays AS MATERIALIZED (
    SELECT
      (SELECT count(*) FROM tracker_rows) AS trackers_n,
      (SELECT count(*) FROM checkin_rows) AS checkins_n,
      (SELECT count(*) FROM entry_rows) AS entries_n,
      (SELECT count(*) FROM meal_rows) AS meals_n,
      (SELECT count(*) FROM item_rows) AS items_n,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM tracker_rows t),'[]'::jsonb) AS trackers,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM checkin_rows t),'[]'::jsonb) AS checkins,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM entry_rows t),'[]'::jsonb) AS entries,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM meal_rows t),'[]'::jsonb) AS meals,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM item_rows t),'[]'::jsonb) AS items
  ), payloads AS MATERIALIZED (
    SELECT c.*,a.*,
      jsonb_build_object('ownerId',actor,'today',c.today,'timezone',c.timezone,
        'dateOfBirth',c.date_of_birth,'journeyStartDate',c.journey_start_date,
        'currentGoal',c.goal,'premium',c.premium,'settings',c.settings_record) AS context_payload,
      CASE WHEN c.premium AND c.enabled THEN jsonb_build_object(
        'timezone',c.timezone,'dateOfBirth',c.date_of_birth,'journeyStartDate',c.journey_start_date,
        'nutritionFieldsVersion','logged-macros-v1','nutritionEvidenceVersion','user-entered-v1','trackers',a.trackers,'trackerWeights',a.entries,'checkIns',a.checkins,'meals',a.meals,'items',a.items)
      END AS sources,
      CASE WHEN c.premium AND c.enabled THEN jsonb_build_object('trackers',a.trackers_n,
        'trackerWeights',a.entries_n,'checkIns',a.checkins_n,'meals',a.meals_n,'items',a.items_n)
      END AS counts
    FROM scoped c CROSS JOIN arrays a
  ), fingerprinted AS MATERIALIZED (
    SELECT p.*,encode(sha256(convert_to(p.context_payload::text,'UTF8')),'hex') AS context_fingerprint
    FROM payloads p
  )
  SELECT p.valid_zone,p.goal_count,p.trackers_n,p.checkins_n,p.entries_n,p.meals_n,p.items_n,
    jsonb_build_object('version','observed-snapshot-v1','ownerId',actor,'capturedAt',captured_at,
      'context',jsonb_build_object('ownerId',actor,'premium',p.premium,'enabled',p.enabled,
        'reviewDay',p.review_day,'today',p.today,'nextReviewDate',p.due,'reviewDue',false,
        'currentGoal',p.goal,'proposal',NULL,'profile',jsonb_build_object('journey_start_date',p.journey_start_date),
        'fingerprint',p.context_fingerprint,'safety',jsonb_build_object('enabled',false,'eligibility','unverified')) || CASE WHEN p.premium THEN jsonb_build_object('accessValidUntil',p.access_info->'validUntil') ELSE '{}'::jsonb END,
      'sourceFingerprint',encode(sha256(convert_to(jsonb_build_object(
        'context',p.context_payload,'profileUpdatedAt',p.updated_at,'goalUpdatedAt',p.goal_updated_at,
        'sources',p.sources,'counts',p.counts)::text,'UTF8')),'hex'),
      'counts',p.counts,'sources',p.sources)
  INTO profile_ok,goal_count,tracker_count,checkin_count,entry_count,meal_count,item_count,result
  FROM fingerprinted p;

  IF NOT FOUND OR profile_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable';
  END IF;
  IF goal_count>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='active_goal_conflict'; END IF;
  IF tracker_count>1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tracker_unavailable'; END IF;
  IF meal_count>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='meal_limit'; END IF;
  IF checkin_count>5000 OR entry_count>5000 OR item_count>5000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_limit';
  END IF;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION tdee_scheduler_private.read_observation(p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  actor uuid := p_owner;
  captured_at timestamptz := statement_timestamp();
  result jsonb;
  profile_ok boolean;
  goal_count bigint;
  tracker_count bigint;
  checkin_count bigint;
  entry_count bigint;
  meal_count bigint;
  item_count bigint;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
  END IF;

  -- Do not call the old VOLATILE context helper here. All database inputs are
  -- materialized by this single query, under server-only explicit owner scope.
  WITH profile AS MATERIALIZED (
    SELECT u.id,u.timezone,u.date_of_birth,u.journey_start_date,u.updated_at,
      EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=u.timezone) AS valid_zone
    FROM public.users u WHERE u.id=actor
  ), access_snapshot AS MATERIALIZED (
    -- Read the genuine entitlement decision once. Premium and its validity
    -- marker must describe the same proof; never manufacture a replacement TTL.
    SELECT tdee_scheduler_private.read_access(actor) AS value
  ), context_input AS MATERIALIZED (
    SELECT p.*,a.value AS access_info,
      CASE WHEN p.valid_zone THEN (captured_at AT TIME ZONE p.timezone)::date END AS today,
      coalesce(s.enabled,false) AS enabled, coalesce(s.review_day,0) AS review_day,
      s.started_on, to_jsonb(s) AS settings_record,
      coalesce((a.value->>'allowed')::boolean,false) AS premium
    FROM profile p CROSS JOIN access_snapshot a LEFT JOIN macrogoal_observed_private.settings s ON s.user_id=actor
  ), goal_rows AS MATERIALIZED (
    SELECT g.id,g.daily_calories,g.protein_g,g.carbs_g,g.fats_g,g.fiber_g,
      g.macro_preset,g.goal_type,g.loss_rate_lbs_per_week,g.updated_at
    FROM public.goals g WHERE g.user_id=actor AND g.is_active=true
    ORDER BY g.id LIMIT 2
  ), goal_data AS MATERIALIZED (
    SELECT count(*) AS n,
      CASE WHEN count(*)=1 THEN (jsonb_agg(to_jsonb(g)-'updated_at' ORDER BY g.id))->0 END AS raw_goal,
      CASE WHEN count(*)=1 THEN (jsonb_agg(to_jsonb(g.updated_at) ORDER BY g.id))->0 END AS goal_updated_at
    FROM goal_rows g
  ), goal_checked AS MATERIALIZED (
    SELECT n,goal_updated_at,
      CASE WHEN raw_goal IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM jsonb_each(raw_goal) kv
          WHERE kv.key IN ('daily_calories','protein_g','carbs_g','fats_g','fiber_g')
          AND (jsonb_typeof(kv.value) IS DISTINCT FROM 'number' OR
            CASE WHEN jsonb_typeof(kv.value)='number' THEN (kv.value::text)::numeric<0 ELSE false END))
        AND (raw_goal->>'daily_calories')::numeric>0
      THEN raw_goal ELSE NULL END AS goal
    FROM goal_data
  ), scoped AS MATERIALIZED (
    SELECT c.*,g.n AS goal_count,g.goal,g.goal_updated_at,
      c.today-29 AS window_start,
      coalesce(c.started_on,c.today)+((c.review_day-extract(dow FROM coalesce(c.started_on,c.today))::integer+7)%7) AS due
    FROM context_input c CROSS JOIN goal_checked g
  ), tracker_rows AS MATERIALIZED (
    SELECT t.id,t.unit FROM public.trackers t CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND t.user_id=actor AND t.is_default=true
      AND t.name ILIKE 'weight'
    ORDER BY t.id LIMIT 2
  ), checkin_rows AS MATERIALIZED (
    SELECT w.id,w.date,w.weight,w.updated_at,w.created_at
    FROM public.check_ins w CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND w.user_id=actor AND w.weight IS NOT NULL
      AND w.date>=c.window_start AND w.date<c.today
    ORDER BY w.id LIMIT 5001
  ), entry_rows AS MATERIALIZED (
    SELECT w.id,w.tracker_id,w.date,w.value,w.created_at
    FROM public.tracker_entries w JOIN tracker_rows t ON t.id=w.tracker_id CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND w.user_id=actor
      AND w.date>=c.window_start AND w.date<c.today
    ORDER BY w.id LIMIT 5001
  ), meal_rows AS MATERIALIZED (
    SELECT m.id,m.date,m.meal_type FROM public.meals m CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND m.user_id=actor
      AND m.date>=c.window_start AND m.date<c.today
    ORDER BY m.id LIMIT 501
  ), item_rows AS MATERIALIZED (
    SELECT i.id,i.meal_id,i.calories,i.is_scheduled,i.protein,i.carbs,i.fats,i.fiber,i.nutrition_revision,
      CASE WHEN i.nutrition_revision IS NOT NULL THEN
        tdee_scheduler_private.read_item_evidence(actor,i.id)->'evidence'
      ELSE NULL END AS nutrition_evidence
    FROM public.meal_items i JOIN meal_rows m ON m.id=i.meal_id
    WHERE i.is_scheduled=false
    ORDER BY i.id LIMIT 5001
  ), arrays AS MATERIALIZED (
    SELECT
      (SELECT count(*) FROM tracker_rows) AS trackers_n,
      (SELECT count(*) FROM checkin_rows) AS checkins_n,
      (SELECT count(*) FROM entry_rows) AS entries_n,
      (SELECT count(*) FROM meal_rows) AS meals_n,
      (SELECT count(*) FROM item_rows) AS items_n,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM tracker_rows t),'[]'::jsonb) AS trackers,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM checkin_rows t),'[]'::jsonb) AS checkins,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM entry_rows t),'[]'::jsonb) AS entries,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM meal_rows t),'[]'::jsonb) AS meals,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM item_rows t),'[]'::jsonb) AS items
  ), payloads AS MATERIALIZED (
    SELECT c.*,a.*,
      jsonb_build_object('ownerId',actor,'today',c.today,'timezone',c.timezone,
        'dateOfBirth',c.date_of_birth,'journeyStartDate',c.journey_start_date,
        'currentGoal',c.goal,'premium',c.premium,'settings',c.settings_record) AS context_payload,
      CASE WHEN c.premium AND c.enabled THEN jsonb_build_object(
        'timezone',c.timezone,'dateOfBirth',c.date_of_birth,'journeyStartDate',c.journey_start_date,
        'nutritionFieldsVersion','logged-macros-v1','nutritionEvidenceVersion','user-entered-v1','trackers',a.trackers,'trackerWeights',a.entries,'checkIns',a.checkins,'meals',a.meals,'items',a.items)
      END AS sources,
      CASE WHEN c.premium AND c.enabled THEN jsonb_build_object('trackers',a.trackers_n,
        'trackerWeights',a.entries_n,'checkIns',a.checkins_n,'meals',a.meals_n,'items',a.items_n)
      END AS counts
    FROM scoped c CROSS JOIN arrays a
  ), fingerprinted AS MATERIALIZED (
    SELECT p.*,encode(sha256(convert_to(p.context_payload::text,'UTF8')),'hex') AS context_fingerprint
    FROM payloads p
  )
  SELECT p.valid_zone,p.goal_count,p.trackers_n,p.checkins_n,p.entries_n,p.meals_n,p.items_n,
    jsonb_build_object('version','observed-snapshot-v1','ownerId',actor,'capturedAt',captured_at,
      'context',jsonb_build_object('ownerId',actor,'premium',p.premium,'enabled',p.enabled,
        'reviewDay',p.review_day,'today',p.today,'nextReviewDate',p.due,'reviewDue',false,
        'currentGoal',p.goal,'proposal',NULL,'profile',jsonb_build_object('journey_start_date',p.journey_start_date),
        'fingerprint',p.context_fingerprint,'safety',jsonb_build_object('enabled',false,'eligibility','unverified')) ||
        CASE WHEN p.premium
          THEN jsonb_build_object('accessValidUntil',p.access_info->'validUntil')
          ELSE '{}'::jsonb END,
      'sourceFingerprint',encode(sha256(convert_to(jsonb_build_object(
        'context',p.context_payload,'profileUpdatedAt',p.updated_at,'goalUpdatedAt',p.goal_updated_at,
        'sources',p.sources,'counts',p.counts)::text,'UTF8')),'hex'),
      'counts',p.counts,'sources',p.sources)
  INTO profile_ok,goal_count,tracker_count,checkin_count,entry_count,meal_count,item_count,result
  FROM fingerprinted p;

  IF NOT FOUND OR profile_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable';
  END IF;
  IF goal_count>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='active_goal_conflict'; END IF;
  IF tracker_count>1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tracker_unavailable'; END IF;
  IF meal_count>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='meal_limit'; END IF;
  IF checkin_count>5000 OR entry_count>5000 OR item_count>5000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_limit';
  END IF;
  RETURN result;
END;
$function$;
CREATE OR REPLACE FUNCTION tdee_rules14_private.accept_rate_proposal(q jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' SET extra_float_digits=3 AS $fn$
DECLARE actor uuid:=tdee_rules14_private.assert_rate_request(q); saved jsonb;admission_result jsonb;result jsonb;reason text:='rate_proposal_unavailable';
 p tdee_rules14_private.proposals;h tdee_rate_anchor_private.anchors;u public.users;g public.goals;
 policy tdee_rules14_private.policy_versions;mc macrogoal_snapshot_review_private.macro_choices;
 payload jsonb;ref jsonb;c jsonb;chain jsonb;verified_chain jsonb;source jsonb;derived jsonb;coverage jsonb;binding jsonb;energy jsonb;energy_input jsonb;
 snapshot jsonb;readiness jsonb;target jsonb;macro jsonb;mb jsonb;expected_review jsonb;expected_limits jsonb;expected_choice jsonb;allocation jsonb;trusted_macro jsonb;
 at_time timestamptz;at_ms bigint;source_ms numeric;today date;k text;n numeric;delta integer;net_delta integer;accepted_count integer;commit_obligations_verified boolean:=false;
 new_goal public.goals;unsigned_receipt jsonb;receipt_record jsonb;receipt_content text;receipt_hash text;final_context jsonb;final_access jsonb;changed_count integer;
BEGIN
 -- Owner lock serializes request replay, manual saves, anchor appends and future
 -- accepted writes. An app-held idempotency key alone never authorizes an effect.
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable';END IF;
 saved:=tdee_rules14_private.read_exact_request(actor,(q->>'requestId')::uuid,q);
 IF saved IS NOT NULL THEN RETURN saved;END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 SELECT * INTO p FROM tdee_rules14_private.proposals WHERE owner_id=actor AND id=(q->>'rateProposalId')::uuid FOR UPDATE;
 IF NOT FOUND OR p.digest IS DISTINCT FROM q->>'rateProposalDigest' OR p.record#>'{payload,anchorReference}' IS DISTINCT FROM q->'anchorReference' THEN
  admission_result:=jsonb_build_object('status','rejected','reason','rate_proposal_unavailable');
 ELSE
  admission_result:=tdee_rules14_private.validate_rate_proposal_locked(actor,p.record,at_time);
 END IF;
 IF admission_result->>'status' IS DISTINCT FROM 'validated' THEN reason:=coalesce(admission_result->>'reason','rate_admission_unverified');
 ELSE
  h:=jsonb_populate_record(NULL::tdee_rate_anchor_private.anchors,admission_result->'anchorRow');
  u:=jsonb_populate_record(NULL::public.users,admission_result->'profileRow');g:=jsonb_populate_record(NULL::public.goals,admission_result->'goalRow');
  policy:=jsonb_populate_record(NULL::tdee_rules14_private.policy_versions,admission_result->'policyRow');
  payload:=admission_result->'payload';ref:=admission_result->'anchorReference';chain:=admission_result->'chain';verified_chain:=admission_result->'verifiedChain';binding:=admission_result->'binding';target:=admission_result->'target';
  source_ms:=(admission_result->>'sourceMs')::numeric;delta:=(admission_result->>'delta')::integer;net_delta:=(admission_result->>'netDelta')::integer;accepted_count:=(admission_result->>'acceptedCount')::integer;
  commit_obligations_verified:=true;
 END IF;
 IF commit_obligations_verified THEN
  -- Exact final current-source cut after all locks; later food changes belong to
  -- the next review, not an invented transaction-wide source barrier.
  final_context:=tdee_rules14_private.read_source(actor,payload->'policyBinding')->'snapshot';
  final_access:=tdee_scheduler_private.read_access(actor);
  at_time:=date_trunc('milliseconds',clock_timestamp());at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
  IF final_context->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR final_context#>>'{observation,sourceFingerprint}' IS DISTINCT FROM payload->>'sourceFingerprint' OR
   final_context#>>'{readiness,profileBinding}' IS DISTINCT FROM payload->>'profileBinding' OR final_context#>>'{readiness,journeyBinding}' IS DISTINCT FROM payload->>'journeyBinding' OR
   final_context#>'{readiness,eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR final_context#>'{observation,context,premium}' IS DISTINCT FROM 'true'::jsonb OR
   final_context#>'{observation,context,enabled}' IS DISTINCT FROM 'true'::jsonb OR
   jsonb_typeof(final_context#>'{observation,context,accessValidUntil}') IS DISTINCT FROM 'number' OR (final_context#>>'{observation,context,accessValidUntil}')::numeric<=at_ms OR
   final_access->'allowed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(final_access->'validUntil') IS DISTINCT FROM 'number' OR (final_access->>'validUntil')::numeric<=at_ms OR
   at_ms-source_ms>30000 OR source_ms>at_ms OR p.expires_at_ms<=at_ms OR policy.expires_at<=at_time OR NOT tdee_rules14_private.screening_current(final_context,actor,at_time) OR final_context->'rulesScreening' IS DISTINCT FROM payload->'screeningEvidence' OR
   at_time<=g.created_at OR at_ms-coalesce((verified_chain->>'lastAcceptedAt')::numeric,(h.anchor->>'acceptedAt')::numeric)<(policy.document->>'min_days_between_acceptances')::numeric*86400000::numeric THEN
   reason:='authority_or_source_expired';commit_obligations_verified:=false;
  ELSE
   UPDATE public.goals SET is_active=false WHERE id=g.id AND user_id=actor AND is_active=true AND to_jsonb(goals)=to_jsonb(g);
   GET DIAGNOSTICS changed_count=ROW_COUNT;
   IF changed_count<>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_goal_cas_conflict';END IF;
   INSERT INTO public.goals(user_id,goal_type,goal_intensity,target_weight,daily_calories,protein_g,carbs_g,fats_g,fiber_g,is_active,
    loss_rate_lbs_per_week,start_date,start_journey_date,macro_preset,base_daily_calories,last_adaptive_update,created_at,updated_at)
   VALUES(actor,g.goal_type,g.goal_intensity,g.target_weight,(target->>'calories')::integer,(target->>'proteinG')::integer,(target->>'carbsG')::integer,
    (target->>'fatsG')::integer,(target->>'fiberG')::integer,true,g.loss_rate_lbs_per_week,g.start_date,g.start_journey_date,g.macro_preset,
    (h.anchor->>'baselineIntakeKcal')::integer,at_time,at_time,at_time) RETURNING * INTO new_goal;
   IF new_goal.id=g.id OR new_goal.user_id IS DISTINCT FROM actor OR new_goal.is_active IS DISTINCT FROM true OR
    new_goal.created_at IS DISTINCT FROM at_time OR new_goal.updated_at IS DISTINCT FROM at_time OR new_goal.last_adaptive_update IS DISTINCT FROM at_time OR
    new_goal.daily_calories IS DISTINCT FROM (target->>'calories')::integer OR new_goal.protein_g IS DISTINCT FROM (target->>'proteinG')::integer OR
    new_goal.carbs_g IS DISTINCT FROM (target->>'carbsG')::integer OR new_goal.fats_g IS DISTINCT FROM (target->>'fatsG')::integer OR new_goal.fiber_g IS DISTINCT FROM (target->>'fiberG')::integer OR
    (to_jsonb(new_goal)-ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']) IS DISTINCT FROM
    (to_jsonb(g)-ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_goal_write_changed';END IF;
   unsigned_receipt:=jsonb_build_object('version','rules14-acceptance-receipt-v1','status','committed','canonicalEncoding','pg-jsonb-v1','sequence',accepted_count+1,
    'request',q,'anchorReference',ref,'previousGoalSnapshot',to_jsonb(g),'acceptedGoalSnapshot',to_jsonb(new_goal),'acceptedAt',at_ms,'deltaKcal',delta,'netDeltaKcal',net_delta,
    'previousReceiptDigest',verified_chain->'lastReceiptDigest','acceptanceEvidence',jsonb_build_object('contract','rules14-as-of-revalidated-v1','sourceFingerprint',payload->>'sourceFingerprint',
    'sourceCapturedAt',source_ms,'policyRevision',policy.revision,'screeningRequestId',payload#>'{screeningEvidence,requestId}','screeningVersion',payload#>'{screeningEvidence,rowVersion}','policyDigest',policy.digest,
    'profileBinding',payload->>'profileBinding','journeyBinding',payload->>'journeyBinding'));
   receipt_content:=unsigned_receipt::text;receipt_hash:=encode(sha256(convert_to(receipt_content,'UTF8')),'hex');
   receipt_record:=unsigned_receipt||jsonb_build_object('canonicalContent',receipt_content,'receiptDigest',receipt_hash);
   IF octet_length(receipt_record::text)>65536 OR NOT tdee_rules14_private.valid_content(receipt_record,receipt_content,receipt_hash,'receiptDigest') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_receipt_encoding_invalid';END IF;
   INSERT INTO tdee_rules14_private.requests(owner_id,request_id,request,result) VALUES(actor,(q->>'requestId')::uuid,q,receipt_record);
   INSERT INTO tdee_rules14_private.receipts(owner_id,request_id,proposal_id,proposal_digest,anchor_version,source_request_id,source_goal_id,sequence,prior_sequence,
    previous_receipt_digest,receipt_digest,canonical_content,record,previous_goal,accepted_goal,accepted_at_ms)
   VALUES(actor,(q->>'requestId')::uuid,p.id,p.digest,h.version,h.source_request_id,h.source_goal_id,accepted_count+1,CASE WHEN accepted_count=0 THEN NULL ELSE accepted_count END,
    verified_chain->>'lastReceiptDigest',receipt_hash,receipt_content,receipt_record,to_jsonb(g),to_jsonb(new_goal),at_ms);
   -- Verify the actual persisted post-state, not a manufactured success envelope.
   chain:=tdee_rules14_private.read_chain(actor);
   -- The outer statement timestamp predates this function's writes. Capture the
   -- actual post-read time explicitly; never rewrite proposal/provider expiry.
   at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
   chain:=jsonb_set(chain,'{capturedAt}',to_jsonb(at_ms));
   verified_chain:=tdee_rules14_private.verify_chain(chain,at_ms);
   IF verified_chain->>'kind' IS DISTINCT FROM 'rules14_chain_verified' OR (verified_chain->>'acceptedCount')::integer<>accepted_count+1 OR
    verified_chain->>'lastReceiptDigest' IS DISTINCT FROM receipt_hash OR verified_chain->'currentGoal' IS DISTINCT FROM to_jsonb(new_goal) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_postwrite_chain_invalid';END IF;
   RETURN receipt_record;
  END IF;
 END IF;
 result:=jsonb_build_object('version','rules14-acceptance-receipt-v1','status','rejected','reason',reason,'request',q);
 INSERT INTO tdee_rules14_private.requests(owner_id,request_id,request,result) VALUES(actor,(q->>'requestId')::uuid,q,result);
 RETURN result;
END $fn$;
CREATE OR REPLACE FUNCTION tdee_rules14_chain_private.verify_chain(v jsonb,now_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp SET extra_float_digits=3 AS $$
DECLARE owner_id text; h jsonb; a jsonb; ref jsonb; prior jsonb; net bigint:=0; last_at bigint; last_digest jsonb:='null';
 row_value jsonb;r jsonb;q jsonb;p jsonb;payload jsonb;g jsonb;old_goal jsonb;policy jsonb;review jsonb;e jsonb;target jsonb;screen jsonb;nutrition jsonb;pe jsonb;allocation jsonb;nr jsonb;logs jsonb;sen jsonb;ratio float8;avg_intake float8;observed float8;target_rate float8;expenditure float8;lo_delta float8;hi_delta float8;raw_delta float8;direction float8;edge_rate float8;room float8;cap float8;
 idx int:=0; req_ids jsonb:='[]';proposal_ids jsonb:='[]';goal_ids jsonb;field text; goal_key text;target_key text;
 mutable text[]:=ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories'];
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR v->>'version' IS DISTINCT FROM 'rules14-chain-source-v1' OR NOT tdee_rules14_chain_private.uuid(v->'ownerId') OR now_ms IS NULL OR now_ms<0 OR now_ms>9007199254740991
 OR NOT tdee_rules14_chain_private.integer(v->'capturedAt') OR (v->>'capturedAt')::bigint>now_ms OR now_ms-(v->>'capturedAt')::bigint>30000
 OR jsonb_typeof(v->'anchorHead') IS DISTINCT FROM 'object' OR jsonb_typeof(v->'rows') IS DISTINCT FROM 'array'
 OR NOT tdee_rules14_chain_private.integer(v->'totalCount') OR (v->>'totalCount')::int NOT BETWEEN 0 AND 1000
 OR jsonb_array_length(v->'rows')<>(v->>'totalCount')::int OR jsonb_typeof(v->'currentGoal') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_source'; END IF;
 owner_id:=v->>'ownerId';h:=v->'anchorHead';a:=h->'anchor';
 IF h->>'kind' IS DISTINCT FROM 'rate_anchor_head' OR h->>'ownerId' IS DISTINCT FROM owner_id OR NOT tdee_rules14_chain_private.integer(h->'version') OR (h->>'version')::bigint<1
 OR NOT tdee_rules14_chain_private.uuid(h->'sourceRequestId') OR NOT tdee_rules14_chain_private.uuid(h->'sourceGoalId') OR jsonb_typeof(a) IS DISTINCT FROM 'object'
 OR a->>'contract' IS DISTINCT FROM 'accepted-intake-rate-anchor-v1' OR a->>'ownerId' IS DISTINCT FROM owner_id OR a->'initialGoalId' IS DISTINCT FROM h->'sourceGoalId'
 OR jsonb_typeof(a->'sourceReceipt') IS DISTINCT FROM 'object' OR a#>'{sourceReceipt,requestId}' IS DISTINCT FROM h->'sourceRequestId'
 OR coalesce(a#>>'{sourceReceipt,operation}','') NOT IN ('initial_onboarding','manual_goal') OR jsonb_typeof(a->'baselineGoalSnapshot') IS DISTINCT FROM 'object'
 OR a#>'{baselineGoalSnapshot,id}' IS DISTINCT FROM h->'sourceGoalId' OR a#>>'{baselineGoalSnapshot,user_id}' IS DISTINCT FROM owner_id OR a#>'{baselineGoalSnapshot,is_active}' IS DISTINCT FROM 'true'::jsonb
 OR NOT tdee_rules14_chain_private.integer(a->'acceptedAt') OR (a->>'acceptedAt')::bigint NOT BETWEEN 0 AND now_ms
 OR (a->>'acceptedAt')::bigint IS DISTINCT FROM tdee_rules14_chain_private.instant(a->'initialGoalRevision') OR a->'initialGoalRevision' IS DISTINCT FROM a#>'{baselineGoalSnapshot,updated_at}'
 OR tdee_rules14_chain_private.instant(a#>'{baselineGoalSnapshot,created_at}') IS DISTINCT FROM (a->>'acceptedAt')::bigint
 OR NOT tdee_rules14_chain_private.integer(a->'baselineIntakeKcal') OR (a->>'baselineIntakeKcal')::bigint<=0 OR a->'baselineIntakeKcal' IS DISTINCT FROM a#>'{baselineGoalSnapshot,daily_calories}'
 OR a->'acceptedCount' IS DISTINCT FROM '0'::jsonb OR a->'acceptedDeltaKcal' IS DISTINCT FROM '0'::jsonb OR a->'lastAcceptedAt' IS DISTINCT FROM 'null'::jsonb
 OR a->'earliestReviewAt' IS DISTINCT FROM to_jsonb((a->>'acceptedAt')::bigint+14*86400000::bigint)
 OR NOT tdee_rules14_chain_private.hash(a->'profileBinding') OR NOT tdee_rules14_chain_private.hash(a->'journeyBinding')
 OR v->'currentProfileBinding' IS DISTINCT FROM a->'profileBinding' OR v->'currentJourneyBinding' IS DISTINCT FROM a->'journeyBinding'
 OR v->'currentJourneyStartDate' IS DISTINCT FROM a->'journeyStartDate' OR v->'currentJourneyRestartCount' IS DISTINCT FROM a->'journeyRestartCount' THEN RAISE EXCEPTION 'invalid_anchor'; END IF;
 ref:=jsonb_build_object('ownerId',owner_id,'version',h->'version','sourceRequestId',h->'sourceRequestId','sourceGoalId',h->'sourceGoalId');
 prior:=a->'baselineGoalSnapshot';last_at:=(a->>'acceptedAt')::bigint;goal_ids:=jsonb_build_array(prior->'id');
 FOR row_value IN SELECT value FROM jsonb_array_elements(v->'rows') LOOP
  idx:=idx+1;r:=row_value->'receipt';p:=row_value->'proposal';q:=r->'request';
  IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR jsonb_typeof(p) IS DISTINCT FROM 'object'
  OR (SELECT string_agg(key,',' ORDER BY key) FROM jsonb_object_keys(r-CASE WHEN r->>'canonicalEncoding'='pg-jsonb-v1' THEN 'canonicalEncoding' ELSE '_unused' END) key) IS DISTINCT FROM 'acceptanceEvidence,acceptedAt,acceptedGoalSnapshot,anchorReference,canonicalContent,deltaKcal,netDeltaKcal,previousGoalSnapshot,previousReceiptDigest,receiptDigest,request,sequence,status,version'
  OR r->>'version' IS DISTINCT FROM 'rules14-acceptance-receipt-v1' OR r->>'status' IS DISTINCT FROM 'committed' OR r->'sequence' IS DISTINCT FROM to_jsonb(idx)
  OR NOT tdee_rules14_chain_private.integer(r->'acceptedAt') OR (r->>'acceptedAt')::bigint<=last_at OR (r->>'acceptedAt')::bigint>(v->>'capturedAt')::bigint
  OR r->'previousReceiptDigest' IS DISTINCT FROM last_digest OR NOT tdee_rules14_chain_private.hash(r->'receiptDigest') OR r->'anchorReference' IS DISTINCT FROM ref
  OR jsonb_typeof(q) IS DISTINCT FROM 'object' OR (SELECT string_agg(key,',' ORDER BY key) FROM jsonb_object_keys(q) key) IS DISTINCT FROM 'anchorReference,ownerId,rateProposalDigest,rateProposalId,requestId,version'
  OR q->>'version' IS DISTINCT FROM 'rules14-acceptance-request-v1' OR q->>'ownerId' IS DISTINCT FROM owner_id OR NOT tdee_rules14_chain_private.uuid(q->'requestId') OR NOT tdee_rules14_chain_private.uuid(q->'rateProposalId')
  OR NOT tdee_rules14_chain_private.hash(q->'rateProposalDigest') OR q->'anchorReference' IS DISTINCT FROM ref OR req_ids @> jsonb_build_array(q->'requestId') OR proposal_ids @> jsonb_build_array(q->'rateProposalId')
  OR NOT tdee_rules14_chain_private.content_valid(r,'receiptDigest') THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
  IF octet_length(tdee_rules14_chain_private.canonical(p))>65536 OR (SELECT string_agg(key,',' ORDER BY key) FROM jsonb_object_keys(p) key) IS DISTINCT FROM 'canonicalContent,digest,expiresAt,id,ownerId,payload,version'
  OR p->>'version' IS DISTINCT FROM 'rules14-proposal-record-v1' OR p->>'ownerId' IS DISTINCT FROM owner_id OR p->'id' IS DISTINCT FROM q->'rateProposalId' OR p->'digest' IS DISTINCT FROM q->'rateProposalDigest'
  OR NOT tdee_rules14_chain_private.integer(p->'expiresAt') OR (p->>'expiresAt')::bigint<=(r->>'acceptedAt')::bigint
  OR jsonb_typeof(p->'payload') IS DISTINCT FROM 'object' OR p#>>'{payload,contract}' IS DISTINCT FROM 'explicit-rules14-acceptance-v1'
  OR p#>'{payload,actionable}' IS DISTINCT FROM 'false'::jsonb OR p#>'{payload,requiresExplicitAcceptance}' IS DISTINCT FROM 'true'::jsonb OR NOT tdee_rules14_chain_private.content_valid(p,'digest') THEN RAISE EXCEPTION 'invalid_proposal'; END IF;
  payload:=p->'payload';g:=r->'acceptedGoalSnapshot';old_goal:=r->'previousGoalSnapshot';policy:=payload->'policySnapshot';review:=payload->'decision';e:=r->'acceptanceEvidence';
  IF payload->'anchorReference' IS DISTINCT FROM ref OR payload->'anchorSnapshot' IS DISTINCT FROM a OR old_goal IS DISTINCT FROM prior OR payload->'goalSnapshot' IS DISTINCT FROM prior
  OR jsonb_typeof(g) IS DISTINCT FROM 'object' OR g->>'user_id' IS DISTINCT FROM owner_id OR g->'is_active' IS DISTINCT FROM 'true'::jsonb OR NOT tdee_rules14_chain_private.uuid(g->'id') OR goal_ids @> jsonb_build_array(g->'id')
  OR jsonb_typeof(policy) IS DISTINCT FROM 'object' OR jsonb_typeof(review) IS DISTINCT FROM 'object' OR jsonb_typeof(e) IS DISTINCT FROM 'object'
  OR NOT tdee_rules14_chain_private.hash(policy->'digest') OR review->>'version' IS DISTINCT FROM 'rules14-decision-v1'
  OR review->>'kind' IS DISTINCT FROM 'rules14_candidate' OR review->'deltaKcal' IS DISTINCT FROM r->'deltaKcal' OR review->'netDeltaKcal' IS DISTINCT FROM r->'netDeltaKcal'
  OR payload->'profileBinding' IS DISTINCT FROM a->'profileBinding' OR payload->'journeyBinding' IS DISTINCT FROM a->'journeyBinding'
  OR NOT tdee_rules14_chain_private.integer(payload->'preparedAt') OR (payload->>'preparedAt')::bigint>(r->>'acceptedAt')::bigint OR NOT tdee_rules14_chain_private.integer(payload->'sourceCapturedAt')
  OR (payload->>'sourceCapturedAt')::bigint>(payload->>'preparedAt')::bigint OR (r->>'acceptedAt')::bigint-(payload->>'sourceCapturedAt')::bigint>30000
  OR e->>'contract' IS DISTINCT FROM 'rules14-as-of-revalidated-v1' OR e->'sourceFingerprint' IS DISTINCT FROM payload->'sourceFingerprint' OR NOT tdee_rules14_chain_private.hash(e->'sourceFingerprint')
  OR e->'sourceCapturedAt' IS DISTINCT FROM payload->'sourceCapturedAt' OR e->'profileBinding' IS DISTINCT FROM a->'profileBinding' OR e->'journeyBinding' IS DISTINCT FROM a->'journeyBinding'
  OR e->'policyDigest' IS DISTINCT FROM payload#>'{policyBinding,digest}' OR e->'policyRevision' IS DISTINCT FROM payload#>'{policyBinding,revision}'
  OR policy->'enabled' IS DISTINCT FROM 'true'::jsonb OR policy->>'scope' IS DISTINCT FROM 'screened-adult-general-v1' OR policy->>'engine_version' IS DISTINCT FROM 'rules14-v1'
  OR payload#>'{policyBinding,revision}' IS DISTINCT FROM policy->'revision'
  OR payload#>'{policyBinding,version}' IS DISTINCT FROM policy->'version' OR payload#>'{policyBinding,digest}' IS DISTINCT FROM policy->'digest' OR payload#>'{policyBinding,engineVersion}' IS DISTINCT FROM policy->'engine_version'
  OR coalesce(tdee_rules14_chain_private.instant(policy->'expires_at'),0)<=(r->>'acceptedAt')::bigint THEN RAISE EXCEPTION 'invalid_binding'; END IF;
  screen:=payload->'screeningEvidence';nutrition:=payload->'nutritionEvidence';pe:=nutrition->'policyEvidence';
  IF jsonb_typeof(screen) IS DISTINCT FROM 'object' OR screen->>'version' IS DISTINCT FROM 'rules-screening-v1' OR screen->>'copyVersion' IS DISTINCT FROM 'rules-screening-copy-v1'
  OR screen->>'ownerId' IS DISTINCT FROM owner_id OR screen->'current' IS DISTINCT FROM 'true'::jsonb OR screen->>'response' IS DISTINCT FROM 'eligible'
  OR NOT tdee_rules14_chain_private.uuid(screen->'requestId') OR NOT tdee_rules14_chain_private.integer(screen->'rowVersion') OR (screen->>'rowVersion')::bigint<1
  OR e->'screeningRequestId' IS DISTINCT FROM screen->'requestId' OR e->'screeningVersion' IS DISTINCT FROM screen->'rowVersion'
  OR screen->'profileBinding' IS DISTINCT FROM a->'profileBinding' OR screen->'journeyBinding' IS DISTINCT FROM a->'journeyBinding' OR screen->'profileUpdatedAt' IS DISTINCT FROM payload->'profileUpdatedAt'
  OR tdee_rules14_chain_private.instant(screen->'acceptedAt') IS NULL OR tdee_rules14_chain_private.instant(screen->'acceptedAt')>(r->>'acceptedAt')::bigint
  OR coalesce(tdee_rules14_chain_private.instant(screen->'expiresAt'),0)<=(r->>'acceptedAt')::bigint
  OR (p->>'expiresAt')::bigint>(payload->>'sourceCapturedAt')::bigint+30000
  OR payload->'historyBinding' IS DISTINCT FROM jsonb_build_object('acceptedCount',idx-1,'acceptedDeltaKcal',net,'lastAcceptedAt',CASE WHEN idx>1 THEN last_at ELSE NULL END,'lastReceiptDigest',last_digest,'baselineAcceptedAt',a->'acceptedAt','baselineIntakeKcal',a->'baselineIntakeKcal')
  THEN RAISE EXCEPTION 'invalid_historical_screening_or_history';END IF;
  IF jsonb_typeof(nutrition) IS DISTINCT FROM 'object' OR jsonb_typeof(pe) IS DISTINCT FROM 'object' OR pe->>'version' IS DISTINCT FROM 'nutrition-policy-application-v1'
  OR pe->'policyVersion' IS DISTINCT FROM policy->'version' OR pe->'policyDigest' IS DISTINCT FROM policy->'digest' OR pe->'profileBinding' IS DISTINCT FROM a->'profileBinding'
  OR pe->'journeyBinding' IS DISTINCT FROM a->'journeyBinding' OR pe->'sourceFingerprint' IS DISTINCT FROM payload->'sourceFingerprint'
  OR NOT tdee_rules14_chain_private.integer(pe->'expiresAt') OR (pe->>'expiresAt')::bigint>least((p->>'expiresAt')::bigint,tdee_rules14_chain_private.instant(screen->'expiresAt'),tdee_rules14_chain_private.instant(policy->'expires_at'))
  THEN RAISE EXCEPTION 'invalid_historical_nutrition';END IF;
  nr:=payload->'nutritionReference';ratio:=CASE WHEN old_goal->>'goal_type'='lose' THEN (policy->>'protein_min_g_per_kg_loss')::float8 ELSE (policy->>'protein_min_g_per_kg_other')::float8 END;
  IF jsonb_typeof(nr) IS DISTINCT FROM 'object' OR nr->>'strategy' IS DISTINCT FROM 'actual-known-non-obese-weight-v1'
  OR NOT tdee_rules14_macro_private.number_ok(nr->'weightKg',0.001,10000) OR NOT tdee_rules14_macro_private.number_ok(nr->'heightCm',100,250)
  OR (nr->>'bmi')::float8 IS DISTINCT FROM (nr->>'weightKg')::float8 / power((nr->>'heightCm')::float8/100,2)
  OR NOT tdee_rules14_macro_private.number_ok(nr->'bmi',18.5,30) OR (nr->>'bmi')::float8>=30
  OR ratio IS NULL OR ratio<=0 OR (policy->>'protein_max_g_per_kg')::float8<ratio OR (policy->>'protein_max_g_per_kg')::float8>4
  OR (policy->>'fat_min_fraction')::float8<0.2 OR (policy->>'fat_max_fraction')::float8>0.35 OR (policy->>'carbs_min_g')::float8<130
  OR nutrition->'limits' IS DISTINCT FROM jsonb_build_object('proteinMinG',ratio*(nr->>'weightKg')::float8,'proteinMaxG',(policy->>'protein_max_g_per_kg')::float8*(nr->>'weightKg')::float8,'carbsMinG',policy->'carbs_min_g','carbsMaxG',10000,'fatsMinG',0,'fatsMaxG',10000,'fatMinFraction',policy->'fat_min_fraction','fatMaxFraction',policy->'fat_max_fraction')
  OR nutrition->'binding' IS DISTINCT FROM jsonb_build_object('ownerId',owner_id,'goalId',old_goal->'id','goalRevision',old_goal->'updated_at','preset',old_goal->'macro_preset','sourceFingerprint',payload->'sourceFingerprint','policyVersion',policy->'version','policyDigest',policy->'digest')
  OR NOT tdee_rules14_chain_private.uuid(nutrition#>'{customChoice,consentId}') OR NOT tdee_rules14_chain_private.integer(nutrition#>'{customChoice,choiceVersion}') OR (nutrition#>>'{customChoice,choiceVersion}')::bigint<1
  THEN RAISE EXCEPTION 'invalid_historical_reference';END IF;
  logs:=review->'loggedIntake';sen:=review->'sensitivity';
  IF logs->>'status' IS DISTINCT FROM 'explicit_confirmed_days' OR NOT tdee_rules14_macro_private.number_ok(logs->'averageLoggedCaloriesOnConfirmedDays',0.001,10000)
  OR NOT tdee_rules14_chain_private.integer(logs->'validCalorieDayCount') OR (logs->>'validCalorieDayCount')::bigint<10 OR logs->'unknownCalorieDayCount' IS DISTINCT FROM '0'::jsonb OR logs->'confirmedDayCount' IS DISTINCT FROM logs->'validCalorieDayCount'
  OR sen->>'status' IS DISTINCT FROM 'descriptive' OR sen->'outsideToleranceAcrossEnvelope' IS DISTINCT FROM 'true'::jsonb
  OR NOT tdee_rules14_macro_private.number_ok(review->'observedRateKgPerWeek',-10000,10000) OR NOT tdee_rules14_macro_private.number_ok(review->'targetRateKgPerWeek',-10000,10000)
  OR NOT tdee_rules14_macro_private.number_ok(sen->'lowerKgPerWeek',-10000,10000) OR NOT tdee_rules14_macro_private.number_ok(sen->'upperKgPerWeek',-10000,10000) OR (sen->>'lowerKgPerWeek')::float8>(sen->>'upperKgPerWeek')::float8
  OR review->'sourceFingerprint' IS DISTINCT FROM payload->'sourceFingerprint' OR review->'sourceCapturedAt' IS DISTINCT FROM payload->'sourceCapturedAt' OR review#>'{conversion,kcalPerKg}' IS DISTINCT FROM '7700'::jsonb OR review#>'{conversion,statisticalConfidenceClaim}' IS DISTINCT FROM 'false'::jsonb OR review->'targetCalories' IS DISTINCT FROM payload#>'{target,calories}'
  THEN RAISE EXCEPTION 'invalid_historical_intake_evidence';END IF;
  avg_intake:=(logs->>'averageLoggedCaloriesOnConfirmedDays')::float8;observed:=(review->>'observedRateKgPerWeek')::float8;target_rate:=(review->>'targetRateKgPerWeek')::float8;
  expenditure:=avg_intake-observed*7700/7;lo_delta:=avg_intake-(old_goal->>'daily_calories')::float8+(target_rate-(sen->>'upperKgPerWeek')::float8)*7700/7;hi_delta:=avg_intake-(old_goal->>'daily_calories')::float8+(target_rate-(sen->>'lowerKgPerWeek')::float8)*7700/7;
  raw_delta:=CASE WHEN abs(lo_delta)<abs(hi_delta) THEN lo_delta ELSE hi_delta END;direction:=sign(raw_delta);edge_rate:=CASE WHEN raw_delta=lo_delta THEN (sen->>'upperKgPerWeek')::float8 ELSE (sen->>'lowerKgPerWeek')::float8 END;
  room:=CASE WHEN direction<0 THEN least((policy->>'max_total_deficit_kcal')::float8,expenditure*(policy->>'max_total_deficit_fraction')::float8)-(expenditure-(old_goal->>'daily_calories')::float8) ELSE 'Infinity'::float8 END;
  cap:=least(room,abs(raw_delta),200,(policy->>'max_step_kcal')::float8,(old_goal->>'daily_calories')::float8*(policy->>'max_step_fraction')::float8,CASE WHEN direction>0 THEN (policy->>'max_cumulative_delta_kcal')::float8-net ELSE (policy->>'max_cumulative_delta_kcal')::float8+net END,CASE WHEN direction>0 THEN (policy->>'max_intake_kcal')::float8-(old_goal->>'daily_calories')::float8 ELSE (old_goal->>'daily_calories')::float8-(policy->>'min_intake_kcal')::float8 END);
  IF expenditure<=0 OR expenditure>10000 OR (lo_delta<=0 AND hi_delta>=0) OR direction<>sign(target_rate-observed)
  OR review->'estimatedExpenditureKcal' IS DISTINCT FROM to_jsonb(expenditure) OR review->'desiredIntakeKcal' IS DISTINCT FROM to_jsonb(expenditure+target_rate*7700/7)
  OR review->'deltaKcal' IS DISTINCT FROM to_jsonb(direction*floor((cap+1e-9)/(policy->>'increment_kcal')::float8)*(policy->>'increment_kcal')::float8)
  OR review->'calculation' IS DISTINCT FROM jsonb_build_object('method','confirmed-intake-plus-target-minus-observed-v1','edgeKgPerWeek',edge_rate,'unroundedDeltaKcal',raw_delta,'arithmeticEpsilonKcal',1e-9::float8,'incrementKcal',policy->'increment_kcal')
  THEN RAISE EXCEPTION 'invalid_historical_energy_arithmetic';END IF;
  allocation:=tdee_rules14_macro_private.adjust(jsonb_build_object('current',payload->'current','newCalories',payload#>'{target,calories}','now',r->'acceptedAt','sourceFingerprint',payload->'sourceFingerprint','binding',nutrition->'binding','context',nutrition));
  IF allocation->>'kind' IS DISTINCT FROM 'candidate' OR allocation->'target' IS DISTINCT FROM payload->'target' OR allocation->'allocationMode' IS DISTINCT FROM payload->'allocationMode' THEN RAISE EXCEPTION 'invalid_historical_macro_allocation';END IF;
  FOREACH field IN ARRAY ARRAY['max_step_kcal','max_step_fraction','max_cumulative_delta_kcal','min_days_between_acceptances','increment_kcal','min_intake_kcal','max_intake_kcal'] LOOP
   IF jsonb_typeof(policy->field) IS DISTINCT FROM 'number' OR (policy->>field)::numeric<=0 THEN RAISE EXCEPTION 'invalid_policy'; END IF;
  END LOOP;
  IF (policy->>'max_step_kcal')::numeric>200 OR (policy->>'max_step_fraction')::numeric>1 OR NOT tdee_rules14_chain_private.integer(policy->'increment_kcal') OR NOT tdee_rules14_chain_private.integer(policy->'min_days_between_acceptances')
  OR (policy->>'min_days_between_acceptances')::bigint<14 OR (policy->>'max_intake_kcal')::numeric<(policy->>'min_intake_kcal')::numeric
  OR (r->>'acceptedAt')::bigint-last_at<(policy->>'min_days_between_acceptances')::bigint*86400000
  OR NOT tdee_rules14_chain_private.integer(r->'deltaKcal') OR (r->>'deltaKcal')::bigint=0 OR abs((r->>'deltaKcal')::bigint)>(policy->>'max_step_kcal')::numeric
  OR abs((r->>'deltaKcal')::bigint)>(old_goal->>'daily_calories')::double precision*(policy->>'max_step_fraction')::double precision
  OR (r->>'deltaKcal')::bigint%(policy->>'increment_kcal')::bigint<>0 OR r->'deltaKcal' IS DISTINCT FROM payload->'deltaKcal'
  OR r->'netDeltaKcal' IS DISTINCT FROM to_jsonb(net+(r->>'deltaKcal')::bigint) OR r->'netDeltaKcal' IS DISTINCT FROM payload->'netDeltaKcal'
  OR abs((r->>'netDeltaKcal')::numeric)>(policy->>'max_cumulative_delta_kcal')::numeric THEN RAISE EXCEPTION 'invalid_delta'; END IF;
  IF (r->>'deltaKcal')::bigint<0 AND (review->'deficitEvidence' IS DISTINCT FROM jsonb_build_object('version','rules14-deficit-evidence-v1','method','confirmed-intake-minus-observed-rate-v1','measuredExpenditure',false,'clinicalGuarantee',false,'averageLoggedCaloriesOnConfirmedDays',avg_intake,'confirmedDayCount',logs->'confirmedDayCount','observedRateKgPerWeek',observed,'approximateKcalPerKg',7700,'estimatedExpenditureKcal',expenditure,'totalDeficitKcal',expenditure-(payload#>>'{target,calories}')::float8,'maxAllowedDeficitKcal',least((policy->>'max_total_deficit_kcal')::float8,expenditure*(policy->>'max_total_deficit_fraction')::float8)) OR expenditure-(payload#>>'{target,calories}')::float8>least((policy->>'max_total_deficit_kcal')::float8,expenditure*(policy->>'max_total_deficit_fraction')::float8)+1e-9) THEN RAISE EXCEPTION 'invalid_historical_deficit';END IF;
  target:=payload->'target';
  IF jsonb_typeof(target) IS DISTINCT FROM 'object' OR (g->>'daily_calories')::numeric IS DISTINCT FROM (old_goal->>'daily_calories')::numeric+(r->>'deltaKcal')::bigint
  OR (g->>'daily_calories')::numeric IS DISTINCT FROM (a->>'baselineIntakeKcal')::numeric+(r->>'netDeltaKcal')::numeric OR (g->>'daily_calories')::numeric<(policy->>'min_intake_kcal')::numeric OR (g->>'daily_calories')::numeric>(policy->>'max_intake_kcal')::numeric
  OR g->'base_daily_calories' IS DISTINCT FROM a->'baselineIntakeKcal' OR tdee_rules14_chain_private.instant(g->'created_at') IS DISTINCT FROM (r->>'acceptedAt')::bigint
  OR tdee_rules14_chain_private.instant(g->'updated_at') IS DISTINCT FROM (r->>'acceptedAt')::bigint OR jsonb_typeof(e->'acceptanceTimezone') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=e->>'acceptanceTimezone')
  OR g->'last_adaptive_update' IS DISTINCT FROM to_jsonb((to_timestamp((r->>'acceptedAt')::double precision/1000) AT TIME ZONE (e->>'acceptanceTimezone'))::date) THEN RAISE EXCEPTION 'invalid_goal'; END IF;
  FOR goal_key,target_key IN SELECT * FROM (VALUES('daily_calories','calories'),('protein_g','proteinG'),('carbs_g','carbsG'),('fats_g','fatsG'),('fiber_g','fiberG')) x LOOP
   IF NOT tdee_rules14_chain_private.integer(g->goal_key) OR (g->>goal_key)::bigint NOT BETWEEN 0 AND 10000 OR g->goal_key IS DISTINCT FROM target->target_key THEN RAISE EXCEPTION 'invalid_macro'; END IF;
  END LOOP;
  IF abs((g->>'daily_calories')::bigint-4*(g->>'protein_g')::bigint-4*(g->>'carbs_g')::bigint-9*(g->>'fats_g')::bigint)>10
  OR old_goal-mutable IS DISTINCT FROM g-mutable OR payload->'current' IS DISTINCT FROM jsonb_build_object('calories',old_goal->'daily_calories','proteinG',old_goal->'protein_g','carbsG',old_goal->'carbs_g','fatsG',old_goal->'fats_g','fiberG',old_goal->'fiber_g') THEN RAISE EXCEPTION 'invalid_stable_goal'; END IF;
  prior:=g;net:=(r->>'netDeltaKcal')::bigint;last_at:=(r->>'acceptedAt')::bigint;last_digest:=r->'receiptDigest';req_ids:=req_ids||jsonb_build_array(q->'requestId');proposal_ids:=proposal_ids||jsonb_build_array(q->'rateProposalId');goal_ids:=goal_ids||jsonb_build_array(g->'id');
 END LOOP;
 IF prior IS DISTINCT FROM v->'currentGoal' OR v#>>'{currentGoal,user_id}' IS DISTINCT FROM owner_id OR v#>'{currentGoal,is_active}' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'invalid_current_goal'; END IF;
 RETURN jsonb_build_object('kind','rules14_chain_verified','actionable',false,'acceptanceAuthorized',false,'anchorReference',ref,'acceptedCount',idx,'acceptedDeltaKcal',net,'lastAcceptedAt',CASE WHEN idx>0 THEN last_at ELSE NULL END,'lastReceiptDigest',last_digest,'currentGoal',prior,'receiptsVerified',true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('kind','blocked','reason','rate_receipt_chain_unverified','actionable',false,'acceptanceAuthorized',false);
END $$;
CREATE OR REPLACE FUNCTION tdee_rules14_private.accept_rate_proposal(q jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' SET extra_float_digits=3 AS $fn$
DECLARE actor uuid:=tdee_rules14_private.assert_rate_request(q); saved jsonb;admission_result jsonb;result jsonb;reason text:='rate_proposal_unavailable';
 p tdee_rules14_private.proposals;h tdee_rate_anchor_private.anchors;u public.users;g public.goals;
 policy tdee_rules14_private.policy_versions;mc macrogoal_snapshot_review_private.macro_choices;
 payload jsonb;ref jsonb;c jsonb;chain jsonb;verified_chain jsonb;source jsonb;derived jsonb;coverage jsonb;binding jsonb;energy jsonb;energy_input jsonb;
 snapshot jsonb;readiness jsonb;target jsonb;macro jsonb;mb jsonb;expected_review jsonb;expected_limits jsonb;expected_choice jsonb;allocation jsonb;trusted_macro jsonb;
 at_time timestamptz;at_ms bigint;source_ms numeric;today date;k text;n numeric;delta integer;net_delta integer;accepted_count integer;commit_obligations_verified boolean:=false;
 new_goal public.goals;unsigned_receipt jsonb;receipt_record jsonb;receipt_content text;receipt_hash text;final_context jsonb;final_access jsonb;changed_count integer;
BEGIN
 -- Owner lock serializes request replay, manual saves, anchor appends and future
 -- accepted writes. An app-held idempotency key alone never authorizes an effect.
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable';END IF;
 saved:=tdee_rules14_private.read_exact_request(actor,(q->>'requestId')::uuid,q);
 IF saved IS NOT NULL THEN RETURN saved;END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 SELECT * INTO p FROM tdee_rules14_private.proposals WHERE owner_id=actor AND id=(q->>'rateProposalId')::uuid FOR UPDATE;
 IF NOT FOUND OR p.digest IS DISTINCT FROM q->>'rateProposalDigest' OR p.record#>'{payload,anchorReference}' IS DISTINCT FROM q->'anchorReference' THEN
  admission_result:=jsonb_build_object('status','rejected','reason','rate_proposal_unavailable');
 ELSE
  admission_result:=tdee_rules14_private.validate_rate_proposal_locked(actor,p.record,at_time);
 END IF;
 IF admission_result->>'status' IS DISTINCT FROM 'validated' THEN reason:=coalesce(admission_result->>'reason','rate_admission_unverified');
 ELSE
  h:=jsonb_populate_record(NULL::tdee_rate_anchor_private.anchors,admission_result->'anchorRow');
  u:=jsonb_populate_record(NULL::public.users,admission_result->'profileRow');g:=jsonb_populate_record(NULL::public.goals,admission_result->'goalRow');
  policy:=jsonb_populate_record(NULL::tdee_rules14_private.policy_versions,admission_result->'policyRow');
  payload:=admission_result->'payload';ref:=admission_result->'anchorReference';chain:=admission_result->'chain';verified_chain:=admission_result->'verifiedChain';binding:=admission_result->'binding';target:=admission_result->'target';
  source_ms:=(admission_result->>'sourceMs')::numeric;delta:=(admission_result->>'delta')::integer;net_delta:=(admission_result->>'netDelta')::integer;accepted_count:=(admission_result->>'acceptedCount')::integer;
  commit_obligations_verified:=true;
 END IF;
 IF commit_obligations_verified THEN
  -- Exact final current-source cut after all locks; later food changes belong to
  -- the next review, not an invented transaction-wide source barrier.
  final_context:=tdee_rules14_private.read_source(actor,payload->'policyBinding')->'snapshot';
  final_access:=tdee_scheduler_private.read_access(actor);
  at_time:=date_trunc('milliseconds',clock_timestamp());at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
  IF final_context->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR final_context#>>'{observation,sourceFingerprint}' IS DISTINCT FROM payload->>'sourceFingerprint' OR
   final_context#>>'{readiness,profileBinding}' IS DISTINCT FROM payload->>'profileBinding' OR final_context#>>'{readiness,journeyBinding}' IS DISTINCT FROM payload->>'journeyBinding' OR
   final_context#>'{readiness,eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR final_context#>'{observation,context,premium}' IS DISTINCT FROM 'true'::jsonb OR
   final_context#>'{observation,context,enabled}' IS DISTINCT FROM 'true'::jsonb OR
   jsonb_typeof(final_context#>'{observation,context,accessValidUntil}') IS DISTINCT FROM 'number' OR (final_context#>>'{observation,context,accessValidUntil}')::numeric<=at_ms OR
   final_access->'allowed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(final_access->'validUntil') IS DISTINCT FROM 'number' OR (final_access->>'validUntil')::numeric<=at_ms OR
   at_ms-source_ms>30000 OR source_ms>at_ms OR p.expires_at_ms<=at_ms OR policy.expires_at<=at_time OR NOT tdee_rules14_private.screening_current(final_context,actor,at_time) OR final_context->'rulesScreening' IS DISTINCT FROM payload->'screeningEvidence' OR
   at_time<=g.created_at OR at_ms-coalesce((verified_chain->>'lastAcceptedAt')::numeric,(h.anchor->>'acceptedAt')::numeric)<(policy.document->>'min_days_between_acceptances')::numeric*86400000::numeric THEN
   reason:='authority_or_source_expired';commit_obligations_verified:=false;
  ELSE
   UPDATE public.goals SET is_active=false WHERE id=g.id AND user_id=actor AND is_active=true AND to_jsonb(goals)=to_jsonb(g);
   GET DIAGNOSTICS changed_count=ROW_COUNT;
   IF changed_count<>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_goal_cas_conflict';END IF;
   INSERT INTO public.goals(user_id,goal_type,goal_intensity,target_weight,daily_calories,protein_g,carbs_g,fats_g,fiber_g,is_active,
    loss_rate_lbs_per_week,start_date,start_journey_date,macro_preset,base_daily_calories,last_adaptive_update,created_at,updated_at)
   VALUES(actor,g.goal_type,g.goal_intensity,g.target_weight,(target->>'calories')::integer,(target->>'proteinG')::integer,(target->>'carbsG')::integer,
    (target->>'fatsG')::integer,(target->>'fiberG')::integer,true,g.loss_rate_lbs_per_week,g.start_date,g.start_journey_date,g.macro_preset,
    (h.anchor->>'baselineIntakeKcal')::integer,(at_time AT TIME ZONE u.timezone)::date,at_time,at_time) RETURNING * INTO new_goal;
   IF new_goal.id=g.id OR new_goal.user_id IS DISTINCT FROM actor OR new_goal.is_active IS DISTINCT FROM true OR
    new_goal.created_at IS DISTINCT FROM at_time OR new_goal.updated_at IS DISTINCT FROM at_time OR new_goal.last_adaptive_update IS DISTINCT FROM (at_time AT TIME ZONE u.timezone)::date OR
    new_goal.daily_calories IS DISTINCT FROM (target->>'calories')::integer OR new_goal.protein_g IS DISTINCT FROM (target->>'proteinG')::integer OR
    new_goal.carbs_g IS DISTINCT FROM (target->>'carbsG')::integer OR new_goal.fats_g IS DISTINCT FROM (target->>'fatsG')::integer OR new_goal.fiber_g IS DISTINCT FROM (target->>'fiberG')::integer OR
    (to_jsonb(new_goal)-ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']) IS DISTINCT FROM
    (to_jsonb(g)-ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_goal_write_changed';END IF;
   unsigned_receipt:=jsonb_build_object('version','rules14-acceptance-receipt-v1','status','committed','canonicalEncoding','pg-jsonb-v1','sequence',accepted_count+1,
    'request',q,'anchorReference',ref,'previousGoalSnapshot',to_jsonb(g),'acceptedGoalSnapshot',to_jsonb(new_goal),'acceptedAt',at_ms,'deltaKcal',delta,'netDeltaKcal',net_delta,
    'previousReceiptDigest',verified_chain->'lastReceiptDigest','acceptanceEvidence',jsonb_build_object('contract','rules14-as-of-revalidated-v1','sourceFingerprint',payload->>'sourceFingerprint',
    'sourceCapturedAt',source_ms,'policyRevision',policy.revision,'screeningRequestId',payload#>'{screeningEvidence,requestId}','screeningVersion',payload#>'{screeningEvidence,rowVersion}','policyDigest',policy.digest,
    'profileBinding',payload->>'profileBinding','journeyBinding',payload->>'journeyBinding','acceptanceTimezone',u.timezone));
   receipt_content:=unsigned_receipt::text;receipt_hash:=encode(sha256(convert_to(receipt_content,'UTF8')),'hex');
   receipt_record:=unsigned_receipt||jsonb_build_object('canonicalContent',receipt_content,'receiptDigest',receipt_hash);
   IF octet_length(receipt_record::text)>65536 OR NOT tdee_rules14_private.valid_content(receipt_record,receipt_content,receipt_hash,'receiptDigest') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_receipt_encoding_invalid';END IF;
   INSERT INTO tdee_rules14_private.requests(owner_id,request_id,request,result) VALUES(actor,(q->>'requestId')::uuid,q,receipt_record);
   INSERT INTO tdee_rules14_private.receipts(owner_id,request_id,proposal_id,proposal_digest,anchor_version,source_request_id,source_goal_id,sequence,prior_sequence,
    previous_receipt_digest,receipt_digest,canonical_content,record,previous_goal,accepted_goal,accepted_at_ms)
   VALUES(actor,(q->>'requestId')::uuid,p.id,p.digest,h.version,h.source_request_id,h.source_goal_id,accepted_count+1,CASE WHEN accepted_count=0 THEN NULL ELSE accepted_count END,
    verified_chain->>'lastReceiptDigest',receipt_hash,receipt_content,receipt_record,to_jsonb(g),to_jsonb(new_goal),at_ms);
   -- Verify the actual persisted post-state, not a manufactured success envelope.
   chain:=tdee_rules14_private.read_chain(actor);
   -- The outer statement timestamp predates this function's writes. Capture the
   -- actual post-read time explicitly; never rewrite proposal/provider expiry.
   at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
   chain:=jsonb_set(chain,'{capturedAt}',to_jsonb(at_ms));
   verified_chain:=tdee_rules14_private.verify_chain(chain,at_ms);
   IF verified_chain->>'kind' IS DISTINCT FROM 'rules14_chain_verified' OR (verified_chain->>'acceptedCount')::integer<>accepted_count+1 OR
    verified_chain->>'lastReceiptDigest' IS DISTINCT FROM receipt_hash OR verified_chain->'currentGoal' IS DISTINCT FROM to_jsonb(new_goal) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_postwrite_chain_invalid';END IF;
   RETURN receipt_record;
  END IF;
 END IF;
 result:=jsonb_build_object('version','rules14-acceptance-receipt-v1','status','rejected','reason',reason,'request',q);
 INSERT INTO tdee_rules14_private.requests(owner_id,request_id,request,result) VALUES(actor,(q->>'requestId')::uuid,q,result);
 RETURN result;
END $fn$;

-- SOURCE ONLY. Reconcile verified desired baseline state, never attribute who wrote it.
-- Existing immutable anchor history is sufficient only with exact current claim scope.
CREATE FUNCTION tdee_rules14_private.read_anchor_outcome(p_owner uuid,p_scope text,p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE l tdee_scheduler_private.ledger;h tdee_rate_anchor_private.anchors;selection jsonb;s jsonb;derived jsonb;access jsonb;at_time timestamptz;at_ms bigint;
BEGIN
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 SELECT * INTO l FROM tdee_scheduler_private.ledger WHERE owner_id=p_owner AND context_revision=p_scope;
 IF NOT FOUND OR l.record->>'claimId' IS DISTINCT FROM p_claim::text OR l.record->>'status' NOT IN ('claimed','uncertain','completed') THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 selection:=tdee_scheduler_private.current_selection(p_owner);
 IF selection->>'engineVersion' IS DISTINCT FROM 'rules14-v1' OR selection->>'contextRevision' IS DISTINCT FROM p_scope OR selection->>'timezone' IS DISTINCT FROM l.record->>'timezone' THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 -- Never relabel an uncertain offer as baseline calibration.
 IF EXISTS(SELECT 1 FROM tdee_rules14_private.proposals WHERE owner_id=p_owner AND id=p_claim) OR EXISTS(SELECT 1 FROM tdee_rules14_private.issuance_journal WHERE owner_id=p_owner AND proposal_id=p_claim) THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 SELECT * INTO h FROM tdee_rate_anchor_private.anchors WHERE owner_id=p_owner ORDER BY version DESC LIMIT 1;
 -- A pre-existing anchor cannot prove that this unfinished assessment reached bootstrap.
 IF NOT FOUND OR h.created_at<to_timestamp((l.record->>'claimedAt')::double precision/1000) OR h.created_at>at_time THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 s:=tdee_rate_anchor_private.read_source(p_owner);
 IF s->>'ownerId' IS DISTINCT FROM p_owner::text OR s->>'version' IS DISTINCT FROM 'accepted-goal-rate-anchor-source-v1' OR s->'actionable' IS DISTINCT FROM 'false'::jsonb OR s->'unavailable'='true'::jsonb OR
 s->'existingAnchor' IS DISTINCT FROM jsonb_build_object('kind','rate_anchor_head','ownerId',p_owner,'version',h.version,'sourceRequestId',h.source_request_id,'sourceGoalId',h.source_goal_id,'anchor',h.anchor) OR
 s#>>'{receipt,request_id}' IS DISTINCT FROM h.source_request_id::text OR s#>>'{currentGoal,id}' IS DISTINCT FROM h.source_goal_id::text THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 -- Pure derivation strips presence only, preserving the original accepted receipt,
 -- exact goal/profile/journey binding and current source. No reset or append occurs.
 derived:=tdee_rate_anchor_private.derive_initial(jsonb_set(s,'{existingAnchor}','null'::jsonb),p_owner,clock_timestamp());
 IF derived IS DISTINCT FROM h.anchor THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 access:=tdee_scheduler_private.read_access(p_owner);at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF access->'allowed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(access->'validUntil') IS DISTINCT FROM 'number' OR (access->>'validUntil')::numeric<=at_ms OR
 tdee_scheduler_private.current_selection(p_owner)->>'contextRevision' IS DISTINCT FROM p_scope THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 RETURN jsonb_build_object('version','rules14-anchor-outcome-v1','status','current_baseline_verified','ownerId',p_owner,'contextRevision',p_scope,'claimId',p_claim,
 'anchorVersion',h.version,'sourceRequestId',h.source_request_id,'sourceGoalId',h.source_goal_id,'observedAt',at_ms,'actionable',false);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.read_anchor_outcome(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.reconcile_anchor(p_owner uuid,p_scope text,p_claim uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' AS $fn$
DECLARE l tdee_scheduler_private.ledger;proof jsonb;at_ms bigint;prior tdee_scheduler_private.receipt;next_record jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 PERFORM 1 FROM public.users WHERE id=p_owner FOR UPDATE;
 SELECT * INTO l FROM tdee_scheduler_private.ledger WHERE owner_id=p_owner AND context_revision=p_scope FOR UPDATE;
 IF NOT FOUND OR l.revision IS DISTINCT FROM p_revision OR l.record->>'claimId' IS DISTINCT FROM p_claim::text THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 proof:=tdee_rules14_private.read_anchor_outcome(p_owner,p_scope,p_claim);
 IF proof->>'status' IS DISTINCT FROM 'current_baseline_verified' THEN RETURN proof;END IF;
 IF l.record->>'status'='completed' THEN RETURN jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',l.record,'hold',l.hold,'evidence',proof);END IF;
 IF l.record->>'status' NOT IN ('claimed','uncertain') THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF at_ms<greatest((l.record->>'claimedAt')::bigint,coalesce((l.record->>'finishedAt')::bigint,0)) THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 SELECT * INTO prior FROM tdee_scheduler_private.receipt WHERE owner_id=p_owner AND context_revision=p_scope AND claim_id=p_claim;
 IF FOUND THEN
  IF prior.outcome<>'completed' OR prior.daily_key IS DISTINCT FROM l.record->>'key' OR prior.observed_at>at_ms THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 ELSE
  INSERT INTO tdee_scheduler_private.receipt(owner_id,context_revision,claim_id,daily_key,outcome,observed_at) VALUES(p_owner,p_scope,p_claim,l.record->>'key','completed',at_ms);
 END IF;
 next_record:=l.record||jsonb_build_object('status','completed','finishedAt',at_ms,'revision',l.revision+1);
 UPDATE tdee_scheduler_private.ledger SET revision=l.revision+1,record=next_record WHERE owner_id=p_owner AND context_revision=p_scope AND revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='claim_conflict';END IF;
 -- Baseline calibration never clears an existing uncertainty hold or approves an offer.
 RETURN jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',next_record,'hold',l.hold,'evidence',proof);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.reconcile_anchor(uuid,text,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_internal_rules14_anchor_outcome_v1(p_owner uuid,p_scope text,p_claim uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rules14_anchor_reconciliation_off');END IF;
 RETURN tdee_rules14_private.reconcile_anchor(p_owner,p_scope,p_claim,p_revision);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_internal_rules14_anchor_outcome_v1(uuid,text,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_rules14_anchor_outcome_v1(uuid,text,uuid,bigint) TO service_role;

COMMIT;
