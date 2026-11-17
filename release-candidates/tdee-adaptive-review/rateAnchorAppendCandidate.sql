-- Date.parse-compatible bounded ISO parser: validate calendar, truncate fractional
-- milliseconds, and support explicit offsets without PostgreSQL displacement cap.
CREATE FUNCTION tdee_rate_anchor_private.parse_instant(v text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $instant$
DECLARE m text[]; y int; result timestamptz; off_minutes int;
BEGIN
 m:=regexp_match(v,'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$');
 IF m IS NULL OR m[4]::int>23 OR m[5]::int>59 OR m[6]::int>59
 OR (m[8]<>'Z' AND (m[10]::int>23 OR m[11]::int>59)) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_time_format_invalid'; END IF;
 y:=m[1]::int;
 -- ISO year zero is 1 BC in PostgreSQL; no calendar normalization allowed.
 result:=make_timestamptz(CASE WHEN y=0 THEN -1 ELSE y END,m[2]::int,m[3]::int,m[4]::int,m[5]::int,m[6]::int,'UTC');
 result:=result+(rpad(left(coalesce(m[7],''),3),3,'0')::int)*interval '1 millisecond';
 IF m[8]<>'Z' THEN
 off_minutes:=m[10]::int*60+m[11]::int;
 result:=result-(CASE WHEN m[9]='+' THEN off_minutes ELSE -off_minutes END)*interval '1 minute';
 END IF;
 RETURN result;
END $instant$;
REVOKE ALL ON FUNCTION tdee_rate_anchor_private.parse_instant(text) FROM PUBLIC,anon,authenticated,service_role;

-- SOURCE ONLY pure derivation. No database state or approval is created.
CREATE FUNCTION tdee_rate_anchor_private.derive_initial(s jsonb,p_owner uuid,p_as_of timestamptz)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $derive$
DECLARE g jsonb;u jsonb;r jsonb;expected jsonb;captured timestamptz;accepted timestamptz;updated timestamptz;
 receipt_at timestamptz;profile_at timestamptz;today date;dob date;start_date date;age_years int;
 calories numeric;protein numeric;carbs numeric;fats numeric;key text;n numeric;accepted_ms bigint;
BEGIN
 IF p_owner IS NULL OR p_owner::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of<'1970-01-01T00:00:00Z'::timestamptz
 OR s IS NULL OR jsonb_typeof(s) IS DISTINCT FROM 'object'
 OR s->>'version' IS DISTINCT FROM 'accepted-goal-rate-anchor-source-v1'
 OR s->>'ownerId' IS DISTINCT FROM p_owner::text OR s->'actionable' IS DISTINCT FROM 'false'::jsonb
 OR s->'existingAnchor' IS DISTINCT FROM 'null'::jsonb THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_source_invalid'; END IF;
 g:=s->'currentGoal';u:=s->'currentProfile';r:=s->'receipt';
 IF jsonb_typeof(g) IS DISTINCT FROM 'object' OR jsonb_typeof(u) IS DISTINCT FROM 'object'
 OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR jsonb_typeof(r->'payload') IS DISTINCT FROM 'object'
 OR jsonb_typeof(r->'goal_snapshot') IS DISTINCT FROM 'object' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_source_invalid'; END IF;
 FOREACH key IN ARRAY ARRAY['capturedAt'] LOOP
 IF jsonb_typeof(s->key) IS DISTINCT FROM 'string' OR s->>key !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_time_format_invalid'; END IF;
 END LOOP;
 FOREACH key IN ARRAY ARRAY['created_at','updated_at'] LOOP
 IF jsonb_typeof(g->key) IS DISTINCT FROM 'string' OR g->>key !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_time_format_invalid'; END IF;
 END LOOP;
 IF coalesce(r->>'created_at','') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
 OR coalesce(u->>'updated_at','') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
 OR coalesce(u->>'date_of_birth','') !~ '^\d{4}-\d{2}-\d{2}$'
 OR coalesce(u->>'journey_start_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_time_format_invalid'; END IF;
 captured:=tdee_rate_anchor_private.parse_instant(s->>'capturedAt');
 IF captured IS NULL OR NOT isfinite(captured) OR captured>p_as_of OR p_as_of-captured>interval '30 seconds' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_source_expired'; END IF;
 IF g->>'user_id' IS DISTINCT FROM p_owner::text OR g->'is_active' IS DISTINCT FROM 'true'::jsonb
 OR u->>'id' IS DISTINCT FROM p_owner::text OR u->'onboarding_completed' IS DISTINCT FROM 'true'::jsonb
 OR coalesce(g->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR coalesce(r->>'request_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR r->>'user_id' IS DISTINCT FROM p_owner::text OR r->>'goal_id' IS DISTINCT FROM g->>'id'
 OR r->'goal_snapshot' IS DISTINCT FROM g OR coalesce(r#>>'{payload,operation}','') NOT IN ('initial_onboarding','manual_goal')
 OR coalesce(r->>'profile_fingerprint','') !~ '^[a-f0-9]{64}$'
 OR NOT macrogoal_goal_write_private.material_evidence_current(r,s->'currentMaterialProfile',p_owner)
 OR coalesce(s->>'profileBinding','') !~ '^[a-f0-9]{64}$' OR coalesce(s->>'journeyBinding','') !~ '^[a-f0-9]{64}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted_receipt_mismatch'; END IF;
 -- UUID casts are from authoritative database rows, never request strings.
 PERFORM (g->>'id')::uuid,(r->>'request_id')::uuid;
 accepted:=tdee_rate_anchor_private.parse_instant(g->>'created_at');updated:=tdee_rate_anchor_private.parse_instant(g->>'updated_at');
 receipt_at:=tdee_rate_anchor_private.parse_instant(r->>'created_at');profile_at:=tdee_rate_anchor_private.parse_instant(r->>'material_profile_updated_at');
 IF accepted IS NULL OR updated IS NULL OR receipt_at IS NULL OR profile_at IS NULL OR
 NOT isfinite(accepted) OR NOT isfinite(updated) OR NOT isfinite(receipt_at) OR NOT isfinite(profile_at)
 OR accepted<'1970-01-01T00:00:00Z'::timestamptz OR date_trunc('milliseconds',accepted)<>date_trunc('milliseconds',updated)
 OR accepted>captured OR receipt_at>captured OR profile_at>captured THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted_time_invalid'; END IF;
 IF coalesce(u->>'timezone','')='' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted_timezone_invalid'; END IF;
 today:=(captured AT TIME ZONE (u->>'timezone'))::date;dob:=(u->>'date_of_birth')::date;start_date:=(u->>'journey_start_date')::date;
 age_years:=extract(year FROM age(today,dob));
 IF dob IS NULL OR start_date IS NULL OR age_years<19 OR age_years>100 OR start_date>today
 OR g->>'start_journey_date' IS DISTINCT FROM u->>'journey_start_date'
 OR jsonb_typeof(u->'journey_restart_count') IS DISTINCT FROM 'number' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted_profile_invalid'; END IF;
 n:=(u->>'journey_restart_count')::numeric;
 IF n<>trunc(n) OR n<0 OR n>9007199254740991 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted_journey_invalid'; END IF;
 FOREACH key IN ARRAY ARRAY['daily_calories','protein_g','carbs_g','fats_g','fiber_g'] LOOP
 IF jsonb_typeof(g->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted_target_invalid'; END IF;
 n:=(g->>key)::numeric;
 IF n<>trunc(n) OR n<0 OR n>10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted_target_invalid'; END IF;
 END LOOP;
 calories:=(g->>'daily_calories')::numeric;protein:=(g->>'protein_g')::numeric;carbs:=(g->>'carbs_g')::numeric;fats:=(g->>'fats_g')::numeric;
 IF calories<=0 OR g->'base_daily_calories' IS DISTINCT FROM g->'daily_calories' OR g->'last_adaptive_update' IS DISTINCT FROM 'null'::jsonb
 OR abs(calories-4*protein-4*carbs-9*fats)>10 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='accepted_target_invalid'; END IF;
 accepted_ms:=floor(extract(epoch FROM accepted)*1000)::bigint;
 expected:=jsonb_build_object('contract','accepted-intake-rate-anchor-v1','ownerId',p_owner,
 'initialGoalId',g->'id','initialGoalRevision',g->'updated_at','acceptedAt',accepted_ms,
 'baselineIntakeKcal',g->'daily_calories','baselineGoalSnapshot',g,
 'profileBinding',s->'profileBinding','journeyBinding',s->'journeyBinding',
 'journeyStartDate',u->'journey_start_date','journeyRestartCount',u->'journey_restart_count',
 'sourceReceipt',jsonb_build_object('requestId',r->'request_id','operation',r#>'{payload,operation}',
 'createdAt',r->'created_at','acceptedProfileFingerprint',r->'profile_fingerprint','acceptedProfileUpdatedAt',r->'material_profile_updated_at'),
 'acceptedDeltaKcal',0,'acceptedCount',0,'lastAcceptedAt',NULL,'earliestReviewAt',accepted_ms+1209600000);
 RETURN expected;
END $derive$;
REVOKE ALL ON FUNCTION tdee_rate_anchor_private.derive_initial(jsonb,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

-- SOURCE ONLY. Requires history-loader candidate. Never grants private access.
CREATE FUNCTION tdee_rate_anchor_private.append_initial(p_owner uuid,p_expected_version bigint,p_anchor jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $fn$
DECLARE s jsonb; g jsonb; u jsonb; r jsonb; h jsonb; expected jsonb; prior jsonb;
 captured timestamptz; accepted timestamptz; updated timestamptz; receipt_at timestamptz; profile_at timestamptz;
 today date; dob date; start_date date; age_years int; calories numeric; protein numeric; carbs numeric; fats numeric;
 key text; n numeric; latest_version bigint; accepted_ms bigint;
BEGIN
 IF p_owner IS NULL OR p_owner::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR p_expected_version IS NULL OR p_expected_version<0 OR p_expected_version>=9007199254740991
 OR p_anchor IS NULL OR jsonb_typeof(p_anchor)<>'object' OR octet_length(p_anchor::text)>32768 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_request_invalid'; END IF;
 -- Matches existing goal writer's owner lock. Refresh the authoritative source AFTER acquiring it.
 PERFORM 1 FROM public.users WHERE id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable'; END IF;
 s:=tdee_rate_anchor_private.read_source(p_owner);
 IF s->>'version' IS DISTINCT FROM 'accepted-goal-rate-anchor-source-v1' OR s->>'ownerId' IS DISTINCT FROM p_owner::text
 OR s->'actionable' IS DISTINCT FROM 'false'::jsonb OR s->>'unavailable'='true' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_source_unavailable'; END IF;
 g:=s->'currentGoal';u:=s->'currentProfile';r:=s->'receipt';h:=s->'existingAnchor';
 SELECT coalesce(max(version),0) INTO latest_version FROM tdee_rate_anchor_private.anchors WHERE owner_id=p_owner;
 IF latest_version<>p_expected_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='anchor_cas_conflict'; END IF;
 IF h IS DISTINCT FROM 'null'::jsonb THEN
 IF h->>'kind' IS DISTINCT FROM 'rate_anchor_head' OR h->>'ownerId' IS DISTINCT FROM p_owner::text
 OR (h->>'version')::bigint<>latest_version THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_head_unavailable'; END IF;
 prior:=h->'anchor';
 IF prior->>'contract' IS DISTINCT FROM 'accepted-intake-rate-anchor-v1' OR prior->>'ownerId' IS DISTINCT FROM p_owner::text
 OR jsonb_typeof(prior->'acceptedAt') IS DISTINCT FROM 'number'
 OR prior->>'acceptedAt' IS NULL
 OR r->>'request_id' IS NOT DISTINCT FROM prior#>>'{sourceReceipt,requestId}'
 OR g->>'id' IS NOT DISTINCT FROM prior->>'initialGoalId'
 OR r#>>'{payload,operation}' IS DISTINCT FROM 'manual_goal'
 OR floor(extract(epoch FROM (g->>'created_at')::timestamptz)*1000)<=(prior->>'acceptedAt')::bigint THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='anchor_reset_forbidden'; END IF;
 ELSIF latest_version<>0 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='anchor_head_mismatch'; END IF;
 expected:=tdee_rate_anchor_private.derive_initial(jsonb_set(s,'{existingAnchor}','null'::jsonb),p_owner,clock_timestamp());
 accepted:=(g->>'created_at')::timestamptz;
 IF p_anchor IS DISTINCT FROM expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='anchor_draft_changed'; END IF;
 INSERT INTO tdee_rate_anchor_private.anchors(owner_id,version,prior_version,source_request_id,source_goal_id,accepted_at,anchor)
 VALUES(p_owner,latest_version+1,nullif(latest_version,0),(r->>'request_id')::uuid,(g->>'id')::uuid,accepted,expected);
 RETURN jsonb_build_object('ownerId',p_owner,'version',latest_version+1,'sourceRequestId',r->'request_id','sourceGoalId',g->'id',
 'anchor',expected,'actionable',false);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_anchor_private.append_initial(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_internal_rate_anchor_append_v1(p_owner uuid,p_expected_version bigint,p_anchor jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required'; END IF;
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','anchor_persistence_contract_off'); END IF;
 RETURN tdee_rate_anchor_private.append_initial(p_owner,p_expected_version,p_anchor);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_internal_rate_anchor_append_v1(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tdee_internal_rate_anchor_append_v1(uuid,bigint,jsonb) TO service_role;
