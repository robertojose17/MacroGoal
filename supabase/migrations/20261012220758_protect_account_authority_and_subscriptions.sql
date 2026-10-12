-- Review candidate only. Production action-time approval required.
SET LOCAL statement_timeout = '20s';
DO $install$
DECLARE before_hash text; after_hash text; helpers_ok boolean;
BEGIN
 IF current_setting('statement_timeout') <> '20s' THEN RAISE EXCEPTION 'Transaction timeout not established'; END IF;
 PERFORM set_config('search_path','pg_catalog',true);
 PERFORM set_config('lock_timeout','5s',true);
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Unexpected installer role'; END IF;
 LOCK TABLE public.users,public.subscriptions IN SHARE ROW EXCLUSIVE MODE;
 IF to_regnamespace('macrogoal_authority_private') IS NOT NULL THEN RAISE EXCEPTION 'Authority installation already exists'; END IF;
 IF (SELECT count(*) FROM auth.users WHERE id='3af0eabf-e742-4657-80c4-130dfa867502'::uuid AND email='rivera76115@gmail.com' AND email_confirmed_at IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'Owner identity drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id='3af0eabf-e742-4657-80c4-130dfa867502'::uuid AND is_admin IS TRUE AND user_type='premium') THEN RAISE EXCEPTION 'Existing owner authority drift'; END IF;
 SELECT md5(catalog::text) INTO before_hash FROM (SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('users','subscriptions')),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',a.attrelid::regclass::text,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN ('public.users'::regclass,'public.subscriptions'::regclass) AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('users','subscriptions')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('public.users'::regclass,'public.subscriptions'::regclass)),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',pg_get_functiondef(t.tgfoid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY t.tgrelid,t.tgname) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN ('public.users'::regclass,'public.subscriptions'::regclass) AND NOT t.tgisinternal AND t.tgname NOT IN ('zzzz_guard_user_authority','zzzz_guard_subscription_authority')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'login',rolcanlogin) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('member',pg_get_userbyid(member),'role',pg_get_userbyid(roleid)) ORDER BY member,roleid) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')))
) AS catalog) s;
 IF before_hash <> 'ad47ae97972b9f95fbd47c9630116dd9' THEN RAISE EXCEPTION 'Authority baseline changed'; END IF;
 EXECUTE $ddl$-- LOCAL CANDIDATE ONLY. Production preflight fingerprint and approval wrapper pending.
-- No data edits, RLS changes, existing grants changes, or management API added.
CREATE SCHEMA macrogoal_authority_private;
REVOKE ALL ON SCHEMA macrogoal_authority_private FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION macrogoal_authority_private.guard_user_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
DECLARE
  caller_role text := current_setting('role', true);
  trusted_backend boolean := false;
  verified_owner boolean := false;
BEGIN
  -- This is the DB session role set by the API, not user-editable JWT metadata.
  -- It stays authenticated across nested SECURITY DEFINER calls.
  trusted_backend := caller_role = 'service_role'
    OR (coalesce(caller_role,'none') = 'none' AND session_user IN ('postgres','supabase_admin'));
  verified_owner := caller_role = 'authenticated'
    AND auth.uid() = '3af0eabf-e742-4657-80c4-130dfa867502'::uuid;
  IF trusted_backend OR coalesce(verified_owner,false) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS DISTINCT FROM false
       OR (NEW.user_type IS NOT NULL AND NEW.user_type NOT IN ('guest','free'))
       OR NEW.subscription_status IS NOT NULL OR NEW.subscription_plan IS NOT NULL
       OR NEW.subscription_expires_at IS NOT NULL OR NEW.stripe_customer_id IS NOT NULL
       OR NEW.stripe_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'Account authority fields are server-managed' USING ERRCODE='42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.is_admin,NEW.user_type,NEW.subscription_status,NEW.subscription_plan,
           NEW.subscription_expires_at,NEW.stripe_customer_id,NEW.stripe_subscription_id)
       IS DISTINCT FROM
       ROW(OLD.is_admin,OLD.user_type,OLD.subscription_status,OLD.subscription_plan,
           OLD.subscription_expires_at,OLD.stripe_customer_id,OLD.stripe_subscription_id) THEN
      RAISE EXCEPTION 'Account authority fields are server-managed' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unexpected guard operation' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION macrogoal_authority_private.guard_user_authority() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zzzz_guard_user_authority BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION macrogoal_authority_private.guard_user_authority();

-- Subscriptions are server-owned entitlement records; ordinary clients read only.
-- Existing service webhook writes and existing owner's RLS-limited writes survive.
CREATE FUNCTION macrogoal_authority_private.guard_subscription_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
DECLARE caller_role text := current_setting('role', true);
BEGIN
 IF caller_role = 'service_role'
 OR (coalesce(caller_role,'none') = 'none' AND session_user IN ('postgres','supabase_admin'))
 OR (caller_role = 'authenticated' AND auth.uid() = '3af0eabf-e742-4657-80c4-130dfa867502'::uuid)
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Subscription authority is server-managed' USING ERRCODE='42501';
END
$guard$;
REVOKE ALL ON FUNCTION macrogoal_authority_private.guard_subscription_authority() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zzzz_guard_subscription_authority BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION macrogoal_authority_private.guard_subscription_authority();
$ddl$;
 SELECT md5(catalog::text) INTO after_hash FROM (SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('users','subscriptions')),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',a.attrelid::regclass::text,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN ('public.users'::regclass,'public.subscriptions'::regclass) AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('users','subscriptions')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('public.users'::regclass,'public.subscriptions'::regclass)),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',pg_get_functiondef(t.tgfoid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY t.tgrelid,t.tgname) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN ('public.users'::regclass,'public.subscriptions'::regclass) AND NOT t.tgisinternal AND t.tgname NOT IN ('zzzz_guard_user_authority','zzzz_guard_subscription_authority')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'login',rolcanlogin) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('member',pg_get_userbyid(member),'role',pg_get_userbyid(roleid)) ORDER BY member,roleid) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')))
) AS catalog) s;
 IF after_hash <> before_hash THEN RAISE EXCEPTION 'Existing authority catalog changed'; END IF;
 SELECT count(*)=2 AND bool_and(NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres'
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
 INTO helpers_ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='macrogoal_authority_private';
 IF helpers_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Guard function postflight failed'; END IF;
 IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='macrogoal_authority_private' AND t.tgtype=23 AND t.tgenabled='O' AND t.tgqual IS NULL AND t.tgattr=''::int2vector AND ((t.tgrelid='public.users'::regclass AND t.tgname='zzzz_guard_user_authority' AND p.proname='guard_user_authority') OR (t.tgrelid='public.subscriptions'::regclass AND t.tgname='zzzz_guard_subscription_authority' AND p.proname='guard_subscription_authority'))) <> 2 THEN RAISE EXCEPTION 'Guard trigger postflight failed'; END IF;
 IF has_schema_privilege('anon','macrogoal_authority_private','USAGE') OR has_schema_privilege('authenticated','macrogoal_authority_private','USAGE') OR has_schema_privilege('service_role','macrogoal_authority_private','USAGE') THEN RAISE EXCEPTION 'Private guard schema exposed'; END IF;
END
$install$;
