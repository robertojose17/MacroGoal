-- Private owner-locked source; new public service wrapper remains OFF.
CREATE FUNCTION tdee_rules14_private.history(p_owner uuid,at_time timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE raw jsonb;v jsonb;a jsonb;
BEGIN
 raw:=tdee_rules14_private.read_chain(p_owner);v:=tdee_rules14_private.verify_chain(raw,floor(extract(epoch FROM at_time)*1000)::bigint);
 IF v->>'kind' IS DISTINCT FROM 'rules14_chain_verified' THEN RETURN NULL;END IF;
 a:=raw#>'{anchorHead,anchor}';
 RETURN jsonb_build_object('version','rules14-history-v1','authority','server-rules14-chain-v1','ownerId',p_owner,'capturedAt',raw->'capturedAt','anchorReference',v->'anchorReference',
 'anchorSnapshot',a,'baselineAcceptedAt',a->'acceptedAt','baselineIntakeKcal',a->'baselineIntakeKcal','acceptedCount',v->'acceptedCount','acceptedDeltaKcal',v->'acceptedDeltaKcal',
 'lastAcceptedAt',v->'lastAcceptedAt','lastReceiptDigest',v->'lastReceiptDigest','currentGoal',v->'currentGoal');
END $$;
REVOKE ALL ON FUNCTION tdee_rules14_private.history(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.read_source(p_owner uuid,p_policy jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' SET extra_float_digits=3 AS $$
DECLARE u public.users;pol tdee_rules14_private.policy_versions;choice macrogoal_snapshot_review_private.macro_choices;c jsonb;h jsonb;pe jsonb;ce jsonb;g jsonb;at_time timestamptz;binding jsonb;policy_name text;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_owner FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p_owner AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())) THEN RETURN NULL;END IF;
 IF p_policy IS NULL OR p_policy='null'::jsonb THEN
 SELECT CASE WHEN count(*)=1 THEN min(version) ELSE NULL END INTO policy_name FROM(SELECT DISTINCT ON(version) version,decision,expires_at FROM tdee_rules14_private.policy_versions ORDER BY version,revision DESC)q WHERE decision='enabled' AND expires_at>clock_timestamp();
 ELSE policy_name:=p_policy->>'version';END IF;
 IF policy_name IS NULL THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rules14_policy:'||policy_name,0));
 SELECT * INTO pol FROM tdee_rules14_private.policy_versions WHERE version=policy_name ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND OR pol.decision<>'enabled' OR pol.expires_at<=clock_timestamp() OR (p_policy IS NOT NULL AND p_policy<>'null'::jsonb AND p_policy IS DISTINCT FROM jsonb_build_object('version',pol.version,'revision',pol.revision,'digest',pol.digest,'engineVersion','rules14-v1')) THEN RETURN NULL;END IF;
 pe:=tdee_rules14_private.policy_envelope(pol);
 c:=tdee_scheduler_private.read_context(p_owner);
 IF c->>'actor' IS DISTINCT FROM p_owner::text OR c#>>'{profile,id}' IS DISTINCT FROM p_owner::text THEN RETURN NULL;END IF;
 c:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(c,'{policy}',pe),'{profile,heightCm}',coalesce(to_jsonb(u.height),'null'::jsonb)),'{profile,heightUnit}','"cm"'::jsonb),'{rulesScreening}',tdee_rules14_private.read_screening(p_owner));
 at_time:=clock_timestamp();h:=tdee_rules14_private.history(p_owner,at_time);IF h IS NULL THEN RETURN NULL;END IF;
 -- Every current source, including accepted_count>0, binds to the ORIGINAL
 -- immutable manual receipt material evidence. Legacy missing evidence holds.
 IF NOT tdee_rules14_private.anchor_material_current(h->'anchorSnapshot',u) THEN RETURN jsonb_build_object('version','rules14-source-unavailable-v1','ownerId',p_owner,'reason','baseline_reconfirmation_required','actionable',false);END IF;
 g:=c->'currentGoal';IF h->'currentGoal' IS DISTINCT FROM g THEN RETURN NULL;END IF;
 SELECT * INTO choice FROM macrogoal_snapshot_review_private.macro_choices WHERE owner_id=p_owner AND goal_id=(g->>'id')::uuid ORDER BY choice_version DESC LIMIT 1 FOR SHARE;
 ce:=jsonb_build_object('version','macro-choice-state-v1','actionable',false,'ownerId',p_owner,'copyVersion','macro-choice-v1','bindingStatus','available',
 'goalId',g->'id','goalUpdatedAt',g->'updated_at','profileBinding',c#>'{readiness,profileBinding}','journeyBinding',c#>'{readiness,journeyBinding}',
 'capturedAt',at_time,'choiceVersion',coalesce(choice.choice_version,0),'choice',CASE WHEN choice.choice_version IS NULL THEN NULL ELSE jsonb_build_object(
 'mode',choice.mode,'copyVersion',choice.copy_version,'choiceVersion',choice.choice_version,'requestId',choice.request_id,'recordedAt',choice.recorded_at,
 'goalUpdatedAt',choice.goal_updated_at,'profileBinding',choice.profile_binding,'journeyBinding',choice.journey_binding,'splitBps',choice.split_bps,
 'current',coalesce(choice.mode IN ('smart','preserve_percent') AND choice.goal_updated_at=(g->>'updated_at')::timestamptz AND choice.profile_binding=c#>>'{readiness,profileBinding}' AND choice.journey_binding=c#>>'{readiness,journeyBinding}',false)) END);
 RETURN jsonb_build_object('version','rules14-source-v1','ownerId',p_owner,'snapshot',c,'policy',pe,'history',h,'choice',ce);
END $$;
REVOKE ALL ON FUNCTION tdee_rules14_private.read_source(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_internal_rules14_source_v1(p_owner uuid,p_policy jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rules14_off');END IF;
 RETURN tdee_rules14_private.read_source(p_owner,p_policy);
END $$;
REVOKE ALL ON FUNCTION public.tdee_internal_rules14_source_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_rules14_source_v1(uuid,jsonb) TO service_role;

