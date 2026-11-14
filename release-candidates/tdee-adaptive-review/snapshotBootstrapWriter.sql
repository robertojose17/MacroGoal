-- Private server bootstrap candidate. Does not enable a policy or alter targets.
BEGIN;
CREATE FUNCTION macrogoal_snapshot_review_private.bootstrap(p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid; u public.users; g public.goals; policy macrogoal_snapshot_review_private.policies;
 a macrogoal_snapshot_review_private.anchors; evidence jsonb; digest text; expiry timestamptz; at_time timestamptz:=clock_timestamp(); jb text;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='issuer_required'; END IF;
 IF p_record IS NULL OR jsonb_typeof(p_record)<>'object' OR octet_length(p_record::text)>24576 OR
 p_record->>'kind' IS DISTINCT FROM 'bootstrap_draft' OR p_record->'actionable' IS DISTINCT FROM 'false'::jsonb OR
 NOT p_record ?& ARRAY['ownerId','expectedProfileUpdatedAt','expectedGoalSnapshot','journeyBinding','sourceFingerprint','readinessFingerprint','sourceCapturedAt','policyVersion','policyDigest','engineVersion','baseline','eligibilityEvidence'] THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='bootstrap_invalid'; END IF;
 actor:=(p_record->>'ownerId')::uuid;
 IF actor IS NULL OR NOT macrogoal_snapshot_review_private.snapshot_time_valid(p_record->>'sourceCapturedAt',at_time) OR
 coalesce(p_record->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$' OR coalesce(p_record->>'readinessFingerprint','') !~ '^[a-f0-9]{64}$' OR
 coalesce(p_record->>'journeyBinding','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='bootstrap_evidence_invalid'; END IF;
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND OR u.updated_at IS DISTINCT FROM (p_record->>'expectedProfileUpdatedAt')::timestamptz THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='profile_changed'; END IF;
 jb:=encode(sha256(convert_to(jsonb_build_object('owner',actor,'start',u.journey_start_date,'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex');
 IF jb IS DISTINCT FROM p_record->>'journeyBinding' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='journey_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM macrogoal_readiness_private.attestations t WHERE t.owner_id=actor AND t.journey_binding=jb AND
 t.response='criteria_confirmed' AND t.expires_at>at_time AND t.profile_binding=encode(sha256(convert_to(jsonb_build_object('owner',actor,'dob',u.date_of_birth,'sex',u.sex,'journey',jb,'timezone',u.timezone)::text,'UTF8')),'hex')) THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='readiness_changed'; END IF;
 SELECT * INTO g FROM public.goals WHERE user_id=actor AND is_active=true FOR UPDATE;
 IF NOT FOUND OR (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 OR to_jsonb(g) IS DISTINCT FROM p_record->'expectedGoalSnapshot' THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='goal_changed'; END IF;
 SELECT * INTO policy FROM macrogoal_snapshot_review_private.policies WHERE version=p_record->>'policyVersion' FOR SHARE;
 IF NOT FOUND OR NOT policy.enabled OR NOT policy.reviewed OR NOT policy.snapshot_contract_reviewed OR policy.expires_at<=at_time OR
 policy.digest IS DISTINCT FROM p_record->>'policyDigest' OR policy.engine_version IS DISTINCT FROM p_record->>'engineVersion' THEN
 RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='safety_review_required'; END IF;
 -- Evidence is supplied only by the fixed trusted server planner, not a client RPC.
 evidence:=p_record->'eligibilityEvidence';
 IF jsonb_typeof(evidence) IS DISTINCT FROM 'object' OR evidence->'readinessVerified' IS DISTINCT FROM 'true'::jsonb OR
 evidence->'completeDaysVerified' IS DISTINCT FROM 'true'::jsonb OR evidence->>'responseVersion' IS DISTINCT FROM 'general-adult-v1' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='eligibility_evidence_invalid'; END IF;
 expiry:=(evidence->>'expiresAt')::timestamptz;
 IF expiry IS NULL OR NOT isfinite(expiry) OR expiry<=at_time OR expiry>policy.expires_at OR expiry>(p_record->>'sourceCapturedAt')::timestamptz+interval '5 minutes' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='eligibility_expired'; END IF;
 IF jsonb_typeof(p_record#>'{baseline,intakeKcal}') IS DISTINCT FROM 'number' OR
 (p_record#>>'{baseline,intakeKcal}')::numeric IS DISTINCT FROM g.daily_calories OR
 jsonb_typeof(p_record#>'{baseline,expenditureKcal}') IS DISTINCT FROM 'number' OR
 (p_record#>>'{baseline,expenditureKcal}')::numeric<>trunc((p_record#>>'{baseline,expenditureKcal}')::numeric) OR
 (p_record#>>'{baseline,expenditureKcal}')::integer NOT BETWEEN 1000 AND 5000 OR
 p_record#>>'{baseline,capturedAt}' IS DISTINCT FROM p_record->>'sourceCapturedAt' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='baseline_invalid'; END IF;
 SELECT * INTO a FROM macrogoal_snapshot_review_private.anchors WHERE owner_id=actor AND active_goal_id=g.id FOR UPDATE;
 IF FOUND THEN
  -- Never silently replace a baseline, remove history, or restart its clock.
  IF a.revoked OR a.policy_version<>policy.version OR a.journey_binding<>p_record->>'journeyBinding' THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='baseline_restart_required'; END IF;
  RETURN jsonb_build_object('version','snapshot-bootstrap-v1','status','existing','anchorId',a.id,'baselineCapturedAt',a.baseline_captured_at,'actionable',false);
 END IF;
 IF NOT macrogoal_snapshot_review_private.snapshot_time_valid(p_record->>'sourceCapturedAt',clock_timestamp()) OR expiry<=clock_timestamp() OR policy.expires_at<=clock_timestamp() THEN
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='source_expired'; END IF;
 INSERT INTO macrogoal_snapshot_review_private.anchors(owner_id,policy_version,active_goal_id,baseline_intake_kcal,baseline_expenditure_kcal,baseline_captured_at,journey_binding,baseline_goal_snapshot)
 VALUES(actor,policy.version,g.id,g.daily_calories,(p_record#>>'{baseline,expenditureKcal}')::integer,(p_record->>'sourceCapturedAt')::timestamptz,p_record->>'journeyBinding',to_jsonb(g)) RETURNING * INTO a;
 digest:=encode(sha256(convert_to(jsonb_build_object('ownerId',actor,'policyDigest',policy.digest,'sourceFingerprint',p_record->>'sourceFingerprint','readinessFingerprint',p_record->>'readinessFingerprint','evidence',evidence)::text,'UTF8')),'hex');
 INSERT INTO macrogoal_snapshot_review_private.eligibility(owner_id,policy_version,digest,eligible,complete_days_verified,source_fingerprint,expires_at)
 VALUES(actor,policy.version,digest,true,true,p_record->>'sourceFingerprint',expiry)
 ON CONFLICT(owner_id,policy_version) DO UPDATE SET digest=excluded.digest,eligible=excluded.eligible,complete_days_verified=excluded.complete_days_verified,source_fingerprint=excluded.source_fingerprint,expires_at=excluded.expires_at;
 RETURN jsonb_build_object('version','snapshot-bootstrap-v1','status','created','anchorId',a.id,'baselineCapturedAt',a.baseline_captured_at,'actionable',false);
END $f$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.bootstrap(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- No wrapper or grant until full server flow and rollback tests pass.
COMMIT;
