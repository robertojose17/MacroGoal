-- SOURCE-ONLY explicit-owner background context; no auth.uid substitution or session impersonation.
-- Private helpers revoked from all app roles; fixed service wrapper remains immutable OFF.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='5s';
DO $source_fence$ BEGIN
 IF md5(pg_get_functiondef('entitlement_cache_candidate.tester_access(uuid)'::regprocedure))<>'d6f71c1a01a045706e9b8d6f3c0eb6e2' THEN RAISE EXCEPTION 'tester_evaluator_changed_review_required'; END IF;
 IF md5(pg_get_functiondef('public.tdee_read_logged_nutrition_evidence_v1(uuid,uuid)'::regprocedure))<>'0b458fa52bc72254f2b7d3a44ab2c855' THEN RAISE EXCEPTION 'source_context_changed_review_required'; END IF;
 IF md5(pg_get_functiondef('public.observed_get_tdee_snapshot_v1()'::regprocedure))<>'2f8a64435279c6a15c4dba5108992929' THEN RAISE EXCEPTION 'source_context_changed_review_required'; END IF;
 IF md5(pg_get_functiondef('macrogoal_readiness_private.read_state()'::regprocedure))<>'e396be44b85bec9032ec43ef3b1e7981' THEN RAISE EXCEPTION 'source_context_changed_review_required'; END IF;
 IF md5(pg_get_functiondef('macrogoal_snapshot_review_private.read_review_context()'::regprocedure))<>'67e6281cbbe97b695c2f408fcd664f4d' THEN RAISE EXCEPTION 'source_context_changed_review_required'; END IF;
END $source_fence$;
CREATE FUNCTION tdee_scheduler_private.read_item_evidence(p_owner uuid,p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE a uuid:=p_owner; result jsonb;
BEGIN
 SELECT jsonb_build_object('version','logged-nutrition-evidence-state-v1',
  'ownerId',a,'itemId',i.id,'revision',i.nutrition_revision,
  'expected',b.binding,'evidenceVersion',coalesce(e.event_version,0),
  'evidence',CASE WHEN e.status='active' AND i.nutrition_revision IS NOT NULL
    AND e.revision=i.nutrition_revision AND e.item_snapshot=b.binding
    AND i.is_scheduled IS FALSE THEN
   jsonb_build_object('version','user-entered-v1','ownerId',a,'itemId',i.id,
    'revision',i.nutrition_revision,'status','active','declaredFields',e.declared_fields,
    'values',b.binding->'values') ELSE NULL END,
  'receipt',CASE WHEN r.request_id IS NOT NULL THEN jsonb_build_object(
    'requestId',r.request_id,'requestDigest',r.request_digest,
    'eventVersion',r.event_version,'status',r.status) ELSE NULL END)
 INTO result
 FROM public.meal_items i JOIN public.meals m ON m.id=i.meal_id AND m.user_id=a
 CROSS JOIN LATERAL(SELECT macrogoal_logged_nutrition_private.item_binding(to_jsonb(i),to_jsonb(m)) AS binding)b
 LEFT JOIN LATERAL(SELECT * FROM macrogoal_logged_nutrition_private.evidence_events
   WHERE owner_id=a AND item_id=i.id ORDER BY event_version DESC LIMIT 1)e ON true
 LEFT JOIN macrogoal_logged_nutrition_private.evidence_events r
   ON r.owner_id=a AND r.item_id=i.id AND r.request_id=NULL::uuid
 WHERE i.id=p_item_id;
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='item_unavailable'; END IF;
 RETURN result;
END $function$;

REVOKE ALL ON FUNCTION tdee_scheduler_private.read_item_evidence(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION tdee_scheduler_private.read_readiness(p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE a uuid:=p_owner; u public.users;
 t date; first_day date; pb text; jb text; at_time timestamptz:=statement_timestamp();
 e macrogoal_readiness_private.attestations; ds jsonb; n bigint;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=a;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=u.timezone) THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable'; END IF;
 t:=(at_time AT TIME ZONE u.timezone)::date;
 first_day:=greatest(t-29,coalesce(u.journey_start_date,t-29));
 jb:=encode(sha256(convert_to(jsonb_build_object('owner',a,'start',u.journey_start_date,
 'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex');
 pb:=encode(sha256(convert_to(jsonb_build_object('owner',a,'dob',u.date_of_birth,'sex',u.sex,
 'journey',jb,'timezone',u.timezone)::text,'UTF8')),'hex');
 SELECT * INTO e FROM macrogoal_readiness_private.attestations WHERE owner_id=a;
 SELECT count(*) INTO n FROM public.meals WHERE user_id=a AND date>=first_day AND date<t;
 IF n>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_limit'; END IF;
 SELECT count(*) INTO n FROM public.meal_items i JOIN public.meals m ON m.id=i.meal_id
 WHERE m.user_id=a AND m.date>=first_day AND m.date<t;
 IF n>5000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_limit'; END IF;
 WITH days AS (
 SELECT first_day+x AS day FROM generate_series(0, greatest(-1,t-first_day-1)) x
 ), meals AS MATERIALIZED (
 SELECT m.id,m.date,m.meal_type,m.created_at,m.updated_at FROM public.meals m
 WHERE m.user_id=a AND m.date>=first_day AND m.date<t
 ), items AS MATERIALIZED (
 SELECT m.date,i.id,i.meal_id,i.food_id,i.food_item_id,i.quantity,i.grams,i.calories,
 i.protein,i.carbs,i.fats,i.fiber,i.is_scheduled,i.logged_at,i.serving_unit,i.serving_description
 FROM public.meal_items i JOIN meals m ON m.id=i.meal_id WHERE i.is_scheduled IS DISTINCT FROM true
 ), digests AS (
 SELECT d.day,encode(sha256(convert_to(jsonb_build_object('day',d.day,'timezone',u.timezone,
 'journey',jb,'meals',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM meals m WHERE m.date=d.day),'[]'::jsonb),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM items i WHERE i.date=d.day),'[]'::jsonb))::text,'UTF8')),'hex') AS hash,
 EXISTS(SELECT 1 FROM items i WHERE i.date=d.day) AND
 NOT EXISTS(SELECT 1 FROM items i WHERE i.date=d.day AND
 (i.is_scheduled IS DISTINCT FROM false OR i.calories IS NULL OR i.calories::text IN ('NaN','Infinity','-Infinity') OR i.calories<0)) AND
 coalesce((SELECT sum(i.calories) FROM items i WHERE i.date=d.day),0)>0 AS confirmable
 FROM days d
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',d.day,'contentHash',d.hash,'confirmable',d.confirmable,
 'confirmed',coalesce(c.confirmed AND c.content_hash=d.hash AND c.journey_binding=jb AND c.timezone=u.timezone
 AND c.version='complete-day-v1' AND d.confirmable,false)) ORDER BY d.day),'[]'::jsonb)
 INTO ds FROM digests d LEFT JOIN macrogoal_readiness_private.complete_days c ON c.owner_id=a AND c.day=d.day;
 RETURN jsonb_build_object('version','tdee-readiness-v1','ownerId',a,'capturedAt',at_time,
 'questionnaireVersion','general-adult-v1','statementVersion','complete-day-v1',
 'profileBinding',pb,'journeyBinding',jb,'timezone',u.timezone,'today',t,
 'eligibility',jsonb_build_object('response',e.response,
 'current',coalesce(e.version='general-adult-v1' AND e.profile_binding=pb AND e.journey_binding=jb
 AND e.accepted_at<=at_time AND e.expires_at>at_time,false),
 'adult',coalesce(u.date_of_birth<=(t-interval '19 years')::date AND u.date_of_birth>date '1900-01-01',false)), 'days',ds);
END $function$;

REVOKE ALL ON FUNCTION tdee_scheduler_private.read_readiness(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION tdee_scheduler_private.read_observation(p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  actor uuid := p_owner;
  captured_at timestamptz := statement_timestamp();
  result jsonb;
  profile_ok boolean;
  goal_count bigint;
  tracker_count bigint;
  checkin_count bigint;
  entry_count bigint;
  meal_count bigint;
  item_count bigint;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required';
  END IF;

  -- Do not call the old VOLATILE context helper here. All database inputs are
  -- materialized by this single query, under server-only explicit owner scope.
  WITH profile AS MATERIALIZED (
    SELECT u.id,u.timezone,u.date_of_birth,u.journey_start_date,u.updated_at,
      EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=u.timezone) AS valid_zone
    FROM public.users u WHERE u.id=actor
  ), access_snapshot AS MATERIALIZED (
    -- Read the genuine entitlement decision once. Premium and its validity
    -- marker must describe the same proof; never manufacture a replacement TTL.
    SELECT tdee_scheduler_private.read_access(actor) AS value
  ), context_input AS MATERIALIZED (
    SELECT p.*,a.value AS access_info,
      CASE WHEN p.valid_zone THEN (captured_at AT TIME ZONE p.timezone)::date END AS today,
      coalesce(s.enabled,false) AS enabled, coalesce(s.review_day,0) AS review_day,
      s.started_on, to_jsonb(s) AS settings_record,
      coalesce((a.value->>'allowed')::boolean,false) AS premium
    FROM profile p CROSS JOIN access_snapshot a LEFT JOIN macrogoal_observed_private.settings s ON s.user_id=actor
  ), goal_rows AS MATERIALIZED (
    SELECT g.id,g.daily_calories,g.protein_g,g.carbs_g,g.fats_g,g.fiber_g,
      g.macro_preset,g.goal_type,g.loss_rate_lbs_per_week,g.updated_at
    FROM public.goals g WHERE g.user_id=actor AND g.is_active=true
    ORDER BY g.id LIMIT 2
  ), goal_data AS MATERIALIZED (
    SELECT count(*) AS n,
      CASE WHEN count(*)=1 THEN (jsonb_agg(to_jsonb(g)-'updated_at' ORDER BY g.id))->0 END AS raw_goal,
      CASE WHEN count(*)=1 THEN (jsonb_agg(to_jsonb(g.updated_at) ORDER BY g.id))->0 END AS goal_updated_at
    FROM goal_rows g
  ), goal_checked AS MATERIALIZED (
    SELECT n,goal_updated_at,
      CASE WHEN raw_goal IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM jsonb_each(raw_goal) kv
          WHERE kv.key IN ('daily_calories','protein_g','carbs_g','fats_g','fiber_g')
          AND (jsonb_typeof(kv.value) IS DISTINCT FROM 'number' OR
            CASE WHEN jsonb_typeof(kv.value)='number' THEN (kv.value::text)::numeric<0 ELSE false END))
        AND (raw_goal->>'daily_calories')::numeric>0
      THEN raw_goal ELSE NULL END AS goal
    FROM goal_data
  ), scoped AS MATERIALIZED (
    SELECT c.*,g.n AS goal_count,g.goal,g.goal_updated_at,
      c.today-29 AS window_start,
      coalesce(c.started_on,c.today)+((c.review_day-extract(dow FROM coalesce(c.started_on,c.today))::integer+7)%7) AS due
    FROM context_input c CROSS JOIN goal_checked g
  ), tracker_rows AS MATERIALIZED (
    SELECT t.id,t.unit FROM public.trackers t CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND t.user_id=actor AND t.is_default=true
      AND t.name ILIKE 'weight'
    ORDER BY t.id LIMIT 2
  ), checkin_rows AS MATERIALIZED (
    SELECT w.id,w.date,w.weight,w.updated_at,w.created_at
    FROM public.check_ins w CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND w.user_id=actor AND w.weight IS NOT NULL
      AND w.date>=c.window_start AND w.date<c.today
    ORDER BY w.id LIMIT 5001
  ), entry_rows AS MATERIALIZED (
    SELECT w.id,w.tracker_id,w.date,w.value,w.created_at
    FROM public.tracker_entries w JOIN tracker_rows t ON t.id=w.tracker_id CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND w.user_id=actor
      AND w.date>=c.window_start AND w.date<c.today
    ORDER BY w.id LIMIT 5001
  ), meal_rows AS MATERIALIZED (
    SELECT m.id,m.date,m.meal_type FROM public.meals m CROSS JOIN scoped c
    WHERE c.premium AND c.enabled AND m.user_id=actor
      AND m.date>=c.window_start AND m.date<c.today
    ORDER BY m.id LIMIT 501
  ), item_rows AS MATERIALIZED (
    SELECT i.id,i.meal_id,i.calories,i.is_scheduled,i.protein,i.carbs,i.fats,i.fiber,i.nutrition_revision,
      CASE WHEN i.nutrition_revision IS NOT NULL THEN
        tdee_scheduler_private.read_item_evidence(actor,i.id)->'evidence'
      ELSE NULL END AS nutrition_evidence
    FROM public.meal_items i JOIN meal_rows m ON m.id=i.meal_id
    WHERE i.is_scheduled=false
    ORDER BY i.id LIMIT 5001
  ), arrays AS MATERIALIZED (
    SELECT
      (SELECT count(*) FROM tracker_rows) AS trackers_n,
      (SELECT count(*) FROM checkin_rows) AS checkins_n,
      (SELECT count(*) FROM entry_rows) AS entries_n,
      (SELECT count(*) FROM meal_rows) AS meals_n,
      (SELECT count(*) FROM item_rows) AS items_n,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM tracker_rows t),'[]'::jsonb) AS trackers,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM checkin_rows t),'[]'::jsonb) AS checkins,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM entry_rows t),'[]'::jsonb) AS entries,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM meal_rows t),'[]'::jsonb) AS meals,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM item_rows t),'[]'::jsonb) AS items
  ), payloads AS MATERIALIZED (
    SELECT c.*,a.*,
      jsonb_build_object('ownerId',actor,'today',c.today,'timezone',c.timezone,
        'dateOfBirth',c.date_of_birth,'journeyStartDate',c.journey_start_date,
        'currentGoal',c.goal,'premium',c.premium,'settings',c.settings_record) AS context_payload,
      CASE WHEN c.premium AND c.enabled THEN jsonb_build_object(
        'timezone',c.timezone,'dateOfBirth',c.date_of_birth,'journeyStartDate',c.journey_start_date,
        'nutritionFieldsVersion','logged-macros-v1','nutritionEvidenceVersion','user-entered-v1','trackers',a.trackers,'trackerWeights',a.entries,'checkIns',a.checkins,'meals',a.meals,'items',a.items)
      END AS sources,
      CASE WHEN c.premium AND c.enabled THEN jsonb_build_object('trackers',a.trackers_n,
        'trackerWeights',a.entries_n,'checkIns',a.checkins_n,'meals',a.meals_n,'items',a.items_n)
      END AS counts
    FROM scoped c CROSS JOIN arrays a
  ), fingerprinted AS MATERIALIZED (
    SELECT p.*,encode(sha256(convert_to(p.context_payload::text,'UTF8')),'hex') AS context_fingerprint
    FROM payloads p
  )
  SELECT p.valid_zone,p.goal_count,p.trackers_n,p.checkins_n,p.entries_n,p.meals_n,p.items_n,
    jsonb_build_object('version','observed-snapshot-v1','ownerId',actor,'capturedAt',captured_at,
      'context',jsonb_build_object('ownerId',actor,'premium',p.premium,'enabled',p.enabled,
        'reviewDay',p.review_day,'today',p.today,'nextReviewDate',p.due,'reviewDue',false,
        'currentGoal',p.goal,'proposal',NULL,'profile',jsonb_build_object('journey_start_date',p.journey_start_date),
        'fingerprint',p.context_fingerprint,'safety',jsonb_build_object('enabled',false,'eligibility','unverified')) ||
        CASE WHEN p.premium
          THEN jsonb_build_object('accessValidUntil',p.access_info->'validUntil')
          ELSE '{}'::jsonb END,
      'sourceFingerprint',encode(sha256(convert_to(jsonb_build_object(
        'context',p.context_payload,'profileUpdatedAt',p.updated_at,'goalUpdatedAt',p.goal_updated_at,
        'sources',p.sources,'counts',p.counts)::text,'UTF8')),'hex'),
      'counts',p.counts,'sources',p.sources)
  INTO profile_ok,goal_count,tracker_count,checkin_count,entry_count,meal_count,item_count,result
  FROM fingerprinted p;

  IF NOT FOUND OR profile_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='profile_unavailable';
  END IF;
  IF goal_count>1 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='active_goal_conflict'; END IF;
  IF tracker_count>1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tracker_unavailable'; END IF;
  IF meal_count>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='meal_limit'; END IF;
  IF checkin_count>5000 OR entry_count>5000 OR item_count>5000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_limit';
  END IF;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION tdee_scheduler_private.read_observation(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION tdee_scheduler_private.read_context(p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE actor uuid:=p_owner; result jsonb; goals_n bigint; anchors_n bigint; receipts_n bigint;
BEGIN
 IF actor IS NULL THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 -- One SQL statement snapshot, including nested STABLE readers. No independent
 -- network/per-table read can supply a piece of this coherent envelope.
 WITH observation AS MATERIALIZED (
 SELECT tdee_scheduler_private.read_observation(actor) AS value
 ), readiness AS MATERIALIZED (
 SELECT tdee_scheduler_private.read_readiness(actor) AS value
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
 SELECT count(*) AS n FROM macrogoal_snapshot_review_private.receipts r CROSS JOIN anchors a
 WHERE r.owner_id=actor AND r.anchor_id::text=a.value->>'id' AND r.status='committed'
 ), receipt_rows AS MATERIALIZED (
 SELECT r.* FROM macrogoal_snapshot_review_private.receipts r CROSS JOIN anchors a
 WHERE r.owner_id=actor AND r.anchor_id::text=a.value->>'id' AND r.status='committed' ORDER BY r.created_at,r.request_id LIMIT 1001
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
END $function$;

REVOKE ALL ON FUNCTION tdee_scheduler_private.read_context(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.tdee_internal_context_v1(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $worker$
DECLARE worker_enabled constant boolean:=false;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 -- OFF before profile, entitlement, scheduler state or nutrition reads.
 IF NOT worker_enabled THEN RETURN jsonb_build_object('status','disabled','actionable',false); END IF;
 IF p_owner IS NULL OR NOT EXISTS(SELECT 1 FROM macrogoal_observed_private.settings WHERE user_id=p_owner AND enabled=true) THEN
  RETURN jsonb_build_object('status','not_enrolled','actionable',false); END IF;
 RETURN tdee_scheduler_private.read_context(p_owner);
END $worker$;
REVOKE ALL ON FUNCTION public.tdee_internal_context_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_context_v1(uuid) TO service_role;
ROLLBACK;

