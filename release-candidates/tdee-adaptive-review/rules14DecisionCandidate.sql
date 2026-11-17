-- PURE deterministic-rule parity. Does not authenticate source/history or authorize effects.
CREATE FUNCTION tdee_rules14_private.evaluate_rules(c jsonb,h jsonb,p jsonb,actor uuid,at_time timestamptz)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp SET extra_float_digits=3 AS $$
DECLARE cov jsonb;g jsonb:=c->'currentGoal';weights jsonb;slopes double precision[];lo double precision;hi double precision;
 logs jsonb;low_delta double precision;high_delta double precision;desired double precision;average_weight double precision;observed double precision;target double precision;edge double precision;raw_delta double precision;magnitude double precision;sgn integer;
 current_kcal double precision;net double precision;now_ms bigint;due double precision;k text;v double precision;
 reason text:='invalid_input';result jsonb;item jsonb;meal jsonb;day jsonb;days jsonb:='{}';meals jsonb:='{}';key text;
 total double precision:=0;average double precision;expenditure double precision;deficit double precision;maximum double precision;deficit_room double precision;
 confirmed integer:=0;valid integer:=0;deficit_evidence jsonb:='null';start_date date;end_date date;
BEGIN
 now_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 <<evaluation>> BEGIN
 IF actor IS NULL OR at_time IS NULL OR NOT isfinite(at_time) OR now_ms NOT BETWEEN 0 AND 253401609600000 THEN EXIT evaluation;END IF;
 IF c->>'actor' IS DISTINCT FROM actor::text OR c->>'version' IS DISTINCT FROM 'snapshot-review-context-v1' OR g->>'user_id' IS DISTINCT FROM actor::text THEN EXIT evaluation;END IF;
 IF c#>'{observation,context,premium}' IS DISTINCT FROM 'true'::jsonb OR c#>'{observation,context,enabled}' IS DISTINCT FROM 'true'::jsonb OR (c#>>'{observation,context,accessValidUntil}')::numeric<=now_ms THEN reason:='source_unavailable';EXIT evaluation;END IF;
 IF p->>'engine_version' IS DISTINCT FROM 'rules14-observed-v2' OR p->>'scope' IS DISTINCT FROM 'profile-adult-observed-v1' OR p->'enabled' IS DISTINCT FROM 'true'::jsonb OR
 jsonb_typeof(p->'revision') IS DISTINCT FROM 'number' OR (p->>'revision')::numeric<>trunc((p->>'revision')::numeric) OR (p->>'revision')::numeric<1 OR jsonb_typeof(p->'expires_at') IS DISTINCT FROM 'string' OR coalesce(p->>'digest','') !~ '^[a-f0-9]{64}$' OR coalesce(p->>'version','')='' OR (p->>'expires_at')::timestamptz<=at_time THEN reason:='energy_policy_required';EXIT evaluation;END IF;
 FOREACH k IN ARRAY ARRAY['max_step_kcal','max_cumulative_delta_kcal','increment_kcal','min_days_between_acceptances','min_intake_kcal','max_intake_kcal'] LOOP
 IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN reason:='policy_invalid';EXIT evaluation;END IF;
 v:=(p->>k)::double precision;IF v<>trunc(v) OR v<1 OR v>9007199254740991 THEN reason:='policy_invalid';EXIT evaluation;END IF;END LOOP;
 IF (p->>'max_step_kcal')::numeric>200 OR jsonb_typeof(p->'max_step_fraction') IS DISTINCT FROM 'number' OR (p->>'max_step_fraction')::numeric NOT BETWEEN 0.000000001 AND 1 OR
 (p->>'increment_kcal')::numeric>(p->>'max_step_kcal')::numeric OR (p->>'min_days_between_acceptances')::numeric NOT BETWEEN 14 AND 365 OR (p->>'max_intake_kcal')::numeric>10000 OR (p->>'min_intake_kcal')::numeric>(p->>'max_intake_kcal')::numeric THEN reason:='policy_invalid';EXIT evaluation;END IF;
 IF h->>'version' IS DISTINCT FROM 'rules14-history-v1' OR h->>'authority' IS DISTINCT FROM 'server-rules14-chain-v1' OR h->>'ownerId' IS DISTINCT FROM actor::text OR h->'currentGoal' IS DISTINCT FROM g OR
 h#>>'{anchorReference,ownerId}' IS DISTINCT FROM actor::text OR (h->>'capturedAt')::numeric>now_ms OR now_ms-(h->>'capturedAt')::numeric>30000 OR
 (h->>'baselineIntakeKcal')::numeric+(h->>'acceptedDeltaKcal')::numeric IS DISTINCT FROM (g->>'daily_calories')::numeric THEN reason:='accepted_history_required';EXIT evaluation;END IF;
 FOREACH k IN ARRAY ARRAY['capturedAt','baselineAcceptedAt','baselineIntakeKcal','acceptedCount','acceptedDeltaKcal'] LOOP
 IF jsonb_typeof(h->k) IS DISTINCT FROM 'number' OR (h->>k)::numeric<>trunc((h->>k)::numeric) OR abs((h->>k)::numeric)>9007199254740991 THEN reason:='accepted_history_required';EXIT evaluation;END IF;END LOOP;
 IF (h->>'acceptedCount')::numeric<0 OR (h->>'baselineAcceptedAt')::numeric NOT BETWEEN 0 AND now_ms OR
 ((h->>'acceptedCount')::numeric=0 AND (h->'lastAcceptedAt' IS DISTINCT FROM 'null'::jsonb OR h->'lastReceiptDigest' IS DISTINCT FROM 'null'::jsonb OR h->'acceptedDeltaKcal' IS DISTINCT FROM '0'::jsonb)) OR
 ((h->>'acceptedCount')::numeric>0 AND (jsonb_typeof(h->'lastAcceptedAt') IS DISTINCT FROM 'number' OR (h->>'lastAcceptedAt')::numeric NOT BETWEEN (h->>'baselineAcceptedAt')::numeric AND now_ms OR coalesce(h->>'lastReceiptDigest','') !~ '^[a-f0-9]{64}$')) THEN reason:='accepted_history_required';EXIT evaluation;END IF;
 due:=coalesce((h->>'lastAcceptedAt')::double precision,(h->>'baselineAcceptedAt')::double precision)+(p->>'min_days_between_acceptances')::double precision*86400000;
 IF now_ms<due THEN reason:='review_cooldown';EXIT evaluation;END IF;
 IF NOT tdee_rules14_private.profile_support_current(c,actor,at_time) THEN reason:='profile_support_required';EXIT evaluation;END IF;
 cov:=macrogoal_snapshot_review_private.inspect_observed_rate_coverage_v1(c,actor,at_time);
 IF cov->>'status' IS DISTINCT FROM 'coverage_checked' OR cov->'coverageSufficient' IS DISTINCT FROM 'true'::jsonb THEN reason:=coalesce(cov->>'reason','coverage_unavailable');EXIT evaluation;END IF;
 observed:=(cov->>'observedRateKgPerWeek')::double precision;target:=(cov->>'targetRateKgPerWeek')::double precision;
 IF observed IS NULL OR target IS NULL THEN reason:='target_or_trend_unavailable';EXIT evaluation;END IF;
 IF abs(observed-target)<=0.25*0.45359237 OR (target<>0 AND abs(observed-target)<=abs(target)*0.20) THEN reason:='within_product_tolerance';EXIT evaluation;END IF;
 weights:=cov->'weights';SELECT array_agg(slope ORDER BY slope) INTO slopes FROM(
 SELECT ((b.value->>'weightKg')::double precision-(a.value->>'weightKg')::double precision)/((b.value->>'date')::date-(a.value->>'date')::date)*7 slope FROM jsonb_array_elements(weights)a CROSS JOIN jsonb_array_elements(weights)b WHERE (b.value->>'date')::date-(a.value->>'date')::date>=7)z;
 lo:=slopes[1];hi:=slopes[array_length(slopes,1)];
 IF lo IS NULL OR hi IS NULL OR NOT((lo>target AND lo-target>0.25*0.45359237 AND (target=0 OR lo-target>abs(target)*0.20)) OR (hi<target AND target-hi>0.25*0.45359237 AND (target=0 OR target-hi>abs(target)*0.20))) THEN reason:='rate_sensitivity_uncertain';EXIT evaluation;END IF;
 logs:=tdee_rules14_private.logged_observed_intake_v1(c,actor,(cov->>'startDate')::date,(cov->>'endDateExclusive')::date);
 average:=(logs->>'averageLoggedCaloriesOnObservedDays')::double precision;confirmed:=(logs->>'observedDayCount')::integer;
 IF logs->>'status' IS DISTINCT FROM 'observed_logged_days' OR average IS NULL OR average<=0 OR average>10000 OR confirmed<10 OR logs->'validCalorieDayCount' IS DISTINCT FROM logs->'observedDayCount' OR logs->'unknownCalorieDayCount' IS DISTINCT FROM '0'::jsonb THEN reason:='logged_intake_mean_unavailable';EXIT evaluation;END IF;
 current_kcal:=(g->>'daily_calories')::double precision;net:=(h->>'acceptedDeltaKcal')::double precision;
 IF jsonb_typeof(g->'daily_calories') IS DISTINCT FROM 'number' OR current_kcal<>trunc(current_kcal) OR current_kcal NOT BETWEEN (p->>'min_intake_kcal')::double precision AND (p->>'max_intake_kcal')::double precision OR abs(net)>(p->>'max_cumulative_delta_kcal')::double precision THEN reason:='current_target_outside_policy';EXIT evaluation;END IF;
 expenditure:=average-observed*7700/7;desired:=expenditure+target*7700/7;
 low_delta:=average-current_kcal+(target-hi)*7700/7;high_delta:=average-current_kcal+(target-lo)*7700/7;
 IF expenditure<=0 OR expenditure>10000 THEN reason:='energy_estimate_invalid';EXIT evaluation;END IF;
 IF low_delta<=0 AND high_delta>=0 THEN reason:='intake_sensitivity_uncertain';EXIT evaluation;END IF;
 raw_delta:=CASE WHEN abs(low_delta)<abs(high_delta) THEN low_delta ELSE high_delta END;sgn:=sign(raw_delta);
 IF sgn<>sign(target-observed) THEN reason:='intake_target_adherence_gap';EXIT evaluation;END IF;
 edge:=CASE WHEN raw_delta=low_delta THEN hi ELSE lo END;
 deficit_room:='Infinity'::double precision;
 IF sgn<0 THEN
 IF jsonb_typeof(p->'max_total_deficit_kcal') IS DISTINCT FROM 'number' OR (p->>'max_total_deficit_kcal')::numeric<>trunc((p->>'max_total_deficit_kcal')::numeric) OR (p->>'max_total_deficit_kcal')::numeric<=0 OR jsonb_typeof(p->'max_total_deficit_fraction') IS DISTINCT FROM 'number' OR (p->>'max_total_deficit_fraction')::numeric<=0 OR (p->>'max_total_deficit_fraction')::numeric>=1 THEN reason:='deficit_policy_required';EXIT evaluation;END IF;
 maximum:=least((p->>'max_total_deficit_kcal')::double precision,expenditure*(p->>'max_total_deficit_fraction')::double precision);
 deficit_room:=maximum-(expenditure-current_kcal);
 IF deficit_room<=0 THEN reason:='total_deficit_limit';EXIT evaluation;END IF;
 END IF;
 magnitude:=floor((least(deficit_room,abs(raw_delta),200,(p->>'max_step_kcal')::double precision,current_kcal*(p->>'max_step_fraction')::double precision,
 CASE WHEN sgn>0 THEN (p->>'max_cumulative_delta_kcal')::double precision-net ELSE (p->>'max_cumulative_delta_kcal')::double precision+net END,
 CASE WHEN sgn>0 THEN (p->>'max_intake_kcal')::double precision-current_kcal ELSE current_kcal-(p->>'min_intake_kcal')::double precision END)+1e-9)/(p->>'increment_kcal')::double precision)*(p->>'increment_kcal')::double precision;
 IF magnitude<1 THEN reason:='policy_limit_or_subincrement';EXIT evaluation;END IF;
 IF sgn<0 THEN
 IF jsonb_typeof(p->'max_total_deficit_kcal') IS DISTINCT FROM 'number' OR (p->>'max_total_deficit_kcal')::numeric<>trunc((p->>'max_total_deficit_kcal')::numeric) OR (p->>'max_total_deficit_kcal')::numeric<=0 OR jsonb_typeof(p->'max_total_deficit_fraction') IS DISTINCT FROM 'number' OR (p->>'max_total_deficit_fraction')::numeric<=0 OR (p->>'max_total_deficit_fraction')::numeric>=1 THEN reason:='deficit_policy_required';EXIT evaluation;END IF;
 expenditure:=average-observed*7700/7;deficit:=expenditure-(current_kcal-magnitude);
 IF expenditure<=0 OR expenditure>10000 THEN reason:='deficit_estimate_invalid';EXIT evaluation;END IF;
 maximum:=least((p->>'max_total_deficit_kcal')::double precision,expenditure*(p->>'max_total_deficit_fraction')::double precision);
 IF deficit>maximum+1e-9 THEN reason:='total_deficit_limit';EXIT evaluation;END IF;
 deficit_evidence:=jsonb_build_object('version','rules14-deficit-evidence-v2','method','observed-intake-minus-observed-rate-v2','averageLoggedCaloriesOnObservedDays',average,'observedDayCount',confirmed,'observedRateKgPerWeek',observed,'estimatedExpenditureKcal',expenditure,'totalDeficitKcal',deficit,'maxAllowedDeficitKcal',maximum,'approximateKcalPerKg',7700,'measuredExpenditure',false,'clinicalGuarantee',false);
 END IF;
 average_weight:=0;FOR item IN SELECT value FROM jsonb_array_elements(weights) LOOP average_weight:=average_weight+(item->>'weightKg')::double precision;END LOOP;average_weight:=average_weight/jsonb_array_length(weights);
 RETURN jsonb_build_object('averageWeightKg',average_weight,'loggedIntake',logs,'estimatedExpenditureKcal',expenditure,'desiredIntakeKcal',desired,'kind','rules14_candidate','actionable',false,'requiresExplicitAcceptance',true,'version','rules14-decision-v2','deltaKcal',sgn*magnitude,'targetCalories',current_kcal+sgn*magnitude,'netDeltaKcal',net+sgn*magnitude,'deficitEvidence',deficit_evidence,'observedRateKgPerWeek',observed,'targetRateKgPerWeek',target,'edgeKgPerWeek',edge,'unroundedDeltaKcal',raw_delta,'lowerKgPerWeek',lo,'upperKgPerWeek',hi,'windowStart',cov->'startDate','windowEndExclusive',cov->'endDateExclusive');
 END evaluation;
 RETURN jsonb_build_object('kind','hold','reason',reason,'actionable',false,'reevaluateAt',now_ms+7*86400000);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('kind','hold','reason','invalid_input','actionable',false);
END $$;
REVOKE ALL ON FUNCTION tdee_rules14_private.evaluate_rules(jsonb,jsonb,jsonb,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

