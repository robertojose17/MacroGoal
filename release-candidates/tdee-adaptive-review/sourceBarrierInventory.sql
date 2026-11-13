-- Read-only catalog inventory. No account data and no capability certification.
-- Execute statements independently via the approved read-only connector.
SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relrowsecurity, c.relforcerowsecurity,
       has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') AS authenticated_update,
       has_table_privilege('authenticated',c.oid,'DELETE') AS authenticated_delete
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND
 ((n.nspname='public' AND c.relname IN ('users','goals','meals','meal_items','check_ins','trackers','tracker_entries','subscriptions','foods','food_items'))
 OR n.nspname IN ('macrogoal_observed_private','macrogoal_goal_write_private'))
ORDER BY 1,2;

SELECT n.nspname AS schema_name,c.relname AS relation_name,t.tgname,t.tgenabled,
       pg_catalog.pg_get_triggerdef(t.oid,true) AS definition
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND
 ((n.nspname='public' AND c.relname IN ('users','goals','meals','meal_items','check_ins','trackers','tracker_entries','subscriptions','foods','food_items'))
 OR n.nspname IN ('macrogoal_observed_private','macrogoal_goal_write_private'))
ORDER BY 1,2,3;

SELECT c.conrelid::regclass::text AS child,c.confrelid::regclass::text AS parent,
       pg_catalog.pg_get_constraintdef(c.oid,true) AS definition
FROM pg_catalog.pg_constraint c
WHERE c.contype='f' AND c.conrelid IN
 ('public.meal_items'::regclass,'public.meals'::regclass,'public.check_ins'::regclass,
  'public.trackers'::regclass,'public.tracker_entries'::regclass,'public.goals'::regclass,'public.subscriptions'::regclass)
ORDER BY 1,2;

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies
WHERE (schemaname='public' AND tablename IN ('users','goals','meals','meal_items','check_ins','trackers','tracker_entries','subscriptions','foods','food_items'))
 OR schemaname IN ('macrogoal_observed_private','macrogoal_goal_write_private')
ORDER BY 1,2,3;

-- Function definitions deliberately excluded here: inspect each reviewed writer
-- separately; do not dump unrelated operational code or secret-bearing bodies.
