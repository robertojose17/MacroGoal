-- CANDIDATE ONLY: not executed. Requires review + runtime integration tests.
BEGIN;
CREATE OR REPLACE FUNCTION public.reconcile_expiration_cas_v1(
 p_actor uuid, p_subscription_id uuid,
 p_expected_profile_updated_at timestamptz, p_expected_profile_type text,
 p_expected_subscription_updated_at timestamptz,
 p_product_id text, p_store text, p_environment text,
 p_event_expiration_at timestamptz,
 p_provider_state text, p_provider_verified_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
 u public.users%ROWTYPE;
 s public.subscriptions%ROWTYPE;
 checked_at timestamptz := clock_timestamp();
BEGIN
 -- Trusted backend only. No client-asserted entitlement or actor-authorized bypass.
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'server only' USING ERRCODE='42501';
 END IF;
 IF p_provider_state IS DISTINCT FROM 'inactive'
 OR p_provider_verified_at IS NULL
 OR p_provider_verified_at > checked_at
 OR checked_at-p_provider_verified_at > interval '30 seconds'
 OR p_store IS NULL OR p_store='PROMOTIONAL'
 OR p_environment IS NULL OR p_product_id IS NULL
 OR p_event_expiration_at IS NULL OR p_event_expiration_at>checked_at THEN
   RETURN jsonb_build_object('applied',false,'reason','invalid_or_stale_evidence');
 END IF;
 -- Fixed lock order; both rows remain locked through caller transaction commit.
 SELECT * INTO u FROM public.users WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('applied',false,'reason','missing_profile'); END IF;
 SELECT * INTO s FROM public.subscriptions
 WHERE id=p_subscription_id AND user_id=p_actor::text FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('applied',false,'reason','missing_subscription'); END IF;
 IF u.updated_at IS DISTINCT FROM p_expected_profile_updated_at
 OR u.user_type IS DISTINCT FROM p_expected_profile_type
 OR s.updated_at IS DISTINCT FROM p_expected_subscription_updated_at THEN
   RETURN jsonb_build_object('applied',false,'reason','version_conflict');
 END IF;
 IF s.product_id IS DISTINCT FROM p_product_id OR s.store IS DISTINCT FROM p_store
 OR s.environment IS DISTINCT FROM p_environment
 OR s.period_type='PROMOTIONAL'
 OR s.expiration_at IS NULL OR s.expiration_at>p_event_expiration_at THEN
   RETURN jsonb_build_object('applied',false,'reason','unrelated_or_newer_subscription');
 END IF;
 IF clock_timestamp()-p_provider_verified_at > interval '30 seconds' THEN
   RETURN jsonb_build_object('applied',false,'reason','evidence_expired_while_locked');
 END IF;
 -- No ledger/commission creation. Status moves away from active; type away from premium.
 UPDATE public.subscriptions SET status='inactive',will_renew=false
 WHERE id=s.id;
 UPDATE public.users SET user_type='free',updated_at=clock_timestamp() WHERE id=u.id;
 RETURN jsonb_build_object('applied',true,'reason','provider_confirmed_inactive');
 -- Any error, including triggers or second update failure, rolls back BOTH updates.
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_expiration_cas_v1(uuid,uuid,timestamptz,text,timestamptz,text,text,text,timestamptz,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_expiration_cas_v1(uuid,uuid,timestamptz,text,timestamptz,text,text,text,timestamptz,text,timestamptz) TO service_role;
COMMIT;
