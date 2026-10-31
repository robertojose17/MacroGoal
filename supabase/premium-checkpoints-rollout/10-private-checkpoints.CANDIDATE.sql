-- REVIEW CANDIDATE ONLY. Not applied; outside automatic migration directories.
-- Atomic additive scope: one private table and one service-only insertion RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA macrogoal_checkpoints_private;
REVOKE ALL ON SCHEMA macrogoal_checkpoints_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA macrogoal_checkpoints_private TO service_role;
CREATE TABLE macrogoal_checkpoints_private.checkpoint_events (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 event_id text NOT NULL CHECK (event_id ~ '^[A-Za-z0-9_-]{8,96}$'),
 flow_id text NOT NULL CHECK (flow_id ~ '^[A-Za-z0-9_-]{8,96}$'),
 source text NOT NULL CHECK (source IN ('unknown','onboarding_complete','settings_upgrade','home_recipe_limit','home_ai_plan','coach_preview','chatbot_upgrade','ai_meal_estimator','ai_meal_planner','community_club','template_plan','feature_gate','floating_badge','coach_daily_saved','coach_daily_preview','coach_meal_saved','coach_meal_preview','coach_conversation')),
 platform text NOT NULL CHECK (platform IN ('ios','android','web')),
 name text NOT NULL CHECK (name IN ('inline_impression','entrypoint_clicked','offer_displayed','purchase_attempt','purchase_result','restore_attempt','restore_result')),
 attempt_id text CHECK (attempt_id ~ '^[A-Za-z0-9_-]{8,96}$'),
 occurred_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=12288),
 PRIMARY KEY(user_id,event_id),
 CHECK ((name IN ('purchase_attempt','purchase_result','restore_attempt','restore_result')) = (attempt_id IS NOT NULL))
);
ALTER TABLE macrogoal_checkpoints_private.checkpoint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_checkpoints_private.checkpoint_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_checkpoints_private.checkpoint_events FROM PUBLIC, anon, authenticated, service_role;
-- Owner reconciliation only; service_role has BYPASSRLS. No ordinary read policy exists.
GRANT SELECT ON macrogoal_checkpoints_private.checkpoint_events TO service_role;
CREATE INDEX checkpoint_events_actor_received ON macrogoal_checkpoints_private.checkpoint_events(user_id,received_at);
CREATE INDEX checkpoint_events_attempt ON macrogoal_checkpoints_private.checkpoint_events(user_id,flow_id,attempt_id) WHERE attempt_id IS NOT NULL;
CREATE FUNCTION public.record_private_checkpoint_v1(p_user_id uuid,p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
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
 OR (p_payload->'flow' - ARRAY['flowId','source']) <> '{}'::jsonb
 OR p_payload->>'eventId' IS NULL OR p_payload->>'occurredAt' IS NULL THEN
  RAISE EXCEPTION 'invalid checkpoint' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 72631));
 SELECT payload INTO prior FROM macrogoal_checkpoints_private.checkpoint_events
 WHERE user_id=p_user_id AND event_id=p_payload->>'eventId';
 IF FOUND THEN RETURN CASE WHEN prior=p_payload THEN 'duplicate' ELSE 'conflict' END; END IF;
 IF (p_payload->>'occurredAt')::timestamptz < received-interval '1 day'
 OR (p_payload->>'occurredAt')::timestamptz > received+interval '5 minutes' THEN
  RAISE EXCEPTION 'invalid checkpoint time' USING ERRCODE='22023';
 END IF;
 IF EXISTS (SELECT 1 FROM macrogoal_checkpoints_private.checkpoint_events
 WHERE user_id=p_user_id AND flow_id=p_payload#>>'{flow,flowId}' AND source IS DISTINCT FROM p_payload#>>'{flow,source}') THEN RETURN 'conflict'; END IF;
 IF (SELECT count(*) FROM macrogoal_checkpoints_private.checkpoint_events
 WHERE user_id=p_user_id AND received_at>=received-interval '1 minute')>=120 THEN RETURN 'rate_limited'; END IF;
 INSERT INTO macrogoal_checkpoints_private.checkpoint_events(user_id,event_id,flow_id,source,platform,name,attempt_id,occurred_at,received_at,payload)
 VALUES(p_user_id,p_payload->>'eventId',p_payload#>>'{flow,flowId}',p_payload#>>'{flow,source}',p_payload->>'platform',p_payload#>>'{detail,name}',p_payload#>>'{detail,attemptId}',(p_payload->>'occurredAt')::timestamptz,received,p_payload);
 RETURN 'accepted';
END;
$function$;
REVOKE ALL ON FUNCTION public.record_private_checkpoint_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_private_checkpoint_v1(uuid,jsonb) TO service_role;
-- FK cleanup affects only this new table when an auth account is actually deleted.
-- No existing guards, policies, webhook, financial records or account rows are altered.
COMMIT;
