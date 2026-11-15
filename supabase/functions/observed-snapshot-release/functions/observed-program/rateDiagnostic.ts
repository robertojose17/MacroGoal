import {parseObservedSnapshot} from './snapshot.ts';
import {normalizedDatedWeights} from '../dynamic-tdee/data.ts';
import {dayNumber,dateForDay,hasSupportedAdultAge} from '../_shared/dynamic-tdee.ts';
import {diagnoseFourteenDayRate} from '../../../../../release-candidates/tdee-adaptive-review/rateAdjustmentDecision.ts';

/** Read-only summary. Never returns raw weights, an inferred complete day or targets. */
export function observedRateDiagnostic(raw:unknown,owner:string,now:number){
 const unavailable=(reason:string)=>({version:'rate-diagnostic-v1' as const,actionable:false as const,
  status:'unavailable' as const,reason,interval:null,reliableInterval:false as const,
  loggingCompleteness:'unverified' as const,recommendation:null});
 try{
  if(!Number.isSafeInteger(now))return unavailable('invalid_time');
  const snapshot=parseObservedSnapshot(raw,owner),c=snapshot.context,s=snapshot.sources;
  const captured=Date.parse(snapshot.capturedAt);
  if(captured>now||now-captured>30000||(c.accessValidUntil!==undefined&&c.accessValidUntil<=now))return unavailable('source_expired');
  if(!c.premium||!c.enabled||!s||!c.currentGoal)return unavailable('source_unavailable');
  if(!hasSupportedAdultAge(s.dateOfBirth,c.today))return unavailable('unsupported_age');
  const cutoff=dateForDay(dayNumber(c.today)!-14);
  const minDate=s.journeyStartDate&&s.journeyStartDate>cutoff?s.journeyStartDate:cutoff;
  const weights=normalizedDatedWeights(s,c.today,minDate);
  if(weights===null)return unavailable('rate_weight_source_conflict');
  const r=diagnoseFourteenDayRate(c.today,weights.map(w=>({date:w.date,weightKg:w.kg})),c.currentGoal,now);
  if(r.kind==='blocked')return unavailable(r.reason);
  return {version:'rate-diagnostic-v1' as const,actionable:false as const,status:'descriptive' as const,
   reason:r.reason,asOf:c.today,windowStart:r.window.startDate,windowEndExclusive:r.window.endDateExclusive,
   weightDays:r.window.weightDays,missingWeightDays:r.window.missingWeightDates.length,
   observedRateKgPerWeek:r.observedRateKgPerWeek,targetRateKgPerWeek:r.targetRateKgPerWeek,
   targetRateStatus:r.targetRateStatus,targetMinusObservedKgPerWeek:r.targetMinusObservedKgPerWeek,
   interval:null,reliableInterval:false as const,loggingCompleteness:'unverified' as const,
   recommendation:null,reevaluateAt:r.reevaluateAt};
 }catch{return unavailable('source_invalid');}
}
