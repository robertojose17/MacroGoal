-- Definitions installed inactive by migration20261116124243; this review script stays ROLLBACK-only.
-- SOURCE-ONLY, NOT INSTALLED. Requires rateReviewStorageCandidate.sql first.
-- A binding validator, NOT permission to accept. Existing 14d acceptance block stays.
-- Remaining: SQL parity for normalization/coverage, initial anchor and rate arithmetic.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='3s';
CREATE FUNCTION macrogoal_snapshot_review_private.inspect_rate_acceptance_binding_v1(
 p_actor uuid,p_payload jsonb,p_goal jsonb,p_profile jsonb,p_policy jsonb,p_readiness jsonb,p_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE r macrogoal_snapshot_review_private.rate_review_versions; evidence jsonb; expected jsonb; n timestamptz; today date;
BEGIN
 IF p_actor IS NULL OR auth.uid() IS DISTINCT FROM p_actor THEN
  RETURN jsonb_build_object('status','blocked','reason','authentication_required','actionable',false); END IF;
 -- Match acceptance lock order. Appending a revocation must take this same lock.
 PERFORM 1 FROM public.users WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','blocked','reason','profile_unavailable','actionable',false); END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_goal) IS DISTINCT FROM 'object' OR
 jsonb_typeof(p_profile) IS DISTINCT FROM 'object' OR jsonb_typeof(p_policy) IS DISTINCT FROM 'object' OR
 jsonb_typeof(p_readiness) IS DISTINCT FROM 'object' OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' THEN
  RETURN jsonb_build_object('status','blocked','reason','invalid_context','actionable',false); END IF;
 evidence:=p_payload->'rateEvidence';
 IF jsonb_typeof(evidence) IS DISTINCT FROM 'object' OR
 p_goal->>'user_id' IS DISTINCT FROM p_actor::text OR p_profile->>'id' IS DISTINCT FROM p_actor::text OR
 p_readiness->>'ownerId' IS DISTINCT FROM p_actor::text OR p_snapshot->>'ownerId' IS DISTINCT FROM p_actor::text OR
 p_policy->>'engine_version' IS DISTINCT FROM 'rate-review-14d-v1' OR
 p_policy->'enabled' IS DISTINCT FROM 'true'::jsonb OR p_policy->'reviewed' IS DISTINCT FROM 'true'::jsonb OR
 p_policy->'snapshot_contract_reviewed' IS DISTINCT FROM 'true'::jsonb OR
 p_payload->>'engineVersion' IS DISTINCT FROM p_policy->>'engine_version' OR
 p_payload->>'policyDigest' IS DISTINCT FROM p_policy->>'digest' OR
 p_payload->'goalSnapshot' IS DISTINCT FROM p_goal OR
 p_payload->>'profileUpdatedAt' IS DISTINCT FROM p_profile->>'updatedAt' THEN
  RETURN jsonb_build_object('status','blocked','reason','rate_binding_changed','actionable',false); END IF;
 -- Never filter for reviewed/applicable before selecting latest: revocation wins.
 SELECT * INTO r FROM macrogoal_snapshot_review_private.rate_review_versions
 WHERE owner_id=p_actor AND goal_id=(p_goal->>'id')::uuid ORDER BY review_version DESC LIMIT 1 FOR SHARE;
 n:=clock_timestamp();
 IF NOT FOUND OR (p_policy->>'expires_at') IS NULL OR NOT isfinite((p_policy->>'expires_at')::timestamptz) OR
 NOT isfinite(r.recorded_at) OR r.recorded_at>n OR r.verified_at>r.recorded_at OR
 NOT isfinite(r.source_captured_at) OR NOT isfinite(r.reviewed_at) OR NOT isfinite(r.verified_at) OR NOT isfinite(r.expires_at) OR
 (p_policy->>'expires_at')::timestamptz<=n OR r.decision IS DISTINCT FROM 'reviewed' OR r.expires_at<=n OR r.reviewed_at>n OR r.verified_at>n OR
 r.reviewed_at<r.source_captured_at OR r.verified_at<r.reviewed_at OR
 r.goal_revision IS DISTINCT FROM (p_goal->>'updated_at')::timestamptz OR
 r.profile_updated_at IS DISTINCT FROM (p_profile->>'updatedAt')::timestamptz OR
 r.profile_binding IS DISTINCT FROM p_readiness->>'profileBinding' OR
 r.journey_binding IS DISTINCT FROM p_readiness->>'journeyBinding' OR
 r.policy_version IS DISTINCT FROM p_policy->>'version' OR r.policy_digest IS DISTINCT FROM p_policy->>'digest' OR
 r.engine_version IS DISTINCT FROM p_policy->>'engine_version' OR
 r.source_fingerprint IS DISTINCT FROM p_payload->>'sourceFingerprint' OR
 r.source_fingerprint IS DISTINCT FROM p_snapshot->>'sourceFingerprint' OR
 date_trunc('milliseconds',r.source_captured_at) IS DISTINCT FROM (p_payload->>'sourceCapturedAt')::timestamptz THEN
  RETURN jsonb_build_object('status','blocked','reason','rate_review_changed','actionable',false); END IF;
 today:=(n AT TIME ZONE (p_profile->>'timezone'))::date;
 IF r.window_end_exclusive IS DISTINCT FROM today OR r.window_start IS DISTINCT FROM today-14 OR
 n-r.source_captured_at>interval '30 seconds' OR r.source_captured_at>n OR
 (p_snapshot->>'capturedAt') IS NULL OR NOT isfinite((p_snapshot->>'capturedAt')::timestamptz) OR
 (p_snapshot->>'capturedAt')::timestamptz>n OR
 (p_snapshot->>'capturedAt')::timestamptz<r.source_captured_at OR
 p_payload->>'today' IS DISTINCT FROM today::text OR
 p_readiness#>'{eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR
 p_snapshot#>'{context,premium}' IS DISTINCT FROM 'true'::jsonb OR
 p_snapshot#>'{context,enabled}' IS DISTINCT FROM 'true'::jsonb THEN
  RETURN jsonb_build_object('status','blocked','reason','rate_source_expired_or_changed','actionable',false); END IF;
 -- Exact audited record, including all timestamps and provenance identity.
 expected:=jsonb_build_object('version','fourteen-day-reviewed-input-v1',
 'reviewId',r.review_id,'reviewVersion',r.review_version,'methodVersion',r.method_version,
 'reviewedAt',floor(extract(epoch FROM r.reviewed_at)*1000),'expiresAt',floor(extract(epoch FROM r.expires_at)*1000),
 'ownerId',r.owner_id,'goalId',r.goal_id,'goalRevision',p_goal->>'updated_at',
 'profileUpdatedAt',p_profile->>'updatedAt','profileBinding',r.profile_binding,'journeyBinding',r.journey_binding,
 'policyVersion',r.policy_version,'policyDigest',r.policy_digest,'engineVersion',r.engine_version,
 'sourceFingerprint',r.source_fingerprint,'sourceCapturedAt',floor(extract(epoch FROM r.source_captured_at)*1000),
 'windowStart',r.window_start,'windowEndExclusive',r.window_end_exclusive,
 'approvalDigest',r.approval_digest,'approvalVersion',r.approval_version,
 'uncertainty',jsonb_build_object('validated',true,'stable',true,'lowerKgPerWeek',r.lower_kg_per_week,'upperKgPerWeek',r.upper_kg_per_week),
 'conversion',jsonb_build_object('reviewed',true,'model',r.conversion_model,'kcalPerKg',r.kcal_per_kg));
 IF evidence IS DISTINCT FROM expected THEN
  RETURN jsonb_build_object('status','blocked','reason','rate_evidence_changed','actionable',false); END IF;
 RETURN jsonb_build_object('status','binding_validated','actionable',false,'acceptanceAuthorized',false,
 'reviewId',r.review_id,'reviewVersion',r.review_version,'expiresAt',r.expires_at,
 'remainingGate','rate_acceptance_contract_unavailable');
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR invalid_parameter_value OR numeric_value_out_of_range THEN
 RETURN jsonb_build_object('status','blocked','reason','invalid_rate_evidence','actionable',false);
END $fn$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.inspect_rate_acceptance_binding_v1(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ROLLBACK;
