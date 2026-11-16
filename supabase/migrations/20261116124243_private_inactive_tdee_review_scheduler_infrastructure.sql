-- Private empty OFF infrastructure. No policies/reviews/cron/worker credentials seeded.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='5s';
DO $fence$ BEGIN
 IF md5(pg_get_functiondef('macrogoal_snapshot_review_private.accept_proposal(jsonb)'::regprocedure))<>'e7dc77b7470a63bc1f079a3b1de0d3a2' THEN RAISE EXCEPTION 'acceptance_changed_review_required'; END IF;
END $fence$;
CREATE TABLE macrogoal_snapshot_review_private.rate_review_versions (
 review_id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
 review_version bigint NOT NULL CHECK(review_version BETWEEN 1 AND 9007199254740991),
 decision text NOT NULL CHECK(decision IN ('reviewed','revoked')),
 goal_revision timestamptz NOT NULL, profile_updated_at timestamptz NOT NULL,
 profile_binding text NOT NULL CHECK(profile_binding ~ '^[a-f0-9]{64}$'),
 journey_binding text NOT NULL CHECK(journey_binding ~ '^[a-f0-9]{64}$'),
 policy_version text NOT NULL CHECK(length(btrim(policy_version)) BETWEEN 1 AND 128),
 policy_digest text NOT NULL CHECK(policy_digest ~ '^[a-f0-9]{64}$'),
 engine_version text NOT NULL CHECK(engine_version='rate-review-14d-v1'),
 source_fingerprint text NOT NULL CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'),
 source_captured_at timestamptz NOT NULL,
 window_start date NOT NULL, window_end_exclusive date NOT NULL CHECK(window_end_exclusive=window_start+14),
 method_version text NOT NULL CHECK(length(btrim(method_version)) BETWEEN 1 AND 128),
 lower_kg_per_week numeric NOT NULL CHECK(lower_kg_per_week::text NOT IN ('NaN','Infinity','-Infinity')),
 upper_kg_per_week numeric NOT NULL CHECK(upper_kg_per_week::text NOT IN ('NaN','Infinity','-Infinity')),
 conversion_model text NOT NULL CHECK(conversion_model='approximate-energy-equivalent-v1'),
 kcal_per_kg integer NOT NULL CHECK(kcal_per_kg=7700),
 reviewed_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 approval_ref text NOT NULL CHECK(length(btrim(approval_ref)) BETWEEN 1 AND 2048),
 approval_digest text NOT NULL CHECK(approval_digest ~ '^[a-f0-9]{64}$'),
 approval_version text NOT NULL CHECK(length(btrim(approval_version)) BETWEEN 1 AND 128),
 verified_by text NOT NULL CHECK(length(btrim(verified_by)) BETWEEN 1 AND 200),
 verified_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,goal_id,review_version),
 CHECK(lower_kg_per_week<=upper_kg_per_week),
 CHECK(isfinite(window_start) AND isfinite(window_end_exclusive) AND isfinite(goal_revision) AND isfinite(profile_updated_at)),
 CHECK(isfinite(source_captured_at) AND isfinite(reviewed_at) AND isfinite(verified_at) AND isfinite(recorded_at) AND isfinite(expires_at)),
 CHECK(source_captured_at<=reviewed_at AND reviewed_at<=verified_at AND verified_at<=recorded_at AND expires_at>reviewed_at),
 CHECK(date_trunc('milliseconds',source_captured_at)=source_captured_at AND date_trunc('milliseconds',reviewed_at)=reviewed_at AND date_trunc('milliseconds',expires_at)=expires_at)
);
ALTER TABLE macrogoal_snapshot_review_private.rate_review_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_snapshot_review_private.rate_review_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON macrogoal_snapshot_review_private.rate_review_versions TO service_role;

CREATE FUNCTION macrogoal_snapshot_review_private.guard_rate_review_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $guard$
DECLARE prior bigint;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'rate_review_append_only'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.owner_id) OR NOT EXISTS(SELECT 1 FROM public.goals WHERE id=OLD.goal_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'rate_review_append_revocation';
 END IF;
 -- Same first lock as acceptance: revocation/new version cannot race acceptance.
 PERFORM 1 FROM public.users WHERE id=NEW.owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'rate_review_owner_missing'; END IF;
 PERFORM 1 FROM public.goals WHERE id=NEW.goal_id AND user_id=NEW.owner_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'rate_review_goal_owner_mismatch'; END IF;
 SELECT max(review_version) INTO prior FROM macrogoal_snapshot_review_private.rate_review_versions WHERE owner_id=NEW.owner_id AND goal_id=NEW.goal_id;
 IF NEW.review_version<>coalesce(prior,0)+1 THEN RAISE EXCEPTION 'rate_review_version_conflict'; END IF;
 NEW.recorded_at:=clock_timestamp();
 IF NEW.verified_at>NEW.recorded_at THEN RAISE EXCEPTION 'rate_review_future_verification'; END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.guard_rate_review_version() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_rate_review_version BEFORE INSERT OR UPDATE OR DELETE ON macrogoal_snapshot_review_private.rate_review_versions FOR EACH ROW EXECUTE FUNCTION macrogoal_snapshot_review_private.guard_rate_review_version();

CREATE FUNCTION macrogoal_snapshot_review_private.read_rate_review(p_owner uuid,p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $read$
DECLARE r macrogoal_snapshot_review_private.rate_review_versions; at_time timestamptz:=statement_timestamp();
BEGIN
 IF p_owner IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_expected))<>13 THEN RETURN NULL; END IF;
 SELECT * INTO r FROM macrogoal_snapshot_review_private.rate_review_versions
 WHERE owner_id=p_owner AND goal_id=(p_expected->>'goalId')::uuid ORDER BY review_version DESC LIMIT 1;
 -- Latest revoked/expired/mismatched row blocks; never search for older eligible row.
 IF NOT FOUND OR r.decision<>'reviewed' OR r.expires_at<=at_time OR r.recorded_at>at_time OR
 r.source_captured_at>at_time OR r.source_captured_at<at_time-interval '30 seconds' THEN RETURN NULL; END IF;
 IF p_expected->>'ownerId' IS DISTINCT FROM r.owner_id::text OR
 (p_expected->>'goalRevision')::timestamptz IS DISTINCT FROM r.goal_revision OR
 (p_expected->>'profileUpdatedAt')::timestamptz IS DISTINCT FROM r.profile_updated_at OR
 p_expected->>'profileBinding' IS DISTINCT FROM r.profile_binding OR p_expected->>'journeyBinding' IS DISTINCT FROM r.journey_binding OR
 p_expected->>'policyVersion' IS DISTINCT FROM r.policy_version OR p_expected->>'policyDigest' IS DISTINCT FROM r.policy_digest OR
 p_expected->>'engineVersion' IS DISTINCT FROM r.engine_version OR p_expected->>'sourceFingerprint' IS DISTINCT FROM r.source_fingerprint OR
 (p_expected->>'sourceCapturedAt')::numeric IS DISTINCT FROM floor(extract(epoch FROM r.source_captured_at)*1000) OR
 p_expected->>'windowStart' IS DISTINCT FROM r.window_start::text OR p_expected->>'windowEndExclusive' IS DISTINCT FROM r.window_end_exclusive::text THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('version','rate-review-record-v1','actionable',false,'decision',r.decision,
 'reviewId',r.review_id,'reviewVersion',r.review_version,'binding',p_expected,'methodVersion',r.method_version,
 'interval',jsonb_build_object('lowerKgPerWeek',r.lower_kg_per_week,'upperKgPerWeek',r.upper_kg_per_week),
 'conversion',jsonb_build_object('model',r.conversion_model,'kcalPerKg',r.kcal_per_kg),
 'reviewedAt',r.reviewed_at,'expiresAt',r.expires_at,'recordedAt',r.recorded_at,'capturedAt',at_time,
 'provenance',jsonb_build_object('approvalRef',r.approval_ref,'approvalDigest',r.approval_digest,'approvalVersion',r.approval_version,'verifiedBy',r.verified_by,'verifiedAt',r.verified_at));
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN NULL;
END $read$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.read_rate_review(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_read_rate_review_v1(p_owner uuid,p_expected jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $wrapper$
 SELECT macrogoal_snapshot_review_private.read_rate_review(p_owner,p_expected);
$wrapper$;
REVOKE ALL ON FUNCTION public.tdee_read_rate_review_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_read_rate_review_v1(uuid,jsonb) TO service_role;
create schema tdee_scheduler_private;
revoke all on schema tdee_scheduler_private from public, anon, authenticated, service_role;
create table tdee_scheduler_private.ledger (
 owner_id uuid not null references auth.users(id) on delete cascade,
 context_revision text not null check(context_revision ~ '^[a-f0-9]{64}$'),
 revision bigint not null check(revision between 1 and 9007199254740990),
 record jsonb not null check(jsonb_typeof(record) = 'object'),
 hold jsonb,
 primary key(owner_id, context_revision),
 check ((record->>'ownerId') is not distinct from owner_id::text),
 check ((record->>'contextRevision') is not distinct from context_revision),
 check (jsonb_typeof(record->'revision') is not distinct from 'number'),
 check ((record->>'revision')::numeric is not distinct from revision::numeric),
 check ((record->>'version') is not distinct from 'daily-assessment-ledger-v1'),
 check ((record->>'status') is not null and record->>'status' in ('claimed','completed','uncertain','retryable')),
 check (jsonb_typeof(record->'claimedAt') is not distinct from 'number'),
 check ((record->>'claimedAt')::numeric=trunc((record->>'claimedAt')::numeric)),
 check ((record->>'claimedAt')::bigint between 0 and 253402214400000),
 check (record->>'claimId' is not null and (record->>'claimId')::uuid is not null),
 check (record->>'key' is not null and record->>'localDate' is not null and record->>'timezone' is not null),
 check (case when record->>'status'='claimed' then record->'finishedAt' is not distinct from 'null'::jsonb
 else jsonb_typeof(record->'finishedAt') is not distinct from 'number' and
 (record->>'finishedAt')::numeric=trunc((record->>'finishedAt')::numeric) and
 (record->>'finishedAt')::numeric<=253402214400000 and (record->>'finishedAt')::bigint >= (record->>'claimedAt')::bigint end),
 check (hold is null or (jsonb_typeof(hold)='object' and jsonb_typeof(hold->'assessedAt') is not distinct from 'number'
 and jsonb_typeof(hold->'reevaluateAt') is not distinct from 'number'
 and (hold->>'assessedAt')::numeric=trunc((hold->>'assessedAt')::numeric)
 and (hold->>'reevaluateAt')::numeric=trunc((hold->>'reevaluateAt')::numeric)
 and (hold->>'assessedAt')::bigint between 0 and 253401609600000
 and (hold->>'reevaluateAt')::bigint=(hold->>'assessedAt')::bigint+604800000))
);
create table tdee_scheduler_private.receipt (
 owner_id uuid not null,
 context_revision text not null,
 claim_id uuid not null,
 daily_key text not null,
 outcome text not null check(outcome in ('completed','not_executed')),
 observed_at bigint not null check(observed_at between 0 and 253402214400000),
 primary key(owner_id,context_revision,claim_id),
 foreign key(owner_id,context_revision) references tdee_scheduler_private.ledger on delete cascade
);
alter table tdee_scheduler_private.ledger enable row level security;
alter table tdee_scheduler_private.receipt enable row level security;
revoke all on all tables in schema tdee_scheduler_private from public, anon, authenticated, service_role;
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
COMMIT;
