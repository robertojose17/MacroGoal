-- Existing immutable anchor provenance only. Caller separately verifies the live
-- head/chain and all current eligibility/source/nutrition/policy safeguards.
-- Never derives a new anchor from today's full profile or rewrites receipt hashes.
CREATE OR REPLACE FUNCTION tdee_rules14_private.initial_anchor_receipt_current(s jsonb,a jsonb,actor uuid,at_time timestamptz)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $provenance$
DECLARE r jsonb:=s->'receipt';u jsonb:=s->'currentProfile';captured timestamptz;
BEGIN
 captured:=tdee_rate_anchor_private.parse_instant(s->>'capturedAt');
 RETURN coalesce(
 actor IS NOT NULL AND at_time IS NOT NULL AND isfinite(at_time) AND captured IS NOT NULL AND isfinite(captured) AND captured<=at_time AND at_time-captured<=interval '30 seconds'
 AND s->>'version'='accepted-goal-rate-anchor-source-v1' AND s->>'ownerId'=actor::text AND s->'actionable'='false'::jsonb
 AND a->>'contract'='accepted-intake-rate-anchor-v1' AND a->>'ownerId'=actor::text
 AND s#>>'{existingAnchor,kind}'='rate_anchor_head' AND s#>'{existingAnchor,anchor}'=a
 AND s->'currentGoal'=a->'baselineGoalSnapshot' AND s#>>'{currentGoal,user_id}'=actor::text
 AND s#>'{currentGoal,is_active}'='true'::jsonb AND s#>'{currentGoal,id}'=a->'initialGoalId'
 AND s->'profileBinding'=a->'profileBinding' AND s->'journeyBinding'=a->'journeyBinding'
 AND u->>'id'=actor::text AND u->'onboarding_completed'='true'::jsonb
 AND u->'journey_start_date'=a->'journeyStartDate' AND u->'journey_restart_count'=a->'journeyRestartCount'
 AND r->>'user_id'=actor::text AND r->'goal_id'=a->'initialGoalId' AND r->'goal_snapshot'=a->'baselineGoalSnapshot'
 AND r->'request_id'=a#>'{sourceReceipt,requestId}' AND r#>'{payload,operation}'=a#>'{sourceReceipt,operation}'
 AND r#>>'{payload,operation}' IN ('initial_onboarding','manual_goal')
 AND r->'created_at'=a#>'{sourceReceipt,createdAt}'
 AND r->'profile_fingerprint'=a#>'{sourceReceipt,acceptedProfileFingerprint}'
 AND macrogoal_goal_write_private.material_evidence_current(r,s->'currentMaterialProfile',actor)
 AND r->'material_profile_updated_at'=a#>'{sourceReceipt,acceptedProfileUpdatedAt}'
 AND r->>'profile_fingerprint' ~ '^[a-f0-9]{64}$',false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $provenance$;
REVOKE ALL ON FUNCTION tdee_rules14_private.initial_anchor_receipt_current(jsonb,jsonb,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
