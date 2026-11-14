-- REVIEW CANDIDATE ONLY. Does not enable policies or alter goals/anchors.
-- Server-supplied snapshot evidence; writes only private eligibility. No grants.
BEGIN;
CREATE FUNCTION macrogoal_snapshot_review_private.refresh_eligibility(p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid; u public.users; g public.goals; policy macrogoal_snapshot_review_private.policies;
 a macrogoal_snapshot_review_private.anchors; evidence jsonb; digest text; expiry timestamptz;
 at_time timestamptz:=clock_timestamp(); jb text; pb text; window_start date; as_of date; today date;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='issuer_required'; END IF;
 IF p_record IS NULL OR jsonb_typeof(p_record) IS DISTINCT FROM 'object' OR octet_length(p_record::text)>24576 OR
 p_record->>'kind' IS DISTINCT FROM 'eligibility_refresh_draft' OR p_record->'actionable' IS DISTINCT FROM 'false'::jsonb OR
 NOT p_record ?& ARRAY['ownerId','expectedProfileUpdatedAt','expectedGoalSnapshot','journeyBinding','sourceFingerprint','readinessFingerprint','sourceCapturedAt','policyVersion','policyDigest','engineVersion','anchorId','expectedAnchorSnapshot','eligibilityEvidence'] OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(p_record) k WHERE k NOT IN
 ('kind','actionable','ownerId','expectedProfileUpdatedAt','expectedGoalSnapshot','journeyBinding','sourceFingerprint','readinessFingerprint','sourceCapturedAt','policyVersion','policyDigest','engineVersion','anchorId','expectedAnchorSnapshot','eligibilityEvidence')) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='refresh_invalid'; END IF;
 actor:=(p_record->>'ownerId')::uuid;
 IF actor IS NULL OR NOT macrogoal_snapshot_review_private.snapshot_time_valid(p_record->>'sourceCapturedAt',at_time) OR
 jsonb_typeof(p_record->'expectedProfileUpdatedAt') IS DISTINCT FROM 'string' OR
 jsonb_typeof(p_record->'expectedGoalSnapshot') IS DISTINCT FROM 'object' OR
 jsonb_typeof(p_record->'expectedAnchorSnapshot') IS DISTINCT FROM 'object' OR
 coalesce(p_record->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$' OR
 coalesce(p_record->>'readinessFingerprint','') !~ '^[a-f0-9]{64}$' OR
 coalesce(p_record->>'journeyBinding','') !~ '^[a-f0-9]{64}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='refresh_evidence_invalid'; END IF;
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND OR u.updated_at IS NULL OR u.updated_at IS DISTINCT FROM (p_record->>'expectedProfileUpdatedAt')::timestamptz THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='profile_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=u.timezone) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable'; END IF;
 today:=(at_time AT TIME ZONE u.timezone)::date;
 IF u.date_of_birth IS NULL OR u.date_of_birth>(today-interval '18 years')::date OR
 u.date_of_birth<(today-interval '100 years')::date OR u.sex IS NULL OR u.sex NOT IN ('female','male') THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='profile_review_required'; END IF;
 jb:=encode(sha256(convert_to(jsonb_build_object('owner',actor,'start',u.journey_start_date,'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex');
 pb:=encode(sha256(convert_to(jsonb_build_object('owner',actor,'dob',u.date_of_birth,'sex',u.sex,'journey',jb,'timezone',u.timezone)::text,'UTF8')),'hex');
 IF jb IS DISTINCT FROM p_record->>'journeyBinding' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='journey_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM macrogoal_readiness_private.attestations t WHERE t.owner_id=actor AND t.journey_binding=jb AND
 t.version='general-adult-v1' AND t.response='criteria_confirmed' AND t.accepted_at<=at_time AND t.expires_at>at_time AND t.profile_binding=pb) THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='readiness_changed'; END IF;
 SELECT * INTO g FROM public.goals WHERE user_id=actor AND is_active=true FOR UPDATE;
 IF NOT FOUND OR (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 OR
 to_jsonb(g) IS DISTINCT FROM p_record->'expectedGoalSnapshot' THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='goal_changed'; END IF;
 SELECT * INTO policy FROM macrogoal_snapshot_review_private.policies WHERE version=p_record->>'policyVersion' FOR SHARE;
 IF NOT FOUND OR NOT policy.enabled OR NOT policy.reviewed OR NOT policy.snapshot_contract_reviewed OR
 policy.expires_at<=at_time OR policy.digest IS DISTINCT FROM p_record->>'policyDigest' OR
 policy.engine_version IS DISTINCT FROM p_record->>'engineVersion' THEN
 RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='safety_review_required'; END IF;
 SELECT * INTO a FROM macrogoal_snapshot_review_private.anchors
 WHERE id=(p_record->>'anchorId')::uuid AND owner_id=actor FOR UPDATE;
 IF NOT FOUND OR a.revoked OR a.active_goal_id IS DISTINCT FROM g.id OR a.policy_version IS DISTINCT FROM policy.version OR
 a.journey_binding IS DISTINCT FROM jb OR to_jsonb(a) IS DISTINCT FROM p_record->'expectedAnchorSnapshot' THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='anchor_changed'; END IF;
 -- Only a fixed server planner supplies completeness/receipt-chain evidence.
 -- No auth-user wrapper accepts self-asserted review flags or targets.
 evidence:=p_record->'eligibilityEvidence';
 IF jsonb_typeof(evidence) IS DISTINCT FROM 'object' OR
 NOT evidence ?& ARRAY['responseVersion','readinessVerified','completeDaysVerified','windowStart','asOf','expiresAt'] OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(evidence) k WHERE k NOT IN
 ('responseVersion','readinessVerified','completeDaysVerified','windowStart','asOf','expiresAt')) OR
 evidence->'readinessVerified' IS DISTINCT FROM 'true'::jsonb OR evidence->'completeDaysVerified' IS DISTINCT FROM 'true'::jsonb OR
 evidence->>'responseVersion' IS DISTINCT FROM 'general-adult-v1' OR
 coalesce(evidence->>'windowStart','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(evidence->>'asOf','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='eligibility_evidence_invalid'; END IF;
 window_start:=(evidence->>'windowStart')::date; as_of:=(evidence->>'asOf')::date;
 IF window_start<greatest(today-29,coalesce(u.journey_start_date,today-29)) OR window_start>=as_of OR as_of>=today THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='evidence_window_invalid'; END IF;
 expiry:=(evidence->>'expiresAt')::timestamptz;
 IF expiry IS NULL OR NOT isfinite(expiry) OR expiry<=at_time OR expiry>policy.expires_at OR
 expiry>(p_record->>'sourceCapturedAt')::timestamptz+interval '5 minutes' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='eligibility_expired'; END IF;
 IF NOT macrogoal_snapshot_review_private.snapshot_time_valid(p_record->>'sourceCapturedAt',clock_timestamp()) OR
 expiry<=clock_timestamp() OR policy.expires_at<=clock_timestamp() OR
 NOT EXISTS(SELECT 1 FROM macrogoal_readiness_private.attestations t WHERE t.owner_id=actor AND
 t.version='general-adult-v1' AND t.response='criteria_confirmed' AND t.journey_binding=jb AND t.profile_binding=pb AND
 t.accepted_at<=clock_timestamp() AND t.expires_at>clock_timestamp()) THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='source_expired_or_readiness_changed'; END IF;
 digest:=encode(sha256(convert_to(jsonb_build_object('ownerId',actor,'anchorId',a.id,'policyDigest',policy.digest,
 'sourceFingerprint',p_record->>'sourceFingerprint','readinessFingerprint',p_record->>'readinessFingerprint','evidence',evidence)::text,'UTF8')),'hex');
 INSERT INTO macrogoal_snapshot_review_private.eligibility(owner_id,policy_version,digest,eligible,complete_days_verified,source_fingerprint,expires_at)
 VALUES(actor,policy.version,digest,true,true,p_record->>'sourceFingerprint',expiry)
 ON CONFLICT(owner_id,policy_version) DO UPDATE SET digest=excluded.digest,eligible=excluded.eligible,
 complete_days_verified=excluded.complete_days_verified,source_fingerprint=excluded.source_fingerprint,expires_at=excluded.expires_at;
 RETURN jsonb_build_object('version','snapshot-eligibility-refresh-v1','status','refreshed','ownerId',actor,'anchorId',a.id,
 'eligibilityDigest',digest,'expiresAt',expiry,'actionable',false);
END $f$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.refresh_eligibility(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_refresh_snapshot_eligibility_v1(p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='issuer_required'; END IF;
 RETURN macrogoal_snapshot_review_private.refresh_eligibility(p_record);
END $f$;
REVOKE ALL ON FUNCTION public.tdee_refresh_snapshot_eligibility_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Reviewed installation must separately grant service_role only. Nothing granted here.
COMMIT;
