-- CANDIDATE ONLY: do not install until reviewed. No public wrapper/grants.
-- Uses only existing live columns and the installed STABLE invoker observation
-- RPC. The outer STABLE function and nested STABLE call share the calling SQL
-- statement's MVCC snapshot. This is coherent reading, NOT writer serialization.
BEGIN;
CREATE SCHEMA IF NOT EXISTS macrogoal_adaptive_private;
REVOKE ALL ON SCHEMA macrogoal_adaptive_private FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION macrogoal_adaptive_private.read_enriched_source()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO pg_catalog,pg_temp AS $function$
DECLARE
 actor uuid := auth.uid();
 result jsonb;
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
 END IF;
 WITH observation AS MATERIALIZED (
   SELECT public.observed_get_tdee_snapshot_v1() AS value
 ), profile AS MATERIALIZED (
   SELECT u.id,u.updated_at,u.sex,u.date_of_birth FROM public.users u WHERE u.id=actor
 ), goal AS MATERIALIZED (
   SELECT to_jsonb(g) AS value FROM public.goals g
   WHERE g.user_id=actor AND g.is_active=true ORDER BY g.id LIMIT 2
 ), goals AS MATERIALIZED (
   SELECT count(*) AS n,jsonb_agg(value ORDER BY value->>'id')->0 AS value FROM goal
 )
 SELECT jsonb_build_object(
   'version','adaptive-source-snapshot-v1','ownerId',actor,
   'observation',o.value,
   'profile',jsonb_build_object('id',p.id,'updatedAt',p.updated_at,'sex',p.sex,'dateOfBirth',p.date_of_birth),
   'goalSnapshot',CASE WHEN g.n=1 THEN g.value ELSE NULL END,
   -- Target weight is preserved raw. No unit assumption or clinical eligibility
   -- can be inferred from a number in goals.target_weight.
   'targetWeight',jsonb_build_object('raw',g.value->'target_weight','unitVerified',false),
   'evidence',jsonb_build_object('writerProtocol','unverified','sourceEpoch',NULL,
     'sourceRevision',NULL,'loggingCompleteness','unverified','eligibility','unverified',
     'policy','unverified','modelValidation','unverified','acceptedAnchor','unverified'),
   'actionable',false)
 INTO result FROM observation o CROSS JOIN profile p CROSS JOIN goals g;
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable'; END IF;
 IF result->'observation'->>'ownerId' IS DISTINCT FROM actor::text THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_changed';
 END IF;
 RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION macrogoal_adaptive_private.read_enriched_source() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
