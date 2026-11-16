-- SOURCE ONLY / ROLLBACK ONLY. No goal/profile write, adoption or release activation.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='5s';
CREATE SCHEMA tdee_legacy_ack_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA tdee_legacy_ack_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE tdee_legacy_ack_private.receipts (
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
 binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
 source_captured_at timestamptz NOT NULL CHECK(isfinite(source_captured_at)),
 confirmed_at timestamptz NOT NULL CHECK(isfinite(confirmed_at)),
 PRIMARY KEY(owner_id,request_id),
 CHECK(confirmed_at>=source_captured_at),
 CHECK(confirmed_at-source_captured_at<=interval '30 seconds'),
 CHECK(request->'binding'=binding),
 CHECK((request->>'requestId')::uuid=request_id),
 CHECK(binding->>'ownerId'=owner_id::text)
);
ALTER TABLE tdee_legacy_ack_private.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tdee_legacy_ack_private.receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION tdee_legacy_ack_private.utc_stamp(t timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
 SELECT to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$f$;
CREATE FUNCTION tdee_legacy_ack_private.valid_stamp(s text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE t timestamptz;
BEGIN
 IF s IS NULL OR s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$' THEN RETURN false; END IF;
 t:=s::timestamptz;RETURN isfinite(t) AND left(s,10)=to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD');
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $f$;
CREATE FUNCTION tdee_legacy_ack_private.valid_targets(t jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE k text;n numeric;
BEGIN
 IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(t) key) IS DISTINCT FROM ARRAY['calories','carbsG','fatsG','proteinG']::text[] THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['calories','proteinG','carbsG','fatsG'] LOOP
  IF jsonb_typeof(t->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n:=(t->>k)::numeric;
  IF n::text IN ('NaN','Infinity','-Infinity') OR n<0 OR (k='calories' AND n=0) OR abs(n)>1.7976931348623157e308 THEN RETURN false; END IF;
 END LOOP;RETURN true;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RETURN false;
END $f$;
CREATE FUNCTION tdee_legacy_ack_private.parse_request(r jsonb,a uuid) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b jsonb;
BEGIN
 IF a IS NULL OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR octet_length(r::text)>4096 OR
 (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(r) key) IS DISTINCT FROM ARRAY['binding','decision','requestId','version']::text[] OR
 r->>'version' IS DISTINCT FROM 'legacy-goal-acknowledgment-v1' OR r->>'decision' IS DISTINCT FROM 'keep_current_targets' OR
 coalesce(r->>'requestId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN NULL; END IF;
 b:=r->'binding';
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR
 (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(b) key) IS DISTINCT FROM ARRAY['goalFingerprint','goalId','goalRevision','journeyBinding','ownerId','profileBinding','profileUpdatedAt','targets']::text[] OR
 b->>'ownerId' IS DISTINCT FROM a::text OR coalesce(b->>'goalId','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR
 NOT tdee_legacy_ack_private.valid_stamp(b->>'goalRevision') OR NOT tdee_legacy_ack_private.valid_stamp(b->>'profileUpdatedAt') OR
 coalesce(b->>'profileBinding','') !~ '^[a-f0-9]{64}$' OR coalesce(b->>'journeyBinding','') !~ '^[a-f0-9]{64}$' OR coalesce(b->>'goalFingerprint','') !~ '^[a-f0-9]{64}$' OR
 NOT tdee_legacy_ack_private.valid_targets(b->'targets') THEN RETURN NULL; END IF;
 RETURN r;
END $f$;
CREATE FUNCTION tdee_legacy_ack_private.validate_confirmation(r jsonb,c jsonb,a uuid,confirmed_at text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b jsonb;g jsonb;n timestamptz;captured timestamptz;
BEGIN
 IF NOT tdee_legacy_ack_private.valid_stamp(confirmed_at) THEN RETURN jsonb_build_object('kind','blocked','actionable',false,'reason','server_confirmation_time_required'); END IF;
 n:=confirmed_at::timestamptz;
 IF tdee_legacy_ack_private.parse_request(r,a) IS NULL OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR
 c->>'version' IS DISTINCT FROM 'legacy-goal-current-context-v1' OR c->>'ownerId' IS DISTINCT FROM a::text OR
 NOT tdee_legacy_ack_private.valid_stamp(c->>'capturedAt') THEN RETURN jsonb_build_object('kind','blocked','actionable',false,'reason','confirmation_context_unavailable'); END IF;
 captured:=(c->>'capturedAt')::timestamptz;g:=c->'currentGoal';
 IF captured>n OR n-captured>interval '30 seconds' OR jsonb_typeof(g) IS DISTINCT FROM 'object' OR
 g->>'ownerId' IS DISTINCT FROM a::text OR g->'isActive' IS DISTINCT FROM 'true'::jsonb OR
 NOT tdee_legacy_ack_private.valid_stamp(g->>'updatedAt') OR NOT tdee_legacy_ack_private.valid_stamp(c->>'profileUpdatedAt') OR
 (g->>'updatedAt')::timestamptz>captured OR (c->>'profileUpdatedAt')::timestamptz>captured THEN RETURN jsonb_build_object('kind','blocked','actionable',false,'reason','confirmation_context_unavailable'); END IF;
 b:=jsonb_build_object('ownerId',a,'goalId',g->'id','goalRevision',g->'updatedAt','profileUpdatedAt',c->'profileUpdatedAt',
 'profileBinding',c->'profileBinding','journeyBinding',c->'journeyBinding','goalFingerprint',c->'goalFingerprint','targets',g->'targets');
 IF tdee_legacy_ack_private.parse_request(jsonb_build_object('version','legacy-goal-acknowledgment-v1','requestId',r->'requestId','decision','keep_current_targets','binding',b),a) IS NULL THEN RETURN jsonb_build_object('kind','blocked','actionable',false,'reason','confirmation_context_unavailable'); END IF;
 IF r->'binding' IS DISTINCT FROM b THEN RETURN jsonb_build_object('kind','blocked','actionable',false,'reason','confirmation_context_changed'); END IF;
 RETURN jsonb_build_object('kind','prepared_acknowledgment','actionable',false,'requiresServerCommit',true,'requestId',r->'requestId','binding',b,
 'confirmedAt',confirmed_at,'observationPeriodStartsAt',confirmed_at,'goalsModified',false,'nutritionalApproval',false,'expenditureVerified',false,'macroAllocationConsent',false,'historicalBaselineAuthorized',false);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
 RETURN jsonb_build_object('kind','blocked','actionable',false,'reason','confirmation_context_unavailable');
END $f$;
CREATE FUNCTION tdee_legacy_ack_private.read_locked_context(a uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET extra_float_digits=3 AS $f$
DECLARE u public.users;g public.goals;jb text;pb text;captured timestamptz;
BEGIN
 IF a IS NULL OR auth.uid() IS DISTINCT FROM a THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 SELECT * INTO STRICT u FROM public.users WHERE id=a FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=a AND deleted_at IS NULL AND is_anonymous IS DISTINCT FROM true AND (banned_until IS NULL OR banned_until<=clock_timestamp())) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_unavailable'; END IF;
 SELECT * INTO STRICT g FROM public.goals WHERE user_id=a AND is_active=true FOR UPDATE;
 IF u.updated_at IS NULL OR g.updated_at IS NULL OR NOT isfinite(u.updated_at) OR NOT isfinite(g.updated_at) OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=u.timezone) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='confirmation_context_unavailable'; END IF;
 captured:=clock_timestamp();
 jb:=encode(sha256(convert_to(jsonb_build_object('owner',a,'start',u.journey_start_date,'restart',u.journey_restart_count,'timezone',u.timezone)::text,'UTF8')),'hex');
 pb:=encode(sha256(convert_to(jsonb_build_object('owner',a,'dob',u.date_of_birth,'sex',u.sex,'journey',jb,'timezone',u.timezone)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('version','legacy-goal-current-context-v1','ownerId',a,'capturedAt',tdee_legacy_ack_private.utc_stamp(captured),
 'currentGoal',jsonb_build_object('id',g.id,'ownerId',g.user_id,'isActive',g.is_active,'updatedAt',tdee_legacy_ack_private.utc_stamp(g.updated_at),
 'targets',jsonb_build_object('calories',g.daily_calories,'proteinG',g.protein_g,'carbsG',g.carbs_g,'fatsG',g.fats_g)),
 'profileUpdatedAt',tdee_legacy_ack_private.utc_stamp(u.updated_at),'profileBinding',pb,'journeyBinding',jb,
 -- Defined contract: whole stored goal row, canonical PostgreSQL JSONB text.
 -- JS treats this server-generated fingerprint as opaque, never recomputes it.
 'goalFingerprint',encode(sha256(convert_to(to_jsonb(g)::text,'UTF8')),'hex'));
END $f$;
CREATE FUNCTION tdee_legacy_ack_private.guard_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.owner_id) THEN RETURN OLD; END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='acknowledgment_receipt_immutable'; END IF;
 IF auth.uid() IS DISTINCT FROM NEW.owner_id OR tdee_legacy_ack_private.parse_request(NEW.request,NEW.owner_id) IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='invalid_acknowledgment'; END IF;
 PERFORM 1 FROM public.users WHERE id=NEW.owner_id FOR UPDATE;
 NEW.confirmed_at:=clock_timestamp();
 RETURN NEW;
END $f$;
CREATE TRIGGER legacy_ack_receipt_immutable BEFORE INSERT OR UPDATE OR DELETE ON tdee_legacy_ack_private.receipts FOR EACH ROW EXECUTE FUNCTION tdee_legacy_ack_private.guard_receipt();
CREATE FUNCTION tdee_legacy_ack_private.receipt_result(r tdee_legacy_ack_private.receipts) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $f$
 SELECT jsonb_build_object('version','legacy-goal-acknowledgment-receipt-v1','status','confirmed','actionable',false,
 'requestId',(r).request_id,'binding',(r).binding,'confirmedAt',tdee_legacy_ack_private.utc_stamp((r).confirmed_at),'observationPeriodStartsAt',tdee_legacy_ack_private.utc_stamp((r).confirmed_at),
 'goalsModified',false,'nutritionalApproval',false,'expenditureVerified',false,'macroAllocationConsent',false,'historicalBaselineAuthorized',false);
$f$;
CREATE FUNCTION public.tdee_legacy_goal_confirmation_v1(p_action text,p_request jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' AS $f$
DECLARE enabled constant boolean:=false;a uuid:=auth.uid();req jsonb;c jsonb;prepared jsonb;r tdee_legacy_ack_private.receipts;confirmed timestamptz;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 -- Immutable OFF before all user/profile/goal/receipt reads and before writes.
 IF NOT enabled THEN RETURN jsonb_build_object('status','disabled','actionable',false); END IF;
 IF p_action NOT IN ('context','confirm','receipt') OR p_action IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_action'; END IF;
 IF p_action='context' THEN
  IF p_request IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
  RETURN tdee_legacy_ack_private.read_locked_context(a);
 END IF;
 req:=tdee_legacy_ack_private.parse_request(p_request,a);
 IF req IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_request'; END IF;
 -- Established owner-first serialization; exact replay is historical, not a new adoption.
 PERFORM 1 FROM public.users WHERE id=a FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='profile_unavailable'; END IF;
 SELECT * INTO r FROM tdee_legacy_ack_private.receipts WHERE owner_id=a AND request_id=(req->>'requestId')::uuid;
 IF FOUND THEN
  IF r.request IS DISTINCT FROM req THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='request_mismatch'; END IF;
  RETURN tdee_legacy_ack_private.receipt_result(r);
 END IF;
 IF p_action='receipt' THEN RETURN jsonb_build_object('version','legacy-goal-acknowledgment-receipt-v1','status','not_found','actionable',false); END IF;
 c:=tdee_legacy_ack_private.read_locked_context(a);confirmed:=clock_timestamp();
 prepared:=tdee_legacy_ack_private.validate_confirmation(req,c,a,tdee_legacy_ack_private.utc_stamp(confirmed));
 IF prepared->>'kind' IS DISTINCT FROM 'prepared_acknowledgment' THEN RETURN jsonb_build_object('status','rejected','reason',prepared->>'reason','actionable',false); END IF;
 INSERT INTO tdee_legacy_ack_private.receipts(owner_id,request_id,request,binding,source_captured_at,confirmed_at)
 VALUES(a,(req->>'requestId')::uuid,req,req->'binding',(c->>'capturedAt')::timestamptz,confirmed) RETURNING * INTO r;
 -- Trigger-assigned server time is returned. No goal/profile write or baseline inference.
 RETURN tdee_legacy_ack_private.receipt_result(r);
END $f$;
REVOKE ALL ON FUNCTION tdee_legacy_ack_private.utc_stamp(timestamptz),tdee_legacy_ack_private.valid_stamp(text),tdee_legacy_ack_private.valid_targets(jsonb),tdee_legacy_ack_private.parse_request(jsonb,uuid),tdee_legacy_ack_private.validate_confirmation(jsonb,jsonb,uuid,text),tdee_legacy_ack_private.read_locked_context(uuid),tdee_legacy_ack_private.guard_receipt(),tdee_legacy_ack_private.receipt_result(tdee_legacy_ack_private.receipts) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tdee_legacy_goal_confirmation_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tdee_legacy_goal_confirmation_v1(text,jsonb) TO authenticated;
ROLLBACK;
