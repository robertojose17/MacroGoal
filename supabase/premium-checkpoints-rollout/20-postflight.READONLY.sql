-- READ ONLY. Run after an explicitly approved application; no synthetic events.
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
 has_schema_privilege('anon',n.oid,'USAGE') AS anon_schema,
 has_schema_privilege('authenticated',n.oid,'USAGE') AS authenticated_schema,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_table,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated_table,
 has_table_privilege('service_role',c.oid,'SELECT') AS service_read,
 has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE') AS service_direct_write
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='macrogoal_checkpoints_private' AND c.relname='checkpoint_events';
-- Expected RLS=true/FORCE=true, ordinary access=false, service_read=true, service_direct_write=false.
SELECT conname,contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid=to_regclass('macrogoal_checkpoints_private.checkpoint_events');
-- Expect PK(user_id,event_id) and BOTH cascading FKs to auth.users(id) and public.users(id).
SELECT p.proname,p.prosecdef,p.proconfig,r.rolname AS owner,r.rolbypassrls,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
WHERE n.nspname='public' AND p.proname='record_private_checkpoint_v1';
-- Expect exactly one (uuid,jsonb) function, SECURITY DEFINER, empty search_path,
-- approved owner with BYPASSRLS, ordinary execute=false and service execute=true.
SELECT * FROM pg_policies WHERE schemaname='macrogoal_checkpoints_private';
-- Expected no policies. Ordinary roles have neither grants nor row policies.
