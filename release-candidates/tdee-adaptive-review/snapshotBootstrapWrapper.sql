-- Recorded installed service-only adapter. No policy activation; do not reapply without checking live catalog.
BEGIN;
CREATE FUNCTION public.tdee_bootstrap_snapshot_review_v1(p_record jsonb) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $f$ SELECT macrogoal_snapshot_review_private.bootstrap(p_record) $f$;
REVOKE ALL ON FUNCTION public.tdee_bootstrap_snapshot_review_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_snapshot_review_private.bootstrap(jsonb),public.tdee_bootstrap_snapshot_review_v1(jsonb) TO service_role;
COMMIT;
