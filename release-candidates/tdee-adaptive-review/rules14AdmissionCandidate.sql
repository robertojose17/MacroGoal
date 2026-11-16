-- SOURCE ONLY. Owner locks and registered product rules, no fabricated clinician reviews.
CREATE FUNCTION tdee_rules14_private.validate_rate_proposal_locked(actor uuid,candidate jsonb,at_time timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET lock_timeout='500ms' SET extra_float_digits=3 AS $fn$
DECLARE reason text:='rate_proposal_unavailable';
 p tdee_rules14_private.proposals;h tdee_rate_anchor_private.anchors;u public.users;g public.goals;
 policy tdee_rules14_private.policy_versions;mc macrogoal_snapshot_review_private.macro_choices;rules_source jsonb;history jsonb;policy_doc jsonb;decision jsonb;observed_decision jsonb;reference jsonb;weight double precision;height double precision;bmi double precision;ratio double precision;age_years integer;expires_ms bigint;choice jsonb;
 payload jsonb;ref jsonb;c jsonb;chain jsonb;verified_chain jsonb;source jsonb;derived jsonb;coverage jsonb;binding jsonb;energy jsonb;energy_input jsonb;
 snapshot jsonb;readiness jsonb;target jsonb;macro jsonb;mb jsonb;expected_review jsonb;expected_limits jsonb;expected_choice jsonb;allocation jsonb;trusted_macro jsonb;
 at_ms bigint;source_ms numeric;today date;k text;n numeric;delta integer;net_delta integer;accepted_count integer;commit_obligations_verified boolean:=false;
 new_goal public.goals;unsigned_receipt jsonb;receipt_record jsonb;receipt_content text;receipt_hash text;final_context jsonb;final_access jsonb;changed_count integer;
BEGIN
 IF actor IS NULL OR at_time IS NULL OR at_time>clock_timestamp() OR at_time<clock_timestamp()-interval '30 seconds' THEN RETURN jsonb_build_object('status','rejected','reason','admission_time_invalid');END IF;
 SELECT * INTO u FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected','reason','profile_unavailable');END IF;
 at_ms:=floor(extract(epoch FROM at_time)*1000)::bigint;
 <<admission>>
 BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN reason:='isolation_unsupported';EXIT admission;END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=actor AND a.deleted_at IS NULL AND a.is_anonymous IS DISTINCT FROM true AND (a.banned_until IS NULL OR a.banned_until<=at_time)) THEN reason:='account_unavailable';EXIT admission;END IF;
  IF candidate->>'ownerId' IS DISTINCT FROM actor::text OR NOT tdee_rules14_private.valid_content(candidate,candidate->>'canonicalContent',candidate->>'digest','digest') THEN reason:='proposal_content_invalid';EXIT admission;END IF;
  IF jsonb_typeof(candidate->'expiresAt') IS DISTINCT FROM 'number' OR (candidate->>'expiresAt')::numeric<>trunc((candidate->>'expiresAt')::numeric) OR (candidate->>'expiresAt')::numeric NOT BETWEEN 0 AND 9007199254740991 THEN reason:='proposal_expiry_invalid';EXIT admission;END IF;
  p.id:=(candidate->>'id')::uuid;p.owner_id:=actor;p.record:=candidate;p.digest:=candidate->>'digest';p.canonical_content:=candidate->>'canonicalContent';p.expires_at_ms:=(candidate->>'expiresAt')::bigint;
  p.anchor_version:=(candidate#>>'{payload,anchorReference,version}')::bigint;p.source_request_id:=(candidate#>>'{payload,anchorReference,sourceRequestId}')::uuid;p.source_goal_id:=(candidate#>>'{payload,anchorReference,sourceGoalId}')::uuid;
  IF NOT tdee_rules14_private.valid_content(p.record,p.canonical_content,p.digest,'digest') OR p.record->>'version' IS DISTINCT FROM 'rules14-proposal-record-v1' THEN reason:='proposal_content_invalid';EXIT admission;END IF;
  IF p.expires_at_ms<=at_ms THEN reason:='proposal_expired';EXIT admission;END IF;
  IF EXISTS(SELECT 1 FROM tdee_rules14_private.receipts WHERE owner_id=actor AND proposal_id=p.id) THEN reason:='proposal_consumed';EXIT admission;END IF;
  SELECT * INTO h FROM tdee_rate_anchor_private.anchors WHERE owner_id=actor ORDER BY version DESC LIMIT 1 FOR SHARE;
  ref:=jsonb_build_object('ownerId',h.owner_id,'version',h.version,'sourceRequestId',h.source_request_id,'sourceGoalId',h.source_goal_id);
  IF NOT FOUND OR candidate#>'{payload,anchorReference}' IS DISTINCT FROM ref OR p.anchor_version IS DISTINCT FROM h.version OR p.source_request_id IS DISTINCT FROM h.source_request_id OR p.source_goal_id IS DISTINCT FROM h.source_goal_id THEN reason:='anchor_head_changed';EXIT admission;END IF;
  payload:=p.record->'payload';target:=payload->'target';macro:=payload->'macroEvidence';
  IF payload->'anchorReference' IS DISTINCT FROM ref OR payload->'anchorSnapshot' IS DISTINCT FROM h.anchor OR payload->>'contract' IS DISTINCT FROM 'explicit-rules14-acceptance-v1' OR payload->'requiresExplicitAcceptance' IS DISTINCT FROM 'true'::jsonb THEN reason:='proposal_anchor_changed';EXIT admission;END IF;
  IF (SELECT count(*) FROM public.goals WHERE user_id=actor AND is_active=true)<>1 THEN reason:='goal_unavailable';EXIT admission;END IF;
  SELECT * INTO g FROM public.goals WHERE user_id=actor AND is_active=true FOR UPDATE;
  IF NOT FOUND OR to_jsonb(g) IS DISTINCT FROM payload->'goalSnapshot' THEN reason:='goal_changed';EXIT admission;END IF;
  chain:=tdee_rules14_private.read_chain(actor);
  IF chain->>'version' IS DISTINCT FROM 'rules14-chain-source-v1' OR chain->>'ownerId' IS DISTINCT FROM actor::text OR chain->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR
   chain#>'{anchorHead,anchor}' IS DISTINCT FROM h.anchor OR chain#>'{anchorHead,version}' IS DISTINCT FROM to_jsonb(h.version) OR jsonb_typeof(chain->'rows') IS DISTINCT FROM 'array' THEN reason:='rate_chain_unavailable';EXIT admission;END IF;
  verified_chain:=tdee_rules14_private.verify_chain(chain,at_ms);
  IF verified_chain->>'kind' IS DISTINCT FROM 'rules14_chain_verified' OR verified_chain->'receiptsVerified' IS DISTINCT FROM 'true'::jsonb OR
   verified_chain->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR verified_chain->'anchorReference' IS DISTINCT FROM ref THEN reason:='rate_chain_unverified';EXIT admission;END IF;
  accepted_count:=(verified_chain->>'acceptedCount')::integer;
  IF accepted_count>=1000 THEN reason:='rate_chain_limit';EXIT admission;END IF;
  IF accepted_count=0 THEN
  IF h.anchor->'baselineGoalSnapshot' IS DISTINCT FROM to_jsonb(g) OR h.anchor->'acceptedCount' IS DISTINCT FROM '0'::jsonb OR h.anchor->'acceptedDeltaKcal' IS DISTINCT FROM '0'::jsonb OR h.anchor->'lastAcceptedAt' IS DISTINCT FROM 'null'::jsonb THEN reason:='initial_rate_anchor_changed';EXIT admission;END IF;
  source:=tdee_rate_anchor_private.read_source(actor);
  IF source#>>'{existingAnchor,kind}' IS DISTINCT FROM 'rate_anchor_head' OR source#>'{existingAnchor,anchor}' IS DISTINCT FROM h.anchor OR source#>'{existingAnchor,version}' IS DISTINCT FROM to_jsonb(h.version) OR
   source#>>'{existingAnchor,sourceRequestId}' IS DISTINCT FROM h.source_request_id::text OR source#>>'{existingAnchor,sourceGoalId}' IS DISTINCT FROM h.source_goal_id::text THEN reason:='initial_rate_source_changed';EXIT admission;END IF;
  -- Presence is stripped ONLY inside pure provenance re-derivation for equality.
  -- This neither resets stored history nor calls append_initial.
  derived:=tdee_rate_anchor_private.derive_initial(jsonb_set(source,'{existingAnchor}','null'::jsonb),actor,at_time);
  IF derived IS DISTINCT FROM h.anchor THEN reason:='initial_rate_provenance_changed';EXIT admission;END IF;
  END IF;
  rules_source:=tdee_rules14_private.read_source(actor,payload->'policyBinding');
  IF rules_source IS NULL THEN reason:='rules14_source_changed';EXIT admission;END IF;
  c:=rules_source->'snapshot';history:=rules_source->'history';policy_doc:=rules_source->'policy';snapshot:=c->'observation';readiness:=c->'readiness';
  IF c->'rulesScreening' IS DISTINCT FROM payload->'screeningEvidence' OR NOT tdee_rules14_private.screening_current(c,actor,at_time) THEN reason:='rules_screening_changed';EXIT admission;END IF;
  SELECT * INTO policy FROM tdee_rules14_private.policy_versions WHERE version=policy_doc->>'version' ORDER BY revision DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND OR policy_doc IS DISTINCT FROM payload->'policySnapshot' OR c->'currentGoal' IS DISTINCT FROM to_jsonb(g) OR
   c#>>'{profile,updatedAt}' IS DISTINCT FROM payload->>'profileUpdatedAt' OR readiness->>'profileBinding' IS DISTINCT FROM payload->>'profileBinding' OR readiness->>'journeyBinding' IS DISTINCT FROM payload->>'journeyBinding' OR
   snapshot#>'{context,premium}' IS DISTINCT FROM 'true'::jsonb OR snapshot#>'{context,enabled}' IS DISTINCT FROM 'true'::jsonb OR snapshot->>'sourceFingerprint' IS DISTINCT FROM payload->>'sourceFingerprint' OR
   jsonb_typeof(snapshot#>'{context,accessValidUntil}') IS DISTINCT FROM 'number' OR (snapshot#>>'{context,accessValidUntil}')::numeric<=at_ms THEN reason:='current_context_changed';EXIT admission;END IF;
  IF payload->'historyBinding' IS DISTINCT FROM jsonb_build_object('acceptedCount',history->'acceptedCount','acceptedDeltaKcal',history->'acceptedDeltaKcal','lastAcceptedAt',history->'lastAcceptedAt',
   'lastReceiptDigest',history->'lastReceiptDigest','baselineAcceptedAt',history->'baselineAcceptedAt','baselineIntakeKcal',history->'baselineIntakeKcal') THEN reason:='rules14_history_changed';EXIT admission;END IF;
  IF jsonb_typeof(payload->'sourceCapturedAt') IS DISTINCT FROM 'number' OR jsonb_typeof(payload->'preparedAt') IS DISTINCT FROM 'number' THEN reason:='proposal_time_invalid';EXIT admission;END IF;
  source_ms:=(payload->>'sourceCapturedAt')::numeric;
  IF source_ms<>trunc(source_ms) OR source_ms<0 OR source_ms>at_ms OR at_ms-source_ms>30000 OR
   (payload->>'preparedAt')::numeric<>trunc((payload->>'preparedAt')::numeric) OR (payload->>'preparedAt')::numeric NOT BETWEEN source_ms AND at_ms OR
   payload->'actionable' IS DISTINCT FROM 'false'::jsonb THEN reason:='proposal_time_invalid';EXIT admission;END IF;
  observed_decision:=tdee_rules14_private.evaluate_rules(c,history,policy_doc,actor,at_time);decision:=payload->'decision';
  IF observed_decision->>'kind' IS DISTINCT FROM 'rules14_candidate' OR decision->>'kind' IS DISTINCT FROM 'rules14_candidate' OR decision->>'version' IS DISTINCT FROM 'rules14-decision-v1' THEN reason:='rules14_decision_changed';EXIT admission;END IF;
  FOREACH k IN ARRAY ARRAY['deltaKcal','targetCalories','netDeltaKcal','deficitEvidence','observedRateKgPerWeek','targetRateKgPerWeek','windowStart','windowEndExclusive','averageWeightKg','loggedIntake','estimatedExpenditureKcal','desiredIntakeKcal'] LOOP
   IF decision->k IS DISTINCT FROM observed_decision->k THEN reason:='rules14_decision_changed';EXIT admission;END IF;END LOOP;
  IF decision#>'{calculation,edgeKgPerWeek}' IS DISTINCT FROM observed_decision->'edgeKgPerWeek' OR decision#>'{calculation,unroundedDeltaKcal}' IS DISTINCT FROM observed_decision->'unroundedDeltaKcal' OR
   decision#>'{sensitivity,lowerKgPerWeek}' IS DISTINCT FROM observed_decision->'lowerKgPerWeek' OR decision#>'{sensitivity,upperKgPerWeek}' IS DISTINCT FROM observed_decision->'upperKgPerWeek' OR
   decision->'sourceFingerprint' IS DISTINCT FROM payload->'sourceFingerprint' OR decision->'sourceCapturedAt' IS DISTINCT FROM payload->'sourceCapturedAt' OR
   decision->'actionable' IS DISTINCT FROM 'false'::jsonb OR decision->'requiresExplicitAcceptance' IS DISTINCT FROM 'true'::jsonb OR
   payload->'windowStart' IS DISTINCT FROM observed_decision->'windowStart' OR payload->'windowEndExclusive' IS DISTINCT FROM observed_decision->'windowEndExclusive' THEN reason:='rules14_decision_changed';EXIT admission;END IF;
  target:=payload->'target';macro:=payload->'nutritionEvidence';delta:=(observed_decision->>'deltaKcal')::integer;net_delta:=(observed_decision->>'netDeltaKcal')::integer;
  IF payload->'deltaKcal' IS DISTINCT FROM observed_decision->'deltaKcal' OR payload->'netDeltaKcal' IS DISTINCT FROM observed_decision->'netDeltaKcal' OR target->'calories' IS DISTINCT FROM observed_decision->'targetCalories' THEN reason:='rules14_target_changed';EXIT admission;END IF;
  energy_input:=jsonb_build_object('current',jsonb_build_object('calories',g.daily_calories,'proteinG',g.protein_g,'carbsG',g.carbs_g,'fatsG',g.fats_g,'fiberG',g.fiber_g));
  IF payload->'current' IS DISTINCT FROM energy_input->'current' THEN reason:='proposal_current_changed';EXIT admission;END IF;
  coverage:=macrogoal_snapshot_review_private.inspect_rate_coverage_v1(c,actor,at_time);
  today:=(at_time AT TIME ZONE u.timezone)::date;age_years:=date_part('year',age(today,u.date_of_birth))::integer;
  weight:=(coverage#>>'{weights,-1,weightKg}')::double precision;height:=(c#>>'{profile,heightCm}')::double precision;
  IF age_years NOT BETWEEN 19 AND 100 OR weight IS NULL OR height IS NULL OR height NOT BETWEEN 100 AND 250 OR weight<=0 THEN reason:='protein_reference_unavailable';EXIT admission;END IF;
  bmi:=weight/((height/100)^2);IF bmi<18.5 OR bmi>=30 THEN reason:='individual_reference_weight_required';EXIT admission;END IF;
  ratio:=(policy_doc->>CASE WHEN g.goal_type='lose' THEN 'protein_min_g_per_kg_loss' ELSE 'protein_min_g_per_kg_other' END)::double precision;
  FOREACH k IN ARRAY ARRAY['protein_min_g_per_kg_loss','protein_min_g_per_kg_other','protein_max_g_per_kg','fat_min_fraction','fat_max_fraction','carbs_min_g'] LOOP
   IF jsonb_typeof(policy_doc->k) IS DISTINCT FROM 'number' THEN reason:='nutrition_policy_invalid';EXIT admission;END IF;END LOOP;
  IF ratio<=0 OR (policy_doc->>'protein_max_g_per_kg')::double precision NOT BETWEEN ratio AND 4 OR (policy_doc->>'fat_min_fraction')::double precision<0.2 OR (policy_doc->>'fat_max_fraction')::double precision>0.35 OR
   (policy_doc->>'fat_min_fraction')::double precision>(policy_doc->>'fat_max_fraction')::double precision OR (policy_doc->>'carbs_min_g')::double precision NOT BETWEEN 130 AND 10000 THEN reason:='nutrition_policy_invalid';EXIT admission;END IF;
  reference:=jsonb_build_object('strategy','actual-known-non-obese-weight-v1','weightKg',weight,'heightCm',height,'bmi',bmi,'measurementDate',coverage#>'{weights,-1,date}');
  IF payload->'nutritionReference' IS DISTINCT FROM reference THEN reason:='nutrition_reference_changed';EXIT admission;END IF;
  mb:=jsonb_build_object('ownerId',actor,'goalId',g.id,'goalRevision',g.updated_at,'preset',g.macro_preset,'sourceFingerprint',snapshot->>'sourceFingerprint','policyVersion',policy.version,'policyDigest',policy.digest);
  expires_ms:=least(source_ms+30000,floor(extract(epoch FROM policy.expires_at)*1000),floor(extract(epoch FROM (c#>>'{rulesScreening,expiresAt}')::timestamptz)*1000));
  expected_review:=jsonb_build_object('version','nutrition-policy-application-v1','policyVersion',policy.version,'policyDigest',policy.digest,'sourceFingerprint',snapshot->>'sourceFingerprint',
   'profileBinding',readiness->'profileBinding','journeyBinding',readiness->'journeyBinding','computedAt',payload->'preparedAt','expiresAt',expires_ms,'ageYears',age_years,'eligibility','eligible');
  expected_limits:=jsonb_build_object('proteinMinG',ratio*weight,'proteinMaxG',(policy_doc->>'protein_max_g_per_kg')::double precision*weight,'carbsMinG',policy_doc->'carbs_min_g','carbsMaxG',10000,'fatsMinG',0,'fatsMaxG',10000,'fatMinFraction',policy_doc->'fat_min_fraction','fatMaxFraction',policy_doc->'fat_max_fraction');
  SELECT * INTO mc FROM macrogoal_snapshot_review_private.macro_choices WHERE owner_id=actor AND goal_id=g.id ORDER BY choice_version DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND OR mc.mode IS NULL OR mc.mode NOT IN ('smart','preserve_percent') OR mc.copy_version IS DISTINCT FROM 'macro-choice-v1' OR mc.goal_updated_at IS DISTINCT FROM g.updated_at OR mc.profile_binding IS DISTINCT FROM readiness->>'profileBinding' OR mc.journey_binding IS DISTINCT FROM readiness->>'journeyBinding' OR
   mc.recorded_at>at_time OR extract(epoch FROM mc.recorded_at)*1000>source_ms THEN reason:='macro_choice_changed';EXIT admission;END IF;
  expected_choice:=jsonb_build_object('mode',mc.mode,'binding',mb,'consentId',mc.request_id,'acceptedAt',floor(extract(epoch FROM mc.recorded_at)*1000),'choiceVersion',mc.choice_version,'splitBps',mc.split_bps);
  trusted_macro:=jsonb_build_object('binding',mb,'current',energy_input->'current','policyEvidence',expected_review,'limits',expected_limits,'customChoice',expected_choice);
  IF macro IS DISTINCT FROM trusted_macro OR p.expires_at_ms IS DISTINCT FROM expires_ms THEN reason:='nutrition_policy_changed';EXIT admission;END IF;
  allocation:=tdee_rules14_macro_private.adjust(jsonb_build_object('current',energy_input->'current','newCalories',target->'calories','now',at_ms,'sourceFingerprint',snapshot->>'sourceFingerprint','binding',mb,'context',trusted_macro));
  IF allocation->>'kind' IS DISTINCT FROM 'candidate' OR allocation->'target' IS DISTINCT FROM target OR allocation->'allocationMode' IS DISTINCT FROM payload->'allocationMode' THEN reason:='macro_allocation_changed';EXIT admission;END IF;
  commit_obligations_verified:=true;
 END admission;
 IF NOT commit_obligations_verified THEN RETURN jsonb_build_object('status','rejected','reason',reason);END IF;
 RETURN jsonb_build_object('status','validated','anchorRow',to_jsonb(h),'profileRow',to_jsonb(u),'goalRow',to_jsonb(g),'policyRow',to_jsonb(policy),
  'payload',payload,'anchorReference',ref,'chain',chain,'verifiedChain',verified_chain,'target',target,'sourceMs',source_ms,'delta',delta,'netDelta',net_delta,'acceptedCount',accepted_count);
END $fn$;
REVOKE ALL ON FUNCTION tdee_rules14_private.validate_rate_proposal_locked(uuid,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
