-- Additive read-only API. Review before applying; no goals/settings/source writes.
-- One STABLE invocation uses one MVCC snapshot for every context/source read.
BEGIN;
CREATE FUNCTION public.observed_get_tdee_snapshot_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, pg_temp
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
  ), context_input AS MATERIALIZED (
    SELECT p.*,
      CASE WHEN p.valid_zone THEN (captured_at AT TIME ZONE p.timezone)::date END AS today,
      coalesce(s.enabled,false) AS enabled, coalesce(s.review_day,0) AS review_day,
      s.started_on, to_jsonb(s) AS settings_record,
      EXISTS(SELECT 1 FROM public.subscriptions sub
        WHERE sub.user_id=actor::text AND sub.status IN ('active','trialing')
        AND sub.entitlement_ids && ARRAY['pro','Macrogoal Pro','macrogoal_pro','premium']::text[]
        AND (sub.expiration_at IS NULL OR sub.expiration_at>captured_at)) AS premium
    FROM profile p LEFT JOIN macrogoal_observed_private.settings s ON s.user_id=actor
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
    SELECT i.id,i.meal_id,i.calories,i.is_scheduled
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
        'trackers',a.trackers,'trackerWeights',a.entries,'checkIns',a.checkins,'meals',a.meals,'items',a.items)
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
        'fingerprint',p.context_fingerprint,'safety',jsonb_build_object('enabled',false,'eligibility','unverified')),
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
REVOKE ALL ON FUNCTION public.observed_get_tdee_snapshot_v1() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.observed_get_tdee_snapshot_v1() TO authenticated;
COMMENT ON FUNCTION public.observed_get_tdee_snapshot_v1() IS
  'Owner-scoped, read-only observation snapshot. Not a prescription, source-write lock or clinical eligibility approval.';
COMMIT;
