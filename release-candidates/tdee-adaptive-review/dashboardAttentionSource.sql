-- Source-only dedicated read-only assessment source. Never creates anchor/proposal/receipt.
CREATE OR REPLACE FUNCTION tdee_rules14_private.read_attention_source(p_owner uuid, p_policy jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET lock_timeout TO '500ms'
 SET extra_float_digits TO '3'
AS $function$
DECLARE u public.users;pol tdee_rules14_private.policy_versions;choice macrogoal_snapshot_review_private.macro_choices;c jsonb;h jsonb;pe jsonb;ce jsonb;g jsonb;at_time timestamptz;binding jsonb;policy_name text;receipt_source jsonb;derived jsonb;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_owner FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p_owner AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())) THEN RETURN NULL;END IF;
 IF p_policy IS NULL OR p_policy='null'::jsonb THEN
 SELECT CASE WHEN count(*)=1 THEN min(version) ELSE NULL END INTO policy_name FROM(SELECT DISTINCT ON(version) version,decision,expires_at FROM tdee_rules14_private.policy_versions ORDER BY version,revision DESC)q WHERE decision='enabled' AND expires_at>clock_timestamp();
 ELSE policy_name:=p_policy->>'version';END IF;
 IF policy_name IS NULL THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rules14_policy:'||policy_name,0));
 SELECT * INTO pol FROM tdee_rules14_private.policy_versions WHERE version=policy_name ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND OR pol.document->>'engine_version' IS DISTINCT FROM 'rules14-observed-v2' OR pol.document->>'scope' IS DISTINCT FROM 'profile-adult-observed-v1' OR pol.decision<>'enabled' OR pol.expires_at<=clock_timestamp() OR (p_policy IS NOT NULL AND p_policy<>'null'::jsonb AND p_policy IS DISTINCT FROM jsonb_build_object('version',pol.version,'revision',pol.revision,'digest',pol.digest,'engineVersion','rules14-observed-v2')) THEN RETURN NULL;END IF;
 pe:=tdee_rules14_private.policy_envelope(pol);
 c:=tdee_rules14_private.read_observed_context_v1(p_owner);
 IF c->>'actor' IS DISTINCT FROM p_owner::text OR c#>>'{profile,id}' IS DISTINCT FROM p_owner::text THEN RETURN NULL;END IF;
 c:=jsonb_set(c,'{policy}',pe);
 at_time:=clock_timestamp();h:=tdee_rules14_private.history(p_owner,at_time);
 IF h IS NULL THEN
  -- No stored chain is fabricated. An immutable accepted manual/onboarding receipt
  -- may supply a read-only baseline, with a DISTINCT non-issuance authority.
  receipt_source:=tdee_rate_anchor_private.read_source(p_owner);
  IF receipt_source->'existingAnchor'='null'::jsonb THEN
   BEGIN
    derived:=tdee_rate_anchor_private.derive_initial(receipt_source,p_owner,at_time);
   EXCEPTION WHEN SQLSTATE '22023' OR invalid_datetime_format OR datetime_field_overflow THEN
    derived:=NULL;
   END;
  END IF;
  IF derived IS NULL THEN RETURN jsonb_build_object('version','rules14-attention-setup-v1','ownerId',p_owner,'snapshot',c,'reason','baseline_required','actionable',false);END IF;
  h:=jsonb_build_object('version','rules14-attention-history-v1','authority','server-accepted-goal-receipt-v1',
   'ownerId',p_owner,'capturedAt',floor(extract(epoch FROM at_time)*1000)::bigint,
   'anchorReference',jsonb_build_object('ownerId',p_owner,'version',0,'sourceRequestId',derived#>'{sourceReceipt,requestId}','sourceGoalId',derived->'initialGoalId'),
   'baselineAcceptedAt',derived->'acceptedAt','baselineIntakeKcal',derived->'baselineIntakeKcal',
   'acceptedCount',0,'acceptedDeltaKcal',0,'lastAcceptedAt',NULL,'lastReceiptDigest',NULL,
   'currentGoal',derived->'baselineGoalSnapshot','anchorSnapshot',derived);
 END IF;
 -- Every current source, including accepted_count>0, binds to the ORIGINAL
 -- immutable manual receipt material evidence. Legacy missing evidence holds.
 IF NOT tdee_rules14_private.anchor_material_current(h->'anchorSnapshot',u) THEN RETURN jsonb_build_object('version','rules14-attention-setup-v1','ownerId',p_owner,'snapshot',c,'reason','baseline_reconfirmation_required','actionable',false);END IF;
 g:=c->'currentGoal';IF h->'currentGoal' IS DISTINCT FROM g THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('version','rules14-source-v1','ownerId',p_owner,'snapshot',c,'policy',pe,'history',h,'choice',NULL);
END $function$

;
REVOKE ALL ON FUNCTION tdee_rules14_private.read_attention_source(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.tdee_internal_dashboard_attention_source_v1(p_owner uuid,p_policy jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 RETURN tdee_rules14_private.read_attention_source(p_owner,p_policy);
END $$;
REVOKE ALL ON FUNCTION public.tdee_internal_dashboard_attention_source_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_dashboard_attention_source_v1(uuid,jsonb) TO service_role;
