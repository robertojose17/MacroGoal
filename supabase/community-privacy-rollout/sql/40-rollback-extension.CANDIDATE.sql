-- LOCAL REVIEW CANDIDATE. Never run without distinct approval of this exact stage/hash.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF current_user<>'postgres' OR current_setting('macrogoal.pair_rollback_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'explicit pair rollback approval required'; END IF; IF (SELECT mode FROM privacy_private.community_rollout WHERE singleton) <> 'CLOSED' THEN RAISE EXCEPTION 'close and clean pair first'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.profile_snapshot(p_target uuid,p_from text,p_to text,p_today text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET DateStyle='ISO, YMD' SET row_security=off AS $fn$
DECLARE
 actor uuid:=privacy_private.registered_actor(); u record; xp record; goals record;
 own boolean; follows boolean; followed_by boolean; accepted boolean:=false;
 request_state text:=NULL; request_descriptor jsonb:=NULL; chosen_name text; allowed boolean; response jsonb; discovery jsonb; identity jsonb;
 nutrition jsonb:=NULL; metrics jsonb; reason text; start_day date; end_day date; today date;
 streak jsonb:='{"status":"unavailable"}'::jsonb;
 since jsonb:='{"status":"unavailable"}'::jsonb;
 consistency jsonb:='{"status":"unavailable"}'::jsonb;
 followers jsonb:='{"status":"unavailable"}'::jsonb;
 following jsonb:='{"status":"unavailable"}'::jsonb;
 posts jsonb:='{"status":"unavailable"}'::jsonb;
 count_value bigint; score_value integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_target IS NULL THEN RAISE EXCEPTION 'invalid target' USING ERRCODE='22023'; END IF;
 start_day:=privacy_private.snapshot_date(p_from); end_day:=privacy_private.snapshot_date(p_to);
 today:=privacy_private.snapshot_date(p_today);
 IF end_day<start_day OR end_day-start_day+1>366 OR today-29<DATE '0001-01-01' THEN
  RAISE EXCEPTION 'invalid date range' USING ERRCODE='22023';
 END IF;
 own:=actor=p_target;
 response:=jsonb_build_object('response_version',2,'target_user_id',p_target::text,
  'can_discover_profile',false,'follow_request_state',NULL,'follow_request',NULL,'is_accepted_follower',NULL,
  'can_view_profile',false,'can_view_nutrition',false,'nutrition_unavailable_reason','profile_unavailable',
  'is_own_profile',own,'is_following',NULL,'is_mutual',NULL,
  'discovery',NULL,'user',NULL,'nutrition',NULL,'metrics',NULL);
 -- Only discovery projection is read until the canonical full-profile guard passes.
 SELECT id,username,name,full_name,avatar_url INTO u FROM public.users WHERE id=p_target;
 IF NOT FOUND OR (NOT own AND privacy_private.is_blocked(actor,p_target)) THEN RETURN response; END IF;
 chosen_name:=privacy_private.snapshot_name(u.name,u.full_name);
 discovery:=jsonb_build_object('id',p_target::text,
  'username',privacy_private.snapshot_text(u.username,100),
  'name',chosen_name,'full_name',chosen_name,
  'avatar_url',privacy_private.approved_avatar_url(p_target,u.avatar_url));
 SELECT EXISTS(SELECT 1 FROM public.social_follows WHERE follower_id=actor AND following_id=p_target),
  EXISTS(SELECT 1 FROM public.social_follows WHERE follower_id=p_target AND following_id=actor)
  INTO follows,followed_by;
 IF NOT own THEN
  SELECT CASE WHEN state='pending' THEN 'pending'
   WHEN state='accepted' AND accepted_by=p_target AND accepted_at IS NOT NULL THEN 'accepted'
   ELSE 'none' END,
   jsonb_build_object('request_id',id::text,'revision',revision::text,'state',state)
   INTO request_state,request_descriptor
   FROM public.follow_requests WHERE requester_id=actor AND owner_id=p_target;
  request_state:=coalesce(request_state,'none');
  accepted:=request_state='accepted' AND follows;
 END IF;
 allowed:=coalesce(public.can_view_profile(p_target),false);
 reason:=CASE WHEN allowed THEN NULL WHEN request_state='pending' THEN 'approval_pending'
  WHEN request_state='accepted' AND NOT follows THEN 'follow_required' ELSE 'approval_required' END;
 response:=response||jsonb_build_object('can_discover_profile',true,'discovery',discovery,
  'follow_request_state',request_state,'follow_request',request_descriptor,'is_accepted_follower',accepted,'is_following',follows,
  'is_mutual',follows AND followed_by,'nutrition_unavailable_reason',reason);
 IF NOT allowed THEN RETURN response; END IF;
 SELECT bio,created_at,user_type,show_consistency_score INTO u FROM public.users WHERE id=p_target;
 identity:=discovery||jsonb_build_object('bio',privacy_private.snapshot_bio(u.bio),
  'is_premium',CASE WHEN u.user_type IS NULL THEN NULL ELSE u.user_type='premium' END);
 -- The same statement snapshot applies to the nested STABLE nutrition RPC. A data
 -- failure can withhold nutrition while preserving independently valid identity.
 BEGIN nutrition:=public.profile_nutrition(p_target,p_from,p_to);
 EXCEPTION WHEN OTHERS THEN nutrition:=NULL; END;
 BEGIN
  SELECT current_streak,longest_streak INTO STRICT xp FROM public.user_xp WHERE user_id=p_target;
  IF xp.current_streak>=0 AND xp.longest_streak>=xp.current_streak THEN
   streak:=jsonb_build_object('status','available','current',xp.current_streak,'best',xp.longest_streak);
  END IF;
 EXCEPTION WHEN OTHERS THEN streak:='{"status":"unavailable"}'::jsonb; END;
 BEGIN
  IF u.created_at IS NOT NULL AND isfinite(u.created_at)
   AND extract(year FROM u.created_at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999 THEN
   since:=jsonb_build_object('status','available','month',to_char(u.created_at AT TIME ZONE 'UTC','YYYY-MM'),'calendar_basis','UTC');
  END IF;
 EXCEPTION WHEN OTHERS THEN since:='{"status":"unavailable"}'::jsonb; END;
 IF u.show_consistency_score IS FALSE THEN
  consistency:='{"status":"hidden"}'::jsonb;
 ELSIF u.show_consistency_score IS TRUE THEN
  BEGIN
   -- Actual current targets only. Missing/failed goals are unavailable, rather
   -- than reproducing the screenshot's fabricated 2000/150 fallback targets.
   SELECT daily_calories,protein_g INTO STRICT goals FROM public.goals WHERE user_id=p_target AND is_active IS TRUE;
   score_value:=privacy_private.snapshot_consistency_score(p_target,today,goals.daily_calories,goals.protein_g);
   consistency:=jsonb_build_object('status','available','score',score_value,
    'from_date',to_char(today-29,'YYYY-MM-DD'),'to_date',p_today,'day_count',30);
  EXCEPTION WHEN OTHERS THEN consistency:='{"status":"unavailable"}'::jsonb; END;
 END IF;
 BEGIN
  SELECT count(*) INTO count_value FROM public.follow_requests r
   JOIN public.social_follows f ON f.follower_id=r.requester_id AND f.following_id=r.owner_id
   WHERE r.owner_id=p_target AND r.state='accepted' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
    AND NOT privacy_private.is_blocked(r.requester_id,r.owner_id)
    AND NOT privacy_private.is_blocked(actor,r.requester_id);
  IF count_value<=9007199254740991 THEN followers:=jsonb_build_object('status','available','value',count_value); END IF;
 EXCEPTION WHEN OTHERS THEN followers:='{"status":"unavailable"}'::jsonb; END;
 BEGIN
  SELECT count(*) INTO count_value FROM public.follow_requests r
   JOIN public.social_follows f ON f.follower_id=r.requester_id AND f.following_id=r.owner_id
   WHERE r.requester_id=p_target AND r.state='accepted' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
    AND NOT privacy_private.is_blocked(r.requester_id,r.owner_id)
    AND NOT privacy_private.is_blocked(actor,r.owner_id);
  IF count_value<=9007199254740991 THEN following:=jsonb_build_object('status','available','value',count_value); END IF;
 EXCEPTION WHEN OTHERS THEN following:='{"status":"unavailable"}'::jsonb; END;
 -- Count precisely the complete post set eligible for list_profile_posts (81),
 -- before pagination. Acceptance/self was checked above; it never expands
 -- private post audiences. COUNT(*) reads no selected weight or media fields.
 BEGIN
  SELECT count(*) INTO count_value FROM public.social_posts p
   WHERE p.user_id=p_target AND (p.is_public IS TRUE OR actor=p.user_id);
  -- JSON numbers must survive the shared JavaScript safe-integer contract.
  posts:=CASE WHEN count_value BETWEEN 0 AND 9007199254740991
   THEN jsonb_build_object('status','available','value',count_value)
   ELSE jsonb_build_object('status','unavailable') END;
 EXCEPTION WHEN OTHERS THEN posts:='{"status":"unavailable"}'::jsonb; END;
 metrics:=jsonb_build_object('streak',streak,'member_since',since,'consistency',consistency,
  'followers_count',followers,'following_count',following,'posts_count',posts);
 RETURN response||jsonb_build_object('can_view_profile',true,'user',identity,
  'can_view_nutrition',nutrition IS NOT NULL,'nutrition',nutrition,'metrics',metrics,
  'nutrition_unavailable_reason',CASE WHEN nutrition IS NULL THEN 'nutrition_unavailable' ELSE NULL END);
END
$fn$;
CREATE OR REPLACE FUNCTION public.list_follow_request_inbox(p_cursor text DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $fn$
DECLARE
 actor uuid:=privacy_private.registered_actor(); c privacy_private.follow_inbox_cursors%ROWTYPE;
 after_id uuid; expected_fingerprint text; result_fingerprint text; result_count integer;
 result_items jsonb; last_id uuid; has_more boolean; next_token uuid;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
  RAISE EXCEPTION 'authentication required' USING ERRCODE='28000';
 END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid page limit' USING ERRCODE='22023';
 END IF;
 -- Serialize only cursor allocation for this owner; state mutations remain independent.
 PERFORM pg_advisory_xact_lock(hashtextextended('follow-inbox:'||actor::text,0));
 IF p_cursor IS NOT NULL THEN
  IF length(p_cursor)<>36 OR p_cursor !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION 'invalid inbox cursor' USING ERRCODE='22023';
  END IF;
  SELECT * INTO c FROM privacy_private.follow_inbox_cursors
   WHERE token=p_cursor::uuid AND owner_id=actor AND expires_at>clock_timestamp() AND page_size=p_limit;
  IF NOT FOUND THEN RAISE EXCEPTION 'inbox refresh required' USING ERRCODE='22023'; END IF;
  after_id:=c.after_request_id; expected_fingerprint:=c.snapshot_fingerprint;
 END IF;
 -- A SINGLE SQL statement supplies count, membership fingerprint, page and continuation.
 -- Materialization gives a consistent page/count even if a request changes concurrently.
 WITH eligible AS MATERIALIZED (
  SELECT r.id,r.requester_id,r.revision,
   coalesce(privacy_private.discovery_text(u.name,200),privacy_private.discovery_text(u.full_name,200)) AS display_name,
   privacy_private.discovery_text(u.username,100) AS username,
   privacy_private.approved_avatar_url(u.id,u.avatar_url) AS avatar_url
  FROM public.follow_requests r JOIN public.users u ON u.id=r.requester_id
  WHERE r.owner_id=actor AND r.state='pending'
    AND NOT privacy_private.is_blocked(actor,r.requester_id)
  ORDER BY r.id LIMIT 10001
 ), stats AS (
  SELECT count(*)::integer AS n,
   encode(sha256(convert_to(coalesce(string_agg(id::text||':'||revision::text,',' ORDER BY id),''),'UTF8')),'hex') AS fingerprint
  FROM eligible
 ), page AS MATERIALIZED (
  SELECT * FROM eligible WHERE after_id IS NULL OR id>after_id ORDER BY id LIMIT p_limit
 )
 SELECT s.n,s.fingerprint,
  coalesce((SELECT jsonb_agg(jsonb_build_object(
    'requestId',p.id::text,'requesterId',p.requester_id::text,'revision',p.revision::text,
    'displayName',p.display_name,'username',p.username,'avatarUrl',p.avatar_url) ORDER BY p.id) FROM page p),'[]'::jsonb),
  (SELECT id FROM page ORDER BY id DESC LIMIT 1),
  EXISTS(SELECT 1 FROM eligible WHERE id>(SELECT id FROM page ORDER BY id DESC LIMIT 1))
 INTO result_count,result_fingerprint,result_items,last_id,has_more FROM stats s;
 IF result_count>10000 THEN RAISE EXCEPTION 'inbox temporarily unavailable' USING ERRCODE='54000'; END IF;
 IF expected_fingerprint IS NOT NULL AND expected_fingerprint<>result_fingerprint THEN
  RAISE EXCEPTION 'inbox refresh required' USING ERRCODE='40001';
 END IF;
 -- Bound operational token storage to 32 per owner, expire at ten minutes.
 DELETE FROM privacy_private.follow_inbox_cursors WHERE owner_id=actor AND expires_at<=clock_timestamp();
 IF has_more THEN
  DELETE FROM privacy_private.follow_inbox_cursors WHERE token IN (
   SELECT token FROM privacy_private.follow_inbox_cursors WHERE owner_id=actor
   ORDER BY created_at DESC,token DESC OFFSET 31
  );
  INSERT INTO privacy_private.follow_inbox_cursors(owner_id,snapshot_fingerprint,after_request_id,page_size)
   VALUES(actor,result_fingerprint,last_id,p_limit) RETURNING token INTO next_token;
 END IF;
 RETURN jsonb_build_object('ownerUserId',actor::text,'items',result_items,
  'totalPending',result_count,'nextCursor',next_token::text);
END
$fn$;
CREATE OR REPLACE FUNCTION public.respond_follow_request(p_request_id uuid,p_requester_id uuid,p_expected_revision text,p_decision text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $fn$
DECLARE actor uuid:=privacy_private.registered_actor(); prior public.follow_requests%ROWTYPE; changed public.follow_requests%ROWTYPE; expected bigint;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_request_id IS NULL OR p_requester_id IS NULL OR p_requester_id=actor
 OR p_decision IS NULL OR p_decision NOT IN ('accept','reject') THEN
  RAISE EXCEPTION 'invalid follow response' USING ERRCODE='22023';
 END IF;
 IF p_expected_revision IS NULL OR length(p_expected_revision)>16
 OR p_expected_revision !~ '^[1-9][0-9]{0,15}$' THEN
  RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023';
 END IF;
 expected:=p_expected_revision::bigint;
 IF expected>9007199254740991 THEN RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF;
 PERFORM privacy_private.lock_pair(actor,p_requester_id);
 SELECT * INTO prior FROM public.follow_requests
  WHERE owner_id=actor AND requester_id=p_requester_id FOR UPDATE;
 IF NOT FOUND OR prior.id<>p_request_id OR privacy_private.is_blocked(actor,p_requester_id) THEN
  RAISE EXCEPTION 'request unavailable' USING ERRCODE='P0002';
 END IF;
 IF prior.revision<>expected THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
 IF prior.state<>'pending' THEN RAISE EXCEPTION 'state conflict' USING ERRCODE='55000'; END IF;
 SELECT * INTO changed FROM public.change_follow_request(p_requester_id,p_decision,expected);
 IF changed.id<>prior.id OR changed.owner_id<>actor OR changed.requester_id<>p_requester_id
 OR changed.revision<>prior.revision+1
 OR changed.state<>(CASE p_decision WHEN 'accept' THEN 'accepted' ELSE 'rejected' END) THEN
  RAISE EXCEPTION 'invalid transition result' USING ERRCODE='55000';
 END IF;
 RETURN jsonb_build_object('ownerUserId',actor::text,'requestId',changed.id::text,
  'requesterId',p_requester_id::text,'previousRevision',prior.revision::text,
  'revision',changed.revision::text,'state',changed.state);
END
$fn$;
CREATE OR REPLACE FUNCTION public.change_outbound_follow(p_target_id uuid,p_request_id uuid,p_expected_revision text,p_action text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $fn$
DECLARE actor uuid:=privacy_private.registered_actor(); prior public.follow_requests%ROWTYPE;
 changed public.follow_requests%ROWTYPE; expected bigint; prior_exists boolean; previous_revision text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_target_id IS NULL OR p_target_id=actor OR p_action IS NULL OR p_action NOT IN ('request','cancel','unfollow') THEN
  RAISE EXCEPTION 'invalid outbound action' USING ERRCODE='22023';
 END IF;
 IF p_expected_revision IS NULL OR length(p_expected_revision)>16
 OR p_expected_revision !~ '^(0|[1-9][0-9]{0,15})$' THEN
  RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF;
 expected:=p_expected_revision::bigint;
 IF expected>9007199254740991 THEN RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF;
 IF (p_action<>'request' AND (p_request_id IS NULL OR expected=0))
 OR (p_request_id IS NULL AND expected<>0) THEN
  RAISE EXCEPTION 'request identity required' USING ERRCODE='22023'; END IF;
 PERFORM privacy_private.lock_pair(actor,p_target_id);
 SELECT * INTO prior FROM public.follow_requests WHERE requester_id=actor AND owner_id=p_target_id FOR UPDATE;
 prior_exists:=FOUND;
 IF prior_exists THEN
  IF p_request_id IS NOT NULL AND p_request_id<>prior.id THEN
   RAISE EXCEPTION 'request unavailable' USING ERRCODE='P0002'; END IF;
  -- A retried initial request may safely return current pending/accepted state.
  -- Reopening a terminal row needs its actual identity and exact observed revision.
  IF p_action='request' AND prior.state NOT IN ('pending','accepted') AND p_request_id IS NULL THEN
   RAISE EXCEPTION 'request refresh required' USING ERRCODE='40001'; END IF;
  previous_revision:=prior.revision::text;
 ELSE
  IF p_request_id IS NOT NULL THEN RAISE EXCEPTION 'request unavailable' USING ERRCODE='P0002'; END IF;
  previous_revision:='0';
 END IF;
 SELECT * INTO changed FROM public.change_follow_request(p_target_id,p_action,expected);
 IF changed.requester_id<>actor OR changed.owner_id<>p_target_id
 OR (prior_exists AND changed.id<>prior.id)
 OR changed.state NOT IN ('pending','accepted','cancelled','revoked') THEN
  RAISE EXCEPTION 'invalid transition result' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('requesterUserId',actor::text,'targetUserId',p_target_id::text,
  'action',p_action,'previousRevision',previous_revision,
  'follow_request',jsonb_build_object('request_id',changed.id::text,'revision',changed.revision::text,'state',changed.state));
END
$fn$;
CREATE OR REPLACE FUNCTION public.discover_profiles(p_ids uuid[]) RETURNS TABLE(id uuid, username text, name text, full_name text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog SET row_security=off AS $fn$
BEGIN
 IF privacy_private.registered_actor() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)>50 THEN RAISE EXCEPTION 'invalid discovery limit' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT u.id,privacy_private.profile_text(u.username,100),
  coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200)),
  coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200)),
  privacy_private.approved_avatar_url(u.id,u.avatar_url) FROM public.users u
 WHERE u.id=ANY(p_ids) AND NOT privacy_private.is_blocked(privacy_private.registered_actor(),u.id) ORDER BY u.id;
END
$fn$;
CREATE OR REPLACE FUNCTION public.search_profile_identities(p_query text,p_limit integer DEFAULT 20,p_after_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $fn$
DECLARE actor uuid:=privacy_private.registered_actor(); normalized text; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
  RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_query IS NULL OR length(p_query)>64 OR p_query ~ '[[:cntrl:]]'
 OR length(p_query)+regexp_count(p_query,U&'[\+010000-\+10FFFF]')>64 THEN
  RAISE EXCEPTION 'invalid search query' USING ERRCODE='22023'; END IF;
 normalized:=btrim(p_query);
 IF length(normalized)+regexp_count(normalized,U&'[\+010000-\+10FFFF]')<2 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid search query or limit' USING ERRCODE='22023'; END IF;
 -- strpos treats %, _, quotes and backslashes literally. No dynamic SQL/LIKE pattern.
 WITH matched AS MATERIALIZED (
  SELECT u.id,u.username,u.name,u.full_name,u.avatar_url,
   lower(coalesce(privacy_private.profile_text(u.username,100),'')) AS sort_name
  FROM public.users u
  WHERE NOT privacy_private.is_blocked(actor,u.id)
   AND (p_after_id IS NULL OR u.id>p_after_id)
   AND (strpos(lower(coalesce(privacy_private.profile_text(u.username,100),'')),lower(normalized))>0
    OR strpos(lower(coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200),'')),lower(normalized))>0)
  ORDER BY u.id LIMIT p_limit+1
 ), page AS (SELECT * FROM matched ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object('query',normalized,
  'items',coalesce((SELECT jsonb_agg(privacy_private.discovery_identity_json(id,username,name,full_name,avatar_url) ORDER BY id) FROM page),'[]'::jsonb),
  'hasMore',(SELECT count(*)>p_limit FROM matched),
  'nextCursor',CASE WHEN (SELECT count(*)>p_limit FROM matched) THEN (SELECT id::text FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END
$fn$;
CREATE OR REPLACE FUNCTION public.list_accepted_profile_connections(p_target_id uuid,p_direction text,p_limit integer DEFAULT 20,p_after_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $fn$
DECLARE actor uuid:=privacy_private.registered_actor(); result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_target_id IS NULL OR p_direction IS NULL OR p_direction NOT IN ('followers','following')
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid connection query' USING ERRCODE='22023'; END IF;
 IF NOT public.can_view_profile(p_target_id) THEN
  RAISE EXCEPTION 'profile unavailable' USING ERRCODE='P0002'; END IF;
 -- STABLE function reads target authorization and payload within caller's snapshot.
 -- Every returned edge independently needs fresh directional owner acceptance.
 WITH approved AS MATERIALIZED (
  SELECT u.id,u.username,u.name,u.full_name,u.avatar_url,
   lower(coalesce(privacy_private.profile_text(u.username,100),'')) AS sort_name
  FROM public.follow_requests r
  JOIN public.social_follows f ON f.follower_id=r.requester_id AND f.following_id=r.owner_id
  JOIN public.users u ON u.id=CASE p_direction WHEN 'followers' THEN r.requester_id ELSE r.owner_id END
  WHERE r.state='accepted' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
   AND (p_after_id IS NULL OR u.id>p_after_id)
   AND ((p_direction='followers' AND r.owner_id=p_target_id)
     OR (p_direction='following' AND r.requester_id=p_target_id))
   AND NOT privacy_private.is_blocked(r.requester_id,r.owner_id)
   AND NOT privacy_private.is_blocked(actor,u.id)
  ORDER BY u.id LIMIT p_limit+1
 ), page AS (SELECT * FROM approved ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object('targetUserId',p_target_id::text,'direction',p_direction,
  'items',coalesce((SELECT jsonb_agg(privacy_private.discovery_identity_json(id,username,name,full_name,avatar_url) ORDER BY id) FROM page),'[]'::jsonb),
  'hasMore',(SELECT count(*)>p_limit FROM approved),
  'nextCursor',CASE WHEN (SELECT count(*)>p_limit FROM approved) THEN (SELECT id::text FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END
$fn$;
CREATE OR REPLACE FUNCTION public.list_profile_posts(p_target_id uuid,p_limit integer DEFAULT 20,p_cursor text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET DateStyle='ISO, YMD' SET TimeZone='UTC' SET row_security=off AS $fn$
DECLARE actor uuid:=privacy_private.registered_actor(); boundary_time timestamptz;
 boundary_id uuid; decoded text; result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_target_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid post query' USING ERRCODE='22023'; END IF;
 IF NOT public.can_view_profile(p_target_id) THEN
  RAISE EXCEPTION 'profile unavailable' USING ERRCODE='P0002'; END IF;
 IF p_cursor IS NOT NULL THEN
  BEGIN
   IF length(p_cursor)>160 OR p_cursor !~ '^[A-Za-z0-9_-]+$' THEN RAISE EXCEPTION 'bad cursor'; END IF;
   decoded:=convert_from(decode(translate(p_cursor,'-_','+/')||repeat('=',(4-length(p_cursor)%4)%4),'base64'),'UTF8');
   IF decoded !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z[|][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR left(decoded,4)='0000' THEN RAISE EXCEPTION 'bad cursor'; END IF;
   boundary_time:=split_part(decoded,'|',1)::timestamptz;
   boundary_id:=split_part(decoded,'|',2)::uuid;
   IF privacy_private.profile_post_cursor(boundary_time,boundary_id) IS DISTINCT FROM p_cursor THEN RAISE EXCEPTION 'bad cursor'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid post cursor' USING ERRCODE='22023'; END;
 END IF;
 -- STABLE: authorization + result share one statement snapshot; every page
 -- rechecks authorization. Cursor is only an untrusted boundary, never a grant.
 WITH eligible AS MATERIALIZED (
  SELECT p.id,p.content,p.created_at,p.likes_count,p.post_type FROM public.social_posts p
  WHERE p.user_id=p_target_id AND (p.is_public IS TRUE OR actor=p.user_id)
   AND (p_cursor IS NULL OR (p.created_at,p.id)<(boundary_time,boundary_id))
  ORDER BY p.created_at DESC,p.id DESC LIMIT p_limit+1
 ), page AS (SELECT * FROM eligible ORDER BY created_at DESC,id DESC LIMIT p_limit)
 SELECT jsonb_build_object('targetUserId',p_target_id::text,
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id::text,'content',content,
    'created_at',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'likes_count',likes_count,'post_type',post_type) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb),
  'hasMore',(SELECT count(*)>p_limit FROM eligible),
  'nextCursor',CASE WHEN (SELECT count(*)>p_limit FROM eligible) THEN
    (SELECT privacy_private.profile_post_cursor(created_at,id) FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END)
 INTO result;
 RETURN result;
END
$fn$;
CREATE OR REPLACE FUNCTION public.profile_weekly_tracking(p_target_id uuid,p_from text,p_to text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET DateStyle='ISO, YMD' SET row_security=off AS $fn$
DECLARE actor uuid:=privacy_private.registered_actor(); start_day date;end_day date;day_count integer;
 share boolean; r record;idx integer; tracked boolean[];calories double precision[];protein double precision[];
 calorie_target double precision:=2000; protein_target double precision:=150;
 cal_pct double precision;prot_pct double precision;cal_pts double precision;prot_pts double precision;
 total double precision:=0;meal_days integer:=0;score_value integer;
 consistency jsonb;tracking jsonb;envelope jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_target_id IS NULL THEN RAISE EXCEPTION 'invalid target' USING ERRCODE='22023'; END IF;
 start_day:=privacy_private.weekly_date(p_from);end_day:=privacy_private.weekly_date(p_to);
 day_count:=end_day-start_day+1;
 IF day_count NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'invalid date range' USING ERRCODE='22023'; END IF;
 IF NOT public.can_view_profile(p_target_id) THEN RAISE EXCEPTION 'profile unavailable' USING ERRCODE='P0002'; END IF;
 envelope:=jsonb_build_object('targetUserId',p_target_id::text,'fromDate',p_from,'toDate',p_to);
 SELECT show_consistency_score INTO share FROM public.users WHERE id=p_target_id;
 -- Conservative: hidden consistency also withholds meal-day/flags from others.
 -- Owner retains tracking. No implicit permission through a commitment or old edge.
 IF actor<>p_target_id AND share IS DISTINCT FROM true THEN
  RETURN envelope||jsonb_build_object('consistency',jsonb_build_object('status','hidden'),
   'tracking',jsonb_build_object('status','hidden')); END IF;
 tracked:=array_fill(false,ARRAY[day_count]);
 calories:=array_fill(0::double precision,ARRAY[day_count]);protein:=array_fill(0::double precision,ARRAY[day_count]);
 BEGIN
  -- No active goal uses the existing application defaults; database/read errors do
  -- not masquerade as fallback values. Unique goals.user_id is verified metadata.
  SELECT g.daily_calories,g.protein_g INTO calorie_target,protein_target
   FROM public.goals g WHERE g.user_id=p_target_id AND g.is_active IS TRUE;
  IF NOT FOUND THEN calorie_target:=2000;protein_target:=150; END IF;
  IF NOT privacy_private.valid_weekly_amount(calorie_target) OR NOT privacy_private.valid_weekly_amount(protein_target) THEN
   RAISE EXCEPTION 'invalid score input' USING ERRCODE='22003'; END IF;
  FOR r IN SELECT m.date,i.id IS NOT NULL AS has_item,i.is_scheduled,i.calories,i.protein
   FROM public.meals m LEFT JOIN public.meal_items i ON i.meal_id=m.id
   WHERE m.user_id=p_target_id AND m.date>=start_day AND m.date<=end_day ORDER BY m.date,m.id,i.id LOOP
   idx:=r.date-start_day+1;tracked[idx]:=true;
   IF NOT r.has_item THEN CONTINUE; END IF;
   IF r.is_scheduled IS NULL THEN RAISE EXCEPTION 'invalid score input' USING ERRCODE='22003'; END IF;
   IF r.is_scheduled THEN CONTINUE; END IF;
   IF NOT privacy_private.valid_weekly_amount(r.calories::double precision)
    OR NOT privacy_private.valid_weekly_amount(r.protein::double precision) THEN
    RAISE EXCEPTION 'invalid score input' USING ERRCODE='22003'; END IF;
   calories[idx]:=calories[idx]+r.calories::double precision;protein[idx]:=protein[idx]+r.protein::double precision;
   IF NOT privacy_private.valid_weekly_amount(calories[idx]) OR NOT privacy_private.valid_weekly_amount(protein[idx]) THEN
    RAISE EXCEPTION 'invalid score input' USING ERRCODE='22003'; END IF;
  END LOOP;
  FOR idx IN 1..day_count LOOP
   IF NOT tracked[idx] THEN CONTINUE; END IF;
   meal_days:=meal_days+1;
   cal_pct:=CASE WHEN calorie_target>0 THEN calories[idx]/calorie_target*100 ELSE 0 END;
   prot_pct:=CASE WHEN protein_target>0 THEN protein[idx]/protein_target*100 ELSE 0 END;
   IF NOT privacy_private.valid_weekly_amount(cal_pct) OR NOT privacy_private.valid_weekly_amount(prot_pct) THEN
    RAISE EXCEPTION 'invalid score input' USING ERRCODE='22003'; END IF;
   cal_pts:=CASE WHEN cal_pct>=95 AND cal_pct<=105 THEN 30 WHEN cal_pct>=85 THEN 24
    WHEN cal_pct>=70 THEN 18 WHEN cal_pct>=50 THEN 12 ELSE least(6,cal_pct/50*6) END;
   prot_pts:=CASE WHEN prot_pct>=95 AND prot_pct<=105 THEN 20 WHEN prot_pct>=85 THEN 16
    WHEN prot_pct>=70 THEN 12 WHEN prot_pct>=50 THEN 8 ELSE least(4,prot_pct/50*4) END;
   total:=total+50+cal_pts+prot_pts;
  END LOOP;
  score_value:=floor(total/day_count+0.5)::integer;
  consistency:=jsonb_build_object('status','available','score',score_value,'noActivity',meal_days=0);
  tracking:=jsonb_build_object('status','available','mealDays',meal_days,'dayFlags',to_jsonb(tracked));
 EXCEPTION WHEN numeric_value_out_of_range THEN
  consistency:=jsonb_build_object('status','unavailable');tracking:=jsonb_build_object('status','unavailable');
 END;
 RETURN envelope||jsonb_build_object('consistency',consistency,'tracking',tracking);
END
$fn$;
CREATE OR REPLACE FUNCTION public.visible_post_authors(p_post_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $fn$
DECLARE actor uuid:=privacy_private.registered_actor();result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
  RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_post_ids IS NULL OR cardinality(p_post_ids)>50
  OR coalesce(array_ndims(p_post_ids),1)<>1 OR array_position(p_post_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'invalid post identity batch' USING ERRCODE='22023'; END IF;
 -- ANY deduplicates requested IDs; no arbitrary author IDs are accepted. Public
 -- selected posts remain readable independently of full profile acceptance.
 -- Badge reproduces SocialPostCard's user_type==='premium' display predicate.
 -- Stored user_type may be mutable; this is never paid entitlement or permission.
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('postId',p.id::text,
  'identity',privacy_private.discovery_identity_json(u.id,u.username,u.name,u.full_name,u.avatar_url)
   ||jsonb_build_object('is_premium',coalesce(u.user_type='premium',false))) ORDER BY p.id),'[]'::jsonb))
 INTO result
 FROM public.social_posts p JOIN public.users u ON u.id=p.user_id
 WHERE p.id=ANY(p_post_ids) AND (p.is_public IS TRUE OR p.user_id=actor)
  AND (actor=p.user_id OR NOT privacy_private.is_blocked(actor,p.user_id));
 RETURN result;
END
$fn$;
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
DROP POLICY community_pair_read ON public.social_posts;
DROP POLICY community_pair_read ON public.community_comments;
DROP POLICY community_pair_read ON public.community_likes;
DROP POLICY community_pair_read ON public.social_post_likes;
DROP POLICY community_pair_read ON public.social_post_saves;
DROP POLICY community_pair_read ON public.community_commitments;
DROP POLICY community_pair_blocks ON public.blocked_users;
DROP POLICY community_pair_blocks ON public.community_blocks;
DROP TRIGGER community_pair_block_guard ON public.blocked_users;
DROP TRIGGER community_pair_block_revoke ON public.blocked_users;
DROP TRIGGER community_pair_truncate_guard ON public.blocked_users;
DROP TRIGGER community_pair_block_guard ON public.community_blocks;
DROP TRIGGER community_pair_block_revoke ON public.community_blocks;
DROP TRIGGER community_pair_truncate_guard ON public.community_blocks;
DROP TRIGGER community_pair_follow_guard ON public.social_follows;
DROP TRIGGER community_pair_truncate_guard ON public.social_follows;
DROP FUNCTION public.get_outbound_follow_status(uuid),public.community_privacy_eligibility(),public.community_privacy_row_allowed(text,uuid,uuid,uuid);
DROP FUNCTION privacy_private.pair_block_guard(),privacy_private.pair_block_revoke(),privacy_private.pair_follow_guard(),privacy_private.pair_truncate_guard();
DROP FUNCTION privacy_private.community_pair_cleanup_state();
DROP FUNCTION privacy_private.require_community_actor(),privacy_private.require_community_target(uuid),privacy_private.community_exact_pair(uuid,uuid),privacy_private.community_member(uuid),privacy_private.community_active();
DROP TABLE privacy_private.community_rollout;
COMMIT;
