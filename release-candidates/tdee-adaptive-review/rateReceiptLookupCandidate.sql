-- Source only. Own-account exact read recovery never retries a write.
-- Requires rateAtomicWriterCandidate.sql request validator and record storage.
CREATE FUNCTION public.tdee_read_rate_receipt_v1(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=tdee_rate_record_private.assert_rate_request(p_request);saved jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id WHERE u.id=actor AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=statement_timestamp())) THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_unavailable'; END IF;
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_receipt_off'); END IF;
 saved:=tdee_rate_record_private.read_exact_request(actor,(p_request->>'requestId')::uuid,p_request);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 -- Not found is not proof an earlier in-flight transaction cannot commit later.
 RETURN jsonb_build_object('version','rate-acceptance-receipt-v1','status','not_found','actionable',false,'request',p_request);
END $$;
REVOKE ALL ON FUNCTION public.tdee_read_rate_receipt_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_read_rate_receipt_v1(jsonb) TO authenticated;
