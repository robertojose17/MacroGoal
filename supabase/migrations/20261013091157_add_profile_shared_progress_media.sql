SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE before_state jsonb; after_state jsonb;
BEGIN
 PERFORM set_config('search_path','pg_catalog',true);
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'unexpected installer role'; END IF;
 LOCK TABLE public.social_posts,public.progress_post_media,public.check_ins,public.check_in_photos,public.subscriptions,storage.objects,storage.buckets IN SHARE UPDATE EXCLUSIVE MODE;
 SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,
 'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',z.conname,'type',z.contype,'definition',pg_get_constraintdef(z.oid),'validated',z.convalidated) ORDER BY z.conname),'[]'::jsonb) FROM pg_constraint z WHERE z.conrelid=c.oid),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ci.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
 ) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname IN ('social_posts','check_ins','check_in_photos','subscriptions','progress_post_media')) OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='privacy_private' AND p.proname IN ('registered_actor','is_blocked','profile_post_cursor')) OR (n.nspname='public' AND p.proname IN ('can_view_profile','social_post_author_visible','list_profile_posts','can_read_progress_club')) OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN ('public.check_in_photos'::regclass,'public.subscriptions'::regclass) AND NOT tgisinternal)),
 'original_buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'limit',file_size_limit,'mime',allowed_mime_types) ORDER BY id) FROM storage.buckets WHERE id IN ('progress-photos','check-ins','check-in-photos','community-progress-media')),
 'service_role',(SELECT jsonb_build_object('bypass',rolbypassrls,'super',rolsuper) FROM pg_roles WHERE rolname='service_role')
) INTO before_state;
 IF md5(before_state::text)<>'1b466a8ddbc8fb8a15e600e276fd7b86' THEN RAISE EXCEPTION 'profile media baseline drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='list_profile_posts_with_media') THEN RAISE EXCEPTION 'target exists'; END IF;
 -- LOCAL CANDIDATE. Additive version; existing strict five-field DTO remains unchanged.
CREATE FUNCTION public.list_profile_posts_with_media(p_target_id uuid,p_limit integer DEFAULT 20,p_cursor text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off
AS $function$
DECLARE actor uuid:=privacy_private.registered_actor(); result jsonb; enriched jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
 -- Delegate authorization, argument validation and cursor pagination to the unchanged RPC.
 result:=public.list_profile_posts(p_target_id,p_limit,p_cursor);
 SELECT coalesce(jsonb_agg(item || jsonb_build_object('shared_media_ids',coalesce((
  SELECT jsonb_agg(m.id::text ORDER BY m.slot)
  FROM public.progress_post_media m JOIN public.social_posts p ON p.id=m.post_id
  WHERE p.id::text=item->>'id' AND p.user_id=p_target_id AND m.owner_id=p.user_id
   AND m.state='bound' AND m.slot BETWEEN 0 AND 3 AND p.post_type_v2='progress'
   AND (p.is_public IS TRUE OR actor=p.user_id)
   AND p.section IN ('feed','club')
   AND (p.audience IS NULL OR p.audience IN ('public','followers'))
   AND public.social_post_author_visible(p.user_id)
   AND (actor=p.user_id OR p.audience IS DISTINCT FROM 'followers' OR public.can_view_profile(p.user_id))
   AND (p.section<>'club' OR actor=p.user_id OR public.can_read_progress_club(actor))
   AND CASE WHEN jsonb_typeof(p.progress_stats->'photo_progress')='array' THEN
    jsonb_array_length(p.progress_stats->'photo_progress') BETWEEN 1 AND 4
    AND p.progress_stats->'photo_progress'->m.slot->>'media_id'=m.id::text
   ELSE false END
 ),'[]'::jsonb)) ORDER BY ordinal),'[]'::jsonb)
 INTO enriched FROM jsonb_array_elements(result->'items') WITH ORDINALITY x(item,ordinal);
 RETURN jsonb_set(result,'{items}',enriched);
END
$function$;
REVOKE ALL ON FUNCTION public.list_profile_posts_with_media(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_profile_posts_with_media(uuid,integer,text) TO authenticated;

 SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,
 'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',z.conname,'type',z.contype,'definition',pg_get_constraintdef(z.oid),'validated',z.convalidated) ORDER BY z.conname),'[]'::jsonb) FROM pg_constraint z WHERE z.conrelid=c.oid),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ci.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
 ) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname IN ('social_posts','check_ins','check_in_photos','subscriptions','progress_post_media')) OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='privacy_private' AND p.proname IN ('registered_actor','is_blocked','profile_post_cursor')) OR (n.nspname='public' AND p.proname IN ('can_view_profile','social_post_author_visible','list_profile_posts','can_read_progress_club')) OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN ('public.check_in_photos'::regclass,'public.subscriptions'::regclass) AND NOT tgisinternal)),
 'original_buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'limit',file_size_limit,'mime',allowed_mime_types) ORDER BY id) FROM storage.buckets WHERE id IN ('progress-photos','check-ins','check-in-photos','community-progress-media')),
 'service_role',(SELECT jsonb_build_object('bypass',rolbypassrls,'super',rolsuper) FROM pg_roles WHERE rolname='service_role')
) INTO after_state;
 IF before_state IS DISTINCT FROM after_state THEN RAISE EXCEPTION 'existing metadata changed'; END IF;
 IF NOT has_function_privilege('authenticated','public.list_profile_posts_with_media(uuid,integer,text)','EXECUTE') OR has_function_privilege('anon','public.list_profile_posts_with_media(uuid,integer,text)','EXECUTE') OR has_function_privilege('service_role','public.list_profile_posts_with_media(uuid,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'incorrect effective grants'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.list_profile_posts_with_media(uuid,integer,text)'::regprocedure AND p.prosecdef AND p.provolatile='s' AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=pg_catalog','row_security=off'] AND md5(p.prosrc)='65b5c5708bf0834a6e6eaea8b794186e') THEN RAISE EXCEPTION 'wrapper body or settings mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.list_profile_posts_with_media(uuid,integer,text)'::regprocedure AND a.grantee<>p.proowner AND (a.grantee<>'authenticated'::regrole::oid OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'unexpected grants'; END IF;
END
$install$;
