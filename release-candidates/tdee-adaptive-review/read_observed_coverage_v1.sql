-- SOURCE ONLY. New versioned private reader, not installed.
CREATE OR REPLACE FUNCTION tdee_scheduler_private.read_observed_coverage_v1(p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE a uuid:=p_owner; u public.users;
 t date; first_day date; pb text; jb text; at_time timestamptz:=statement_timestamp();
  ds jsonb; n bigint;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=a;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=u.timezone) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable'; END IF;
 t:=(at_time AT TIME ZONE u.timezone)::date;
 first_day:=greatest(t-14,coalesce(u.journey_start_date,t-14));
 jb:=encode(sha256(convert_to(jsonb_build_object('owner',a,'start',u.journey_start_date,
 'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex');
 pb:=encode(sha256(convert_to(jsonb_build_object('owner',a,'dob',u.date_of_birth,'sex',u.sex,
 'journey',jb,'timezone',u.timezone)::text,'UTF8')),'hex');
 SELECT count(*) INTO n FROM public.meals WHERE user_id=a AND date>=first_day AND date<t;
 IF n>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_limit'; END IF;
 SELECT count(*) INTO n FROM public.meal_items i JOIN public.meals m ON m.id=i.meal_id
 WHERE m.user_id=a AND m.date>=first_day AND m.date<t;
 IF n>5000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_limit'; END IF;
 WITH days AS (
 SELECT first_day+x AS day FROM generate_series(0, greatest(-1,t-first_day-1)) x
 ), meals AS MATERIALIZED (
 SELECT m.id,m.date,m.meal_type,m.created_at,m.updated_at FROM public.meals m
 WHERE m.user_id=a AND m.date>=first_day AND m.date<t
 ), items AS MATERIALIZED (
 SELECT m.date,i.id,i.meal_id,i.food_id,i.food_item_id,i.quantity,i.grams,i.calories,
 i.protein,i.carbs,i.fats,i.fiber,i.is_scheduled,i.logged_at,i.serving_unit,i.serving_description
 FROM public.meal_items i JOIN meals m ON m.id=i.meal_id WHERE i.is_scheduled IS DISTINCT FROM true
 ), digests AS (
 SELECT d.day,encode(sha256(convert_to(jsonb_build_object('day',d.day,'timezone',u.timezone,
 'journey',jb,'meals',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM meals m WHERE m.date=d.day),'[]'::jsonb),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM items i WHERE i.date=d.day),'[]'::jsonb))::text,'UTF8')),'hex') AS hash,
 EXISTS(SELECT 1 FROM items i WHERE i.date=d.day) AND
 NOT EXISTS(SELECT 1 FROM items i WHERE i.date=d.day AND
 (i.is_scheduled IS DISTINCT FROM false OR i.calories IS NULL OR i.calories::text IN ('NaN','Infinity','-Infinity') OR i.calories<0)) AND
 coalesce((SELECT sum(i.calories) FROM items i WHERE i.date=d.day),0)>0 AS confirmable
 FROM days d
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',d.day,'contentHash',d.hash,
 'hasValidLoggedIntake',d.confirmable) ORDER BY d.day),'[]'::jsonb) INTO ds FROM digests d;
 RETURN jsonb_build_object('version','observed-log-coverage-v1','ownerId',a,'capturedAt',at_time,
 'dataBasis','observed-logs-v1','coverageBasis','observed_logs_not_confirmed_complete','profileBinding',pb,'journeyBinding',jb,
 'timezone',u.timezone,'today',t,'ageYears',date_part('year',age(t,u.date_of_birth)),
 'completenessEstablished',false,'clinicalEligibilityEstablished',false,'days',ds);
END $function$;
REVOKE ALL ON FUNCTION tdee_scheduler_private.read_observed_coverage_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
