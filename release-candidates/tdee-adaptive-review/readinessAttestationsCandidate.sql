-- REVIEW CANDIDATE ONLY. Not installed; no policy seeds or recommendation activation.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA macrogoal_readiness_private;
REVOKE ALL ON SCHEMA macrogoal_readiness_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE macrogoal_readiness_private.attestations(
 owner_id uuid PRIMARY KEY, version text NOT NULL CHECK(version='general-adult-v1'),
 response text NOT NULL CHECK(response IN ('criteria_confirmed','not_confirmed','unsure')),
 profile_binding text NOT NULL, journey_binding text NOT NULL,
 accepted_at timestamptz NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE macrogoal_readiness_private.complete_days(
 owner_id uuid NOT NULL, day date NOT NULL, timezone text NOT NULL,
 journey_binding text NOT NULL, content_hash text NOT NULL,
 version text NOT NULL CHECK(version='complete-day-v1'), confirmed boolean NOT NULL,
 accepted_at timestamptz NOT NULL, PRIMARY KEY(owner_id,day));
CREATE TABLE macrogoal_readiness_private.requests(
 owner_id uuid NOT NULL, request_id uuid NOT NULL, request jsonb NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(owner_id,request_id));
ALTER TABLE macrogoal_readiness_private.attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_readiness_private.complete_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_readiness_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA macrogoal_readiness_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION macrogoal_readiness_private.actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE a uuid:=auth.uid();
BEGIN
 IF a IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 RETURN a;
END $f$;
CREATE FUNCTION macrogoal_readiness_private.read_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE a uuid:=macrogoal_readiness_private.actor(); u public.users;
 t date; first_day date; pb text; jb text; at_time timestamptz:=clock_timestamp();
 e macrogoal_readiness_private.attestations; ds jsonb; n bigint;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=a;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=u.timezone) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable'; END IF;
 t:=(at_time AT TIME ZONE u.timezone)::date;
 first_day:=greatest(t-28,coalesce(u.journey_start_date,t-28));
 jb:=encode(sha256(convert_to(jsonb_build_object('owner',a,'start',u.journey_start_date,
 'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex');
 pb:=encode(sha256(convert_to(jsonb_build_object('owner',a,'dob',u.date_of_birth,'sex',u.sex,
 'journey',jb,'timezone',u.timezone)::text,'UTF8')),'hex');
 SELECT * INTO e FROM macrogoal_readiness_private.attestations WHERE owner_id=a;
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
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',d.day,'contentHash',d.hash,'confirmable',d.confirmable,
 'confirmed',coalesce(c.confirmed AND c.content_hash=d.hash AND c.journey_binding=jb AND c.timezone=u.timezone
 AND c.version='complete-day-v1' AND d.confirmable,false)) ORDER BY d.day),'[]'::jsonb)
 INTO ds FROM digests d LEFT JOIN macrogoal_readiness_private.complete_days c ON c.owner_id=a AND c.day=d.day;
 RETURN jsonb_build_object('version','tdee-readiness-v1','ownerId',a,'capturedAt',at_time,
 'questionnaireVersion','general-adult-v1','statementVersion','complete-day-v1',
 'profileBinding',pb,'journeyBinding',jb,'timezone',u.timezone,'today',t,
 'eligibility',jsonb_build_object('response',e.response,
 'current',coalesce(e.version='general-adult-v1' AND e.profile_binding=pb AND e.journey_binding=jb
 AND e.accepted_at<=at_time AND e.expires_at>at_time,false),
 'adult',coalesce(u.date_of_birth<=(t-interval '18 years')::date AND u.date_of_birth>date '1900-01-01',false)), 'days',ds);
END $f$;

CREATE FUNCTION macrogoal_readiness_private.save(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE a uuid:=macrogoal_readiness_private.actor(); rid uuid; prior jsonb; state jsonb;
 item jsonb; d jsonb; version text; stamp timestamptz; expected_keys text[];
BEGIN
 IF p_request IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
 IF octet_length(p_request::text)>12000 OR jsonb_typeof(p_request->'requestId') IS DISTINCT FROM 'string'
 OR coalesce(p_request->>'requestId','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
 rid:=(p_request->>'requestId')::uuid;
 IF current_setting('transaction_isolation')<>'read committed' THEN
 RAISE EXCEPTION USING ERRCODE='25000',MESSAGE='isolation_unsupported'; END IF;
 -- Existing goal protocol uses U first; no locks on food rows or global triggers.
 PERFORM 1 FROM public.users WHERE id=a FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable'; END IF;
 SELECT request INTO prior FROM macrogoal_readiness_private.requests WHERE owner_id=a AND request_id=rid;
 IF FOUND THEN
 IF prior IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='request_mismatch'; END IF;
 -- Replay never renews confirmation or expiry; state is read afresh.
 RETURN macrogoal_readiness_private.read_state(); END IF;
 IF p_request->>'kind'='eligibility' THEN
 expected_keys:=ARRAY['requestId','kind','version','profileBinding','journeyBinding','response'];
 ELSIF p_request->>'kind'='days' THEN
 expected_keys:=ARRAY['requestId','kind','version','journeyBinding','days'];
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
 IF NOT p_request ?& expected_keys OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE NOT(k=ANY(expected_keys))) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
 state:=macrogoal_readiness_private.read_state();
 IF p_request->>'journeyBinding' IS DISTINCT FROM state->>'journeyBinding' THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='journey_changed'; END IF;
 stamp:=clock_timestamp();
 IF p_request->>'kind'='eligibility' THEN
 IF p_request->>'version' IS DISTINCT FROM 'general-adult-v1'
 OR p_request->>'profileBinding' IS DISTINCT FROM state->>'profileBinding'
 OR jsonb_typeof(p_request->'response') IS DISTINCT FROM 'string'
 OR p_request->>'response' NOT IN ('criteria_confirmed','not_confirmed','unsure') THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_eligibility_confirmation'; END IF;
 INSERT INTO macrogoal_readiness_private.attestations(owner_id,version,response,profile_binding,journey_binding,accepted_at,expires_at)
 VALUES(a,'general-adult-v1',p_request->>'response',state->>'profileBinding',state->>'journeyBinding',stamp,stamp+interval '30 days')
 ON CONFLICT(owner_id) DO UPDATE SET version=excluded.version,response=excluded.response,profile_binding=excluded.profile_binding,
 journey_binding=excluded.journey_binding,accepted_at=excluded.accepted_at,expires_at=excluded.expires_at;
 ELSE
 IF p_request->>'version' IS DISTINCT FROM 'complete-day-v1' OR jsonb_typeof(p_request->'days') IS DISTINCT FROM 'array' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_days'; END IF;
 IF jsonb_array_length(p_request->'days') NOT BETWEEN 1 AND 28 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_days'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_request->'days') LOOP
 IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_day'; END IF;
 IF NOT item ?& ARRAY['date','contentHash','confirmed'] OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('date','contentHash','confirmed')) OR
 jsonb_typeof(item->'date') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'contentHash') IS DISTINCT FROM 'string'
 OR jsonb_typeof(item->'confirmed') IS DISTINCT FROM 'boolean' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_day'; END IF;
 SELECT value INTO d FROM jsonb_array_elements(state->'days') WHERE value->>'date'=item->>'date';
 IF NOT FOUND OR d->>'contentHash' IS DISTINCT FROM item->>'contentHash' OR
 (item->'confirmed'='true'::jsonb AND d->'confirmable' IS DISTINCT FROM 'true'::jsonb) THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='day_changed_or_unavailable'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'date') FROM jsonb_array_elements(p_request->'days'))<>jsonb_array_length(p_request->'days') THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate_day'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_request->'days') LOOP
 INSERT INTO macrogoal_readiness_private.complete_days(owner_id,day,timezone,journey_binding,content_hash,version,confirmed,accepted_at)
 VALUES(a,(item->>'date')::date,state->>'timezone',state->>'journeyBinding',item->>'contentHash','complete-day-v1',(item->>'confirmed')::boolean,stamp)
 ON CONFLICT(owner_id,day) DO UPDATE SET timezone=excluded.timezone,journey_binding=excluded.journey_binding,
 content_hash=excluded.content_hash,version=excluded.version,confirmed=excluded.confirmed,accepted_at=excluded.accepted_at;
 END LOOP;
 END IF;
 INSERT INTO macrogoal_readiness_private.requests(owner_id,request_id,request) VALUES(a,rid,p_request);
 RETURN macrogoal_readiness_private.read_state();
END $f$;
CREATE FUNCTION public.tdee_read_readiness_v1() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $f$ SELECT macrogoal_readiness_private.read_state() $f$;
CREATE FUNCTION public.tdee_confirm_readiness_v1(p_request jsonb) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $f$ SELECT macrogoal_readiness_private.save(p_request) $f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA macrogoal_readiness_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_read_readiness_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_confirm_readiness_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- No grants in review candidate. Reviewed deployment must explicitly grant authenticated
-- USAGE on private schema and EXECUTE on read_state/save and public wrappers only.
-- actor() is called by the definer owner, not granted directly. Tables stay closed.
COMMIT;
