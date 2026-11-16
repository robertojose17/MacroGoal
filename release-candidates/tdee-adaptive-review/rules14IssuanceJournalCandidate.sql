-- SOURCE ONLY: durable evidence of actual proposal insertion, not invented review.
CREATE TABLE tdee_rules14_private.issuance_journal (
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 proposal_id uuid NOT NULL,proposal_digest text NOT NULL CHECK(proposal_digest~'^[a-f0-9]{64}$'),
 recorded_at_ms bigint NOT NULL,
 PRIMARY KEY(owner_id,proposal_id),
 FOREIGN KEY(owner_id,proposal_id) REFERENCES tdee_rules14_private.proposals(owner_id,id) ON DELETE CASCADE
);
ALTER TABLE tdee_rules14_private.issuance_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tdee_rules14_private.issuance_journal FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.stamp_issuance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE p tdee_rules14_private.proposals;
BEGIN
 NEW.recorded_at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 SELECT * INTO p FROM tdee_rules14_private.proposals WHERE owner_id=NEW.owner_id AND id=NEW.proposal_id;
 IF NOT FOUND OR p.digest IS DISTINCT FROM NEW.proposal_digest OR p.expires_at_ms<=NEW.recorded_at_ms OR
 (p.record#>>'{payload,preparedAt}')::bigint>NEW.recorded_at_ms OR
 (p.record#>>'{payload,sourceCapturedAt}')::bigint>NEW.recorded_at_ms OR NEW.recorded_at_ms-(p.record#>>'{payload,sourceCapturedAt}')::bigint>30000 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='fresh_issued_proposal_required';END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.stamp_issuance() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER stamp_rate_issuance BEFORE INSERT ON tdee_rules14_private.issuance_journal FOR EACH ROW EXECUTE FUNCTION tdee_rules14_private.stamp_issuance();
CREATE TRIGGER immutable_rate_issuance BEFORE UPDATE OR DELETE ON tdee_rules14_private.issuance_journal FOR EACH ROW EXECUTE FUNCTION tdee_rules14_private.reject_mutation();
