-- ONE-SHOT GLOBAL CUTOVER CANDIDATE. Reviewed baseline only, never a pair widening.
-- Requires separate explicit approval of this exact candidate and verified Edge cutover.
-- Supply transaction-local macrogoal.global_activation_approved=true and
-- macrogoal.global_legacy_cutover_verified=true only after the documented deployment checks.
-- No approval or release-verification flags are set by this file.
-- Apply to the original 37-function CLOSED baseline, NOT after separately applying10.
-- A known catalog mismatch or late error rolls back this entire transaction.
BEGIN;
-- Apply immediately after BEGIN and before the unchanged37 fingerprint.
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
LOCK TABLE public.blocked_users,public.community_blocks,public.community_comments,
 public.community_commitments,public.community_likes,public.follow_requests,
 public.goals,public.meal_items,public.meals,public.social_follows,
 public.social_post_likes,public.social_post_saves,public.social_posts,
 public.social_profiles,public.user_xp,public.users,
 privacy_private.follow_inbox_cursors IN ACCESS EXCLUSIVE MODE;

SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $catalog_guard$
DECLARE observed text; function_count integer; table_count integer;
BEGIN
 IF current_user<>'postgres' OR current_setting('macrogoal.global_activation_approved',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'explicit global activation approval required'; END IF;
WITH functions AS (
 SELECT n.nspname AS schema,p.proname AS name,
 (SELECT jsonb_agg(jsonb_build_object('schema',tn.nspname,'name',t.typname) ORDER BY a.i) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(id,i) JOIN pg_type t ON t.oid=a.id JOIN pg_namespace tn ON tn.oid=t.typnamespace) AS argument_types,
 p.proargnames AS argument_names,p.proargmodes AS argument_modes,
 (SELECT jsonb_agg(jsonb_build_object('schema',tn.nspname,'name',t.typname) ORDER BY a.i) FROM unnest(p.proallargtypes) WITH ORDINALITY a(id,i) JOIN pg_type t ON t.oid=a.id JOIN pg_namespace tn ON tn.oid=t.typnamespace) AS all_argument_types,
 jsonb_build_object('schema',rn.nspname,'name',rt.typname,'set',p.proretset) AS result_type,
 p.prosrc AS body,pg_get_userbyid(p.proowner) AS owner,l.lanname AS language,
 p.provolatile AS volatility,p.prosecdef AS security_definer,p.proisstrict AS strict,p.proleakproof AS leakproof,p.prokind AS kind,p.proparallel AS parallel,
 (SELECT jsonb_agg(v ORDER BY v) FROM unnest(p.proconfig) v) AS config,p.pronargdefaults AS default_count,pg_get_expr(p.proargdefaults,0) AS defaults,
 jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) AS api_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang JOIN pg_type rt ON rt.oid=p.prorettype JOIN pg_namespace rn ON rn.oid=rt.typnamespace
 WHERE n.nspname='privacy_private' OR (n.nspname='public' AND p.proname IN ('can_view_profile','discover_profiles','profile_summary','change_follow_request','profile_nutrition','list_follow_request_inbox','respond_follow_request','change_outbound_follow','profile_snapshot','search_profile_identities','list_accepted_profile_connections','list_profile_posts','profile_weekly_tracking','visible_post_authors','social_post_author_visible','community_privacy_eligibility','get_outbound_follow_status','community_privacy_row_allowed'))
), tables AS (
 SELECT n.nspname AS schema,c.relname AS name,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
 (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type_schema',tn.nspname,'type_name',t.typname,'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT jsonb_agg(jsonb_build_object('role',r.role,'select',has_table_privilege(r.role,c.oid,'SELECT'),'insert',has_table_privilege(r.role,c.oid,'INSERT'),'update',has_table_privilege(r.role,c.oid,'UPDATE'),'delete',has_table_privilege(r.role,c.oid,'DELETE'),'trigger',has_table_privilege(r.role,c.oid,'TRIGGER'),'truncate',has_table_privilege(r.role,c.oid,'TRUNCATE')) ORDER BY r.role) FROM unnest(ARRAY['anon','authenticated','service_role']) r(role)) AS api_grants,
 (SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN v=0 THEN 'public' ELSE pg_get_userbyid(v) END ORDER BY CASE WHEN v=0 THEN 'public' ELSE pg_get_userbyid(v) END) FROM unnest(p.polroles) v),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
 (SELECT jsonb_agg(jsonb_build_object('name',tr.tgname,'type',tr.tgtype,'enabled',tr.tgenabled,'function_schema',fn.nspname,'function_name',fp.proname,'arguments',encode(tr.tgargs,'hex'),'columns',tr.tgattr::text,'when',pg_get_expr(tr.tgqual,tr.tgrelid)) ORDER BY tr.tgname) FROM pg_trigger tr JOIN pg_proc fp ON fp.oid=tr.tgfoid JOIN pg_namespace fn ON fn.oid=fp.pronamespace WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal) AS triggers
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND ((n.nspname='public' AND c.relname IN('blocked_users','community_blocks','social_follows','social_posts','community_comments','community_likes','social_post_likes','social_post_saves','community_commitments','follow_requests')) OR (n.nspname='privacy_private' AND c.relname IN('follow_inbox_cursors','community_rollout')))
), payload AS (SELECT jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.schema,f.name,f.argument_types::text) FROM functions f),'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.schema,t.name) FROM tables t),'private_schema',jsonb_build_object('owner',(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='privacy_private'),'anon_usage',has_schema_privilege('anon','privacy_private','USAGE'),'authenticated_usage',has_schema_privilege('authenticated','privacy_private','USAGE'),'service_role_usage',has_schema_privilege('service_role','privacy_private','USAGE'))) AS value)
SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex'),jsonb_array_length(value->'functions'),jsonb_array_length(value->'tables')
INTO observed,function_count,table_count FROM payload;
 IF observed IS DISTINCT FROM 'f3c97af438bc37e22d430fa45becff95f4be58bd5cdc8f3d96b419b7d1cf5ba9' OR function_count IS DISTINCT FROM 37 OR table_count IS DISTINCT FROM 11 THEN
  RAISE EXCEPTION 'catalog drift: expected reviewed stage10 baseline; observed %, functions %, tables %',observed,function_count,table_count;
 END IF;
END $catalog_guard$;
-- Exact helper preservation snapshot, taken only after the full approved
-- fingerprint passes. An existing temp object causes failure; never overwrite it.
CREATE TEMP TABLE global_preserved_profile_helper ON COMMIT DROP AS
 SELECT p.oid AS function_oid,p.proowner AS owner_oid,p.prosrc AS source,
  pg_catalog.pg_get_functiondef(p.oid) AS definition
 FROM pg_catalog.pg_proc p
 WHERE p.oid=pg_catalog.to_regprocedure('public.social_post_author_visible(uuid)');
DO $helper_snapshot$ BEGIN
 IF (SELECT count(*) FROM pg_temp.global_preserved_profile_helper)<>1 THEN
  RAISE EXCEPTION 'fingerprinted social-post helper snapshot missing';
 END IF;
END $helper_snapshot$;


-- This attestation records a separately VERIFIED Edge retirement/profile-route
-- release. SQL cannot verify hosted Edge source or stop a service-role reader.
-- Do not set it solely because the SQL baseline matched.
DO $edge_release$ BEGIN
 IF current_setting('macrogoal.global_legacy_cutover_verified',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'verified legacy Edge retirement and user-JWT profile route required';
 END IF;
END $edge_release$;
-- Existing data is not backfilled or silently rewritten. A blocked live request
-- must be reconciled explicitly rather than being resurrected by a later unblock.
DO $existing_relationship_state$ BEGIN
 IF EXISTS(SELECT 1 FROM public.follow_requests r WHERE r.state IN ('pending','accepted')
   AND privacy_private.is_blocked(r.requester_id,r.owner_id)) THEN
  RAISE EXCEPTION 'pre-existing blocked live follow request requires explicit reconciliation';
 END IF;
END $existing_relationship_state$;

-- Independent GLOBAL control. This is not a widened pair allowlist.
-- This private mode gates ONLY the two new endpoints. Existing RPC access is
-- controlled by EXECUTE grants; closing mode alone is not a backend rollback.
CREATE TABLE privacy_private.community_global_rollout (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 mode text NOT NULL DEFAULT 'CLOSED' CHECK(mode IN ('CLOSED','GLOBAL'))
);
ALTER TABLE privacy_private.community_global_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON privacy_private.community_global_rollout FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO privacy_private.community_global_rollout(singleton) VALUES(true);

CREATE FUNCTION public.community_privacy_eligibility() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $global_eligibility$
 SELECT CASE WHEN current_setting('role',true)='authenticated'
  AND privacy_private.registered_actor() IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.users WHERE id=privacy_private.registered_actor())
  AND coalesce((SELECT mode='GLOBAL' FROM privacy_private.community_global_rollout WHERE singleton),false)
 THEN '{"version":1,"enabled":true,"rollout":"general"}'::jsonb
 ELSE '{"version":1,"enabled":false,"rollout":"closed"}'::jsonb END
$global_eligibility$;

CREATE FUNCTION public.get_outbound_follow_status(p_target_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $global_outbound$
DECLARE actor uuid:=privacy_private.registered_actor(); descriptor jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR actor IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor)
 OR NOT coalesce((SELECT mode='GLOBAL' FROM privacy_private.community_global_rollout WHERE singleton),false) THEN
  RAISE EXCEPTION 'community rollout unavailable' USING ERRCODE='42501';
 END IF;
 IF p_target_id IS NULL OR p_target_id=actor
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_target_id)
 OR privacy_private.is_blocked(actor,p_target_id) THEN
  RAISE EXCEPTION 'target unavailable' USING ERRCODE='P0002';
 END IF;
 -- A directional descriptor is not authorization. Existing canonical profile
 -- readers independently require accepted_by=owner, accepted_at and a live edge.
 SELECT jsonb_build_object('request_id',r.id::text,'revision',r.revision::text,'state',r.state)
 INTO descriptor FROM public.follow_requests r WHERE r.requester_id=actor AND r.owner_id=p_target_id;
 RETURN jsonb_build_object('requesterUserId',actor::text,'targetUserId',p_target_id::text,'follow_request',descriptor);
END
$global_outbound$;
REVOKE ALL ON FUNCTION public.community_privacy_eligibility() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_outbound_follow_status(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- All 37 installed core function bodies/owners/grants remain unchanged and closed.

-- Apply only inside the one-shot transaction AFTER exact37/11 baseline verification
-- with preflight-locks held. Installs9 attachments to the existing reviewed helpers.
-- No function replacement, existing trigger removal, accepted backfill or data cleanup.
SET LOCAL search_path=pg_catalog;
CREATE TEMP TABLE global_preserved_relationship_triggers ON COMMIT DROP AS
 SELECT t.oid,t.tgrelid,t.tgname,pg_get_triggerdef(t.oid,false) AS definition,t.tgenabled
 FROM pg_trigger t WHERE t.tgrelid IN ('public.blocked_users'::regclass,
 'public.community_blocks'::regclass,'public.social_follows'::regclass) AND NOT t.tgisinternal;

CREATE TRIGGER approval_block_pair_lock BEFORE INSERT OR UPDATE OR DELETE ON public.blocked_users
 FOR EACH ROW EXECUTE FUNCTION privacy_private.block_pair_lock();
CREATE TRIGGER approval_block_revoke AFTER INSERT ON public.blocked_users
 FOR EACH ROW EXECUTE FUNCTION privacy_private.block_revoke_relationships();
CREATE TRIGGER approval_block_truncate_forbidden BEFORE TRUNCATE ON public.blocked_users
 FOR EACH STATEMENT EXECUTE FUNCTION privacy_private.relationship_truncate_forbidden();
CREATE TRIGGER approval_legacy_block_pair_lock BEFORE INSERT OR UPDATE OR DELETE ON public.community_blocks
 FOR EACH ROW EXECUTE FUNCTION privacy_private.legacy_block_pair_lock();
CREATE TRIGGER approval_legacy_block_revoke AFTER INSERT ON public.community_blocks
 FOR EACH ROW EXECUTE FUNCTION privacy_private.block_revoke_relationships();
CREATE TRIGGER approval_legacy_block_truncate_forbidden BEFORE TRUNCATE ON public.community_blocks
 FOR EACH STATEMENT EXECUTE FUNCTION privacy_private.relationship_truncate_forbidden();
CREATE TRIGGER approval_follow_delete_revoke BEFORE DELETE ON public.social_follows
 FOR EACH ROW EXECUTE FUNCTION privacy_private.follow_delete_revoke();
CREATE TRIGGER approval_follow_identity_immutable BEFORE UPDATE ON public.social_follows
 FOR EACH ROW EXECUTE FUNCTION privacy_private.follow_identity_immutable();
CREATE TRIGGER approval_follow_truncate_forbidden BEFORE TRUNCATE ON public.social_follows
 FOR EACH STATEMENT EXECUTE FUNCTION privacy_private.relationship_truncate_forbidden();

DO $bindings$
DECLARE found_count integer;
BEGIN
 IF EXISTS(
  SELECT 1 FROM pg_temp.global_preserved_relationship_triggers old
  LEFT JOIN pg_trigger t ON t.oid=old.oid
  WHERE t.oid IS NULL OR ROW(t.tgrelid,t.tgname,pg_get_triggerdef(t.oid,false),t.tgenabled)
   IS DISTINCT FROM ROW(old.tgrelid,old.tgname,old.definition,old.tgenabled)
 ) THEN RAISE EXCEPTION 'existing relationship trigger changed'; END IF;
 WITH expected(tbl,name,fn,kind) AS (VALUES
 ('public.blocked_users','approval_block_pair_lock','privacy_private.block_pair_lock()',31),
 ('public.blocked_users','approval_block_revoke','privacy_private.block_revoke_relationships()',5),
 ('public.blocked_users','approval_block_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34),
 ('public.community_blocks','approval_legacy_block_pair_lock','privacy_private.legacy_block_pair_lock()',31),
 ('public.community_blocks','approval_legacy_block_revoke','privacy_private.block_revoke_relationships()',5),
 ('public.community_blocks','approval_legacy_block_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34),
 ('public.social_follows','approval_follow_delete_revoke','privacy_private.follow_delete_revoke()',11),
 ('public.social_follows','approval_follow_identity_immutable','privacy_private.follow_identity_immutable()',19),
 ('public.social_follows','approval_follow_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34))
 SELECT count(*) INTO found_count FROM expected e JOIN pg_trigger t
 ON t.tgrelid=e.tbl::regclass AND t.tgname=e.name
 WHERE t.tgfoid=e.fn::regprocedure AND t.tgtype=e.kind AND t.tgenabled='O'
  AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgqual IS NULL;
 IF found_count<>9 THEN RAISE EXCEPTION 'relationship trigger binding post-state mismatch'; END IF;
 IF (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid IN ('public.blocked_users'::regclass,
  'public.community_blocks'::regclass,'public.social_follows'::regclass) AND NOT t.tgisinternal)
  <>9+(SELECT count(*) FROM pg_temp.global_preserved_relationship_triggers) THEN
  RAISE EXCEPTION 'unexpected relationship trigger inventory change'; END IF;
END $bindings$;

-- BEGIN REVIEWED RLS FRAGMENT: global-rls.FRAGMENT.sql
-- LOCAL INTEGRATION FRAGMENT ONLY; no independent BEGIN/COMMIT or approval setter.
-- Integrator must hold preflight-locks.sql locks BEFORE the unchanged37 baseline hash
-- guard, create the reviewed2 global RPCs CLOSED, apply this fragment, then grant APIs
-- and set GLOBAL last in that same transaction. Do not run this fragment by itself.
-- Keeps existing core function bodies and ownership unchanged. No accepted backfill.

-- Preserved historical exact policy guards: 45-block-policy-cutover.DRAFT.sql
SET LOCAL search_path=pg_catalog;
DO $baseline$
DECLARE actual jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid='public.blocked_users'::regclass AND relrowsecurity) THEN
  RAISE EXCEPTION 'block RLS baseline drift'; END IF;
 SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',policyname,'cmd',cmd,'roles',roles,'using',qual,'check',with_check,'permissive',permissive) ORDER BY policyname)
 INTO actual FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='blocked_users';
 IF actual IS DISTINCT FROM '[
 {"name":"Users can manage own blocked_users","cmd":"ALL","roles":["public"],"using":"((auth.uid() = blocker_id) OR (auth.uid() = blocked_id))","check":null,"permissive":"PERMISSIVE"},
 {"name":"users_can_block","cmd":"INSERT","roles":["public"],"using":null,"check":"(auth.uid() = blocker_id)","permissive":"PERMISSIVE"},
 {"name":"users_can_see_own_blocks","cmd":"SELECT","roles":["public"],"using":"(auth.uid() = blocker_id)","check":null,"permissive":"PERMISSIVE"},
 {"name":"users_can_unblock","cmd":"DELETE","roles":["public"],"using":"(auth.uid() = blocker_id)","check":null,"permissive":"PERMISSIVE"}
 ]'::jsonb THEN RAISE EXCEPTION 'block policy baseline drift'; END IF;
END
$baseline$;
-- Additional own-only permissive policies cannot override this broad ALL policy.
DROP POLICY "Users can manage own blocked_users" ON public.blocked_users;
CREATE POLICY block_participants_read ON public.blocked_users FOR SELECT TO authenticated
 USING ((auth.uid()=blocker_id) OR (auth.uid()=blocked_id));
-- Retain observed three blocker-owned SELECT/INSERT/DELETE policies unchanged.
-- No UPDATE policy remains. This does not revoke separate TRUNCATE authority;
-- final relationship guard/privilege review is required for non-REST legacy writers.
DO $post_state$
DECLARE actual jsonb;
BEGIN
 SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',policyname,'cmd',cmd,'roles',roles,'using',qual,'check',with_check,'permissive',permissive) ORDER BY policyname)
 INTO actual FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='blocked_users';
 IF actual IS DISTINCT FROM '[
 {"name":"block_participants_read","cmd":"SELECT","roles":["authenticated"],"using":"((auth.uid() = blocker_id) OR (auth.uid() = blocked_id))","check":null,"permissive":"PERMISSIVE"},
 {"name":"users_can_block","cmd":"INSERT","roles":["public"],"using":null,"check":"(auth.uid() = blocker_id)","permissive":"PERMISSIVE"},
 {"name":"users_can_see_own_blocks","cmd":"SELECT","roles":["public"],"using":"(auth.uid() = blocker_id)","check":null,"permissive":"PERMISSIVE"},
 {"name":"users_can_unblock","cmd":"DELETE","roles":["public"],"using":"(auth.uid() = blocker_id)","check":null,"permissive":"PERMISSIVE"}
 ]'::jsonb THEN RAISE EXCEPTION 'block policy post-state mismatch'; END IF;
END
$post_state$;

-- Preserved historical exact policy guards: 46-follow-select-cutover.DRAFT.sql
SET LOCAL search_path=pg_catalog;
DO $baseline$
DECLARE p record;
BEGIN
 SELECT * INTO p FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='social_follows' AND policyname='follows_select';
 IF NOT FOUND OR p.cmd<>'SELECT' OR p.permissive<>'PERMISSIVE' OR p.roles<>ARRAY['public']::name[] OR p.qual IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'follow SELECT baseline drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='social_follows' AND policyname<>'follows_select' AND cmd IN ('SELECT','ALL')) THEN
  RAISE EXCEPTION 'unreviewed follow SELECT/ALL policy'; END IF;
END
$baseline$;
ALTER POLICY follows_select ON public.social_follows USING (
 (SELECT auth.jwt()->'is_anonymous')='false'::jsonb
 AND (SELECT auth.uid()) IN (follower_id,following_id)
);

-- Preserved historical exact policy guards: 70-private-read-cutover.DRAFT.sql
SET LOCAL search_path=pg_catalog,public,pg_temp;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Serialize baseline verification and policy DDL; this briefly blocks table access.
LOCK TABLE public.goals,public.meal_items,public.meals,public.social_profiles,public.user_xp,public.users
 IN ACCESS EXCLUSIVE MODE;
DO $tables$
DECLARE row_count integer;
BEGIN
 SELECT count(*) INTO row_count FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('users','social_profiles','meals','meal_items','goals','user_xp')
 AND c.relrowsecurity AND NOT c.relforcerowsecurity
 AND pg_catalog.pg_get_userbyid(c.relowner)='postgres';
 IF row_count<>6 THEN RAISE EXCEPTION 'private-read table ownership/RLS baseline drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'private-read client role baseline drift'; END IF;
END
$tables$;
-- Existing same-named temporary tables cause CREATE failure; never drop/reuse them.
-- Public relations and dependencies are explicitly qualified. public precedes pg_temp
-- so the canonical deparser consistently resolves public.meals, not a temp shadow.
CREATE TEMP TABLE "users" (id uuid) ON COMMIT DROP;
CREATE TEMP TABLE "social_profiles" (user_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE "meals" (id uuid, user_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE "meal_items" (meal_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE "goals" (user_id uuid) ON COMMIT DROP;
CREATE TEMP TABLE "user_xp" (user_id uuid) ON COMMIT DROP;
CREATE POLICY "Users can insert their own profile" ON pg_temp."users" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can update their own profile" ON pg_temp."users" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = id));
CREATE POLICY "users_public_read" ON pg_temp."users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "profiles_insert" ON pg_temp."social_profiles" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "profiles_select" ON pg_temp."social_profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "profiles_update" ON pg_temp."social_profiles" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can create their own meals" ON pg_temp."meals" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can delete their own meals" ON pg_temp."meals" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "Users can update their own meals" ON pg_temp."meals" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own meals" ON pg_temp."meals" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "meals_public_read" ON pg_temp."meals" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Users can create their own meal items" ON pg_temp."meal_items" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
 FROM public.meals
 WHERE ((meals.id = meal_items.meal_id) AND (meals.user_id = auth.uid())))));
CREATE POLICY "Users can delete their own meal items" ON pg_temp."meal_items" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
 FROM public.meals
 WHERE ((meals.id = meal_items.meal_id) AND (meals.user_id = auth.uid())))));
CREATE POLICY "Users can update their own meal items" ON pg_temp."meal_items" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
 FROM public.meals
 WHERE ((meals.id = meal_items.meal_id) AND (meals.user_id = auth.uid())))));
CREATE POLICY "Users can view their own meal items" ON pg_temp."meal_items" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
 FROM public.meals
 WHERE ((meals.id = meal_items.meal_id) AND (meals.user_id = auth.uid())))));
CREATE POLICY "meal_items_public_read" ON pg_temp."meal_items" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Users can delete their own goals" ON pg_temp."goals" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own goals" ON pg_temp."goals" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own goals" ON pg_temp."goals" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own goals" ON pg_temp."goals" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "goals_public_read" ON pg_temp."goals" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Users insert own xp" ON pg_temp."user_xp" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users read own xp" ON pg_temp."user_xp" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users update own xp" ON pg_temp."user_xp" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "user_xp_public_read" ON pg_temp."user_xp" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE TEMP TABLE private_read_preserved_catalog ON COMMIT DROP AS
SELECT c.oid AS relid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('num',a.attnum,'acl',a.attacl) ORDER BY a.attnum)
  FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acls,
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',t.oid,'definition',pg_catalog.pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled) ORDER BY t.oid),'[]'::jsonb)
  FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid) AS triggers
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('users','social_profiles','meals','meal_items','goals','user_xp');
DO $baseline$
DECLARE actual jsonb; expected jsonb;
BEGIN
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'table',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
  'roles',p.polroles,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
  'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY c.relname,p.polname) INTO actual
 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('users','social_profiles','meals','meal_items','goals','user_xp');
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'table',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
  'roles',p.polroles,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
  'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY c.relname,p.polname) INTO expected
 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.oid=pg_catalog.pg_my_temp_schema() AND c.relname IN ('users','social_profiles','meals','meal_items','goals','user_xp');
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'private-read policy baseline drift'; END IF;
END
$baseline$;
-- BEGIN the six proposed, metadata-backed persistent policy edits.
ALTER POLICY users_public_read ON public.users USING (auth.uid()=id);
ALTER POLICY profiles_select ON public.social_profiles USING (auth.uid()=user_id);
DROP POLICY meals_public_read ON public.meals;
DROP POLICY meal_items_public_read ON public.meal_items;
DROP POLICY goals_public_read ON public.goals;
DROP POLICY user_xp_public_read ON public.user_xp;
-- END persistent policy edits. Mutation policies, grants and data stay untouched.
-- Derive the exact expected final catalog by applying the same changes only to probes.
ALTER POLICY users_public_read ON pg_temp.users USING (auth.uid()=id);
ALTER POLICY profiles_select ON pg_temp.social_profiles USING (auth.uid()=user_id);
DROP POLICY meals_public_read ON pg_temp.meals;
DROP POLICY meal_items_public_read ON pg_temp.meal_items;
DROP POLICY goals_public_read ON pg_temp.goals;
DROP POLICY user_xp_public_read ON pg_temp.user_xp;
DO $post_state$
DECLARE actual jsonb; expected jsonb;
BEGIN
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'table',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
  'roles',p.polroles,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
  'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY c.relname,p.polname) INTO actual
 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('users','social_profiles','meals','meal_items','goals','user_xp');
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'table',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
  'roles',p.polroles,'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
  'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY c.relname,p.polname) INTO expected
 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.oid=pg_catalog.pg_my_temp_schema() AND c.relname IN ('users','social_profiles','meals','meal_items','goals','user_xp');
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'private-read policy post-state mismatch'; END IF;
 IF EXISTS(
  (SELECT c.oid AS relid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('num',a.attnum,'acl',a.attacl) ORDER BY a.attnum)
  FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acls,
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',t.oid,'definition',pg_catalog.pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled) ORDER BY t.oid),'[]'::jsonb)
  FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid) AS triggers
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('users','social_profiles','meals','meal_items','goals','user_xp') EXCEPT SELECT * FROM pg_temp.private_read_preserved_catalog)
  UNION ALL
  (SELECT * FROM pg_temp.private_read_preserved_catalog EXCEPT SELECT c.oid AS relid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('num',a.attnum,'acl',a.attacl) ORDER BY a.attnum)
  FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acls,
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',t.oid,'definition',pg_catalog.pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled) ORDER BY t.oid),'[]'::jsonb)
  FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid) AS triggers
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('users','social_profiles','meals','meal_items','goals','user_xp'))
 ) THEN RAISE EXCEPTION 'private-read preserved catalog changed'; END IF;
END
$post_state$;
-- ON COMMIT DROP removes every temporary probe and its policies. On failure ROLLBACK
-- removes the whole attempted cutover; never auto-restore broad reads after success.

-- Adapted policy-only85: existing installed helper, same public-or-own rule.
SET LOCAL search_path=pg_catalog,public,pg_temp;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Dependency lock prevents DROP/ownership changes that require ACCESS EXCLUSIVE;
-- it does not pause ordinary block writes or replace the separate concurrent-DDL review.
LOCK TABLE public.blocked_users IN ACCESS SHARE MODE;
LOCK TABLE public.social_posts IN ACCESS EXCLUSIVE MODE;
-- Dependencies and existing helper body/owner/settings/closed grants are verified
-- by the full unchanged37 baseline fingerprint before this fragment. Do not create
-- or replace the helper: it is already installed and uses BOTH block stores.

-- Fail on existing temp-name collisions; never reuse or drop caller objects.
CREATE TEMP TABLE social_posts(user_id uuid,is_public boolean) ON COMMIT DROP;
CREATE POLICY "delete_own_posts" ON pg_temp.social_posts AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "insert_own_posts" ON pg_temp.social_posts AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "select_public_or_own_posts" ON pg_temp.social_posts AS PERMISSIVE FOR SELECT TO PUBLIC USING (((is_public = true) OR (auth.uid() = user_id)));
CREATE POLICY "update_own_posts" ON pg_temp.social_posts AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));
CREATE TEMP TABLE social_post_preserved_catalog ON COMMIT DROP AS
SELECT c.oid AS relid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('num',a.attnum,'acl',a.attacl) ORDER BY a.attnum)
 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acls,
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',t.oid,'definition',pg_catalog.pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled) ORDER BY t.oid),'[]'::jsonb)
 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid) AS triggers
 FROM pg_catalog.pg_class c WHERE c.oid='public.social_posts'::regclass;
DO $baseline$
DECLARE actual jsonb; expected jsonb;
BEGIN
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,
 'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
 'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY p.polname) INTO actual
 FROM pg_catalog.pg_policy p WHERE p.polrelid='public.social_posts'::regclass;
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,
 'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
 'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY p.polname) INTO expected
 FROM pg_catalog.pg_policy p WHERE p.polrelid='pg_temp.social_posts'::regclass;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'social-post policy baseline drift'; END IF;
END
$baseline$;
-- BEGIN persistent changes.
-- No actor input and no query of social_posts: no self-referential RLS recursion.
-- Canonical is_blocked is SECURITY INVOKER, so it sees every block as this reviewed
-- table owner. row_security=off makes an unexpected loss of bypass fail with error
-- rather than turn an invisible block into authorization. STABLE is per statement.
-- Minimal policy helper only, required independently of the rollout API grants.
GRANT EXECUTE ON FUNCTION public.social_post_author_visible(uuid) TO authenticated;
ALTER POLICY select_public_or_own_posts ON public.social_posts TO authenticated
 USING ((is_public=true OR auth.uid()=user_id) AND public.social_post_author_visible(user_id));
-- END persistent changes.
ALTER POLICY select_public_or_own_posts ON pg_temp.social_posts TO authenticated
 USING ((is_public=true OR auth.uid()=user_id) AND public.social_post_author_visible(user_id));
DO $post_state$
DECLARE actual jsonb; expected jsonb;
BEGIN
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,
 'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
 'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY p.polname) INTO actual
 FROM pg_catalog.pg_policy p WHERE p.polrelid='public.social_posts'::regclass;
SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,
 'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),
 'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY p.polname) INTO expected
 FROM pg_catalog.pg_policy p WHERE p.polrelid='pg_temp.social_posts'::regclass;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'social-post policy post-state mismatch'; END IF;
 IF EXISTS(
  (SELECT c.oid AS relid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('num',a.attnum,'acl',a.attacl) ORDER BY a.attnum)
 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acls,
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',t.oid,'definition',pg_catalog.pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled) ORDER BY t.oid),'[]'::jsonb)
 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid) AS triggers
 FROM pg_catalog.pg_class c WHERE c.oid='public.social_posts'::regclass EXCEPT SELECT * FROM pg_temp.social_post_preserved_catalog)
  UNION ALL
  (SELECT * FROM pg_temp.social_post_preserved_catalog EXCEPT SELECT c.oid AS relid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('num',a.attnum,'acl',a.attacl) ORDER BY a.attnum)
 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acls,
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',t.oid,'definition',pg_catalog.pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled) ORDER BY t.oid),'[]'::jsonb)
 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid) AS triggers
 FROM pg_catalog.pg_class c WHERE c.oid='public.social_posts'::regclass)
 ) THEN RAISE EXCEPTION 'social-post preserved catalog changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid='public.social_post_author_visible(uuid)'::regprocedure
  AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef
  AND p.provolatile='s' AND NOT p.proleakproof AND NOT p.proretset
  AND p.prorettype='boolean'::regtype AND (SELECT array_agg(v ORDER BY v) FROM unnest(p.proconfig) v)=ARRAY['row_security=off','search_path=pg_catalog']::text[]
  AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
  AND EXISTS(SELECT 1 FROM pg_temp.global_preserved_profile_helper b
   WHERE b.function_oid=p.oid AND b.owner_oid=p.proowner
    AND b.source=p.prosrc AND b.definition=pg_catalog.pg_get_functiondef(p.oid)))
  OR NOT pg_catalog.has_function_privilege('authenticated','public.social_post_author_visible(uuid)','EXECUTE')
  OR pg_catalog.has_function_privilege('anon','public.social_post_author_visible(uuid)','EXECUTE')
  OR pg_catalog.has_function_privilege('service_role','public.social_post_author_visible(uuid)','EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
   WHERE p.oid='public.social_post_author_visible(uuid)'::regprocedure AND (a.grantee NOT IN (p.proowner,'authenticated'::regrole::oid)
    OR a.privilege_type<>'EXECUTE' OR (a.grantee='authenticated'::regrole::oid AND a.is_grantable))) THEN
  RAISE EXCEPTION 'social-post helper security post-state mismatch'; END IF;
END
$post_state$;

-- Additional known interaction READ containment only. The full unchanged37/11
-- fingerprint verified these table owners/RLS/policies before any policy changes.
-- Restrictive policies AND with every existing permissive rule, never widening reads.
-- Parent post lookup runs as caller through the hardened social_posts SELECT policy.
-- Registered actor and both block stores are checked by the narrow boolean helper.
SET LOCAL search_path=pg_catalog;
CREATE POLICY community_global_read ON public.community_comments AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=community_comments.post_id));
CREATE POLICY community_global_read ON public.community_likes AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=community_likes.post_id));
CREATE POLICY community_global_read ON public.social_post_likes AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=social_post_likes.post_id));
CREATE POLICY community_global_read ON public.social_post_saves AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=social_post_saves.post_id));
-- Preserve the pre-existing participant-only commitment audience and filter both
-- counterpart identities. This policy cannot make a third-party commitment visible.
CREATE POLICY community_global_read ON public.community_commitments AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(auth.uid() IN(user_id,partner_id) AND public.social_post_author_visible(user_id) AND public.social_post_author_visible(partner_id));
-- Do NOT claim this fragment hardens the existing SECURITY DEFINER interaction
-- mutation RPCs. Their five exact bodies/signatures/grants are a separate bounded
-- gate. Existing permissive INSERT policies are preserved; restrictive checks follow. SELECT-dependent UPDATE/DELETE
-- may now lose rows hidden by a block or hidden parent post, intentionally.

CREATE POLICY community_global_insert ON public.community_comments AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=community_comments.post_id));
CREATE POLICY community_global_update ON public.community_comments AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=community_comments.post_id)) WITH CHECK(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=community_comments.post_id));

CREATE POLICY community_global_insert ON public.community_likes AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=community_likes.post_id));
CREATE POLICY community_global_update ON public.community_likes AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=community_likes.post_id)) WITH CHECK(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=community_likes.post_id));

CREATE POLICY community_global_insert ON public.social_post_likes AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=social_post_likes.post_id));
CREATE POLICY community_global_update ON public.social_post_likes AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=social_post_likes.post_id)) WITH CHECK(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=social_post_likes.post_id));

CREATE POLICY community_global_insert ON public.social_post_saves AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=social_post_saves.post_id));
CREATE POLICY community_global_update ON public.social_post_saves AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=social_post_saves.post_id)) WITH CHECK(auth.uid()=user_id AND public.social_post_author_visible(user_id) AND EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=social_post_saves.post_id));

-- END REVIEWED RLS FRAGMENT
-- LOCAL SOURCE INTEGRATION FRAGMENT ONLY. No transaction/approval setter.
-- Run baseline guard BEFORE any change to these five functions in the integrated
-- transaction. Preserve original owners and contracts; no anon/service EXECUTE.
-- Source: exact user-returned catalog CSV, not inferred function bodies.
SET LOCAL search_path=pg_catalog;
CREATE TEMP TABLE global_interaction_function_owners ON COMMIT DROP AS
SELECT p.oid, p.proowner FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('toggle_post_like','increment_comments','decrement_comments','increment_saves','decrement_saves');
DO $interaction_baseline$
DECLARE f record;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'interaction patch requires approved administrative owner'; END IF;
 IF (SELECT count(*) FROM pg_temp.global_interaction_function_owners)<>5 THEN RAISE EXCEPTION 'interaction function overload drift'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.decrement_comments(uuid)') AND p.prokind='f' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM NULL::text[] AND pg_catalog.pg_get_functiondef(p.oid)='CREATE OR REPLACE FUNCTION public.decrement_comments(post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.social_posts 
  SET comments_count = GREATEST(0, COALESCE(comments_count, 0) - 1) 
  WHERE id = post_id;
END;
$function$
' AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'interaction function exact baseline drift: decrement_comments(uuid)'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.decrement_saves(uuid)') AND p.prokind='f' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM NULL::text[] AND pg_catalog.pg_get_functiondef(p.oid)='CREATE OR REPLACE FUNCTION public.decrement_saves(post_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE social_posts SET saves_count = GREATEST(0, saves_count - 1) WHERE id = post_id
  RETURNING saves_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$function$
' AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'interaction function exact baseline drift: decrement_saves(uuid)'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.increment_comments(uuid)') AND p.prokind='f' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM NULL::text[] AND pg_catalog.pg_get_functiondef(p.oid)='CREATE OR REPLACE FUNCTION public.increment_comments(post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.social_posts
  SET comments_count = COALESCE(comments_count, 0) + 1
  WHERE id = post_id;
END;
$function$
' AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'interaction function exact baseline drift: increment_comments(uuid)'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.increment_saves(uuid)') AND p.prokind='f' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM NULL::text[] AND pg_catalog.pg_get_functiondef(p.oid)='CREATE OR REPLACE FUNCTION public.increment_saves(post_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE social_posts SET saves_count = saves_count + 1 WHERE id = post_id
  RETURNING saves_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$function$
' AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'interaction function exact baseline drift: increment_saves(uuid)'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.toggle_post_like(uuid,uuid)') AND p.prokind='f' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public']::text[] AND pg_catalog.pg_get_functiondef(p.oid)='CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid, p_user_id uuid)
 RETURNS TABLE(liked boolean, likes_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''public''
AS $function$
DECLARE
  v_liked boolean;
  v_count bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM community_likes WHERE post_id = p_post_id AND user_id = p_user_id) THEN
    DELETE FROM community_likes WHERE post_id = p_post_id AND user_id = p_user_id;
    v_liked := false;
  ELSE
    INSERT INTO community_likes (post_id, user_id) VALUES (p_post_id, p_user_id)
    ON CONFLICT (post_id, user_id) DO NOTHING;
    v_liked := true;
  END IF;

  SELECT COUNT(*) INTO v_count FROM community_likes WHERE post_id = p_post_id;

  UPDATE social_posts SET likes_count = v_count WHERE id = p_post_id;

  RETURN QUERY SELECT v_liked, v_count;
END;
$function$
' AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'interaction function exact baseline drift: toggle_post_like(uuid,uuid)'; END IF;

 -- New bodies rely on existing canonical private predicates. Fail closed if the
 -- retained old owner cannot execute them; do not silently change owner or grants.
 FOR f IN SELECT * FROM pg_temp.global_interaction_function_owners LOOP
  IF f.proowner<>'postgres'::regrole::oid THEN
   RAISE EXCEPTION 'interaction existing owner must be postgres; owner change is not authorized';
  END IF;
  IF NOT pg_catalog.has_schema_privilege(f.proowner,'privacy_private','USAGE')
   OR NOT pg_catalog.has_function_privilege(f.proowner,'privacy_private.registered_actor()','EXECUTE')
   OR NOT pg_catalog.has_function_privilege(f.proowner,'privacy_private.is_blocked(uuid,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'interaction retained owner lacks canonical predicate access';
  END IF;
 END LOOP;
END $interaction_baseline$;

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid,p_user_id uuid)
RETURNS TABLE(liked boolean,likes_count bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $interaction_like$
DECLARE actor uuid:=privacy_private.registered_actor(); v_liked boolean; v_count bigint;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR actor IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor) OR p_user_id IS DISTINCT FROM actor THEN
  RAISE EXCEPTION 'interaction unavailable' USING ERRCODE='42501';
 END IF;
 -- Lock the permitted parent before reading/reconciling actual interaction rows.
 -- Explicit public posts do not require private-profile acceptance; own posts remain.
 PERFORM 1 FROM public.social_posts p WHERE p.id=p_post_id
  AND (p.is_public IS TRUE OR p.user_id=actor)
  AND (p.user_id=actor OR NOT privacy_private.is_blocked(actor,p.user_id)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'post unavailable' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.community_likes l WHERE l.post_id=p_post_id AND l.user_id=actor) THEN
  DELETE FROM public.community_likes l WHERE l.post_id=p_post_id AND l.user_id=actor;
  v_liked:=false;
 ELSE
  INSERT INTO public.community_likes(post_id,user_id) VALUES(p_post_id,actor)
   ON CONFLICT(post_id,user_id) DO NOTHING;
  v_liked:=true;
 END IF;
 SELECT count(*) INTO v_count FROM public.community_likes l WHERE l.post_id=p_post_id;
 UPDATE public.social_posts p SET likes_count=v_count WHERE p.id=p_post_id;
 RETURN QUERY SELECT v_liked,v_count;
END $interaction_like$;

CREATE OR REPLACE FUNCTION public.increment_comments(post_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $interaction_counter$
DECLARE actor uuid:=privacy_private.registered_actor(); actual_count integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR actor IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor) THEN
  RAISE EXCEPTION 'interaction unavailable' USING ERRCODE='42501';
 END IF;
 -- Lock the permitted parent before reading/reconciling actual interaction rows.
 -- Explicit public posts do not require private-profile acceptance; own posts remain.
 PERFORM 1 FROM public.social_posts p WHERE p.id=post_id
  AND (p.is_public IS TRUE OR p.user_id=actor)
  AND (p.user_id=actor OR NOT privacy_private.is_blocked(actor,p.user_id)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'post unavailable' USING ERRCODE='P0002'; END IF;
 -- The client already inserts/deletes its own row before calling this RPC.
 -- A post-only decrement cannot prove who deleted a now-absent row. Reconcile
 -- actual stored rows instead of trusting replayable caller-controlled +/- deltas.
 SELECT count(*)::integer INTO actual_count FROM public.community_comments i WHERE i.post_id=increment_comments.post_id;
 UPDATE public.social_posts p SET comments_count=actual_count WHERE p.id=increment_comments.post_id;
 RETURN;
END $interaction_counter$;

CREATE OR REPLACE FUNCTION public.increment_saves(post_id uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $interaction_counter$
DECLARE actor uuid:=privacy_private.registered_actor(); actual_count integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR actor IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor) THEN
  RAISE EXCEPTION 'interaction unavailable' USING ERRCODE='42501';
 END IF;
 -- Lock the permitted parent before reading/reconciling actual interaction rows.
 -- Explicit public posts do not require private-profile acceptance; own posts remain.
 PERFORM 1 FROM public.social_posts p WHERE p.id=post_id
  AND (p.is_public IS TRUE OR p.user_id=actor)
  AND (p.user_id=actor OR NOT privacy_private.is_blocked(actor,p.user_id)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'post unavailable' USING ERRCODE='P0002'; END IF;
 -- The client already inserts/deletes its own row before calling this RPC.
 -- A post-only decrement cannot prove who deleted a now-absent row. Reconcile
 -- actual stored rows instead of trusting replayable caller-controlled +/- deltas.
 SELECT count(*)::integer INTO actual_count FROM public.social_post_saves i WHERE i.post_id=increment_saves.post_id;
 UPDATE public.social_posts p SET saves_count=actual_count WHERE p.id=increment_saves.post_id;
 RETURN actual_count;
END $interaction_counter$;

CREATE OR REPLACE FUNCTION public.decrement_comments(post_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $interaction_counter$
DECLARE actor uuid:=privacy_private.registered_actor(); actual_count integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR actor IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor) THEN
  RAISE EXCEPTION 'interaction unavailable' USING ERRCODE='42501';
 END IF;
 -- Lock the permitted parent before reading/reconciling actual interaction rows.
 -- Explicit public posts do not require private-profile acceptance; own posts remain.
 PERFORM 1 FROM public.social_posts p WHERE p.id=post_id
  AND (p.is_public IS TRUE OR p.user_id=actor)
  AND (p.user_id=actor OR NOT privacy_private.is_blocked(actor,p.user_id)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'post unavailable' USING ERRCODE='P0002'; END IF;
 -- The client already inserts/deletes its own row before calling this RPC.
 -- A post-only decrement cannot prove who deleted a now-absent row. Reconcile
 -- actual stored rows instead of trusting replayable caller-controlled +/- deltas.
 SELECT count(*)::integer INTO actual_count FROM public.community_comments i WHERE i.post_id=decrement_comments.post_id;
 UPDATE public.social_posts p SET comments_count=actual_count WHERE p.id=decrement_comments.post_id;
 RETURN;
END $interaction_counter$;

CREATE OR REPLACE FUNCTION public.decrement_saves(post_id uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $interaction_counter$
DECLARE actor uuid:=privacy_private.registered_actor(); actual_count integer;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR actor IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor) THEN
  RAISE EXCEPTION 'interaction unavailable' USING ERRCODE='42501';
 END IF;
 -- Lock the permitted parent before reading/reconciling actual interaction rows.
 -- Explicit public posts do not require private-profile acceptance; own posts remain.
 PERFORM 1 FROM public.social_posts p WHERE p.id=post_id
  AND (p.is_public IS TRUE OR p.user_id=actor)
  AND (p.user_id=actor OR NOT privacy_private.is_blocked(actor,p.user_id)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'post unavailable' USING ERRCODE='P0002'; END IF;
 -- The client already inserts/deletes its own row before calling this RPC.
 -- A post-only decrement cannot prove who deleted a now-absent row. Reconcile
 -- actual stored rows instead of trusting replayable caller-controlled +/- deltas.
 SELECT count(*)::integer INTO actual_count FROM public.social_post_saves i WHERE i.post_id=decrement_saves.post_id;
 UPDATE public.social_posts p SET saves_count=actual_count WHERE p.id=decrement_saves.post_id;
 RETURN actual_count;
END $interaction_counter$;

REVOKE ALL ON FUNCTION public.decrement_comments(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decrement_comments(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.decrement_saves(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decrement_saves(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.increment_comments(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.increment_comments(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.increment_saves(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.increment_saves(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.toggle_post_like(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.toggle_post_like(uuid,uuid) TO authenticated;

DO $interaction_poststate$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.proconfig,p.prosecdef,o.proowner AS original_owner
 FROM pg_catalog.pg_proc p JOIN pg_temp.global_interaction_function_owners o ON o.oid=p.oid LOOP
  IF f.proowner<>f.original_owner OR NOT f.prosecdef
   OR (SELECT array_agg(v ORDER BY v) FROM unnest(f.proconfig) v)<>ARRAY['row_security=off','search_path=pg_catalog']::text[]
   OR NOT pg_catalog.has_function_privilege('authenticated',f.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('anon',f.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('service_role',f.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode((SELECT proacl FROM pg_catalog.pg_proc WHERE oid=f.oid)) a
     WHERE a.grantee NOT IN(f.proowner,'authenticated'::regrole::oid) OR a.privilege_type<>'EXECUTE'
      OR (a.grantee='authenticated'::regrole::oid AND a.is_grantable)) THEN
   RAISE EXCEPTION 'interaction function post-state mismatch';
  END IF;
 END LOOP;
END $interaction_poststate$;

SET LOCAL search_path=pg_catalog;
-- The existing core readers/writers below remain byte-for-byte unchanged.
GRANT EXECUTE ON FUNCTION public.profile_snapshot(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_follow_request_inbox(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_follow_request(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_outbound_follow(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discover_profiles(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_profile_identities(text,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_accepted_profile_connections(uuid,text,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_profile_posts(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_weekly_tracking(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_post_authors(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_privacy_eligibility() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_outbound_follow_status(uuid) TO authenticated;
-- All legacy raw-table/service-role/Storage fixes must already be effective here.
-- Set eligibility last in the SAME transaction that grants the final API set.
UPDATE privacy_private.community_global_rollout SET mode='GLOBAL' WHERE singleton;
DO $state$ BEGIN
 IF (SELECT count(*) FROM privacy_private.community_global_rollout WHERE singleton AND mode='GLOBAL')<>1 THEN
  RAISE EXCEPTION 'global rollout control unavailable'; END IF;
END $state$;

CREATE TEMP TABLE global_postflight_result ON COMMIT DROP AS
-- Metadata + non-user singleton control only. No customer row output or mutation.
-- Targeted verification after the one-shot GLOBAL transaction, not a replacement
-- for actual Edge deployment/JWT tests. Every *_ok column must be true.
WITH api(signature) AS (VALUES
 ('public.profile_snapshot(uuid,text,text,text)'),('public.list_follow_request_inbox(text,integer)'),
 ('public.respond_follow_request(uuid,uuid,text,text)'),('public.change_outbound_follow(uuid,uuid,text,text)'),
 ('public.discover_profiles(uuid[])'),('public.search_profile_identities(text,integer,uuid)'),
 ('public.list_accepted_profile_connections(uuid,text,integer,uuid)'),('public.list_profile_posts(uuid,integer,text)'),
 ('public.profile_weekly_tracking(uuid,text,text)'),('public.visible_post_authors(uuid[])'),
 ('public.community_privacy_eligibility()'),('public.get_outbound_follow_status(uuid)'),
 ('public.social_post_author_visible(uuid)'),('public.toggle_post_like(uuid,uuid)'),
 ('public.increment_comments(uuid)'),('public.decrement_comments(uuid)'),
 ('public.increment_saves(uuid)'),('public.decrement_saves(uuid)')),
expected(tbl,name,fn,kind) AS (VALUES
 ('public.blocked_users','approval_block_pair_lock','privacy_private.block_pair_lock()',31),
 ('public.blocked_users','approval_block_revoke','privacy_private.block_revoke_relationships()',5),
 ('public.blocked_users','approval_block_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34),
 ('public.community_blocks','approval_legacy_block_pair_lock','privacy_private.legacy_block_pair_lock()',31),
 ('public.community_blocks','approval_legacy_block_revoke','privacy_private.block_revoke_relationships()',5),
 ('public.community_blocks','approval_legacy_block_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34),
 ('public.social_follows','approval_follow_delete_revoke','privacy_private.follow_delete_revoke()',11),
 ('public.social_follows','approval_follow_identity_immutable','privacy_private.follow_identity_immutable()',19),
 ('public.social_follows','approval_follow_truncate_forbidden','privacy_private.relationship_truncate_forbidden()',34)),
functions AS (SELECT a.signature,p.* FROM api a LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(a.signature))
SELECT 'global_privacy_cutover_v1' AS stage,
 (SELECT count(*)=1 FROM privacy_private.community_global_rollout WHERE singleton AND mode='GLOBAL') AS global_mode_ok,
 (SELECT count(*)=18 AND bool_and(oid IS NOT NULL AND proowner='postgres'::regrole AND prosecdef
  AND coalesce(proconfig @> ARRAY['search_path=pg_catalog','row_security=off']::text[],false)
  AND has_function_privilege('authenticated',oid,'EXECUTE')
  AND NOT has_function_privilege('anon',oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',oid,'EXECUTE')) FROM functions) AS api_owners_config_grants_ok,
 (SELECT count(*)=9 FROM expected e JOIN pg_catalog.pg_trigger t ON t.tgrelid=e.tbl::regclass
  AND t.tgname=e.name AND t.tgfoid=e.fn::regprocedure AND t.tgtype=e.kind
  AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgqual IS NULL) AS nine_relationship_bindings_ok,
 (SELECT count(*)=0 FROM pg_catalog.pg_policy p WHERE p.polname IN
  ('meals_public_read','meal_items_public_read','goals_public_read','user_xp_public_read')
  AND p.polrelid IN ('public.meals'::regclass,'public.meal_items'::regclass,'public.goals'::regclass,'public.user_xp'::regclass)) AS broad_health_policies_removed_ok,
 (SELECT count(*)=13 FROM pg_catalog.pg_policy p WHERE p.polname IN
  ('community_global_read','community_global_insert','community_global_update')
  AND p.polrelid IN ('public.community_comments'::regclass,'public.community_likes'::regclass,
  'public.social_post_likes'::regclass,'public.social_post_saves'::regclass,'public.community_commitments'::regclass)
  AND NOT p.polpermissive) AS restrictive_interaction_policies_ok;

DO $final_verification$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_temp.global_postflight_result WHERE global_mode_ok
  AND api_owners_config_grants_ok AND nine_relationship_bindings_ok
  AND broad_health_policies_removed_ok AND restrictive_interaction_policies_ok) THEN
  RAISE EXCEPTION 'global cutover postflight failed; transaction rolled back';
 END IF;
END $final_verification$;
SELECT * FROM pg_temp.global_postflight_result;
COMMIT;
