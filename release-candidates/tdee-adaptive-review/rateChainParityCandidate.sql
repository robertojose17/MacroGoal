-- SOURCE ONLY. Pure JSON consistency is NOT authentic provenance or acceptance authorization.
CREATE SCHEMA tdee_rate_chain_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA tdee_rate_chain_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rate_chain_private.integer(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='number' AND (v::text)::numeric=trunc((v::text)::numeric) AND abs((v::text)::numeric)<=9007199254740991,false)
$$;
CREATE FUNCTION tdee_rate_chain_private.uuid(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND v#>>'{}' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[0-9a-f]{12}$',false)
$$;
CREATE FUNCTION tdee_rate_chain_private.hash(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[a-f0-9]{64}$',false)
$$;
-- Conservative ECMAScript canonical serializer. Reject non-ASCII object keys and
-- exponent/unsafe numeric representations rather than silently hashing another format.
CREATE FUNCTION tdee_rate_chain_private.canonical(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp SET extra_float_digits=3 AS $$
DECLARE kind text:=jsonb_typeof(v); result text; n double precision; part text;
BEGIN
 IF kind IN ('null','boolean','string') THEN RETURN v::text; END IF;
 IF kind='number' THEN
  n:=(v::text)::double precision; part:=n::text;
  IF part ~ '[eE]' OR to_jsonb(n) IS DISTINCT FROM v OR abs(n)>=1e21 THEN RAISE EXCEPTION 'unsupported_canonical_number'; END IF;
  IF n=0 THEN RETURN '0'; END IF; RETURN part;
 END IF;
 IF kind='array' THEN SELECT '['||coalesce(string_agg(tdee_rate_chain_private.canonical(value),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY x(value,ord); RETURN result; END IF;
 IF kind='object' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE k !~ '^[ -~]*$') THEN RAISE EXCEPTION 'unsupported_canonical_key'; END IF;
  SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||tdee_rate_chain_private.canonical(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v); RETURN result;
 END IF;
 RAISE EXCEPTION 'non_json_value';
END $$;
CREATE FUNCTION tdee_rate_chain_private.instant(v jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE s text:=v#>>'{}'; d date; m text[]; offset_seconds int:=0;
BEGIN
 IF jsonb_typeof(v)<>'string' THEN RETURN NULL; END IF;
 m:=regexp_match(s,'^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(\.\d{1,6})?(Z|[+-]\d\d:\d\d)$');
 IF m IS NULL OR m[2]::int>23 OR m[3]::int>59 OR m[4]::int>59 THEN RETURN NULL; END IF;
 d:=m[1]::date; IF to_char(d,'YYYY-MM-DD')<>m[1] THEN RETURN NULL; END IF;
 IF m[6]<>'Z' THEN
  IF substring(m[6],2,2)::int>23 OR substring(m[6],5,2)::int>59 THEN RETURN NULL; END IF;
  offset_seconds:=(substring(m[6],2,2)::int*3600+substring(m[6],5,2)::int*60)*CASE WHEN left(m[6],1)='-' THEN -1 ELSE 1 END;
 END IF;
 RETURN (extract(epoch FROM d::timestamp)+m[2]::int*3600+m[3]::int*60+m[4]::int-offset_seconds)*1000+trunc(coalesce(m[5],'0')::numeric*1000);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE FUNCTION tdee_rate_chain_private.content_valid(r jsonb,digest_key text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE c text:=r->>'canonicalContent';
BEGIN
 RETURN coalesce(jsonb_typeof(r)='object' AND octet_length(c)<=65536 AND tdee_rate_chain_private.hash(r->digest_key)
 AND CASE WHEN digest_key='receiptDigest' AND r->>'canonicalEncoding'='pg-jsonb-v1' THEN c::jsonb=(r-'canonicalContent'-digest_key) ELSE NOT(r ? 'canonicalEncoding') AND c=tdee_rate_chain_private.canonical(r-'canonicalContent'-digest_key) END
 AND encode(sha256(convert_to(c,'UTF8')),'hex')=r->>digest_key,false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION tdee_rate_chain_private.verify_chain(v jsonb,now_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp SET extra_float_digits=3 AS $$
DECLARE owner_id text; h jsonb; a jsonb; ref jsonb; prior jsonb; net bigint:=0; last_at bigint; last_digest jsonb:='null';
 row_value jsonb;r jsonb;q jsonb;p jsonb;payload jsonb;g jsonb;old_goal jsonb;policy jsonb;review jsonb;e jsonb;target jsonb;
 idx int:=0; req_ids jsonb:='[]';proposal_ids jsonb:='[]';goal_ids jsonb;field text; goal_key text;target_key text;
 mutable text[]:=ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories'];
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR v->>'version' IS DISTINCT FROM 'rate-acceptance-chain-source-v1' OR NOT tdee_rate_chain_private.uuid(v->'ownerId') OR now_ms IS NULL OR now_ms<0 OR now_ms>9007199254740991
 OR NOT tdee_rate_chain_private.integer(v->'capturedAt') OR (v->>'capturedAt')::bigint>now_ms OR now_ms-(v->>'capturedAt')::bigint>30000
 OR jsonb_typeof(v->'anchorHead') IS DISTINCT FROM 'object' OR jsonb_typeof(v->'rows') IS DISTINCT FROM 'array'
 OR NOT tdee_rate_chain_private.integer(v->'totalCount') OR (v->>'totalCount')::int NOT BETWEEN 0 AND 1000
 OR jsonb_array_length(v->'rows')<>(v->>'totalCount')::int OR jsonb_typeof(v->'currentGoal') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_source'; END IF;
 owner_id:=v->>'ownerId';h:=v->'anchorHead';a:=h->'anchor';
 IF h->>'kind' IS DISTINCT FROM 'rate_anchor_head' OR h->>'ownerId' IS DISTINCT FROM owner_id OR NOT tdee_rate_chain_private.integer(h->'version') OR (h->>'version')::bigint<1
 OR NOT tdee_rate_chain_private.uuid(h->'sourceRequestId') OR NOT tdee_rate_chain_private.uuid(h->'sourceGoalId') OR jsonb_typeof(a) IS DISTINCT FROM 'object'
 OR a->>'contract' IS DISTINCT FROM 'accepted-intake-rate-anchor-v1' OR a->>'ownerId' IS DISTINCT FROM owner_id OR a->'initialGoalId' IS DISTINCT FROM h->'sourceGoalId'
 OR jsonb_typeof(a->'sourceReceipt') IS DISTINCT FROM 'object' OR a#>'{sourceReceipt,requestId}' IS DISTINCT FROM h->'sourceRequestId'
 OR coalesce(a#>>'{sourceReceipt,operation}','') NOT IN ('initial_onboarding','manual_goal') OR jsonb_typeof(a->'baselineGoalSnapshot') IS DISTINCT FROM 'object'
 OR a#>'{baselineGoalSnapshot,id}' IS DISTINCT FROM h->'sourceGoalId' OR a#>>'{baselineGoalSnapshot,user_id}' IS DISTINCT FROM owner_id OR a#>'{baselineGoalSnapshot,is_active}' IS DISTINCT FROM 'true'::jsonb
 OR NOT tdee_rate_chain_private.integer(a->'acceptedAt') OR (a->>'acceptedAt')::bigint NOT BETWEEN 0 AND now_ms
 OR (a->>'acceptedAt')::bigint IS DISTINCT FROM tdee_rate_chain_private.instant(a->'initialGoalRevision') OR a->'initialGoalRevision' IS DISTINCT FROM a#>'{baselineGoalSnapshot,updated_at}'
 OR tdee_rate_chain_private.instant(a#>'{baselineGoalSnapshot,created_at}') IS DISTINCT FROM (a->>'acceptedAt')::bigint
 OR NOT tdee_rate_chain_private.integer(a->'baselineIntakeKcal') OR (a->>'baselineIntakeKcal')::bigint<=0 OR a->'baselineIntakeKcal' IS DISTINCT FROM a#>'{baselineGoalSnapshot,daily_calories}'
 OR a->'acceptedCount' IS DISTINCT FROM '0'::jsonb OR a->'acceptedDeltaKcal' IS DISTINCT FROM '0'::jsonb OR a->'lastAcceptedAt' IS DISTINCT FROM 'null'::jsonb
 OR a->'earliestReviewAt' IS DISTINCT FROM to_jsonb((a->>'acceptedAt')::bigint+14*86400000::bigint)
 OR NOT tdee_rate_chain_private.hash(a->'profileBinding') OR NOT tdee_rate_chain_private.hash(a->'journeyBinding')
 OR v->'currentProfileBinding' IS DISTINCT FROM a->'profileBinding' OR v->'currentJourneyBinding' IS DISTINCT FROM a->'journeyBinding'
 OR v->'currentJourneyStartDate' IS DISTINCT FROM a->'journeyStartDate' OR v->'currentJourneyRestartCount' IS DISTINCT FROM a->'journeyRestartCount' THEN RAISE EXCEPTION 'invalid_anchor'; END IF;
 ref:=jsonb_build_object('ownerId',owner_id,'version',h->'version','sourceRequestId',h->'sourceRequestId','sourceGoalId',h->'sourceGoalId');
 prior:=a->'baselineGoalSnapshot';last_at:=(a->>'acceptedAt')::bigint;goal_ids:=jsonb_build_array(prior->'id');
 FOR row_value IN SELECT value FROM jsonb_array_elements(v->'rows') LOOP
  idx:=idx+1;r:=row_value->'receipt';p:=row_value->'proposal';q:=r->'request';
  IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR jsonb_typeof(p) IS DISTINCT FROM 'object'
  OR (SELECT string_agg(key,',' ORDER BY key) FROM jsonb_object_keys(r-CASE WHEN r->>'canonicalEncoding'='pg-jsonb-v1' THEN 'canonicalEncoding' ELSE '_unused' END) key) IS DISTINCT FROM 'acceptanceEvidence,acceptedAt,acceptedGoalSnapshot,anchorReference,canonicalContent,deltaKcal,netDeltaKcal,previousGoalSnapshot,previousReceiptDigest,receiptDigest,request,sequence,status,version'
  OR r->>'version' IS DISTINCT FROM 'rate-acceptance-receipt-v1' OR r->>'status' IS DISTINCT FROM 'committed' OR r->'sequence' IS DISTINCT FROM to_jsonb(idx)
  OR NOT tdee_rate_chain_private.integer(r->'acceptedAt') OR (r->>'acceptedAt')::bigint<=last_at OR (r->>'acceptedAt')::bigint>(v->>'capturedAt')::bigint
  OR r->'previousReceiptDigest' IS DISTINCT FROM last_digest OR NOT tdee_rate_chain_private.hash(r->'receiptDigest') OR r->'anchorReference' IS DISTINCT FROM ref
  OR jsonb_typeof(q) IS DISTINCT FROM 'object' OR (SELECT string_agg(key,',' ORDER BY key) FROM jsonb_object_keys(q) key) IS DISTINCT FROM 'anchorReference,ownerId,rateProposalDigest,rateProposalId,requestId,version'
  OR q->>'version' IS DISTINCT FROM 'rate-acceptance-request-v1' OR q->>'ownerId' IS DISTINCT FROM owner_id OR NOT tdee_rate_chain_private.uuid(q->'requestId') OR NOT tdee_rate_chain_private.uuid(q->'rateProposalId')
  OR NOT tdee_rate_chain_private.hash(q->'rateProposalDigest') OR q->'anchorReference' IS DISTINCT FROM ref OR req_ids @> jsonb_build_array(q->'requestId') OR proposal_ids @> jsonb_build_array(q->'rateProposalId')
  OR NOT tdee_rate_chain_private.content_valid(r,'receiptDigest') THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
  IF octet_length(tdee_rate_chain_private.canonical(p))>65536 OR (SELECT string_agg(key,',' ORDER BY key) FROM jsonb_object_keys(p) key) IS DISTINCT FROM 'canonicalContent,digest,expiresAt,id,ownerId,payload,version'
  OR p->>'version' IS DISTINCT FROM 'rate-proposal-record-v1' OR p->>'ownerId' IS DISTINCT FROM owner_id OR p->'id' IS DISTINCT FROM q->'rateProposalId' OR p->'digest' IS DISTINCT FROM q->'rateProposalDigest'
  OR NOT tdee_rate_chain_private.integer(p->'expiresAt') OR (p->>'expiresAt')::bigint<=(r->>'acceptedAt')::bigint
  OR jsonb_typeof(p->'payload') IS DISTINCT FROM 'object' OR p#>>'{payload,contract}' IS DISTINCT FROM 'explicit-rate-acceptance-v1'
  OR p#>'{payload,actionable}' IS DISTINCT FROM 'false'::jsonb OR p#>'{payload,requiresExplicitAcceptance}' IS DISTINCT FROM 'true'::jsonb OR NOT tdee_rate_chain_private.content_valid(p,'digest') THEN RAISE EXCEPTION 'invalid_proposal'; END IF;
  payload:=p->'payload';g:=r->'acceptedGoalSnapshot';old_goal:=r->'previousGoalSnapshot';policy:=payload->'policySnapshot';review:=payload->'reviewedRate';e:=r->'acceptanceEvidence';
  IF payload->'anchorReference' IS DISTINCT FROM ref OR payload->'anchorSnapshot' IS DISTINCT FROM a OR old_goal IS DISTINCT FROM prior OR payload->'goalSnapshot' IS DISTINCT FROM prior
  OR jsonb_typeof(g) IS DISTINCT FROM 'object' OR g->>'user_id' IS DISTINCT FROM owner_id OR g->'is_active' IS DISTINCT FROM 'true'::jsonb OR NOT tdee_rate_chain_private.uuid(g->'id') OR goal_ids @> jsonb_build_array(g->'id')
  OR jsonb_typeof(policy) IS DISTINCT FROM 'object' OR jsonb_typeof(review) IS DISTINCT FROM 'object' OR jsonb_typeof(e) IS DISTINCT FROM 'object' OR NOT tdee_rate_chain_private.hash(policy->'digest') OR NOT tdee_rate_chain_private.uuid(review->'reviewId')
  OR NOT tdee_rate_chain_private.integer(review->'reviewVersion') OR (review->>'reviewVersion')::bigint<1 OR payload->'profileBinding' IS DISTINCT FROM a->'profileBinding' OR payload->'journeyBinding' IS DISTINCT FROM a->'journeyBinding'
  OR NOT tdee_rate_chain_private.integer(payload->'preparedAt') OR (payload->>'preparedAt')::bigint>(r->>'acceptedAt')::bigint OR NOT tdee_rate_chain_private.integer(payload->'sourceCapturedAt')
  OR (payload->>'sourceCapturedAt')::bigint>(payload->>'preparedAt')::bigint OR (r->>'acceptedAt')::bigint-(payload->>'sourceCapturedAt')::bigint>30000
  OR e->>'contract' IS DISTINCT FROM 'rate-as-of-revalidated-v1' OR e->'sourceFingerprint' IS DISTINCT FROM payload->'sourceFingerprint' OR NOT tdee_rate_chain_private.hash(e->'sourceFingerprint')
  OR e->'sourceCapturedAt' IS DISTINCT FROM payload->'sourceCapturedAt' OR e->'profileBinding' IS DISTINCT FROM a->'profileBinding' OR e->'journeyBinding' IS DISTINCT FROM a->'journeyBinding'
  OR e->'policyDigest' IS DISTINCT FROM payload#>'{policyBinding,digest}' OR e->'reviewId' IS DISTINCT FROM review->'reviewId' OR e->'reviewVersion' IS DISTINCT FROM review->'reviewVersion'
  OR review->>'ownerId' IS DISTINCT FROM owner_id OR review->'goalId' IS DISTINCT FROM old_goal->'id' OR review->'goalRevision' IS DISTINCT FROM old_goal->'updated_at'
  OR review->'profileBinding' IS DISTINCT FROM a->'profileBinding' OR review->'journeyBinding' IS DISTINCT FROM a->'journeyBinding' OR review->'policyDigest' IS DISTINCT FROM policy->'digest' OR review->'policyVersion' IS DISTINCT FROM policy->'version'
  OR review->'sourceFingerprint' IS DISTINCT FROM payload->'sourceFingerprint' OR review->'sourceCapturedAt' IS DISTINCT FROM payload->'sourceCapturedAt'
  OR NOT tdee_rate_chain_private.integer(review->'reviewedAt') OR (review->>'reviewedAt')::bigint<(payload->>'sourceCapturedAt')::bigint OR (review->>'reviewedAt')::bigint>(r->>'acceptedAt')::bigint
  OR NOT tdee_rate_chain_private.integer(review->'expiresAt') OR (review->>'expiresAt')::bigint<=(r->>'acceptedAt')::bigint
  OR review#>'{uncertainty,validated}' IS DISTINCT FROM 'true'::jsonb OR review#>'{uncertainty,stable}' IS DISTINCT FROM 'true'::jsonb OR review#>'{conversion,reviewed}' IS DISTINCT FROM 'true'::jsonb
  OR review#>>'{conversion,model}' IS DISTINCT FROM 'approximate-energy-equivalent-v1' OR review#>'{conversion,kcalPerKg}' IS DISTINCT FROM '7700'::jsonb
  OR policy->'enabled' IS DISTINCT FROM 'true'::jsonb OR policy->'reviewed' IS DISTINCT FROM 'true'::jsonb OR policy->'snapshot_contract_reviewed' IS DISTINCT FROM 'true'::jsonb OR policy->>'engine_version' IS DISTINCT FROM 'rate-review-14d-v1'
  OR payload#>'{policyBinding,version}' IS DISTINCT FROM policy->'version' OR payload#>'{policyBinding,digest}' IS DISTINCT FROM policy->'digest' OR payload#>'{policyBinding,engineVersion}' IS DISTINCT FROM policy->'engine_version'
  OR coalesce(tdee_rate_chain_private.instant(policy->'expires_at'),0)<=(r->>'acceptedAt')::bigint THEN RAISE EXCEPTION 'invalid_binding'; END IF;
  FOREACH field IN ARRAY ARRAY['max_step_kcal','max_step_fraction','max_cumulative_delta_kcal','min_days_between_acceptances','increment_kcal','min_intake_kcal','max_intake_kcal'] LOOP
   IF jsonb_typeof(policy->field) IS DISTINCT FROM 'number' OR (policy->>field)::numeric<=0 THEN RAISE EXCEPTION 'invalid_policy'; END IF;
  END LOOP;
  IF (policy->>'max_step_kcal')::numeric>200 OR (policy->>'max_step_fraction')::numeric>1 OR NOT tdee_rate_chain_private.integer(policy->'increment_kcal') OR NOT tdee_rate_chain_private.integer(policy->'min_days_between_acceptances')
  OR (policy->>'min_days_between_acceptances')::bigint<14 OR (policy->>'max_intake_kcal')::numeric<(policy->>'min_intake_kcal')::numeric
  OR (r->>'acceptedAt')::bigint-last_at<(policy->>'min_days_between_acceptances')::bigint*86400000
  OR NOT tdee_rate_chain_private.integer(r->'deltaKcal') OR (r->>'deltaKcal')::bigint<=0 OR (r->>'deltaKcal')::bigint>(policy->>'max_step_kcal')::numeric
  OR (r->>'deltaKcal')::bigint>(old_goal->>'daily_calories')::double precision*(policy->>'max_step_fraction')::double precision
  OR (r->>'deltaKcal')::bigint%(policy->>'increment_kcal')::bigint<>0 OR r->'deltaKcal' IS DISTINCT FROM payload->'deltaKcal'
  OR r->'netDeltaKcal' IS DISTINCT FROM to_jsonb(net+(r->>'deltaKcal')::bigint) OR r->'netDeltaKcal' IS DISTINCT FROM payload->'netDeltaKcal'
  OR (r->>'netDeltaKcal')::numeric>(policy->>'max_cumulative_delta_kcal')::numeric THEN RAISE EXCEPTION 'invalid_delta'; END IF;
  target:=payload->'target';
  IF jsonb_typeof(target) IS DISTINCT FROM 'object' OR (g->>'daily_calories')::numeric IS DISTINCT FROM (old_goal->>'daily_calories')::numeric+(r->>'deltaKcal')::bigint
  OR (g->>'daily_calories')::numeric IS DISTINCT FROM (a->>'baselineIntakeKcal')::numeric+(r->>'netDeltaKcal')::numeric OR (g->>'daily_calories')::numeric<(policy->>'min_intake_kcal')::numeric OR (g->>'daily_calories')::numeric>(policy->>'max_intake_kcal')::numeric
  OR g->'base_daily_calories' IS DISTINCT FROM a->'baselineIntakeKcal' OR tdee_rate_chain_private.instant(g->'created_at') IS DISTINCT FROM (r->>'acceptedAt')::bigint
  OR tdee_rate_chain_private.instant(g->'updated_at') IS DISTINCT FROM (r->>'acceptedAt')::bigint OR tdee_rate_chain_private.instant(g->'last_adaptive_update') IS DISTINCT FROM (r->>'acceptedAt')::bigint THEN RAISE EXCEPTION 'invalid_goal'; END IF;
  FOR goal_key,target_key IN SELECT * FROM (VALUES('daily_calories','calories'),('protein_g','proteinG'),('carbs_g','carbsG'),('fats_g','fatsG'),('fiber_g','fiberG')) x LOOP
   IF NOT tdee_rate_chain_private.integer(g->goal_key) OR (g->>goal_key)::bigint NOT BETWEEN 0 AND 10000 OR g->goal_key IS DISTINCT FROM target->target_key THEN RAISE EXCEPTION 'invalid_macro'; END IF;
  END LOOP;
  IF abs((g->>'daily_calories')::bigint-4*(g->>'protein_g')::bigint-4*(g->>'carbs_g')::bigint-9*(g->>'fats_g')::bigint)>10
  OR old_goal-mutable IS DISTINCT FROM g-mutable OR payload->'current' IS DISTINCT FROM jsonb_build_object('calories',old_goal->'daily_calories','proteinG',old_goal->'protein_g','carbsG',old_goal->'carbs_g','fatsG',old_goal->'fats_g','fiberG',old_goal->'fiber_g') THEN RAISE EXCEPTION 'invalid_stable_goal'; END IF;
  prior:=g;net:=(r->>'netDeltaKcal')::bigint;last_at:=(r->>'acceptedAt')::bigint;last_digest:=r->'receiptDigest';req_ids:=req_ids||jsonb_build_array(q->'requestId');proposal_ids:=proposal_ids||jsonb_build_array(q->'rateProposalId');goal_ids:=goal_ids||jsonb_build_array(g->'id');
 END LOOP;
 IF prior IS DISTINCT FROM v->'currentGoal' OR v#>>'{currentGoal,user_id}' IS DISTINCT FROM owner_id OR v#>'{currentGoal,is_active}' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'invalid_current_goal'; END IF;
 RETURN jsonb_build_object('kind','rate_chain_verified','actionable',false,'acceptanceAuthorized',false,'anchorReference',ref,'acceptedCount',idx,'acceptedDeltaKcal',net,'lastAcceptedAt',CASE WHEN idx>0 THEN last_at ELSE NULL END,'lastReceiptDigest',last_digest,'currentGoal',prior,'receiptsVerified',true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('kind','blocked','reason','rate_receipt_chain_unverified','actionable',false,'acceptanceAuthorized',false);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tdee_rate_chain_private FROM PUBLIC,anon,authenticated,service_role;

-- Requires rateRecordStorageCandidate.sql; explicit pure writer-facing facade.
CREATE FUNCTION tdee_rate_record_private.verify_chain(value jsonb,now_ms bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$ SELECT tdee_rate_chain_private.verify_chain(value,now_ms) $$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.verify_chain(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
