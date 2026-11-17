-- Shared coherent selector with explicit server readback time. No app grants or activation.
SET lock_timeout='500ms';
DO $fence$ BEGIN
 IF md5(pg_get_functiondef('tdee_scheduler_private.current_selection(uuid)'::regprocedure))<>'f1c80f2d45bc9db249de9a9f216c10a2' OR md5(pg_get_functiondef('tdee_rules14_private.read_anchor_outcome(uuid,text,uuid)'::regprocedure))<>'76183928b5670d7af9a246ff5a02c963' THEN RAISE EXCEPTION 'selection_asof_source_changed_review_required';END IF;
END $fence$;
CREATE FUNCTION tdee_scheduler_private.current_selection_as_of(p_owner uuid,p_as_of timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $rules_scope$
DECLARE u public.users;s macrogoal_observed_private.settings;g public.goals;pol tdee_rules14_private.policy_versions;screen tdee_rules14_private.screenings;
 account record;b jsonb;binding jsonb;rev text;n integer;t date;at_time timestamptz:=p_as_of;
BEGIN
 -- Private explicit real readback time; never permit future authority.
 IF p_as_of IS NULL OR p_as_of>clock_timestamp() THEN RETURN NULL;END IF;
 -- No registered rules policy preserves the old reviewed-engine selection exactly.
 -- A revoked/expired/ambiguous rules registration never silently downgrades.
 IF NOT EXISTS(SELECT 1 FROM tdee_rules14_private.policy_versions) THEN RETURN tdee_rules14_private.legacy_current_selection(p_owner);END IF;
 SELECT count(*) INTO n FROM (SELECT DISTINCT ON(version) version,decision,expires_at FROM tdee_rules14_private.policy_versions ORDER BY version,revision DESC)q WHERE decision='enabled' AND expires_at>at_time;
 IF n<>1 THEN RETURN NULL;END IF;
 SELECT * INTO pol FROM (SELECT DISTINCT ON(version) * FROM tdee_rules14_private.policy_versions ORDER BY version,revision DESC)q WHERE decision='enabled' AND expires_at>at_time;
 SELECT deleted_at,banned_until,is_anonymous INTO account FROM auth.users WHERE id=p_owner;
 IF NOT FOUND OR account.deleted_at IS NOT NULL OR account.is_anonymous IS DISTINCT FROM false OR (account.banned_until IS NOT NULL AND account.banned_until>at_time) THEN RETURN NULL;END IF;
 SELECT * INTO s FROM macrogoal_observed_private.settings WHERE user_id=p_owner AND enabled=true;IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO u FROM public.users WHERE id=p_owner;IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=u.timezone) THEN RETURN NULL;END IF;
 t:=(at_time AT TIME ZONE u.timezone)::date;
 IF u.date_of_birth IS NULL OR NOT isfinite(u.date_of_birth) OR u.date_of_birth>(t-interval '19 years')::date OR u.date_of_birth<=(t-interval '101 years')::date OR u.date_of_birth<=date '1900-01-01' THEN RETURN NULL;END IF;
 b:=tdee_rules14_private.screening_binding(p_owner);
 SELECT * INTO screen FROM tdee_rules14_private.screenings WHERE owner_id=p_owner ORDER BY row_version DESC LIMIT 1;
 IF NOT FOUND OR tdee_rules14_private.screening_envelope(screen,b,at_time)->'current' IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL;END IF;
 SELECT count(*) INTO n FROM(SELECT id FROM public.goals WHERE user_id=p_owner AND is_active=true LIMIT 2)q;IF n<>1 THEN RETURN NULL;END IF;
 SELECT * INTO g FROM public.goals WHERE user_id=p_owner AND is_active=true;
 binding:=jsonb_build_object('version',pol.version,'revision',pol.revision,'digest',pol.digest,'engineVersion','rules14-v1');
 rev:=encode(sha256(convert_to(jsonb_build_object('contract','internal-daily-rules14-selection-v1','owner',p_owner,'goal',to_jsonb(g),'profile',b,'settings',to_jsonb(s),'screening',to_jsonb(screen),'policyBinding',binding)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('ownerId',p_owner,'contextRevision',rev,'timezone',u.timezone,'localDate',t,'enrolled',true,'accountActive',true,'engineVersion','rules14-v1','policyBinding',binding);
END $rules_scope$;
REVOKE ALL ON FUNCTION tdee_scheduler_private.current_selection_as_of(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION tdee_scheduler_private.current_selection(p_owner uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $selection$
 SELECT tdee_scheduler_private.current_selection_as_of(p_owner,statement_timestamp())
$selection$;
CREATE OR REPLACE FUNCTION tdee_rules14_private.read_anchor_outcome(p_owner uuid,p_scope text,p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE l tdee_scheduler_private.ledger;h tdee_rate_anchor_private.anchors;selection jsonb;s jsonb;derived jsonb;access jsonb;at_time timestamptz;at_ms bigint;
BEGIN
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 SELECT * INTO l FROM tdee_scheduler_private.ledger WHERE owner_id=p_owner AND context_revision=p_scope;
 IF NOT FOUND OR l.record->>'claimId' IS DISTINCT FROM p_claim::text OR l.record->>'status' NOT IN ('claimed','uncertain','completed') THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 selection:=tdee_scheduler_private.current_selection_as_of(p_owner,clock_timestamp());
 IF selection->>'engineVersion' IS DISTINCT FROM 'rules14-v1' OR selection->>'contextRevision' IS DISTINCT FROM p_scope OR selection->>'timezone' IS DISTINCT FROM l.record->>'timezone' THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 -- Never relabel an uncertain offer as baseline calibration.
 IF EXISTS(SELECT 1 FROM tdee_rules14_private.proposals WHERE owner_id=p_owner AND id=p_claim) OR EXISTS(SELECT 1 FROM tdee_rules14_private.issuance_journal WHERE owner_id=p_owner AND proposal_id=p_claim) THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 SELECT * INTO h FROM tdee_rate_anchor_private.anchors WHERE owner_id=p_owner ORDER BY version DESC LIMIT 1;
 -- A pre-existing anchor cannot prove that this unfinished assessment reached bootstrap.
 IF NOT FOUND OR h.created_at<to_timestamp((l.record->>'claimedAt')::double precision/1000) OR h.created_at>at_time THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 s:=tdee_rate_anchor_private.read_source(p_owner);
 IF s->>'ownerId' IS DISTINCT FROM p_owner::text OR s->>'version' IS DISTINCT FROM 'accepted-goal-rate-anchor-source-v1' OR s->'actionable' IS DISTINCT FROM 'false'::jsonb OR s->'unavailable'='true'::jsonb OR
 s->'existingAnchor' IS DISTINCT FROM jsonb_build_object('kind','rate_anchor_head','ownerId',p_owner,'version',h.version,'sourceRequestId',h.source_request_id,'sourceGoalId',h.source_goal_id,'anchor',h.anchor) OR
 s#>>'{receipt,request_id}' IS DISTINCT FROM h.source_request_id::text OR s#>>'{currentGoal,id}' IS DISTINCT FROM h.source_goal_id::text THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 -- Pure derivation strips presence only, preserving the original accepted receipt,
 -- exact goal/profile/journey binding and current source. No reset or append occurs.
 derived:=tdee_rate_anchor_private.derive_initial(jsonb_set(s,'{existingAnchor}','null'::jsonb),p_owner,clock_timestamp());
 IF derived IS DISTINCT FROM h.anchor THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 access:=tdee_scheduler_private.read_access(p_owner);at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF access->'allowed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(access->'validUntil') IS DISTINCT FROM 'number' OR (access->>'validUntil')::numeric<=at_ms OR
 tdee_scheduler_private.current_selection_as_of(p_owner,clock_timestamp())->>'contextRevision' IS DISTINCT FROM p_scope THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 RETURN jsonb_build_object('version','rules14-anchor-outcome-v1','status','current_baseline_verified','ownerId',p_owner,'contextRevision',p_scope,'claimId',p_claim,
 'anchorVersion',h.version,'sourceRequestId',h.source_request_id,'sourceGoalId',h.source_goal_id,'observedAt',at_ms,'actionable',false);
END $fn$;
