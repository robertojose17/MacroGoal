-- SOURCE ONLY. Requires shared private validate_rate_proposal_locked(actor,record,at).
-- Deduplicate an exact source/review offer, NOT the day: fresh user-open offers
-- have new capture/review binding and do not extend any existing purchase/offer TTL.
CREATE UNIQUE INDEX rate_proposal_source_scope_unique ON tdee_rules14_private.proposals
(owner_id,anchor_version,(record#>>'{payload,goalSnapshot,id}'),(record#>>'{payload,goalSnapshot,updated_at}'),
 (record#>>'{payload,profileUpdatedAt}'),(record#>>'{payload,policyBinding,digest}'),
 (record#>>'{payload,sourceFingerprint}'),(record#>>'{payload,sourceCapturedAt}'),
 (record#>>'{payload,policyBinding,revision}'),(record#>>'{payload,screeningEvidence,requestId}'));
CREATE FUNCTION tdee_rules14_private.issue_proposal(p_owner uuid,p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' AS $fn$
DECLARE admission jsonb; existing tdee_rules14_private.proposals;h jsonb;v_proposal_id uuid;at_time timestamptz;
BEGIN
 IF p_owner IS NULL OR p_record->>'ownerId' IS DISTINCT FROM p_owner::text OR
 NOT tdee_rules14_private.valid_content(p_record,p_record->>'canonicalContent',p_record->>'digest','digest') THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_proposal_invalid';END IF;
 PERFORM 1 FROM public.users WHERE id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_unavailable';END IF;
 v_proposal_id:=(p_record->>'id')::uuid;at_time:=clock_timestamp();
 SELECT * INTO existing FROM tdee_rules14_private.proposals p WHERE p.owner_id=p_owner AND p.id=v_proposal_id;
 IF FOUND THEN
  IF existing.record IS DISTINCT FROM p_record THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_proposal_id_reused';END IF;
  RETURN jsonb_build_object('status','stored','ownerId',p_owner,'digest',existing.digest,'record',existing.record);
 END IF;
 -- This helper is shared with acceptance and must lock/revalidate every source,
 -- policy, review, preference, coverage, arithmetic and allocation obligation.
 admission:=tdee_rules14_private.validate_rate_proposal_locked(p_owner,p_record,at_time);
 IF admission->>'status' IS DISTINCT FROM 'validated' THEN
  RETURN jsonb_build_object('status','blocked','reason',coalesce(admission->>'reason','rate_issuance_unverified'),'actionable',false);
 END IF;
 h:=p_record#>'{payload,anchorReference}';
 IF EXISTS(SELECT 1 FROM tdee_rules14_private.proposals p WHERE p.owner_id=p_owner AND p.anchor_version=(h->>'version')::bigint
 AND p.record#>'{payload,goalSnapshot,id}'=p_record#>'{payload,goalSnapshot,id}'
 AND p.record#>'{payload,goalSnapshot,updated_at}'=p_record#>'{payload,goalSnapshot,updated_at}'
 AND p.record#>'{payload,profileUpdatedAt}'=p_record#>'{payload,profileUpdatedAt}'
 AND p.record#>'{payload,policyBinding,digest}'=p_record#>'{payload,policyBinding,digest}'
 AND p.record#>'{payload,sourceFingerprint}'=p_record#>'{payload,sourceFingerprint}'
 AND p.record#>'{payload,sourceCapturedAt}'=p_record#>'{payload,sourceCapturedAt}'
 AND p.record#>'{payload,policyBinding,revision}'=p_record#>'{payload,policyBinding,revision}'
 AND p.record#>'{payload,screeningEvidence,requestId}'=p_record#>'{payload,screeningEvidence,requestId}') THEN
 RETURN jsonb_build_object('status','already_prepared','actionable',false);END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)>=(p_record->>'expiresAt')::bigint THEN
 RETURN jsonb_build_object('status','blocked','reason','proposal_expired','actionable',false);END IF;
 INSERT INTO tdee_rules14_private.proposals(owner_id,id,anchor_version,source_request_id,source_goal_id,digest,canonical_content,record,expires_at_ms)
 VALUES(p_owner,v_proposal_id,(h->>'version')::bigint,(h->>'sourceRequestId')::uuid,(h->>'sourceGoalId')::uuid,p_record->>'digest',p_record->>'canonicalContent',p_record,(p_record->>'expiresAt')::bigint);
 INSERT INTO tdee_rules14_private.issuance_journal(owner_id,proposal_id,proposal_digest,recorded_at_ms)
 VALUES(p_owner,v_proposal_id,p_record->>'digest',0); -- BEFORE INSERT assigns actual server time.
 RETURN jsonb_build_object('status','stored','ownerId',p_owner,'digest',p_record->>'digest','record',p_record);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.issue_proposal(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_internal_issue_rules14_proposal_v1(p_owner uuid,p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_issuance_off');END IF;
 RETURN tdee_rules14_private.issue_proposal(p_owner,p_record);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_internal_issue_rules14_proposal_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_issue_rules14_proposal_v1(uuid,jsonb) TO service_role;

