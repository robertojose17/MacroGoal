-- SYNTHETIC DATABASE ONLY. Mirrors the observed public.food_items policy shape
-- captured 2026-11-07; grants only SELECT/INSERT/UPDATE needed by this test.
-- Not a migration, production ACL replacement, or full production schema dump.
ALTER TABLE public.food_items NO FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.food_items TO anon, authenticated;
GRANT INSERT, UPDATE ON public.food_items TO authenticated;
CREATE POLICY food_items_authenticated_insert ON public.food_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY food_items_authenticated_update ON public.food_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY food_items_public_read ON public.food_items FOR SELECT TO authenticated USING (true);
CREATE POLICY food_items_select_all ON public.food_items FOR SELECT TO PUBLIC USING (true);
