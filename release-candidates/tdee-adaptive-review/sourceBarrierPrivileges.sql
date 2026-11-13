-- REVIEW ONLY. Requires explicit confirmation before changing live permissions.
-- Narrowly remove TRUNCATE bypass. Ordinary CRUD and RLS remain unchanged.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
REVOKE TRUNCATE ON TABLE public.users,public.goals,public.meals,public.meal_items,
 public.check_ins,public.trackers,public.tracker_entries,public.subscriptions
 FROM anon,authenticated,service_role;
DO $check$
DECLARE relation text; role_name text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['public.users','public.goals','public.meals','public.meal_items',
  'public.check_ins','public.trackers','public.tracker_entries','public.subscriptions'] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(role_name,relation,'TRUNCATE') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='truncate_privilege_still_inherited';
   END IF;
  END LOOP;
 END LOOP;
END $check$;
COMMIT;
