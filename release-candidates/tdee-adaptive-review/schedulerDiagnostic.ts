/** Explicit hold contract for actual snapshot evaluator results, not clinical approval. */
export type SchedulerDiagnostic={kind:'uncertain'|'resolved'|'preserve';reason:string};
const HOLD_REASONS=new Set(['coverage_insufficient','target_or_trend_unavailable','within_product_tolerance','rate_uncertainty_unverified','rate_difference_uncertain']);
const INITIAL_HOLD_REASONS=new Set([...HOLD_REASONS,'complete_days_insufficient','weight_days_insufficient','weight_distribution_insufficient','complete_days_unverified','journey_start_unverified','initial_fourteen_days_not_elapsed','rate_sensitivity_uncertain']);
const OBSERVED_HOLD_REASONS=new Set([...HOLD_REASONS,'observed_log_days_insufficient','weight_days_insufficient','weight_distribution_insufficient','observed_logs_unverified','journey_start_unverified','initial_fourteen_days_not_elapsed','rate_sensitivity_uncertain']);
export type AssessedSnapshot={assessedAt:number;result:unknown};
/** Unknown, blocked or malformed output NEVER clears the persisted hold.
 * Hold metadata must match the evaluator's exact seven-day contract. */
export function diagnosticFromSnapshot(result:unknown,assessedAt:number):SchedulerDiagnostic{
 if(!Number.isSafeInteger(assessedAt)||assessedAt<0||assessedAt>253401609600000)return {kind:'preserve',reason:'invalid_assessment_time'};
 if(!result||typeof result!=='object')return {kind:'preserve',reason:'unknown_assessment_result'};
 const r=result as {kind?:unknown;reason?:unknown;reevaluateAt?:unknown;version?:unknown;actionable?:unknown;recommendation?:unknown;dataBasis?:unknown;completenessEstablished?:unknown};
 if(r.kind==='hold'&&r.version==='initial-observed-rate-assessment-v2'&&r.dataBasis==='observed-logs-v1'&&r.completenessEstablished===false&&r.actionable===false&&r.recommendation===null&&typeof r.reason==='string'&&OBSERVED_HOLD_REASONS.has(r.reason)&&r.reevaluateAt===assessedAt+604800000) return {kind:'uncertain',reason:r.reason};
 if(r.kind==='hold'&&r.version==='initial-rate-assessment-v1'&&r.actionable===false&&r.recommendation===null&&
 typeof r.reason==='string'&&INITIAL_HOLD_REASONS.has(r.reason)&&r.reevaluateAt===assessedAt+604800000)
  return {kind:'uncertain',reason:r.reason};
 if(r.kind==='no_change'&&typeof r.reason==='string'&&HOLD_REASONS.has(r.reason)&&r.reevaluateAt===assessedAt+604800000)
  return {kind:'uncertain',reason:r.reason};
 // Even successful draft transport is not evidence to clear a hold. Only an
 // explicit recognized no-change result with no hold metadata resolves it.
 if(r.kind==='no_change'&&r.reason==='same_rate_target'&&r.reevaluateAt===undefined)
  return {kind:'resolved',reason:r.reason};
 return {kind:'preserve',reason:typeof r.reason==='string'?r.reason:'unknown_assessment_result'};
}

/** Envelope is emitted by the trusted evaluator using its actual assessment clock.
 * It is not a client timestamp. Do not anchor delayed results to an older plan. */
export function diagnosticFromAssessment(assessment:AssessedSnapshot,plannedAt:number,verifiedNow:number):SchedulerDiagnostic{
 if(!assessment||!Number.isSafeInteger(plannedAt)||!Number.isSafeInteger(verifiedNow)||
 !Number.isSafeInteger(assessment.assessedAt)||plannedAt<0||assessment.assessedAt<plannedAt||
 assessment.assessedAt>verifiedNow||verifiedNow-assessment.assessedAt>30000)
  return {kind:'preserve',reason:'invalid_assessment_time'};
 return diagnosticFromSnapshot(assessment.result,assessment.assessedAt);
}

