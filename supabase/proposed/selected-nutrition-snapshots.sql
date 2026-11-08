-- REVIEW ARTIFACT ONLY. Existing MacroGoal project; no live application performed.
-- A provider snapshot is evidence, never a write to food_items/nutrition_current.
BEGIN;
CREATE TABLE macrogoal_food_private.selected_nutrition_snapshots_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL CHECK (provider IN ('usda','openfoodfacts')),
 source_id text NOT NULL CHECK (source_id ~ '^[0-9]{1,20}$'),
 revision integer NOT NULL CHECK (revision > 0),
 capture_scope text NOT NULL CHECK (capture_scope IN ('search_response','detail_response')),
 content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=524288),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(provider,source_id,revision), UNIQUE(provider,source_id,content_hash)
);
CREATE TABLE macrogoal_food_private.selected_nutrition_receipts_v1 (
 request_id uuid PRIMARY KEY,
 snapshot_id uuid NOT NULL REFERENCES macrogoal_food_private.selected_nutrition_snapshots_v1(id),
 food_id uuid REFERENCES public.food_items(id),
 food_revision integer,
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX selected_nutrition_snapshots_time_v1 ON macrogoal_food_private.selected_nutrition_snapshots_v1(received_at);
CREATE INDEX selected_nutrition_receipts_time_v1 ON macrogoal_food_private.selected_nutrition_receipts_v1(received_at);
CREATE INDEX selected_nutrition_receipts_snapshot_time_v1 ON macrogoal_food_private.selected_nutrition_receipts_v1(snapshot_id,received_at);
ALTER TABLE macrogoal_food_private.selected_nutrition_snapshots_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.selected_nutrition_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.selected_nutrition_snapshots_v1, macrogoal_food_private.selected_nutrition_receipts_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON macrogoal_food_private.selected_nutrition_snapshots_v1, macrogoal_food_private.selected_nutrition_receipts_v1 TO service_role;

CREATE TABLE macrogoal_food_private.selected_nutrition_claims_v1 (
 request_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 provider text NOT NULL CHECK(provider IN ('usda','openfoodfacts')),
 source_id text NOT NULL CHECK(source_id ~ '^[0-9]{1,20}$'),
 food_id uuid REFERENCES public.food_items(id),
 food_revision integer,
 status text NOT NULL CHECK(status IN ('claimed','fresh','captured')),
 snapshot_id uuid REFERENCES macrogoal_food_private.selected_nutrition_snapshots_v1(id),
 lease_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX selected_nutrition_claims_source_lease_v1 ON macrogoal_food_private.selected_nutrition_claims_v1(provider,source_id,lease_until);
CREATE INDEX selected_nutrition_claims_user_time_v1 ON macrogoal_food_private.selected_nutrition_claims_v1(user_id,created_at);
ALTER TABLE macrogoal_food_private.selected_nutrition_claims_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.selected_nutrition_claims_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON macrogoal_food_private.selected_nutrition_claims_v1 TO service_role;
CREATE OR REPLACE FUNCTION public.claim_selected_nutrition_v1(p_user_id uuid,p_request_id uuid,p_food_id uuid,p_provider text,p_source_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' AS $fn$
DECLARE c macrogoal_food_private.selected_nutrition_claims_v1%ROWTYPE; s macrogoal_food_private.selected_nutrition_snapshots_v1%ROWTYPE;
 f public.food_items%ROWTYPE; rev integer; now_at timestamptz:=clock_timestamp();
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR p_request_id IS NULL OR NOT coalesce(p_provider IN ('usda','openfoodfacts') AND p_source_id ~ '^[0-9]{1,20}$',false) THEN RAISE EXCEPTION 'invalid_claim' USING ERRCODE='22023'; END IF;
 -- Endpoint must authenticate p_user_id via getUser; no owner comes from raw nutrients.
 IF NOT pg_try_advisory_xact_lock(731104829104::bigint) THEN RETURN jsonb_build_object('status','busy','persisted',false); END IF;
 SELECT * INTO c FROM macrogoal_food_private.selected_nutrition_claims_v1 WHERE request_id=p_request_id;
 IF FOUND THEN
  IF c.user_id IS DISTINCT FROM p_user_id OR c.food_id IS DISTINCT FROM p_food_id OR c.provider IS DISTINCT FROM p_provider OR c.source_id IS DISTINCT FROM p_source_id THEN RAISE EXCEPTION 'request_id_conflict' USING ERRCODE='40001'; END IF;
  IF c.snapshot_id IS NOT NULL THEN
   SELECT * INTO s FROM macrogoal_food_private.selected_nutrition_snapshots_v1 WHERE id=c.snapshot_id;
   RETURN jsonb_build_object('status','duplicate','snapshot_id',s.id,'version',s.revision,'evidence',s.payload,'persisted',true);
  END IF;
  -- An expired/uncertain request is NEVER dispatched again under the same UUID.
  RETURN jsonb_build_object('status','busy','persisted',false,'reason',CASE WHEN c.lease_until<now_at THEN 'request_expired' ELSE 'request_in_progress' END);
 END IF;
 IF p_food_id IS NOT NULL THEN
  SELECT * INTO f FROM public.food_items WHERE id=p_food_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE='22023'; END IF;
  IF p_provider='usda' THEN
   IF f.usda_fdc_id IS DISTINCT FROM p_source_id THEN RAISE EXCEPTION 'identity_conflict' USING ERRCODE='40001'; END IF;
  ELSE
   IF p_source_id !~ '^[0-9]{8,14}$' OR f.barcode IS NULL OR f.barcode !~ '^[0-9]{8,14}$' OR lpad(f.barcode,14,'0')<>lpad(p_source_id,14,'0') THEN RAISE EXCEPTION 'identity_conflict' USING ERRCODE='40001'; END IF;
  END IF;
  SELECT revision INTO rev FROM macrogoal_food_private.nutrition_current WHERE food_id=p_food_id;
  rev:=coalesce(rev,0);
 END IF;
 IF (SELECT count(*) FROM macrogoal_food_private.selected_nutrition_claims_v1 WHERE created_at>=now_at-interval '1 day')>=10000 THEN RETURN jsonb_build_object('status','rate_limited','persisted',false); END IF;
 IF (SELECT count(*) FROM macrogoal_food_private.selected_nutrition_claims_v1 WHERE user_id=p_user_id AND created_at>=now_at-interval '1 minute')>=6 OR (SELECT count(*) FROM macrogoal_food_private.selected_nutrition_claims_v1 WHERE user_id=p_user_id AND created_at>=now_at-interval '1 day')>=100 THEN RETURN jsonb_build_object('status','rate_limited','persisted',false); END IF;
 -- Source-wide lease prevents two users causing simultaneous paid detail fetches.
 IF EXISTS(SELECT 1 FROM macrogoal_food_private.selected_nutrition_claims_v1 WHERE provider=p_provider AND source_id=p_source_id AND status='claimed' AND lease_until>now_at) THEN RETURN jsonb_build_object('status','busy','persisted',false); END IF;
 -- Detail precedence: never let a recent search summary replace a complete detail.
 SELECT snap.* INTO s FROM macrogoal_food_private.selected_nutrition_snapshots_v1 snap JOIN LATERAL (SELECT max(r.received_at) last_fetched FROM macrogoal_food_private.selected_nutrition_receipts_v1 r WHERE r.snapshot_id=snap.id) seen ON true WHERE snap.provider=p_provider AND snap.source_id=p_source_id AND snap.capture_scope='detail_response' AND seen.last_fetched>=now_at-interval '24 hours' ORDER BY seen.last_fetched DESC,snap.revision DESC LIMIT 1;
 INSERT INTO macrogoal_food_private.selected_nutrition_claims_v1(request_id,user_id,provider,source_id,food_id,food_revision,status,snapshot_id,lease_until)
 VALUES(p_request_id,p_user_id,p_provider,p_source_id,p_food_id,rev,CASE WHEN s.id IS NULL THEN 'claimed' ELSE 'fresh' END,s.id,now_at+interval '2 minutes');
 IF s.id IS NOT NULL THEN RETURN jsonb_build_object('status','fresh','snapshot_id',s.id,'version',s.revision,'evidence',s.payload,'persisted',true); END IF;
 RETURN jsonb_build_object('status','claimed','persisted',false,'lease_until',now_at+interval '2 minutes');
END $fn$;
REVOKE ALL ON FUNCTION public.claim_selected_nutrition_v1(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_selected_nutrition_v1(uuid,uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_selected_nutrition_v1(p_food_id uuid,p_request_id uuid,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' AS $fn$
DECLARE
 v_provider text; v_source text; v_scope text; v_hash text; v_date timestamptz;
 v_raw jsonb; v_nutrients jsonb; v_row jsonb; v_id uuid; v_rev integer; v_food_rev integer;
 v_item public.food_items%ROWTYPE;
 v_prior macrogoal_food_private.selected_nutrition_receipts_v1%ROWTYPE;
 v_snap macrogoal_food_private.selected_nutrition_snapshots_v1%ROWTYPE;
 v_result jsonb;
 v_claim macrogoal_food_private.selected_nutrition_claims_v1%ROWTYPE;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_evidence' USING ERRCODE='22023'; END IF;
 IF octet_length(p_evidence::text)>524288 THEN RAISE EXCEPTION 'evidence_payload_too_large' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_evidence) k WHERE k NOT IN ('version','provider','source_id','capture_scope','captured_at','source_url','raw_payload','nutrition','complete')) THEN RAISE EXCEPTION 'unexpected_evidence_field' USING ERRCODE='22023'; END IF;
 v_provider:=p_evidence->>'provider'; v_source:=p_evidence->>'source_id'; v_scope:=p_evidence->>'capture_scope';
 IF NOT coalesce(p_evidence->>'version'='4' AND p_evidence->'complete'=to_jsonb(v_scope='detail_response')
   AND v_provider IN ('usda','openfoodfacts') AND v_source ~ '^[0-9]{1,20}$'
   AND v_scope IN ('search_response','detail_response'),false) THEN RAISE EXCEPTION 'invalid_evidence' USING ERRCODE='22023'; END IF;
 v_raw:=p_evidence->'raw_payload';
 IF jsonb_typeof(v_raw) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_raw_payload' USING ERRCODE='22023'; END IF;
 IF octet_length(v_raw::text)>262144 THEN RAISE EXCEPTION 'source_payload_too_large' USING ERRCODE='22023'; END IF;
 IF (CASE WHEN v_provider='usda' THEN v_raw->>'fdcId' ELSE coalesce(v_raw->>'code',v_raw->>'_id') END) IS DISTINCT FROM v_source THEN RAISE EXCEPTION 'source_identity_mismatch' USING ERRCODE='22023'; END IF;
 IF v_provider='openfoodfacts' AND v_raw ? 'code' AND v_raw ? '_id' AND v_raw->>'code' IS DISTINCT FROM v_raw->>'_id' THEN RAISE EXCEPTION 'source_identity_mismatch' USING ERRCODE='22023'; END IF;
 IF p_evidence->>'source_url' IS DISTINCT FROM (CASE WHEN v_provider='usda' THEN 'https://fdc.nal.usda.gov/food-details/' ELSE 'https://world.openfoodfacts.org/product/' END || v_source) THEN RAISE EXCEPTION 'invalid_source_url' USING ERRCODE='22023'; END IF;
 IF NOT coalesce(p_evidence->>'captured_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$',false) THEN RAISE EXCEPTION 'invalid_capture_date' USING ERRCODE='22023'; END IF;
 v_date:=(p_evidence->>'captured_at')::timestamptz;
 IF v_date>clock_timestamp()+interval '5 minutes' OR v_date<'2000-01-01'::timestamptz THEN RAISE EXCEPTION 'invalid_capture_date' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_evidence->'nutrition') IS DISTINCT FROM 'object' OR p_evidence#>>'{nutrition,basis}' IS DISTINCT FROM (CASE WHEN v_provider='usda' THEN 'per_100g' ELSE 'provider_declared' END) THEN RAISE EXCEPTION 'invalid_nutrition' USING ERRCODE='22023'; END IF;
 v_nutrients:=p_evidence#>'{nutrition,nutrients}';
 IF jsonb_typeof(v_nutrients) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_nutrients' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(v_nutrients)>512 THEN RAISE EXCEPTION 'too_many_nutrients' USING ERRCODE='22023'; END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(v_nutrients) LOOP
  IF NOT coalesce(jsonb_typeof(v_row)='object' AND jsonb_typeof(v_row->'provider_key')='string' AND length(v_row->>'provider_key') BETWEEN 0 AND 160
   AND v_row ?& ARRAY['name','amount','unit','status','basis']
   AND jsonb_typeof(v_row->'name') IN ('string','null') AND coalesce(length(v_row->>'name'),0)<=512
   AND jsonb_typeof(v_row->'unit') IN ('string','null') AND coalesce(length(v_row->>'unit'),0)<=64
   AND v_row->>'basis' IN ('per_100g','provider_100','serving','provider_declared')
   AND v_row->>'status' IN ('valid','missing','invalid'),false) THEN RAISE EXCEPTION 'invalid_nutrient' USING ERRCODE='22023'; END IF;
  IF v_row->>'status'='valid' THEN
   IF jsonb_typeof(v_row->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid_nutrient_amount' USING ERRCODE='22023'; END IF;
   IF (v_row->>'amount')::numeric<0 THEN RAISE EXCEPTION 'invalid_nutrient_amount' USING ERRCODE='22023'; END IF;
  ELSIF v_row->'amount' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'missing_is_not_zero' USING ERRCODE='22023';
  END IF;
 END LOOP;
 -- Serialize this short database-only append path. Contention returns busy, never
 -- blocks app requests indefinitely, and no external fetch occurs under the lock.
 IF NOT pg_try_advisory_xact_lock(731104829104::bigint) THEN RETURN jsonb_build_object('status','busy','persisted',false); END IF;
 v_hash:=encode(extensions.digest((p_evidence-'captured_at')::text,'sha256'),'hex');
 SELECT * INTO v_prior FROM macrogoal_food_private.selected_nutrition_receipts_v1 WHERE request_id=p_request_id;
 IF FOUND THEN
  SELECT * INTO v_snap FROM macrogoal_food_private.selected_nutrition_snapshots_v1 WHERE id=v_prior.snapshot_id;
  IF v_prior.food_id IS DISTINCT FROM p_food_id OR v_snap.provider IS DISTINCT FROM v_provider OR v_snap.source_id IS DISTINCT FROM v_source OR v_snap.content_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'request_id_conflict' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('status','duplicate','persisted',true,'replayed',true,'snapshot_id',v_snap.id,'version',v_snap.revision,'revision',v_snap.revision,'food_id',v_prior.food_id,'food_revision',v_prior.food_revision,'capture_scope',v_snap.capture_scope,'link_status',CASE WHEN v_prior.food_id IS NULL THEN 'unverified_candidate' ELSE 'identity_linked' END);
 END IF;
 IF v_scope='detail_response' THEN
  SELECT * INTO v_claim FROM macrogoal_food_private.selected_nutrition_claims_v1 WHERE request_id=p_request_id;
  IF NOT FOUND OR v_claim.status<>'claimed' OR v_claim.lease_until<clock_timestamp() OR v_claim.provider IS DISTINCT FROM v_provider OR v_claim.source_id IS DISTINCT FROM v_source OR v_claim.food_id IS DISTINCT FROM p_food_id THEN RAISE EXCEPTION 'claim_required' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_food_id IS NOT NULL THEN
  SELECT * INTO v_item FROM public.food_items WHERE id=p_food_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'food_unavailable' USING ERRCODE='22023'; END IF;
  IF v_provider='usda' THEN
   IF v_item.usda_fdc_id IS DISTINCT FROM v_source THEN RAISE EXCEPTION 'identity_conflict' USING ERRCODE='40001'; END IF;
  ELSE
   -- GTIN leading zero equivalence only; no fuzzy name or arbitrary cross-food link.
   IF v_source !~ '^[0-9]{8,14}$' OR v_item.barcode IS NULL OR v_item.barcode !~ '^[0-9]{8,14}$' OR lpad(v_item.barcode,14,'0')<>lpad(v_source,14,'0') THEN RAISE EXCEPTION 'identity_conflict' USING ERRCODE='40001'; END IF;
  END IF;
  SELECT revision INTO v_food_rev FROM macrogoal_food_private.nutrition_current WHERE food_id=p_food_id;
  v_food_rev:=coalesce(v_food_rev,0);
  IF v_scope='detail_response' AND v_food_rev IS DISTINCT FROM v_claim.food_revision THEN RAISE EXCEPTION 'food_revision_conflict' USING ERRCODE='40001'; END IF;
 END IF;
 SELECT * INTO v_snap FROM macrogoal_food_private.selected_nutrition_snapshots_v1 WHERE provider=v_provider AND source_id=v_source AND content_hash=v_hash;
 IF FOUND THEN v_id:=v_snap.id; v_rev:=v_snap.revision;
 ELSE
  -- Global anonymous-search storage budget; duplicate snapshots cost no new version.
  IF (SELECT count(*)>=1000 OR coalesce(sum(octet_length(payload::text)),0)+octet_length(p_evidence::text)>67108864 FROM macrogoal_food_private.selected_nutrition_snapshots_v1 WHERE received_at>=clock_timestamp()-interval '1 day') THEN RETURN jsonb_build_object('status','storage_quota','persisted',false); END IF;
  IF (SELECT count(*) FROM macrogoal_food_private.selected_nutrition_snapshots_v1 WHERE provider=v_provider AND source_id=v_source AND received_at>=clock_timestamp()-interval '1 day')>=100 THEN RETURN jsonb_build_object('status','rate_limited','persisted',false); END IF;
  SELECT coalesce(max(revision),0)+1 INTO v_rev FROM macrogoal_food_private.selected_nutrition_snapshots_v1 WHERE provider=v_provider AND source_id=v_source;
  INSERT INTO macrogoal_food_private.selected_nutrition_snapshots_v1(provider,source_id,revision,capture_scope,content_hash,payload) VALUES(v_provider,v_source,v_rev,v_scope,v_hash,p_evidence) RETURNING id INTO v_id;
 END IF;
 IF (SELECT count(*) FROM macrogoal_food_private.selected_nutrition_receipts_v1 WHERE received_at>=clock_timestamp()-interval '1 day')>=10000 THEN RAISE EXCEPTION 'receipt_global_quota' USING ERRCODE='54000'; END IF;
 IF (SELECT count(*) FROM macrogoal_food_private.selected_nutrition_receipts_v1 r JOIN macrogoal_food_private.selected_nutrition_snapshots_v1 s ON s.id=r.snapshot_id WHERE s.provider=v_provider AND s.source_id=v_source AND r.received_at>=clock_timestamp()-interval '1 day')>=1000 THEN RAISE EXCEPTION 'receipt_rate_limited' USING ERRCODE='54000'; END IF;
 INSERT INTO macrogoal_food_private.selected_nutrition_receipts_v1(request_id,snapshot_id,food_id,food_revision,captured_at) VALUES(p_request_id,v_id,p_food_id,v_food_rev,v_date);
 IF v_scope='detail_response' THEN UPDATE macrogoal_food_private.selected_nutrition_claims_v1 SET status='captured',snapshot_id=v_id WHERE request_id=p_request_id; END IF;
 RETURN jsonb_build_object('status',CASE WHEN v_snap.id IS NULL THEN 'captured' ELSE 'duplicate' END,'persisted',true,'replayed',false,'snapshot_id',v_id,'version',v_rev,'revision',v_rev,'food_id',p_food_id,'food_revision',v_food_rev,'capture_scope',v_scope,'link_status',CASE WHEN p_food_id IS NULL THEN 'unverified_candidate' ELSE 'identity_linked' END);
END $fn$;
REVOKE ALL ON FUNCTION public.record_selected_nutrition_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_selected_nutrition_v1(uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_selected_nutrition_batch_v1(p_request_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE x jsonb; results jsonb:='[]'::jsonb; r jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'invalid_request_id' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_batch' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_items)>100 OR octet_length(p_items::text)>8388608 THEN RAISE EXCEPTION 'batch_too_large' USING ERRCODE='22023'; END IF;
 IF NOT pg_try_advisory_xact_lock(731104829104::bigint) THEN RETURN jsonb_build_object('status','busy','persisted',false,'results','[]'::jsonb); END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF x#>>'{evidence,capture_scope}' IS DISTINCT FROM 'search_response' THEN RAISE EXCEPTION 'batch_search_only' USING ERRCODE='22023'; END IF;
  r:=public.record_selected_nutrition_v1((x->>'food_id')::uuid,md5(p_request_id::text||':'||(x#>>'{evidence,provider}')||':'||(x#>>'{evidence,source_id}')||':'||(x#>>'{evidence,capture_scope}'))::uuid,x->'evidence');
  IF r->>'status' NOT IN ('captured','duplicate') THEN RAISE EXCEPTION 'batch_capture_incomplete' USING ERRCODE='54000'; END IF;
  results:=results||jsonb_build_array(r);
 END LOOP;
 RETURN jsonb_build_object('status','recorded','persisted',true,'results',results);
EXCEPTION WHEN SQLSTATE '54000' THEN
 -- PL/pgSQL rolls back the whole batch subtransaction before this handler.
 RETURN jsonb_build_object('status','storage_quota','persisted',false,'results','[]'::jsonb,'reason',SQLERRM);
END $fn$;
REVOKE ALL ON FUNCTION public.record_selected_nutrition_batch_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_selected_nutrition_batch_v1(uuid,jsonb) TO service_role;
COMMIT;
