BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='5s';
-- SOURCE-ONLY explicit-owner background context; no auth.uid substitution or session impersonation.
-- Private helpers revoked from all app roles; fixed service wrapper remains immutable OFF.
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
  ), context_input AS MATERIALIZED (
    SELECT p.*,
      CASE WHEN p.valid_zone THEN (captured_at AT TIME ZONE p.timezone)::date END AS today,
      coalesce(s.enabled,false) AS enabled, coalesce(s.review_day,0) AS review_day,
      s.started_on, to_jsonb(s) AS settings_record,
      CASE WHEN coalesce((entitlement_cache_candidate.tester_access(actor)->>'managed')::boolean,false)
        THEN coalesce((entitlement_cache_candidate.tester_access(actor)->>'allowed')::boolean,false)
        ELSE EXISTS(SELECT 1 FROM public.subscriptions sub
        WHERE sub.user_id=actor::text AND sub.status IN ('active','trialing')
        AND sub.entitlement_ids && ARRAY['pro','Macrogoal Pro','macrogoal_pro','premium']::text[]
        AND (sub.expiration_at IS NULL OR sub.expiration_at>captured_at)) END AS premium
    FROM profile p LEFT JOIN macrogoal_observed_private.settings s ON s.user_id=actor
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
        'fingerprint',p.context_fingerprint,'safety',jsonb_build_object('enabled',false,'eligibility','unverified')),
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
-- Source-only inactive selector. No new credentials, impersonation, policy or review.
CREATE INDEX tdee_scheduler_enabled_owner_scan ON macrogoal_observed_private.settings(user_id) WHERE enabled=true;
CREATE INDEX tdee_scheduler_unresolved_owner_scan ON tdee_scheduler_private.ledger(owner_id) WHERE record->>'status' IS DISTINCT FROM 'completed' AND record->>'status' IS DISTINCT FROM 'retryable';
CREATE TABLE tdee_scheduler_private.selector_cursor (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 after_owner uuid,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
ALTER TABLE tdee_scheduler_private.selector_cursor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tdee_scheduler_private.selector_cursor FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO tdee_scheduler_private.selector_cursor(singleton) VALUES(true);

CREATE FUNCTION tdee_scheduler_private.current_selection(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $scope$
DECLARE u public.users; s macrogoal_observed_private.settings; e macrogoal_readiness_private.attestations;
 account record; g public.goals; n bigint; t date; pb text; jb text; rev text; at_time timestamptz:=statement_timestamp();
BEGIN
 IF p_owner IS NULL THEN RETURN NULL; END IF;
 -- Never fetch password/token/account-secret columns, even internally.
 SELECT deleted_at,banned_until,is_anonymous INTO account FROM auth.users WHERE id=p_owner;
 IF NOT FOUND OR account.deleted_at IS NOT NULL OR account.is_anonymous IS DISTINCT FROM false OR
  (account.banned_until IS NOT NULL AND account.banned_until>at_time) THEN RETURN NULL; END IF;
 SELECT * INTO s FROM macrogoal_observed_private.settings WHERE user_id=p_owner AND enabled=true;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO u FROM public.users WHERE id=p_owner;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=u.timezone) THEN RETURN NULL; END IF;
 t:=(at_time AT TIME ZONE u.timezone)::date;
 IF u.date_of_birth IS NULL OR NOT isfinite(u.date_of_birth) OR u.date_of_birth>(t-interval '19 years')::date OR u.date_of_birth<=(t-interval '101 years')::date OR u.date_of_birth<=date '1900-01-01' THEN RETURN NULL; END IF;
 jb:=encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'start',u.journey_start_date,'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex');
 pb:=encode(sha256(convert_to(jsonb_build_object('owner',p_owner,'dob',u.date_of_birth,'sex',u.sex,'journey',jb,'timezone',u.timezone)::text,'UTF8')),'hex');
 SELECT * INTO e FROM macrogoal_readiness_private.attestations WHERE owner_id=p_owner;
 IF NOT FOUND OR e.version IS DISTINCT FROM 'general-adult-v1' OR e.response IS DISTINCT FROM 'criteria_confirmed' OR
  e.profile_binding IS DISTINCT FROM pb OR e.journey_binding IS DISTINCT FROM jb OR
  e.accepted_at IS NULL OR e.expires_at IS NULL OR NOT isfinite(e.accepted_at) OR NOT isfinite(e.expires_at) OR
  e.accepted_at>at_time OR e.expires_at<=at_time THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM (SELECT id FROM public.goals WHERE user_id=p_owner AND is_active=true ORDER BY id LIMIT 2) q;
 IF n<>1 THEN RETURN NULL; END IF;
 SELECT * INTO g FROM public.goals WHERE user_id=p_owner AND is_active=true ORDER BY id LIMIT 1;
 -- Same source statement; digest excludes rolling meals, weights and capture time.
 -- Attestation identity included so replacing/reconfirming consent starts a new scope.
 rev:=encode(sha256(convert_to(jsonb_build_object('contract','internal-daily-selection-v1','owner',p_owner,
  'goal',to_jsonb(g),'profile',jsonb_build_object('updatedAt',u.updated_at,'dob',u.date_of_birth,'sex',u.sex,'timezone',u.timezone,'journey',jb),
  'settings',jsonb_build_object('enabled',s.enabled,'reviewDay',s.review_day,'startedOn',s.started_on,'updatedAt',s.updated_at),
  'consent',jsonb_build_object('version',e.version,'response',e.response,'profileBinding',pb,'journeyBinding',jb,'acceptedAt',e.accepted_at,'expiresAt',e.expires_at))::text,'UTF8')),'hex');
 RETURN jsonb_build_object('ownerId',p_owner,'contextRevision',rev,'timezone',u.timezone,'localDate',t,'enrolled',true,'accountActive',true);
END $scope$;
REVOKE ALL ON FUNCTION tdee_scheduler_private.current_selection(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.tdee_internal_current_selection_v1(p_owner uuid,p_context_revision text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $current$
DECLARE worker_enabled constant boolean:=false; selected jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 IF NOT worker_enabled THEN RETURN jsonb_build_object('status','disabled','actionable',false); END IF;
 IF p_owner IS NULL OR p_context_revision IS NULL OR p_context_revision!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 selected:=tdee_scheduler_private.current_selection(p_owner);
 IF selected IS NULL OR selected->>'contextRevision' IS DISTINCT FROM p_context_revision THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 RETURN jsonb_build_object('status','current','actionable',false,'capturedAt',floor(extract(epoch FROM statement_timestamp())*1000),'selection',selected-'timezone'-'localDate');
END $current$;
REVOKE ALL ON FUNCTION public.tdee_internal_current_selection_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_current_selection_v1(uuid,text) TO service_role;

CREATE FUNCTION public.tdee_internal_select_due_v1(p_limit integer,p_deadline_ms bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $select$
DECLARE worker_enabled constant boolean:=false; cursor_owner uuid; candidate record; selected jsonb; owners jsonb:='[]'::jsonb;
 scanned integer:=0; at_ms bigint; cursor_revision bigint; resume_owner uuid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='internal_service_required'; END IF;
 IF NOT worker_enabled THEN RETURN jsonb_build_object('status','disabled','actionable',false); END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>25 OR p_deadline_ms IS NULL OR p_deadline_ms<=at_ms OR p_deadline_ms>at_ms+5000 THEN
  RETURN jsonb_build_object('status','invalid_budget','actionable',false); END IF;
 -- Singleton serializes cursor only, no owner data lock or authority grant.
 SELECT after_owner,revision INTO cursor_owner,cursor_revision FROM tdee_scheduler_private.selector_cursor WHERE singleton=true FOR UPDATE NOWAIT;
 IF NOT FOUND OR cursor_revision>=9223372036854775806 THEN RETURN jsonb_build_object('status','unavailable','actionable',false); END IF;
 FOR candidate IN SELECT user_id FROM macrogoal_observed_private.settings
  WHERE enabled=true AND (cursor_owner IS NULL OR user_id>cursor_owner) ORDER BY user_id LIMIT 250
 LOOP
  EXIT WHEN floor(extract(epoch FROM clock_timestamp())*1000)>=p_deadline_ms;
  scanned:=scanned+1;cursor_owner:=candidate.user_id;
  selected:=tdee_scheduler_private.current_selection(candidate.user_id);
  IF selected IS NULL THEN CONTINUE; END IF;
  -- Unresolved claims across ANY scope require reconciliation; skip and advance,
  -- never let the first unresolved/completed owners starve those later in keyspace.
  IF EXISTS(SELECT 1 FROM tdee_scheduler_private.ledger l WHERE l.owner_id=candidate.user_id AND
    l.record->>'status' IS DISTINCT FROM 'completed' AND l.record->>'status' IS DISTINCT FROM 'retryable') THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM tdee_scheduler_private.ledger l WHERE l.owner_id=candidate.user_id AND
    l.context_revision=selected->>'contextRevision' AND
    ((l.record->>'claimedAt')::numeric>floor(extract(epoch FROM clock_timestamp())*1000) OR
     (l.record->>'finishedAt')::numeric>floor(extract(epoch FROM clock_timestamp())*1000) OR
     (l.record->>'status'='completed' AND l.record->>'localDate'>=selected->>'localDate'))) THEN CONTINUE; END IF;
  IF resume_owner IS NULL THEN resume_owner:=candidate.user_id; END IF;
  owners:=owners||jsonb_build_array(jsonb_build_object('ownerId',candidate.user_id,'contextRevision',selected->>'contextRevision'));
  EXIT WHEN jsonb_array_length(owners)>=p_limit;
 END LOOP;
 -- End-of-keyspace starts a fresh bounded scan on NEXT call; never unbounded wrap.
 IF scanned=0 AND floor(extract(epoch FROM clock_timestamp())*1000)<p_deadline_ms THEN cursor_owner:=NULL; END IF;
 -- Rotate past the FIRST returned owner, not the full batch: if a worker's
 -- deadline/provider failure stops at the first item, the same bad head cannot
 -- monopolize every subsequent batch after a keyspace wrap.
 UPDATE tdee_scheduler_private.selector_cursor SET after_owner=coalesce(resume_owner,cursor_owner),revision=revision+1 WHERE singleton=true;
 RETURN jsonb_build_object('status','selected','actionable',false,'capturedAt',floor(extract(epoch FROM clock_timestamp())*1000),'owners',owners,'scanned',scanned);
EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('status','busy','actionable',false);
END $select$;
REVOKE ALL ON FUNCTION public.tdee_internal_select_due_v1(integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_internal_select_due_v1(integer,bigint) TO service_role;
-- SOURCE ONLY / ROLLBACK ONLY. Existing tables, no new credentials/table grants.
create function public.tdee_scheduler_internal_v1(p_request jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,pg_temp set lock_timeout='500ms' as $fn$
declare release_enabled constant boolean:=false;
 owner uuid; scope text; zone text; op text; claim uuid; expected bigint; local_day text; daily_key text;
 at_ms bigint; r tdee_scheduler_private.ledger; receipt tdee_scheduler_private.receipt;
 selected jsonb; next_record jsonb; next_hold jsonb; next_revision bigint; diagnostic text; reason text;
begin
 -- Caller is verified DB service role, NOT a decoded client-supplied JWT claim.
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception using errcode='42501',message='internal_service_required'; end if;
 if not release_enabled then return jsonb_build_object('version','scheduler-rpc-v1','status','blocked','reason','safety_review_required'); end if;
 if jsonb_typeof(p_request) is distinct from 'object' then raise exception using errcode='22023',message='invalid_request'; end if;
 if octet_length(p_request::text)>2048 or exists(select 1 from jsonb_object_keys(p_request) k where k not in
 ('action','ownerId','contextRevision','timezone','expectedRevision','claimId','localDate','key','diagnostic','reason')) then
 raise exception using errcode='22023',message='invalid_request'; end if;
 owner:=(p_request->>'ownerId')::uuid; scope:=p_request->>'contextRevision'; zone:=p_request->>'timezone';op:=p_request->>'action';
 if owner is null or scope is null or scope !~ '^[a-f0-9]{64}$' or zone is null or length(zone)>100 or
 not exists(select 1 from pg_timezone_names where name=zone) or op is null or op not in ('load','claim','complete','uncertain','reconcile') then
 raise exception using errcode='22023',message='invalid_scope_or_action'; end if;
 -- Absent-row creation and any current/old-scope race serialize on same owner.
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 -- One fixed server timestamp after lock acquisition. No caller timestamp/TTL.
 at_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 local_day:=to_char(to_timestamp(at_ms::numeric/1000) at time zone zone,'YYYY-MM-DD');
 daily_key:='["daily-assessment-v1","'||owner::text||'","'||scope||'","'||local_day||'"]';
 select * into r from tdee_scheduler_private.ledger where owner_id=owner and context_revision=scope for update;
 if found and r.record->>'timezone' is distinct from zone then raise exception using errcode='22023',message='scope_changed'; end if;
 if op='load' then return jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',r.record,'hold',r.hold); end if;
 if jsonb_typeof(p_request->'expectedRevision') is distinct from 'number' or
 (p_request->>'expectedRevision')::numeric<>trunc((p_request->>'expectedRevision')::numeric) or
 (p_request->>'expectedRevision')::numeric not between 0 and 9007199254740988 then raise exception using errcode='22023',message='invalid_revision'; end if;
 expected:=(p_request->>'expectedRevision')::bigint;claim:=(p_request->>'claimId')::uuid;
 if claim is null or coalesce(r.revision,0)<>expected then raise exception using errcode='40001',message='claim_conflict'; end if;
 if r.record is not null and ((r.record->>'claimedAt')::bigint>at_ms or (r.record->>'finishedAt')::bigint>at_ms) then
 raise exception using errcode='22023',message='clock_moved_backwards'; end if;
 next_revision:=expected+1;next_hold:=r.hold;
 if op='claim' then
  -- Atomic admission against current protected scope, not only earlier HTTP selection.
  selected:=tdee_scheduler_private.current_selection(owner);
  if selected is null or selected->>'contextRevision' is distinct from scope or selected->>'timezone' is distinct from zone then
   raise exception using errcode='40001',message='current_selection_changed'; end if;
  if exists(select 1 from tdee_scheduler_private.ledger l where l.owner_id=owner and l.context_revision<>scope and
   l.record->>'status' is distinct from 'completed' and l.record->>'status' is distinct from 'retryable') then
   raise exception using errcode='40001',message='unfinished_owner_claim'; end if;
  -- Selector filtering is not atomic with claim: fence all old scopes here.
  if exists(select 1 from tdee_scheduler_private.ledger l where l.owner_id=owner and
   l.context_revision<>scope and l.record->>'status' in ('claimed','uncertain')) then
   raise exception using errcode='40001',message='unresolved_prior_scope'; end if;
  if p_request->>'localDate' is distinct from local_day or p_request->>'key' is distinct from daily_key then
   raise exception using errcode='22023',message='calendar_changed'; end if;
  if r.record is not null and (r.record->>'status' not in ('completed','retryable') or
   (r.record->>'status'='completed' and r.record->>'localDate'>=local_day) or
   r.record->>'localDate'>local_day or r.record->>'claimId'=claim::text) then
   raise exception using errcode='40001',message='unfinished_or_duplicate_claim'; end if;
  if exists(select 1 from tdee_scheduler_private.receipt where owner_id=owner and context_revision=scope and claim_id=claim) then
   raise exception using errcode='22023',message='claim_identity_reused'; end if;
  next_record:=jsonb_build_object('version','daily-assessment-ledger-v1','ownerId',owner,'contextRevision',scope,'timezone',zone,
   'localDate',local_day,'key',daily_key,'revision',next_revision,'status','claimed','claimId',claim,'claimedAt',at_ms,'finishedAt',null);
 else
  if r.record is null or r.record->>'claimId' is distinct from claim::text or p_request->>'key' is distinct from r.record->>'key' then
   raise exception using errcode='40001',message='claim_not_current'; end if;
  if op='reconcile' then
   select * into receipt from tdee_scheduler_private.receipt where owner_id=owner and context_revision=scope and claim_id=claim;
   if not found or receipt.daily_key is distinct from r.record->>'key' or receipt.observed_at>at_ms or
    receipt.observed_at<greatest((r.record->>'claimedAt')::bigint,coalesce((r.record->>'finishedAt')::bigint,0)) then raise exception using errcode='22023',message='authoritative_reconciliation_required'; end if;
   if r.record->>'status'='completed' and receipt.outcome='completed' then
    return jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',r.record,'hold',r.hold); end if;
   if r.record->>'status' not in ('claimed','uncertain') then raise exception using errcode='22023',message='invalid_reconciliation'; end if;
   next_record:=r.record||jsonb_build_object('status',case when receipt.outcome='completed' then 'completed' else 'retryable' end,'finishedAt',at_ms,'revision',next_revision);
  else
   if r.record->>'status' is distinct from 'claimed' then raise exception using errcode='40001',message='claim_not_current'; end if;
   if op='complete' then
    diagnostic:=p_request->>'diagnostic';reason:=p_request->>'reason';
    if diagnostic is null or diagnostic not in ('uncertain','resolved','preserve') or reason is null or length(reason)>128 then
     raise exception using errcode='22023',message='verified_diagnostic_required'; end if;
    if diagnostic='uncertain' then
     if reason not in ('coverage_insufficient','target_or_trend_unavailable','within_product_tolerance','rate_uncertainty_unverified','rate_difference_uncertain','complete_days_insufficient','weight_days_insufficient','weight_distribution_insufficient','complete_days_unverified','journey_start_unverified','initial_fourteen_days_not_elapsed','rate_sensitivity_uncertain') then
      raise exception using errcode='22023',message='unknown_hold_reason'; end if;
     if next_hold is null or (next_hold->>'reevaluateAt')::bigint<=at_ms then
      next_hold:=jsonb_build_object('assessedAt',at_ms,'reevaluateAt',at_ms+604800000); end if;
    elsif diagnostic='resolved' then
     if reason<>'same_rate_target' then raise exception using errcode='22023',message='unknown_resolution_reason'; end if;
     next_hold:=null;
    end if;
    insert into tdee_scheduler_private.receipt(owner_id,context_revision,claim_id,daily_key,outcome,observed_at)
    values(owner,scope,claim,r.record->>'key','completed',at_ms);
   end if;
   next_record:=r.record||jsonb_build_object('status',case when op='complete' then 'completed' else 'uncertain' end,'finishedAt',at_ms,'revision',next_revision);
  end if;
 end if;
 if r.record is null then
  insert into tdee_scheduler_private.ledger(owner_id,context_revision,revision,record,hold) values(owner,scope,next_revision,next_record,next_hold);
 else
  update tdee_scheduler_private.ledger set revision=next_revision,record=next_record,hold=next_hold
  where owner_id=owner and context_revision=scope and revision=expected;
  if not found then raise exception using errcode='40001',message='claim_conflict'; end if;
 end if;
 return jsonb_build_object('version','scheduler-rpc-v1','status','ok','record',next_record,'hold',next_hold);
end $fn$;
revoke all on function public.tdee_scheduler_internal_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.tdee_scheduler_internal_v1(jsonb) to service_role;
-- No table grants, no user role, no credentials, no cron, no release activation.
COMMIT;
