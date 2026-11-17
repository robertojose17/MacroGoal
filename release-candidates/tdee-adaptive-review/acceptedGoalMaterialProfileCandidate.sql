-- SOURCE ONLY. Incomplete release bundle; do not deploy alone.
-- Additive nullable columns intentionally leave every historical receipt untouched.
ALTER TABLE macrogoal_goal_write_private.receipts
 ADD COLUMN material_profile jsonb,
 ADD COLUMN material_profile_updated_at timestamptz,
 ADD CONSTRAINT receipt_material_profile_v1_shape CHECK (
  (material_profile IS NULL AND material_profile_updated_at IS NULL)
  OR (material_profile IS NOT NULL AND material_profile_updated_at IS NOT NULL
      AND isfinite(material_profile_updated_at)
      AND jsonb_typeof(material_profile) = 'object'
      AND material_profile->>'contract' IS NOT DISTINCT FROM 'accepted-goal-material-profile-v1'
      AND material_profile->>'ownerId' IS NOT DISTINCT FROM user_id::text));

CREATE OR REPLACE FUNCTION macrogoal_goal_write_private.material_profile_v1(u public.users)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp AS $fn$
 SELECT jsonb_build_object(
 'contract','accepted-goal-material-profile-v1',
 'ownerId',u.id,'dateOfBirth',u.date_of_birth,'sex',u.sex,
 'heightCm',CASE WHEN u.height IS NULL THEN NULL ELSE trim_scale(u.height::numeric) END,
 'onboardingCompleted',u.onboarding_completed,'activityLevel',u.activity_level,
 'journeyStartDate',u.journey_start_date,'journeyRestartCount',u.journey_restart_count,
 'timezone',u.timezone);
$fn$;
REVOKE ALL ON FUNCTION macrogoal_goal_write_private.material_profile_v1(public.users)
 FROM PUBLIC,anon,authenticated,service_role;
-- No snapshot/hash is supplied by a request. Existing owner-locked goal writer alone captures it.
-- current_weight and display preferred_units are not fixed baseline identity. Canonical height is cm.
