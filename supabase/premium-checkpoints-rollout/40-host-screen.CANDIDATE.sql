-- Applied 2026-11-11 as migration 20261111202019_premium_checkpoint_host_screen_v1.
-- Exact reviewed source retained; preflight deliberately rejects reapplication. Preserves the existing RPC ACL.
-- Host screen stays in the existing immutable JSON payload. No columns, backfill or new access.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
BEGIN
 IF md5(pg_get_functiondef('public.record_private_checkpoint_v1(uuid,jsonb)'::regprocedure)) <> 'fd6c09bfb2d88257e82b3924e74393ed' THEN
  RAISE EXCEPTION 'checkpoint RPC changed since review; re-read and reconcile before rollout';
 END IF;
END;
$preflight$;
CREATE OR REPLACE FUNCTION public.record_private_checkpoint_v1(p_user_id uuid, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE prior jsonb; received timestamptz := clock_timestamp();
BEGIN
 IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
  RAISE EXCEPTION 'service role required' USING ERRCODE='42501';
 END IF;
 -- Full closed detail validation is performed by the reviewed Edge protocol before this service-only boundary.
 IF p_user_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
 OR p_payload->>'namespace' IS DISTINCT FROM 'premium_checkpoint'
 OR p_payload->'schema_version' IS DISTINCT FROM '1'::jsonb
 OR jsonb_typeof(p_payload->'flow') IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_payload->'detail') IS DISTINCT FROM 'object'
 OR (p_payload - ARRAY['namespace','schema_version','eventId','occurredAt','flow','platform','detail']) <> '{}'::jsonb
 OR ((p_payload->'flow') - ARRAY['flowId','source','screen']) <> '{}'::jsonb
 OR ((p_payload->'flow') ? 'screen' AND (jsonb_typeof(p_payload#>'{flow,screen}') IS DISTINCT FROM 'string'
  OR p_payload#>>'{flow,screen}' NOT IN ('home','dashboard','check_ins','profile','unknown')))
 OR p_payload->>'eventId' IS NULL OR p_payload->>'occurredAt' IS NULL THEN
  RAISE EXCEPTION 'invalid checkpoint' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 72631));
 IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RETURN 'account_unavailable'; END IF;
 -- Auth success does not guarantee profile creation. Reject explicitly without repairing accounts.
 IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_user_id) THEN RETURN 'profile_unavailable'; END IF;
 SELECT payload INTO prior FROM macrogoal_checkpoints_private.checkpoint_events
 WHERE user_id=p_user_id AND event_id=p_payload->>'eventId';
 IF FOUND THEN RETURN CASE WHEN prior=p_payload THEN 'duplicate' ELSE 'conflict' END; END IF;
 IF (p_payload->>'occurredAt')::timestamptz < received-interval '1 day'
 OR (p_payload->>'occurredAt')::timestamptz > received+interval '5 minutes' THEN
  RAISE EXCEPTION 'invalid checkpoint time' USING ERRCODE='22023';
 END IF;
 IF EXISTS (SELECT 1 FROM macrogoal_checkpoints_private.checkpoint_events
 WHERE user_id=p_user_id AND flow_id=p_payload#>>'{flow,flowId}' AND (source IS DISTINCT FROM p_payload#>>'{flow,source}'
  OR payload#>'{flow,screen}' IS DISTINCT FROM p_payload#>'{flow,screen}')) THEN RETURN 'conflict'; END IF;
 IF (SELECT count(*) FROM macrogoal_checkpoints_private.checkpoint_events
 WHERE user_id=p_user_id AND received_at>=received-interval '1 minute')>=120 THEN RETURN 'rate_limited'; END IF;
 INSERT INTO macrogoal_checkpoints_private.checkpoint_events(user_id,event_id,flow_id,source,platform,name,attempt_id,occurred_at,received_at,payload)
 VALUES(p_user_id,p_payload->>'eventId',p_payload#>>'{flow,flowId}',p_payload#>>'{flow,source}',p_payload->>'platform',p_payload#>>'{detail,name}',p_payload#>>'{detail,attemptId}',(p_payload->>'occurredAt')::timestamptz,received,p_payload);
 RETURN 'accepted';
END;
$function$
;
COMMIT;
