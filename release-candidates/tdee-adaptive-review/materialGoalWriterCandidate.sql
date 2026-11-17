CREATE OR REPLACE FUNCTION macrogoal_goal_write_private.replace_nutrition_goal(p_expected_goal_id uuid, p_expected_updated_at timestamp with time zone, p_request_id uuid, p_goal jsonb, p_profile jsonb, p_expected_user_id uuid, p_expected_profile_updated_at timestamp with time zone, p_operation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE actor uuid:=auth.uid(); u public.users; old_goal public.goals; result public.goals;
 receipt macrogoal_goal_write_private.receipts; candidate jsonb; payload jsonb; target_changed boolean; key text; value numeric;
 today date; start_date_value date; journey_date_value date; profile_candidate public.users; accepted_at timestamptz;
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('initial_onboarding','manual_goal') THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_goal_operation'; END IF;
 IF actor IS DISTINCT FROM p_expected_user_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_changed'; END IF;
 IF p_request_id IS NULL OR p_goal IS NULL OR jsonb_typeof(p_goal)<>'object' OR p_goal='{}'::jsonb OR
 octet_length(p_goal::text)>4096 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_goal) k WHERE k NOT IN
 ('goal_type','goal_intensity','target_weight','daily_calories','protein_g','carbs_g','fats_g','fiber_g','loss_rate_lbs_per_week','start_date','start_journey_date','macro_preset')) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_goal_request'; END IF;
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable'; END IF;
 IF u.timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=u.timezone)
  OR u.created_at IS NULL OR NOT isfinite(u.created_at) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable'; END IF;
 -- The legacy adaptive flag is neither a prerequisite nor changed by this RPC.
 IF (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)>1 THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='active_goal_conflict'; END IF;
 SELECT * INTO old_goal FROM public.goals WHERE user_id=actor AND is_active=true FOR UPDATE;
 IF old_goal.id IS NOT NULL AND (old_goal.created_at IS NULL OR NOT isfinite(old_goal.created_at) OR old_goal.created_at>clock_timestamp()) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='goal_history_unavailable'; END IF;
 payload:=jsonb_build_object('expected_id',p_expected_goal_id,'expected_updated_at',p_expected_updated_at,'goal',p_goal,'profile',p_profile,'expected_profile_updated_at',p_expected_profile_updated_at,'operation',p_operation);
 SELECT * INTO receipt FROM macrogoal_goal_write_private.receipts WHERE user_id=actor AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='goal_request_mismatch'; END IF;
  IF old_goal.id IS DISTINCT FROM receipt.goal_id OR to_jsonb(old_goal) IS DISTINCT FROM receipt.goal_snapshot OR (CASE WHEN receipt.material_profile IS NULL AND receipt.material_profile_updated_at IS NULL
    THEN encode(sha256(convert_to(to_jsonb(u)::text,'UTF8')),'hex') IS DISTINCT FROM receipt.profile_fingerprint
    ELSE receipt.material_profile IS DISTINCT FROM macrogoal_goal_write_private.material_profile_v1(u)
      OR receipt.material_profile_updated_at IS NULL
      OR receipt.material_profile->>'contract' IS DISTINCT FROM 'accepted-goal-material-profile-v1'
    END) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='goal_changed_review_again'; END IF;
  RETURN to_jsonb(old_goal);
 END IF;
 IF u.updated_at IS DISTINCT FROM p_expected_profile_updated_at THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='profile_changed_review_again'; END IF;
 IF p_operation='initial_onboarding' AND (u.onboarding_completed IS TRUE OR p_profile->'onboarding_completed' IS DISTINCT FROM 'true'::jsonb) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='initial_profile_only'; END IF;
 IF p_operation='manual_goal' AND (u.onboarding_completed IS DISTINCT FROM true OR (p_profile-'activity_level')<>'{}'::jsonb) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='manual_profile_only'; END IF;
 IF old_goal.id IS DISTINCT FROM p_expected_goal_id OR old_goal.updated_at IS DISTINCT FROM p_expected_updated_at THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='goal_changed_review_again'; END IF;
 today:=(now() AT TIME ZONE u.timezone)::date;
 IF p_profile IS NULL OR jsonb_typeof(p_profile)<>'object' OR octet_length(p_profile::text)>12000 OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN
 ('activity_level','sex','date_of_birth','height','current_weight','preferred_units','dietary_restrictions','protein_preferences','recipe_styles','disliked_foods','onboarding_completed','journey_start_date','journey_start_weight')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_profile_request'; END IF;
 -- Only activity can accompany an ordinary edit. The larger bundle is initial
 -- onboarding, never a way to overwrite a completed profile or restart a journey.
 IF (p_profile-'activity_level')<>'{}'::jsonb AND (u.onboarding_completed IS TRUE OR p_profile->'onboarding_completed' IS DISTINCT FROM 'true'::jsonb) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='initial_profile_only'; END IF;
 IF p_profile ? 'activity_level' AND (jsonb_typeof(p_profile->'activity_level') IS DISTINCT FROM 'string' OR p_profile->>'activity_level' NOT IN ('sedentary','light','moderate','active','very_active')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_profile_activity'; END IF;
 IF p_profile ? 'onboarding_completed' THEN
  IF NOT p_profile ?& ARRAY['sex','date_of_birth','height','current_weight','activity_level','preferred_units','dietary_restrictions','protein_preferences','recipe_styles','disliked_foods'] THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='incomplete_initial_profile'; END IF;
  IF jsonb_typeof(p_profile->'sex') IS DISTINCT FROM 'string' OR p_profile->>'sex' NOT IN ('male','female') OR
   jsonb_typeof(p_profile->'preferred_units') IS DISTINCT FROM 'string' OR p_profile->>'preferred_units' NOT IN ('metric','imperial') OR
   jsonb_typeof(p_profile->'date_of_birth') IS DISTINCT FROM 'string' OR p_profile->>'date_of_birth' !~ '^\d{4}-\d{2}-\d{2}$' OR
   (p_profile->>'date_of_birth')::date>(today-interval '18 years')::date OR (p_profile->>'date_of_birth')::date<(today-interval '120 years')::date THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_initial_profile'; END IF;
  FOREACH key IN ARRAY ARRAY['height','current_weight'] LOOP
   IF jsonb_typeof(p_profile->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_initial_profile'; END IF;
   value:=(p_profile->>key)::numeric;
   IF (key='height' AND value NOT BETWEEN 100 AND 250) OR (key='current_weight' AND value NOT BETWEEN 20 AND 500) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_initial_profile'; END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['dietary_restrictions','protein_preferences','recipe_styles'] LOOP
   IF jsonb_typeof(p_profile->key) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_profile_preferences'; END IF;
   IF jsonb_array_length(p_profile->key)>50 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_profile->key) e WHERE jsonb_typeof(e)<>'string' OR length(e#>>'{}')>150) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_profile_preferences'; END IF;
  END LOOP;
  IF jsonb_typeof(p_profile->'disliked_foods') IS DISTINCT FROM 'string' OR length(p_profile->>'disliked_foods')>2000 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_profile_preferences'; END IF;
 END IF;
 IF p_profile ? 'journey_start_date' OR p_profile ? 'journey_start_weight' THEN
  IF u.journey_start_date IS NOT NULL OR NOT p_profile ?& ARRAY['journey_start_date','journey_start_weight'] OR
   jsonb_typeof(p_profile->'journey_start_date') IS DISTINCT FROM 'string' OR (p_profile->>'journey_start_date')::date IS DISTINCT FROM today OR
   jsonb_typeof(p_profile->'journey_start_weight') IS DISTINCT FROM 'number' OR (p_profile->>'journey_start_weight')::numeric NOT BETWEEN 20 AND 500 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journey_restart_required'; END IF;
 END IF;
 profile_candidate:=jsonb_populate_record(u,p_profile);

 candidate:=CASE WHEN old_goal.id IS NULL THEN '{}'::jsonb ELSE to_jsonb(old_goal) END || p_goal;
 IF candidate->>'goal_type' IS NULL OR candidate->>'goal_type' NOT IN ('lose','maintain','gain') OR
 candidate->>'macro_preset' IS NULL OR candidate->>'macro_preset' NOT IN ('balanced','high_protein','low_carb','lean_body','custom') THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_goal_settings'; END IF;
 FOREACH key IN ARRAY ARRAY['daily_calories','protein_g','carbs_g','fats_g','fiber_g'] LOOP
  IF jsonb_typeof(candidate->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='incomplete_goal_targets'; END IF;
  value:=(candidate->>key)::numeric;
  IF value<>trunc(value) OR value<0 OR value>10000 OR (key='daily_calories' AND value=0) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_goal_targets'; END IF;
 END LOOP;
 target_changed:=old_goal.id IS NULL OR ROW(old_goal.daily_calories,old_goal.protein_g,old_goal.carbs_g,old_goal.fats_g,old_goal.fiber_g)
 IS DISTINCT FROM ROW((candidate->>'daily_calories')::integer,(candidate->>'protein_g')::integer,(candidate->>'carbs_g')::integer,(candidate->>'fats_g')::integer,(candidate->>'fiber_g')::integer);
 IF old_goal.id IS NOT NULL AND (candidate->>'daily_calories')::integer<old_goal.daily_calories THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='goal_reduction_requires_review'; END IF;
 IF old_goal.id IS NULL OR (candidate->>'daily_calories')::integer IS DISTINCT FROM old_goal.daily_calories THEN
  IF profile_candidate.sex NOT IN ('male','female') OR profile_candidate.sex IS NULL
   OR profile_candidate.date_of_birth IS NULL
   OR profile_candidate.date_of_birth>(today-interval '18 years')::date
   OR profile_candidate.date_of_birth<(today-interval '120 years')::date THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_review_required'; END IF;
  IF (candidate->>'daily_calories')::integer<(CASE WHEN profile_candidate.sex='female' THEN 1200 ELSE 1500 END) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='below_product_reference'; END IF;
 END IF;
 IF target_changed THEN
  IF NOT p_goal ?& ARRAY['daily_calories','protein_g','carbs_g','fats_g','fiber_g'] THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='complete_targets_required'; END IF;
  -- Independent rounding of three macros can differ by up to 8.5 kcal.
  IF abs((candidate->>'daily_calories')::integer-4*(candidate->>'protein_g')::integer-4*(candidate->>'carbs_g')::integer-9*(candidate->>'fats_g')::integer)>10 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='inconsistent_goal_targets'; END IF;
 END IF;
 IF candidate ? 'goal_intensity' AND candidate->'goal_intensity'<>'null'::jsonb AND
 (jsonb_typeof(candidate->'goal_intensity')<>'number' OR (candidate->>'goal_intensity')::numeric NOT BETWEEN 0 AND 10) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_goal_settings'; END IF;
 IF candidate ? 'target_weight' AND candidate->'target_weight'<>'null'::jsonb AND
 (jsonb_typeof(candidate->'target_weight')<>'number' OR (candidate->>'target_weight')::numeric NOT BETWEEN 20 AND 500) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_goal_settings'; END IF;
 IF candidate ? 'loss_rate_lbs_per_week' AND candidate->'loss_rate_lbs_per_week'<>'null'::jsonb AND
 (jsonb_typeof(candidate->'loss_rate_lbs_per_week')<>'number' OR (candidate->>'loss_rate_lbs_per_week')::numeric NOT BETWEEN 0 AND 2) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_goal_settings'; END IF;
 IF (p_operation='initial_onboarding' OR p_goal ? 'target_weight' OR p_goal ? 'goal_type') AND candidate->>'goal_type' IN ('lose','gain') THEN
  IF profile_candidate.current_weight IS NULL OR profile_candidate.current_weight NOT BETWEEN 20 AND 500 OR
   candidate->'target_weight' IS NULL OR candidate->'target_weight'='null'::jsonb OR
   (candidate->>'goal_type'='lose' AND (candidate->>'target_weight')::numeric>=profile_candidate.current_weight) OR
   (candidate->>'goal_type'='gain' AND (candidate->>'target_weight')::numeric<=profile_candidate.current_weight) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='goal_direction_review_required'; END IF;
 END IF;
 IF candidate->>'goal_type'='lose' AND coalesce((candidate->>'loss_rate_lbs_per_week')::numeric,0)<=0 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='missing_goal_pace'; END IF;
 start_date_value:=(candidate->>'start_date')::date;
 journey_date_value:=(candidate->>'start_journey_date')::date;
 IF old_goal.id IS NOT NULL THEN
  IF start_date_value IS DISTINCT FROM old_goal.start_date OR journey_date_value IS DISTINCT FROM old_goal.start_journey_date THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='journey_restart_required'; END IF;
 ELSE
  start_date_value:=coalesce(start_date_value,profile_candidate.journey_start_date,today);
  journey_date_value:=coalesce(journey_date_value,profile_candidate.journey_start_date,start_date_value);
  IF start_date_value>today OR journey_date_value>today OR start_date_value<'1900-01-01'::date OR journey_date_value<'1900-01-01'::date THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_goal_date'; END IF;
 END IF;
 accepted_at:=macrogoal_goal_write_private.accepted_timestamp(old_goal.created_at);
 IF old_goal.id IS NOT NULL THEN UPDATE public.goals SET is_active=false WHERE id=old_goal.id AND user_id=actor; END IF;
 INSERT INTO public.goals(user_id,goal_type,goal_intensity,target_weight,daily_calories,protein_g,carbs_g,fats_g,fiber_g,is_active,
 loss_rate_lbs_per_week,start_date,start_journey_date,macro_preset,base_daily_calories,last_adaptive_update,created_at,updated_at)
 VALUES(actor,candidate->>'goal_type',(candidate->>'goal_intensity')::numeric,(candidate->>'target_weight')::numeric,
 (candidate->>'daily_calories')::integer,(candidate->>'protein_g')::integer,(candidate->>'carbs_g')::integer,(candidate->>'fats_g')::integer,(candidate->>'fiber_g')::integer,true,
 (candidate->>'loss_rate_lbs_per_week')::numeric,start_date_value,journey_date_value,candidate->>'macro_preset',(candidate->>'daily_calories')::integer,NULL,accepted_at,accepted_at)
 RETURNING * INTO result;
 IF p_profile<>'{}'::jsonb OR p_goal ? 'target_weight' THEN
  UPDATE public.users SET activity_level=profile_candidate.activity_level,sex=profile_candidate.sex,date_of_birth=profile_candidate.date_of_birth,
   height=profile_candidate.height,current_weight=profile_candidate.current_weight,preferred_units=profile_candidate.preferred_units,
   dietary_restrictions=profile_candidate.dietary_restrictions,protein_preferences=profile_candidate.protein_preferences,recipe_styles=profile_candidate.recipe_styles,
   disliked_foods=profile_candidate.disliked_foods,onboarding_completed=profile_candidate.onboarding_completed,
   journey_start_date=profile_candidate.journey_start_date,journey_start_weight=profile_candidate.journey_start_weight,
   goal_weight=CASE WHEN p_goal ? 'target_weight' THEN result.target_weight ELSE u.goal_weight END,updated_at=now()
  WHERE id=actor;
 END IF;
 SELECT * INTO u FROM public.users WHERE id=actor;
 INSERT INTO macrogoal_goal_write_private.receipts(user_id,request_id,payload,goal_id,goal_snapshot,profile_fingerprint,
  material_profile,material_profile_updated_at)
 VALUES(actor,p_request_id,payload,result.id,to_jsonb(result),encode(sha256(convert_to(to_jsonb(u)::text,'UTF8')),'hex'),
  macrogoal_goal_write_private.material_profile_v1(u),u.updated_at);
 RETURN to_jsonb(result);
END $function$
