-- Reviewed adapter candidate. No policy seed or recommendation activation.
-- Apply only after registry/context runtime tests, not by repository publication.
BEGIN;
CREATE FUNCTION public.tdee_read_review_context_v1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $f$ SELECT macrogoal_snapshot_review_private.read_review_context() $f$;
CREATE FUNCTION public.tdee_accept_snapshot_proposal_v1(p_request jsonb) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $f$ SELECT macrogoal_snapshot_review_private.accept_proposal(p_request) $f$;
CREATE FUNCTION public.tdee_read_snapshot_receipt_v1(p_request jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $f$ SELECT macrogoal_snapshot_review_private.read_receipt(p_request) $f$;
CREATE FUNCTION public.tdee_issue_snapshot_proposal_v1(p_id uuid,p_owner uuid,p_policy text,p_anchor uuid,p_expires_at timestamptz,p_payload jsonb) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp
AS $f$ SELECT macrogoal_snapshot_review_private.issue_proposal(p_id,p_owner,p_policy,p_anchor,p_expires_at,p_payload) $f$;
REVOKE ALL ON FUNCTION public.tdee_read_review_context_v1(),public.tdee_accept_snapshot_proposal_v1(jsonb),public.tdee_read_snapshot_receipt_v1(jsonb),
public.tdee_issue_snapshot_proposal_v1(uuid,uuid,text,uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA macrogoal_snapshot_review_private TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION macrogoal_snapshot_review_private.read_review_context(),
macrogoal_snapshot_review_private.accept_proposal(jsonb),macrogoal_snapshot_review_private.read_receipt(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tdee_read_review_context_v1(),public.tdee_accept_snapshot_proposal_v1(jsonb),
public.tdee_read_snapshot_receipt_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION macrogoal_snapshot_review_private.issue_proposal(uuid,uuid,text,uuid,timestamptz,jsonb),
public.tdee_issue_snapshot_proposal_v1(uuid,uuid,text,uuid,timestamptz,jsonb) TO service_role;
-- No direct table grants, owner bypass, general mutation API, or policy activation.
COMMIT;
