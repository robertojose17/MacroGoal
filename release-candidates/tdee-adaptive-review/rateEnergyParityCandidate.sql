-- PURE SOURCE-ONLY LAYER: no issuance, goal write, acceptance or authority grant.
-- Input is the already-authoritatively-bound SnapshotAdjustmentInput shape.
-- No normalization, coverage computation, receipt-chain or macro allocation proof.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='3s';
CREATE FUNCTION macrogoal_snapshot_review_private.validate_rate_energy_candidate_v1(i jsonb, proposal jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp SET extra_float_digits=3 AS $fn$
DECLARE g jsonb; a jsonb; p jsonb; e jsonb; r jsonb; k text; group_value jsonb;
 is_rate_anchor boolean:=false; original_anchor jsonb; verified_chain jsonb; chain_goal jsonb;
 state text:='blocked'; reason text:='invalid_input'; now_ms double precision; captured double precision;
 current_kcal double precision; accepted double precision; observed double precision; target double precision;
 lo double precision; hi double precision; nearest double precision; difference double precision;
 abs_tolerance double precision; relative_tolerance double precision; magnitude double precision;
 increment_kcal double precision; next_kcal double precision; net_delta double precision; due double precision;
BEGIN
 <<validation>>
 BEGIN
  IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR jsonb_typeof(proposal) IS DISTINCT FROM 'object' THEN EXIT validation; END IF;
  g:=i->'current';a:=i->'anchor';p:=i->'policy';e:=i->'evidence';r:=i->'rateReview';
  IF jsonb_typeof(g) IS DISTINCT FROM 'object' OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR
   jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(e) IS DISTINCT FROM 'object' OR jsonb_typeof(r) IS DISTINCT FROM 'object' THEN EXIT validation; END IF;
  -- Tagged initial intake anchor is already verified by the trusted receipt loader.
  -- This pure function does not authenticate or grant authority to a JSON tag.
  is_rate_anchor:=a->>'contract'='accepted-intake-rate-anchor-v1';
  IF is_rate_anchor AND i ? 'chainSource' THEN
   IF jsonb_typeof(i->'now') IS DISTINCT FROM 'number' OR (i->>'now')::numeric<>trunc((i->>'now')::numeric) THEN reason:='invalid_time';EXIT validation;END IF;
   verified_chain:=tdee_rate_record_private.verify_chain(i->'chainSource',(i->>'now')::bigint);
   chain_goal:=verified_chain->'currentGoal';
   IF verified_chain->>'kind' IS DISTINCT FROM 'rate_chain_verified' OR verified_chain->'receiptsVerified' IS DISTINCT FROM 'true'::jsonb OR
    i#>'{chainSource,anchorHead,anchor}' IS DISTINCT FROM a OR verified_chain#>>'{anchorReference,ownerId}' IS DISTINCT FROM a->>'ownerId' OR
    chain_goal->>'user_id' IS DISTINCT FROM a->>'ownerId' OR chain_goal->>'id' IS DISTINCT FROM i#>>'{macroBinding,goalId}' OR
    chain_goal->>'updated_at' IS DISTINCT FROM i#>>'{macroBinding,goalRevision}' OR
    chain_goal->'daily_calories' IS DISTINCT FROM g->'calories' OR chain_goal->'protein_g' IS DISTINCT FROM g->'proteinG' OR
    chain_goal->'carbs_g' IS DISTINCT FROM g->'carbsG' OR chain_goal->'fats_g' IS DISTINCT FROM g->'fatsG' OR chain_goal->'fiber_g' IS DISTINCT FROM g->'fiberG' OR
    i ? 'observedExpenditure' OR a ? 'expenditure' THEN reason:='rate_chain_unverified';EXIT validation;END IF;
   a:=jsonb_build_object('baselineCapturedAt',a->'acceptedAt','intake',a->'baselineIntakeKcal','acceptedDelta',verified_chain->'acceptedDeltaKcal',
    'acceptedCount',verified_chain->'acceptedCount','receiptsVerified',true,'lastAcceptedAt',verified_chain->'lastAcceptedAt');
  ELSIF is_rate_anchor THEN
   original_anchor:=a;
   IF i ? 'observedExpenditure' OR a ? 'expenditure' OR a->'acceptedDeltaKcal' IS DISTINCT FROM '0'::jsonb OR
    a->'acceptedCount' IS DISTINCT FROM '0'::jsonb OR a->'lastAcceptedAt' IS DISTINCT FROM 'null'::jsonb OR
    jsonb_typeof(a->'acceptedAt') IS DISTINCT FROM 'number' OR jsonb_typeof(a->'baselineIntakeKcal') IS DISTINCT FROM 'number' OR
    jsonb_typeof(a->'sourceReceipt') IS DISTINCT FROM 'object' OR jsonb_typeof(a->'baselineGoalSnapshot') IS DISTINCT FROM 'object' OR
    a->>'ownerId' IS DISTINCT FROM i#>>'{macroBinding,ownerId}' OR
    a->>'initialGoalId' IS DISTINCT FROM i#>>'{macroBinding,goalId}' OR
    a->>'initialGoalRevision' IS DISTINCT FROM i#>>'{macroBinding,goalRevision}' OR
    a#>'{baselineGoalSnapshot,daily_calories}' IS DISTINCT FROM g->'calories' OR
    a#>'{baselineGoalSnapshot,protein_g}' IS DISTINCT FROM g->'proteinG' OR
    a#>'{baselineGoalSnapshot,carbs_g}' IS DISTINCT FROM g->'carbsG' OR
    a#>'{baselineGoalSnapshot,fats_g}' IS DISTINCT FROM g->'fatsG' OR
    a#>'{baselineGoalSnapshot,fiber_g}' IS DISTINCT FROM g->'fiberG' THEN reason:='rate_anchor_unverified';EXIT validation; END IF;
   a:=jsonb_build_object('baselineCapturedAt',a->'acceptedAt','intake',a->'baselineIntakeKcal',
    'acceptedDelta',a->'acceptedDeltaKcal','acceptedCount',a->'acceptedCount','receiptsVerified',true,'lastAcceptedAt',a->'lastAcceptedAt');
  END IF;
  IF jsonb_typeof(i->'now') IS DISTINCT FROM 'number' THEN EXIT validation; END IF;
  now_ms:=(i->>'now')::double precision;
  IF p->'reviewed' IS DISTINCT FROM 'true'::jsonb OR e->'eligible' IS DISTINCT FROM 'true'::jsonb OR e->'modelReviewed' IS DISTINCT FROM 'true'::jsonb THEN reason:='review_required';EXIT validation; END IF;
  IF e->>'logging' IS DISTINCT FROM 'confirmed' THEN reason:='logging_confirmation_required';EXIT validation; END IF;
  IF e->>'stability' IS DISTINCT FROM 'stable' OR e->'goalDirectionValid' IS DISTINCT FROM 'true'::jsonb THEN reason:='evidence_uncertain';EXIT validation; END IF;
  IF jsonb_typeof(e->'capturedAt') IS DISTINCT FROM 'number' OR e->>'fingerprint' IS NULL OR e->>'fingerprint' !~ '^[a-f0-9]{64}$' THEN reason:='source_expired_or_invalid';EXIT validation; END IF;
  captured:=(e->>'capturedAt')::double precision;
  IF captured>now_ms OR now_ms-captured>30000 THEN reason:='source_expired_or_invalid';EXIT validation; END IF;
  FOREACH k IN ARRAY ARRAY['maxStepKcal','maxStepFraction','reviewIntervalDays','incrementKcal','minIntakeKcal','maxNetDeltaKcal','maxIntakeKcal'] LOOP
   IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' OR (p->>k)::double precision<=0 THEN reason:='policy_invalid';EXIT validation; END IF;
  END LOOP;
  increment_kcal:=(p->>'incrementKcal')::double precision;
  IF (p->>'maxStepKcal')::double precision>200 OR (p->>'maxStepFraction')::double precision>1 OR
   (p->>'reviewIntervalDays')::numeric<>trunc((p->>'reviewIntervalDays')::numeric) OR (p->>'reviewIntervalDays')::double precision<14 OR
   increment_kcal<>trunc(increment_kcal) OR (p->>'maxIntakeKcal')::double precision<(p->>'minIntakeKcal')::double precision THEN reason:='policy_invalid';EXIT validation; END IF;
  FOREACH k IN ARRAY ARRAY['calories','proteinG','carbsG','fatsG','fiberG'] LOOP
   IF jsonb_typeof(g->k) IS DISTINCT FROM 'number' OR (g->>k)::double precision<0 THEN reason:='current_target_invalid';EXIT validation; END IF;
  END LOOP;
  current_kcal:=(g->>'calories')::double precision;
  IF current_kcal<=0 OR abs(current_kcal-4*(g->>'proteinG')::double precision-4*(g->>'carbsG')::double precision-9*(g->>'fatsG')::double precision)>10 THEN reason:='current_target_invalid';EXIT validation; END IF;
  IF current_kcal<(p->>'minIntakeKcal')::double precision OR current_kcal>(p->>'maxIntakeKcal')::double precision THEN reason:='current_target_outside_policy';EXIT validation; END IF;
  FOREACH k IN ARRAY ARRAY['intake','acceptedDelta','acceptedCount','baselineCapturedAt'] LOOP
   IF jsonb_typeof(a->k) IS DISTINCT FROM 'number' THEN reason:='anchor_mismatch';EXIT validation; END IF;
  END LOOP;
  accepted:=(a->>'acceptedDelta')::double precision;
  IF (a->>'intake')::double precision<=0 OR
   (is_rate_anchor IS NOT TRUE AND (jsonb_typeof(a->'expenditure') IS DISTINCT FROM 'number' OR (a->>'expenditure')::double precision<=0 OR
    jsonb_typeof(i->'observedExpenditure') IS DISTINCT FROM 'number' OR (i->>'observedExpenditure')::double precision<=0)) OR
   a->'receiptsVerified' IS DISTINCT FROM 'true'::jsonb OR (a->>'acceptedCount')::numeric<>trunc((a->>'acceptedCount')::numeric) OR
   (a->>'acceptedCount')::numeric NOT BETWEEN 0 AND 9007199254740991 OR
   (a->>'intake')::double precision+accepted<>current_kcal OR abs(accepted)>(p->>'maxNetDeltaKcal')::double precision THEN reason:='anchor_mismatch';EXIT validation; END IF;
  IF NOT a ? 'lastAcceptedAt' OR (a->'lastAcceptedAt'<>'null'::jsonb AND (jsonb_typeof(a->'lastAcceptedAt') IS DISTINCT FROM 'number' OR (a->>'lastAcceptedAt')::double precision>now_ms)) OR
   ((a->>'acceptedCount')::double precision>0 AND a->'lastAcceptedAt'='null'::jsonb) OR
   ((a->>'acceptedCount')::double precision=0 AND (accepted<>0 OR a->'lastAcceptedAt'<>'null'::jsonb)) THEN reason:='acceptance_history_invalid';EXIT validation; END IF;
  IF (a->>'baselineCapturedAt')::double precision>now_ms THEN reason:='baseline_invalid';EXIT validation; END IF;
  IF now_ms-coalesce((a->>'lastAcceptedAt')::double precision,(a->>'baselineCapturedAt')::double precision)<(p->>'reviewIntervalDays')::double precision*86400000 THEN reason:='review_cooldown';EXIT validation; END IF;
  due:=now_ms+604800000;
  IF now_ms<>trunc(now_ms) OR abs(now_ms)>8640000000000000 OR abs(due)>8640000000000000 THEN reason:='invalid_time';EXIT validation; END IF;
  IF r->>'version' IS DISTINCT FROM 'rate-review-14d-v1' OR r->>'sourceFingerprint' IS DISTINCT FROM e->>'fingerprint' OR r->'capturedAt' IS DISTINCT FROM e->'capturedAt' THEN reason:='rate_review_binding_mismatch';EXIT validation; END IF;
  IF jsonb_typeof(r#>'{tolerance,absoluteLbPerWeek}') IS DISTINCT FROM 'number' OR jsonb_typeof(r#>'{tolerance,relativeFraction}') IS DISTINCT FROM 'number' THEN reason:='tolerance_invalid';EXIT validation; END IF;
  abs_tolerance:=(r#>>'{tolerance,absoluteLbPerWeek}')::double precision*0.45359237::double precision;
  relative_tolerance:=(r#>>'{tolerance,relativeFraction}')::double precision;
  IF abs_tolerance<=0 OR relative_tolerance<=0 OR relative_tolerance>1 THEN reason:='tolerance_invalid';EXIT validation; END IF;
  IF r->'coverageSufficient' IS DISTINCT FROM 'true'::jsonb THEN state:='no_change';reason:='coverage_insufficient';EXIT validation; END IF;
  IF jsonb_typeof(r->'observedKgPerWeek') IS DISTINCT FROM 'number' OR jsonb_typeof(r->'targetKgPerWeek') IS DISTINCT FROM 'number' THEN state:='no_change';reason:='target_or_trend_unavailable';EXIT validation; END IF;
  observed:=(r->>'observedKgPerWeek')::double precision;target:=(r->>'targetKgPerWeek')::double precision;
  relative_tolerance:=abs(target)*relative_tolerance;
  IF NOT (abs(target-observed)>abs_tolerance AND abs(target-observed)>relative_tolerance) THEN state:='no_change';reason:='within_product_tolerance';EXIT validation; END IF;
  IF r#>>'{uncertainty,status}' IS DISTINCT FROM 'reviewed' THEN state:='no_change';reason:='rate_uncertainty_unverified';EXIT validation; END IF;
  IF jsonb_typeof(r#>'{uncertainty,lowerKgPerWeek}') IS DISTINCT FROM 'number' OR jsonb_typeof(r#>'{uncertainty,upperKgPerWeek}') IS DISTINCT FROM 'number' THEN reason:='rate_interval_invalid';EXIT validation; END IF;
  lo:=(r#>>'{uncertainty,lowerKgPerWeek}')::double precision;hi:=(r#>>'{uncertainty,upperKgPerWeek}')::double precision;
  IF lo>hi OR observed<lo OR observed>hi THEN reason:='rate_interval_invalid';EXIT validation; END IF;
  nearest:=CASE WHEN target<lo THEN lo WHEN target>hi THEN hi ELSE target END;
  IF NOT (abs(target-nearest)>abs_tolerance AND abs(target-nearest)>relative_tolerance) THEN state:='no_change';reason:='rate_difference_uncertain';EXIT validation; END IF;
  IF r#>>'{conversion,model}' IS DISTINCT FROM 'approximate-energy-equivalent-v1' OR r#>'{conversion,kcalPerKg}' IS DISTINCT FROM '7700'::jsonb THEN reason:='rate_conversion_contract_invalid';EXIT validation; END IF;
  difference:=(target-nearest)*7700::double precision/7::double precision;
  IF difference=0 THEN state:='no_change';reason:='same_rate_target';due:=null;EXIT validation; END IF;
  IF difference<0 THEN reason:='individual_deficit_review_required';EXIT validation; END IF;
  magnitude:=floor(least(abs(difference),(p->>'maxStepKcal')::double precision,current_kcal*(p->>'maxStepFraction')::double precision,
   (p->>'maxNetDeltaKcal')::double precision-accepted,(p->>'maxIntakeKcal')::double precision-current_kcal)/increment_kcal)*increment_kcal;
  IF magnitude<increment_kcal THEN state:='no_change';reason:='policy_limit';due:=null;EXIT validation; END IF;
  next_kcal:=current_kcal+magnitude;net_delta:=accepted+magnitude;
  IF jsonb_typeof(proposal->'deltaKcal') IS DISTINCT FROM 'number' OR jsonb_typeof(proposal->'calories') IS DISTINCT FROM 'number' OR jsonb_typeof(proposal->'netDeltaKcal') IS DISTINCT FROM 'number' OR
   (proposal->>'deltaKcal')::double precision<>magnitude OR (proposal->>'calories')::double precision<>next_kcal OR (proposal->>'netDeltaKcal')::double precision<>net_delta THEN reason:='rate_energy_mismatch';EXIT validation; END IF;
  state:='energy_validated';reason:='rate_energy_matches';due:=null;
 END validation;
 RETURN jsonb_strip_nulls(jsonb_build_object('version','rate-energy-validation-v1','status',state,'reason',reason,'actionable',false,'acceptanceAuthorized',false,
  'reevaluateAt',CASE WHEN state='no_change' THEN due ELSE null END,'deltaKcal',CASE WHEN state='energy_validated' THEN magnitude ELSE null END,
  'calories',CASE WHEN state='energy_validated' THEN next_kcal ELSE null END,'netDeltaKcal',CASE WHEN state='energy_validated' THEN net_delta ELSE null END,
  'remainingGate','normalization_coverage_macro_and_acceptance_unverified'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR division_by_zero THEN
 RETURN jsonb_build_object('version','rate-energy-validation-v1','status','blocked','reason','invalid_numeric_input','actionable',false,'acceptanceAuthorized',false);
END $fn$;
REVOKE ALL ON FUNCTION macrogoal_snapshot_review_private.validate_rate_energy_candidate_v1(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ROLLBACK;
