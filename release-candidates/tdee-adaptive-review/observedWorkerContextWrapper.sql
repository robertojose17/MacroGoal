-- SOURCE ONLY. No release-state bypass or client identity claims.
CREATE OR REPLACE FUNCTION public.tdee_internal_observed_context_v1(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE selected jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required';END IF;
 IF p_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='owner_required';END IF;
 selected:=tdee_scheduler_private.current_selection(p_owner);
 IF selected IS NULL OR selected->>'engineVersion' IS DISTINCT FROM 'rules14-observed-v2' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='observed_selection_unavailable';END IF;
 RETURN tdee_rules14_private.read_observed_context_v1(p_owner);
END $$;
REVOKE ALL ON FUNCTION public.tdee_internal_observed_context_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_observed_context_v1(uuid) TO service_role;
