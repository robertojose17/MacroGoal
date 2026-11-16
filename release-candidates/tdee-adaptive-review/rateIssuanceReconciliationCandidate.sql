-- SOURCE ONLY: durable evidence of actual proposal insertion, not invented review.
CREATE TABLE tdee_rate_record_private.issuance_journal (
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 proposal_id uuid NOT NULL,proposal_digest text NOT NULL CHECK(proposal_digest~'^[a-f0-9]{64}$'),
 recorded_at_ms bigint NOT NULL,
 PRIMARY KEY(owner_id,proposal_id),
 FOREIGN KEY(owner_id,proposal_id) REFERENCES tdee_rate_record_private.proposals(owner_id,id) ON DELETE CASCADE
);
ALTER TABLE tdee_rate_record_private.issuance_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tdee_rate_record_private.issuance_journal FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rate_record_private.stamp_issuance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE p tdee_rate_record_private.proposals;
BEGIN
 NEW.recorded_at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 SELECT * INTO p FROM tdee_rate_record_private.proposals WHERE owner_id=NEW.owner_id AND id=NEW.proposal_id;
 IF NOT FOUND OR p.digest IS DISTINCT FROM NEW.proposal_digest OR p.expires_at_ms<=NEW.recorded_at_ms OR
 (p.record#>>'{payload,preparedAt}')::bigint>NEW.recorded_at_ms OR
 (p.record#>>'{payload,sourceCapturedAt}')::bigint>NEW.recorded_at_ms OR NEW.recorded_at_ms-(p.record#>>'{payload,sourceCapturedAt}')::bigint>30000 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='fresh_issued_proposal_required';END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.stamp_issuance() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER stamp_rate_issuance BEFORE INSERT ON tdee_rate_record_private.issuance_journal FOR EACH ROW EXECUTE FUNCTION tdee_rate_record_private.stamp_issuance();
CREATE TRIGGER immutable_rate_issuance BEFORE UPDATE OR DELETE ON tdee_rate_record_private.issuance_journal FOR EACH ROW EXECUTE FUNCTION tdee_rate_record_private.reject_mutation();
CREATE FUNCTION tdee_rate_record_private.read_issue_outcome(p_owner uuid,p_scope text,p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE l tdee_scheduler_private.ledger;p tdee_rate_record_private.proposals;j tdee_rate_record_private.issuance_journal;selection jsonb;c jsonb;at_ms bigint;
BEGIN
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 SELECT * INTO l FROM tdee_scheduler_private.ledger WHERE owner_id=p_owner AND context_revision=p_scope;
 IF NOT FOUND OR l.record->>'claimId' IS DISTINCT FROM p_claim::text OR l.record->>'status' NOT IN ('claimed','uncertain','completed') THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 selection:=tdee_scheduler_private.current_selection(p_owner);
 IF selection->>'contextRevision' IS DISTINCT FROM p_scope OR selection->>'timezone' IS DISTINCT FROM l.record->>'timezone' THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 SELECT * INTO p FROM tdee_rate_record_private.proposals WHERE owner_id=p_owner AND id=p_claim;
 SELECT * INTO j FROM tdee_rate_record_private.issuance_journal WHERE owner_id=p_owner AND proposal_id=p_claim;
 IF p.id IS NULL OR j.proposal_id IS NULL OR j.proposal_digest IS DISTINCT FROM p.digest OR
 j.recorded_at_ms<(l.record->>'claimedAt')::bigint OR j.recorded_at_ms>at_ms OR p.expires_at_ms<=j.recorded_at_ms OR
 p.record#>>'{payload,windowEndExclusive}' IS DISTINCT FROM l.record->>'localDate' THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 c:=tdee_scheduler_private.read_context(p_owner);
 IF c->'currentGoal' IS DISTINCT FROM p.record#>'{payload,goalSnapshot}' OR
 c#>>'{profile,updatedAt}' IS DISTINCT FROM p.record#>>'{payload,profileUpdatedAt}' OR
 c#>>'{observation,sourceFingerprint}' IS DISTINCT FROM p.record#>>'{payload,sourceFingerprint}' THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 RETURN jsonb_build_object('version','rate-issuance-outcome-v1','status','historically_prepared','ownerId',p_owner,'contextRevision',p_scope,
 'claimId',p_claim,'proposalId',p.id,'proposalDigest',p.digest,'recordedAt',j.recorded_at_ms,'observedAt',at_ms,
 'expired',p.expires_at_ms<=at_ms,'actionable',false);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.read_issue_outcome(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rate_record_private.reconcile_issued(p_owner uuid,p_scope text,p_claim uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' AS $fn$
DECLARE l tdee_scheduler_private.ledger;proof jsonb;at_ms bigint;prior tdee_scheduler_private.receipt;next_record jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 PERFORM 1 FROM public.users WHERE id=p_owner FOR UPDATE;
 SELECT * INTO l FROM tdee_scheduler_private.ledger WHERE owner_id=p_owner AND context_revision=p_scope FOR UPDATE;
 IF NOT FOUND OR l.revision IS DISTINCT FROM p_revision OR l.record->>'claimId' IS DISTINCT FROM p_claim::text THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 proof:=tdee_rate_record_private.read_issue_outcome(p_owner,p_scope,p_claim);
 IF proof->>'status' IS DISTINCT FROM 'historically_prepared' THEN RETURN proof;END IF;
 IF l.record->>'status'='completed' THEN RETURN jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',l.record,'hold',l.hold,'evidence',proof);END IF;
 IF l.record->>'status' NOT IN ('claimed','uncertain') THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF at_ms<greatest((l.record->>'claimedAt')::bigint,coalesce((l.record->>'finishedAt')::bigint,0)) THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 SELECT * INTO prior FROM tdee_scheduler_private.receipt WHERE owner_id=p_owner AND context_revision=p_scope AND claim_id=p_claim;
 IF FOUND THEN
  IF prior.outcome<>'completed' OR prior.daily_key IS DISTINCT FROM l.record->>'key' OR prior.observed_at>at_ms THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 ELSE
  INSERT INTO tdee_scheduler_private.receipt(owner_id,context_revision,claim_id,daily_key,outcome,observed_at)
  VALUES(p_owner,p_scope,p_claim,l.record->>'key','completed',at_ms);
 END IF;
 -- finishedAt is the actual recovery time, never the historical offer's preparedAt.
 next_record:=l.record||jsonb_build_object('status','completed','finishedAt',at_ms,'revision',l.revision+1);
 UPDATE tdee_scheduler_private.ledger SET revision=l.revision+1,record=next_record WHERE owner_id=p_owner AND context_revision=p_scope AND revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='claim_conflict';END IF;
 -- Preserve hold; historical preparation does not approve current recommendations.
 RETURN jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',next_record,'hold',l.hold,'evidence',proof);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.reconcile_issued(uuid,text,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_internal_rate_issue_outcome_v1(p_owner uuid,p_scope text,p_claim uuid,p_revision bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_issuance_off');END IF;
 IF p_revision IS NULL THEN RETURN tdee_rate_record_private.read_issue_outcome(p_owner,p_scope,p_claim);END IF;
 RETURN tdee_rate_record_private.reconcile_issued(p_owner,p_scope,p_claim,p_revision);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_internal_rate_issue_outcome_v1(uuid,text,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_rate_issue_outcome_v1(uuid,text,uuid,bigint) TO service_role;
