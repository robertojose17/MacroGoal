-- Service-only exact policy lookup candidate. No policy seeds/defaults/listing or activation.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION macrogoal_snapshot_review_private.read_policy(p_version text,p_digest text,p_engine_version text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='issuer_required';
 END IF;
 IF p_version IS NULL OR octet_length(p_version) NOT BETWEEN 1 AND 128 OR p_version<>btrim(p_version) OR
 p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR
 p_engine_version IS NULL OR octet_length(p_engine_version) NOT BETWEEN 1 AND 128 OR p_engine_version<>btrim(p_engine_version) THEN
  RETURN NULL;
 END IF;
 SELECT to_jsonb(p) INTO result FROM macrogoal_snapshot_review_private.policies p
 WHERE p.version=p_version AND p.digest=p_digest AND p.engine_version=p_engine_version
 AND p.enabled AND p.reviewed AND p.snapshot_contract_reviewed AND p.expires_at>statement_timestamp();
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.read_policy(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_read_snapshot_policy_v1(p_version text,p_digest text,p_engine_version text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $f$ SELECT macrogoal_snapshot_review_private.read_policy(p_version,p_digest,p_engine_version) $f$;
REVOKE ALL ON FUNCTION public.tdee_read_snapshot_policy_v1(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_snapshot_review_private.read_policy(text,text,text),public.tdee_read_snapshot_policy_v1(text,text,text) TO service_role;
-- Existing service_role schema USAGE is required; no new schema/table grants.
COMMIT;
