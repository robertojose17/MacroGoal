-- LOCAL REVIEW CANDIDATE. Never run without distinct approval of this exact stage/hash.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
-- Deliberate exact-pair cleanup: remove approval records/cursors and compatibility
-- edges/blocks. Activation proved the pair relationship baseline and owner cursors
-- empty; exact reviewed row/revision digest is also mandatory before deletion.
-- Stop if any row is not a known trial artifact. Preserve user content and unrelated
-- relationships. Does not resurrect any edge or blindly restore counters.
DO $close$
DECLARE a uuid;b uuid;expected text;actual text;
BEGIN
 IF current_user<>'postgres' OR current_setting('macrogoal.pair_close_cleanup_approved',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'explicit pair close and relationship cleanup approval required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('macrogoal:community-rollout',0));
 -- Lock all cleanup stores after the rollout lock; bounded lock timeout fails
 -- closed on contention. Multi-session deadlock behavior still needs PG17 review.
 LOCK TABLE public.blocked_users,public.community_blocks,public.social_follows,public.follow_requests,privacy_private.follow_inbox_cursors IN SHARE ROW EXCLUSIVE MODE;
 expected:=current_setting('macrogoal.pair_expected_cleanup_digest',true);
 actual:=privacy_private.community_pair_cleanup_state()->>'digest';
 IF expected IS NULL OR expected !~ '^[0-9a-f]{64}$' OR actual IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'cleanup identity/revision digest drift; review exact trial rows again'; END IF;
 SELECT member_a,member_b INTO a,b FROM privacy_private.community_rollout WHERE singleton FOR UPDATE;
 UPDATE privacy_private.community_rollout SET mode='CLOSED' WHERE singleton;
 DELETE FROM public.blocked_users WHERE blocker_id IN(a,b) AND blocked_id IN(a,b) AND blocker_id<>blocked_id;
 DELETE FROM public.community_blocks WHERE blocker_id IN(a,b) AND blocked_id IN(a,b) AND blocker_id<>blocked_id;
 DELETE FROM public.social_follows WHERE follower_id IN(a,b) AND following_id IN(a,b) AND follower_id<>following_id;
 DELETE FROM public.follow_requests WHERE requester_id IN(a,b) AND owner_id IN(a,b);
 DELETE FROM privacy_private.follow_inbox_cursors WHERE owner_id IN(a,b);
END $close$;
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
REVOKE ALL ON FUNCTION public.get_outbound_follow_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
