-- SOURCE ONLY / ROLLBACK ONLY. Existing tables, no new credentials/table grants.
begin;
set local lock_timeout='500ms';
set local statement_timeout='3s';
create function public.tdee_scheduler_internal_v1(p_request jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,pg_temp set lock_timeout='500ms' as $fn$
declare release_enabled constant boolean:=false;
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
     if reason not in ('coverage_insufficient','target_or_trend_unavailable','within_product_tolerance','rate_uncertainty_unverified','rate_difference_uncertain','complete_days_insufficient','weight_days_insufficient','weight_distribution_insufficient','complete_days_unverified','journey_start_unverified','initial_fourteen_days_not_elapsed','rate_sensitivity_uncertain') then
      raise exception using errcode='22023',message='unknown_hold_reason'; end if;
     if next_hold is null or (next_hold->>'reevaluateAt')::bigint<=at_ms then
      next_hold:=jsonb_build_object('assessedAt',at_ms,'reevaluateAt',at_ms+604800000); end if;
    elsif diagnostic='resolved' then
     if reason<>'same_rate_target' then raise exception using errcode='22023',message='unknown_resolution_reason'; end if;
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
end $fn$;
revoke all on function public.tdee_scheduler_internal_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.tdee_scheduler_internal_v1(jsonb) to service_role;
-- No table grants, no user role, no credentials, no cron, no release activation.
rollback;
