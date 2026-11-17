-- Source-only own-account read. Install with guarded existing-function/ACL migration.
CREATE OR REPLACE FUNCTION public.tdee_read_observed_coverage_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','pg_temp'
AS $function$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
 END IF;
 RETURN tdee_scheduler_private.read_observed_coverage_v1(actor);
END $function$;
REVOKE ALL ON FUNCTION public.tdee_read_observed_coverage_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_read_observed_coverage_v1() TO authenticated;
