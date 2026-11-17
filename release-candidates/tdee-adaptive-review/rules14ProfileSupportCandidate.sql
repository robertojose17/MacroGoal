-- Computed product age support only. No attestation reads or writes and no medical clearance.
CREATE OR REPLACE FUNCTION tdee_rules14_private.profile_support(p_owner uuid,p_today date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u public.users;b jsonb;a integer;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_owner;
 IF NOT FOUND OR p_today IS NULL OR NOT isfinite(p_today) OR u.date_of_birth IS NULL OR NOT isfinite(u.date_of_birth) THEN RETURN NULL;END IF;
 b:=tdee_rules14_private.screening_binding(p_owner); -- Hash-only legacy helper; no health state.
 a:=extract(year FROM p_today)::integer-extract(year FROM u.date_of_birth)::integer-CASE WHEN to_char(p_today,'MM-DD')<to_char(u.date_of_birth,'MM-DD') THEN 1 ELSE 0 END;
 RETURN jsonb_build_object('version','rules14-profile-support-v1','ownerId',p_owner,'dateOfBirth',u.date_of_birth,'today',p_today,'ageYears',a,
  'profileBinding',b->'profileBinding','journeyBinding',b->'journeyBinding','supported',a BETWEEN 19 AND 100);
END $$;
REVOKE ALL ON FUNCTION tdee_rules14_private.profile_support(uuid,date) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION tdee_rules14_private.profile_support_current(c jsonb,actor uuid,at_time timestamptz) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE q jsonb:=c->'profileSupport';r jsonb:=c->'readiness';dob date;t date;a integer;captured timestamptz;
BEGIN
 IF actor IS NULL OR at_time IS NULL OR NOT isfinite(at_time) OR q->>'version' IS DISTINCT FROM 'rules14-profile-support-v1' OR q->>'ownerId' IS DISTINCT FROM actor::text OR
 c#>>'{profile,id}' IS DISTINCT FROM actor::text OR q->'supported' IS DISTINCT FROM 'true'::jsonb OR
 jsonb_typeof(q->'dateOfBirth') IS DISTINCT FROM 'string' OR coalesce(q->>'dateOfBirth','') !~ '^\d{4}-\d\d-\d\d$' OR
 q->'dateOfBirth' IS DISTINCT FROM c#>'{profile,dateOfBirth}' OR q->'dateOfBirth' IS DISTINCT FROM c#>'{observation,sources,dateOfBirth}' OR
 jsonb_typeof(q->'today') IS DISTINCT FROM 'string' OR coalesce(q->>'today','') !~ '^\d{4}-\d\d-\d\d$' OR q->'today' IS DISTINCT FROM c#>'{observation,context,today}' OR
 coalesce(q->>'profileBinding','') !~ '^[a-f0-9]{64}$' OR coalesce(q->>'journeyBinding','') !~ '^[a-f0-9]{64}$' OR
 q->'profileBinding' IS DISTINCT FROM r->'profileBinding' OR q->'journeyBinding' IS DISTINCT FROM r->'journeyBinding' OR jsonb_typeof(q->'ageYears') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
 dob:=(q->>'dateOfBirth')::date;t:=(q->>'today')::date;captured:=(c#>>'{observation,capturedAt}')::timestamptz;
 IF NOT isfinite(dob) OR NOT isfinite(t) OR NOT isfinite(captured) OR captured IS NULL OR captured>at_time OR at_time-captured>interval '30 seconds' THEN RETURN false;END IF;
 a:=extract(year FROM t)::integer-extract(year FROM dob)::integer-CASE WHEN to_char(t,'MM-DD')<to_char(dob,'MM-DD') THEN 1 ELSE 0 END;
 RETURN coalesce((q->>'ageYears')::numeric=a AND a BETWEEN 19 AND 100,false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION tdee_rules14_private.profile_support_current(jsonb,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
