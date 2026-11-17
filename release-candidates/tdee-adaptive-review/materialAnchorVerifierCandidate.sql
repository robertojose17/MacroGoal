-- Pure helper requires complete new evidence. Legacy missing evidence holds safely.
CREATE OR REPLACE FUNCTION macrogoal_goal_write_private.material_evidence_current(r jsonb,m jsonb,actor uuid)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
 RETURN coalesce(r->'material_profile'=m
 AND m->>'contract'='accepted-goal-material-profile-v1' AND m->>'ownerId'=actor::text
 AND jsonb_typeof(m->'heightCm')='number' AND (m->>'heightCm')::numeric BETWEEN 100 AND 250
 AND m->>'sex' IN ('male','female') AND m->'onboardingCompleted'='true'::jsonb
 AND m->>'activityLevel' IN ('sedentary','light','moderate','active','very_active')
 AND m->>'dateOfBirth' ~ '^\d{4}-\d{2}-\d{2}$'
 AND tdee_rate_anchor_private.parse_instant(r->>'material_profile_updated_at') IS NOT NULL,false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $f$;
REVOKE ALL ON FUNCTION macrogoal_goal_write_private.material_evidence_current(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Pure original-receipt comparison for every accepted-count. The authenticated
-- wrapper selects this receipt by original request, never by newest goal/receipt.
CREATE OR REPLACE FUNCTION tdee_rules14_private.anchored_receipt_material_current(r jsonb,a jsonb,m jsonb,actor uuid)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
 RETURN coalesce(actor IS NOT NULL
 AND a->>'ownerId'=actor::text AND r->>'user_id'=actor::text
 AND r->'request_id'=a#>'{sourceReceipt,requestId}'
 AND r->'goal_id'=a->'initialGoalId' AND r->'goal_snapshot'=a->'baselineGoalSnapshot'
 AND r->'created_at'=a#>'{sourceReceipt,createdAt}'
 AND r#>'{payload,operation}'=a#>'{sourceReceipt,operation}'
 AND r->'profile_fingerprint'=a#>'{sourceReceipt,acceptedProfileFingerprint}'
 AND r->'material_profile_updated_at'=a#>'{sourceReceipt,acceptedProfileUpdatedAt}'
 AND macrogoal_goal_write_private.material_evidence_current(r,m,actor),false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $f$;
REVOKE ALL ON FUNCTION tdee_rules14_private.anchored_receipt_material_current(jsonb,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- All accepted-counts guard. Caller holds owner lock and verifies live head/chain.
CREATE OR REPLACE FUNCTION tdee_rules14_private.anchor_material_current(a jsonb,u public.users)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE r macrogoal_goal_write_private.receipts;
BEGIN
 IF a->>'ownerId' IS DISTINCT FROM u.id::text THEN RETURN false; END IF;
 SELECT * INTO r FROM macrogoal_goal_write_private.receipts WHERE user_id=u.id AND request_id=(a#>>'{sourceReceipt,requestId}')::uuid;
 IF NOT FOUND THEN RETURN false;END IF;
 RETURN tdee_rules14_private.anchored_receipt_material_current(to_jsonb(r),a,
  macrogoal_goal_write_private.material_profile_v1(u),u.id);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $f$;
REVOKE ALL ON FUNCTION tdee_rules14_private.anchor_material_current(jsonb,public.users) FROM PUBLIC,anon,authenticated,service_role;
