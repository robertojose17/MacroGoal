-- CANDIDATE ONLY: separate action-specific security approval required.
-- Do not read/copy the function body; it contains a credential.
-- Preserve its definition, owner, SECURITY DEFINER and existing server callers.
BEGIN;
DO $check$
BEGIN
 IF to_regprocedure('public.import_usda_page(text,integer)') IS NULL THEN RAISE EXCEPTION 'importer signature drift'; END IF;
END;
$check$;
REVOKE EXECUTE ON FUNCTION public.import_usda_page(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_usda_page(text,integer) TO service_role;
COMMIT;
-- Recheck function count, owner, ACL and metadata only; never log its body.
-- Apply before the separately approved nutrition authority guard, not by itself.
