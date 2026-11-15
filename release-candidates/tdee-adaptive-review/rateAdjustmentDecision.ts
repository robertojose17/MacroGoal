/**
 * Isolated research candidate, not imported by application/runtime or a grant.
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
