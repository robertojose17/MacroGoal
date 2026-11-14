-- REVIEW CANDIDATE ONLY. Requires reviewed registry/readiness schemas; no installation.
-- Raw evidence only. A row or a user answer is not model/policy/chain approval.
BEGIN;
CREATE FUNCTION macrogoal_snapshot_review_private.read_review_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid:=auth.uid(); result jsonb; goals_n bigint; anchors_n bigint; receipts_n bigint;
BEGIN
 IF actor IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 -- One SQL statement snapshot, including nested STABLE readers. No independent
 -- network/per-table read can supply a piece of this coherent envelope.
 WITH observation AS MATERIALIZED (
 SELECT public.observed_get_tdee_snapshot_v1() AS value
 ), readiness AS MATERIALIZED (
 SELECT public.tdee_read_readiness_v1() AS value
 ), profile AS MATERIALIZED (
 SELECT u.id,u.updated_at,u.sex,u.date_of_birth,u.timezone,u.journey_start_date,u.journey_restart_count
 FROM public.users u WHERE u.id=actor
 ), goal_rows AS MATERIALIZED (
 SELECT g.* FROM public.goals g WHERE g.user_id=actor AND g.is_active=true ORDER BY g.id LIMIT 2
 ), goals AS MATERIALIZED (
 SELECT count(*) AS n,jsonb_agg(to_jsonb(g) ORDER BY g.id)->0 AS value FROM goal_rows g
 ), anchor_rows AS MATERIALIZED (
 SELECT a.* FROM macrogoal_snapshot_review_private.anchors a CROSS JOIN goals g
 WHERE a.owner_id=actor AND a.active_goal_id::text=g.value->>'id' ORDER BY a.id LIMIT 2
 ), anchors AS MATERIALIZED (
 SELECT count(*) AS n,jsonb_agg(to_jsonb(a) ORDER BY a.id)->0 AS value FROM anchor_rows a
 ), policy_rows AS MATERIALIZED (
 SELECT p.* FROM macrogoal_snapshot_review_private.policies p CROSS JOIN anchors a
 WHERE p.version=a.value->>'policy_version'
 ), eligibility_rows AS MATERIALIZED (
 SELECT e.* FROM macrogoal_snapshot_review_private.eligibility e CROSS JOIN anchors a
 WHERE e.owner_id=actor AND e.policy_version=a.value->>'policy_version'
 ), receipt_count AS MATERIALIZED (
 -- Independent of join: missing/malformed proposal references cannot reduce count.
 SELECT count(*) AS n FROM macrogoal_snapshot_review_private.receipts r
 WHERE r.owner_id=actor AND r.status='committed'
 ), receipt_rows AS MATERIALIZED (
 SELECT r.* FROM macrogoal_snapshot_review_private.receipts r
 WHERE r.owner_id=actor AND r.status='committed' ORDER BY r.created_at,r.request_id LIMIT 1001
 ), chain_rows AS MATERIALIZED (
 SELECT r.request_id,r.created_at,to_jsonb(r) AS receipt,to_jsonb(p) AS proposal
 FROM receipt_rows r LEFT JOIN macrogoal_snapshot_review_private.proposals p
 ON p.owner_id=actor AND p.id::text=r.request->>'proposalId'
 ), chain AS MATERIALIZED (
 SELECT coalesce(jsonb_agg(jsonb_build_object('receipt',c.receipt,'proposal',c.proposal)
 ORDER BY c.created_at,c.request_id),'[]'::jsonb) AS rows FROM chain_rows c
 )
 SELECT g.n,a.n,rc.n,jsonb_build_object(
 'version','snapshot-review-context-v1','actor',actor,'capturedAt',o.value->'capturedAt',
 'observation',o.value,
 'profile',jsonb_build_object('id',u.id,'updatedAt',u.updated_at,'sex',u.sex,'dateOfBirth',u.date_of_birth,
 'timezone',u.timezone,'journeyStartDate',u.journey_start_date,'journeyRestartCount',u.journey_restart_count),
 'currentGoal',g.value,'readiness',rd.value,
 'readinessFingerprint',encode(sha256(convert_to((rd.value-'capturedAt')::text,'UTF8')),'hex'),
 'policy',(SELECT to_jsonb(p) FROM policy_rows p),'anchor',a.value,
 'eligibility',(SELECT to_jsonb(e) FROM eligibility_rows e),
 'receiptChain',jsonb_build_object('actor',actor,'anchor',a.value,'currentGoal',g.value,
 'totalCount',rc.n,'rows',c.rows),'actionable',false,'evidenceStatus','unverified')
 INTO goals_n,anchors_n,receipts_n,result
 FROM observation o CROSS JOIN readiness rd CROSS JOIN profile u CROSS JOIN goals g
 CROSS JOIN anchors a CROSS JOIN receipt_count rc CROSS JOIN chain c;
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable'; END IF;
 IF goals_n>1 OR anchors_n>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='review_context_ambiguous'; END IF;
 IF receipts_n>1000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt_chain_limit'; END IF;
 IF result#>>'{observation,ownerId}' IS DISTINCT FROM actor::text OR
 result#>>'{readiness,ownerId}' IS DISTINCT FROM actor::text THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_changed'; END IF;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.read_review_context()
FROM PUBLIC,anon,authenticated,service_role;
-- No grants, wrappers, source triggers, defaults granting review, policy seeds,
-- enrollment or acceptance. Existing receiptChain.ts must verify returned history.
-- All committed owner history is retained; earlier anchor history fails closed
-- until a separately reviewed epoch/partition proof exists. Never truncate history.
COMMIT;
