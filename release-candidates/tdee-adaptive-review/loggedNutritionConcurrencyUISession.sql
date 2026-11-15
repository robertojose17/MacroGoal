-- UI VARIANT PREPARED NOT RUN. Owner-only functional concurrency, NOT real JWT/auth E2E.
-- TWO independent connections, each receives test.fixture_manifest JSON and
-- test.fixture_request UUID from an approved setup. No DDL/GRANT here.
-- Manifest: {ownerId,itemId,mealId,revision,expected,requestIds:[uuidA,uuidB]}.
-- Requires separately authorized temporary committed fixture; see plan.
-- Only own synthetic fixture is held for 1s; app limits are unchanged.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='2s';
SET LOCAL transaction_timeout='3s';
DO $qa$
DECLARE m jsonb:=current_setting('test.fixture_manifest')::jsonb;
 rid uuid:=current_setting('test.fixture_request')::uuid;
 actor uuid:=(m->>'ownerId')::uuid; iid uuid:=(m->>'itemId')::uuid;
 mid uuid:=(m->>'mealId')::uuid; q jsonb; r jsonb;
 started timestamptz:=clock_timestamp(); before_call timestamptz; after_call timestamptz;
 finished timestamptz; outcome text; code text;
BEGIN
 IF current_user<>'postgres' OR actor IS NULL OR iid IS NULL OR mid IS NULL
 OR NOT (m->'requestIds' @> jsonb_build_array(rid::text))
 THEN RAISE EXCEPTION 'approved_fixture_required'; END IF;
 IF has_function_privilege('authenticated','public.tdee_register_logged_nutrition_evidence_v1(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'phase_a_surface_not_closed'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','is_anonymous',false)::text,true);
 -- Read-only precheck. The RPC itself, not this harness, must acquire locks.
 PERFORM 1 FROM public.meal_items i JOIN public.meals p ON p.id=i.meal_id
 WHERE i.id=iid AND i.meal_id=mid AND p.user_id=actor
  AND i.nutrition_revision=(m->>'revision')::uuid AND to_jsonb(i)=m->'itemSnapshot';
 IF NOT FOUND THEN RAISE EXCEPTION 'fixture_changed'; END IF;
 q:=jsonb_build_object('version','user-entered-v1','kind','register','requestId',rid,
 'itemId',iid,'revision',m->'revision','expectedEvidenceVersion',0,
 'expected',m->'expected','declaredFields',jsonb_build_array('calories'));
 BEGIN
  before_call:=clock_timestamp();
  r:=public.tdee_register_logged_nutrition_evidence_v1(q);
  after_call:=clock_timestamp();
  IF (r->>'evidenceVersion')::bigint<>1 OR r#>>'{receipt,requestId}' IS DISTINCT FROM rid::text
   OR r#>>'{evidence,status}' IS DISTINCT FROM 'active'
  THEN RAISE EXCEPTION 'unexpected_registration_result'; END IF;
  outcome:='registered';
 EXCEPTION WHEN SQLSTATE '40001' THEN
  IF SQLERRM<>'evidence_version_changed' THEN RAISE; END IF;
  after_call:=clock_timestamp();
  outcome:='cas_rejected'; code:=SQLSTATE;
 END;
 -- Winner retains locks acquired inside the real RPC until COMMIT.
 IF outcome='registered' THEN PERFORM pg_sleep(1.0); END IF;
 finished:=clock_timestamp();
 PERFORM set_config('test.fixture_result',jsonb_build_object('backendPid',pg_backend_pid(),
  'startedAt',started,'beforeCall',before_call,'afterCall',after_call,
  'afterHold',finished,'outcome',outcome,'sqlstate',code)::text,true);
END $qa$;
SELECT current_setting('test.fixture_result')::jsonb AS owner_only_result;
COMMIT;
-- SELECT output alone is not commit confirmation. Query receipts independently.
-- Timeout/error: stop, inspect committed state; never retry automatically.
