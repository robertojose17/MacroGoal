-- Source-only inactive selector. No new credentials, impersonation, policy or review.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='5s';
CREATE INDEX tdee_scheduler_enabled_owner_scan ON macrogoal_observed_private.settings(user_id) WHERE enabled=true;
CREATE INDEX tdee_scheduler_unresolved_owner_scan ON tdee_scheduler_private.ledger(owner_id) WHERE record->>'status' IS DISTINCT FROM 'completed' AND record->>'status' IS DISTINCT FROM 'retryable';
CREATE TABLE tdee_scheduler_private.selector_cursor (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 after_owner uuid,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
ALTER TABLE tdee_scheduler_private.selector_cursor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tdee_scheduler_private.selector_cursor FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO tdee_scheduler_private.selector_cursor(singleton) VALUES(true);

CREATE FUNCTION tdee_scheduler_private.current_selection(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $scope$
DECLARE u public.users; s macrogoal_observed_private.settings; e macrogoal_readiness_private.attestations;
 account record; g public.goals; n bigint; t date; pb text; jb text; rev text; at_time timestamptz:=statement_timestamp();
BEGIN
 IF p_owner IS NULL THEN RETURN NULL; END IF;
 -- Never fetch password/token/account-secret columns, even internally.
 SELECT deleted_at,banned_until,is_anonymous INTO account FROM auth.users WHERE id=p_owner;
 IF NOT FOUND OR account.deleted_at IS NOT NULL OR account.is_anonymous IS DISTINCT FROM false OR
  (account.banned_until IS NOT NULL AND account.banned_until>at_time) THEN RETURN NULL; END IF;
 SELECT * INTO s FROM macrogoal_observed_private.settings WHERE user_id=p_owner AND enabled=true;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO u FROM public.users WHERE id=p_owner;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=u.timezone) THEN RETURN NULL; END IF;
 t:=(at_time AT TIME ZONE u.timezone)::date;
 IF u.date_of_birth IS NULL OR NOT isfinite(u.date_of_birth) OR u.date_of_birth>(t-interval '19 years')::date OR u.date_of_birth<=(t-interval '101 years')::date OR u.date_of_birth<=date '1900-01-01' THEN RETURN NULL; END IF;
 jb:=encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'start',u.journey_start_date,'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex');
 pb:=encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'dob',u.date_of_birth,'sex',u.sex,'journey',jb,'timezone',u.timezone)::text,'UTF8')),'hex');
 SELECT * INTO e FROM macrogoal_readiness_private.attestations WHERE owner_id=p_owner;
 IF NOT FOUND OR e.version IS DISTINCT FROM 'general-adult-v1' OR e.response IS DISTINCT FROM 'criteria_confirmed' OR
  e.profile_binding IS DISTINCT FROM pb OR e.journey_binding IS DISTINCT FROM jb OR
  e.accepted_at IS NULL OR e.expires_at IS NULL OR NOT isfinite(e.accepted_at) OR NOT isfinite(e.expires_at) OR
  e.accepted_at>at_time OR e.expires_at<=at_time THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM (SELECT id FROM public.goals WHERE user_id=p_owner AND is_active=true ORDER BY id LIMIT 2) q;
 IF n<>1 THEN RETURN NULL; END IF;
 SELECT * INTO g FROM public.goals WHERE user_id=p_owner AND is_active=true ORDER BY id LIMIT 1;
 -- Same source statement; digest excludes rolling meals, weights and capture time.
 -- Attestation identity included so replacing/reconfirming consent starts a new scope.
 rev:=encode(sha256(convert_to(jsonb_build_object('contract','internal-daily-selection-v1','owner',p_owner,
  'goal',to_jsonb(g),'profile',jsonb_build_object('updatedAt',u.updated_at,'dob',u.date_of_birth,'sex',u.sex,'timezone',u.timezone,'journey',jb),
  'settings',jsonb_build_object('enabled',s.enabled,'reviewDay',s.review_day,'startedOn',s.started_on,'updatedAt',s.updated_at),
  'consent',jsonb_build_object('version',e.version,'response',e.response,'profileBinding',pb,'journeyBinding',jb,'acceptedAt',e.accepted_at,'expiresAt',e.expires_at))::text,'UTF8')),'hex');
 RETURN jsonb_build_object('ownerId',p_owner,'contextRevision',rev,'timezone',u.timezone,'localDate',t,'enrolled',true,'accountActive',true);
END $scope$;
REVOKE ALL ON FUNCTION tdee_scheduler_private.current_selection(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.tdee_internal_current_selection_v1(p_owner uuid,p_context_revision text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $current$
DECLARE worker_enabled constant boolean:=false; selected jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 IF NOT worker_enabled THEN RETURN jsonb_build_object('status','disabled','actionable',false); END IF;
 IF p_owner IS NULL OR p_context_revision IS NULL OR p_context_revision!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 selected:=tdee_scheduler_private.current_selection(p_owner);
 IF selected IS NULL OR selected->>'contextRevision' IS DISTINCT FROM p_context_revision THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 RETURN jsonb_build_object('status','current','actionable',false,'capturedAt',floor(extract(epoch FROM statement_timestamp())*1000),'selection',selected-'timezone'-'localDate');
END $current$;
REVOKE ALL ON FUNCTION public.tdee_internal_current_selection_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_current_selection_v1(uuid,text) TO service_role;

CREATE FUNCTION public.tdee_internal_select_due_v1(p_limit integer,p_deadline_ms bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $select$
DECLARE worker_enabled constant boolean:=false; cursor_owner uuid; candidate record; selected jsonb; owners jsonb:='[]'::jsonb;
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
    l.record->>'status' IS DISTINCT FROM 'completed' AND l.record->>'status' IS DISTINCT FROM 'retryable') THEN CONTINUE; END IF;
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
END $select$;
REVOKE ALL ON FUNCTION public.tdee_internal_select_due_v1(integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_select_due_v1(integer,bigint) TO service_role;
ROLLBACK;
