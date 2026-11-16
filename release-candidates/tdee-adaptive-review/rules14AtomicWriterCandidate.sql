-- SOURCE ONLY. Independent deterministic product-rule acceptance; all wrappers OFF.
CREATE FUNCTION tdee_rules14_private.assert_rate_request(q jsonb)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=auth.uid();k text;
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';END IF;
 IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR octet_length(q::text)>2048 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(q))<>6 OR NOT q ?& ARRAY['version','ownerId','requestId','rateProposalId','rateProposalDigest','anchorReference'] OR
 jsonb_typeof(q->'version') IS DISTINCT FROM 'string' OR jsonb_typeof(q->'ownerId') IS DISTINCT FROM 'string' OR jsonb_typeof(q->'rateProposalDigest') IS DISTINCT FROM 'string' OR
 q->>'version' IS DISTINCT FROM 'rules14-acceptance-request-v1' OR q->>'ownerId' IS DISTINCT FROM actor::text OR
 q->>'rateProposalDigest' IS NULL OR q->>'rateProposalDigest' !~ '^[a-f0-9]{64}$' OR jsonb_typeof(q->'anchorReference') IS DISTINCT FROM 'object' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;
 FOREACH k IN ARRAY ARRAY['requestId','rateProposalId'] LOOP
 IF jsonb_typeof(q->k) IS DISTINCT FROM 'string' OR q->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(q->'anchorReference'))<>4 OR NOT (q->'anchorReference') ?& ARRAY['ownerId','version','sourceRequestId','sourceGoalId'] OR
 q#>>'{anchorReference,ownerId}' IS DISTINCT FROM actor::text OR jsonb_typeof(q#>'{anchorReference,version}') IS DISTINCT FROM 'number' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;
 IF (q#>>'{anchorReference,version}')::numeric<>trunc((q#>>'{anchorReference,version}')::numeric) OR
 (q#>>'{anchorReference,version}')::numeric NOT BETWEEN 1 AND 9007199254740991 THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;
 FOREACH k IN ARRAY ARRAY['sourceRequestId','sourceGoalId'] LOOP
 IF jsonb_typeof(q->'anchorReference'->k) IS DISTINCT FROM 'string' OR q->'anchorReference'->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_request_invalid';END IF;END LOOP;
 RETURN actor;
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.assert_rate_request(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION tdee_rules14_private.accept_rate_proposal(q jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' SET extra_float_digits=3 AS $fn$
DECLARE actor uuid:=tdee_rules14_private.assert_rate_request(q); saved jsonb;admission_result jsonb;result jsonb;reason text:='rate_proposal_unavailable';
 p tdee_rules14_private.proposals;h tdee_rate_anchor_private.anchors;u public.users;g public.goals;
 policy tdee_rules14_private.policy_versions;mc macrogoal_snapshot_review_private.macro_choices;
 payload jsonb;ref jsonb;c jsonb;chain jsonb;verified_chain jsonb;source jsonb;derived jsonb;coverage jsonb;binding jsonb;energy jsonb;energy_input jsonb;
 snapshot jsonb;readiness jsonb;target jsonb;macro jsonb;mb jsonb;expected_review jsonb;expected_limits jsonb;expected_choice jsonb;allocation jsonb;trusted_macro jsonb;
 at_time timestamptz;at_ms bigint;source_ms numeric;today date;k text;n numeric;delta integer;net_delta integer;accepted_count integer;commit_obligations_verified boolean:=false;
 new_goal public.goals;unsigned_receipt jsonb;receipt_record jsonb;receipt_content text;receipt_hash text;final_context jsonb;final_access jsonb;changed_count integer;
BEGIN
 -- Owner lock serializes request replay, manual saves, anchor appends and future
 -- accepted writes. An app-held idempotency key alone never authorizes an effect.
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable';END IF;
 saved:=tdee_rules14_private.read_exact_request(actor,(q->>'requestId')::uuid,q);
 IF saved IS NOT NULL THEN RETURN saved;END IF;
 at_time:=clock_timestamp();at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 SELECT * INTO p FROM tdee_rules14_private.proposals WHERE owner_id=actor AND id=(q->>'rateProposalId')::uuid FOR UPDATE;
 IF NOT FOUND OR p.digest IS DISTINCT FROM q->>'rateProposalDigest' OR p.record#>'{payload,anchorReference}' IS DISTINCT FROM q->'anchorReference' THEN
  admission_result:=jsonb_build_object('status','rejected','reason','rate_proposal_unavailable');
 ELSE
  admission_result:=tdee_rules14_private.validate_rate_proposal_locked(actor,p.record,at_time);
 END IF;
 IF admission_result->>'status' IS DISTINCT FROM 'validated' THEN reason:=coalesce(admission_result->>'reason','rate_admission_unverified');
 ELSE
  h:=jsonb_populate_record(NULL::tdee_rate_anchor_private.anchors,admission_result->'anchorRow');
  u:=jsonb_populate_record(NULL::public.users,admission_result->'profileRow');g:=jsonb_populate_record(NULL::public.goals,admission_result->'goalRow');
  policy:=jsonb_populate_record(NULL::tdee_rules14_private.policy_versions,admission_result->'policyRow');
  payload:=admission_result->'payload';ref:=admission_result->'anchorReference';chain:=admission_result->'chain';verified_chain:=admission_result->'verifiedChain';binding:=admission_result->'binding';target:=admission_result->'target';
  source_ms:=(admission_result->>'sourceMs')::numeric;delta:=(admission_result->>'delta')::integer;net_delta:=(admission_result->>'netDelta')::integer;accepted_count:=(admission_result->>'acceptedCount')::integer;
  commit_obligations_verified:=true;
 END IF;
 IF commit_obligations_verified THEN
  -- Exact final current-source cut after all locks; later food changes belong to
  -- the next review, not an invented transaction-wide source barrier.
  final_context:=tdee_rules14_private.read_source(actor,payload->'policyBinding')->'snapshot';
  final_access:=macrogoal_observed_private.tester_access(actor);
  at_time:=date_trunc('milliseconds',clock_timestamp());at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
  IF final_context->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR final_context#>>'{observation,sourceFingerprint}' IS DISTINCT FROM payload->>'sourceFingerprint' OR
   final_context#>>'{readiness,profileBinding}' IS DISTINCT FROM payload->>'profileBinding' OR final_context#>>'{readiness,journeyBinding}' IS DISTINCT FROM payload->>'journeyBinding' OR
   final_context#>'{readiness,eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR final_context#>'{observation,context,premium}' IS DISTINCT FROM 'true'::jsonb OR
   final_context#>'{observation,context,enabled}' IS DISTINCT FROM 'true'::jsonb OR
   jsonb_typeof(final_context#>'{observation,context,accessValidUntil}') IS DISTINCT FROM 'number' OR (final_context#>>'{observation,context,accessValidUntil}')::numeric<=at_ms OR
   jsonb_typeof(final_access->'managed') IS DISTINCT FROM 'boolean' OR
   (final_access->'managed'='true'::jsonb AND (final_access->'allowed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(final_access->'validUntil') IS DISTINCT FROM 'number' OR (final_access->>'validUntil')::numeric<=at_ms)) OR
   at_ms-source_ms>30000 OR source_ms>at_ms OR p.expires_at_ms<=at_ms OR policy.expires_at<=at_time OR NOT tdee_rules14_private.screening_current(final_context,actor,at_time) OR final_context->'rulesScreening' IS DISTINCT FROM payload->'screeningEvidence' OR
   at_time<=g.created_at OR at_ms-coalesce((verified_chain->>'lastAcceptedAt')::numeric,(h.anchor->>'acceptedAt')::numeric)<(policy.document->>'min_days_between_acceptances')::numeric*86400000::numeric THEN
   reason:='authority_or_source_expired';commit_obligations_verified:=false;
  ELSE
   UPDATE public.goals SET is_active=false WHERE id=g.id AND user_id=actor AND is_active=true AND to_jsonb(goals)=to_jsonb(g);
   GET DIAGNOSTICS changed_count=ROW_COUNT;
   IF changed_count<>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_goal_cas_conflict';END IF;
   INSERT INTO public.goals(user_id,goal_type,goal_intensity,target_weight,daily_calories,protein_g,carbs_g,fats_g,fiber_g,is_active,
    loss_rate_lbs_per_week,start_date,start_journey_date,macro_preset,base_daily_calories,last_adaptive_update,created_at,updated_at)
   VALUES(actor,g.goal_type,g.goal_intensity,g.target_weight,(target->>'calories')::integer,(target->>'proteinG')::integer,(target->>'carbsG')::integer,
    (target->>'fatsG')::integer,(target->>'fiberG')::integer,true,g.loss_rate_lbs_per_week,g.start_date,g.start_journey_date,g.macro_preset,
    (h.anchor->>'baselineIntakeKcal')::integer,at_time,at_time,at_time) RETURNING * INTO new_goal;
   IF new_goal.id=g.id OR new_goal.user_id IS DISTINCT FROM actor OR new_goal.is_active IS DISTINCT FROM true OR
    new_goal.created_at IS DISTINCT FROM at_time OR new_goal.updated_at IS DISTINCT FROM at_time OR new_goal.last_adaptive_update IS DISTINCT FROM at_time OR
    new_goal.daily_calories IS DISTINCT FROM (target->>'calories')::integer OR new_goal.protein_g IS DISTINCT FROM (target->>'proteinG')::integer OR
    new_goal.carbs_g IS DISTINCT FROM (target->>'carbsG')::integer OR new_goal.fats_g IS DISTINCT FROM (target->>'fatsG')::integer OR new_goal.fiber_g IS DISTINCT FROM (target->>'fiberG')::integer OR
    (to_jsonb(new_goal)-ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']) IS DISTINCT FROM
    (to_jsonb(g)-ARRAY['id','daily_calories','protein_g','carbs_g','fats_g','fiber_g','is_active','last_adaptive_update','created_at','updated_at','base_daily_calories']) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_goal_write_changed';END IF;
   unsigned_receipt:=jsonb_build_object('version','rules14-acceptance-receipt-v1','status','committed','canonicalEncoding','pg-jsonb-v1','sequence',accepted_count+1,
    'request',q,'anchorReference',ref,'previousGoalSnapshot',to_jsonb(g),'acceptedGoalSnapshot',to_jsonb(new_goal),'acceptedAt',at_ms,'deltaKcal',delta,'netDeltaKcal',net_delta,
    'previousReceiptDigest',verified_chain->'lastReceiptDigest','acceptanceEvidence',jsonb_build_object('contract','rules14-as-of-revalidated-v1','sourceFingerprint',payload->>'sourceFingerprint',
    'sourceCapturedAt',source_ms,'policyRevision',policy.revision,'screeningRequestId',payload#>'{screeningEvidence,requestId}','screeningVersion',payload#>'{screeningEvidence,rowVersion}','policyDigest',policy.digest,
    'profileBinding',payload->>'profileBinding','journeyBinding',payload->>'journeyBinding'));
   receipt_content:=unsigned_receipt::text;receipt_hash:=encode(sha256(convert_to(receipt_content,'UTF8')),'hex');
   receipt_record:=unsigned_receipt||jsonb_build_object('canonicalContent',receipt_content,'receiptDigest',receipt_hash);
   IF octet_length(receipt_record::text)>65536 OR NOT tdee_rules14_private.valid_content(receipt_record,receipt_content,receipt_hash,'receiptDigest') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rate_receipt_encoding_invalid';END IF;
   INSERT INTO tdee_rules14_private.requests(owner_id,request_id,request,result) VALUES(actor,(q->>'requestId')::uuid,q,receipt_record);
   INSERT INTO tdee_rules14_private.receipts(owner_id,request_id,proposal_id,proposal_digest,anchor_version,source_request_id,source_goal_id,sequence,prior_sequence,
    previous_receipt_digest,receipt_digest,canonical_content,record,previous_goal,accepted_goal,accepted_at_ms)
   VALUES(actor,(q->>'requestId')::uuid,p.id,p.digest,h.version,h.source_request_id,h.source_goal_id,accepted_count+1,CASE WHEN accepted_count=0 THEN NULL ELSE accepted_count END,
    verified_chain->>'lastReceiptDigest',receipt_hash,receipt_content,receipt_record,to_jsonb(g),to_jsonb(new_goal),at_ms);
   -- Verify the actual persisted post-state, not a manufactured success envelope.
   chain:=tdee_rules14_private.read_chain(actor);
   -- The outer statement timestamp predates this function's writes. Capture the
   -- actual post-read time explicitly; never rewrite proposal/provider expiry.
   at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
   chain:=jsonb_set(chain,'{capturedAt}',to_jsonb(at_ms));
   verified_chain:=tdee_rules14_private.verify_chain(chain,at_ms);
   IF verified_chain->>'kind' IS DISTINCT FROM 'rules14_chain_verified' OR (verified_chain->>'acceptedCount')::integer<>accepted_count+1 OR
    verified_chain->>'lastReceiptDigest' IS DISTINCT FROM receipt_hash OR verified_chain->'currentGoal' IS DISTINCT FROM to_jsonb(new_goal) THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='rate_postwrite_chain_invalid';END IF;
   RETURN receipt_record;
  END IF;
 END IF;
 result:=jsonb_build_object('version','rules14-acceptance-receipt-v1','status','rejected','reason',reason,'request',q);
 INSERT INTO tdee_rules14_private.requests(owner_id,request_id,request,result) VALUES(actor,(q->>'requestId')::uuid,q,result);
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.accept_rate_proposal(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_accept_rules14_proposal_v1(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=tdee_rules14_private.assert_rate_request(p_request);
BEGIN
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_acceptance_off');END IF;
 RETURN tdee_rules14_private.accept_rate_proposal(p_request);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_accept_rules14_proposal_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_accept_rules14_proposal_v1(jsonb) TO authenticated;


