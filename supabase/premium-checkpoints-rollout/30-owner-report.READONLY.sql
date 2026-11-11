-- SERVICE/ADMIN ONLY, READ ONLY, SOURCE CANDIDATE. No public RPC/view is created.
-- Replace ONLY these four NULLs with reviewed UTC timestamps before execution.
-- One statement = one database snapshot. Never prefilter provider data by client store/environment.
WITH params AS (
 SELECT NULL::timestamptz AS trusted_from, NULL::timestamptz AS capture_start,
        NULL::timestamptz AS window_start, NULL::timestamptz AS cutoff
), config AS (
 SELECT *,trusted_from IS NOT NULL AND capture_start IS NOT NULL AND window_start IS NOT NULL AND cutoff IS NOT NULL
  AND trusted_from<=capture_start AND capture_start<=window_start AND window_start<cutoff AS ready FROM params
), provider_input AS (
 SELECT r.created_at,coalesce(r.raw_event->'event',r.event_data->'event',r.raw_event,r.event_data) AS e
 FROM public.revenuecat_events r CROSS JOIN config p
 WHERE p.ready AND r.created_at>=p.trusted_from AND r.created_at<p.cutoff
), variants AS (
 SELECT created_at,e,e->>'id' AS vendor_id,e->>'app_user_id' AS raw_actor,e->>'product_id' AS product_id,
  e->>'transaction_id' AS transaction_id,e->>'store' AS store,e->>'environment' AS environment,e->>'type' AS kind,
  CASE WHEN nullif(e->>'store','') IS NOT NULL AND nullif(e->>'environment','') IS NOT NULL AND nullif(e->>'transaction_id','') IS NOT NULL
   THEN jsonb_build_array(e->>'store',e->>'environment',e->>'transaction_id') END AS transaction_key,
  jsonb_build_array(e->'app_user_id',e->'product_id',e->'transaction_id',e->'store',e->'environment',e->'purchased_at_ms',e->'price_in_purchased_currency',e->'currency',e->'type',e->'period_type') AS material,
  CASE WHEN jsonb_typeof(e->'purchased_at_ms')='number' AND e->>'purchased_at_ms' ~ '^[0-9]{1,14}$'
   THEN CASE WHEN (e->>'purchased_at_ms')::numeric BETWEEN 1 AND 32503680000000 THEN to_timestamp((e->>'purchased_at_ms')::double precision/1000) END END AS purchased_at,
  CASE WHEN jsonb_typeof(e->'event_timestamp_ms')='number' AND e->>'event_timestamp_ms' ~ '^[0-9]{1,14}$'
   THEN CASE WHEN (e->>'event_timestamp_ms')::numeric BETWEEN 1 AND 32503680000000 THEN to_timestamp((e->>'event_timestamp_ms')::double precision/1000) END END AS event_at,
  CASE WHEN jsonb_typeof(e->'price_in_purchased_currency')='number' AND e->>'price_in_purchased_currency' ~ '^[0-9]{1,12}(\.[0-9]{1,12})?$'
   THEN (e->>'price_in_purchased_currency')::numeric END AS actual_price
 FROM provider_input WHERE jsonb_typeof(e)='object' AND nullif(e->>'id','') IS NOT NULL
), vendor_conflicts AS (
 -- Inspect ALL trusted variants, including zero, trial and nonpurchase variants, before qualification.
 SELECT vendor_id FROM variants GROUP BY vendor_id
 HAVING count(DISTINCT jsonb_build_array(material,e->'event_timestamp_ms'))>1
), key_conflicts AS (
 SELECT transaction_key FROM variants WHERE transaction_key IS NOT NULL AND kind IN ('INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE')
 GROUP BY transaction_key HAVING count(DISTINCT material)>1
 UNION
 SELECT v.transaction_key FROM variants v JOIN vendor_conflicts c USING(vendor_id) WHERE v.transaction_key IS NOT NULL
), qualified AS (
 SELECT v.*,a.id AS verified_actor
 FROM variants v CROSS JOIN config p
 LEFT JOIN auth.users a ON lower(v.raw_actor)=a.id::text
 WHERE v.transaction_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM key_conflicts c WHERE c.transaction_key=v.transaction_key)
  AND v.kind IN ('INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE')
  AND v.store IN ('APP_STORE','PLAY_STORE') AND v.environment IN ('PRODUCTION','SANDBOX')
  AND nullif(v.product_id,'') IS NOT NULL AND v.e->>'currency' ~ '^[A-Z]{3}$'
  AND v.e->>'period_type' IS DISTINCT FROM 'TRIAL' AND v.actual_price>0
  AND v.purchased_at>=p.capture_start AND v.purchased_at<p.cutoff
  AND v.event_at>=p.capture_start AND v.event_at<p.cutoff
), facts AS (
 -- Material equality was already established; this only collapses identical deliveries/vendor IDs.
 SELECT DISTINCT ON(transaction_key) transaction_key,vendor_id,verified_actor,product_id,transaction_id,store,environment,purchased_at
 FROM qualified ORDER BY transaction_key,created_at,vendor_id
), checkpoints AS (
 SELECT c.*,
  CASE WHEN c.payload#>>'{flow,screen}' IN ('home','dashboard','check_ins','profile','unknown')
   THEN c.payload#>>'{flow,screen}' END AS screen,
  (NOT ((c.payload->'flow') ? 'screen') OR
   (jsonb_typeof(c.payload#>'{flow,screen}')='string' AND c.payload#>>'{flow,screen}' IN ('home','dashboard','check_ins','profile','unknown'))) AS screen_valid
 FROM macrogoal_checkpoints_private.checkpoint_events c CROSS JOIN config p
 WHERE p.ready AND c.received_at>=p.capture_start AND c.received_at<p.cutoff
), results AS (
 SELECT c.* FROM checkpoints c WHERE c.name='purchase_result'
 AND c.payload#>>'{detail,attribution}'='consistent'
 AND c.payload#>>'{detail,outcome}' IN ('sdk_returned_entitlement','sdk_returned_no_entitlement')
 AND jsonb_typeof(c.payload#>'{detail,correlation}')='object'
), result_facts AS (
 SELECT r.user_id,r.event_id,r.flow_id,r.source,r.attempt_id,r.received_at AS result_received,r.payload,r.screen,r.screen_valid,
  f.*,count(*) OVER(PARTITION BY r.user_id,r.event_id) AS matching_keys,
  EXISTS(SELECT 1 FROM variants q JOIN key_conflicts k USING(transaction_key)
   WHERE lower(q.raw_actor)=r.user_id::text AND q.product_id=r.payload#>>'{detail,correlation,productId}'
    AND q.transaction_id=r.payload#>>'{detail,correlation,transactionId}') AS quarantined_match
 FROM results r JOIN facts f ON f.verified_actor=r.user_id
  AND f.product_id=r.payload#>>'{detail,correlation,productId}' AND f.transaction_id=r.payload#>>'{detail,correlation,transactionId}'
), inspected AS (
 SELECT rf.*,at.attempt_count,at.attempt_received,
  (rf.payload#>>'{detail,correlation,store}' IS NULL OR rf.payload#>>'{detail,correlation,store}'=rf.store)
  AND (rf.payload#>>'{detail,correlation,environment}' IS NULL OR rf.payload#>>'{detail,correlation,environment}'=rf.environment)
  AND (at.attempt_count=0 OR (rf.screen_valid AND at.attempt_screen_valid
   AND (rf.screen IS NOT DISTINCT FROM at.attempt_screen))) AS dimensions_agree
 FROM result_facts rf CROSS JOIN LATERAL (
  SELECT count(*) AS attempt_count,min(c.received_at) AS attempt_received,
   min(c.screen) AS attempt_screen,bool_and(c.screen_valid) AS attempt_screen_valid FROM checkpoints c
  WHERE c.user_id=rf.user_id AND c.flow_id=rf.flow_id AND c.source=rf.source AND c.attempt_id=rf.attempt_id
   AND c.name='purchase_attempt' AND c.payload#>>'{detail,attribution}'='consistent'
   AND c.payload#>>'{detail,offer,productId}'=rf.product_id
 ) at
), qualifying_claims AS (
 SELECT * FROM inspected WHERE matching_keys=1 AND NOT quarantined_match AND dimensions_agree AND attempt_count=1
  AND attempt_received<=result_received AND purchased_at>=attempt_received-interval '2 minutes'
  AND purchased_at<=attempt_received+interval '30 minutes'
), ambiguous_sources AS (
 SELECT DISTINCT transaction_key FROM inspected
 WHERE matching_keys>1 OR quarantined_match OR NOT dimensions_agree OR attempt_count>1
), claims AS (
 SELECT transaction_key,count(DISTINCT jsonb_build_array(user_id,flow_id,attempt_id)) AS attempts,min(source) AS source,min(screen) AS screen,
  count(DISTINCT jsonb_build_array(screen)) AS screen_variants
 FROM qualifying_claims GROUP BY transaction_key
), classified AS (
 SELECT f.*,CASE WHEN a.transaction_key IS NOT NULL OR c.attempts>1 OR c.screen_variants>1 THEN 'ambiguous'
  WHEN c.attempts=1 THEN 'matched' ELSE 'unattributed' END AS attribution,
 CASE WHEN a.transaction_key IS NULL AND c.attempts=1 AND c.screen_variants=1 THEN c.source END AS matched_source,
 CASE WHEN a.transaction_key IS NULL AND c.attempts=1 AND c.screen_variants=1 THEN c.screen END AS matched_screen
 FROM facts f LEFT JOIN claims c USING(transaction_key) LEFT JOIN ambiguous_sources a USING(transaction_key)
), window_payments AS (
 SELECT f.* FROM classified f CROSS JOIN config p WHERE f.purchased_at>=p.window_start AND f.purchased_at<p.cutoff
), window_checkpoints AS (
 SELECT c.* FROM checkpoints c CROSS JOIN config p WHERE c.received_at>=p.window_start AND c.received_at<p.cutoff
), sources AS (
 SELECT source FROM window_checkpoints UNION SELECT matched_source FROM window_payments WHERE matched_source IS NOT NULL
), by_source AS (
 SELECT s.source,
 (SELECT count(DISTINCT c.user_id) FROM window_checkpoints c WHERE c.source=s.source) AS observed_users,
 (SELECT count(DISTINCT jsonb_build_array(c.user_id,c.flow_id)) FROM window_checkpoints c WHERE c.source=s.source AND c.name='inline_impression') AS inline_flows,
 (SELECT count(DISTINCT jsonb_build_array(c.user_id,c.flow_id)) FROM window_checkpoints c WHERE c.source=s.source AND c.name='entrypoint_clicked') AS entry_flows,
 (SELECT count(DISTINCT jsonb_build_array(c.user_id,c.flow_id)) FROM window_checkpoints c WHERE c.source=s.source AND c.name='offer_displayed') AS offer_flows,
 (SELECT count(DISTINCT jsonb_build_array(c.user_id,c.flow_id,c.attempt_id)) FROM window_checkpoints c WHERE c.source=s.source AND c.name='purchase_attempt') AS purchase_attempts,
 (SELECT count(DISTINCT jsonb_build_array(c.user_id,c.flow_id,c.attempt_id)) FROM window_checkpoints c WHERE c.source=s.source AND c.name='purchase_result' AND c.payload#>>'{detail,outcome}'='sdk_returned_entitlement') AS provisional_entitlement_results,
 (SELECT count(*) FROM window_payments f WHERE f.matched_source=s.source AND f.environment='PRODUCTION') AS matched_production_payments,
 (SELECT count(DISTINCT verified_actor) FROM window_payments f WHERE f.matched_source=s.source AND f.environment='PRODUCTION') AS matched_production_payers,
 (SELECT count(*) FROM window_payments f WHERE f.matched_source=s.source AND f.environment='SANDBOX') AS matched_sandbox_payments
 FROM sources s
), entry_screens AS (
 SELECT source,screen FROM window_checkpoints
 UNION SELECT matched_source,matched_screen FROM window_payments WHERE matched_source IS NOT NULL
), by_entry_screen AS (
 SELECT s.source,s.screen,
  CASE WHEN s.screen IS NULL THEN 'not_recorded' WHEN s.screen='unknown' THEN 'unknown' ELSE 'recorded' END AS screen_status,
  CASE WHEN s.source='floating_badge' THEN 'Go Premium' ELSE s.source END || ' / ' ||
   coalesce(s.screen,'screen_not_recorded') AS entry_label,
  (SELECT count(DISTINCT jsonb_build_array(c.user_id,c.flow_id)) FROM window_checkpoints c
   WHERE c.source=s.source AND c.screen IS NOT DISTINCT FROM s.screen AND c.name='entrypoint_clicked') AS entry_flows,
  (SELECT count(*) FROM window_payments f WHERE f.matched_source=s.source
   AND f.matched_screen IS NOT DISTINCT FROM s.screen AND f.environment='PRODUCTION') AS matched_production_payments,
  (SELECT count(*) FROM window_payments f WHERE f.matched_source=s.source
   AND f.matched_screen IS NOT DISTINCT FROM s.screen AND f.environment='SANDBOX') AS matched_sandbox_payments
 FROM entry_screens s
)
SELECT jsonb_build_object(
 'configured',p.ready,'capture_start',p.capture_start,'window_start',p.window_start,'cutoff_exclusive',p.cutoff,
 'by_source',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY source) FROM by_source s),'[]'::jsonb),
 'by_entry_screen',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY source,screen NULLS FIRST) FROM by_entry_screen s),'[]'::jsonb),
 'coverage',jsonb_build_object(
  'provider_rows_inspected',(SELECT count(*) FROM provider_input),
  'conflicting_vendor_ids',(SELECT count(*) FROM vendor_conflicts),
  'quarantined_transaction_keys',(SELECT count(*) FROM key_conflicts),
  'observed_production_payments',(SELECT count(*) FROM window_payments WHERE environment='PRODUCTION'),
  'observed_sandbox_payments',(SELECT count(*) FROM window_payments WHERE environment='SANDBOX'),
  'unattributed_production_payments',(SELECT count(*) FROM window_payments WHERE environment='PRODUCTION' AND attribution='unattributed'),
  'ambiguous_source_production_payments',(SELECT count(*) FROM window_payments WHERE environment='PRODUCTION' AND attribution='ambiguous'),
  'unmapped_production_payments',(SELECT count(*) FROM window_payments WHERE environment='PRODUCTION' AND verified_actor IS NULL),
  'auth_accounts_without_profile_now',(SELECT count(*) FROM auth.users a WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=a.id)),
  'rejected_checkpoint_events','unknown_not_persisted','mirror_completeness','unverified','first_paid_status','unknown'),
 'semantics','Observed provider purchases, not cash/MRR/new subscribers. Checkpoints use server receipt; payments use provider purchase time. Counts are not additive partitions. AutoStart may have no visible offer.'
) AS owner_report FROM config p;
