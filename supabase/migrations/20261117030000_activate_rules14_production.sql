-- SOURCE ONLY. Coordinated activation; NOT executed.
BEGIN;
SET LOCAL lock_timeout='500ms';
DO $fence$ BEGIN
 IF md5(pg_get_functiondef('public.tdee_accept_rules14_proposal_v1(jsonb)'::regprocedure)) IS DISTINCT FROM '8f417af95025eee82f6a3e2b94244157' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_context_v1(uuid)'::regprocedure)) IS DISTINCT FROM '1725e71e5e024385f809f1dc555e27f8' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_current_selection_v1(uuid,text)'::regprocedure)) IS DISTINCT FROM '67e36dac20ed270cb4fbf73d467f10a3' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_issue_rules14_proposal_v1(uuid,jsonb)'::regprocedure)) IS DISTINCT FROM 'bcc33b3255b0d408fe3840d10a7e49b1' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_rate_anchor_append_v1(uuid,bigint,jsonb)'::regprocedure)) IS DISTINCT FROM 'fb9284b39286f488df74e53b1f8641b4' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_rate_anchor_source_v1(uuid)'::regprocedure)) IS DISTINCT FROM 'a6cc15ba3ec026c1fb719577fc212bee' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_rate_issue_outcome_v1(uuid,text,uuid,bigint)'::regprocedure)) IS DISTINCT FROM '2af90f35eaab052d5301a7834485c3ce' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_rules14_anchor_outcome_v1(uuid,text,uuid,bigint)'::regprocedure)) IS DISTINCT FROM 'ef11a34b1899080e63d7c2322280095c' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_rules14_source_v1(uuid,jsonb)'::regprocedure)) IS DISTINCT FROM '7ed5e6124892b73a9ec15c60ea7c20ff' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_internal_select_due_v1(integer,bigint)'::regprocedure)) IS DISTINCT FROM 'c74c31a9350bfd9f277014cd114d0f45' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_read_rules14_acceptance_receipt_v1(jsonb)'::regprocedure)) IS DISTINCT FROM 'af05651181cebffc0928aa1aaa69725a' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_rules14_acceptance_chain_v1()'::regprocedure)) IS DISTINCT FROM 'd57725efe2e78ea0ebd004465388e559' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_rules14_screening_v1(text,jsonb)'::regprocedure)) IS DISTINCT FROM 'ddec5e112fdb6dcc80bf975489c9e093' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
 IF md5(pg_get_functiondef('public.tdee_scheduler_internal_v1(jsonb)'::regprocedure)) IS DISTINCT FROM '1626998bc1f041864de4972bb11cb78c' THEN RAISE EXCEPTION 'rules14_activation_baseline_changed'; END IF;
END $fence$;
CREATE OR REPLACE FUNCTION public.tdee_accept_rules14_proposal_v1(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE actor uuid:=tdee_rules14_private.assert_rate_request(p_request);
BEGIN
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_acceptance_off');END IF;
 RETURN tdee_rules14_private.accept_rate_proposal(p_request);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_context_v1(p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE worker_enabled constant boolean:=true;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 -- OFF before profile, entitlement, scheduler state or nutrition reads.
 IF NOT worker_enabled THEN RETURN jsonb_build_object('status','disabled','actionable',false); END IF;
 IF p_owner IS NULL OR NOT EXISTS(SELECT 1 FROM macrogoal_observed_private.settings WHERE user_id=p_owner AND enabled=true) THEN
  RETURN jsonb_build_object('status','not_enrolled','actionable',false); END IF;
 RETURN tdee_scheduler_private.read_context(p_owner);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_current_selection_v1(p_owner uuid, p_context_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE worker_enabled constant boolean:=true; selected jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 IF NOT worker_enabled THEN RETURN jsonb_build_object('status','disabled','actionable',false); END IF;
 IF p_owner IS NULL OR p_context_revision IS NULL OR p_context_revision!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 selected:=tdee_scheduler_private.current_selection(p_owner);
 IF selected IS NULL OR selected->>'contextRevision' IS DISTINCT FROM p_context_revision THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 RETURN jsonb_build_object('status','current','actionable',false,'capturedAt',floor(extract(epoch FROM statement_timestamp())*1000),'selection',selected-'timezone'-'localDate'-'engineVersion'-'policyBinding');
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_issue_rules14_proposal_v1(p_owner uuid, p_record jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_issuance_off');END IF;
 RETURN tdee_rules14_private.issue_proposal(p_owner,p_record);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_rate_anchor_append_v1(p_owner uuid, p_expected_version bigint, p_anchor jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required'; END IF;
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','anchor_persistence_contract_off'); END IF;
 RETURN tdee_rate_anchor_private.append_initial(p_owner,p_expected_version,p_anchor);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_rate_anchor_source_v1(p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required'; END IF;
 -- Immutable OFF before profile, receipt, or anchor reads. No request actor impersonation.
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_anchor_source_off'); END IF;
 RETURN tdee_rate_anchor_private.read_source(p_owner);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_rate_issue_outcome_v1(p_owner uuid, p_scope text, p_claim uuid, p_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE rules_exists boolean;legacy_exists boolean;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_issuance_off');END IF;
 SELECT EXISTS(SELECT 1 FROM tdee_rules14_private.proposals WHERE owner_id=p_owner AND id=p_claim),EXISTS(SELECT 1 FROM tdee_rate_record_private.proposals WHERE owner_id=p_owner AND id=p_claim) INTO rules_exists,legacy_exists;
 IF rules_exists AND legacy_exists THEN RETURN jsonb_build_object('status','unverified','actionable',false);END IF;
 IF rules_exists THEN
 IF p_revision IS NULL THEN RETURN tdee_rules14_private.read_issue_outcome(p_owner,p_scope,p_claim);END IF;
 RETURN tdee_rules14_private.reconcile_issued(p_owner,p_scope,p_claim,p_revision);
 END IF;
 IF p_revision IS NULL THEN RETURN tdee_rate_record_private.read_issue_outcome(p_owner,p_scope,p_claim);END IF;
 RETURN tdee_rate_record_private.reconcile_issued(p_owner,p_scope,p_claim,p_revision);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_rules14_anchor_outcome_v1(p_owner uuid, p_scope text, p_claim uuid, p_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rules14_anchor_reconciliation_off');END IF;
 RETURN tdee_rules14_private.reconcile_anchor(p_owner,p_scope,p_claim,p_revision);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_rules14_source_v1(p_owner uuid, p_policy jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required';END IF;
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rules14_off');END IF;
 RETURN tdee_rules14_private.read_source(p_owner,p_policy);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_internal_select_due_v1(p_limit integer, p_deadline_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE worker_enabled constant boolean:=true; cursor_owner uuid; candidate record; selected jsonb; owners jsonb:='[]'::jsonb;
 scanned integer:=0; at_ms bigint; cursor_revision bigint; resume_owner uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 IF NOT worker_enabled THEN RETURN jsonb_build_object('status','disabled','actionable',false); END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>25 OR p_deadline_ms IS NULL OR p_deadline_ms<=at_ms OR p_deadline_ms>at_ms+5000 THEN
  RETURN jsonb_build_object('status','invalid_budget','actionable',false); END IF;
 -- Singleton serializes cursor only, no owner data lock or authority grant.
 SELECT after_owner,revision INTO cursor_owner,cursor_revision FROM tdee_scheduler_private.selector_cursor WHERE singleton=true FOR UPDATE NOWAIT;
 IF NOT FOUND OR cursor_revision>=9223372036854775806 THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 FOR candidate IN SELECT user_id FROM macrogoal_observed_private.settings
  WHERE enabled=true AND (cursor_owner IS NULL OR user_id>cursor_owner) ORDER BY user_id LIMIT 250
 LOOP
  EXIT WHEN floor(extract(epoch FROM clock_timestamp())*1000)>=p_deadline_ms;
  scanned:=scanned+1;cursor_owner:=candidate.user_id;
  selected:=tdee_scheduler_private.current_selection(candidate.user_id);
  IF selected IS NULL THEN CONTINUE; END IF;
  -- Unresolved claims across ANY scope require reconciliation; skip and advance,
  -- never let the first unresolved/completed owners starve those later in keyspace.
  IF EXISTS(SELECT 1 FROM tdee_scheduler_private.ledger l WHERE l.owner_id=candidate.user_id AND
    l.record->>'status' IS DISTINCT FROM 'completed' AND l.record->>'status' IS DISTINCT FROM 'retryable') THEN
   -- Enqueue only a single current-scope claim with durable insertion evidence.
   -- This is not proof of completion: worker's bounded reconciler revalidates all.
   IF (SELECT count(*) FROM tdee_scheduler_private.ledger l WHERE l.owner_id=candidate.user_id AND l.record->>'status' NOT IN ('completed','retryable'))<>1 OR
    NOT EXISTS(SELECT 1 FROM tdee_scheduler_private.ledger l
     WHERE l.owner_id=candidate.user_id AND l.context_revision=selected->>'contextRevision' AND l.record->>'status' IN ('claimed','uncertain') AND
     ((selected->>'engineVersion'='rules14-v1' AND EXISTS(SELECT 1 FROM tdee_rules14_private.issuance_journal j WHERE j.owner_id=l.owner_id AND j.proposal_id=(l.record->>'claimId')::uuid)) OR
      (selected->>'engineVersion' IS NULL AND EXISTS(SELECT 1 FROM tdee_rate_record_private.issuance_journal j WHERE j.owner_id=l.owner_id AND j.proposal_id=(l.record->>'claimId')::uuid))))
    THEN CONTINUE;END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM tdee_scheduler_private.ledger l WHERE l.owner_id=candidate.user_id AND
    l.context_revision=selected->>'contextRevision' AND
    ((l.record->>'claimedAt')::numeric>floor(extract(epoch FROM clock_timestamp())*1000) OR
     (l.record->>'finishedAt')::numeric>floor(extract(epoch FROM clock_timestamp())*1000) OR
     (l.record->>'status'='completed' AND l.record->>'localDate'>=selected->>'localDate'))) THEN CONTINUE; END IF;
  IF resume_owner IS NULL THEN resume_owner:=candidate.user_id; END IF;
  owners:=owners||jsonb_build_array(jsonb_build_object('ownerId',candidate.user_id,'contextRevision',selected->>'contextRevision'));
  EXIT WHEN jsonb_array_length(owners)>=p_limit;
 END LOOP;
 -- End-of-keyspace starts a fresh bounded scan on NEXT call; never unbounded wrap.
 IF scanned=0 AND floor(extract(epoch FROM clock_timestamp())*1000)<p_deadline_ms THEN cursor_owner:=NULL; END IF;
 -- Rotate past the FIRST returned owner, not the full batch: if a worker's
 -- deadline/provider failure stops at the first item, the same bad head cannot
 -- monopolize every subsequent batch after a keyspace wrap.
 UPDATE tdee_scheduler_private.selector_cursor SET after_owner=coalesce(resume_owner,cursor_owner),revision=revision+1 WHERE singleton=true;
 RETURN jsonb_build_object('status','selected','actionable',false,'capturedAt',floor(extract(epoch FROM clock_timestamp())*1000),'owners',owners,'scanned',scanned);
EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('status','busy','actionable',false);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_read_rules14_acceptance_receipt_v1(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE actor uuid:=tdee_rules14_private.assert_rate_request(p_request);saved jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id WHERE u.id=actor AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=statement_timestamp())) THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_unavailable'; END IF;
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_receipt_off'); END IF;
 saved:=tdee_rules14_private.read_exact_request(actor,(p_request->>'requestId')::uuid,p_request);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 -- Not found is not proof an earlier in-flight transaction cannot commit later.
 RETURN jsonb_build_object('version','rules14-acceptance-receipt-v1','status','not_found','actionable',false,'request',p_request);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_rules14_acceptance_chain_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_chain_off'); END IF;
 RETURN tdee_rules14_private.read_chain(actor);
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_rules14_screening_v1(p_action text, p_request jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET lock_timeout TO '500ms'
AS $function$
DECLARE actor uuid:=auth.uid();r tdee_rules14_private.screenings;b jsonb;u public.users;next_version bigint;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=actor AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=clock_timestamp())) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';END IF;
 IF NOT true THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rules14_screening_off');END IF;
 IF p_action IS NULL OR p_action NOT IN ('read','confirm','receipt') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_action_invalid';END IF;
 SELECT * INTO STRICT u FROM public.users WHERE id=actor FOR UPDATE;b:=tdee_rules14_private.screening_binding(actor);
 IF p_action='read' THEN IF p_request IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_request_invalid';END IF;RETURN tdee_rules14_private.read_screening(actor);END IF;
 IF NOT tdee_rules14_private.screening_request_valid(p_request) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_request_invalid';END IF;
 SELECT * INTO r FROM tdee_rules14_private.screenings WHERE owner_id=actor AND request_id=(p_request->>'requestId')::uuid;
 IF FOUND THEN
 IF r.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_request_reused';END IF;
 RETURN jsonb_build_object('version','rules-screening-receipt-v1','status','recorded','request',r.request,'screening',tdee_rules14_private.screening_replay_envelope(r,b,clock_timestamp(),(SELECT max(row_version) FROM tdee_rules14_private.screenings WHERE owner_id=actor)));END IF;
 IF p_action='receipt' THEN RETURN jsonb_build_object('version','rules-screening-receipt-v1','status','not_found','request',p_request);END IF;
 IF p_request->>'response'='eligible' AND (u.date_of_birth IS NULL OR date_part('year',age((clock_timestamp() AT TIME ZONE u.timezone)::date,u.date_of_birth)) NOT BETWEEN 19 AND 100) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='screening_age_ineligible';END IF;
 SELECT coalesce(max(row_version),0)+1 INTO next_version FROM tdee_rules14_private.screenings WHERE owner_id=actor;
 INSERT INTO tdee_rules14_private.screenings(owner_id,request_id,row_version,request,response,profile_binding,journey_binding,profile_updated_at,accepted_at,expires_at)
 VALUES(actor,(p_request->>'requestId')::uuid,next_version,p_request,p_request->>'response',p_request->>'profileBinding',p_request->>'journeyBinding',(p_request->>'profileUpdatedAt')::timestamptz,clock_timestamp(),clock_timestamp()+interval '30 days') RETURNING * INTO r;
 RETURN jsonb_build_object('version','rules-screening-receipt-v1','status','recorded','request',r.request,'screening',tdee_rules14_private.screening_replay_envelope(r,b,clock_timestamp(),(SELECT max(row_version) FROM tdee_rules14_private.screenings WHERE owner_id=actor)));
END $function$;

CREATE OR REPLACE FUNCTION public.tdee_scheduler_internal_v1(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET lock_timeout TO '500ms'
AS $function$
declare release_enabled constant boolean:=true;
 owner uuid; scope text; zone text; op text; claim uuid; expected bigint; local_day text; daily_key text;
 at_ms bigint; r tdee_scheduler_private.ledger; receipt tdee_scheduler_private.receipt;
 selected jsonb; next_record jsonb; next_hold jsonb; next_revision bigint; diagnostic text; reason text;
begin
 -- Caller is verified DB service role, NOT a decoded client-supplied JWT claim.
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception using errcode='42501',message='internal_service_required'; end if;
 if not release_enabled then return jsonb_build_object('version','scheduler-rpc-v1','status','blocked','reason','safety_review_required'); end if;
 if jsonb_typeof(p_request) is distinct from 'object' then raise exception using errcode='22023',message='invalid_request'; end if;
 if octet_length(p_request::text)>2048 or exists(select 1 from jsonb_object_keys(p_request) k where k not in
 ('action','ownerId','contextRevision','timezone','expectedRevision','claimId','localDate','key','diagnostic','reason')) then
 raise exception using errcode='22023',message='invalid_request'; end if;
 owner:=(p_request->>'ownerId')::uuid; scope:=p_request->>'contextRevision'; zone:=p_request->>'timezone';op:=p_request->>'action';
 if owner is null or scope is null or scope !~ '^[a-f0-9]{64}$' or zone is null or length(zone)>100 or
 not exists(select 1 from pg_timezone_names where name=zone) or op is null or op not in ('load','claim','complete','uncertain','reconcile') then
 raise exception using errcode='22023',message='invalid_scope_or_action'; end if;
 -- Absent-row creation and any current/old-scope race serialize on same owner.
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 -- One fixed server timestamp after lock acquisition. No caller timestamp/TTL.
 at_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 local_day:=to_char(to_timestamp(at_ms::numeric/1000) at time zone zone,'YYYY-MM-DD');
 daily_key:='["daily-assessment-v1","'||owner::text||'","'||scope||'","'||local_day||'"]';
 select * into r from tdee_scheduler_private.ledger where owner_id=owner and context_revision=scope for update;
 if found and r.record->>'timezone' is distinct from zone then raise exception using errcode='22023',message='scope_changed'; end if;
 if op='load' then return jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',r.record,'hold',r.hold); end if;
 if jsonb_typeof(p_request->'expectedRevision') is distinct from 'number' or
 (p_request->>'expectedRevision')::numeric<>trunc((p_request->>'expectedRevision')::numeric) or
 (p_request->>'expectedRevision')::numeric not between 0 and 9007199254740988 then raise exception using errcode='22023',message='invalid_revision'; end if;
 expected:=(p_request->>'expectedRevision')::bigint;claim:=(p_request->>'claimId')::uuid;
 if claim is null or coalesce(r.revision,0)<>expected then raise exception using errcode='40001',message='claim_conflict'; end if;
 if r.record is not null and ((r.record->>'claimedAt')::bigint>at_ms or (r.record->>'finishedAt')::bigint>at_ms) then
 raise exception using errcode='22023',message='clock_moved_backwards'; end if;
 next_revision:=expected+1;next_hold:=r.hold;
 if op='claim' then
  -- Atomic admission against current protected scope, not only earlier HTTP selection.
  selected:=tdee_scheduler_private.current_selection(owner);
  if selected is null or selected->>'contextRevision' is distinct from scope or selected->>'timezone' is distinct from zone then
   raise exception using errcode='40001',message='current_selection_changed'; end if;
  if exists(select 1 from tdee_scheduler_private.ledger l where l.owner_id=owner and l.context_revision<>scope and
   l.record->>'status' is distinct from 'completed' and l.record->>'status' is distinct from 'retryable') then
   raise exception using errcode='40001',message='unfinished_owner_claim'; end if;
  -- Selector filtering is not atomic with claim: fence all old scopes here.
  if exists(select 1 from tdee_scheduler_private.ledger l where l.owner_id=owner and
   l.context_revision<>scope and l.record->>'status' in ('claimed','uncertain')) then
   raise exception using errcode='40001',message='unresolved_prior_scope'; end if;
  if p_request->>'localDate' is distinct from local_day or p_request->>'key' is distinct from daily_key then
   raise exception using errcode='22023',message='calendar_changed'; end if;
  if r.record is not null and (r.record->>'status' not in ('completed','retryable') or
   (r.record->>'status'='completed' and r.record->>'localDate'>=local_day) or
   r.record->>'localDate'>local_day or r.record->>'claimId'=claim::text) then
   raise exception using errcode='40001',message='unfinished_or_duplicate_claim'; end if;
  if exists(select 1 from tdee_scheduler_private.receipt where owner_id=owner and context_revision=scope and claim_id=claim) then
   raise exception using errcode='22023',message='claim_identity_reused'; end if;
  next_record:=jsonb_build_object('version','daily-assessment-ledger-v1','ownerId',owner,'contextRevision',scope,'timezone',zone,
   'localDate',local_day,'key',daily_key,'revision',next_revision,'status','claimed','claimId',claim,'claimedAt',at_ms,'finishedAt',null);
 else
  if r.record is null or r.record->>'claimId' is distinct from claim::text or p_request->>'key' is distinct from r.record->>'key' then
   raise exception using errcode='40001',message='claim_not_current'; end if;
  if op='reconcile' then
   select * into receipt from tdee_scheduler_private.receipt where owner_id=owner and context_revision=scope and claim_id=claim;
   if not found or receipt.daily_key is distinct from r.record->>'key' or receipt.observed_at>at_ms or
    receipt.observed_at<greatest((r.record->>'claimedAt')::bigint,coalesce((r.record->>'finishedAt')::bigint,0)) then raise exception using errcode='22023',message='authoritative_reconciliation_required'; end if;
   if r.record->>'status'='completed' and receipt.outcome='completed' then
    return jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',r.record,'hold',r.hold); end if;
   if r.record->>'status' not in ('claimed','uncertain') then raise exception using errcode='22023',message='invalid_reconciliation'; end if;
   next_record:=r.record||jsonb_build_object('status',case when receipt.outcome='completed' then 'completed' else 'retryable' end,'finishedAt',at_ms,'revision',next_revision);
  else
   if r.record->>'status' is distinct from 'claimed' then raise exception using errcode='40001',message='claim_not_current'; end if;
   if op='complete' then
    diagnostic:=p_request->>'diagnostic';reason:=p_request->>'reason';
    if diagnostic is null or diagnostic not in ('uncertain','resolved','preserve') or reason is null or length(reason)>128 then
     raise exception using errcode='22023',message='verified_diagnostic_required'; end if;
    if diagnostic='uncertain' then
     if reason not in ('coverage_insufficient','target_or_trend_unavailable','within_product_tolerance','rate_uncertainty_unverified','rate_difference_uncertain','complete_days_insufficient','weight_days_insufficient','weight_distribution_insufficient','complete_days_unverified','journey_start_unverified','initial_fourteen_days_not_elapsed','rate_sensitivity_uncertain','rules_screening_required','clinical_eligibility_required','logged_intake_mean_unavailable','intake_sensitivity_uncertain','intake_target_adherence_gap','total_deficit_limit','policy_limit_or_subincrement','protein_reference_unavailable','individual_reference_weight_required') then
      raise exception using errcode='22023',message='unknown_hold_reason'; end if;
     if next_hold is null or (next_hold->>'reevaluateAt')::bigint<=at_ms then
      next_hold:=jsonb_build_object('assessedAt',at_ms,'reevaluateAt',at_ms+604800000); end if;
    elsif diagnostic='resolved' then
     if reason='reviewed_proposal_stored' then
      selected:=tdee_scheduler_private.current_selection(owner);
      if selected is null or selected->>'contextRevision' is distinct from scope or selected->>'timezone' is distinct from zone then
       raise exception using errcode='40001',message='current_selection_changed'; end if;
      if not exists(select 1 from tdee_rate_record_private.proposals p where p.owner_id=owner and p.id=claim
       and p.expires_at_ms>at_ms and p.record#>>'{payload,windowEndExclusive}'=local_day
       and p.record#>>'{payload,goalSnapshot,id}'=(select g.id::text from public.goals g where g.user_id=owner and g.is_active=true)) then
       raise exception using errcode='22023',message='issued_proposal_receipt_required'; end if;
     elsif reason='rules14_proposal_stored' then
      selected:=tdee_scheduler_private.current_selection(owner);
      if selected is null or selected->>'contextRevision' is distinct from scope or selected->>'timezone' is distinct from zone then
       raise exception using errcode='40001',message='current_selection_changed'; end if;
      if not exists(select 1 from tdee_rules14_private.proposals p join tdee_rules14_private.issuance_journal j on j.owner_id=p.owner_id and j.proposal_id=p.id and j.proposal_digest=p.digest
       where p.owner_id=owner and p.id=claim and p.expires_at_ms>at_ms and j.recorded_at_ms between (r.record->>'claimedAt')::bigint and at_ms
       and p.record->>'version'='rules14-proposal-record-v1' and p.record#>>'{payload,windowEndExclusive}'=local_day
       and p.record#>'{payload,goalSnapshot}'=(select to_jsonb(g) from public.goals g where g.user_id=owner and g.is_active=true)
       and not exists(select 1 from tdee_rate_record_private.proposals oldp where oldp.owner_id=owner and oldp.id=claim)) then
       raise exception using errcode='22023',message='issued_rules14_receipt_required';end if;
     elsif reason<>'same_rate_target' then raise exception using errcode='22023',message='unknown_resolution_reason'; end if;
     next_hold:=null;
    end if;
    insert into tdee_scheduler_private.receipt(owner_id,context_revision,claim_id,daily_key,outcome,observed_at)
    values(owner,scope,claim,r.record->>'key','completed',at_ms);
   end if;
   next_record:=r.record||jsonb_build_object('status',case when op='complete' then 'completed' else 'uncertain' end,'finishedAt',at_ms,'revision',next_revision);
  end if;
 end if;
 if r.record is null then
  insert into tdee_scheduler_private.ledger(owner_id,context_revision,revision,record,hold) values(owner,scope,next_revision,next_record,next_hold);
 else
  update tdee_scheduler_private.ledger set revision=next_revision,record=next_record,hold=next_hold
  where owner_id=owner and context_revision=scope and revision=expected;
  if not found then raise exception using errcode='40001',message='claim_conflict'; end if;
 end if;
 return jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',next_record,'hold',next_hold);
end $function$;


-- Administrative product policy, not clinical validation.

SET LOCAL lock_timeout='500ms';
DO $f$ BEGIN IF EXISTS(SELECT 1 FROM tdee_rules14_private.policy_versions) THEN RAISE EXCEPTION 'policy_registration_changed_review_required';END IF;END $f$;
INSERT INTO tdee_rules14_private.policy_versions(version,revision,decision,document,canonical_content,digest,expires_at) VALUES
('rules14-general-adult-v1',1,'enabled',$policy${"carbs_min_g":130,"engine_version":"rules14-v1","fat_max_fraction":0.35,"fat_min_fraction":0.2,"increment_kcal":25,"max_cumulative_delta_kcal":400,"max_intake_kcal":5000,"max_step_fraction":0.1,"max_step_kcal":200,"max_total_deficit_fraction":0.2,"max_total_deficit_kcal":500,"min_days_between_acceptances":14,"min_intake_kcal":1500,"protein_max_g_per_kg":2,"protein_min_g_per_kg_loss":1.4,"protein_min_g_per_kg_other":0.8,"scope":"screened-adult-general-v1"}$policy$::jsonb,$policy${"carbs_min_g":130,"engine_version":"rules14-v1","fat_max_fraction":0.35,"fat_min_fraction":0.2,"increment_kcal":25,"max_cumulative_delta_kcal":400,"max_intake_kcal":5000,"max_step_fraction":0.1,"max_step_kcal":200,"max_total_deficit_fraction":0.2,"max_total_deficit_kcal":500,"min_days_between_acceptances":14,"min_intake_kcal":1500,"protein_max_g_per_kg":2,"protein_min_g_per_kg_loss":1.4,"protein_min_g_per_kg_other":0.8,"scope":"screened-adult-general-v1"}$policy$,'65c9dd0d1ed3c0f5ef9fede9e76c5683ea05ca440e21dcfbe35fa40b8fdc063e','2027-11-17T00:00:00Z');

COMMIT;
