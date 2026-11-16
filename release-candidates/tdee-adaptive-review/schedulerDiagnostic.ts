/** Explicit hold contract for actual snapshot evaluator results, not clinical approval. */
export type SchedulerDiagnostic={kind:'uncertain'|'resolved'|'preserve';reason:string};
const HOLD_REASONS=new Set(['coverage_insufficient','target_or_trend_unavailable','within_product_tolerance','rate_uncertainty_unverified','rate_difference_uncertain']);
/** Unknown, blocked or malformed output NEVER clears the persisted hold.
 * Hold metadata must match the evaluator's exact seven-day contract. */
export function diagnosticFromSnapshot(result:unknown,assessedAt:number):SchedulerDiagnostic{
 if(!Number.isSafeInteger(assessedAt)||assessedAt<0||assessedAt>253401609600000)return {kind:'preserve',reason:'invalid_assessment_time'};
 if(!result||typeof result!=='object')return {kind:'preserve',reason:'unknown_assessment_result'};
 const r=result as {kind?:unknown;reason?:unknown;reevaluateAt?:unknown};
 if(r.kind==='no_change'&&typeof r.reason==='string'&&HOLD_REASONS.has(r.reason)&&r.reevaluateAt===assessedAt+604800000)
  return {kind:'uncertain',reason:r.reason};
 // Even successful draft transport is not evidence to clear a hold. Only an
 // explicit recognized no-change result with no hold metadata resolves it.
 if(r.kind==='no_change'&&r.reason==='same_rate_target'&&r.reevaluateAt===undefined)
  return {kind:'resolved',reason:r.reason};
 return {kind:'preserve',reason:typeof r.reason==='string'?r.reason:'unknown_assessment_result'};
}
