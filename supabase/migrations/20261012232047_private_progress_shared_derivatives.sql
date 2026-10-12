-- LOCAL REVIEW INSTALLER. No production execution is implied by this file.
-- Existing-user content is never updated/deleted. Creates only private derivative infrastructure.
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $shared_install$
DECLARE before_state jsonb; after_state jsonb;
BEGIN
 PERFORM set_config('search_path','pg_catalog',true);
 IF current_setting('statement_timeout')<>'30s' OR current_setting('lock_timeout')<>'5s' THEN RAISE EXCEPTION 'installer limits not configured'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname NOT IN ('anon','authenticated') AND (pg_has_role('anon',oid,'MEMBER') OR pg_has_role('authenticated',oid,'MEMBER'))) THEN RAISE EXCEPTION 'unexpected API role inheritance'; END IF;
 IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls) THEN RAISE EXCEPTION 'unexpected installer role'; END IF;
 LOCK TABLE public.social_posts,public.check_ins,public.check_in_photos,public.subscriptions,storage.objects,storage.buckets IN SHARE UPDATE EXCLUSIVE MODE;
 PERFORM 1 FROM storage.buckets WHERE id IN ('progress-photos','check-ins','check-in-photos') ORDER BY id FOR UPDATE;
 SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,
 'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname<>'progress_derivative_server_only'),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',z.conname,'type',z.contype,'definition',pg_get_constraintdef(z.oid),'validated',z.convalidated) ORDER BY z.conname),'[]'::jsonb) FROM pg_constraint z WHERE z.conrelid=c.oid),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ci.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
 ) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname IN ('social_posts','check_ins','check_in_photos','subscriptions')) OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='privacy_private' AND p.proname IN ('registered_actor','is_blocked')) OR (n.nspname='public' AND p.proname IN ('can_view_profile','social_post_author_visible')) OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN ('public.check_in_photos'::regclass,'public.subscriptions'::regclass) AND NOT tgisinternal)),
 'original_buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'limit',file_size_limit,'mime',allowed_mime_types) ORDER BY id) FROM storage.buckets WHERE id IN ('progress-photos','check-ins','check-in-photos')),
 'service_role',(SELECT jsonb_build_object('bypass',rolbypassrls,'super',rolsuper) FROM pg_roles WHERE rolname='service_role')
) INTO before_state;
 IF md5(before_state::text)<>'d9722dbc89e531a267da7c625e306eea' THEN RAISE EXCEPTION 'shared-media baseline drift'; END IF;
 IF to_regclass('public.progress_post_media') IS NOT NULL OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='community-progress-media' OR name='community-progress-media') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='progress_derivative_server_only') OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('reserve_progress_media','ready_progress_media','bind_progress_media','can_read_progress_club')) THEN RAISE EXCEPTION 'shared-media target already exists'; END IF;
-- LOCAL REVIEW FRAGMENT, NOT A GENERATED MIGRATION. No production execution.
-- Deployment must assert the separately reviewed source-identity immutability guard,
-- exact current social policies/functions, and storage policy baseline first.
CREATE TABLE public.progress_post_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 source_photo_id uuid NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
 sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','ready','bound')),
 post_id uuid, slot integer CHECK(slot BETWEEN 0 AND 3),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,idempotency_key), UNIQUE(post_id,slot),
 CHECK ((state='bound')=(post_id IS NOT NULL AND slot IS NOT NULL))
);
ALTER TABLE public.progress_post_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.progress_post_media FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.progress_post_media TO service_role;
-- No client policies, no client storage grants. New storage bucket created through
-- official Storage API separately with public=false and 8MiB JPEG/PNG constraints.
-- Existing broad storage policies MUST be restricted to exclude this bucket before release.
CREATE FUNCTION public.reserve_progress_media(p_actor uuid,p_source uuid,p_key text,p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE m public.progress_post_media; created boolean:=false;
BEGIN
 IF p_actor IS NULL OR p_source IS NULL OR p_key IS NULL OR p_key !~ '^[A-Za-z0-9:_-]{1,128}$' OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR NOT EXISTS(
 SELECT 1 FROM public.check_in_photos f LEFT JOIN public.check_ins c ON c.id=f.check_in_id
 WHERE f.id=p_source AND f.user_id=p_actor AND (f.check_in_id IS NULL OR c.user_id=p_actor)) THEN RAISE EXCEPTION 'unavailable'; END IF;
 INSERT INTO public.progress_post_media(owner_id,source_photo_id,idempotency_key,sha256)
 VALUES(p_actor,p_source,p_key,p_digest) ON CONFLICT(owner_id,idempotency_key) DO NOTHING RETURNING * INTO m;
 created:=FOUND;
 IF NOT created THEN
 SELECT * INTO m FROM public.progress_post_media WHERE owner_id=p_actor AND idempotency_key=p_key FOR UPDATE;
 IF m.source_photo_id IS DISTINCT FROM p_source OR m.sha256 IS DISTINCT FROM p_digest OR m.state NOT IN ('uploading','ready') THEN RAISE EXCEPTION 'conflicting or incomplete request'; END IF;
 END IF;
 RETURN jsonb_build_object('id',m.id,'owner',m.owner_id,'source',m.source_photo_id,'key',m.idempotency_key,'sha256',m.sha256,'state',m.state,'path',m.owner_id::text||'/'||m.id::text);
END $$;
CREATE FUNCTION public.ready_progress_media(p_actor uuid,p_media uuid,p_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET row_security=off AS $$
BEGIN
 UPDATE public.progress_post_media m SET state='ready' WHERE m.id=p_media AND m.owner_id=p_actor AND m.state='uploading' AND m.sha256=p_digest
 AND EXISTS(SELECT 1 FROM public.check_in_photos f LEFT JOIN public.check_ins c ON c.id=f.check_in_id WHERE f.id=m.source_photo_id AND f.user_id=p_actor AND (f.check_in_id IS NULL OR c.user_id=p_actor));
 RETURN FOUND OR EXISTS(SELECT 1 FROM public.progress_post_media WHERE id=p_media AND owner_id=p_actor AND sha256=p_digest AND state='ready');
END $$;
CREATE FUNCTION public.bind_progress_media(p_actor uuid,p_post uuid,p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET row_security=off AS $$
DECLARE p public.social_posts; m public.progress_post_media; i integer; expected jsonb;
BEGIN
 IF p_actor IS NULL OR p_post IS NULL OR p_ids IS NULL OR array_ndims(p_ids) IS DISTINCT FROM 1 OR array_lower(p_ids,1) IS DISTINCT FROM 1 OR cardinality(p_ids) NOT BETWEEN 1 AND 4 OR array_position(p_ids,NULL) IS NOT NULL OR
 (SELECT count(DISTINCT x) FROM unnest(p_ids) x)<>cardinality(p_ids) THEN RAISE EXCEPTION 'invalid request'; END IF;
 SELECT * INTO p FROM public.social_posts WHERE id=p_post AND user_id=p_actor FOR UPDATE;
 IF NOT FOUND OR p.post_type_v2 IS DISTINCT FROM 'progress' OR jsonb_typeof(p.progress_stats->'photo_progress') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF jsonb_array_length(p.progress_stats->'photo_progress')<>cardinality(p_ids) THEN RAISE EXCEPTION 'invalid slots'; END IF;
 -- Deterministic lock ordering; concurrent cross-post bind can never reassign mapping.
 PERFORM 1 FROM public.progress_post_media WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE;
 FOR i IN 1..cardinality(p_ids) LOOP
 SELECT * INTO m FROM public.progress_post_media WHERE id=p_ids[i] AND owner_id=p_actor;
 IF NOT FOUND OR (m.state<>'ready' AND NOT(m.state='bound' AND m.post_id=p_post AND m.slot=i-1)) THEN RAISE EXCEPTION 'unavailable'; END IF;
 IF (p.progress_stats->'photo_progress'->(i-1)->>'media_id') IS DISTINCT FROM m.id::text THEN RAISE EXCEPTION 'invalid slot'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.check_in_photos f LEFT JOIN public.check_ins c ON c.id=f.check_in_id WHERE f.id=m.source_photo_id AND f.user_id=p_actor AND (f.check_in_id IS NULL OR c.user_id=p_actor)) THEN RAISE EXCEPTION 'unavailable'; END IF;
 END LOOP;
 FOR i IN 1..cardinality(p_ids) LOOP
 UPDATE public.progress_post_media SET state='bound',post_id=p_post,slot=i-1 WHERE id=p_ids[i] AND state='ready';
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_progress_media(uuid,uuid,text,text),public.ready_progress_media(uuid,uuid,text),public.bind_progress_media(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_progress_media(uuid,uuid,text,text),public.ready_progress_media(uuid,uuid,text),public.bind_progress_media(uuid,uuid,uuid[]) TO service_role;

-- Mandatory deny all direct client operations including signing, regardless of other permissive policies.
CREATE POLICY progress_derivative_server_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(bucket_id <> 'community-progress-media') WITH CHECK(bucket_id <> 'community-progress-media');

-- Dedicated shared-media check, not a replacement of global premium logic.
-- REVIEW: alias list matches pinned usePremium.ts; no client/user_metadata flags.
-- No founder bypass or environmentfilter. Membership matches verified subscription
-- status, entitlement alias and expiry; trusted sandbox subscriptions remain eligible.
-- Owner may still read their own derivative; this predicate gates other viewers only.
CREATE FUNCTION public.can_read_progress_club(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog SET row_security=off AS $$
 SELECT p_actor IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.user_id=p_actor::text
   AND s.status IN ('active','trialing')
   AND s.entitlement_ids && ARRAY['pro','Macrogoal Pro','macrogoal_pro','premium']::text[]
   AND (s.expiration_at IS NULL OR s.expiration_at>now())
 )
$$;
REVOKE ALL ON FUNCTION public.can_read_progress_club(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_progress_club(uuid) TO service_role;

 INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('community-progress-media','community-progress-media',false,8388608,ARRAY['image/jpeg','image/png']);

 SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,
 'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname<>'progress_derivative_server_only'),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',z.conname,'type',z.contype,'definition',pg_get_constraintdef(z.oid),'validated',z.convalidated) ORDER BY z.conname),'[]'::jsonb) FROM pg_constraint z WHERE z.conrelid=c.oid),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ci.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
 ) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname IN ('social_posts','check_ins','check_in_photos','subscriptions')) OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='privacy_private' AND p.proname IN ('registered_actor','is_blocked')) OR (n.nspname='public' AND p.proname IN ('can_view_profile','social_post_author_visible')) OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN ('public.check_in_photos'::regclass,'public.subscriptions'::regclass) AND NOT tgisinternal)),
 'original_buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'limit',file_size_limit,'mime',allowed_mime_types) ORDER BY id) FROM storage.buckets WHERE id IN ('progress-photos','check-ins','check-in-photos')),
 'service_role',(SELECT jsonb_build_object('bypass',rolbypassrls,'super',rolsuper) FROM pg_roles WHERE rolname='service_role')
) INTO after_state;
 IF after_state IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'original catalog changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='community-progress-media' AND name=id AND public=false AND file_size_limit=8388608 AND allowed_mime_types=ARRAY['image/jpeg','image/png']) THEN RAISE EXCEPTION 'bucket verification failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.progress_post_media'::regclass AND relrowsecurity AND pg_get_userbyid(relowner)='postgres') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.progress_post_media'::regclass) THEN RAISE EXCEPTION 'mapping RLS verification failed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='public.progress_post_media'::regclass AND a.grantee<>c.relowner AND (a.grantee<>'service_role'::regrole::oid OR a.privilege_type NOT IN ('SELECT','INSERT','UPDATE') OR a.is_grantable)) THEN RAISE EXCEPTION 'mapping grants verification failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='progress_derivative_server_only' AND NOT polpermissive AND polcmd='*' AND polroles @> ARRAY['anon'::regrole::oid,'authenticated'::regrole::oid] AND cardinality(polroles)=2 AND pg_get_expr(polqual,polrelid)='(bucket_id <> ''community-progress-media''::text)' AND pg_get_expr(polwithcheck,polrelid)='(bucket_id <> ''community-progress-media''::text)') THEN RAISE EXCEPTION 'direct-client guard verification failed'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('reserve_progress_media','ready_progress_media','bind_progress_media','can_read_progress_club') AND NOT p.prosecdef AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig @> ARRAY['search_path=pg_catalog','row_security=off'])<>4 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE n.nspname='public' AND p.proname IN ('reserve_progress_media','ready_progress_media','bind_progress_media','can_read_progress_club') AND a.grantee<>p.proowner AND (a.grantee<>'service_role'::regrole::oid OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'RPC grants verification failed'; END IF;
 IF NOT has_table_privilege('service_role','public.progress_post_media','SELECT') OR NOT has_table_privilege('service_role','public.progress_post_media','INSERT') OR NOT has_table_privilege('service_role','public.progress_post_media','UPDATE') OR has_table_privilege('service_role','public.progress_post_media','DELETE') OR has_table_privilege('service_role','public.progress_post_media','TRUNCATE') OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) role_name CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege_name WHERE has_table_privilege(role_name,'public.progress_post_media',privilege_name)) THEN RAISE EXCEPTION 'effective mapping privileges incorrect'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('reserve_progress_media','ready_progress_media','bind_progress_media','can_read_progress_club') AND (NOT has_function_privilege('service_role',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'effective RPC privileges incorrect'; END IF;
END
$shared_install$;
