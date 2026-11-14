-- CANDIDATE ONLY. No policy or eligibility rows are seeded; no activation.
-- Snapshot-as-of semantics approved; no source trigger dependency. Inert until policy and eligibility validated.
-- Not a Supabase migration and not executed by repository publication.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA IF NOT EXISTS macrogoal_snapshot_review_private;
REVOKE ALL ON SCHEMA macrogoal_snapshot_review_private FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE macrogoal_snapshot_review_private.policies (
 version text PRIMARY KEY, engine_version text NOT NULL, digest text NOT NULL UNIQUE CHECK(digest ~ '^[a-f0-9]{64}$'),
 enabled boolean NOT NULL DEFAULT false, reviewed boolean NOT NULL DEFAULT false,
 snapshot_contract_reviewed boolean NOT NULL DEFAULT false,
 max_step_kcal integer NOT NULL CHECK(max_step_kcal BETWEEN 1 AND 200),
 max_step_fraction numeric NOT NULL CHECK(max_step_fraction>0 AND max_step_fraction<=1),
 min_days_between_acceptances integer NOT NULL CHECK(min_days_between_acceptances>=14),
 max_cumulative_delta_kcal integer NOT NULL CHECK(max_cumulative_delta_kcal>0),
 min_intake_kcal integer NOT NULL CHECK(min_intake_kcal>0),
 max_intake_kcal integer NOT NULL CHECK(max_intake_kcal>=min_intake_kcal),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at))
);
CREATE TABLE macrogoal_snapshot_review_private.anchors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 policy_version text NOT NULL REFERENCES macrogoal_snapshot_review_private.policies(version),
 active_goal_id uuid NOT NULL, baseline_intake_kcal integer NOT NULL CHECK(baseline_intake_kcal>0),
 baseline_expenditure_kcal integer NOT NULL CHECK(baseline_expenditure_kcal>0),
 baseline_captured_at timestamptz NOT NULL CHECK(isfinite(baseline_captured_at)),
 accepted_delta_kcal integer NOT NULL DEFAULT 0 CHECK(abs(accepted_delta_kcal)<=10000),
 last_accepted_at timestamptz, revoked boolean NOT NULL DEFAULT false,
 UNIQUE(owner_id,active_goal_id)
);
CREATE TABLE macrogoal_snapshot_review_private.eligibility (
 owner_id uuid NOT NULL, policy_version text NOT NULL REFERENCES macrogoal_snapshot_review_private.policies(version),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 eligible boolean NOT NULL DEFAULT false, complete_days_verified boolean NOT NULL DEFAULT false,
 source_fingerprint text NOT NULL CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 PRIMARY KEY(owner_id,policy_version)
);
CREATE TABLE macrogoal_snapshot_review_private.proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 policy_version text NOT NULL REFERENCES macrogoal_snapshot_review_private.policies(version),
 anchor_id uuid NOT NULL REFERENCES macrogoal_snapshot_review_private.anchors(id),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=16384),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 consumed_request uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE macrogoal_snapshot_review_private.receipts (
 owner_id uuid NOT NULL, request_id uuid NOT NULL, request jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('committed','rejected')),
 reason text, anchor_id uuid REFERENCES macrogoal_snapshot_review_private.anchors(id), accepted_goal_id uuid, accepted_goal jsonb,
 acceptance_evidence jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,request_id),
 CHECK((status='committed' AND anchor_id IS NOT NULL AND accepted_goal_id IS NOT NULL AND accepted_goal IS NOT NULL AND reason IS NULL)
    OR (status='rejected' AND anchor_id IS NULL AND accepted_goal_id IS NULL AND accepted_goal IS NULL AND reason IS NOT NULL))
);
DO $secure$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['policies','anchors','eligibility','proposals','receipts'] LOOP
  EXECUTE format('ALTER TABLE macrogoal_snapshot_review_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE macrogoal_snapshot_review_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $secure$;

CREATE FUNCTION macrogoal_snapshot_review_private.snapshot_time_valid(value text, at_time timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE captured timestamptz;
BEGIN
 IF value IS NULL OR value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' OR at_time IS NULL OR NOT isfinite(at_time) THEN RETURN false; END IF;
 BEGIN captured:=value::timestamptz; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false; END;
 RETURN isfinite(captured) AND captured<=at_time AND at_time-captured<=interval '30 seconds';
END $fn$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.snapshot_time_valid(text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION macrogoal_snapshot_review_private.assert_request(p_request jsonb)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>1024 OR
    NOT p_request ?& ARRAY['ownerId','requestId','proposalId','proposalDigest'] OR
    EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN ('ownerId','requestId','proposalId','proposalDigest')) OR
    EXISTS(SELECT 1 FROM jsonb_each(p_request) kv WHERE jsonb_typeof(kv.value)<>'string') OR
    p_request->>'proposalDigest' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
 IF (p_request->>'ownerId')::uuid IS DISTINCT FROM actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_changed'; END IF;
 PERFORM (p_request->>'requestId')::uuid,(p_request->>'proposalId')::uuid;
 RETURN actor;
END $fn$;

CREATE FUNCTION macrogoal_snapshot_review_private.issue_proposal(p_id uuid,p_owner uuid,p_policy text,p_anchor uuid,p_expires_at timestamptz,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE policy macrogoal_snapshot_review_private.policies; anchor macrogoal_snapshot_review_private.anchors;
 p macrogoal_snapshot_review_private.proposals; calculated_digest text;
BEGIN
 -- Only a trusted server producer can issue values. This private candidate has
 -- no service_role grant or public wrapper; a future binding needs review.
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='issuer_required'; END IF;
 IF p_id IS NULL OR p_owner IS NULL OR p_anchor IS NULL OR p_expires_at IS NULL OR NOT isfinite(p_expires_at) OR
   p_expires_at<=clock_timestamp() OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>16384 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_proposal'; END IF;
 IF p_payload->>'snapshotSemantics' IS DISTINCT FROM 'as-of-revalidated-v1' OR
    coalesce(p_payload->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$' OR
    coalesce(p_payload->>'readinessFingerprint','') !~ '^[a-f0-9]{64}$' OR
    NOT p_payload ?& ARRAY['goalId','goalUpdatedAt','profileUpdatedAt','goalSnapshot','sourceCapturedAt'] OR
    NOT macrogoal_snapshot_review_private.snapshot_time_valid(p_payload->>'sourceCapturedAt',clock_timestamp()) OR
    p_expires_at>(p_payload->>'sourceCapturedAt')::timestamptz+interval '5 minutes' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='snapshot_contract_invalid'; END IF;
 SELECT * INTO policy FROM macrogoal_snapshot_review_private.policies WHERE version=p_policy FOR SHARE;
 IF NOT FOUND OR NOT policy.enabled OR NOT policy.reviewed OR NOT policy.snapshot_contract_reviewed OR policy.expires_at<=clock_timestamp() OR
   p_expires_at>policy.expires_at OR p_payload->>'policyDigest' IS DISTINCT FROM policy.digest OR p_payload->>'engineVersion' IS DISTINCT FROM policy.engine_version THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='safety_review_required'; END IF;
 SELECT * INTO anchor FROM macrogoal_snapshot_review_private.anchors WHERE id=p_anchor AND owner_id=p_owner;
 IF NOT FOUND OR anchor.revoked OR anchor.policy_version<>p_policy OR anchor.active_goal_id IS DISTINCT FROM (p_payload->>'goalId')::uuid THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='anchor_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.eligibility e WHERE e.owner_id=p_owner AND e.policy_version=p_policy
   AND e.eligible AND e.complete_days_verified AND e.expires_at>=p_expires_at
   AND e.digest=p_payload->>'eligibilityDigest' AND e.source_fingerprint=p_payload->>'sourceFingerprint') THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='eligibility_review_required'; END IF;
 calculated_digest:=encode(sha256(convert_to(jsonb_build_object('id',p_id,'ownerId',p_owner,'policyVersion',p_policy,
   'anchorId',p_anchor,'expiresAt',p_expires_at,'payload',p_payload)::text,'UTF8')),'hex');
 INSERT INTO macrogoal_snapshot_review_private.proposals(id,owner_id,policy_version,anchor_id,digest,payload,expires_at)
 VALUES(p_id,p_owner,p_policy,p_anchor,calculated_digest,p_payload,p_expires_at) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO p FROM macrogoal_snapshot_review_private.proposals WHERE id=p_id;
 IF p.owner_id IS DISTINCT FROM p_owner OR p.digest IS DISTINCT FROM calculated_digest OR p.consumed_request IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='proposal_identity_conflict'; END IF;
 RETURN jsonb_build_object('type','persisted_reviewed_proposal','actionable',true,'ownerId',p_owner,'id',p.id,'digest',p.digest,
   'policyVersion',p.policy_version,'engineVersion',policy.engine_version,'expiresAt',p.expires_at,
   'current',p.payload->'current','target',p.payload->'target','deltaKcal',p.payload->'deltaKcal','sourceDate',p.payload->'sourceDate');
END $fn$;

CREATE FUNCTION macrogoal_snapshot_review_private.read_receipt(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=macrogoal_snapshot_review_private.assert_request(p_request); r macrogoal_snapshot_review_private.receipts; is_current boolean;
BEGIN
 SELECT * INTO r FROM macrogoal_snapshot_review_private.receipts WHERE owner_id=actor AND request_id=(p_request->>'requestId')::uuid;
 IF NOT FOUND THEN RETURN jsonb_build_object('version','adaptive-receipt-v1','status','not_found'); END IF;
 IF r.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='request_mismatch'; END IF;
 IF r.status='rejected' THEN RETURN jsonb_build_object('version','adaptive-receipt-v1','status','rejected','request',p_request,'reason',r.reason); END IF;
 SELECT count(*)=1 AND bool_and(id=r.accepted_goal_id AND to_jsonb(g)=r.accepted_goal)
 INTO is_current FROM public.goals g WHERE user_id=actor AND is_active=true;
 RETURN jsonb_build_object('version','adaptive-receipt-v1','status','committed','request',p_request,
   'acceptedGoal',jsonb_build_object('id',r.accepted_goal_id,'updatedAt',r.accepted_goal->'updated_at'),
   'goalState',CASE WHEN coalesce(is_current,false) THEN 'current' ELSE 'superseded' END);
END $fn$;

CREATE FUNCTION macrogoal_snapshot_review_private.reject_request(p_request jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=macrogoal_snapshot_review_private.assert_request(p_request);
BEGIN
 INSERT INTO macrogoal_snapshot_review_private.receipts(owner_id,request_id,request,status,reason)
 VALUES(actor,(p_request->>'requestId')::uuid,p_request,'rejected',p_reason);
 RETURN jsonb_build_object('version','adaptive-receipt-v1','status','rejected','request',p_request,'reason',p_reason);
END $fn$;

CREATE FUNCTION macrogoal_snapshot_review_private.accept_proposal(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=macrogoal_snapshot_review_private.assert_request(p_request); prior jsonb;
 p macrogoal_snapshot_review_private.proposals; policy macrogoal_snapshot_review_private.policies;
 anchor macrogoal_snapshot_review_private.anchors; e macrogoal_snapshot_review_private.eligibility;
 u public.users; g public.goals; result public.goals; snapshot jsonb; readiness jsonb; target jsonb;
 k text; n numeric; delta integer; accepted_at timestamptz; today date;
BEGIN
 -- Replay is available even when the feature/policy is OFF or proposal expired.
 prior:=macrogoal_snapshot_review_private.read_receipt(p_request);
 IF prior->>'status'<>'not_found' THEN RETURN prior; END IF;
 -- Same owner serializes requests before receipt/proposal consumption. Lock order
 -- agrees with manual save/restart and the candidate source barrier.
 -- Real source-writer interleavings are not yet verified in PostgreSQL.
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable'; END IF;
 prior:=macrogoal_snapshot_review_private.read_receipt(p_request);
 IF prior->>'status'<>'not_found' THEN RETURN prior; END IF;
 SELECT * INTO p FROM macrogoal_snapshot_review_private.proposals WHERE id=(p_request->>'proposalId')::uuid AND owner_id=actor;
 IF NOT FOUND OR p.digest IS DISTINCT FROM p_request->>'proposalDigest' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_unavailable'); END IF;
 IF p.consumed_request IS NOT NULL THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_consumed'); END IF;
 IF p.expires_at<=clock_timestamp() THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_expired'); END IF;
 -- Typed persisted payload was issued by the trusted server, never the accept body.
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'isolation_unsupported'); END IF;
 IF NOT p.payload ?& ARRAY['goalId','goalUpdatedAt','profileUpdatedAt','goalSnapshot','sourceFingerprint','sourceCapturedAt','snapshotSemantics'] OR
    jsonb_typeof(p.payload->'profileUpdatedAt') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p.payload->'goalUpdatedAt') IS DISTINCT FROM 'string' OR
    u.updated_at IS NULL OR u.updated_at IS DISTINCT FROM (p.payload->>'profileUpdatedAt')::timestamptz THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'profile_changed'); END IF;
 SELECT * INTO g FROM public.goals WHERE id=(p.payload->>'goalId')::uuid AND user_id=actor AND is_active=true FOR UPDATE;
 IF NOT FOUND OR g.updated_at IS NULL OR g.updated_at IS DISTINCT FROM (p.payload->>'goalUpdatedAt')::timestamptz OR
    to_jsonb(g) IS DISTINCT FROM p.payload->'goalSnapshot' OR
    (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'goal_changed'); END IF;
 SELECT * INTO p FROM macrogoal_snapshot_review_private.proposals WHERE id=(p_request->>'proposalId')::uuid AND owner_id=actor FOR UPDATE;
 IF NOT FOUND OR p.owner_id IS DISTINCT FROM actor OR p.digest IS DISTINCT FROM p_request->>'proposalDigest' OR
    p.payload->>'goalId' IS DISTINCT FROM g.id::text OR p.expires_at<=clock_timestamp() OR p.consumed_request IS NOT NULL THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'proposal_expired_or_consumed'); END IF;
 SELECT * INTO policy FROM macrogoal_snapshot_review_private.policies WHERE version=p.policy_version FOR SHARE;
 IF NOT FOUND OR NOT policy.enabled OR NOT policy.reviewed OR NOT policy.snapshot_contract_reviewed OR policy.expires_at<=clock_timestamp() THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'safety_review_required'); END IF;
 SELECT * INTO anchor FROM macrogoal_snapshot_review_private.anchors WHERE id=p.anchor_id AND owner_id=actor FOR UPDATE;
 IF NOT FOUND OR anchor.revoked OR anchor.policy_version<>policy.version OR anchor.active_goal_id IS DISTINCT FROM (p.payload->>'goalId')::uuid THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'anchor_changed'); END IF;
 SELECT * INTO e FROM macrogoal_snapshot_review_private.eligibility WHERE owner_id=actor AND policy_version=policy.version FOR SHARE;
 IF NOT FOUND OR NOT e.eligible OR NOT e.complete_days_verified OR e.expires_at<=clock_timestamp() OR
   e.digest IS DISTINCT FROM p.payload->>'eligibilityDigest' OR e.source_fingerprint IS DISTINCT FROM p.payload->>'sourceFingerprint' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'eligibility_review_required'); END IF;
 -- User can revoke self-confirmation without changing food/weight inputs.
 -- No actor parameter is accepted by the readiness API.
 readiness:=public.tdee_read_readiness_v1();
 IF readiness->>'version' IS DISTINCT FROM 'tdee-readiness-v1' OR readiness->>'ownerId' IS DISTINCT FROM actor::text OR
    readiness#>'{eligibility,current}' IS DISTINCT FROM 'true'::jsonb OR
    readiness#>'{eligibility,adult}' IS DISTINCT FROM 'true'::jsonb OR
    readiness#>>'{eligibility,response}' IS DISTINCT FROM 'criteria_confirmed' OR
    coalesce(p.payload->>'readinessFingerprint','') !~ '^[a-f0-9]{64}$' OR
    encode(sha256(convert_to((readiness-'capturedAt')::text,'UTF8')),'hex') IS DISTINCT FROM p.payload->>'readinessFingerprint' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'readiness_changed'); END IF;
 -- Revalidated snapshot; source writes after this cut may enter the next review.
 snapshot:=public.observed_get_tdee_snapshot_v1();
 IF jsonb_typeof(snapshot) IS DISTINCT FROM 'object' OR snapshot->>'version' IS DISTINCT FROM 'observed-snapshot-v1' OR
    snapshot->>'ownerId' IS DISTINCT FROM actor::text OR snapshot#>>'{context,ownerId}' IS DISTINCT FROM actor::text OR
    coalesce(snapshot->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$' OR coalesce(p.payload->>'sourceFingerprint','') !~ '^[a-f0-9]{64}$' OR
    p.payload->>'snapshotSemantics' IS DISTINCT FROM 'as-of-revalidated-v1' OR
    NOT macrogoal_snapshot_review_private.snapshot_time_valid(snapshot->>'capturedAt',clock_timestamp()) OR
    (p.payload->>'sourceCapturedAt')::timestamptz>(snapshot->>'capturedAt')::timestamptz OR
    snapshot->>'sourceFingerprint' IS DISTINCT FROM p.payload->>'sourceFingerprint' OR
   snapshot#>'{context,premium}' IS DISTINCT FROM 'true'::jsonb OR snapshot#>'{context,enabled}' IS DISTINCT FROM 'true'::jsonb THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'context_changed'); END IF;
 SELECT * INTO g FROM public.goals WHERE id=anchor.active_goal_id AND user_id=actor AND is_active=true;
 IF NOT FOUND OR to_jsonb(g) IS DISTINCT FROM p.payload->'goalSnapshot' THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'goal_changed'); END IF;
 IF p.payload->>'policyDigest' IS DISTINCT FROM policy.digest OR p.payload->>'engineVersion' IS DISTINCT FROM policy.engine_version THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'policy_changed'); END IF;
 today:=(clock_timestamp() AT TIME ZONE u.timezone)::date;
 IF p.payload->>'today' IS DISTINCT FROM today::text OR u.date_of_birth IS NULL OR u.sex NOT IN ('female','male') OR u.sex IS NULL OR
    u.date_of_birth>(today-interval '18 years')::date OR u.date_of_birth<(today-interval '100 years')::date THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'profile_review_required'); END IF;
 target:=p.payload->'target';
 IF target IS NULL OR jsonb_typeof(target)<>'object' OR NOT target ?& ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] OR
   EXISTS(SELECT 1 FROM jsonb_object_keys(target) key WHERE key NOT IN ('calories','proteinG','carbsG','fatsG','fiberG')) THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'invalid_target'); END IF;
 FOREACH k IN ARRAY ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] LOOP
  IF jsonb_typeof(target->k) IS DISTINCT FROM 'number' THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'invalid_target'); END IF;
  n:=(target->>k)::numeric;
  IF n<>trunc(n) OR n<0 OR n>10000 THEN RETURN macrogoal_snapshot_review_private.reject_request(p_request,'invalid_target'); END IF;
 END LOOP;
 IF g.daily_calories IS NULL OR g.daily_calories<=0 OR g.protein_g IS NULL OR g.protein_g<0 OR
    g.carbs_g IS NULL OR g.carbs_g<0 OR g.fats_g IS NULL OR g.fats_g<0 OR g.fiber_g IS NULL OR g.fiber_g<0 THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'existing_goal_invalid'); END IF;
 delta:=(target->>'calories')::integer-g.daily_calories;
 -- Bidirectional bound, not a reviewed nutritional policy.
 IF delta=0 OR abs(delta)>policy.max_step_kcal OR abs(delta)>g.daily_calories*policy.max_step_fraction OR
   anchor.baseline_intake_kcal+anchor.accepted_delta_kcal<>g.daily_calories OR
   abs(anchor.accepted_delta_kcal+delta)>policy.max_cumulative_delta_kcal OR
   (target->>'calories')::integer<greatest(policy.min_intake_kcal,CASE WHEN u.sex='female' THEN 1200 ELSE 1500 END) OR
   (target->>'calories')::integer>policy.max_intake_kcal OR (target->>'fiberG')::integer IS DISTINCT FROM g.fiber_g OR
   abs((target->>'calories')::integer-4*(target->>'proteinG')::integer-4*(target->>'carbsG')::integer-9*(target->>'fatsG')::integer)>10 THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'target_limits'); END IF;
 IF anchor.baseline_captured_at>clock_timestamp() OR
    (anchor.last_accepted_at IS NULL AND anchor.baseline_captured_at+make_interval(days=>policy.min_days_between_acceptances)>clock_timestamp()) OR
    (anchor.accepted_delta_kcal<>0 AND anchor.last_accepted_at IS NULL) OR
    (anchor.last_accepted_at IS NOT NULL AND anchor.last_accepted_at+make_interval(days=>policy.min_days_between_acceptances)>clock_timestamp()) THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'review_cooldown'); END IF;
 IF p.expires_at<=clock_timestamp() OR policy.expires_at<=clock_timestamp() OR e.expires_at<=clock_timestamp() OR
    NOT macrogoal_snapshot_review_private.snapshot_time_valid(snapshot->>'capturedAt',clock_timestamp()) THEN
  RETURN macrogoal_snapshot_review_private.reject_request(p_request,'source_expired'); END IF;
 accepted_at:=macrogoal_goal_write_private.accepted_timestamp(g.created_at);
 UPDATE public.goals SET is_active=false WHERE id=g.id AND user_id=actor;
 INSERT INTO public.goals(user_id,goal_type,goal_intensity,target_weight,daily_calories,protein_g,carbs_g,fats_g,fiber_g,is_active,
  loss_rate_lbs_per_week,start_date,start_journey_date,macro_preset,base_daily_calories,last_adaptive_update,created_at,updated_at)
 VALUES(actor,g.goal_type,g.goal_intensity,g.target_weight,(target->>'calories')::integer,(target->>'proteinG')::integer,
  (target->>'carbsG')::integer,(target->>'fatsG')::integer,(target->>'fiberG')::integer,true,g.loss_rate_lbs_per_week,
  g.start_date,g.start_journey_date,g.macro_preset,anchor.baseline_intake_kcal,accepted_at,accepted_at,accepted_at) RETURNING * INTO result;
 UPDATE macrogoal_snapshot_review_private.anchors SET active_goal_id=result.id,accepted_delta_kcal=accepted_delta_kcal+delta,last_accepted_at=accepted_at WHERE id=anchor.id;
 UPDATE macrogoal_snapshot_review_private.proposals SET consumed_request=(p_request->>'requestId')::uuid WHERE id=p.id;
 INSERT INTO macrogoal_snapshot_review_private.receipts(owner_id,request_id,request,status,anchor_id,accepted_goal_id,accepted_goal,acceptance_evidence)
 VALUES(actor,(p_request->>'requestId')::uuid,p_request,'committed',anchor.id,result.id,to_jsonb(result),
 jsonb_build_object('contract','as-of-revalidated-v1','fingerprint',snapshot->>'sourceFingerprint','capturedAt',snapshot->>'capturedAt'));
 RETURN jsonb_build_object('version','adaptive-receipt-v1','status','committed','request',p_request,
   'acceptedGoal',jsonb_build_object('id',result.id,'updatedAt',result.updated_at),'goalState','current');
END $fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA macrogoal_snapshot_review_private FROM PUBLIC,anon,authenticated,service_role;
-- Public wrappers are intentionally NOT created or granted by this candidate.
-- The issuance producer, complete evidence/eligibility workflow, independent SQL
-- concurrency verification and release approval must precede a callable API.
COMMIT;
