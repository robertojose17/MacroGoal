-- Definitions installed inactive by migration20261116124243; this review script stays ROLLBACK-only.
-- SOURCE ONLY, NOT INSTALLED. No review/policy seeds. No migration history.
-- Run only in separately authorized rollback verification. Existing schema required.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='3s';
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
ROLLBACK;
