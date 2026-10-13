-- LOCAL ONLY. No RPC is invoked by this installation.
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE before_state jsonb; after_state jsonb;
BEGIN
 PERFORM set_config('search_path','pg_catalog',true);
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'unexpected installer role'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE (rolsuper OR rolbypassrls) AND (pg_has_role('anon',oid,'MEMBER') OR pg_has_role('authenticated',oid,'MEMBER'))) THEN RAISE EXCEPTION 'unexpected API bypass'; END IF;
 LOCK TABLE public.blocked_users,public.community_blocks,public.users IN SHARE UPDATE EXCLUSIVE MODE;
 SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,
 'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',z.conname,'type',z.contype,'definition',pg_get_constraintdef(z.oid),'validated',z.convalidated) ORDER BY z.conname),'[]'::jsonb) FROM pg_constraint z WHERE z.conrelid=c.oid),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ci.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
 ) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname IN ('blocked_users','community_blocks','users'))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='privacy_private' AND p.proname IN ('registered_actor','is_blocked','lock_pair')) OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN ('public.blocked_users'::regclass,'public.community_blocks'::regclass,'public.users'::regclass) AND NOT tgisinternal)),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'bypass',r.rolbypassrls,'super',r.rolsuper,'parents',(SELECT coalesce(jsonb_agg(t.rolname ORDER BY t.rolname),'[]'::jsonb) FROM pg_roles t WHERE t.oid<>r.oid AND pg_has_role(r.oid,t.oid,'MEMBER'))) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
) INTO before_state;
 IF md5(before_state::text)<>'42b25b2718140d5f837a726240f68fde' THEN RAISE EXCEPTION 'blocked accounts baseline drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('list_my_blocked_accounts','unblock_my_account')) THEN RAISE EXCEPTION 'target exists'; END IF;
 -- LOCAL ONLY. Publishing these RPCs requires separate review and release approval.
CREATE FUNCTION public.list_my_blocked_accounts(p_limit integer DEFAULT 20,p_cursor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off
AS $body$
DECLARE actor uuid:=privacy_private.registered_actor(); result jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid limit' USING ERRCODE='22023'; END IF;
 WITH targets AS (
  SELECT blocked_id FROM public.blocked_users WHERE blocker_id=actor
  UNION SELECT blocked_id FROM public.community_blocks WHERE blocker_id=actor
 ), eligible AS MATERIALIZED (
  SELECT blocked_id FROM targets WHERE blocked_id IS NOT NULL AND blocked_id<>actor AND (p_cursor IS NULL OR blocked_id>p_cursor)
  ORDER BY blocked_id LIMIT p_limit+1
 ), page AS (SELECT blocked_id FROM eligible ORDER BY blocked_id LIMIT p_limit)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'userId',p.blocked_id::text,'displayName',left(coalesce(nullif(btrim(u.name),''),nullif(btrim(u.full_name),'')),200),
  'username',left(nullif(btrim(u.username),''),100)) ORDER BY p.blocked_id)
  FROM page p LEFT JOIN public.users u ON u.id=p.blocked_id),'[]'::jsonb),
  'hasMore',(SELECT count(*)>p_limit FROM eligible),
  'nextCursor',CASE WHEN (SELECT count(*)>p_limit FROM eligible) THEN (SELECT blocked_id::text FROM page ORDER BY blocked_id DESC LIMIT 1) ELSE NULL END)
 INTO result;
 RETURN result;
END
$body$;
CREATE FUNCTION public.unblock_my_account(p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off
AS $body$
DECLARE actor uuid:=privacy_private.registered_actor();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 IF p_target_id IS NULL OR p_target_id=actor THEN RAISE EXCEPTION 'invalid target' USING ERRCODE='22023'; END IF;
 PERFORM privacy_private.lock_pair(actor,p_target_id);
 DELETE FROM public.blocked_users WHERE blocker_id=actor AND blocked_id=p_target_id;
 DELETE FROM public.community_blocks WHERE blocker_id=actor AND blocked_id=p_target_id;
 RETURN jsonb_build_object('targetUserId',p_target_id::text,'blocked',false);
END
$body$;
REVOKE ALL ON FUNCTION public.list_my_blocked_accounts(integer,uuid),public.unblock_my_account(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_my_blocked_accounts(integer,uuid),public.unblock_my_account(uuid) TO authenticated;

 SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,
 'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',z.conname,'type',z.contype,'definition',pg_get_constraintdef(z.oid),'validated',z.convalidated) ORDER BY z.conname),'[]'::jsonb) FROM pg_constraint z WHERE z.conrelid=c.oid),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ci.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
 ) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname IN ('blocked_users','community_blocks','users'))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='privacy_private' AND p.proname IN ('registered_actor','is_blocked','lock_pair')) OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN ('public.blocked_users'::regclass,'public.community_blocks'::regclass,'public.users'::regclass) AND NOT tgisinternal)),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'bypass',r.rolbypassrls,'super',r.rolsuper,'parents',(SELECT coalesce(jsonb_agg(t.rolname ORDER BY t.rolname),'[]'::jsonb) FROM pg_roles t WHERE t.oid<>r.oid AND pg_has_role(r.oid,t.oid,'MEMBER'))) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
) INTO after_state;
 IF after_state IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'existing metadata changed'; END IF;
 
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.list_my_blocked_accounts(integer,uuid)'::regprocedure AND prosecdef AND provolatile='s' AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=pg_catalog','row_security=off'] AND md5(prosrc)='0aa15a3ac7b26c3d511788adaae44cbd') THEN RAISE EXCEPTION 'body settings mismatch'; END IF;
 IF NOT has_function_privilege('authenticated','public.list_my_blocked_accounts(integer,uuid)','EXECUTE') OR has_function_privilege('anon','public.list_my_blocked_accounts(integer,uuid)','EXECUTE') OR has_function_privilege('service_role','public.list_my_blocked_accounts(integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'effective grants mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.list_my_blocked_accounts(integer,uuid)'::regprocedure AND a.grantee<>p.proowner AND (a.grantee<>'authenticated'::regrole::oid OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'unexpected grants'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.unblock_my_account(uuid)'::regprocedure AND prosecdef AND provolatile='v' AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=pg_catalog','row_security=off'] AND md5(prosrc)='12dc0e5c896a84a45367dd874429bcb6') THEN RAISE EXCEPTION 'body settings mismatch'; END IF;
 IF NOT has_function_privilege('authenticated','public.unblock_my_account(uuid)','EXECUTE') OR has_function_privilege('anon','public.unblock_my_account(uuid)','EXECUTE') OR has_function_privilege('service_role','public.unblock_my_account(uuid)','EXECUTE') THEN RAISE EXCEPTION 'effective grants mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.unblock_my_account(uuid)'::regprocedure AND a.grantee<>p.proowner AND (a.grantee<>'authenticated'::regrole::oid OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'unexpected grants'; END IF;

END
$install$;
