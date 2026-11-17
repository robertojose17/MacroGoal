-- SOURCE ONLY / OFF. General product screening self-report, not clinical clearance.
CREATE TABLE tdee_rules14_private.screenings(
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, row_version bigint NOT NULL CHECK(row_version BETWEEN 1 AND 9007199254740991),
 request jsonb NOT NULL,response text NOT NULL CHECK(response IN ('eligible','restricted','unsure','revoked')),
 profile_binding text NOT NULL CHECK(profile_binding ~ '^[a-f0-9]{64}$'),journey_binding text NOT NULL CHECK(journey_binding ~ '^[a-f0-9]{64}$'),
 profile_updated_at timestamptz NOT NULL,accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,request_id),UNIQUE(owner_id,row_version),CHECK(isfinite(profile_updated_at) AND isfinite(accepted_at) AND isfinite(expires_at)),
 CHECK(expires_at=accepted_at+interval '30 days'),CHECK(octet_length(request::text)<=2048)
);
ALTER TABLE tdee_rules14_private.screenings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tdee_rules14_private.screenings FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.screening_binding(p_owner uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH p AS(SELECT u.*,encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'start',u.journey_start_date,'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex') jb FROM public.users u WHERE id=p_owner)
 SELECT jsonb_build_object('profileBinding',encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'dob',p.date_of_birth,'sex',p.sex,'journey',p.jb,'timezone',p.timezone)::text,'UTF8')),'hex'),
 'journeyBinding',p.jb,'profileUpdatedAt',p.updated_at) FROM p
$$;
CREATE FUNCTION tdee_rules14_private.screening_request_valid(q jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 RETURN coalesce(jsonb_typeof(q)='object' AND octet_length(q::text)<=2048 AND q ?& ARRAY['version','requestId','response','copyVersion','profileBinding','journeyBinding','profileUpdatedAt'] AND
 (q-ARRAY['version','requestId','response','copyVersion','profileBinding','journeyBinding','profileUpdatedAt'])='{}'::jsonb AND
 q->>'version'='rules-screening-request-v1' AND q->>'copyVersion'='rules-screening-copy-v1' AND q->>'requestId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' AND
 q->>'response' IN ('eligible','restricted','unsure','revoked') AND q->>'profileBinding' ~ '^[a-f0-9]{64}$' AND q->>'journeyBinding' ~ '^[a-f0-9]{64}$' AND jsonb_typeof(q->'profileUpdatedAt')='string' AND isfinite((q->>'profileUpdatedAt')::timestamptz),false);
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION tdee_rules14_private.guard_screening() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE last_version bigint;b jsonb;
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.owner_id) THEN RETURN OLD;END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'rules14_screening_immutable';END IF;
 IF auth.uid() IS DISTINCT FROM NEW.owner_id OR NOT tdee_rules14_private.screening_request_valid(NEW.request) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='own_confirmation_required';END IF;
 PERFORM 1 FROM public.users WHERE id=NEW.owner_id FOR UPDATE;
 SELECT max(row_version) INTO last_version FROM tdee_rules14_private.screenings WHERE owner_id=NEW.owner_id;
 b:=tdee_rules14_private.screening_binding(NEW.owner_id);
 IF NEW.row_version<>coalesce(last_version,0)+1 OR NEW.request->>'requestId' IS DISTINCT FROM NEW.request_id::text OR NEW.request->>'response' IS DISTINCT FROM NEW.response OR
 NEW.request->>'profileBinding' IS DISTINCT FROM b->>'profileBinding' OR NEW.request->>'journeyBinding' IS DISTINCT FROM b->>'journeyBinding' OR (NEW.request->>'profileUpdatedAt')::timestamptz IS DISTINCT FROM (b->>'profileUpdatedAt')::timestamptz OR
 NEW.profile_binding IS DISTINCT FROM b->>'profileBinding' OR NEW.journey_binding IS DISTINCT FROM b->>'journeyBinding' OR NEW.profile_updated_at IS DISTINCT FROM (b->>'profileUpdatedAt')::timestamptz THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='screening_binding_changed';END IF;
 NEW.accepted_at:=clock_timestamp();NEW.expires_at:=NEW.accepted_at+interval '30 days';RETURN NEW;
END $$;
CREATE TRIGGER rules14_screening_immutable BEFORE INSERT OR UPDATE OR DELETE ON tdee_rules14_private.screenings FOR EACH ROW EXECUTE FUNCTION tdee_rules14_private.guard_screening();
-- Saved screening validity follows risk/profile and journey bindings, not unrelated user-row telemetry.
-- profile_updated_at remains an immutable capture value and insertion concurrency guard.
CREATE FUNCTION tdee_rules14_private.screening_envelope(r tdee_rules14_private.screenings,b jsonb,at_time timestamptz) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('version','rules-screening-v1','ownerId',(r).owner_id,'copyVersion','rules-screening-copy-v1',
 'profileBinding',(r).profile_binding,'journeyBinding',(r).journey_binding,'profileUpdatedAt',(r).profile_updated_at,
 'current',coalesce((r).profile_binding ~ '^[a-f0-9]{64}$' AND (r).journey_binding ~ '^[a-f0-9]{64}$' AND (r).response='eligible' AND (r).expires_at>at_time AND (r).accepted_at<=at_time AND (r).profile_binding=b->>'profileBinding' AND (r).journey_binding=b->>'journeyBinding',false),
 'response',(r).response,'acceptedAt',(r).accepted_at,'expiresAt',(r).expires_at,'requestId',(r).request_id,'rowVersion',(r).row_version)
$$;
CREATE FUNCTION tdee_rules14_private.read_screening(p_owner uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r tdee_rules14_private.screenings;b jsonb;
BEGIN
 b:=tdee_rules14_private.screening_binding(p_owner);
 SELECT * INTO r FROM tdee_rules14_private.screenings WHERE owner_id=p_owner ORDER BY row_version DESC LIMIT 1;
 IF NOT FOUND THEN RETURN b||jsonb_build_object('version','rules-screening-v1','ownerId',p_owner,'copyVersion','rules-screening-copy-v1','response',NULL,'current',false,'acceptedAt',NULL,'expiresAt',NULL,'requestId',NULL,'rowVersion',0);END IF;
 RETURN tdee_rules14_private.screening_envelope(r,b,clock_timestamp())||b;
END $$;
CREATE FUNCTION tdee_rules14_private.screening_replay_envelope(r tdee_rules14_private.screenings,b jsonb,at_time timestamptz,latest_version bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT CASE WHEN (r).row_version IS NOT DISTINCT FROM latest_version THEN tdee_rules14_private.screening_envelope(r,b,at_time)
 ELSE jsonb_set(tdee_rules14_private.screening_envelope(r,b,at_time),'{current}','false'::jsonb) END
$$;
CREATE FUNCTION public.tdee_rules14_screening_v1(p_action text,p_request jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' AS $$
DECLARE actor uuid:=auth.uid();r tdee_rules14_private.screenings;b jsonb;u public.users;next_version bigint;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=actor AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';END IF;
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rules14_screening_off');END IF;
 IF p_action IS NULL OR p_action NOT IN ('read','confirm','receipt') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_action_invalid';END IF;
 SELECT * INTO STRICT u FROM public.users WHERE id=actor FOR UPDATE;b:=tdee_rules14_private.screening_binding(actor);
 IF p_action='read' THEN IF p_request IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_request_invalid';END IF;RETURN tdee_rules14_private.read_screening(actor);END IF;
 IF NOT tdee_rules14_private.screening_request_valid(p_request) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_request_invalid';END IF;
 SELECT * INTO r FROM tdee_rules14_private.screenings WHERE owner_id=actor AND request_id=(p_request->>'requestId')::uuid;
 IF FOUND THEN
 IF r.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_request_reused';END IF;
 RETURN jsonb_build_object('version','rules-screening-receipt-v1','status','recorded','request',r.request,'screening',tdee_rules14_private.screening_replay_envelope(r,b,clock_timestamp(),(SELECT max(row_version) FROM tdee_rules14_private.screenings WHERE owner_id=actor)));END IF;
 IF p_action='receipt' THEN RETURN jsonb_build_object('version','rules-screening-receipt-v1','status','not_found','request',p_request);END IF;
 IF p_request->>'response'='eligible' AND (u.date_of_birth IS NULL OR date_part('year',age((clock_timestamp() AT TIME ZONE u.timezone)::date,u.date_of_birth)) NOT BETWEEN 19 AND 100) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_age_ineligible';END IF;
 SELECT coalesce(max(row_version),0)+1 INTO next_version FROM tdee_rules14_private.screenings WHERE owner_id=actor;
 INSERT INTO tdee_rules14_private.screenings(owner_id,request_id,row_version,request,response,profile_binding,journey_binding,profile_updated_at,accepted_at,expires_at)
 VALUES(actor,(p_request->>'requestId')::uuid,next_version,p_request,p_request->>'response',p_request->>'profileBinding',p_request->>'journeyBinding',(p_request->>'profileUpdatedAt')::timestamptz,clock_timestamp(),clock_timestamp()+interval '30 days') RETURNING * INTO r;
 RETURN jsonb_build_object('version','rules-screening-receipt-v1','status','recorded','request',r.request,'screening',tdee_rules14_private.screening_replay_envelope(r,b,clock_timestamp(),(SELECT max(row_version) FROM tdee_rules14_private.screenings WHERE owner_id=actor)));
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tdee_rules14_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_rules14_screening_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_rules14_screening_v1(text,jsonb) TO authenticated;
CREATE FUNCTION tdee_rules14_private.screening_current(c jsonb,actor uuid,at_time timestamptz) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE s jsonb:=c->'rulesScreening';
BEGIN
 RETURN coalesce((s->>'profileBinding') ~ '^[a-f0-9]{64}$' AND (s->>'journeyBinding') ~ '^[a-f0-9]{64}$' AND s->>'version'='rules-screening-v1' AND s->>'copyVersion'='rules-screening-copy-v1' AND s->>'ownerId'=actor::text AND s->>'response'='eligible' AND s->'current'='true'::jsonb AND
 s->'profileBinding'=c#>'{readiness,profileBinding}' AND s->'journeyBinding'=c#>'{readiness,journeyBinding}' AND isfinite((s->>'profileUpdatedAt')::timestamptz) AND
 isfinite((s->>'acceptedAt')::timestamptz) AND isfinite((s->>'expiresAt')::timestamptz) AND (s->>'acceptedAt')::timestamptz<=at_time AND (s->>'expiresAt')::timestamptz>at_time,false);
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
REVOKE ALL ON FUNCTION tdee_rules14_private.screening_current(jsonb,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

