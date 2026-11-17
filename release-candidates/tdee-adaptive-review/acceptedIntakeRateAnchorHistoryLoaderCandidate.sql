-- SOURCE ONLY. Not installed. No anchor insertion or approval creation.
CREATE SCHEMA tdee_rate_anchor_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA tdee_rate_anchor_private FROM PUBLIC,anon,authenticated,service_role;
-- Explicit reserved presence ledger, not a fabricated absence assertion.
-- No writer or grant exists. Persistence/immutability contract remains unimplemented.
-- SOURCE ONLY replacement for the reserved anchors table in loader candidate.
-- Do NOT install both table definitions. No live migration or writer modification.
CREATE TABLE tdee_rate_anchor_private.anchors (
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 version bigint NOT NULL CHECK(version>0 AND version<=9007199254740991),
 prior_version bigint,
 source_request_id uuid NOT NULL,
 source_goal_id uuid NOT NULL,
 accepted_at timestamptz NOT NULL CHECK(isfinite(accepted_at)),
 anchor jsonb NOT NULL CHECK(jsonb_typeof(anchor)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,version), UNIQUE(owner_id,source_request_id), UNIQUE(owner_id,source_goal_id),
 CHECK((version=1 AND prior_version IS NULL) OR (version>1 AND prior_version=version-1)),
 FOREIGN KEY(owner_id,prior_version) REFERENCES tdee_rate_anchor_private.anchors(owner_id,version)
);
ALTER TABLE tdee_rate_anchor_private.anchors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tdee_rate_anchor_private.anchors FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_rate_anchor_private.reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 -- Account erasure cascade only. Direct history deletion while owner exists stays forbidden.
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.owner_id) THEN
 RETURN OLD; END IF;
 RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='rate_anchor_history_immutable';
END $fn$;
REVOKE ALL ON FUNCTION tdee_rate_anchor_private.reject_history_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER rate_anchor_history_immutable BEFORE UPDATE OR DELETE ON tdee_rate_anchor_private.anchors
FOR EACH ROW EXECUTE FUNCTION tdee_rate_anchor_private.reject_history_mutation();
-- No INSERT authority until in-transaction trusted-source/plan SQL parity is implemented.
CREATE FUNCTION public.tdee_internal_rate_anchor_append_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required'; END IF;
 RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','anchor_persistence_contract_off');
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_internal_rate_anchor_append_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tdee_internal_rate_anchor_append_v1() TO service_role;

CREATE INDEX tdee_rate_anchor_latest_goal_receipt_idx
 ON macrogoal_goal_write_private.receipts(user_id,created_at DESC,request_id DESC);

CREATE FUNCTION tdee_rate_anchor_private.read_source(p_owner uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $function$
 WITH profile AS MATERIALIZED (
 SELECT u.* FROM public.users u JOIN auth.users au ON au.id=u.id
 WHERE u.id=p_owner AND au.deleted_at IS NULL AND au.is_anonymous IS DISTINCT FROM true
 AND (au.banned_until IS NULL OR au.banned_until<=statement_timestamp())
 ), goals AS MATERIALIZED (
 SELECT g.* FROM public.goals g WHERE g.user_id=p_owner AND g.is_active=true ORDER BY g.id LIMIT 2
 ), receipt_rows AS MATERIALIZED (
 -- Select latest BEFORE validating operation/goal. Never fall back to an older eligible receipt.
 SELECT r.* FROM macrogoal_goal_write_private.receipts r WHERE r.user_id=p_owner
 ORDER BY r.created_at DESC,r.request_id DESC LIMIT 2
 ), latest AS MATERIALIZED (
 SELECT r.* FROM receipt_rows r ORDER BY r.created_at DESC,r.request_id DESC LIMIT 1
 ), bindings AS MATERIALIZED (
 SELECT u.*,encode(sha256(convert_to(to_jsonb(u)::text,'UTF8')),'hex') AS full_fingerprint,
 encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'start',u.journey_start_date,
 'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex') AS jb
 FROM profile u
 ), envelope AS (
 SELECT jsonb_build_object('version','accepted-goal-rate-anchor-source-v1','ownerId',p_owner,
 'actionable',false,'capturedAt',statement_timestamp(),
 'existingAnchor',CASE
 WHEN EXISTS(SELECT 1 FROM macrogoal_snapshot_review_private.anchors a WHERE a.owner_id=p_owner)
 THEN jsonb_build_object('kind','legacy_anchor_present')
 WHEN EXISTS(SELECT 1 FROM tdee_rate_anchor_private.anchors a WHERE a.owner_id=p_owner)
 THEN (SELECT jsonb_build_object('kind','rate_anchor_head','ownerId',a.owner_id,
 'version',a.version,'sourceRequestId',a.source_request_id,'sourceGoalId',a.source_goal_id,'anchor',a.anchor) FROM tdee_rate_anchor_private.anchors a
 WHERE a.owner_id=p_owner ORDER BY a.version DESC LIMIT 1) ELSE NULL END,
 'currentGoal',(SELECT to_jsonb(g) FROM goals g ORDER BY g.id LIMIT 1),
 'currentProfile',jsonb_build_object('id',u.id,'onboarding_completed',u.onboarding_completed,
 'updated_at',u.updated_at,'journey_start_date',u.journey_start_date,'journey_restart_count',u.journey_restart_count,
 'date_of_birth',u.date_of_birth,'timezone',u.timezone),
 'currentMaterialProfile',macrogoal_goal_write_private.material_profile_v1(jsonb_populate_record(NULL::public.users,to_jsonb(u))),
 'currentProfileFingerprint',u.full_fingerprint,'journeyBinding',u.jb,
 'profileBinding',encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'dob',u.date_of_birth,'sex',u.sex,
 'journey',u.jb,'timezone',u.timezone)::text,'UTF8')),'hex'),
 'receipt',(SELECT jsonb_build_object('user_id',r.user_id,'request_id',r.request_id,'goal_id',r.goal_id,
 'goal_snapshot',r.goal_snapshot,'profile_fingerprint',r.profile_fingerprint,'created_at',r.created_at,
 'material_profile',r.material_profile,'material_profile_updated_at',r.material_profile_updated_at,
 'payload',jsonb_build_object('operation',r.payload->'operation')) FROM latest r)) AS value
 FROM bindings u WHERE (SELECT count(*) FROM goals)=1
 AND EXISTS(SELECT 1 FROM latest)
 -- Timestamp ties are ambiguous, not permission to guess latest by UUID.
 AND (SELECT count(*) FROM receipt_rows r WHERE r.created_at=(SELECT created_at FROM latest))=1
 ) SELECT coalesce((SELECT value FROM envelope),jsonb_build_object('version','accepted-goal-rate-anchor-source-v1',
 'ownerId',p_owner,'actionable',false,'unavailable',true));
$function$;
REVOKE ALL ON FUNCTION tdee_rate_anchor_private.read_source(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.tdee_internal_rate_anchor_source_v1(p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
AS $function$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service_role_required'; END IF;
 -- Immutable OFF before profile, receipt, or anchor reads. No request actor impersonation.
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_anchor_source_off'); END IF;
 RETURN tdee_rate_anchor_private.read_source(p_owner);
END $function$;
REVOKE ALL ON FUNCTION public.tdee_internal_rate_anchor_source_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tdee_internal_rate_anchor_source_v1(uuid) TO service_role;
