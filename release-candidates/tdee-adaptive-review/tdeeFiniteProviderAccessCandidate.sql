-- SOURCE ONLY. Finite-provider-validity access for TDEE; no release flags changed.
-- Uses existing server-verified cache and unchanged 30-second decision validator.
CREATE OR REPLACE FUNCTION tdee_scheduler_private.read_access(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $access$
DECLARE status jsonb; scope entitlement_cache_candidate.scopes; env text; expiry numeric; candidate_expiry numeric; active_env text;
BEGIN
 -- Existing identity and protected registry validation: service or genuine self only.
 status:=entitlement_cache_candidate.tester_status(p_owner);
 FOREACH env IN ARRAY ARRAY['PRODUCTION','SANDBOX'] LOOP
  IF env='SANDBOX' AND NOT coalesce((status->>'enabled')::boolean,false) THEN CONTINUE; END IF;
  SELECT * INTO scope FROM entitlement_cache_candidate.scopes WHERE owner_id=p_owner AND environment=env;
  IF FOUND AND NOT scope.dirty AND entitlement_cache_candidate.decision(p_owner,env,scope.proof)='active' THEN
   candidate_expiry:=(scope.proof->>'validUntil')::numeric;
   IF env='SANDBOX' THEN candidate_expiry:=least(candidate_expiry,(status->>'expiresAt')::numeric); END IF;
   expiry:=least(expiry,candidate_expiry);active_env:=coalesce(active_env,env);
  END IF;
 END LOOP;
 IF expiry IS NOT NULL THEN RETURN jsonb_build_object('ownerId',p_owner,'allowed',true,'validUntil',expiry,'environment',active_env); END IF;
 -- No subscription-table or lifetime fallback. Missing/dirty/stale proof never grants.
 RETURN jsonb_build_object('ownerId',p_owner,'allowed',false,'validUntil',NULL,'environment',NULL);
END $access$;
REVOKE ALL ON FUNCTION tdee_scheduler_private.read_access(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION macrogoal_observed_private.finite_access(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $own$
BEGIN
 IF p_actor IS DISTINCT FROM macrogoal_observed_private.require_actor() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 RETURN tdee_scheduler_private.read_access(p_actor);
END $own$;
REVOKE ALL ON FUNCTION macrogoal_observed_private.finite_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_observed_private.finite_access(uuid) TO authenticated;
