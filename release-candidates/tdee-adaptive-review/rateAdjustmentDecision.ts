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
const blocked=(reason:string):RateAdjustmentDecision=>({kind:'blocked',actionable:false,reason});
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
