-- SOURCE ONLY. Integration consumers must use new semantics; not drop-in compatible.
CREATE OR REPLACE FUNCTION macrogoal_snapshot_review_private.inspect_observed_rate_coverage_v1(c jsonb, actor uuid, at_time timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET extra_float_digits TO '3'
AS $function$
DECLARE s jsonb;r jsonb;p jsonb;row jsonb;old jsonb;value jsonb;maps jsonb[]:=ARRAY['{}'::jsonb,'{}'::jsonb];units jsonb:='{}';merged jsonb;days jsonb:='{}';
 today date;start_date date;min_date date;journey date;earliest date;d date;i integer;at_n numeric;old_at numeric;kg double precision;unit text;key text;
 weights jsonb:='[]';missing jsonb:='[]';weight_count integer:=0;first_count integer:=0;confirmed integer:=0;unconfirmed integer:=0;unavailable integer:=0;
 ready boolean:=true;reason text;captured timestamptz;slopes double precision[];observed double precision;target double precision;target_status text;pair_count integer;
BEGIN
 IF actor IS NULL OR at_time IS NULL OR NOT isfinite(at_time) OR c->>'actor' IS DISTINCT FROM actor::text OR c->>'version' IS DISTINCT FROM 'snapshot-review-context-v1' OR
 c->'actionable' IS DISTINCT FROM 'false'::jsonb OR c->>'evidenceStatus' IS DISTINCT FROM 'unverified' THEN RETURN jsonb_build_object('status','blocked','reason','context_invalid','actionable',false); END IF;
 s:=c#>'{observation,sources}';r:=c->'readiness';p:=c->'profile';
 today:=macrogoal_snapshot_review_private.rate_date_v1(c#>>'{observation,context,today}');
 IF today IS NULL OR jsonb_typeof(s) IS DISTINCT FROM 'object' OR p->>'id' IS DISTINCT FROM actor::text OR
 c#>>'{observation,ownerId}' IS DISTINCT FROM actor::text OR p->>'timezone' IS DISTINCT FROM s->>'timezone' OR
 p->'journeyStartDate' IS DISTINCT FROM coalesce(s->'journeyStartDate','null'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_context'; END IF;
 IF macrogoal_snapshot_review_private.rate_instant_v1(c#>'{observation,capturedAt}') IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_capture'; END IF;
 captured:=(c#>>'{observation,capturedAt}')::timestamptz;
 IF captured IS NULL OR NOT isfinite(captured) OR captured>at_time OR at_time-captured>interval '30 seconds' OR c->>'capturedAt' IS DISTINCT FROM c#>>'{observation,capturedAt}' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='stale_context'; END IF;
 start_date:=today-14;journey:=macrogoal_snapshot_review_private.rate_date_v1(s->>'journeyStartDate');
 IF s->>'journeyStartDate' IS NOT NULL AND journey IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_journey'; END IF;
 min_date:=greatest(start_date,journey);
 IF jsonb_typeof(s->'checkIns') IS DISTINCT FROM 'array' OR jsonb_typeof(s->'trackerWeights') IS DISTINCT FROM 'array' OR jsonb_typeof(s->'trackers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_sources'; END IF;
 IF jsonb_array_length(s->'checkIns')>1000 OR jsonb_array_length(s->'trackerWeights')>1000 OR jsonb_array_length(s->'trackers')>100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source_bound_exceeded'; END IF;
 FOR row IN SELECT e FROM jsonb_array_elements(s->'trackers') e LOOP
  IF jsonb_typeof(row->'id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_tracker'; END IF;
  units:=jsonb_set(units,ARRAY[row->>'id'],coalesce(row->'unit','null'::jsonb),true);
 END LOOP;
 FOR i IN 1..2 LOOP
  FOR row IN SELECT e FROM jsonb_array_elements(CASE WHEN i=1 THEN s->'checkIns' ELSE s->'trackerWeights' END) e LOOP
   key:=row->>'date';IF key IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_date'; END IF;
   IF key<min_date::text OR key>=today::text THEN CONTINUE; END IF;
   d:=macrogoal_snapshot_review_private.rate_date_v1(key);IF d IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_date'; END IF;
   IF i=1 THEN
    at_n:=macrogoal_snapshot_review_private.rate_instant_v1(coalesce(nullif(row->'updated_at','null'::jsonb),nullif(row->'created_at','null'::jsonb),'""'::jsonb));
    kg:=macrogoal_snapshot_review_private.rate_number_v1(row->'weight');
   ELSE
    at_n:=macrogoal_snapshot_review_private.rate_instant_v1(row->'created_at');unit:=lower(units->> (row->>'tracker_id'));
    IF unit IS NULL OR unit NOT IN ('kg','lb','lbs') OR at_n=-1000000000000000000000000::numeric THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_tracker'; END IF;
    kg:=macrogoal_snapshot_review_private.rate_number_v1(row->'value')/CASE WHEN unit='kg' THEN 1::double precision ELSE 2.2046226218::double precision END;
   END IF;
   IF at_n IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_timestamp'; END IF;
   old:=maps[i]->key;old_at:=(old->>'at')::numeric;
   IF old IS NULL OR at_n>old_at THEN maps[i]:=jsonb_set(maps[i],ARRAY[key],jsonb_build_object('kg',kg,'at',at_n,'conflict',false),true);
   ELSIF at_n=old_at AND (kg IS NULL OR (old->>'kg') IS NULL OR kg<>(old->>'kg')::double precision) THEN maps[i]:=jsonb_set(maps[i],ARRAY[key,'conflict'],'true'::jsonb); END IF;
  END LOOP;
 END LOOP;
 FOR i IN 1..2 LOOP FOR value IN SELECT e.value FROM jsonb_each(maps[i]) e LOOP
  IF value->'conflict'='true'::jsonb OR value->>'kg' IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='weight_conflict'; END IF;
 END LOOP; END LOOP;
 merged:=maps[1];FOR key,value IN SELECT e.key,e.value FROM jsonb_each(maps[2]) e LOOP
  old:=maps[1]->key;
  IF old IS NOT NULL AND abs((old->>'kg')::double precision-(value->>'kg')::double precision)>0.5 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='weight_conflict'; END IF;
  merged:=jsonb_set(merged,ARRAY[key],CASE WHEN old IS NOT NULL AND (old->>'at')::numeric>(value->>'at')::numeric THEN old ELSE value END,true);
 END LOOP;
 FOR key,value IN SELECT e.key,e.value FROM jsonb_each(merged) e ORDER BY e.key LOOP
  IF (value->>'kg')::double precision<=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_weight'; END IF;
  weights:=weights||jsonb_build_array(jsonb_build_object('date',key,'weightKg',(value->>'kg')::double precision));weight_count:=weight_count+1;
  IF key<(start_date+7)::text THEN first_count:=first_count+1; END IF;
 END LOOP;
 FOR i IN 0..13 LOOP IF NOT merged ? (start_date+i)::text THEN missing:=missing||to_jsonb((start_date+i)::text); END IF; END LOOP;
 -- Descriptive median-of-pair slopes only. This does NOT establish an interval.
 SELECT array_agg(slope ORDER BY slope) INTO slopes FROM (
 SELECT ((b.value->>'weightKg')::double precision-(a.value->>'weightKg')::double precision)/((b.value->>'date')::date-(a.value->>'date')::date) AS slope
 FROM jsonb_array_elements(weights) a CROSS JOIN jsonb_array_elements(weights) b
 WHERE (b.value->>'date')::date-(a.value->>'date')::date>=7) q;
 pair_count:=coalesce(array_length(slopes,1),0);
 IF pair_count>0 THEN observed:=CASE WHEN pair_count%2=1 THEN slopes[pair_count/2+1] ELSE slopes[pair_count/2]/2+slopes[pair_count/2+1]/2 END*7; END IF;
 target_status:=CASE c#>>'{currentGoal,goal_type}' WHEN 'maintain' THEN 'available' WHEN 'gain' THEN 'target_gain_rate_unavailable' WHEN 'lose' THEN 'target_loss_rate_unavailable' ELSE 'target_goal_invalid' END;
 IF c#>>'{currentGoal,goal_type}'='maintain' THEN target:=0;
 ELSIF c#>>'{currentGoal,goal_type}'='lose' AND jsonb_typeof(c#>'{currentGoal,loss_rate_lbs_per_week}')='number' THEN
  kg:=macrogoal_snapshot_review_private.rate_number_v1(c#>'{currentGoal,loss_rate_lbs_per_week}');
  IF kg>0 THEN target:=-kg*0.45359237;IF target<>0 THEN target_status:='available';ELSE target:=NULL;END IF;END IF;
 END IF;
 IF observed IN ('Infinity'::double precision,'-Infinity'::double precision,'NaN'::double precision) OR target IN ('Infinity'::double precision,'-Infinity'::double precision,'NaN'::double precision) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='numeric_range'; END IF;
 -- Observed intake presence is NOT complete intake, clinical eligibility or confidence.
 IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR r->>'version' IS DISTINCT FROM 'observed-log-coverage-v1' OR r->>'ownerId' IS DISTINCT FROM actor::text OR r->>'dataBasis' IS DISTINCT FROM 'observed-logs-v1' OR r->>'coverageBasis' IS DISTINCT FROM 'observed_logs_not_confirmed_complete' OR r->'completenessEstablished' IS DISTINCT FROM 'false'::jsonb OR r->'clinicalEligibilityEstablished' IS DISTINCT FROM 'false'::jsonb OR r->>'today' IS DISTINCT FROM today::text OR r->>'timezone' IS DISTINCT FROM p->>'timezone' OR
 coalesce(r->>'profileBinding','') !~ '^[a-f0-9]{64}$' OR coalesce(r->>'journeyBinding','') !~ '^[a-f0-9]{64}$' OR coalesce(c->>'readinessFingerprint','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(r->'days') IS DISTINCT FROM 'array' THEN ready:=false;
 ELSE
  captured:=(r->>'capturedAt')::timestamptz;
  IF macrogoal_snapshot_review_private.rate_instant_v1(r->'capturedAt') IS NULL OR captured IS NULL OR NOT isfinite(captured) OR captured>at_time OR at_time-captured>interval '30 seconds' OR jsonb_array_length(r->'days')>29 THEN ready:=false; END IF;
 END IF;
 earliest:=greatest(today-29,journey);
 IF ready THEN FOR row IN SELECT e FROM jsonb_array_elements(r->'days') e LOOP
  key:=row->>'date';d:=macrogoal_snapshot_review_private.rate_date_v1(key);
  IF d IS NULL OR d<earliest OR d>=today OR days ? key OR coalesce(row->>'contentHash','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(row->'hasValidLoggedIntake') IS DISTINCT FROM 'boolean' THEN ready:=false;EXIT; END IF;
  days:=jsonb_set(days,ARRAY[key],row,true);
 END LOOP; END IF;
 IF ready THEN FOR i IN 0..13 LOOP
  row:=days->((start_date+i)::text);
  IF row IS NULL OR row->'hasValidLoggedIntake' IS DISTINCT FROM 'true'::jsonb THEN unavailable:=unavailable+1;
  ELSE confirmed:=confirmed+1; END IF;
 END LOOP; END IF;
 reason:=CASE WHEN NOT ready THEN 'observed_logs_unverified' WHEN confirmed<10 THEN 'observed_log_days_insufficient' WHEN weight_count<8 THEN 'weight_days_insufficient' WHEN first_count<1 OR weight_count-first_count<1 THEN 'weight_distribution_insufficient' ELSE 'coverage_met_uncertainty_requires_evaluation' END;
 IF journey IS NULL THEN reason:='journey_start_unverified';ELSIF journey>start_date THEN reason:='initial_fourteen_days_not_elapsed'; END IF;
 RETURN jsonb_build_object('status','coverage_checked','actionable',false,'acceptanceAuthorized',false,'statisticalConfidenceEstablished',false,'startDate',start_date,'endDateExclusive',today,'weights',weights,'missingWeightDates',missing,'weightDays',weight_count,'firstHalfWeightDays',first_count,'secondHalfWeightDays',weight_count-first_count,
 'observedRateKgPerWeek',observed,'targetRateKgPerWeek',target,'targetRateStatus',target_status,'eligiblePairCount',pair_count,'readinessStatus',CASE WHEN ready THEN 'observed_logged_days' ELSE 'unverified' END,'observedIntakeDays',CASE WHEN ready THEN confirmed ELSE NULL END,'dataBasis','observed-logs-v1','completenessEstablished',false,'clinicalEligibilityEstablished',false,'unavailableDays',CASE WHEN ready THEN unavailable ELSE NULL END,'coverageSufficient',reason='coverage_met_uncertainty_requires_evaluation','reason',reason);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR invalid_parameter_value OR numeric_value_out_of_range OR null_value_not_allowed THEN RETURN jsonb_build_object('status','blocked','reason','coverage_input_invalid','actionable',false,'acceptanceAuthorized',false);
END $function$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.inspect_observed_rate_coverage_v1(jsonb,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

