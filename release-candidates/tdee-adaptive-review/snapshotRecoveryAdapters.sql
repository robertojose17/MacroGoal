-- Own-actor recovery only. Never issues a proposal or modifies goals.
BEGIN;
SET LOCAL lock_timeout='2s';
CREATE FUNCTION macrogoal_snapshot_review_private.read_offer(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid:=macrogoal_snapshot_review_private.assert_request(p_request);
 p macrogoal_snapshot_review_private.proposals; pol macrogoal_snapshot_review_private.policies;
BEGIN
 SELECT * INTO p FROM macrogoal_snapshot_review_private.proposals WHERE id=(p_request->>'proposalId')::uuid AND owner_id=actor AND digest=p_request->>'proposalDigest';
 IF NOT FOUND THEN RETURN jsonb_build_object('version','adaptive-offer-v1','request',p_request,'status','not_found','proposal',null); END IF;
 SELECT * INTO pol FROM macrogoal_snapshot_review_private.policies WHERE version=p.policy_version;
 IF p.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('version','adaptive-offer-v1','request',p_request,'status','expired','proposal',null); END IF;
 IF p.consumed_request IS NOT NULL THEN RETURN jsonb_build_object('version','adaptive-offer-v1','request',p_request,'status','consumed','proposal',null); END IF;
 IF pol.version IS NULL OR NOT pol.enabled OR NOT pol.reviewed OR NOT pol.snapshot_contract_reviewed OR pol.expires_at<=clock_timestamp() THEN
 RETURN jsonb_build_object('version','adaptive-offer-v1','request',p_request,'status','unavailable','proposal',null); END IF;
 RETURN jsonb_build_object('version','adaptive-offer-v1','request',p_request,'status','available',
 'proposal',jsonb_build_object('type','persisted_reviewed_proposal','actionable',true,'ownerId',actor,'id',p.id,'digest',p.digest,
 'policyVersion',p.policy_version,'engineVersion',pol.engine_version,'expiresAt',p.expires_at,
 'current',p.payload->'current','target',p.payload->'target','deltaKcal',p.payload->'deltaKcal','sourceDate',p.payload->'sourceDate'));
END $f$;
CREATE FUNCTION macrogoal_snapshot_review_private.close_expired(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid:=macrogoal_snapshot_review_private.assert_request(p_request); prior jsonb; p macrogoal_snapshot_review_private.proposals;
BEGIN
 prior:=macrogoal_snapshot_review_private.read_receipt(p_request);
 IF prior->>'status'<>'not_found' THEN RETURN prior; END IF;
 -- Same lock order as acceptance: an in-flight commit wins or sees this rejection.
 PERFORM 1 FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable'; END IF;
 prior:=macrogoal_snapshot_review_private.read_receipt(p_request);
 IF prior->>'status'<>'not_found' THEN RETURN prior; END IF;
 SELECT * INTO p FROM macrogoal_snapshot_review_private.proposals
 WHERE id=(p_request->>'proposalId')::uuid AND owner_id=actor AND digest=p_request->>'proposalDigest' FOR UPDATE;
 IF NOT FOUND OR p.expires_at>clock_timestamp() THEN
 RETURN jsonb_build_object('version','adaptive-receipt-v1','status','not_found'); END IF;
 -- Only a terminal rejected receipt is added. Never invoke accept_proposal.
 RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_expired');
END $f$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.read_offer(jsonb),macrogoal_snapshot_review_private.close_expired(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_read_snapshot_offer_v1(p_request jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $f$ SELECT macrogoal_snapshot_review_private.read_offer(p_request) $f$;
CREATE FUNCTION public.tdee_close_expired_snapshot_request_v1(p_request jsonb) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $f$ SELECT macrogoal_snapshot_review_private.close_expired(p_request) $f$;
REVOKE ALL ON FUNCTION public.tdee_read_snapshot_offer_v1(jsonb),public.tdee_close_expired_snapshot_request_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_snapshot_review_private.read_offer(jsonb),macrogoal_snapshot_review_private.close_expired(jsonb),
 public.tdee_read_snapshot_offer_v1(jsonb),public.tdee_close_expired_snapshot_request_v1(jsonb) TO authenticated;
COMMIT;
