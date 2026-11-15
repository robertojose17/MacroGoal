-- SOURCE-ONLY candidate: NOT INSTALLED, COMPILED OR EXECUTED.
-- No rows, policy defaults, clinical approvals or write APIs are created.
BEGIN;
CREATE TABLE macrogoal_snapshot_review_private.nutrition_review_versions(
 review_id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
 review_version bigint NOT NULL CHECK(review_version BETWEEN 1 AND 9007199254740991),
 decision text NOT NULL CHECK(decision IN ('eligible','restricted','unknown','revoked')),
 goal_revision timestamptz NOT NULL CHECK(isfinite(goal_revision)),
 preset text NOT NULL CHECK(preset IN ('balanced','high_protein','low_carb','lean_body','custom')),
 profile_updated_at timestamptz NOT NULL CHECK(isfinite(profile_updated_at)),
 profile_binding text NOT NULL CHECK(profile_binding ~ '^[a-f0-9]{64}$'),
 journey_binding text NOT NULL CHECK(journey_binding ~ '^[a-f0-9]{64}$'),
 policy_version text NOT NULL CHECK(length(btrim(policy_version)) BETWEEN 1 AND 200),
 policy_digest text NOT NULL CHECK(policy_digest ~ '^[a-f0-9]{64}$'),
 engine_version text NOT NULL CHECK(length(btrim(engine_version)) BETWEEN 1 AND 200),
 current_calories integer NOT NULL CHECK(current_calories BETWEEN 1 AND 10000),
 current_protein_g integer NOT NULL CHECK(current_protein_g BETWEEN 0 AND 10000),
 current_carbs_g integer NOT NULL CHECK(current_carbs_g BETWEEN 0 AND 10000),
 current_fats_g integer NOT NULL CHECK(current_fats_g BETWEEN 0 AND 10000),
 current_fiber_g integer NOT NULL CHECK(current_fiber_g BETWEEN 0 AND 10000),
 protein_min_g numeric CHECK(protein_min_g BETWEEN 0 AND 10000),
 protein_max_g numeric CHECK(protein_max_g BETWEEN 0 AND 10000),
 carbs_min_g numeric CHECK(carbs_min_g BETWEEN 0 AND 10000),
 carbs_max_g numeric CHECK(carbs_max_g BETWEEN 0 AND 10000),
 fats_min_g numeric CHECK(fats_min_g BETWEEN 0 AND 10000),
 fats_max_g numeric CHECK(fats_max_g BETWEEN 0 AND 10000),
 fat_min_fraction numeric CHECK(fat_min_fraction BETWEEN 0 AND 1),
 fat_max_fraction numeric CHECK(fat_max_fraction BETWEEN 0 AND 1),
 reviewed_at timestamptz NOT NULL CHECK(isfinite(reviewed_at)),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at) AND expires_at>reviewed_at),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 1 AND 1000),
 approval_digest text NOT NULL CHECK(approval_digest ~ '^[a-f0-9]{64}$'),
 approval_version text NOT NULL CHECK(length(btrim(approval_version)) BETWEEN 1 AND 200),
 verified_by text NOT NULL CHECK(length(btrim(verified_by)) BETWEEN 1 AND 200),
 verified_at timestamptz NOT NULL CHECK(isfinite(verified_at)),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(recorded_at)),
 UNIQUE(owner_id,goal_id,review_version),
 CHECK(goal_revision<=recorded_at AND profile_updated_at<=recorded_at AND reviewed_at<=recorded_at AND verified_at<=recorded_at AND reviewed_at<=verified_at),
 CHECK(protein_min_g<=protein_max_g AND carbs_min_g<=carbs_max_g AND fats_min_g<=fats_max_g AND fat_min_fraction<=fat_max_fraction),
 CHECK(decision<>'eligible' OR (
  protein_min_g IS NOT NULL AND protein_max_g IS NOT NULL AND carbs_min_g IS NOT NULL AND carbs_max_g IS NOT NULL AND
  fats_min_g IS NOT NULL AND fats_max_g IS NOT NULL AND fat_min_fraction IS NOT NULL AND fat_max_fraction IS NOT NULL))
);
ALTER TABLE macrogoal_snapshot_review_private.nutrition_review_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE macrogoal_snapshot_review_private.nutrition_review_versions FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE macrogoal_snapshot_review_private.nutrition_review_versions IS
 'Administrative append-only contract. No runtime writes. Provenance fields record an externally verified approval act; they do not verify qualifications or clinical validity. Latest version suppresses earlier decisions.';

-- SECURITY DEFINER is narrowly required to read an unexposed table without private
-- schema/table grants. No dynamic SQL, no public owner-controlled client route.
CREATE FUNCTION public.tdee_read_nutrition_review_v1(p_owner uuid,p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE r macrogoal_snapshot_review_private.nutrition_review_versions;
 g public.goals; u public.users; expected_binding jsonb; goal uuid; n timestamptz:=clock_timestamp();
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_required'; END IF;
 IF p_owner IS NULL OR p_expected IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR
 octet_length(p_expected::text)>8192 THEN RETURN NULL; END IF;
 IF NOT p_expected ?& ARRAY['goalId','goalRevision','preset','current','profileUpdatedAt','profileBinding','journeyBinding','policyVersion','policyDigest','engineVersion'] OR
 (SELECT count(*) FROM jsonb_object_keys(p_expected))<>10 OR jsonb_typeof(p_expected->'goalId') IS DISTINCT FROM 'string' OR
 p_expected->>'goalId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN NULL; END IF;
 goal:=(p_expected->>'goalId')::uuid;
 SELECT * INTO g FROM public.goals WHERE id=goal AND user_id=p_owner;
 IF NOT FOUND OR g.is_active IS DISTINCT FROM true THEN RETURN NULL; END IF;
 SELECT * INTO u FROM public.users WHERE id=p_owner;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Select latest first, including revoked, restricted, unknown and expired.
 -- A newer non-applicable row must suppress every older approval.
 SELECT * INTO r FROM macrogoal_snapshot_review_private.nutrition_review_versions
 WHERE owner_id=p_owner AND goal_id=goal ORDER BY review_version DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.decision<>'eligible' OR r.reviewed_at>n OR r.verified_at>n OR r.recorded_at>n OR r.expires_at<=n THEN RETURN NULL; END IF;
 IF r.goal_revision IS DISTINCT FROM g.updated_at OR r.profile_updated_at IS DISTINCT FROM u.updated_at OR
 r.preset IS DISTINCT FROM g.macro_preset OR r.current_calories IS DISTINCT FROM g.daily_calories OR
 r.current_protein_g IS DISTINCT FROM g.protein_g OR r.current_carbs_g IS DISTINCT FROM g.carbs_g OR
 r.current_fats_g IS DISTINCT FROM g.fats_g OR r.current_fiber_g IS DISTINCT FROM g.fiber_g THEN RETURN NULL; END IF;
 expected_binding:=jsonb_build_object('goalId',r.goal_id,'goalRevision',r.goal_revision,'preset',r.preset,
 'current',jsonb_build_object('calories',r.current_calories,'proteinG',r.current_protein_g,'carbsG',r.current_carbs_g,'fatsG',r.current_fats_g,'fiberG',r.current_fiber_g),
 'profileUpdatedAt',r.profile_updated_at,'profileBinding',r.profile_binding,'journeyBinding',r.journey_binding,
 'policyVersion',r.policy_version,'policyDigest',r.policy_digest,'engineVersion',r.engine_version);
 -- Exact canonical JSON comparison also rejects wrong keys/types and partial current targets.
 -- Profile/journey hashes come from the already validated own-actor snapshot, not request UI.
 IF p_expected IS DISTINCT FROM expected_binding THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('version','nutrition-review-record-v1','ownerId',p_owner,
 'reviewId',r.review_id,'reviewVersion',r.review_version,'binding',expected_binding,'decision','eligible',
 'limits',jsonb_build_object('proteinMinG',r.protein_min_g,'proteinMaxG',r.protein_max_g,
  'carbsMinG',r.carbs_min_g,'carbsMaxG',r.carbs_max_g,'fatsMinG',r.fats_min_g,'fatsMaxG',r.fats_max_g,
  'fatMinFraction',r.fat_min_fraction,'fatMaxFraction',r.fat_max_fraction),
 'reviewedAt',r.reviewed_at,'expiresAt',r.expires_at,
 'provenance',jsonb_build_object('approvalRef',r.approval_reference,'approvalSha256',r.approval_digest,
  'approvalVersion',r.approval_version,'verifiedBy',r.verified_by,'verifiedAt',r.verified_at),
 'capturedAt',n,'actionable',false);
END $f$;
REVOKE ALL ON FUNCTION public.tdee_read_nutrition_review_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_read_nutrition_review_v1(uuid,jsonb) TO service_role;
ROLLBACK;
