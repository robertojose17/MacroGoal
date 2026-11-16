-- Schema/function mirror of production migration 20261116112405.
-- The owner-approved account activation and account-specific assertions were
-- executed atomically in production; private account identifiers are deliberately
-- not published in this source mirror. Replaying this file does not activate users.
-- Existing tester_access and decision functions (30-second RevenueCat proof TTL),
-- function ACLs, RLS, and the existing 24-hour temporary-binding constraint remain unchanged.

-- Eligibility only; RevenueCat proof/decision and 30-second TTL unchanged.
-- A finite five-minute registry envelope is reissued after checking revocation.
ALTER TABLE entitlement_cache_candidate.tester_bindings ADD COLUMN until_revoked boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION entitlement_cache_candidate.qa_scope(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE b record; now_at timestamptz:=clock_timestamp();
BEGIN
 IF p_actor IS NULL THEN RETURN NULL; END IF;
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' AND
  (p_actor IS DISTINCT FROM auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
 END IF;
 SELECT approved_actor,enabled,revision,approved_at,
 CASE WHEN until_revoked THEN now_at + interval '5 minutes' ELSE expires_at END AS expires_at
 INTO b FROM entitlement_cache_candidate.tester_bindings
 WHERE approved_actor=p_actor;
 IF FOUND THEN
  IF NOT b.enabled OR b.approved_at>now_at OR b.expires_at<=now_at THEN RETURN NULL; END IF;
 ELSE
  SELECT approved_actor,enabled,revision,approved_at,expires_at INTO b FROM entitlement_cache_candidate.qa_binding
  WHERE singleton=true AND account_label='test_macro_4217' AND approved_actor=p_actor
   AND enabled=true AND approved_at<=now_at AND expires_at>now_at;
  IF NOT FOUND THEN
   SELECT approved_actor,enabled,revision,approved_at,expires_at INTO b FROM entitlement_cache_candidate.observation_bindings
   WHERE approved_actor=p_actor AND enabled=true AND approved_at<=now_at AND expires_at>now_at;
   IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('kind','server_verified_test_account_registry','policyContext','test_account','actor',p_actor,
 'environment','SANDBOX','expiresAt',extract(epoch FROM b.expires_at)*1000,'registryVersion',b.revision::text);
END $function$
;
CREATE OR REPLACE FUNCTION entitlement_cache_candidate.tester_status(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE b entitlement_cache_candidate.tester_bindings; now_at timestamptz:=clock_timestamp(); scope_expiry timestamptz;
BEGIN
 IF p_actor IS NULL OR (current_setting('role',true) IS DISTINCT FROM 'service_role' AND
  (p_actor IS DISTINCT FROM auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false))) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
 END IF;
 SELECT * INTO b FROM entitlement_cache_candidate.tester_bindings WHERE approved_actor=p_actor;
 IF NOT FOUND THEN RETURN jsonb_build_object('managed',false,'revision',NULL,'expiresAt',NULL,'enabled',false); END IF;
 scope_expiry:=CASE WHEN b.until_revoked THEN now_at+interval '5 minutes' ELSE b.expires_at END;
 RETURN jsonb_build_object('managed',true,'revision',b.revision::text,'expiresAt',extract(epoch FROM scope_expiry)*1000,
  'enabled',b.enabled AND b.approved_at<=now_at AND scope_expiry>now_at);
END $function$
;
