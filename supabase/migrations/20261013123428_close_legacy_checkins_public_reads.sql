-- Local reviewed containment; requires separate explicit release approval. No file deletion.
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $contain$
DECLARE before_state jsonb; after_state jsonb; expected_state jsonb; old_rows text; new_rows text; bucket_index integer; changed integer;
BEGIN
 PERFORM set_config('search_path','pg_catalog',true);
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'unexpected installer role'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE (rolsuper OR rolbypassrls) AND (pg_has_role('anon',oid,'MEMBER') OR pg_has_role('authenticated',oid,'MEMBER'))) THEN RAISE EXCEPTION 'ordinary API role bypass'; END IF;
 LOCK TABLE storage.objects,storage.buckets IN SHARE UPDATE EXCLUSIVE MODE;
 PERFORM 1 FROM storage.buckets ORDER BY id FOR UPDATE;
 PERFORM 1 FROM storage.objects WHERE bucket_id='check-ins' ORDER BY id FOR UPDATE;
 SELECT jsonb_build_object('roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'super',r.rolsuper,'bypass',r.rolbypassrls,'parents',(SELECT coalesce(jsonb_agg(parent.rolname ORDER BY parent.rolname),'[]'::jsonb) FROM pg_roles parent WHERE parent.oid<>r.oid AND pg_has_role(r.oid,parent.oid,'MEMBER'))) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')),'buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'limit',file_size_limit,'mime',allowed_mime_types) ORDER BY id) FROM storage.buckets),'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN ('storage.objects'::regclass,'storage.buckets'::regclass)),'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'permissive',p.polpermissive,'command',p.polcmd,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid='storage.objects'::regclass AND p.polname<>'legacy_checkins_direct_read_guard_v1')) INTO before_state;
 IF md5(before_state::text)<>'8c02193839eebb2e0bc1ebf58ea9696f' THEN RAISE EXCEPTION 'storage baseline drift'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='legacy_checkins_direct_read_guard_v1') THEN RAISE EXCEPTION 'target policy exists'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='check-ins' AND public=true) OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'unexpected containment baseline'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='check-ins')<>10 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='check-ins' AND metadata->>'size'='0')<>7 THEN RAISE EXCEPTION 'legacy inventory drift'; END IF;
 SELECT md5(string_agg(to_jsonb(o)::text,'' ORDER BY id)) INTO old_rows FROM storage.objects o WHERE bucket_id='check-ins';
 UPDATE storage.buckets SET public=false WHERE id='check-ins' AND public=true;
 GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'bucket update mismatch'; END IF;
 CREATE POLICY legacy_checkins_direct_read_guard_v1 ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC USING (bucket_id <> 'check-ins');
 SELECT jsonb_build_object('roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'super',r.rolsuper,'bypass',r.rolbypassrls,'parents',(SELECT coalesce(jsonb_agg(parent.rolname ORDER BY parent.rolname),'[]'::jsonb) FROM pg_roles parent WHERE parent.oid<>r.oid AND pg_has_role(r.oid,parent.oid,'MEMBER'))) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')),'buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'limit',file_size_limit,'mime',allowed_mime_types) ORDER BY id) FROM storage.buckets),'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN ('storage.objects'::regclass,'storage.buckets'::regclass)),'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'permissive',p.polpermissive,'command',p.polcmd,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid='storage.objects'::regclass AND p.polname<>'legacy_checkins_direct_read_guard_v1')) INTO after_state;
 SELECT ordinality::integer-1 INTO bucket_index FROM jsonb_array_elements(before_state->'buckets') WITH ORDINALITY b(value,ordinality) WHERE value->>'id'='check-ins';
 expected_state:=jsonb_set(before_state,ARRAY['buckets',bucket_index::text,'public'],'false'::jsonb,false);
 IF after_state IS DISTINCT FROM expected_state THEN RAISE EXCEPTION 'unrelated storage metadata changed'; END IF;
 SELECT md5(string_agg(to_jsonb(o)::text,'' ORDER BY id)) INTO new_rows FROM storage.objects o WHERE bucket_id='check-ins';
 IF old_rows IS DISTINCT FROM new_rows THEN RAISE EXCEPTION 'legacy objects changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='legacy_checkins_direct_read_guard_v1' AND NOT polpermissive AND polcmd='r' AND polroles=ARRAY[0::oid] AND polwithcheck IS NULL AND pg_get_expr(polqual,polrelid)='(bucket_id <> ''check-ins''::text)') THEN RAISE EXCEPTION 'restrictive guard mismatch'; END IF;
END
$contain$;
