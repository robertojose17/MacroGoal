-- SOURCE ONLY. New read-only-analysis namespace: legacy scheduler state/functions remain unchanged.
BEGIN;
CREATE SCHEMA IF NOT EXISTS tdee_automatic_private;
REVOKE ALL ON SCHEMA tdee_automatic_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS tdee_automatic_private.daily (
 owner_id uuid NOT NULL REFERENCES public.users(id),
 context_revision text NOT NULL CHECK(context_revision ~ '^[a-f0-9]{64}$'),
 revision bigint NOT NULL CHECK(revision>0 AND revision<9007199254740990),
 record jsonb NOT NULL CHECK(jsonb_typeof(record)='object' AND record ? 'status' AND record->>'status'='completed' AND octet_length(record::text)<=2048),
 reason text NOT NULL CHECK(reason IN ('automatic_attention_ready','review_needed','no_change','insufficient_data','baseline_required','baseline_reconfirmation_required')),
 PRIMARY KEY(owner_id,context_revision)
);
CREATE TABLE IF NOT EXISTS tdee_automatic_private.selector_cursor (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),after_owner uuid,revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO tdee_automatic_private.selector_cursor(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE tdee_automatic_private.daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE tdee_automatic_private.selector_cursor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA tdee_automatic_private FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION tdee_automatic_private.current_selection_as_of(p_owner uuid, p_as_of timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE u public.users;g public.goals;pol tdee_rules14_private.policy_versions;
 account record;b jsonb;binding jsonb;rev text;n integer;t date;at_time timestamptz:=p_as_of;
BEGIN
 -- Private explicit real readback time; never permit future authority.
 IF p_as_of IS NULL OR p_as_of>clock_timestamp() THEN RETURN NULL;END IF;
 -- Missing or incompatible policy never falls back to the attested legacy engine.
 -- A revoked/expired/ambiguous rules registration never silently downgrades.
 IF NOT EXISTS(SELECT 1 FROM tdee_rules14_private.policy_versions) THEN RETURN NULL;END IF;
 SELECT count(*) INTO n FROM (SELECT DISTINCT ON(version) version,decision,expires_at FROM tdee_rules14_private.policy_versions ORDER BY version,revision DESC)q WHERE decision='enabled' AND expires_at>at_time;
 IF n<>1 THEN RETURN NULL;END IF;
 SELECT * INTO pol FROM (SELECT DISTINCT ON(version) * FROM tdee_rules14_private.policy_versions ORDER BY version,revision DESC)q WHERE decision='enabled' AND expires_at>at_time;
 SELECT deleted_at,banned_until,is_anonymous INTO account FROM auth.users WHERE id=p_owner;
 IF NOT FOUND OR account.deleted_at IS NOT NULL OR account.is_anonymous IS DISTINCT FROM false OR (account.banned_until IS NOT NULL AND account.banned_until>at_time) THEN RETURN NULL;END IF;

 SELECT * INTO u FROM public.users WHERE id=p_owner;IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=u.timezone) THEN RETURN NULL;END IF;
 t:=(at_time AT TIME ZONE u.timezone)::date;
 IF u.date_of_birth IS NULL OR NOT isfinite(u.date_of_birth) OR u.date_of_birth>(t-interval '19 years')::date OR u.date_of_birth<=(t-interval '101 years')::date OR u.date_of_birth<=date '1900-01-01' THEN RETURN NULL;END IF;
 b:=tdee_rules14_private.screening_binding(p_owner);
 IF pol.document->>'scope' IS DISTINCT FROM 'profile-adult-observed-v1' OR pol.document->>'engine_version' IS DISTINCT FROM 'rules14-observed-v2' THEN RETURN NULL;END IF;
 SELECT count(*) INTO n FROM(SELECT id FROM public.goals WHERE user_id=p_owner AND is_active=true LIMIT 2)q;IF n<>1 THEN RETURN NULL;END IF;
 SELECT * INTO g FROM public.goals WHERE user_id=p_owner AND is_active=true;
 binding:=jsonb_build_object('version',pol.version,'revision',pol.revision,'digest',pol.digest,'engineVersion','rules14-observed-v2');
 rev:=encode(sha256(convert_to(jsonb_build_object('contract','internal-daily-automatic-analysis-v1','owner',p_owner,'goal',to_jsonb(g),'profile',b,'analysisMode','automatic-v1','supportContract','rules14-profile-support-v1','policyBinding',binding)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('ownerId',p_owner,'contextRevision',rev,'timezone',u.timezone,'localDate',t,'enrolled',true,'accountActive',true,'analysisMode','automatic-v1','engineVersion','rules14-observed-v2','policyBinding',binding);
END $function$;

REVOKE ALL ON FUNCTION tdee_automatic_private.current_selection_as_of(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tdee_internal_automatic_current_v1(p_owner uuid,p_context_revision text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','pg_temp'
AS $function$
DECLARE s jsonb; now_time timestamptz:=statement_timestamp();
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 s:=tdee_automatic_private.current_selection_as_of(p_owner,now_time);
 IF s IS NULL OR s->>'contextRevision' IS DISTINCT FROM p_context_revision THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 RETURN jsonb_build_object('status','current','actionable',false,'capturedAt',floor(extract(epoch FROM now_time)*1000),'selection',jsonb_build_object('ownerId',p_owner,'contextRevision',p_context_revision,'enrolled',true,'accountActive',true));
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_automatic_select_v1(p_limit integer,p_deadline_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','pg_temp' SET lock_timeout TO '500ms'
AS $function$
DECLARE cursor_owner uuid; candidate record; selected jsonb; owners jsonb:='[]'::jsonb;
 scanned integer:=0;at_ms bigint;cursor_revision bigint;resume_owner uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>25 OR p_deadline_ms IS NULL OR p_deadline_ms<=at_ms OR p_deadline_ms>at_ms+5000 THEN RETURN jsonb_build_object('status','invalid_budget','actionable',false);END IF;
 SELECT after_owner,revision INTO cursor_owner,cursor_revision FROM tdee_automatic_private.selector_cursor WHERE singleton=true FOR UPDATE NOWAIT;
 IF NOT FOUND OR cursor_revision>=9223372036854775806 THEN RETURN jsonb_build_object('status','unavailable','actionable',false);END IF;
 FOR candidate IN SELECT id AS user_id FROM public.users WHERE (cursor_owner IS NULL OR id>cursor_owner) ORDER BY id LIMIT 250 LOOP
  EXIT WHEN floor(extract(epoch FROM clock_timestamp())*1000)>=p_deadline_ms;
  scanned:=scanned+1;cursor_owner:=candidate.user_id;
  selected:=tdee_automatic_private.current_selection_as_of(candidate.user_id,clock_timestamp());
  IF selected IS NULL THEN CONTINUE;END IF;
  IF EXISTS(SELECT 1 FROM tdee_automatic_private.daily d WHERE d.owner_id=candidate.user_id AND d.context_revision=selected->>'contextRevision' AND
    (d.record->>'localDate'>=selected->>'localDate' OR (d.record->>'finishedAt')::numeric>floor(extract(epoch FROM clock_timestamp())*1000))) THEN CONTINUE;END IF;
  IF resume_owner IS NULL THEN resume_owner:=candidate.user_id;END IF;
  owners:=owners||jsonb_build_array(jsonb_build_object('ownerId',candidate.user_id,'contextRevision',selected->>'contextRevision'));
  EXIT WHEN jsonb_array_length(owners)>=p_limit;
 END LOOP;
 IF scanned=0 AND floor(extract(epoch FROM clock_timestamp())*1000)<p_deadline_ms THEN cursor_owner:=NULL;END IF;
 UPDATE tdee_automatic_private.selector_cursor SET after_owner=coalesce(resume_owner,cursor_owner),revision=revision+1 WHERE singleton=true;
 RETURN jsonb_build_object('status','selected','actionable',false,'capturedAt',floor(extract(epoch FROM clock_timestamp())*1000),'owners',owners,'scanned',scanned);
EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('status','busy','actionable',false);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_automatic_state_v1(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','pg_temp'
AS $function$
DECLARE s jsonb;r jsonb; owner uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required';END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>2048 OR
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_request) k) IS DISTINCT FROM ARRAY['contextRevision','ownerId','timezone']::text[] THEN RAISE EXCEPTION 'invalid_automatic_scope';END IF;
 owner:=(p_request->>'ownerId')::uuid;s:=tdee_automatic_private.current_selection_as_of(owner,statement_timestamp());
 IF s IS NULL OR s->>'contextRevision' IS DISTINCT FROM p_request->>'contextRevision' OR s->>'timezone' IS DISTINCT FROM p_request->>'timezone' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='automatic_scope_changed';END IF;
 SELECT record INTO r FROM tdee_automatic_private.daily WHERE owner_id=owner AND context_revision=p_request->>'contextRevision';
 RETURN jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',r,'hold',NULL);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_automatic_record_v1(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','pg_temp' SET lock_timeout TO '500ms'
AS $function$
DECLARE owner uuid;selected jsonb;request_fields text[];r tdee_automatic_private.daily;expected bigint;at_ms bigint;local_day text;daily_key text;claim uuid;next_record jsonb;evaluated bigint;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required';END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>2048 THEN RAISE EXCEPTION 'invalid_automatic_record';END IF;
 SELECT array_agg(k ORDER BY k) INTO request_fields FROM jsonb_object_keys(p_request) k;
 IF request_fields IS DISTINCT FROM ARRAY['claimId','contextRevision','evaluatedAt','expectedRevision','key','localDate','ownerId','reason','timezone']::text[] THEN RAISE EXCEPTION 'invalid_automatic_record';END IF;
 owner:=(p_request->>'ownerId')::uuid;claim:=(p_request->>'claimId')::uuid;
 IF owner IS NULL OR claim IS NULL OR jsonb_typeof(p_request->'expectedRevision') IS DISTINCT FROM 'number' OR
  (p_request->>'expectedRevision')::numeric<>trunc((p_request->>'expectedRevision')::numeric) OR (p_request->>'expectedRevision')::numeric NOT BETWEEN 0 AND 9007199254740988 OR
  jsonb_typeof(p_request->'evaluatedAt') IS DISTINCT FROM 'number' OR (p_request->>'evaluatedAt')::numeric<>trunc((p_request->>'evaluatedAt')::numeric) THEN RAISE EXCEPTION 'invalid_automatic_revision_or_time';END IF;
 expected:=(p_request->>'expectedRevision')::bigint;evaluated:=(p_request->>'evaluatedAt')::bigint;
 PERFORM pg_advisory_xact_lock(hashtextextended('automatic-analysis:'||owner::text,0));
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF evaluated<0 OR evaluated>at_ms OR at_ms-evaluated>30000 THEN RAISE EXCEPTION 'stale_automatic_evaluation';END IF;
 selected:=tdee_automatic_private.current_selection_as_of(owner,clock_timestamp());
 IF selected IS NULL OR selected->>'analysisMode' IS DISTINCT FROM 'automatic-v1' OR selected->>'contextRevision' IS DISTINCT FROM p_request->>'contextRevision' OR selected->>'timezone' IS DISTINCT FROM p_request->>'timezone' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='automatic_scope_changed';END IF;
 local_day:=selected->>'localDate';daily_key:='["daily-assessment-v1","'||owner::text||'","'||(selected->>'contextRevision')||'","'||local_day||'"]';
 IF p_request->>'localDate' IS DISTINCT FROM local_day OR p_request->>'key' IS DISTINCT FROM daily_key OR
  to_char(to_timestamp(evaluated::numeric/1000) AT TIME ZONE (selected->>'timezone'),'YYYY-MM-DD') IS DISTINCT FROM local_day THEN RAISE EXCEPTION 'automatic_calendar_changed';END IF;
 IF p_request->>'reason' NOT IN ('automatic_attention_ready','review_needed','no_change','insufficient_data','baseline_required','baseline_reconfirmation_required') OR p_request->>'reason' IS NULL THEN RAISE EXCEPTION 'invalid_automatic_diagnostic';END IF;
 SELECT * INTO r FROM tdee_automatic_private.daily WHERE owner_id=owner AND context_revision=selected->>'contextRevision' FOR UPDATE;
 IF coalesce(r.revision,0)<>expected OR (r.record IS NOT NULL AND (r.record->>'localDate'>=local_day OR (r.record->>'finishedAt')::numeric>at_ms OR r.record->>'claimId'=claim::text)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='automatic_completion_conflict';END IF;
 next_record:=jsonb_build_object('version','daily-assessment-ledger-v1','ownerId',owner,'contextRevision',selected->>'contextRevision','timezone',selected->>'timezone','localDate',local_day,'key',daily_key,'revision',expected+1,'status','completed','claimId',claim,'claimedAt',evaluated,'finishedAt',at_ms);
 IF r.record IS NULL THEN INSERT INTO tdee_automatic_private.daily(owner_id,context_revision,revision,record,reason) VALUES(owner,selected->>'contextRevision',expected+1,next_record,p_request->>'reason');
 ELSE UPDATE tdee_automatic_private.daily SET revision=expected+1,record=next_record,reason=p_request->>'reason' WHERE owner_id=owner AND context_revision=selected->>'contextRevision' AND revision=expected;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='automatic_completion_conflict';END IF;
 END IF;
 RETURN jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',next_record,'hold',NULL);
END $function$;
REVOKE ALL ON FUNCTION public.tdee_internal_automatic_current_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_internal_automatic_select_v1(integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_internal_automatic_state_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_internal_automatic_record_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_automatic_current_v1(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_automatic_select_v1(integer,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_automatic_state_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_automatic_record_v1(jsonb) TO service_role;
-- No legacy function/table/claim/receipt changed. No grant of table access or notification capability.
COMMIT;
