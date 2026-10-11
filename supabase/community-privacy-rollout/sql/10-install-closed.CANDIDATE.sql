-- LOCAL REVIEW CANDIDATE. Never run without distinct approval of this exact stage/hash.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $baseline$ BEGIN
 IF current_user<>'postgres' OR current_setting('macrogoal.pair_install_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'explicit pair install approval required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.lock_pair(uuid,uuid)') AND p.prosrc='
 SELECT pg_advisory_xact_lock(hashtextextended(least(a,b)::text || '':'' || greatest(a,b)::text, 0))
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='v' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['a','b']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='void' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.lock_pair(uuid,uuid)'; END IF;
 IF has_function_privilege('anon','privacy_private.lock_pair(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.lock_pair(uuid,uuid)','EXECUTE') OR has_function_privilege('service_role','privacy_private.lock_pair(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.lock_pair(uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.is_blocked(uuid,uuid)') AND p.prosrc='
 SELECT a IS DISTINCT FROM b AND (EXISTS (SELECT 1 FROM public.blocked_users
 WHERE (blocker_id=a AND blocked_id=b) OR (blocker_id=b AND blocked_id=a))
 OR EXISTS (SELECT 1 FROM public.community_blocks
 WHERE (blocker_id=a AND blocked_id=b) OR (blocker_id=b AND blocked_id=a)))
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='s' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['a','b']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='boolean' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.is_blocked(uuid,uuid)'; END IF;
 IF has_function_privilege('anon','privacy_private.is_blocked(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.is_blocked(uuid,uuid)','EXECUTE') OR has_function_privilege('service_role','privacy_private.is_blocked(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.is_blocked(uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.approved_avatar_url(uuid,text)') AND p.prosrc='
 SELECT CASE WHEN p_user_id IS NOT NULL AND p_candidate=
  ''https://esgptfiofoaeguslgvcq.supabase.co/storage/v1/object/public/avatars/''||p_user_id::text||''/avatar.jpg''
 THEN p_candidate ELSE NULL END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_user_id','p_candidate']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='text' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.approved_avatar_url(uuid,text)'; END IF;
 IF has_function_privilege('anon','privacy_private.approved_avatar_url(uuid,text)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.approved_avatar_url(uuid,text)','EXECUTE') OR has_function_privilege('service_role','privacy_private.approved_avatar_url(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.approved_avatar_url(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.profile_text(text,integer)') AND p.prosrc='
 SELECT CASE WHEN p_value IS NOT NULL AND length(p_value)<=p_max AND length(p_value)+regexp_count(p_value,U&''[\+010000-\+10FFFF]'')<=p_max AND p_value !~ ''[[:cntrl:]]''
 THEN p_value ELSE NULL END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_value','p_max']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='text' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.profile_text(text,integer)'; END IF;
 IF has_function_privilege('anon','privacy_private.profile_text(text,integer)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.profile_text(text,integer)','EXECUTE') OR has_function_privilege('service_role','privacy_private.profile_text(text,integer)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.profile_text(text,integer)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.registered_actor()') AND p.prosrc='
 SELECT CASE WHEN auth.jwt()->''is_anonymous''=''false''::jsonb THEN auth.uid() ELSE NULL END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='s' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM NULL::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='uuid' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.registered_actor()'; END IF;
 IF has_function_privilege('anon','privacy_private.registered_actor()','EXECUTE') OR has_function_privilege('authenticated','privacy_private.registered_actor()','EXECUTE') OR has_function_privilege('service_role','privacy_private.registered_actor()','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.registered_actor()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.can_view_profile(uuid)') AND p.prosrc='
 SELECT privacy_private.registered_actor() IS NOT NULL AND p_target IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.users WHERE id=p_target)
 AND (privacy_private.registered_actor()=p_target OR (
  NOT privacy_private.is_blocked(privacy_private.registered_actor(),p_target)
  AND EXISTS (SELECT 1 FROM public.follow_requests r
    JOIN public.social_follows f ON f.follower_id=r.requester_id AND f.following_id=r.owner_id
    WHERE r.requester_id=privacy_private.registered_actor() AND r.owner_id=p_target AND r.state=''accepted''
      AND r.accepted_by=p_target AND r.accepted_at IS NOT NULL)
 ))
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='boolean' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.can_view_profile(uuid)'; END IF;
 IF has_function_privilege('anon','public.can_view_profile(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.can_view_profile(uuid)','EXECUTE') OR has_function_privilege('service_role','public.can_view_profile(uuid)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.can_view_profile(uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.discover_profiles(uuid[])') AND p.prosrc='
BEGIN
 IF privacy_private.registered_actor() IS NULL THEN RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)>50 THEN RAISE EXCEPTION ''invalid discovery limit'' USING ERRCODE=''22023''; END IF;
 RETURN QUERY SELECT u.id,privacy_private.profile_text(u.username,100),
  coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200)),
  coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200)),
  privacy_private.approved_avatar_url(u.id,u.avatar_url) FROM public.users u
 WHERE u.id=ANY(p_ids) AND NOT privacy_private.is_blocked(privacy_private.registered_actor(),u.id) ORDER BY u.id;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_ids','id','username','name','full_name','avatar_url']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='TABLE(id uuid, username text, name text, full_name text, avatar_url text)' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.discover_profiles(uuid[])'; END IF;
 IF has_function_privilege('anon','public.discover_profiles(uuid[])','EXECUTE') OR has_function_privilege('authenticated','public.discover_profiles(uuid[])','EXECUTE') OR has_function_privilege('service_role','public.discover_profiles(uuid[])','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.discover_profiles(uuid[])'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.profile_summary(uuid)') AND p.prosrc='
 SELECT u.id,privacy_private.profile_text(u.username,100),
  coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200)),
  coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200)),
  privacy_private.approved_avatar_url(u.id,u.avatar_url),privacy_private.profile_text(u.bio,4000),NULL::boolean FROM public.users u
 WHERE u.id=p_target AND public.can_view_profile(p_target)
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target','id','username','name','full_name','avatar_url','bio','is_premium']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='TABLE(id uuid, username text, name text, full_name text, avatar_url text, bio text, is_premium boolean)' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.profile_summary(uuid)'; END IF;
 IF has_function_privilege('anon','public.profile_summary(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.profile_summary(uuid)','EXECUTE') OR has_function_privilege('service_role','public.profile_summary(uuid)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.profile_summary(uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.change_follow_request(uuid,text,bigint)') AND p.prosrc='
DECLARE
 actor uuid := privacy_private.registered_actor(); requester uuid; owner_user uuid;
 r public.follow_requests%ROWTYPE; desired text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_other IS NULL OR p_other=actor THEN RAISE EXCEPTION ''invalid target'' USING ERRCODE=''22023''; END IF;
 IF p_action IS NULL OR p_action NOT IN (''request'',''cancel'',''accept'',''reject'',''unfollow'',''remove'') THEN
  RAISE EXCEPTION ''invalid action'' USING ERRCODE=''22023'';
 END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION ''expected revision required'' USING ERRCODE=''22023''; END IF;
 IF p_action IN (''accept'',''reject'',''remove'') THEN requester:=p_other; owner_user:=actor;
 ELSE requester:=actor; owner_user:=p_other; END IF;
 PERFORM privacy_private.lock_pair(requester,owner_user);
 IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=actor)
 OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_other) THEN
  RAISE EXCEPTION ''target unavailable'' USING ERRCODE=''P0002'';
 END IF;
 IF privacy_private.is_blocked(requester,owner_user) THEN RAISE EXCEPTION ''target unavailable'' USING ERRCODE=''P0002''; END IF;
 SELECT * INTO r FROM public.follow_requests WHERE requester_id=requester AND owner_id=owner_user FOR UPDATE;
 IF p_action=''request'' THEN
  IF NOT FOUND THEN
   IF p_expected_revision<>0 THEN RAISE EXCEPTION ''revision conflict'' USING ERRCODE=''40001''; END IF;
   INSERT INTO public.follow_requests(requester_id,owner_id) VALUES(requester,owner_user) RETURNING * INTO r;
   RETURN r;
  END IF;
  -- Harmless retry never reopens/accepts. Return latest pending/accepted state, even with stale revision.
  IF r.state IN (''pending'',''accepted'') THEN RETURN r; END IF;
  IF p_expected_revision<>r.revision THEN RAISE EXCEPTION ''revision conflict'' USING ERRCODE=''40001''; END IF;
  UPDATE public.follow_requests SET state=''pending'', revision=revision+1,updated_at=clock_timestamp(),accepted_by=NULL,accepted_at=NULL
   WHERE requester_id=requester AND owner_id=owner_user RETURNING * INTO r;
  -- Remove stale compatibility edge on reopening; no approval is inferred.
  DELETE FROM public.social_follows WHERE follower_id=requester AND following_id=owner_user;
  RETURN r;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION ''request unavailable'' USING ERRCODE=''P0002''; END IF;
 IF p_expected_revision<>r.revision THEN RAISE EXCEPTION ''revision conflict'' USING ERRCODE=''40001''; END IF;
 IF p_action IN (''cancel'',''accept'',''reject'') THEN
  IF r.state<>''pending'' THEN RAISE EXCEPTION ''state conflict'' USING ERRCODE=''55000''; END IF;
  desired:=CASE p_action WHEN ''cancel'' THEN ''cancelled'' WHEN ''accept'' THEN ''accepted'' ELSE ''rejected'' END;
 ELSE
  IF r.state<>''accepted'' THEN RAISE EXCEPTION ''state conflict'' USING ERRCODE=''55000''; END IF;
  desired:=''revoked'';
 END IF;
 UPDATE public.follow_requests SET state=desired,revision=revision+1,updated_at=clock_timestamp(),
  accepted_by=CASE WHEN desired=''accepted'' THEN actor ELSE NULL END,
  accepted_at=CASE WHEN desired=''accepted'' THEN clock_timestamp() ELSE NULL END
 WHERE requester_id=requester AND owner_id=owner_user RETURNING * INTO r;
 IF desired=''accepted'' THEN
  INSERT INTO public.social_follows(follower_id,following_id) VALUES(requester,owner_user)
  ON CONFLICT (follower_id,following_id) DO NOTHING;
 ELSE
  DELETE FROM public.social_follows WHERE follower_id=requester AND following_id=owner_user;
 END IF;
 RETURN r;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_other','p_action','p_expected_revision']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='public.follow_requests' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.change_follow_request(uuid,text,bigint)'; END IF;
 IF has_function_privilege('anon','public.change_follow_request(uuid,text,bigint)','EXECUTE') OR has_function_privilege('authenticated','public.change_follow_request(uuid,text,bigint)','EXECUTE') OR has_function_privilege('service_role','public.change_follow_request(uuid,text,bigint)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.change_follow_request(uuid,text,bigint)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.block_pair_lock()') AND p.prosrc='
BEGIN
 IF TG_OP=''UPDATE'' THEN RAISE EXCEPTION ''block rows are immutable; delete then insert'' USING ERRCODE=''55000''; END IF;
 IF TG_OP=''DELETE'' THEN PERFORM privacy_private.lock_pair(OLD.blocker_id,OLD.blocked_id); RETURN OLD; END IF;
 PERFORM privacy_private.lock_pair(NEW.blocker_id,NEW.blocked_id); RETURN NEW;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM NULL::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='trigger' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.block_pair_lock()'; END IF;
 IF has_function_privilege('anon','privacy_private.block_pair_lock()','EXECUTE') OR has_function_privilege('authenticated','privacy_private.block_pair_lock()','EXECUTE') OR has_function_privilege('service_role','privacy_private.block_pair_lock()','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.block_pair_lock()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.block_revoke_relationships()') AND p.prosrc='
BEGIN
 UPDATE public.follow_requests SET state=''revoked'',revision=least(revision+1,9007199254740991),updated_at=clock_timestamp(),accepted_by=NULL,accepted_at=NULL
 WHERE state IN (''pending'',''accepted'') AND
 ((requester_id=NEW.blocker_id AND owner_id=NEW.blocked_id) OR (requester_id=NEW.blocked_id AND owner_id=NEW.blocker_id));
 DELETE FROM public.social_follows WHERE
 (follower_id=NEW.blocker_id AND following_id=NEW.blocked_id) OR (follower_id=NEW.blocked_id AND following_id=NEW.blocker_id);
 RETURN NEW;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM NULL::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='trigger' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.block_revoke_relationships()'; END IF;
 IF has_function_privilege('anon','privacy_private.block_revoke_relationships()','EXECUTE') OR has_function_privilege('authenticated','privacy_private.block_revoke_relationships()','EXECUTE') OR has_function_privilege('service_role','privacy_private.block_revoke_relationships()','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.block_revoke_relationships()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.follow_delete_revoke()') AND p.prosrc='
BEGIN
 PERFORM privacy_private.lock_pair(OLD.follower_id,OLD.following_id);
 UPDATE public.follow_requests SET state=''revoked'',revision=least(revision+1,9007199254740991),updated_at=clock_timestamp(),accepted_by=NULL,accepted_at=NULL
 WHERE requester_id=OLD.follower_id AND owner_id=OLD.following_id AND state=''accepted'';
 RETURN OLD;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM NULL::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='trigger' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.follow_delete_revoke()'; END IF;
 IF has_function_privilege('anon','privacy_private.follow_delete_revoke()','EXECUTE') OR has_function_privilege('authenticated','privacy_private.follow_delete_revoke()','EXECUTE') OR has_function_privilege('service_role','privacy_private.follow_delete_revoke()','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.follow_delete_revoke()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.follow_identity_immutable()') AND p.prosrc='
BEGIN
 IF NEW.follower_id IS DISTINCT FROM OLD.follower_id OR NEW.following_id IS DISTINCT FROM OLD.following_id THEN
  RAISE EXCEPTION ''follow endpoints are immutable; use canonical remove/request'' USING ERRCODE=''55000'';
 END IF;
 RETURN NEW;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM NULL::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='trigger' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.follow_identity_immutable()'; END IF;
 IF has_function_privilege('anon','privacy_private.follow_identity_immutable()','EXECUTE') OR has_function_privilege('authenticated','privacy_private.follow_identity_immutable()','EXECUTE') OR has_function_privilege('service_role','privacy_private.follow_identity_immutable()','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.follow_identity_immutable()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.relationship_truncate_forbidden()') AND p.prosrc='
BEGIN
 RAISE EXCEPTION ''relationship truncation forbidden; use reviewed row cleanup'' USING ERRCODE=''55000'';
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM NULL::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='trigger' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.relationship_truncate_forbidden()'; END IF;
 IF has_function_privilege('anon','privacy_private.relationship_truncate_forbidden()','EXECUTE') OR has_function_privilege('authenticated','privacy_private.relationship_truncate_forbidden()','EXECUTE') OR has_function_privilege('service_role','privacy_private.relationship_truncate_forbidden()','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.relationship_truncate_forbidden()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.legacy_block_pair_lock()') AND p.prosrc='
BEGIN
 IF TG_OP=''UPDATE'' AND (NEW.blocker_id IS DISTINCT FROM OLD.blocker_id OR NEW.blocked_id IS DISTINCT FROM OLD.blocked_id) THEN
  RAISE EXCEPTION ''block endpoints are immutable; delete then insert'' USING ERRCODE=''55000''; END IF;
 IF TG_OP=''DELETE'' THEN PERFORM privacy_private.lock_pair(OLD.blocker_id,OLD.blocked_id); RETURN OLD; END IF;
 PERFORM privacy_private.lock_pair(NEW.blocker_id,NEW.blocked_id); RETURN NEW;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM NULL::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='trigger' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.legacy_block_pair_lock()'; END IF;
 IF has_function_privilege('anon','privacy_private.legacy_block_pair_lock()','EXECUTE') OR has_function_privilege('authenticated','privacy_private.legacy_block_pair_lock()','EXECUTE') OR has_function_privilege('service_role','privacy_private.legacy_block_pair_lock()','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.legacy_block_pair_lock()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.valid_nutrition_amount(double precision)') AND p.prosrc='
 SELECT p_value IS NOT NULL AND p_value>=0 AND p_value<''Infinity''::double precision
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_value']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='boolean' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.valid_nutrition_amount(double precision)'; END IF;
 IF has_function_privilege('anon','privacy_private.valid_nutrition_amount(double precision)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.valid_nutrition_amount(double precision)','EXECUTE') OR has_function_privilege('service_role','privacy_private.valid_nutrition_amount(double precision)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.valid_nutrition_amount(double precision)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.profile_nutrition(uuid,text,text)') AND p.prosrc='
DECLARE
 start_day date; end_day date; day_count integer; day_index integer;
 r record; g record; goal_count integer:=0; current_goals jsonb:=NULL;
 day_cal double precision[]; day_p double precision[]; day_c double precision[];
 day_f double precision[]; day_fib double precision[]; tracked boolean[];
 cals double precision; protein double precision; carbs double precision;
 fats double precision; fiber double precision; grams double precision; divisor double precision; ratio double precision;
 total_cal double precision:=0; total_p double precision:=0; total_c double precision:=0;
 total_f double precision:=0; total_fib double precision:=0;
 days jsonb:=''[]''::jsonb; tracked_count integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.can_view_profile(p_target),false) THEN
  RAISE EXCEPTION ''profile unavailable'' USING ERRCODE=''42501'';
 END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$''
 OR p_to !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' OR left(p_from,4)=''0000'' OR left(p_to,4)=''0000'' THEN
  RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023'';
 END IF;
 BEGIN
  start_day:=p_from::date; end_day:=p_to::date;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023''; END;
 day_count:=end_day-start_day+1;
 IF to_char(start_day,''YYYY-MM-DD'')<>p_from OR to_char(end_day,''YYYY-MM-DD'')<>p_to
 OR day_count<1 OR day_count>366 THEN
  RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023'';
 END IF;
 -- All data failures below become one generic unavailable error, never a partial
 -- response, row identifier, input value, raw SQL error or fabricated zero read.
 BEGIN
  day_cal:=array_fill(0::double precision,ARRAY[day_count]);
  day_p:=day_cal; day_c:=day_cal; day_f:=day_cal; day_fib:=day_cal;
  tracked:=array_fill(false,ARRAY[day_count]);
  FOR g IN SELECT daily_calories,protein_g,carbs_g,fats_g,fiber_g
   FROM public.goals WHERE user_id=p_target AND is_active IS TRUE LOOP
   goal_count:=goal_count+1;
   IF goal_count>1 OR NOT privacy_private.valid_nutrition_amount(g.daily_calories)
    OR NOT privacy_private.valid_nutrition_amount(g.protein_g)
    OR NOT privacy_private.valid_nutrition_amount(g.carbs_g)
    OR NOT privacy_private.valid_nutrition_amount(g.fats_g)
    OR NOT privacy_private.valid_nutrition_amount(g.fiber_g) THEN RAISE EXCEPTION ''invalid goals''; END IF;
   current_goals:=jsonb_build_object(''calories'',g.daily_calories,''protein'',g.protein_g,
    ''carbs'',g.carbs_g,''fats'',g.fats_g,''fiber'',g.fiber_g);
  END LOOP;
  -- Target filter and date bounds occur in SQL, before aggregation. No raw rows
  -- leave this SECURITY DEFINER. Scheduled items are read only to exclude them.
  FOR r IN SELECT m.date AS diary_date,i.calories,i.protein,i.carbs,i.fats,i.fiber,
   i.is_scheduled,i.grams,f.id IS NOT NULL AS has_food,
   f.calories AS food_calories,f.protein AS food_protein,f.carbs AS food_carbs,
   f.fat AS food_fat,f.fiber AS food_fiber,f.serving_size,f.macros_per
   FROM public.meals m JOIN public.meal_items i ON i.meal_id=m.id
   LEFT JOIN public.food_items f ON f.id=i.food_item_id
   WHERE m.user_id=p_target AND m.date>=start_day AND m.date<=end_day
   ORDER BY m.date,m.id,i.id LOOP
   IF r.is_scheduled IS NULL THEN RAISE EXCEPTION ''missing scheduling state''; END IF;
   IF r.is_scheduled THEN CONTINUE; END IF;
   -- Captured meal_items columns are NOT NULL. Missing/nonfinite/corrupt stored
   -- nutrient data is unavailable even if old UI would have silently coalesced it.
   IF NOT privacy_private.valid_nutrition_amount(r.calories::double precision)
    OR NOT privacy_private.valid_nutrition_amount(r.protein::double precision)
    OR NOT privacy_private.valid_nutrition_amount(r.carbs::double precision)
    OR NOT privacy_private.valid_nutrition_amount(r.fats::double precision)
    OR NOT privacy_private.valid_nutrition_amount(r.fiber::double precision) THEN RAISE EXCEPTION ''invalid item''; END IF;
   IF r.calories>0 THEN
    cals:=r.calories; protein:=r.protein; carbs:=r.carbs; fats:=r.fats; fiber:=r.fiber;
   ELSIF NOT r.has_food THEN
    -- EXPLICIT LEGACY SCREENSHOT POLICY: zero calories without joined food turns
    -- all five nutrients into zeros. This ambiguity is not silently corrected here.
    cals:=0; protein:=0; carbs:=0; fats:=0; fiber:=0;
   ELSE
    grams:=coalesce(r.grams,0)::double precision;
    IF NOT privacy_private.valid_nutrition_amount(grams)
     OR (r.serving_size IS NOT NULL AND NOT privacy_private.valid_nutrition_amount(r.serving_size::double precision))
     OR (r.food_calories IS NOT NULL AND NOT privacy_private.valid_nutrition_amount(r.food_calories::double precision))
     OR (r.food_protein IS NOT NULL AND NOT privacy_private.valid_nutrition_amount(r.food_protein::double precision))
     OR (r.food_carbs IS NOT NULL AND NOT privacy_private.valid_nutrition_amount(r.food_carbs::double precision))
     OR (r.food_fat IS NOT NULL AND NOT privacy_private.valid_nutrition_amount(r.food_fat::double precision))
     OR (r.food_fiber IS NOT NULL AND NOT privacy_private.valid_nutrition_amount(r.food_fiber::double precision)) THEN RAISE EXCEPTION ''invalid fallback''; END IF;
    IF grams=0 THEN
     cals:=0; protein:=0; carbs:=0; fats:=0; fiber:=0;
    ELSE
     IF r.food_calories IS NULL OR r.food_protein IS NULL OR r.food_carbs IS NULL OR r.food_fat IS NULL THEN
      RAISE EXCEPTION ''missing food nutrients'';
     END IF;
     -- Exact source calcMacros formula, with no invented kcal formula or rounding.
     divisor:=CASE WHEN r.macros_per=''serving'' AND r.serving_size>0 THEN r.serving_size ELSE 100 END;
     ratio:=grams/divisor;
     cals:=r.food_calories::double precision*ratio; protein:=r.food_protein::double precision*ratio;
     carbs:=r.food_carbs::double precision*ratio; fats:=r.food_fat::double precision*ratio;
     fiber:=coalesce(r.food_fiber,0)::double precision*ratio;
    END IF;
   END IF;
   IF NOT privacy_private.valid_nutrition_amount(cals) OR NOT privacy_private.valid_nutrition_amount(protein)
    OR NOT privacy_private.valid_nutrition_amount(carbs) OR NOT privacy_private.valid_nutrition_amount(fats)
    OR NOT privacy_private.valid_nutrition_amount(fiber) THEN RAISE EXCEPTION ''invalid normalized nutrients''; END IF;
   day_index:=r.diary_date-start_day+1; tracked[day_index]:=true;
   day_cal[day_index]:=day_cal[day_index]+cals; day_p[day_index]:=day_p[day_index]+protein;
   day_c[day_index]:=day_c[day_index]+carbs; day_f[day_index]:=day_f[day_index]+fats;
   day_fib[day_index]:=day_fib[day_index]+fiber;
   total_cal:=total_cal+cals; total_p:=total_p+protein; total_c:=total_c+carbs;
   total_f:=total_f+fats; total_fib:=total_fib+fiber;
   IF NOT privacy_private.valid_nutrition_amount(total_cal) OR NOT privacy_private.valid_nutrition_amount(total_p)
    OR NOT privacy_private.valid_nutrition_amount(total_c) OR NOT privacy_private.valid_nutrition_amount(total_f)
    OR NOT privacy_private.valid_nutrition_amount(total_fib) THEN RAISE EXCEPTION ''invalid totals''; END IF;
  END LOOP;
  FOR day_index IN 1..day_count LOOP
   IF tracked[day_index] THEN tracked_count:=tracked_count+1; END IF;
   days:=days||jsonb_build_array(jsonb_build_object(''date'',to_char(start_day+day_index-1,''YYYY-MM-DD''),
    ''has_logged_items'',tracked[day_index],''calories'',day_cal[day_index],''protein'',day_p[day_index],
    ''carbs'',day_c[day_index],''fats'',day_f[day_index],''fiber'',day_fib[day_index]));
  END LOOP;
  RETURN jsonb_build_object(''from_date'',p_from,''to_date'',p_to,''day_count'',day_count,
   ''date_basis'',''meal_date'',''calendar_basis'',''request_calendar_dates'',''goals_scope'',''current'',
   ''current_goals'',current_goals,''days'',days,''days_tracked'',tracked_count,
   ''totals'',jsonb_build_object(''calories'',total_cal,''protein'',total_p,''carbs'',total_c,''fats'',total_f,''fiber'',total_fib),
   ''daily_average'',jsonb_build_object(''calories'',total_cal/day_count,''protein'',total_p/day_count,
    ''carbs'',total_c/day_count,''fats'',total_f/day_count,''fiber'',total_fib/day_count),
   ''units'',jsonb_build_object(''calories'',''kcal'',''protein'',''g'',''carbs'',''g'',''fats'',''g'',''fiber'',''g''));
 EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION ''nutrition unavailable'' USING ERRCODE=''P0001'';
 END;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target','p_from','p_to']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['DateStyle=ISO, YMD','row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.profile_nutrition(uuid,text,text)'; END IF;
 IF has_function_privilege('anon','public.profile_nutrition(uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.profile_nutrition(uuid,text,text)','EXECUTE') OR has_function_privilege('service_role','public.profile_nutrition(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.profile_nutrition(uuid,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.discovery_text(text,integer)') AND p.prosrc='
 SELECT CASE WHEN p_value IS NOT NULL AND length(p_value)<=p_max AND length(p_value)+regexp_count(p_value,U&''[\+010000-\+10FFFF]'')<=p_max
  AND p_value !~ ''[[:cntrl:]]'' THEN p_value ELSE NULL END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_value','p_max']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='text' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.discovery_text(text,integer)'; END IF;
 IF has_function_privilege('anon','privacy_private.discovery_text(text,integer)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.discovery_text(text,integer)','EXECUTE') OR has_function_privilege('service_role','privacy_private.discovery_text(text,integer)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.discovery_text(text,integer)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.list_follow_request_inbox(text,integer)') AND p.prosrc='
DECLARE
 actor uuid:=privacy_private.registered_actor(); c privacy_private.follow_inbox_cursors%ROWTYPE;
 after_id uuid; expected_fingerprint text; result_fingerprint text; result_count integer;
 result_items jsonb; last_id uuid; has_more boolean; next_token uuid;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
  RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000'';
 END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION ''invalid page limit'' USING ERRCODE=''22023'';
 END IF;
 -- Serialize only cursor allocation for this owner; state mutations remain independent.
 PERFORM pg_advisory_xact_lock(hashtextextended(''follow-inbox:''||actor::text,0));
 IF p_cursor IS NOT NULL THEN
  IF length(p_cursor)<>36 OR p_cursor !~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' THEN
   RAISE EXCEPTION ''invalid inbox cursor'' USING ERRCODE=''22023'';
  END IF;
  SELECT * INTO c FROM privacy_private.follow_inbox_cursors
   WHERE token=p_cursor::uuid AND owner_id=actor AND expires_at>clock_timestamp() AND page_size=p_limit;
  IF NOT FOUND THEN RAISE EXCEPTION ''inbox refresh required'' USING ERRCODE=''22023''; END IF;
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
  WHERE r.owner_id=actor AND r.state=''pending''
    AND NOT privacy_private.is_blocked(actor,r.requester_id)
  ORDER BY r.id LIMIT 10001
 ), stats AS (
  SELECT count(*)::integer AS n,
   encode(sha256(convert_to(coalesce(string_agg(id::text||'':''||revision::text,'','' ORDER BY id),''''),''UTF8'')),''hex'') AS fingerprint
  FROM eligible
 ), page AS MATERIALIZED (
  SELECT * FROM eligible WHERE after_id IS NULL OR id>after_id ORDER BY id LIMIT p_limit
 )
 SELECT s.n,s.fingerprint,
  coalesce((SELECT jsonb_agg(jsonb_build_object(
    ''requestId'',p.id::text,''requesterId'',p.requester_id::text,''revision'',p.revision::text,
    ''displayName'',p.display_name,''username'',p.username,''avatarUrl'',p.avatar_url) ORDER BY p.id) FROM page p),''[]''::jsonb),
  (SELECT id FROM page ORDER BY id DESC LIMIT 1),
  EXISTS(SELECT 1 FROM eligible WHERE id>(SELECT id FROM page ORDER BY id DESC LIMIT 1))
 INTO result_count,result_fingerprint,result_items,last_id,has_more FROM stats s;
 IF result_count>10000 THEN RAISE EXCEPTION ''inbox temporarily unavailable'' USING ERRCODE=''54000''; END IF;
 IF expected_fingerprint IS NOT NULL AND expected_fingerprint<>result_fingerprint THEN
  RAISE EXCEPTION ''inbox refresh required'' USING ERRCODE=''40001'';
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
 RETURN jsonb_build_object(''ownerUserId'',actor::text,''items'',result_items,
  ''totalPending'',result_count,''nextCursor'',next_token::text);
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_cursor','p_limit']::text[] AND p.pronargdefaults=2 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM 'NULL::text, 20' AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.list_follow_request_inbox(text,integer)'; END IF;
 IF has_function_privilege('anon','public.list_follow_request_inbox(text,integer)','EXECUTE') OR has_function_privilege('authenticated','public.list_follow_request_inbox(text,integer)','EXECUTE') OR has_function_privilege('service_role','public.list_follow_request_inbox(text,integer)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.list_follow_request_inbox(text,integer)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.respond_follow_request(uuid,uuid,text,text)') AND p.prosrc='
DECLARE actor uuid:=privacy_private.registered_actor(); prior public.follow_requests%ROWTYPE; changed public.follow_requests%ROWTYPE; expected bigint;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_request_id IS NULL OR p_requester_id IS NULL OR p_requester_id=actor
 OR p_decision IS NULL OR p_decision NOT IN (''accept'',''reject'') THEN
  RAISE EXCEPTION ''invalid follow response'' USING ERRCODE=''22023'';
 END IF;
 IF p_expected_revision IS NULL OR length(p_expected_revision)>16
 OR p_expected_revision !~ ''^[1-9][0-9]{0,15}$'' THEN
  RAISE EXCEPTION ''invalid revision'' USING ERRCODE=''22023'';
 END IF;
 expected:=p_expected_revision::bigint;
 IF expected>9007199254740991 THEN RAISE EXCEPTION ''invalid revision'' USING ERRCODE=''22023''; END IF;
 PERFORM privacy_private.lock_pair(actor,p_requester_id);
 SELECT * INTO prior FROM public.follow_requests
  WHERE owner_id=actor AND requester_id=p_requester_id FOR UPDATE;
 IF NOT FOUND OR prior.id<>p_request_id OR privacy_private.is_blocked(actor,p_requester_id) THEN
  RAISE EXCEPTION ''request unavailable'' USING ERRCODE=''P0002'';
 END IF;
 IF prior.revision<>expected THEN RAISE EXCEPTION ''revision conflict'' USING ERRCODE=''40001''; END IF;
 IF prior.state<>''pending'' THEN RAISE EXCEPTION ''state conflict'' USING ERRCODE=''55000''; END IF;
 SELECT * INTO changed FROM public.change_follow_request(p_requester_id,p_decision,expected);
 IF changed.id<>prior.id OR changed.owner_id<>actor OR changed.requester_id<>p_requester_id
 OR changed.revision<>prior.revision+1
 OR changed.state<>(CASE p_decision WHEN ''accept'' THEN ''accepted'' ELSE ''rejected'' END) THEN
  RAISE EXCEPTION ''invalid transition result'' USING ERRCODE=''55000'';
 END IF;
 RETURN jsonb_build_object(''ownerUserId'',actor::text,''requestId'',changed.id::text,
  ''requesterId'',p_requester_id::text,''previousRevision'',prior.revision::text,
  ''revision'',changed.revision::text,''state'',changed.state);
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_request_id','p_requester_id','p_expected_revision','p_decision']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.respond_follow_request(uuid,uuid,text,text)'; END IF;
 IF has_function_privilege('anon','public.respond_follow_request(uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.respond_follow_request(uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('service_role','public.respond_follow_request(uuid,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.respond_follow_request(uuid,uuid,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.change_outbound_follow(uuid,uuid,text,text)') AND p.prosrc='
DECLARE actor uuid:=privacy_private.registered_actor(); prior public.follow_requests%ROWTYPE;
 changed public.follow_requests%ROWTYPE; expected bigint; prior_exists boolean; previous_revision text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_target_id IS NULL OR p_target_id=actor OR p_action IS NULL OR p_action NOT IN (''request'',''cancel'',''unfollow'') THEN
  RAISE EXCEPTION ''invalid outbound action'' USING ERRCODE=''22023'';
 END IF;
 IF p_expected_revision IS NULL OR length(p_expected_revision)>16
 OR p_expected_revision !~ ''^(0|[1-9][0-9]{0,15})$'' THEN
  RAISE EXCEPTION ''invalid revision'' USING ERRCODE=''22023''; END IF;
 expected:=p_expected_revision::bigint;
 IF expected>9007199254740991 THEN RAISE EXCEPTION ''invalid revision'' USING ERRCODE=''22023''; END IF;
 IF (p_action<>''request'' AND (p_request_id IS NULL OR expected=0))
 OR (p_request_id IS NULL AND expected<>0) THEN
  RAISE EXCEPTION ''request identity required'' USING ERRCODE=''22023''; END IF;
 PERFORM privacy_private.lock_pair(actor,p_target_id);
 SELECT * INTO prior FROM public.follow_requests WHERE requester_id=actor AND owner_id=p_target_id FOR UPDATE;
 prior_exists:=FOUND;
 IF prior_exists THEN
  IF p_request_id IS NOT NULL AND p_request_id<>prior.id THEN
   RAISE EXCEPTION ''request unavailable'' USING ERRCODE=''P0002''; END IF;
  -- A retried initial request may safely return current pending/accepted state.
  -- Reopening a terminal row needs its actual identity and exact observed revision.
  IF p_action=''request'' AND prior.state NOT IN (''pending'',''accepted'') AND p_request_id IS NULL THEN
   RAISE EXCEPTION ''request refresh required'' USING ERRCODE=''40001''; END IF;
  previous_revision:=prior.revision::text;
 ELSE
  IF p_request_id IS NOT NULL THEN RAISE EXCEPTION ''request unavailable'' USING ERRCODE=''P0002''; END IF;
  previous_revision:=''0'';
 END IF;
 SELECT * INTO changed FROM public.change_follow_request(p_target_id,p_action,expected);
 IF changed.requester_id<>actor OR changed.owner_id<>p_target_id
 OR (prior_exists AND changed.id<>prior.id)
 OR changed.state NOT IN (''pending'',''accepted'',''cancelled'',''revoked'') THEN
  RAISE EXCEPTION ''invalid transition result'' USING ERRCODE=''55000''; END IF;
 RETURN jsonb_build_object(''requesterUserId'',actor::text,''targetUserId'',p_target_id::text,
  ''action'',p_action,''previousRevision'',previous_revision,
  ''follow_request'',jsonb_build_object(''request_id'',changed.id::text,''revision'',changed.revision::text,''state'',changed.state));
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='v' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target_id','p_request_id','p_expected_revision','p_action']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.change_outbound_follow(uuid,uuid,text,text)'; END IF;
 IF has_function_privilege('anon','public.change_outbound_follow(uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.change_outbound_follow(uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('service_role','public.change_outbound_follow(uuid,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.change_outbound_follow(uuid,uuid,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.snapshot_text(text,integer)') AND p.prosrc='
 SELECT CASE WHEN p_value IS NOT NULL AND length(p_value)<=p_max
  AND p_value !~ ''[[:cntrl:]]'' THEN nullif(btrim(p_value),'''') ELSE NULL END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_value','p_max']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='text' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.snapshot_text(text,integer)'; END IF;
 IF has_function_privilege('anon','privacy_private.snapshot_text(text,integer)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.snapshot_text(text,integer)','EXECUTE') OR has_function_privilege('service_role','privacy_private.snapshot_text(text,integer)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.snapshot_text(text,integer)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.snapshot_name(text,text)') AND p.prosrc='
 SELECT coalesce(
  CASE WHEN p_name IS NOT NULL AND length(p_name)<=200
   AND length(p_name)+regexp_count(p_name,U&''[\+010000-\+10FFFF]'')<=200 THEN p_name ELSE NULL END,
  CASE WHEN p_full_name IS NOT NULL AND length(p_full_name)<=200
   AND length(p_full_name)+regexp_count(p_full_name,U&''[\+010000-\+10FFFF]'')<=200 THEN p_full_name ELSE NULL END)
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_name','p_full_name']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='text' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.snapshot_name(text,text)'; END IF;
 IF has_function_privilege('anon','privacy_private.snapshot_name(text,text)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.snapshot_name(text,text)','EXECUTE') OR has_function_privilege('service_role','privacy_private.snapshot_name(text,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.snapshot_name(text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.snapshot_bio(text)') AND p.prosrc='
 SELECT CASE WHEN p_value IS NOT NULL AND length(p_value)<=4000
  AND length(p_value)+regexp_count(p_value,U&''[\+010000-\+10FFFF]'')<=4000
 THEN p_value ELSE NULL END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_value']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='text' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.snapshot_bio(text)'; END IF;
 IF has_function_privilege('anon','privacy_private.snapshot_bio(text)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.snapshot_bio(text)','EXECUTE') OR has_function_privilege('service_role','privacy_private.snapshot_bio(text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.snapshot_bio(text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.snapshot_date(text)') AND p.prosrc='
DECLARE d date;
BEGIN
 IF p_value IS NULL OR p_value !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' OR left(p_value,4)=''0000'' THEN
  RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023'';
 END IF;
 BEGIN d:=p_value::date;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023''; END;
 IF to_char(d,''YYYY-MM-DD'')<>p_value THEN RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023''; END IF;
 RETURN d;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_value']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='date' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['DateStyle=ISO, YMD','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.snapshot_date(text)'; END IF;
 IF has_function_privilege('anon','privacy_private.snapshot_date(text)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.snapshot_date(text)','EXECUTE') OR has_function_privilege('service_role','privacy_private.snapshot_date(text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.snapshot_date(text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.snapshot_consistency_score(uuid,date,double precision,double precision)') AND p.prosrc='
DECLARE
 r record; i integer; tracked boolean[]:=array_fill(false,ARRAY[30]);
 calories double precision[]:=array_fill(0::double precision,ARRAY[30]);
 protein double precision[]:=array_fill(0::double precision,ARRAY[30]);
 cal_pct double precision; protein_pct double precision; cal_points double precision;
 protein_points double precision; total double precision:=0; start_day date:=p_as_of-29;
BEGIN
 IF NOT privacy_private.valid_nutrition_amount(p_calorie_target)
 OR NOT privacy_private.valid_nutrition_amount(p_protein_target) THEN RAISE EXCEPTION ''score unavailable''; END IF;
 FOR r IN SELECT m.date,i.id IS NOT NULL AS has_item,i.is_scheduled,i.calories,i.protein
  FROM public.meals m LEFT JOIN public.meal_items i ON i.meal_id=m.id
  WHERE m.user_id=p_target AND m.date>=start_day AND m.date<=p_as_of ORDER BY m.date,m.id,i.id LOOP
  i:=r.date-start_day+1; tracked[i]:=true;
  IF NOT r.has_item THEN CONTINUE; END IF;
  IF r.is_scheduled IS NULL THEN RAISE EXCEPTION ''score unavailable''; END IF;
  IF r.is_scheduled THEN CONTINUE; END IF;
  IF NOT privacy_private.valid_nutrition_amount(r.calories::double precision)
   OR NOT privacy_private.valid_nutrition_amount(r.protein::double precision) THEN RAISE EXCEPTION ''score unavailable''; END IF;
  calories[i]:=calories[i]+r.calories::double precision;
  protein[i]:=protein[i]+r.protein::double precision;
  IF NOT privacy_private.valid_nutrition_amount(calories[i]) OR NOT privacy_private.valid_nutrition_amount(protein[i]) THEN
   RAISE EXCEPTION ''score unavailable'';
  END IF;
 END LOOP;
 FOR i IN 1..30 LOOP
  IF NOT tracked[i] THEN CONTINUE; END IF;
  cal_pct:=CASE WHEN p_calorie_target>0 THEN calories[i]/p_calorie_target*100 ELSE 0 END;
  protein_pct:=CASE WHEN p_protein_target>0 THEN protein[i]/p_protein_target*100 ELSE 0 END;
  IF NOT privacy_private.valid_nutrition_amount(cal_pct) OR NOT privacy_private.valid_nutrition_amount(protein_pct) THEN RAISE EXCEPTION ''score unavailable''; END IF;
  cal_points:=CASE WHEN cal_pct>=95 AND cal_pct<=105 THEN 30 WHEN cal_pct>=85 THEN 24
   WHEN cal_pct>=70 THEN 18 WHEN cal_pct>=50 THEN 12 ELSE least(6,cal_pct/50*6) END;
  protein_points:=CASE WHEN protein_pct>=95 AND protein_pct<=105 THEN 20 WHEN protein_pct>=85 THEN 16
   WHEN protein_pct>=70 THEN 12 WHEN protein_pct>=50 THEN 8 ELSE least(4,protein_pct/50*4) END;
  total:=total+50+cal_points+protein_points;
 END LOOP;
 -- Scores are nonnegative; floor(x+0.5) is JavaScript Math.round parity.
 RETURN floor(total/30+0.5)::integer;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target','p_as_of','p_calorie_target','p_protein_target']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='integer' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.snapshot_consistency_score(uuid,date,double precision,double precision)'; END IF;
 IF has_function_privilege('anon','privacy_private.snapshot_consistency_score(uuid,date,double precision,double precision)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.snapshot_consistency_score(uuid,date,double precision,double precision)','EXECUTE') OR has_function_privilege('service_role','privacy_private.snapshot_consistency_score(uuid,date,double precision,double precision)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.snapshot_consistency_score(uuid,date,double precision,double precision)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.profile_snapshot(uuid,text,text,text)') AND p.prosrc='
DECLARE
 actor uuid:=privacy_private.registered_actor(); u record; xp record; goals record;
 own boolean; follows boolean; followed_by boolean; accepted boolean:=false;
 request_state text:=NULL; request_descriptor jsonb:=NULL; chosen_name text; allowed boolean; response jsonb; discovery jsonb; identity jsonb;
 nutrition jsonb:=NULL; metrics jsonb; reason text; start_day date; end_day date; today date;
 streak jsonb:=''{"status":"unavailable"}''::jsonb;
 since jsonb:=''{"status":"unavailable"}''::jsonb;
 consistency jsonb:=''{"status":"unavailable"}''::jsonb;
 followers jsonb:=''{"status":"unavailable"}''::jsonb;
 following jsonb:=''{"status":"unavailable"}''::jsonb;
 posts jsonb:=''{"status":"unavailable"}''::jsonb;
 count_value bigint; score_value integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_target IS NULL THEN RAISE EXCEPTION ''invalid target'' USING ERRCODE=''22023''; END IF;
 start_day:=privacy_private.snapshot_date(p_from); end_day:=privacy_private.snapshot_date(p_to);
 today:=privacy_private.snapshot_date(p_today);
 IF end_day<start_day OR end_day-start_day+1>366 OR today-29<DATE ''0001-01-01'' THEN
  RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023'';
 END IF;
 own:=actor=p_target;
 response:=jsonb_build_object(''response_version'',2,''target_user_id'',p_target::text,
  ''can_discover_profile'',false,''follow_request_state'',NULL,''follow_request'',NULL,''is_accepted_follower'',NULL,
  ''can_view_profile'',false,''can_view_nutrition'',false,''nutrition_unavailable_reason'',''profile_unavailable'',
  ''is_own_profile'',own,''is_following'',NULL,''is_mutual'',NULL,
  ''discovery'',NULL,''user'',NULL,''nutrition'',NULL,''metrics'',NULL);
 -- Only discovery projection is read until the canonical full-profile guard passes.
 SELECT id,username,name,full_name,avatar_url INTO u FROM public.users WHERE id=p_target;
 IF NOT FOUND OR (NOT own AND privacy_private.is_blocked(actor,p_target)) THEN RETURN response; END IF;
 chosen_name:=privacy_private.snapshot_name(u.name,u.full_name);
 discovery:=jsonb_build_object(''id'',p_target::text,
  ''username'',privacy_private.snapshot_text(u.username,100),
  ''name'',chosen_name,''full_name'',chosen_name,
  ''avatar_url'',privacy_private.approved_avatar_url(p_target,u.avatar_url));
 SELECT EXISTS(SELECT 1 FROM public.social_follows WHERE follower_id=actor AND following_id=p_target),
  EXISTS(SELECT 1 FROM public.social_follows WHERE follower_id=p_target AND following_id=actor)
  INTO follows,followed_by;
 IF NOT own THEN
  SELECT CASE WHEN state=''pending'' THEN ''pending''
   WHEN state=''accepted'' AND accepted_by=p_target AND accepted_at IS NOT NULL THEN ''accepted''
   ELSE ''none'' END,
   jsonb_build_object(''request_id'',id::text,''revision'',revision::text,''state'',state)
   INTO request_state,request_descriptor
   FROM public.follow_requests WHERE requester_id=actor AND owner_id=p_target;
  request_state:=coalesce(request_state,''none'');
  accepted:=request_state=''accepted'' AND follows;
 END IF;
 allowed:=coalesce(public.can_view_profile(p_target),false);
 reason:=CASE WHEN allowed THEN NULL WHEN request_state=''pending'' THEN ''approval_pending''
  WHEN request_state=''accepted'' AND NOT follows THEN ''follow_required'' ELSE ''approval_required'' END;
 response:=response||jsonb_build_object(''can_discover_profile'',true,''discovery'',discovery,
  ''follow_request_state'',request_state,''follow_request'',request_descriptor,''is_accepted_follower'',accepted,''is_following'',follows,
  ''is_mutual'',follows AND followed_by,''nutrition_unavailable_reason'',reason);
 IF NOT allowed THEN RETURN response; END IF;
 SELECT bio,created_at,user_type,show_consistency_score INTO u FROM public.users WHERE id=p_target;
 identity:=discovery||jsonb_build_object(''bio'',privacy_private.snapshot_bio(u.bio),
  ''is_premium'',CASE WHEN u.user_type IS NULL THEN NULL ELSE u.user_type=''premium'' END);
 -- The same statement snapshot applies to the nested STABLE nutrition RPC. A data
 -- failure can withhold nutrition while preserving independently valid identity.
 BEGIN nutrition:=public.profile_nutrition(p_target,p_from,p_to);
 EXCEPTION WHEN OTHERS THEN nutrition:=NULL; END;
 BEGIN
  SELECT current_streak,longest_streak INTO STRICT xp FROM public.user_xp WHERE user_id=p_target;
  IF xp.current_streak>=0 AND xp.longest_streak>=xp.current_streak THEN
   streak:=jsonb_build_object(''status'',''available'',''current'',xp.current_streak,''best'',xp.longest_streak);
  END IF;
 EXCEPTION WHEN OTHERS THEN streak:=''{"status":"unavailable"}''::jsonb; END;
 BEGIN
  IF u.created_at IS NOT NULL AND isfinite(u.created_at)
   AND extract(year FROM u.created_at AT TIME ZONE ''UTC'') BETWEEN 1 AND 9999 THEN
   since:=jsonb_build_object(''status'',''available'',''month'',to_char(u.created_at AT TIME ZONE ''UTC'',''YYYY-MM''),''calendar_basis'',''UTC'');
  END IF;
 EXCEPTION WHEN OTHERS THEN since:=''{"status":"unavailable"}''::jsonb; END;
 IF u.show_consistency_score IS FALSE THEN
  consistency:=''{"status":"hidden"}''::jsonb;
 ELSIF u.show_consistency_score IS TRUE THEN
  BEGIN
   -- Actual current targets only. Missing/failed goals are unavailable, rather
   -- than reproducing the screenshot''s fabricated 2000/150 fallback targets.
   SELECT daily_calories,protein_g INTO STRICT goals FROM public.goals WHERE user_id=p_target AND is_active IS TRUE;
   score_value:=privacy_private.snapshot_consistency_score(p_target,today,goals.daily_calories,goals.protein_g);
   consistency:=jsonb_build_object(''status'',''available'',''score'',score_value,
    ''from_date'',to_char(today-29,''YYYY-MM-DD''),''to_date'',p_today,''day_count'',30);
  EXCEPTION WHEN OTHERS THEN consistency:=''{"status":"unavailable"}''::jsonb; END;
 END IF;
 BEGIN
  SELECT count(*) INTO count_value FROM public.follow_requests r
   JOIN public.social_follows f ON f.follower_id=r.requester_id AND f.following_id=r.owner_id
   WHERE r.owner_id=p_target AND r.state=''accepted'' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
    AND NOT privacy_private.is_blocked(r.requester_id,r.owner_id)
    AND NOT privacy_private.is_blocked(actor,r.requester_id);
  IF count_value<=9007199254740991 THEN followers:=jsonb_build_object(''status'',''available'',''value'',count_value); END IF;
 EXCEPTION WHEN OTHERS THEN followers:=''{"status":"unavailable"}''::jsonb; END;
 BEGIN
  SELECT count(*) INTO count_value FROM public.follow_requests r
   JOIN public.social_follows f ON f.follower_id=r.requester_id AND f.following_id=r.owner_id
   WHERE r.requester_id=p_target AND r.state=''accepted'' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
    AND NOT privacy_private.is_blocked(r.requester_id,r.owner_id)
    AND NOT privacy_private.is_blocked(actor,r.owner_id);
  IF count_value<=9007199254740991 THEN following:=jsonb_build_object(''status'',''available'',''value'',count_value); END IF;
 EXCEPTION WHEN OTHERS THEN following:=''{"status":"unavailable"}''::jsonb; END;
 -- Count precisely the complete post set eligible for list_profile_posts (81),
 -- before pagination. Acceptance/self was checked above; it never expands
 -- private post audiences. COUNT(*) reads no selected weight or media fields.
 BEGIN
  SELECT count(*) INTO count_value FROM public.social_posts p
   WHERE p.user_id=p_target AND (p.is_public IS TRUE OR actor=p.user_id);
  -- JSON numbers must survive the shared JavaScript safe-integer contract.
  posts:=CASE WHEN count_value BETWEEN 0 AND 9007199254740991
   THEN jsonb_build_object(''status'',''available'',''value'',count_value)
   ELSE jsonb_build_object(''status'',''unavailable'') END;
 EXCEPTION WHEN OTHERS THEN posts:=''{"status":"unavailable"}''::jsonb; END;
 metrics:=jsonb_build_object(''streak'',streak,''member_since'',since,''consistency'',consistency,
  ''followers_count'',followers,''following_count'',following,''posts_count'',posts);
 RETURN response||jsonb_build_object(''can_view_profile'',true,''user'',identity,
  ''can_view_nutrition'',nutrition IS NOT NULL,''nutrition'',nutrition,''metrics'',metrics,
  ''nutrition_unavailable_reason'',CASE WHEN nutrition IS NULL THEN ''nutrition_unavailable'' ELSE NULL END);
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target','p_from','p_to','p_today']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['DateStyle=ISO, YMD','row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.profile_snapshot(uuid,text,text,text)'; END IF;
 IF has_function_privilege('anon','public.profile_snapshot(uuid,text,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.profile_snapshot(uuid,text,text,text)','EXECUTE') OR has_function_privilege('service_role','public.profile_snapshot(uuid,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.profile_snapshot(uuid,text,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.discovery_identity_json(uuid,text,text,text,text)') AND p.prosrc='
 SELECT jsonb_build_object(''id'',p_id::text,
  ''username'',privacy_private.profile_text(p_username,100),
  ''name'',coalesce(privacy_private.profile_text(p_name,200),privacy_private.profile_text(p_full_name,200)),
  ''full_name'',coalesce(privacy_private.profile_text(p_name,200),privacy_private.profile_text(p_full_name,200)),
  ''avatar_url'',privacy_private.approved_avatar_url(p_id,p_avatar))
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_id','p_username','p_name','p_full_name','p_avatar']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.discovery_identity_json(uuid,text,text,text,text)'; END IF;
 IF has_function_privilege('anon','privacy_private.discovery_identity_json(uuid,text,text,text,text)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.discovery_identity_json(uuid,text,text,text,text)','EXECUTE') OR has_function_privilege('service_role','privacy_private.discovery_identity_json(uuid,text,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.discovery_identity_json(uuid,text,text,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.search_profile_identities(text,integer,uuid)') AND p.prosrc='
DECLARE actor uuid:=privacy_private.registered_actor(); normalized text; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
  RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_query IS NULL OR length(p_query)>64 OR p_query ~ ''[[:cntrl:]]''
 OR length(p_query)+regexp_count(p_query,U&''[\+010000-\+10FFFF]'')>64 THEN
  RAISE EXCEPTION ''invalid search query'' USING ERRCODE=''22023''; END IF;
 normalized:=btrim(p_query);
 IF length(normalized)+regexp_count(normalized,U&''[\+010000-\+10FFFF]'')<2 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION ''invalid search query or limit'' USING ERRCODE=''22023''; END IF;
 -- strpos treats %, _, quotes and backslashes literally. No dynamic SQL/LIKE pattern.
 WITH matched AS MATERIALIZED (
  SELECT u.id,u.username,u.name,u.full_name,u.avatar_url,
   lower(coalesce(privacy_private.profile_text(u.username,100),'''')) AS sort_name
  FROM public.users u
  WHERE NOT privacy_private.is_blocked(actor,u.id)
   AND (p_after_id IS NULL OR u.id>p_after_id)
   AND (strpos(lower(coalesce(privacy_private.profile_text(u.username,100),'''')),lower(normalized))>0
    OR strpos(lower(coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200),'''')),lower(normalized))>0)
  ORDER BY u.id LIMIT p_limit+1
 ), page AS (SELECT * FROM matched ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object(''query'',normalized,
  ''items'',coalesce((SELECT jsonb_agg(privacy_private.discovery_identity_json(id,username,name,full_name,avatar_url) ORDER BY id) FROM page),''[]''::jsonb),
  ''hasMore'',(SELECT count(*)>p_limit FROM matched),
  ''nextCursor'',CASE WHEN (SELECT count(*)>p_limit FROM matched) THEN (SELECT id::text FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_query','p_limit','p_after_id']::text[] AND p.pronargdefaults=2 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM '20, NULL::uuid' AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.search_profile_identities(text,integer,uuid)'; END IF;
 IF has_function_privilege('anon','public.search_profile_identities(text,integer,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.search_profile_identities(text,integer,uuid)','EXECUTE') OR has_function_privilege('service_role','public.search_profile_identities(text,integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.search_profile_identities(text,integer,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.list_accepted_profile_connections(uuid,text,integer,uuid)') AND p.prosrc='
DECLARE actor uuid:=privacy_private.registered_actor(); result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_target_id IS NULL OR p_direction IS NULL OR p_direction NOT IN (''followers'',''following'')
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION ''invalid connection query'' USING ERRCODE=''22023''; END IF;
 IF NOT public.can_view_profile(p_target_id) THEN
  RAISE EXCEPTION ''profile unavailable'' USING ERRCODE=''P0002''; END IF;
 -- STABLE function reads target authorization and payload within caller''s snapshot.
 -- Every returned edge independently needs fresh directional owner acceptance.
 WITH approved AS MATERIALIZED (
  SELECT u.id,u.username,u.name,u.full_name,u.avatar_url,
   lower(coalesce(privacy_private.profile_text(u.username,100),'''')) AS sort_name
  FROM public.follow_requests r
  JOIN public.social_follows f ON f.follower_id=r.requester_id AND f.following_id=r.owner_id
  JOIN public.users u ON u.id=CASE p_direction WHEN ''followers'' THEN r.requester_id ELSE r.owner_id END
  WHERE r.state=''accepted'' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
   AND (p_after_id IS NULL OR u.id>p_after_id)
   AND ((p_direction=''followers'' AND r.owner_id=p_target_id)
     OR (p_direction=''following'' AND r.requester_id=p_target_id))
   AND NOT privacy_private.is_blocked(r.requester_id,r.owner_id)
   AND NOT privacy_private.is_blocked(actor,u.id)
  ORDER BY u.id LIMIT p_limit+1
 ), page AS (SELECT * FROM approved ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object(''targetUserId'',p_target_id::text,''direction'',p_direction,
  ''items'',coalesce((SELECT jsonb_agg(privacy_private.discovery_identity_json(id,username,name,full_name,avatar_url) ORDER BY id) FROM page),''[]''::jsonb),
  ''hasMore'',(SELECT count(*)>p_limit FROM approved),
  ''nextCursor'',CASE WHEN (SELECT count(*)>p_limit FROM approved) THEN (SELECT id::text FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target_id','p_direction','p_limit','p_after_id']::text[] AND p.pronargdefaults=2 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM '20, NULL::uuid' AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.list_accepted_profile_connections(uuid,text,integer,uuid)'; END IF;
 IF has_function_privilege('anon','public.list_accepted_profile_connections(uuid,text,integer,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.list_accepted_profile_connections(uuid,text,integer,uuid)','EXECUTE') OR has_function_privilege('service_role','public.list_accepted_profile_connections(uuid,text,integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.list_accepted_profile_connections(uuid,text,integer,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.profile_post_cursor(timestamptz,uuid)') AND p.prosrc='
 SELECT rtrim(translate(replace(encode(convert_to(
  to_char(p_created_at AT TIME ZONE ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'')||''|''||p_id::text,
  ''UTF8''),''base64''),E''\n'',''''),''+/'',''-_''),''='')
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_created_at','p_id']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='text' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.profile_post_cursor(timestamptz,uuid)'; END IF;
 IF has_function_privilege('anon','privacy_private.profile_post_cursor(timestamptz,uuid)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.profile_post_cursor(timestamptz,uuid)','EXECUTE') OR has_function_privilege('service_role','privacy_private.profile_post_cursor(timestamptz,uuid)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.profile_post_cursor(timestamptz,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.list_profile_posts(uuid,integer,text)') AND p.prosrc='
DECLARE actor uuid:=privacy_private.registered_actor(); boundary_time timestamptz;
 boundary_id uuid; decoded text; result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_target_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION ''invalid post query'' USING ERRCODE=''22023''; END IF;
 IF NOT public.can_view_profile(p_target_id) THEN
  RAISE EXCEPTION ''profile unavailable'' USING ERRCODE=''P0002''; END IF;
 IF p_cursor IS NOT NULL THEN
  BEGIN
   IF length(p_cursor)>160 OR p_cursor !~ ''^[A-Za-z0-9_-]+$'' THEN RAISE EXCEPTION ''bad cursor''; END IF;
   decoded:=convert_from(decode(translate(p_cursor,''-_'',''+/'')||repeat(''='',(4-length(p_cursor)%4)%4),''base64''),''UTF8'');
   IF decoded !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z[|][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
    OR left(decoded,4)=''0000'' THEN RAISE EXCEPTION ''bad cursor''; END IF;
   boundary_time:=split_part(decoded,''|'',1)::timestamptz;
   boundary_id:=split_part(decoded,''|'',2)::uuid;
   IF privacy_private.profile_post_cursor(boundary_time,boundary_id) IS DISTINCT FROM p_cursor THEN RAISE EXCEPTION ''bad cursor''; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION ''invalid post cursor'' USING ERRCODE=''22023''; END;
 END IF;
 -- STABLE: authorization + result share one statement snapshot; every page
 -- rechecks authorization. Cursor is only an untrusted boundary, never a grant.
 WITH eligible AS MATERIALIZED (
  SELECT p.id,p.content,p.created_at,p.likes_count,p.post_type FROM public.social_posts p
  WHERE p.user_id=p_target_id AND (p.is_public IS TRUE OR actor=p.user_id)
   AND (p_cursor IS NULL OR (p.created_at,p.id)<(boundary_time,boundary_id))
  ORDER BY p.created_at DESC,p.id DESC LIMIT p_limit+1
 ), page AS (SELECT * FROM eligible ORDER BY created_at DESC,id DESC LIMIT p_limit)
 SELECT jsonb_build_object(''targetUserId'',p_target_id::text,
  ''items'',coalesce((SELECT jsonb_agg(jsonb_build_object(''id'',id::text,''content'',content,
    ''created_at'',to_char(created_at AT TIME ZONE ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"''),
    ''likes_count'',likes_count,''post_type'',post_type) ORDER BY created_at DESC,id DESC) FROM page),''[]''::jsonb),
  ''hasMore'',(SELECT count(*)>p_limit FROM eligible),
  ''nextCursor'',CASE WHEN (SELECT count(*)>p_limit FROM eligible) THEN
    (SELECT privacy_private.profile_post_cursor(created_at,id) FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END)
 INTO result;
 RETURN result;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target_id','p_limit','p_cursor']::text[] AND p.pronargdefaults=2 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM '20, NULL::text' AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['DateStyle=ISO, YMD','TimeZone=UTC','row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.list_profile_posts(uuid,integer,text)'; END IF;
 IF has_function_privilege('anon','public.list_profile_posts(uuid,integer,text)','EXECUTE') OR has_function_privilege('authenticated','public.list_profile_posts(uuid,integer,text)','EXECUTE') OR has_function_privilege('service_role','public.list_profile_posts(uuid,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.list_profile_posts(uuid,integer,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.weekly_date(text)') AND p.prosrc='
DECLARE d date;
BEGIN
 IF p_value IS NULL OR p_value !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' OR left(p_value,4)=''0000'' THEN
  RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023''; END IF;
 BEGIN d:=p_value::date;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023''; END;
 IF to_char(d,''YYYY-MM-DD'') IS DISTINCT FROM p_value THEN RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023''; END IF;
 RETURN d;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_value']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='date' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['DateStyle=ISO, YMD','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.weekly_date(text)'; END IF;
 IF has_function_privilege('anon','privacy_private.weekly_date(text)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.weekly_date(text)','EXECUTE') OR has_function_privilege('service_role','privacy_private.weekly_date(text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.weekly_date(text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('privacy_private.valid_weekly_amount(double precision)') AND p.prosrc='
 SELECT p_value IS NOT NULL AND p_value>=0 AND p_value<=1e12
' AND p.proowner='postgres'::regrole AND p.prosecdef=false AND p.provolatile='i' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_value']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='boolean' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: privacy_private.valid_weekly_amount(double precision)'; END IF;
 IF has_function_privilege('anon','privacy_private.valid_weekly_amount(double precision)','EXECUTE') OR has_function_privilege('authenticated','privacy_private.valid_weekly_amount(double precision)','EXECUTE') OR has_function_privilege('service_role','privacy_private.valid_weekly_amount(double precision)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: privacy_private.valid_weekly_amount(double precision)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.profile_weekly_tracking(uuid,text,text)') AND p.prosrc='
DECLARE actor uuid:=privacy_private.registered_actor(); start_day date;end_day date;day_count integer;
 share boolean; r record;idx integer; tracked boolean[];calories double precision[];protein double precision[];
 calorie_target double precision:=2000; protein_target double precision:=150;
 cal_pct double precision;prot_pct double precision;cal_pts double precision;prot_pts double precision;
 total double precision:=0;meal_days integer:=0;score_value integer;
 consistency jsonb;tracking jsonb;envelope jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_target_id IS NULL THEN RAISE EXCEPTION ''invalid target'' USING ERRCODE=''22023''; END IF;
 start_day:=privacy_private.weekly_date(p_from);end_day:=privacy_private.weekly_date(p_to);
 day_count:=end_day-start_day+1;
 IF day_count NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION ''invalid date range'' USING ERRCODE=''22023''; END IF;
 IF NOT public.can_view_profile(p_target_id) THEN RAISE EXCEPTION ''profile unavailable'' USING ERRCODE=''P0002''; END IF;
 envelope:=jsonb_build_object(''targetUserId'',p_target_id::text,''fromDate'',p_from,''toDate'',p_to);
 SELECT show_consistency_score INTO share FROM public.users WHERE id=p_target_id;
 -- Conservative: hidden consistency also withholds meal-day/flags from others.
 -- Owner retains tracking. No implicit permission through a commitment or old edge.
 IF actor<>p_target_id AND share IS DISTINCT FROM true THEN
  RETURN envelope||jsonb_build_object(''consistency'',jsonb_build_object(''status'',''hidden''),
   ''tracking'',jsonb_build_object(''status'',''hidden'')); END IF;
 tracked:=array_fill(false,ARRAY[day_count]);
 calories:=array_fill(0::double precision,ARRAY[day_count]);protein:=array_fill(0::double precision,ARRAY[day_count]);
 BEGIN
  -- No active goal uses the existing application defaults; database/read errors do
  -- not masquerade as fallback values. Unique goals.user_id is verified metadata.
  SELECT g.daily_calories,g.protein_g INTO calorie_target,protein_target
   FROM public.goals g WHERE g.user_id=p_target_id AND g.is_active IS TRUE;
  IF NOT FOUND THEN calorie_target:=2000;protein_target:=150; END IF;
  IF NOT privacy_private.valid_weekly_amount(calorie_target) OR NOT privacy_private.valid_weekly_amount(protein_target) THEN
   RAISE EXCEPTION ''invalid score input'' USING ERRCODE=''22003''; END IF;
  FOR r IN SELECT m.date,i.id IS NOT NULL AS has_item,i.is_scheduled,i.calories,i.protein
   FROM public.meals m LEFT JOIN public.meal_items i ON i.meal_id=m.id
   WHERE m.user_id=p_target_id AND m.date>=start_day AND m.date<=end_day ORDER BY m.date,m.id,i.id LOOP
   idx:=r.date-start_day+1;tracked[idx]:=true;
   IF NOT r.has_item THEN CONTINUE; END IF;
   IF r.is_scheduled IS NULL THEN RAISE EXCEPTION ''invalid score input'' USING ERRCODE=''22003''; END IF;
   IF r.is_scheduled THEN CONTINUE; END IF;
   IF NOT privacy_private.valid_weekly_amount(r.calories::double precision)
    OR NOT privacy_private.valid_weekly_amount(r.protein::double precision) THEN
    RAISE EXCEPTION ''invalid score input'' USING ERRCODE=''22003''; END IF;
   calories[idx]:=calories[idx]+r.calories::double precision;protein[idx]:=protein[idx]+r.protein::double precision;
   IF NOT privacy_private.valid_weekly_amount(calories[idx]) OR NOT privacy_private.valid_weekly_amount(protein[idx]) THEN
    RAISE EXCEPTION ''invalid score input'' USING ERRCODE=''22003''; END IF;
  END LOOP;
  FOR idx IN 1..day_count LOOP
   IF NOT tracked[idx] THEN CONTINUE; END IF;
   meal_days:=meal_days+1;
   cal_pct:=CASE WHEN calorie_target>0 THEN calories[idx]/calorie_target*100 ELSE 0 END;
   prot_pct:=CASE WHEN protein_target>0 THEN protein[idx]/protein_target*100 ELSE 0 END;
   IF NOT privacy_private.valid_weekly_amount(cal_pct) OR NOT privacy_private.valid_weekly_amount(prot_pct) THEN
    RAISE EXCEPTION ''invalid score input'' USING ERRCODE=''22003''; END IF;
   cal_pts:=CASE WHEN cal_pct>=95 AND cal_pct<=105 THEN 30 WHEN cal_pct>=85 THEN 24
    WHEN cal_pct>=70 THEN 18 WHEN cal_pct>=50 THEN 12 ELSE least(6,cal_pct/50*6) END;
   prot_pts:=CASE WHEN prot_pct>=95 AND prot_pct<=105 THEN 20 WHEN prot_pct>=85 THEN 16
    WHEN prot_pct>=70 THEN 12 WHEN prot_pct>=50 THEN 8 ELSE least(4,prot_pct/50*4) END;
   total:=total+50+cal_pts+prot_pts;
  END LOOP;
  score_value:=floor(total/day_count+0.5)::integer;
  consistency:=jsonb_build_object(''status'',''available'',''score'',score_value,''noActivity'',meal_days=0);
  tracking:=jsonb_build_object(''status'',''available'',''mealDays'',meal_days,''dayFlags'',to_jsonb(tracked));
 EXCEPTION WHEN numeric_value_out_of_range THEN
  consistency:=jsonb_build_object(''status'',''unavailable'');tracking:=jsonb_build_object(''status'',''unavailable'');
 END;
 RETURN envelope||jsonb_build_object(''consistency'',consistency,''tracking'',tracking);
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_target_id','p_from','p_to']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['DateStyle=ISO, YMD','row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.profile_weekly_tracking(uuid,text,text)'; END IF;
 IF has_function_privilege('anon','public.profile_weekly_tracking(uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.profile_weekly_tracking(uuid,text,text)','EXECUTE') OR has_function_privilege('service_role','public.profile_weekly_tracking(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.profile_weekly_tracking(uuid,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.visible_post_authors(uuid[])') AND p.prosrc='
DECLARE actor uuid:=privacy_private.registered_actor();result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
  RAISE EXCEPTION ''authentication required'' USING ERRCODE=''28000''; END IF;
 IF p_post_ids IS NULL OR cardinality(p_post_ids)>50
  OR coalesce(array_ndims(p_post_ids),1)<>1 OR array_position(p_post_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION ''invalid post identity batch'' USING ERRCODE=''22023''; END IF;
 -- ANY deduplicates requested IDs; no arbitrary author IDs are accepted. Public
 -- selected posts remain readable independently of full profile acceptance.
 -- Badge reproduces SocialPostCard''s user_type===''premium'' display predicate.
 -- Stored user_type may be mutable; this is never paid entitlement or permission.
 SELECT jsonb_build_object(''items'',coalesce(jsonb_agg(jsonb_build_object(''postId'',p.id::text,
  ''identity'',privacy_private.discovery_identity_json(u.id,u.username,u.name,u.full_name,u.avatar_url)
   ||jsonb_build_object(''is_premium'',coalesce(u.user_type=''premium'',false))) ORDER BY p.id),''[]''::jsonb))
 INTO result
 FROM public.social_posts p JOIN public.users u ON u.id=p.user_id
 WHERE p.id=ANY(p_post_ids) AND (p.is_public IS TRUE OR p.user_id=actor)
  AND (actor=p.user_id OR NOT privacy_private.is_blocked(actor,p.user_id));
 RETURN result;
END
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='plpgsql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_post_ids']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='jsonb' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.visible_post_authors(uuid[])'; END IF;
 IF has_function_privilege('anon','public.visible_post_authors(uuid[])','EXECUTE') OR has_function_privilege('authenticated','public.visible_post_authors(uuid[])','EXECUTE') OR has_function_privilege('service_role','public.visible_post_authors(uuid[])','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.visible_post_authors(uuid[])'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.social_post_author_visible(uuid)') AND p.prosrc='
 SELECT privacy_private.registered_actor() IS NOT NULL AND p_author IS NOT NULL
  AND (privacy_private.registered_actor()=p_author
   OR NOT privacy_private.is_blocked(privacy_private.registered_actor(),p_author))
' AND p.proowner='postgres'::regrole AND p.prosecdef=true AND p.provolatile='s' AND l.lanname='sql' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proargnames IS NOT DISTINCT FROM ARRAY['p_author']::text[] AND p.pronargdefaults=0 AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM NULL::text AND pg_get_function_result(p.oid)='boolean' AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.proconfig) x) IS NOT DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['row_security=off','search_path=pg_catalog']::text[]) x)) THEN RAISE EXCEPTION 'stage10 definition drift: public.social_post_author_visible(uuid)'; END IF;
 IF has_function_privilege('anon','public.social_post_author_visible(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.social_post_author_visible(uuid)','EXECUTE') OR has_function_privilege('service_role','public.social_post_author_visible(uuid)','EXECUTE') THEN RAISE EXCEPTION 'stage10 function not closed: public.social_post_author_visible(uuid)'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='privacy_private' OR (n.nspname='public' AND p.proname IN('can_view_profile','discover_profiles','profile_summary','change_follow_request','profile_nutrition','list_follow_request_inbox','respond_follow_request','change_outbound_follow','profile_snapshot','search_profile_identities','list_accepted_profile_connections','list_profile_posts','profile_weekly_tracking','visible_post_authors','social_post_author_visible')))<>37 THEN RAISE EXCEPTION 'stage10 function overload inventory drift'; END IF;
END $baseline$;
DO $tables$ DECLARE actual jsonb; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.social_posts'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'affected table owner/RLS drift: social_posts'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'command',p.polcmd,'permissive',p.polpermissive,'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) INTO actual FROM pg_policy p WHERE p.polrelid='public.social_posts'::regclass AND p.polname NOT LIKE 'community_pair%';
 IF actual IS DISTINCT FROM '[{"name":"delete_own_posts","roles":["public"],"using":"(auth.uid() = user_id)","command":"d","permissive":true,"with_check":null},{"name":"insert_own_posts","roles":["public"],"using":null,"command":"a","permissive":true,"with_check":"(auth.uid() = user_id)"},{"name":"select_public_or_own_posts","roles":["public"],"using":"((is_public = true) OR (auth.uid() = user_id))","command":"r","permissive":true,"with_check":null},{"name":"update_own_posts","roles":["public"],"using":"(auth.uid() = user_id)","command":"w","permissive":true,"with_check":null}]'::jsonb THEN RAISE EXCEPTION 'affected original policy drift: social_posts'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.community_comments'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'affected table owner/RLS drift: community_comments'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'command',p.polcmd,'permissive',p.polpermissive,'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) INTO actual FROM pg_policy p WHERE p.polrelid='public.community_comments'::regclass AND p.polname NOT LIKE 'community_pair%';
 IF actual IS DISTINCT FROM '[{"name":"Users can update own comments","roles":["public"],"using":"(auth.uid() = user_id)","command":"w","permissive":true,"with_check":"(auth.uid() = user_id)"},{"name":"community_comments_delete","roles":["public"],"using":"(auth.uid() = user_id)","command":"d","permissive":true,"with_check":null},{"name":"community_comments_insert","roles":["public"],"using":null,"command":"a","permissive":true,"with_check":"(auth.uid() = user_id)"},{"name":"community_comments_select","roles":["public"],"using":"(auth.uid() IS NOT NULL)","command":"r","permissive":true,"with_check":null}]'::jsonb THEN RAISE EXCEPTION 'affected original policy drift: community_comments'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.community_likes'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'affected table owner/RLS drift: community_likes'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'command',p.polcmd,'permissive',p.polpermissive,'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) INTO actual FROM pg_policy p WHERE p.polrelid='public.community_likes'::regclass AND p.polname NOT LIKE 'community_pair%';
 IF actual IS DISTINCT FROM '[{"name":"Likes readable by all","roles":["public"],"using":"true","command":"r","permissive":true,"with_check":null},{"name":"Users can manage own likes","roles":["public"],"using":"(auth.uid() = user_id)","command":"*","permissive":true,"with_check":null},{"name":"community_likes_delete","roles":["public"],"using":"(auth.uid() = user_id)","command":"d","permissive":true,"with_check":null},{"name":"community_likes_insert","roles":["public"],"using":null,"command":"a","permissive":true,"with_check":"(auth.uid() = user_id)"},{"name":"community_likes_select","roles":["public"],"using":"true","command":"r","permissive":true,"with_check":null}]'::jsonb THEN RAISE EXCEPTION 'affected original policy drift: community_likes'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.social_post_likes'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'affected table owner/RLS drift: social_post_likes'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'command',p.polcmd,'permissive',p.polpermissive,'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) INTO actual FROM pg_policy p WHERE p.polrelid='public.social_post_likes'::regclass AND p.polname NOT LIKE 'community_pair%';
 IF actual IS DISTINCT FROM '[{"name":"likes_delete","roles":["public"],"using":"(auth.uid() = user_id)","command":"d","permissive":true,"with_check":null},{"name":"likes_insert","roles":["public"],"using":null,"command":"a","permissive":true,"with_check":"(auth.uid() = user_id)"},{"name":"likes_select","roles":["public"],"using":"true","command":"r","permissive":true,"with_check":null}]'::jsonb THEN RAISE EXCEPTION 'affected original policy drift: social_post_likes'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.social_post_saves'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'affected table owner/RLS drift: social_post_saves'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'command',p.polcmd,'permissive',p.polpermissive,'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) INTO actual FROM pg_policy p WHERE p.polrelid='public.social_post_saves'::regclass AND p.polname NOT LIKE 'community_pair%';
 IF actual IS DISTINCT FROM '[{"name":"Saves readable by owner","roles":["public"],"using":"(auth.uid() = user_id)","command":"r","permissive":true,"with_check":null},{"name":"Users can manage own saves","roles":["public"],"using":"(auth.uid() = user_id)","command":"*","permissive":true,"with_check":null},{"name":"Users manage own saves","roles":["public"],"using":"(auth.uid() = user_id)","command":"*","permissive":true,"with_check":null},{"name":"social_post_saves_delete","roles":["authenticated"],"using":"(user_id = auth.uid())","command":"d","permissive":true,"with_check":null},{"name":"social_post_saves_insert","roles":["authenticated"],"using":null,"command":"a","permissive":true,"with_check":"(user_id = auth.uid())"},{"name":"social_post_saves_select","roles":["authenticated"],"using":"(user_id = auth.uid())","command":"r","permissive":true,"with_check":null}]'::jsonb THEN RAISE EXCEPTION 'affected original policy drift: social_post_saves'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.community_commitments'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'affected table owner/RLS drift: community_commitments'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'command',p.polcmd,'permissive',p.polpermissive,'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) INTO actual FROM pg_policy p WHERE p.polrelid='public.community_commitments'::regclass AND p.polname NOT LIKE 'community_pair%';
 IF actual IS DISTINCT FROM '[{"name":"Users can delete own commitments","roles":["public"],"using":"((auth.uid() = user_id) OR (auth.uid() = partner_id))","command":"d","permissive":true,"with_check":null},{"name":"Users can insert commitments","roles":["public"],"using":null,"command":"a","permissive":true,"with_check":"(auth.uid() = user_id)"},{"name":"Users can read own commitments","roles":["public"],"using":"((auth.uid() = user_id) OR (auth.uid() = partner_id))","command":"r","permissive":true,"with_check":null},{"name":"Users can update own commitments","roles":["public"],"using":"((auth.uid() = user_id) OR (auth.uid() = partner_id))","command":"w","permissive":true,"with_check":null},{"name":"community_commitments_insert","roles":["public"],"using":null,"command":"a","permissive":true,"with_check":"(auth.uid() = user_id)"},{"name":"community_commitments_select","roles":["public"],"using":"((auth.uid() = user_id) OR (auth.uid() = partner_id))","command":"r","permissive":true,"with_check":null},{"name":"community_commitments_update","roles":["public"],"using":"((auth.uid() = user_id) OR (auth.uid() = partner_id))","command":"w","permissive":true,"with_check":null}]'::jsonb THEN RAISE EXCEPTION 'affected original policy drift: community_commitments'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.blocked_users'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'affected table owner/RLS drift: blocked_users'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'command',p.polcmd,'permissive',p.polpermissive,'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) INTO actual FROM pg_policy p WHERE p.polrelid='public.blocked_users'::regclass AND p.polname NOT LIKE 'community_pair%';
 IF actual IS DISTINCT FROM '[{"name":"Users can manage own blocked_users","roles":["public"],"using":"((auth.uid() = blocker_id) OR (auth.uid() = blocked_id))","command":"*","permissive":true,"with_check":null},{"name":"users_can_block","roles":["public"],"using":null,"command":"a","permissive":true,"with_check":"(auth.uid() = blocker_id)"},{"name":"users_can_see_own_blocks","roles":["public"],"using":"(auth.uid() = blocker_id)","command":"r","permissive":true,"with_check":null},{"name":"users_can_unblock","roles":["public"],"using":"(auth.uid() = blocker_id)","command":"d","permissive":true,"with_check":null}]'::jsonb THEN RAISE EXCEPTION 'affected original policy drift: blocked_users'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.community_blocks'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'affected table owner/RLS drift: community_blocks'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'command',p.polcmd,'permissive',p.polpermissive,'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) INTO actual FROM pg_policy p WHERE p.polrelid='public.community_blocks'::regclass AND p.polname NOT LIKE 'community_pair%';
 IF actual IS DISTINCT FROM '[{"name":"Users can manage own blocks","roles":["public"],"using":"(auth.uid() = blocker_id)","command":"*","permissive":true,"with_check":null},{"name":"community_blocks_delete","roles":["public"],"using":"(auth.uid() = blocker_id)","command":"d","permissive":true,"with_check":null},{"name":"community_blocks_insert","roles":["public"],"using":null,"command":"a","permissive":true,"with_check":"(auth.uid() = blocker_id)"},{"name":"community_blocks_select","roles":["public"],"using":"(auth.uid() = blocker_id)","command":"r","permissive":true,"with_check":null}]'::jsonb THEN RAISE EXCEPTION 'affected original policy drift: community_blocks'; END IF;
END $tables$;
-- Persistent production-feature rollout state. No browser flag, UUID or credential is authoritative.
CREATE TABLE privacy_private.community_rollout (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 mode text NOT NULL DEFAULT 'CLOSED' CHECK(mode IN ('CLOSED','PAIR')),
 member_a uuid, member_b uuid,
 CHECK((member_a IS NULL AND member_b IS NULL AND mode='CLOSED') OR
       (member_a IS NOT NULL AND member_b IS NOT NULL AND member_a<>member_b))
);
ALTER TABLE privacy_private.community_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON privacy_private.community_rollout FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO privacy_private.community_rollout(singleton) VALUES(true);
CREATE FUNCTION privacy_private.community_active() RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT mode='PAIR' FROM privacy_private.community_rollout WHERE singleton),false)
$$;
CREATE FUNCTION privacy_private.community_member(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT mode='PAIR' AND p_user IN(member_a,member_b) FROM privacy_private.community_rollout WHERE singleton),false)
$$;
CREATE FUNCTION privacy_private.community_exact_pair(a uuid,b uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT a IS DISTINCT FROM b AND privacy_private.community_member(a) AND privacy_private.community_member(b)
$$;
CREATE FUNCTION privacy_private.require_community_actor() RETURNS uuid LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('macrogoal:community-rollout',0));
 actor:=privacy_private.registered_actor();
 IF current_setting('role')<>'authenticated' OR actor IS NULL OR NOT privacy_private.community_member(actor)
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor) THEN
  RAISE EXCEPTION 'community rollout unavailable' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION privacy_private.require_community_target(p_target uuid) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
BEGIN
 IF p_target IS NULL OR NOT privacy_private.community_member(p_target) THEN
  RAISE EXCEPTION 'target unavailable' USING ERRCODE='P0002'; END IF;
END $$;
CREATE FUNCTION public.community_privacy_eligibility() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
 SELECT CASE WHEN current_setting('role')='authenticated'
 AND privacy_private.registered_actor() IS NOT NULL AND privacy_private.community_member(privacy_private.registered_actor())
 AND EXISTS(SELECT 1 FROM public.users WHERE id=privacy_private.registered_actor())
 THEN '{"version":1,"enabled":true,"rollout":"pair"}'::jsonb
 ELSE '{"version":1,"enabled":false,"rollout":"closed"}'::jsonb END
$$;
CREATE FUNCTION public.get_outbound_follow_status(p_target_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE actor uuid; descriptor jsonb;
BEGIN
 actor:=privacy_private.require_community_actor();
 PERFORM privacy_private.require_community_target(p_target_id);
 IF p_target_id=actor OR privacy_private.is_blocked(actor,p_target_id) THEN
  RAISE EXCEPTION 'target unavailable' USING ERRCODE='P0002'; END IF;
 SELECT jsonb_build_object('request_id',r.id::text,'revision',r.revision::text,'state',r.state) INTO descriptor
 FROM public.follow_requests r WHERE r.requester_id=actor AND r.owner_id=p_target_id;
 RETURN jsonb_build_object('requesterUserId',actor::text,'targetUserId',p_target_id::text,'follow_request',descriptor);
END $$;
-- Read-only owner review surface. Never exposed to API roles. Includes exact row
-- identities, states/revisions and cursor metadata so cleanup cannot assume provenance.
CREATE FUNCTION privacy_private.community_pair_cleanup_state() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
 WITH pair AS (SELECT member_a a,member_b b FROM privacy_private.community_rollout WHERE singleton),
 payload AS (SELECT jsonb_build_object(
  'follows',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.social_follows f,pair WHERE f.follower_id IN(a,b) AND f.following_id IN(a,b) AND f.follower_id<>f.following_id),'[]'::jsonb),
  'blocks',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.blocked_users f,pair WHERE f.blocker_id IN(a,b) AND f.blocked_id IN(a,b) AND f.blocker_id<>f.blocked_id),'[]'::jsonb),
  'community_blocks',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.community_blocks f,pair WHERE f.blocker_id IN(a,b) AND f.blocked_id IN(a,b) AND f.blocker_id<>f.blocked_id),'[]'::jsonb),
  'requests',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM public.follow_requests f,pair WHERE f.requester_id IN(a,b) AND f.owner_id IN(a,b)),'[]'::jsonb),
  'cursors',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.token) FROM privacy_private.follow_inbox_cursors f,pair WHERE f.owner_id IN(a,b)),'[]'::jsonb)
 ) AS rows)
 SELECT jsonb_build_object('digest',encode(sha256(convert_to(rows::text,'UTF8')),'hex'),'rows',rows) FROM payload
$$;
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
 PERFORM privacy_private.require_community_actor();
 PERFORM privacy_private.require_community_target(p_target);
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
   WHERE r.owner_id=p_target AND privacy_private.community_member(r.requester_id) AND r.state='accepted' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
    AND NOT privacy_private.is_blocked(r.requester_id,r.owner_id)
    AND NOT privacy_private.is_blocked(actor,r.requester_id);
  IF count_value<=9007199254740991 THEN followers:=jsonb_build_object('status','available','value',count_value); END IF;
 EXCEPTION WHEN OTHERS THEN followers:='{"status":"unavailable"}'::jsonb; END;
 BEGIN
  SELECT count(*) INTO count_value FROM public.follow_requests r
   JOIN public.social_follows f ON f.follower_id=r.requester_id AND f.following_id=r.owner_id
   WHERE r.requester_id=p_target AND privacy_private.community_member(r.owner_id) AND r.state='accepted' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
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
 PERFORM privacy_private.require_community_actor();
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
  WHERE r.owner_id=actor AND privacy_private.community_member(r.requester_id) AND r.state='pending'
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
 PERFORM privacy_private.require_community_actor();
 PERFORM privacy_private.require_community_target(p_requester_id);
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
 PERFORM privacy_private.require_community_actor();
 PERFORM privacy_private.require_community_target(p_target_id);
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
 PERFORM privacy_private.require_community_actor();
 IF privacy_private.registered_actor() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)>50 THEN RAISE EXCEPTION 'invalid discovery limit' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_ids) AS requested(id) WHERE NOT privacy_private.community_member(requested.id)) THEN RAISE EXCEPTION 'target unavailable' USING ERRCODE='P0002'; END IF;
 RETURN QUERY SELECT u.id,privacy_private.profile_text(u.username,100),
  coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200)),
  coalesce(privacy_private.profile_text(u.name,200),privacy_private.profile_text(u.full_name,200)),
  privacy_private.approved_avatar_url(u.id,u.avatar_url) FROM public.users u
 WHERE privacy_private.community_member(u.id) AND u.id=ANY(p_ids) AND NOT privacy_private.is_blocked(privacy_private.registered_actor(),u.id) ORDER BY u.id;
END
$fn$;
CREATE OR REPLACE FUNCTION public.search_profile_identities(p_query text,p_limit integer DEFAULT 20,p_after_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $fn$
DECLARE actor uuid:=privacy_private.registered_actor(); normalized text; result jsonb;
BEGIN
 PERFORM privacy_private.require_community_actor();
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
  WHERE privacy_private.community_member(u.id) AND NOT privacy_private.is_blocked(actor,u.id)
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
 PERFORM privacy_private.require_community_actor();
 PERFORM privacy_private.require_community_target(p_target_id);
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
  WHERE privacy_private.community_member(r.requester_id) AND privacy_private.community_member(r.owner_id) AND privacy_private.community_member(u.id) AND r.state='accepted' AND r.accepted_by=r.owner_id AND r.accepted_at IS NOT NULL
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
 PERFORM privacy_private.require_community_actor();
 PERFORM privacy_private.require_community_target(p_target_id);
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
 PERFORM privacy_private.require_community_actor();
 PERFORM privacy_private.require_community_target(p_target_id);
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
 PERFORM privacy_private.require_community_actor();
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
 WHERE privacy_private.community_member(p.user_id) AND p.id=ANY(p_post_ids) AND (p.is_public IS TRUE OR p.user_id=actor)
  AND (actor=p.user_id OR NOT privacy_private.is_blocked(actor,p.user_id));
 RETURN result;
END
$fn$;
-- A policy-safe public BOOLEAN adapter. Private helpers retain no schema USAGE or EXECUTE.
-- Nonpair callers get true, so their captured permissive policies remain authoritative.
-- Pair membership is tested against auth.uid() before registered_actor() to deny a
-- pair UID carrying an anonymous/malformed is_anonymous claim instead of bypassing.
CREATE FUNCTION public.community_privacy_row_allowed(p_kind text,p_owner uuid,p_other uuid DEFAULT NULL,p_post uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE actor uuid:=privacy_private.registered_actor();
BEGIN
 IF NOT privacy_private.community_member(auth.uid()) THEN RETURN true; END IF;
 IF actor IS NULL OR current_setting('role') NOT IN ('authenticated') THEN RETURN false; END IF;
 IF p_kind='block' THEN RETURN actor=p_owner AND privacy_private.community_member(p_other); END IF;
 IF p_kind='post' THEN
  RETURN privacy_private.community_member(p_owner) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=p_post AND p.user_id=p_owner
   AND (p.is_public IS TRUE OR p.user_id=actor)
   AND (actor=p.user_id OR NOT privacy_private.is_blocked(actor,p.user_id)));
 END IF;
 IF p_kind='interaction' THEN
  RETURN privacy_private.community_member(p_owner)
   AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=p_post AND privacy_private.community_member(p.user_id)
    AND (p_owner=actor OR ((p.is_public IS TRUE OR p.user_id=actor)
     AND (actor=p.user_id OR NOT privacy_private.is_blocked(actor,p.user_id))
     AND (p_owner=actor OR NOT privacy_private.is_blocked(actor,p_owner)))));
 END IF;
 IF p_kind='commitment' THEN
  RETURN privacy_private.community_member(p_owner) AND privacy_private.community_member(p_other)
   AND actor IN(p_owner,p_other) AND NOT privacy_private.is_blocked(p_owner,p_other);
 END IF;
 RETURN false;
END $$;
CREATE POLICY community_pair_read ON public.social_posts AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.community_privacy_row_allowed('post',user_id,NULL,id));
CREATE POLICY community_pair_read ON public.community_comments AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.community_privacy_row_allowed('interaction',user_id,NULL,post_id));
CREATE POLICY community_pair_read ON public.community_likes AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.community_privacy_row_allowed('interaction',user_id,NULL,post_id));
CREATE POLICY community_pair_read ON public.social_post_likes AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.community_privacy_row_allowed('interaction',user_id,NULL,post_id));
CREATE POLICY community_pair_read ON public.social_post_saves AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.community_privacy_row_allowed('interaction',user_id,NULL,post_id));
CREATE POLICY community_pair_read ON public.community_commitments AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.community_privacy_row_allowed('commitment',user_id,partner_id));
-- Owner-only blocking fixes existing permissive blocked-party deletion for pair actors.
CREATE POLICY community_pair_blocks ON public.blocked_users AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.community_privacy_row_allowed('block',blocker_id,blocked_id)) WITH CHECK(public.community_privacy_row_allowed('block',blocker_id,blocked_id));
CREATE POLICY community_pair_blocks ON public.community_blocks AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.community_privacy_row_allowed('block',blocker_id,blocked_id)) WITH CHECK(public.community_privacy_row_allowed('block',blocker_id,blocked_id));
CREATE FUNCTION privacy_private.pair_block_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE a uuid; b uuid; old_pair boolean:=false; new_pair boolean:=false;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('macrogoal:community-rollout',0));
 IF TG_OP<>'INSERT' THEN old_pair:=privacy_private.community_exact_pair(OLD.blocker_id,OLD.blocked_id); END IF;
 IF TG_OP<>'DELETE' THEN new_pair:=privacy_private.community_exact_pair(NEW.blocker_id,NEW.blocked_id); END IF;
 IF NOT(old_pair OR new_pair) THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='UPDATE' AND (NEW.blocker_id IS DISTINCT FROM OLD.blocker_id OR NEW.blocked_id IS DISTINCT FROM OLD.blocked_id) THEN
  RAISE EXCEPTION 'pair block endpoints are immutable' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN a:=OLD.blocker_id;b:=OLD.blocked_id; ELSE a:=NEW.blocker_id;b:=NEW.blocked_id; END IF;
 IF current_setting('role') IN('anon','authenticated') AND privacy_private.registered_actor() IS DISTINCT FROM a THEN
  RAISE EXCEPTION 'block actor mismatch' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'pair writes require read committed' USING ERRCODE='25001'; END IF;
 PERFORM privacy_private.lock_pair(a,b);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION privacy_private.pair_block_revoke() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
BEGIN
 IF privacy_private.community_exact_pair(NEW.blocker_id,NEW.blocked_id) THEN
  UPDATE public.follow_requests SET state='revoked',revision=least(revision+1,9007199254740991),updated_at=clock_timestamp(),accepted_by=NULL,accepted_at=NULL
   WHERE state IN('pending','accepted') AND ((requester_id=NEW.blocker_id AND owner_id=NEW.blocked_id) OR (requester_id=NEW.blocked_id AND owner_id=NEW.blocker_id));
  DELETE FROM public.social_follows WHERE (follower_id=NEW.blocker_id AND following_id=NEW.blocked_id) OR (follower_id=NEW.blocked_id AND following_id=NEW.blocker_id);
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION privacy_private.pair_follow_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE a uuid;b uuid;old_pair boolean:=false;new_pair boolean:=false;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('macrogoal:community-rollout',0));
 IF TG_OP<>'INSERT' THEN old_pair:=privacy_private.community_exact_pair(OLD.follower_id,OLD.following_id); END IF;
 IF TG_OP<>'DELETE' THEN new_pair:=privacy_private.community_exact_pair(NEW.follower_id,NEW.following_id); END IF;
 IF NOT(old_pair OR new_pair) THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='UPDATE' AND (NEW.follower_id IS DISTINCT FROM OLD.follower_id OR NEW.following_id IS DISTINCT FROM OLD.following_id) THEN
  RAISE EXCEPTION 'pair follow endpoints are immutable' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN a:=OLD.follower_id;b:=OLD.following_id; ELSE a:=NEW.follower_id;b:=NEW.following_id; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'pair writes require read committed' USING ERRCODE='25001'; END IF;
 PERFORM privacy_private.lock_pair(a,b);
 IF TG_OP='DELETE' THEN
  UPDATE public.follow_requests SET state='revoked',revision=least(revision+1,9007199254740991),updated_at=clock_timestamp(),accepted_by=NULL,accepted_at=NULL
   WHERE requester_id=a AND owner_id=b AND state='accepted';
  RETURN OLD;
 END IF;
 IF privacy_private.is_blocked(a,b) THEN RAISE EXCEPTION 'target unavailable' USING ERRCODE='P0002'; END IF;
 -- A legacy INSERT alone never creates a follow_requests row or owner acceptance.
 RETURN NEW;
END $$;
CREATE FUNCTION privacy_private.pair_truncate_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('macrogoal:community-rollout',0));
 IF privacy_private.community_active() THEN
  RAISE EXCEPTION 'whole-table truncation forbidden while pair rollout active' USING ERRCODE='55000'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER community_pair_block_guard BEFORE INSERT OR UPDATE OR DELETE ON public.blocked_users FOR EACH ROW EXECUTE FUNCTION privacy_private.pair_block_guard();
CREATE TRIGGER community_pair_block_revoke AFTER INSERT ON public.blocked_users FOR EACH ROW EXECUTE FUNCTION privacy_private.pair_block_revoke();
CREATE TRIGGER community_pair_block_guard BEFORE INSERT OR UPDATE OR DELETE ON public.community_blocks FOR EACH ROW EXECUTE FUNCTION privacy_private.pair_block_guard();
CREATE TRIGGER community_pair_block_revoke AFTER INSERT ON public.community_blocks FOR EACH ROW EXECUTE FUNCTION privacy_private.pair_block_revoke();
CREATE TRIGGER community_pair_follow_guard BEFORE INSERT OR UPDATE OR DELETE ON public.social_follows FOR EACH ROW EXECUTE FUNCTION privacy_private.pair_follow_guard();
CREATE TRIGGER community_pair_truncate_guard BEFORE TRUNCATE ON public.blocked_users FOR EACH STATEMENT EXECUTE FUNCTION privacy_private.pair_truncate_guard();
CREATE TRIGGER community_pair_truncate_guard BEFORE TRUNCATE ON public.community_blocks FOR EACH STATEMENT EXECUTE FUNCTION privacy_private.pair_truncate_guard();
CREATE TRIGGER community_pair_truncate_guard BEFORE TRUNCATE ON public.social_follows FOR EACH STATEMENT EXECUTE FUNCTION privacy_private.pair_truncate_guard();

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
DO $close_new$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
 (n.nspname='privacy_private' AND p.proname IN ('community_member','community_active','require_community_actor','require_community_target','community_exact_pair','pair_block_guard','pair_block_revoke','pair_follow_guard','pair_truncate_guard','community_pair_cleanup_state'))
 OR (n.nspname='public' AND p.proname IN ('community_privacy_eligibility','get_outbound_follow_status','community_privacy_row_allowed')) LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';
 END LOOP;
END $close_new$;
GRANT EXECUTE ON FUNCTION public.community_privacy_eligibility() TO authenticated;
-- RLS helper returns a boolean; it conveys no authority or row data by itself.
GRANT EXECUTE ON FUNCTION public.community_privacy_row_allowed(text,uuid,uuid,uuid) TO anon,authenticated;
COMMIT;
