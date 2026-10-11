-- FAIL-CLOSED API ROLLBACK CANDIDATE. Requires explicit separate approval.
-- Retains hardened RLS, blocks, accepted/request data and any owner-only raw rules.
-- Does not restore permissive legacy routes or delete real user activity.
-- Revoke blocks subsequent invocations; it does not cancel statements already running.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $approval$ BEGIN
 IF current_user<>'postgres' OR current_setting('macrogoal.global_close_approved',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'explicit global close approval required'; END IF;
END $approval$;
UPDATE privacy_private.community_global_rollout SET mode='CLOSED' WHERE singleton;
REVOKE ALL ON FUNCTION public.profile_snapshot(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_follow_request_inbox(text,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.respond_follow_request(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.change_outbound_follow(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.discover_profiles(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.search_profile_identities(text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_accepted_profile_connections(uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_profile_posts(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.profile_weekly_tracking(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.visible_post_authors(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.community_privacy_eligibility() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_outbound_follow_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $verify$ DECLARE s text; r text; BEGIN
 FOREACH s IN ARRAY ARRAY['public.profile_snapshot(uuid,text,text,text)','public.list_follow_request_inbox(text,integer)','public.respond_follow_request(uuid,uuid,text,text)','public.change_outbound_follow(uuid,uuid,text,text)','public.discover_profiles(uuid[])','public.search_profile_identities(text,integer,uuid)','public.list_accepted_profile_connections(uuid,text,integer,uuid)','public.list_profile_posts(uuid,integer,text)','public.profile_weekly_tracking(uuid,text,text)','public.visible_post_authors(uuid[])','public.community_privacy_eligibility()','public.get_outbound_follow_status(uuid)'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_function_privilege(r,s,'EXECUTE') THEN RAISE EXCEPTION 'inherited API execute privilege remains: %, %',r,s; END IF;
  END LOOP;
 END LOOP;
END $verify$;
COMMIT;
