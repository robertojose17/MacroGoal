-- SOURCE ONLY. Genuine refresh precedes read; expiry is never manufactured.
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
