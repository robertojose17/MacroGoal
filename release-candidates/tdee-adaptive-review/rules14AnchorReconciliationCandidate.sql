-- SOURCE ONLY. Reconcile verified desired baseline state, never attribute who wrote it.
-- Existing immutable anchor history is sufficient only with exact current claim scope.
CREATE FUNCTION tdee_rules14_private.read_anchor_outcome(p_owner uuid,p_scope text,p_claim uuid) RETURNS jsonb
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
 -- Historical accepted receipt remains exact; today's telemetry is not provenance.
 -- Current selection/proof fences and immutable head checks remain unchanged.
 IF NOT tdee_rules14_private.initial_anchor_receipt_current(s,h.anchor,p_owner,clock_timestamp()) THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 access:=tdee_scheduler_private.read_access(p_owner);at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF access->'allowed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(access->'validUntil') IS DISTINCT FROM 'number' OR (access->>'validUntil')::numeric<=at_ms OR
 tdee_scheduler_private.current_selection_as_of(p_owner,clock_timestamp())->>'contextRevision' IS DISTINCT FROM p_scope THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 RETURN jsonb_build_object('version','rules14-anchor-outcome-v1','status','current_baseline_verified','ownerId',p_owner,'contextRevision',p_scope,'claimId',p_claim,
 'anchorVersion',h.version,'sourceRequestId',h.source_request_id,'sourceGoalId',h.source_goal_id,'observedAt',at_ms,'actionable',false);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.read_anchor_outcome(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.reconcile_anchor(p_owner uuid,p_scope text,p_claim uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' AS $fn$
DECLARE l tdee_scheduler_private.ledger;proof jsonb;at_ms bigint;prior tdee_scheduler_private.receipt;next_record jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 PERFORM 1 FROM public.users WHERE id=p_owner FOR UPDATE;
 SELECT * INTO l FROM tdee_scheduler_private.ledger WHERE owner_id=p_owner AND context_revision=p_scope FOR UPDATE;
 IF NOT FOUND OR l.revision IS DISTINCT FROM p_revision OR l.record->>'claimId' IS DISTINCT FROM p_claim::text THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 proof:=tdee_rules14_private.read_anchor_outcome(p_owner,p_scope,p_claim);
 IF proof->>'status' IS DISTINCT FROM 'current_baseline_verified' THEN RETURN proof;END IF;
 IF l.record->>'status'='completed' THEN RETURN jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',l.record,'hold',l.hold,'evidence',proof);END IF;
 IF l.record->>'status' NOT IN ('claimed','uncertain') THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF at_ms<greatest((l.record->>'claimedAt')::bigint,coalesce((l.record->>'finishedAt')::bigint,0)) THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 SELECT * INTO prior FROM tdee_scheduler_private.receipt WHERE owner_id=p_owner AND context_revision=p_scope AND claim_id=p_claim;
 IF FOUND THEN
  IF prior.outcome<>'completed' OR prior.daily_key IS DISTINCT FROM l.record->>'key' OR prior.observed_at>at_ms THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 ELSE
  INSERT INTO tdee_scheduler_private.receipt(owner_id,context_revision,claim_id,daily_key,outcome,observed_at) VALUES(p_owner,p_scope,p_claim,l.record->>'key','completed',at_ms);
 END IF;
 next_record:=l.record||jsonb_build_object('status','completed','finishedAt',at_ms,'revision',l.revision+1);
 UPDATE tdee_scheduler_private.ledger SET revision=l.revision+1,record=next_record WHERE owner_id=p_owner AND context_revision=p_scope AND revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='claim_conflict';END IF;
 -- Baseline calibration never clears an existing uncertainty hold or approves an offer.
 RETURN jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',next_record,'hold',l.hold,'evidence',proof);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.reconcile_anchor(uuid,text,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_internal_rules14_anchor_outcome_v1(p_owner uuid,p_scope text,p_claim uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rules14_anchor_reconciliation_off');END IF;
 RETURN tdee_rules14_private.reconcile_anchor(p_owner,p_scope,p_claim,p_revision);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_internal_rules14_anchor_outcome_v1(uuid,text,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_rules14_anchor_outcome_v1(uuid,text,uuid,bigint) TO service_role;
