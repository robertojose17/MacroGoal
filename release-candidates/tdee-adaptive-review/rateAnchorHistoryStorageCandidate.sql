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
