/**
 * Shared source candidate imported by OFF server diagnostics; not a release grant.
 * Signed rates are kg/week: loss is negative, gain positive.
 * Conversion is an explicit reviewed server-policy input, not a clinical claim.
 */
export type RateAdjustmentInput={
 now:number;
 targetRateKgPerWeek:number;
 observedRateKgPerWeek:number;
 interval:{lower:number;upper:number};
 data:{sufficient:boolean;stable:boolean;reliableInterval:boolean};
 currentIntakeKcal:number;
 acceptedNetDeltaKcal:number;
 policy:{conversionReviewed:boolean;kcalPerKg:number;maxStepKcal:number;maxStepFraction:number;
  minIntakeKcal:number;maxIntakeKcal:number;maxNetDeltaKcal:number};
};
export type RateAdjustmentDecision=
 {kind:'blocked';actionable:false;reason:string}|
 {kind:'hold';actionable:false;reason:string;reevaluateAt:number}|
 {kind:'candidate';actionable:false;deltaKcal:number;reason:'rate_gap';requiresAcceptance:true};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const positive=(n:unknown):n is number=>finite(n)&&n>0;
const blocked=(reason:string):Extract<RateAdjustmentDecision,{kind:'blocked'}>=>({kind:'blocked',actionable:false,reason});
/** Does not write a goal, change macros, bypass cadence, or authorize reductions. */
export function decideRateAdjustment(input:RateAdjustmentInput):RateAdjustmentDecision{
 if(!input||!input.data||!finite(input.now))return blocked('invalid_input');
 const {policy:p,data:d,interval:i,currentIntakeKcal:current,acceptedNetDeltaKcal:net}=input;
 const reevaluateAt=input.now+7*86400000;
 if(!Number.isSafeInteger(input.now)||Math.abs(input.now)>8640000000000000||!Number.isSafeInteger(reevaluateAt)||Math.abs(reevaluateAt)>8640000000000000)return blocked('invalid_time');
 const hold=(reason:string):RateAdjustmentDecision=>({kind:'hold',actionable:false,reason,reevaluateAt});
 if(!positive(current)||!finite(net))return blocked('current_target_invalid');
 // A no-change review reminder needs no assumed conversion or clinical defaults.
 // Holding is NOT approval of the current intake or the missing policy.
 if(d.sufficient!==true||d.stable!==true||d.reliableInterval!==true)return hold('insufficient_or_uncertain_data');
 if(!p||!i)return blocked('invalid_input');
 if(p.conversionReviewed!==true)return blocked('conversion_review_required');
 if(![p.kcalPerKg,p.maxStepKcal,p.maxStepFraction,p.minIntakeKcal,p.maxIntakeKcal,p.maxNetDeltaKcal].every(positive)||
 p.maxStepKcal>200||p.maxStepFraction>1||p.maxIntakeKcal<p.minIntakeKcal)return blocked('policy_invalid');
 if(current<p.minIntakeKcal||current>p.maxIntakeKcal||Math.abs(net)>p.maxNetDeltaKcal)return hold('current_target_outside_policy');
 if(!finite(input.targetRateKgPerWeek)||!finite(input.observedRateKgPerWeek)||
 !finite(i.lower)||!finite(i.upper)||i.lower>i.upper||
 input.observedRateKgPerWeek<i.lower||input.observedRateKgPerWeek>i.upper)return blocked('rate_evidence_invalid');
 if(input.targetRateKgPerWeek>=i.lower&&input.targetRateKgPerWeek<=i.upper)return hold('target_within_interval');
 // Use the nearest reliable interval edge, not the point estimate.
 const nearest=input.targetRateKgPerWeek<i.lower?i.lower:i.upper;
 const raw=(input.targetRateKgPerWeek-nearest)*p.kcalPerKg/7;
 if(!finite(raw))return hold('numeric_range_invalid');
 if(raw===0)return hold('no_change');
 const sign=Math.sign(raw);
 const netRoom=sign>0?p.maxNetDeltaKcal-net:p.maxNetDeltaKcal+net;
 const intakeRoom=sign>0?p.maxIntakeKcal-current:current-p.minIntakeKcal;
 if(!finite(netRoom)||!finite(intakeRoom))return hold('numeric_range_invalid');
 // Truncate toward zero: never round above the calculated or policy-capped change.
 const magnitude=Math.floor(Math.min(Math.abs(raw),200,p.maxStepKcal,current*p.maxStepFraction,netRoom,intakeRoom));
 if(!finite(magnitude))return hold('numeric_range_invalid');
 if(magnitude<1)return hold('policy_limit_or_subunit_change');
 return {kind:'candidate',actionable:false,deltaKcal:sign*magnitude,reason:'rate_gap',requiresAcceptance:true};
}

/**
 * Decode the existing persisted goal fields, not goal_intensity or a calorie gap.
 * This pure decoder is NOT an ownership/revision check or evidence of reliability.
 * Callers must bind the own-actor current goal and revalidate it at acceptance.
 * loss_rate_lbs_per_week is a positive loss magnitude; this engine uses signed kg.
 */
export type PersistedRateResult=
 {kind:'target_rate';targetRateKgPerWeek:number;source:'loss_rate_lbs_per_week'|'maintain'}|
 {kind:'blocked';actionable:false;reason:string};
export function readPersistedTargetRate(goal:unknown):PersistedRateResult{
 if(!goal||typeof goal!=='object'||Array.isArray(goal))return blocked('target_goal_invalid');
 const g=goal as Record<string,unknown>;
 if(g.goal_type==='maintain')return {kind:'target_rate',targetRateKgPerWeek:0,source:'maintain'};
 // Existing gain onboarding has no user-selected gain-rate field. Do not infer
 // one from a legacy loss value, goal_intensity, or the fixed initial surplus.
 if(g.goal_type==='gain')return blocked('target_gain_rate_unavailable');
 if(g.goal_type!=='lose')return blocked('target_goal_invalid');
 if(!positive(g.loss_rate_lbs_per_week))return blocked('target_loss_rate_unavailable');
 // Exact international avoirdupois pound conversion, not an energy model.
 const rate=-g.loss_rate_lbs_per_week*0.45359237;
 if(!finite(rate)||rate===0)return blocked('target_loss_rate_unavailable');
 return {kind:'target_rate',targetRateKgPerWeek:rate,source:'loss_rate_lbs_per_week'};
}
/** Research candidate only; no runtime mount, writes, defaults or release authority. */
export function decidePersistedGoalRateAdjustment(
 goal:unknown,input:Omit<RateAdjustmentInput,'targetRateKgPerWeek'>
):RateAdjustmentDecision{
 const target=readPersistedTargetRate(goal);
 if(target.kind==='blocked')return target;
 return decideRateAdjustment({...input,targetRateKgPerWeek:target.targetRateKgPerWeek});
}

/** Exact calendar window only. It never establishes sufficiency or an interval. */
export type RateReviewWindow=
 {kind:'window';actionable:false;startDate:string;endDateExclusive:string;
  weights:{date:string;weightKg:number}[];weightDays:number;missingWeightDates:string[]}|
 {kind:'blocked';actionable:false;reason:string};
const calendarDay=(value:unknown):number|null=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const stamp=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value?stamp/86400000:null;
};
/**
 * today is the verified user's LOCAL date, not UTC date derived from now.
 * Rows must already be own-actor, unit-normalized and journey-scoped by the
 * source loader. Duplicate dates fail closed rather than selecting a reading.
 * Missing days remain missing; zero weight and missing values are not imputed.
 */
export function selectFourteenDayRateWindow(today:unknown,rows:unknown):RateReviewWindow{
 const end=calendarDay(today);
 if(end===null||!Array.isArray(rows))return blocked('rate_window_invalid');
 const start=end-14;
 const dateFor=(day:number)=>new Date(day*86400000).toISOString().slice(0,10);
 if(calendarDay(dateFor(start))!==start)return blocked('rate_window_invalid');
 const weights:{date:string;weightKg:number}[]=[];
 const seen=new Set<string>();
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row))return blocked('rate_weight_invalid');
  const day=calendarDay(row.date);
  if(day===null)return blocked('rate_weight_date_invalid');
  if(day<start||day>=end)continue;
  if(!positive(row.weightKg))return blocked('rate_weight_invalid');
  if(seen.has(row.date))return blocked('rate_weight_date_conflict');
  seen.add(row.date);weights.push({date:row.date,weightKg:row.weightKg});
 }
 weights.sort((a,b)=>a.date.localeCompare(b.date));
 const missingWeightDates:string[]=[];
 for(let day=start;day<end;day++){const date=dateFor(day);if(!seen.has(date))missingWeightDates.push(date);}
 return {kind:'window',actionable:false,startDate:dateFor(start),endDateExclusive:today as string,
 weights,weightDays:weights.length,missingWeightDates};
}

/**
 * Descriptive 14-day diagnostic, separate from the 21-day expenditure model.
 * Reuses its median-of-pair-slopes convention (pairs >=7 calendar days apart).
 * Pair count is NOT an independent sample count and does not establish confidence.
 * No plateau classification, calorie conversion or recommendation is produced.
 * reevaluateAt is metadata, not a scheduled task. No user data are fetched here.
 */
export function diagnoseFourteenDayRate(today:unknown,rows:unknown,goal:unknown,now:number){
 const reevaluateAt=now+7*86400000;
 if(!Number.isSafeInteger(now)||Math.abs(now)>8640000000000000||
 !Number.isSafeInteger(reevaluateAt)||Math.abs(reevaluateAt)>8640000000000000)return blocked('invalid_time');
 const window=selectFourteenDayRateWindow(today,rows);
 if(window.kind==='blocked')return window;
 const target=readPersistedTargetRate(goal);
 const slopes:number[]=[];
 for(let a=0;a<window.weights.length;a++)for(let b=a+1;b<window.weights.length;b++){
  const left=window.weights[a],right=window.weights[b];
  const gap=calendarDay(right.date)!-calendarDay(left.date)!;
  if(gap<7)continue;
  const slope=(right.weightKg-left.weightKg)/gap;
  if(!finite(slope))return blocked('rate_numeric_range_invalid');
  slopes.push(slope);
 }
 slopes.sort((a,b)=>a-b);
 const middle=Math.floor(slopes.length/2);
 // Halve each term before adding to avoid overflowing the median average.
 const slope=slopes.length===0?null:slopes.length%2?slopes[middle]:slopes[middle-1]/2+slopes[middle]/2;
 const rate=slope===null?null:slope*7;
 if(rate!==null&&!finite(rate))return blocked('rate_numeric_range_invalid');
 const targetRate=target.kind==='target_rate'?target.targetRateKgPerWeek:null;
 const gap=rate===null||targetRate===null?null:targetRate-rate;
 if(gap!==null&&!finite(gap))return blocked('rate_numeric_range_invalid');
 return {kind:'rate_diagnostic' as const,actionable:false as const,
  window,eligiblePairCount:slopes.length,observedRateKgPerWeek:rate,
  targetRateKgPerWeek:targetRate,targetRateStatus:target.kind==='target_rate'?'available':target.reason,
  targetMinusObservedKgPerWeek:gap,
  // Pair extrema are a deterministic sensitivity envelope, NOT a confidence interval.
  // Pairwise slopes are dependent and cannot be treated as independent samples.
  sensitivity:describeRateSensitivity(slopes,targetRate),
  interval:null,reliableInterval:false as const,recommendation:null,
  reason:rate===null?'insufficient_pair_span':'uncertainty_not_established',
  reevaluateAt};
}

/** Product coverage thresholds, NOT statistical precision or nutritional review. */
export const INITIAL_RATE_COVERAGE=Object.freeze({
 windowDays:14 as const,minCompleteDays:10,minWeightDays:8,minWeightsPerHalf:1,
});
export type InitialRateCoverageRules={windowDays:14;minCompleteDays:number;minWeightDays:number;minWeightsPerHalf:number};
/**
 * Invoked only with the own-actor snapshot's hash-validated readiness summary.
 * Distribution means readings in both seven-day halves; configurable, not a CI.
 * Passing coverage permits further evaluation, NEVER a recommendation by itself.
 * A daily caller may evaluate this repeatedly; cadence after acceptance is separate.
 */
export function assessInitialRateCoverage(
 window:RateReviewWindow,coverage:{status:string;confirmedDays:number|null;windowDays:number},
 rules:InitialRateCoverageRules=INITIAL_RATE_COVERAGE
){
 const base={actionable:false as const,recommendation:null,statisticalConfidenceEstablished:false as const};
 const fail=(reason:string)=>({...base,coverageSufficient:false,reason});
 if(!rules||rules.windowDays!==14||
 ![rules.minCompleteDays,rules.minWeightDays,rules.minWeightsPerHalf].every(Number.isSafeInteger)||
 rules.minCompleteDays<10||rules.minCompleteDays>14||rules.minWeightDays<8||rules.minWeightDays>14||
 rules.minWeightsPerHalf<1||rules.minWeightsPerHalf>7)return fail('coverage_rules_invalid');
 if(window.kind!=='window'||calendarDay(window.endDateExclusive)===null||
 calendarDay(window.startDate)!==calendarDay(window.endDateExclusive)!-14)return fail('rate_window_invalid');
 if(!coverage||coverage.status!=='explicit_self_report'||coverage.windowDays!==14||
 !Number.isSafeInteger(coverage.confirmedDays)||coverage.confirmedDays!<0||coverage.confirmedDays!>14)
 return fail('complete_days_unverified');
 // Revalidate dates/count rather than trusting a caller-supplied weightDays value.
 const checked=selectFourteenDayRateWindow(window.endDateExclusive,window.weights);
 if(checked.kind!=='window'||checked.weightDays!==window.weightDays)return fail('rate_window_invalid');
 const midpoint=calendarDay(window.startDate)!+7;
 const first=checked.weights.filter(w=>calendarDay(w.date)!<midpoint).length;
 const second=checked.weightDays-first;
 const counts={completeDays:coverage.confirmedDays,weightDays:checked.weightDays,
 firstHalfWeightDays:first,secondHalfWeightDays:second,thresholds:{...rules}};
 if(coverage.confirmedDays!<rules.minCompleteDays)return {...fail('complete_days_insufficient'),...counts};
 if(checked.weightDays<rules.minWeightDays)return {...fail('weight_days_insufficient'),...counts};
 if(first<rules.minWeightsPerHalf||second<rules.minWeightsPerHalf)return {...fail('weight_distribution_insufficient'),...counts};
 return {...base,...counts,coverageSufficient:true,reason:'coverage_met_uncertainty_requires_evaluation'};
}

/** User-selected product tolerance; descriptive comparison, not an uncertainty test. */
export const RATE_TOLERANCE=Object.freeze({absoluteLbPerWeek:0.25,relativeFraction:0.20});
export function compareInitialRateToTarget(
 observedKgPerWeek:number|null,targetKgPerWeek:number|null,coverageSufficient:boolean,
 tolerance:{absoluteLbPerWeek:number;relativeFraction:number}=RATE_TOLERANCE
){
 const base={actionable:false as const,recommendation:null,statisticalConfidenceEstablished:false as const};
 if(!tolerance||!positive(tolerance.absoluteLbPerWeek)||!positive(tolerance.relativeFraction)||tolerance.relativeFraction>1)
 return {...base,status:'blocked' as const,reason:'tolerance_invalid'};
 if(coverageSufficient!==true)return {...base,status:'hold' as const,reason:'coverage_insufficient'};
 if(!finite(observedKgPerWeek)||!finite(targetKgPerWeek))
 return {...base,status:'hold' as const,reason:'target_or_trend_unavailable'};
 const gap=targetKgPerWeek-observedKgPerWeek;
 const absoluteKg=tolerance.absoluteLbPerWeek*0.45359237;
 const relativeKg=Math.abs(targetKgPerWeek)*tolerance.relativeFraction;
 if(!finite(gap)||!finite(absoluteKg)||!finite(relativeKg))
 return {...base,status:'blocked' as const,reason:'rate_numeric_range_invalid'};
 // Both tolerances must be exceeded, including equality as within tolerance.
 // For maintenance (target zero) the absolute tolerance remains nonzero.
 const outside=Math.abs(gap)>absoluteKg&&Math.abs(gap)>relativeKg;
 return {...base,status:'comparison' as const,targetMinusObservedKgPerWeek:gap,
 absoluteToleranceKgPerWeek:absoluteKg,relativeToleranceKgPerWeek:relativeKg,
 outsideProductTolerance:outside,
 reason:outside?'deviation_requires_uncertainty_evaluation':'within_product_tolerance'};
}

/** Explicit product choices; no clinical policy approval or eligibility is implied. */
export const RATE_PRODUCT_PARAMETERS=Object.freeze({
 version:'rate-product-parameters-v1',windowDays:14,minCompleteDays:10,minWeightDays:8,
 absoluteToleranceLbPerWeek:0.25,relativeToleranceFraction:0.20,
 approximateKcalPerKg:7700,maxAdjustmentKcal:200,
 minimumDaysAfterAcceptance:14,uncertainReassessmentDays:7,
 evaluationTrigger:'daily-observation-not-calendar-adjustment',
 statisticalValidation:false,recommendationsEnabled:false,
});
/**
 * Uses the actual normalized trajectory. No resampling, invented measurement
 * error, statistical confidence percentage or independent-pair sample claim.
 * A narrow envelope can still miss correlated fluid shifts or logging bias.
 */
function describeRateSensitivity(dailySlopes:number[],target:number|null){
 const base={method:'pair-slope-extrema-at-least-seven-days-v1' as const,
  statisticalConfidenceEstablished:false as const,independentSamples:false as const,
  recommendation:null,actionable:false as const};
 if(dailySlopes.length===0)return {...base,status:'unavailable' as const,lowerKgPerWeek:null,upperKgPerWeek:null,
  outsideToleranceAcrossEnvelope:false,reason:'insufficient_pair_span'};
 // Caller sorts slopes and verifies each arithmetic result.
 const lower=dailySlopes[0]*7,upper=dailySlopes[dailySlopes.length-1]*7;
 if(!finite(lower)||!finite(upper)||lower>upper)return {...base,status:'unavailable' as const,
  lowerKgPerWeek:null,upperKgPerWeek:null,outsideToleranceAcrossEnvelope:false,reason:'numeric_range_invalid'};
 const lo=compareInitialRateToTarget(lower,target,true),hi=compareInitialRateToTarget(upper,target,true);
 const sameSide=finite(target)&&(target<lower||target>upper);
 const outside=sameSide&&lo.status==='comparison'&&hi.status==='comparison'&&
  lo.outsideProductTolerance&&hi.outsideProductTolerance;
 return {...base,status:'descriptive' as const,lowerKgPerWeek:lower,upperKgPerWeek:upper,
  outsideToleranceAcrossEnvelope:outside,
  reason:outside?'deviation_persists_across_pair_sensitivity_not_validation':'uncertain_or_within_tolerance'};
}


export const INITIAL_OBSERVED_RATE_COVERAGE=Object.freeze({windowDays:14 as const,minObservedIntakeDays:10,minWeightDays:8,minWeightsPerHalf:1});
export type InitialObservedRateCoverageRules={windowDays:14;minObservedIntakeDays:number;minWeightDays:number;minWeightsPerHalf:number};
export function assessInitialObservedRateCoverage(
 window:RateReviewWindow,coverage:{status:string;observedIntakeDays:number|null;windowDays:number},
 rules:InitialObservedRateCoverageRules=INITIAL_OBSERVED_RATE_COVERAGE
){
 const base={dataBasis:'observed-logs-v1' as const,completenessEstablished:false as const,actionable:false as const,recommendation:null,statisticalConfidenceEstablished:false as const};
 const fail=(reason:string)=>({...base,coverageSufficient:false,reason});
 if(!rules||rules.windowDays!==14||
 ![rules.minObservedIntakeDays,rules.minWeightDays,rules.minWeightsPerHalf].every(Number.isSafeInteger)||
 rules.minObservedIntakeDays<10||rules.minObservedIntakeDays>14||rules.minWeightDays<8||rules.minWeightDays>14||
 rules.minWeightsPerHalf<1||rules.minWeightsPerHalf>7)return fail('coverage_rules_invalid');
 if(window.kind!=='window'||calendarDay(window.endDateExclusive)===null||
 calendarDay(window.startDate)!==calendarDay(window.endDateExclusive)!-14)return fail('rate_window_invalid');
 if(!coverage||coverage.status!=='observed_logged_days'||coverage.windowDays!==14||
 !Number.isSafeInteger(coverage.observedIntakeDays)||coverage.observedIntakeDays!<0||coverage.observedIntakeDays!>14)
 return fail('observed_logs_unverified');
 // Revalidate dates/count rather than trusting a caller-supplied weightDays value.
 const checked=selectFourteenDayRateWindow(window.endDateExclusive,window.weights);
 if(checked.kind!=='window'||checked.weightDays!==window.weightDays)return fail('rate_window_invalid');
 const midpoint=calendarDay(window.startDate)!+7;
 const first=checked.weights.filter(w=>calendarDay(w.date)!<midpoint).length;
 const second=checked.weightDays-first;
 const counts={observedIntakeDays:coverage.observedIntakeDays,weightDays:checked.weightDays,
 firstHalfWeightDays:first,secondHalfWeightDays:second,thresholds:{...rules}};
 if(coverage.observedIntakeDays!<rules.minObservedIntakeDays)return {...fail('observed_log_days_insufficient'),...counts};
 if(checked.weightDays<rules.minWeightDays)return {...fail('weight_days_insufficient'),...counts};
 if(first<rules.minWeightsPerHalf||second<rules.minWeightsPerHalf)return {...fail('weight_distribution_insufficient'),...counts};
 return {...base,...counts,coverageSufficient:true,reason:'coverage_met_uncertainty_requires_evaluation'};
}

