-- DRAFT SOURCE ONLY. Separate deterministic-product-rule storage; no clinical/statistical review authority.
-- SOURCE ONLY: integrity storage + read envelope, not issuance or acceptance.
CREATE SCHEMA tdee_rules14_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA tdee_rules14_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.valid_content(record jsonb,content text,digest text,digest_key text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE keys text[];k text;n numeric;
BEGIN
 IF record IS NULL OR content IS NULL OR digest IS NULL OR digest_key IS NULL OR digest_key NOT IN ('digest','receiptDigest')
 OR jsonb_typeof(record)<>'object' OR octet_length(content)>65536 OR octet_length(record::text)>65536
 OR jsonb_typeof(record->'canonicalContent') IS DISTINCT FROM 'string'
 OR jsonb_typeof(record->digest_key) IS DISTINCT FROM 'string'
 OR digest !~ '^[a-f0-9]{64}$' OR record->>'canonicalContent' IS DISTINCT FROM content
 OR record->>digest_key IS DISTINCT FROM digest
 OR encode(sha256(convert_to(content,'UTF8')),'hex') IS DISTINCT FROM digest THEN RETURN false; END IF;
 IF digest_key='digest' AND (NOT record ?& ARRAY['version','id','ownerId','digest','canonicalContent','expiresAt','payload']
 OR (record-ARRAY['version','id','ownerId','digest','canonicalContent','expiresAt','payload'])<>'{}'::jsonb
 OR record->>'version' IS DISTINCT FROM 'rules14-proposal-record-v1' OR jsonb_typeof(record->'payload') IS DISTINCT FROM 'object') THEN RETURN false; END IF;
 IF digest_key='receiptDigest' THEN
 keys:=ARRAY['version','status','sequence','request','anchorReference','previousGoalSnapshot','acceptedGoalSnapshot','acceptedAt','deltaKcal','netDeltaKcal','previousReceiptDigest','receiptDigest','canonicalContent','acceptanceEvidence'];
 IF record ? 'canonicalEncoding' THEN
 IF record->>'canonicalEncoding' IS DISTINCT FROM 'pg-jsonb-v1' THEN RETURN false; END IF;
 keys:=keys||ARRAY['canonicalEncoding']; END IF;
 IF NOT record ?& keys OR (record-keys)<>'{}'::jsonb
 OR record->>'version' IS DISTINCT FROM 'rules14-acceptance-receipt-v1' OR record->>'status' IS DISTINCT FROM 'committed'
 OR NOT tdee_rules14_private.valid_request(record->'request')
 OR record->'anchorReference' IS DISTINCT FROM record#>'{request,anchorReference}' THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['previousGoalSnapshot','acceptedGoalSnapshot','acceptanceEvidence'] LOOP
 IF jsonb_typeof(record->k) IS DISTINCT FROM 'object' THEN RETURN false; END IF; END LOOP;
 FOREACH k IN ARRAY ARRAY['sequence','acceptedAt','deltaKcal','netDeltaKcal'] LOOP
 IF jsonb_typeof(record->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 n:=(record->>k)::numeric;IF n<>trunc(n) OR abs(n)>9007199254740991 THEN RETURN false; END IF; END LOOP;
 IF (record->>'sequence')::numeric NOT BETWEEN 1 AND 1000 OR (record->>'acceptedAt')::numeric<0
 OR NOT (record->'previousReceiptDigest'='null'::jsonb OR (jsonb_typeof(record->'previousReceiptDigest')='string' AND record->>'previousReceiptDigest' ~ '^[a-f0-9]{64}$')) THEN RETURN false; END IF;
 END IF;
 RETURN (content::jsonb)=(record-'canonicalContent'-digest_key);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.valid_content(jsonb,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.valid_request(q jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $q$
DECLARE k text;r jsonb;n numeric;
BEGIN
 IF q IS NULL OR jsonb_typeof(q)<>'object' OR octet_length(q::text)>2048
 OR NOT q ?& ARRAY['version','ownerId','requestId','rateProposalId','rateProposalDigest','anchorReference']
 OR (q-ARRAY['version','ownerId','requestId','rateProposalId','rateProposalDigest','anchorReference'])<>'{}'::jsonb
 OR q->>'version' IS DISTINCT FROM 'rules14-acceptance-request-v1'
 OR jsonb_typeof(q->'rateProposalDigest') IS DISTINCT FROM 'string' OR coalesce(q->>'rateProposalDigest','') !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['ownerId','requestId','rateProposalId'] LOOP
 IF jsonb_typeof(q->k) IS DISTINCT FROM 'string' OR q->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false; END IF;
 END LOOP;
 r:=q->'anchorReference';
 IF jsonb_typeof(r) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF NOT r ?& ARRAY['ownerId','version','sourceRequestId','sourceGoalId']
 OR (r-ARRAY['ownerId','version','sourceRequestId','sourceGoalId'])<>'{}'::jsonb
 OR r->'ownerId' IS DISTINCT FROM q->'ownerId' OR jsonb_typeof(r->'version') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 n:=(r->>'version')::numeric;
 IF n<>trunc(n) OR n NOT BETWEEN 1 AND 9007199254740991 THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['sourceRequestId','sourceGoalId'] LOOP
 IF jsonb_typeof(r->k) IS DISTINCT FROM 'string' OR r->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $q$;
REVOKE ALL ON FUNCTION tdee_rules14_private.valid_request(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Reuse the canonical anchor key; never recreate or silently weaken it.
DO $anchor_key$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid='tdee_rate_anchor_private.anchors'::regclass AND c.conname='rate_anchor_exact_reference_unique' AND c.contype='u' AND c.convalidated AND
 (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum)=ARRAY['owner_id','version','source_request_id','source_goal_id']) THEN RAISE EXCEPTION 'canonical_anchor_exact_reference_key_required';END IF;
END $anchor_key$;
CREATE TABLE tdee_rules14_private.proposals (
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 id uuid NOT NULL,anchor_version bigint NOT NULL,source_request_id uuid NOT NULL,source_goal_id uuid NOT NULL,
 digest text NOT NULL,canonical_content text NOT NULL,record jsonb NOT NULL,expires_at_ms bigint NOT NULL,
 PRIMARY KEY(owner_id,id),UNIQUE(owner_id,id,digest,anchor_version,source_request_id,source_goal_id),
 FOREIGN KEY(owner_id,anchor_version,source_request_id,source_goal_id) REFERENCES tdee_rate_anchor_private.anchors(owner_id,version,source_request_id,source_goal_id) ON DELETE CASCADE,
 CHECK(expires_at_ms BETWEEN 0 AND 8640000000000000),
 CHECK(tdee_rules14_private.valid_content(record,canonical_content,digest,'digest')),
 CHECK(record->>'version' IS NOT DISTINCT FROM 'rules14-proposal-record-v1'),
 CHECK(record->'ownerId' IS NOT DISTINCT FROM to_jsonb(owner_id::text) AND record->'id' IS NOT DISTINCT FROM to_jsonb(id::text)),
 CHECK(record->'expiresAt' IS NOT DISTINCT FROM to_jsonb(expires_at_ms)),
 CHECK(record#>'{payload,anchorReference}' IS NOT DISTINCT FROM jsonb_build_object('ownerId',owner_id,'version',anchor_version,'sourceRequestId',source_request_id,'sourceGoalId',source_goal_id)),
 CHECK((record#>>'{payload,contract}' IS NOT DISTINCT FROM 'explicit-rules14-acceptance-v1') OR
 (record#>>'{payload,contract}' IS NOT DISTINCT FROM 'explicit-rules14-acceptance-v2' AND
  record#>>'{payload,engineVersion}' IS NOT DISTINCT FROM 'rules14-observed-v2' AND
  jsonb_typeof(record#>'{payload,profileSupport}') IS NOT DISTINCT FROM 'object' AND
  NOT ((record->'payload') ? 'screeningEvidence'))),
 CHECK(record#>'{payload,actionable}' IS NOT DISTINCT FROM 'false'::jsonb AND record#>'{payload,requiresExplicitAcceptance}' IS NOT DISTINCT FROM 'true'::jsonb)
);
CREATE TABLE tdee_rules14_private.receipts (
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,proposal_id uuid NOT NULL,proposal_digest text NOT NULL,
 anchor_version bigint NOT NULL,source_request_id uuid NOT NULL,source_goal_id uuid NOT NULL,
 sequence int NOT NULL CHECK(sequence BETWEEN 1 AND 1000),prior_sequence int,
 previous_receipt_digest text,receipt_digest text NOT NULL,canonical_content text NOT NULL,record jsonb NOT NULL,
 previous_goal jsonb NOT NULL,accepted_goal jsonb NOT NULL,accepted_at_ms bigint NOT NULL,
 PRIMARY KEY(owner_id,request_id),UNIQUE(owner_id,proposal_id),UNIQUE(owner_id,anchor_version,sequence),
 UNIQUE(owner_id,anchor_version,sequence,receipt_digest),
 FOREIGN KEY(owner_id,anchor_version,source_request_id,source_goal_id) REFERENCES tdee_rate_anchor_private.anchors(owner_id,version,source_request_id,source_goal_id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,proposal_id,proposal_digest,anchor_version,source_request_id,source_goal_id) REFERENCES tdee_rules14_private.proposals(owner_id,id,digest,anchor_version,source_request_id,source_goal_id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,anchor_version,prior_sequence,previous_receipt_digest)
 REFERENCES tdee_rules14_private.receipts(owner_id,anchor_version,sequence,receipt_digest),
 CHECK((sequence=1 AND prior_sequence IS NULL AND previous_receipt_digest IS NULL) OR
 (sequence>1 AND prior_sequence IS NOT NULL AND prior_sequence=sequence-1 AND previous_receipt_digest IS NOT NULL)),
 CHECK(tdee_rules14_private.valid_content(record,canonical_content,receipt_digest,'receiptDigest')),
 CHECK(record->>'version' IS NOT DISTINCT FROM 'rules14-acceptance-receipt-v1' AND record->>'status' IS NOT DISTINCT FROM 'committed'),
 CHECK(record->'sequence' IS NOT DISTINCT FROM to_jsonb(sequence)),
 CHECK(record->'previousReceiptDigest' IS NOT DISTINCT FROM coalesce(to_jsonb(previous_receipt_digest),'null'::jsonb)),
 CHECK(record->'anchorReference' IS NOT DISTINCT FROM jsonb_build_object('ownerId',owner_id,'version',anchor_version,'sourceRequestId',source_request_id,'sourceGoalId',source_goal_id)),
 CHECK(record->'request' IS NOT DISTINCT FROM jsonb_build_object('version','rules14-acceptance-request-v1','ownerId',owner_id,'requestId',request_id,
 'rateProposalId',proposal_id,'rateProposalDigest',proposal_digest,'anchorReference',jsonb_build_object('ownerId',owner_id,'version',anchor_version,'sourceRequestId',source_request_id,'sourceGoalId',source_goal_id))),
 CHECK(jsonb_typeof(previous_goal)='object' AND jsonb_typeof(accepted_goal)='object'),
 CHECK(record->'previousGoalSnapshot' IS NOT DISTINCT FROM previous_goal AND record->'acceptedGoalSnapshot' IS NOT DISTINCT FROM accepted_goal),
 CHECK(previous_goal->>'user_id' IS NOT DISTINCT FROM owner_id::text AND accepted_goal->>'user_id' IS NOT DISTINCT FROM owner_id::text),
 CHECK(accepted_at_ms BETWEEN 0 AND 8640000000000000 AND record->'acceptedAt' IS NOT DISTINCT FROM to_jsonb(accepted_at_ms))
);
-- Exact idempotent request reservation/rejection log, separate from committed chain.
-- A future atomic writer must check this row before any effect. No writer exists here.
CREATE TABLE tdee_rules14_private.requests (
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 request jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(owner_id,request_id),
 CHECK(tdee_rules14_private.valid_request(request)),
 CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=65536),
 CHECK(result->>'version' IS NOT DISTINCT FROM 'rules14-acceptance-receipt-v1'),
 CHECK(coalesce(result->>'status','') IN ('rejected','committed')),
 CHECK(result->>'status'<>'rejected' OR (
 result ?& ARRAY['version','status','reason','request'] AND (result-ARRAY['version','status','reason','request'])='{}'::jsonb
 AND jsonb_typeof(result->'reason') IS NOT DISTINCT FROM 'string' AND length(result->>'reason') BETWEEN 1 AND 128)),
 CHECK(result->>'status'<>'committed' OR tdee_rules14_private.valid_content(result,result->>'canonicalContent',result->>'receiptDigest','receiptDigest')),
 CHECK(request->>'ownerId' IS NOT DISTINCT FROM owner_id::text AND request->>'requestId' IS NOT DISTINCT FROM request_id::text),
 CHECK(result->'request' IS NOT DISTINCT FROM request)
);
ALTER TABLE tdee_rules14_private.receipts ADD CONSTRAINT rate_receipt_request_fk
 FOREIGN KEY(owner_id,request_id) REFERENCES tdee_rules14_private.requests(owner_id,request_id) ON DELETE CASCADE;
ALTER TABLE tdee_rules14_private.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tdee_rules14_private.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tdee_rules14_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA tdee_rules14_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rules14_private.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.owner_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='rate_record_immutable';
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.reject_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_rate_proposal BEFORE UPDATE OR DELETE ON tdee_rules14_private.proposals FOR EACH ROW EXECUTE FUNCTION tdee_rules14_private.reject_mutation();
CREATE TRIGGER immutable_rate_receipt BEFORE UPDATE OR DELETE ON tdee_rules14_private.receipts FOR EACH ROW EXECUTE FUNCTION tdee_rules14_private.reject_mutation();
CREATE TRIGGER immutable_rate_request BEFORE UPDATE OR DELETE ON tdee_rules14_private.requests FOR EACH ROW EXECUTE FUNCTION tdee_rules14_private.reject_mutation();

CREATE FUNCTION tdee_rules14_private.read_chain(p_owner uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
 WITH profile AS MATERIALIZED (
 SELECT u.* FROM public.users u JOIN auth.users a ON a.id=u.id WHERE u.id=p_owner AND a.deleted_at IS NULL
 AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=statement_timestamp())
 ), head AS MATERIALIZED (
 SELECT a.* FROM tdee_rate_anchor_private.anchors a WHERE a.owner_id=p_owner ORDER BY version DESC LIMIT 1
 ), goals AS MATERIALIZED (
 SELECT g.* FROM public.goals g WHERE g.user_id=p_owner AND g.is_active=true ORDER BY g.id LIMIT 2
 ), receipt_rows AS MATERIALIZED (
 SELECT r.* FROM tdee_rules14_private.receipts r JOIN head h ON h.owner_id=r.owner_id AND h.version=r.anchor_version
 ORDER BY r.sequence LIMIT 1001
 ), bindings AS MATERIALIZED (
 SELECT u.*,encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'start',u.journey_start_date,
 'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex') AS jb FROM profile u
 ) SELECT coalesce((SELECT jsonb_build_object('version','rules14-chain-source-v1','ownerId',p_owner,
 'capturedAt',floor(extract(epoch FROM statement_timestamp())*1000)::bigint,
 'anchorHead',jsonb_build_object('kind','rate_anchor_head','ownerId',h.owner_id,'version',h.version,
 'sourceRequestId',h.source_request_id,'sourceGoalId',h.source_goal_id,'anchor',h.anchor),
 'currentGoal',(SELECT to_jsonb(g) FROM goals g ORDER BY g.id LIMIT 1),
 'currentProfileBinding',encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'dob',u.date_of_birth,'sex',u.sex,'journey',u.jb,'timezone',u.timezone)::text,'UTF8')),'hex'),
 'currentJourneyBinding',u.jb,'currentJourneyStartDate',u.journey_start_date,'currentJourneyRestartCount',u.journey_restart_count,
 'totalCount',(SELECT count(*) FROM receipt_rows),
 'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('receipt',r.record,'proposal',p.record) ORDER BY r.sequence)
 FROM receipt_rows r JOIN tdee_rules14_private.proposals p ON p.owner_id=r.owner_id AND p.id=r.proposal_id
 JOIN tdee_rules14_private.requests q ON q.owner_id=r.owner_id AND q.request_id=r.request_id
 AND q.request=r.record->'request' AND q.result=r.record),'[]'::jsonb))
 FROM bindings u CROSS JOIN head h WHERE (SELECT count(*) FROM goals)=1),
 jsonb_build_object('version','rules14-chain-source-v1','ownerId',p_owner,'unavailable',true));
$fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.read_chain(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_rules14_acceptance_chain_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_chain_off'); END IF;
 RETURN tdee_rules14_private.read_chain(actor);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_rules14_acceptance_chain_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_rules14_acceptance_chain_v1() TO authenticated;
-- No issuing, rejection, acceptance, request-reservation, or goal-write RPC exists.

CREATE FUNCTION tdee_rules14_private.read_exact_request(p_owner uuid,p_request_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE saved tdee_rules14_private.requests;
BEGIN
 IF p_owner IS NULL OR p_request_id IS NULL OR p_request IS NULL OR jsonb_typeof(p_request)<>'object'
 OR p_request->>'ownerId' IS DISTINCT FROM p_owner::text OR p_request->>'requestId' IS DISTINCT FROM p_request_id::text THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid'; END IF;
 SELECT * INTO saved FROM tdee_rules14_private.requests WHERE owner_id=p_owner AND request_id=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF saved.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_id_reused'; END IF;
 RETURN saved.result;
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.read_exact_request(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;


