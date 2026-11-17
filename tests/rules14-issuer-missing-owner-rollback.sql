-- Read-only negative-path regression. No actor impersonation, fixtures, grants,
-- provider overrides or writes. Execute after candidate replacement, or include
-- this DO block in the candidate's explicit ROLLBACK compile transaction.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='5s';
DO $test$
DECLARE missing_owner uuid:=gen_random_uuid();proposal_uuid uuid:=gen_random_uuid();
 unsigned_record jsonb;record_content text;record_value jsonb;rejected boolean:=false;
BEGIN
 -- Do not test against any real profile, even on an unlikely UUID collision.
 IF EXISTS(SELECT 1 FROM public.users u WHERE u.id=missing_owner) THEN
  RAISE EXCEPTION 'test_random_owner_collision';
 END IF;
 unsigned_record:=jsonb_build_object('version','rules14-proposal-record-v1','id',proposal_uuid,'ownerId',missing_owner,
  'expiresAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+30000,'payload','{}'::jsonb);
 record_content:=unsigned_record::text;
 record_value:=unsigned_record||jsonb_build_object('canonicalContent',record_content,'digest',encode(sha256(convert_to(record_content,'UTF8')),'hex'));
 IF NOT tdee_rules14_private.valid_content(record_value,record_content,record_value->>'digest','digest') THEN
  RAISE EXCEPTION 'test_record_not_structurally_valid';
 END IF;
 BEGIN
  PERFORM tdee_rules14_private.issue_proposal(missing_owner,record_value);
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM IS DISTINCT FROM 'account_unavailable' THEN RAISE;END IF;
  rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'test_missing_owner_not_rejected';END IF;
 IF EXISTS(SELECT 1 FROM tdee_rules14_private.proposals p WHERE p.owner_id=missing_owner)
 OR EXISTS(SELECT 1 FROM tdee_rules14_private.issuance_journal j WHERE j.owner_id=missing_owner) THEN
  RAISE EXCEPTION 'test_unexpected_owner_write';
 END IF;
END $test$;
ROLLBACK;
