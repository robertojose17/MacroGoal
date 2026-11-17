-- Single statement snapshot of raw observed data. No health/readiness attestations.
CREATE OR REPLACE FUNCTION tdee_rules14_private.read_observed_context_v1(p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;n bigint;
BEGIN
 IF p_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';END IF;
 WITH observation AS MATERIALIZED (SELECT tdee_scheduler_private.read_observation(p_owner) value),
 coverage AS MATERIALIZED (SELECT tdee_scheduler_private.read_observed_coverage_v1(p_owner) value),
 profile AS MATERIALIZED (SELECT u.* FROM public.users u WHERE u.id=p_owner),
 goal_rows AS MATERIALIZED (SELECT g.* FROM public.goals g WHERE g.user_id=p_owner AND g.is_active=true ORDER BY g.id LIMIT 2),
 goals AS MATERIALIZED (SELECT count(*) n,jsonb_agg(to_jsonb(g) ORDER BY g.id)->0 value FROM goal_rows g)
 SELECT g.n,jsonb_build_object('version','snapshot-review-context-v1','actor',p_owner,'capturedAt',o.value->'capturedAt','observation',o.value,
 'profile',jsonb_build_object('id',u.id,'updatedAt',u.updated_at,'sex',u.sex,'dateOfBirth',u.date_of_birth,'timezone',u.timezone,
 'journeyStartDate',u.journey_start_date,'journeyRestartCount',u.journey_restart_count,'heightCm',u.height,'heightUnit','cm'),
 'currentGoal',g.value,'readiness',rd.value,'readinessFingerprint',encode(sha256(convert_to((rd.value-'capturedAt')::text,'UTF8')),'hex'),
 'profileSupport',tdee_rules14_private.profile_support(p_owner,(o.value#>>'{context,today}')::date),'actionable',false,'evidenceStatus','unverified')
 INTO n,result FROM observation o CROSS JOIN coverage rd CROSS JOIN profile u CROSS JOIN goals g;
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable';END IF;
 IF n<>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='active_goal_conflict';END IF;
 IF result#>>'{observation,ownerId}' IS DISTINCT FROM p_owner::text OR result#>>'{readiness,ownerId}' IS DISTINCT FROM p_owner::text THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_changed';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION tdee_rules14_private.read_observed_context_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
