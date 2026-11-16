-- SOURCE ONLY. Explicit existing service principal, never impersonates a user JWT.
CREATE FUNCTION tdee_rate_record_private.read_issuance_source(p_owner uuid,p_policy jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
 WITH account AS MATERIALIZED (SELECT u.id FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=p_owner AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=statement_timestamp())),
 candidate_policy AS MATERIALIZED (SELECT p.* FROM macrogoal_snapshot_review_private.policies p
 WHERE (p_policy IS NULL OR (p.version=p_policy->>'version' AND p.digest=p_policy->>'digest' AND p.engine_version=p_policy->>'engineVersion'))
 AND p.engine_version='rate-review-14d-v1' AND p.enabled=true AND p.reviewed=true AND p.snapshot_contract_reviewed=true AND p.expires_at>statement_timestamp()),
 selected_policy AS MATERIALIZED (SELECT * FROM candidate_policy WHERE (SELECT count(*) FROM candidate_policy)=1),
 context AS MATERIALIZED (SELECT jsonb_set(tdee_scheduler_private.read_context(a.id),'{policy}',to_jsonb(p)) AS c FROM account a CROSS JOIN selected_policy p),
 choice AS MATERIALIZED (SELECT m.* FROM macrogoal_snapshot_review_private.macro_choices m CROSS JOIN context x
 WHERE m.owner_id=p_owner AND m.goal_id=(x.c#>>'{currentGoal,id}')::uuid ORDER BY choice_version DESC LIMIT 1)
 SELECT coalesce((SELECT jsonb_build_object('version','rate-issuance-source-v1','ownerId',p_owner,
 'snapshot',x.c,'initialSource',tdee_rate_anchor_private.read_source(p_owner),'chain',tdee_rate_record_private.read_chain(p_owner),
 'choice',jsonb_build_object('version','macro-choice-state-v1','ownerId',p_owner,'capturedAt',clock_timestamp(),
 'copyVersion','macro-choice-v1','goalId',x.c#>'{currentGoal,id}','goalUpdatedAt',x.c#>'{currentGoal,updated_at}',
 'bindingStatus','available','profileBinding',x.c#>'{readiness,profileBinding}','journeyBinding',x.c#>'{readiness,journeyBinding}',
 'choiceVersion',coalesce(m.choice_version,0),'actionable',false,
 'choice',CASE WHEN m.request_id IS NOT NULL THEN jsonb_build_object('requestId',m.request_id,'choiceVersion',m.choice_version,'mode',m.mode,
 'splitBps',m.split_bps,'recordedAt',m.recorded_at,'goalUpdatedAt',m.goal_updated_at,'profileBinding',m.profile_binding,
 'journeyBinding',m.journey_binding,'copyVersion',m.copy_version,'current',
 coalesce(m.goal_updated_at=(x.c#>>'{currentGoal,updated_at}')::timestamptz AND m.profile_binding=x.c#>>'{readiness,profileBinding}' AND
 m.journey_binding=x.c#>>'{readiness,journeyBinding}' AND m.mode<>'revoked',false)) ELSE NULL END))
 FROM context x LEFT JOIN choice m ON true),jsonb_build_object('version','rate-issuance-source-v1','ownerId',p_owner,'unavailable',true));
$fn$;
REVOKE ALL ON FUNCTION tdee_rate_record_private.read_issuance_source(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tdee_internal_rate_source_v1(p_owner uuid,p_policy jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF NOT false THEN RETURN jsonb_build_object('enabled',false,'actionable',false,'reason','rate_issuance_off');END IF;
 RETURN tdee_rate_record_private.read_issuance_source(p_owner,p_policy);
END $fn$;
REVOKE ALL ON FUNCTION public.tdee_internal_rate_source_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_rate_source_v1(uuid,jsonb) TO service_role;
