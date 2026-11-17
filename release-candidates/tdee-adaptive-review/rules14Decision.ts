import {rules14ProfileSupportCurrent} from './rules14ProfileSupport.ts';
/** Deterministic product rule with an approximate expenditure estimate, never measured TDEE or a statistical CI. */
import {diagnoseObservedSnapshotRateReview} from './snapshotReviewContextParser.ts';
import {RATE_TOLERANCE,compareInitialRateToTarget} from './rateAdjustmentDecision.ts';
export const RULES14_PRODUCT_DEFAULTS=Object.freeze({minIntakeKcal:1500,maxIntakeKcal:5000,proteinMinLossGPerKg:1.4,proteinMinOtherGPerKg:.8,proteinMaxGPerKg:2.0,fatMinFraction:.20,fatMaxFraction:.35,carbsMinG:130,version:'rules14-observed-product-defaults-v2',proposedBy:'assistant-product-design',
 windowDays:14,minWeightDays:8,minObservedIntakeDays:10,maxStepKcal:200,maxStepFraction:0.10,maxNetDeltaKcal:400,
 maxTotalDeficitKcal:500,maxTotalDeficitFraction:0.20,incrementKcal:25,minDaysBetweenAcceptances:14,uncertainReassessmentDays:7,approximateKcalPerKg:7700,
 absoluteToleranceLbPerWeek:0.25,relativeToleranceFraction:0.20,statisticalConfidenceClaim:false} as const);
export type Rules14Policy={version:string;revision:number;digest:string;engine_version:'rules14-observed-v2';enabled:boolean;expires_at:string;
 max_step_kcal:number;max_step_fraction:number;max_cumulative_delta_kcal:number;increment_kcal:number;min_days_between_acceptances:number;
 /** Explicit reviewed energy limits, never guessed universal intake floors. */
 min_intake_kcal:number;max_intake_kcal:number;scope:'profile-adult-observed-v1';protein_min_g_per_kg_loss:number;protein_min_g_per_kg_other:number;protein_max_g_per_kg:number;fat_min_fraction:number;fat_max_fraction:number;carbs_min_g:number;max_total_deficit_kcal:number;max_total_deficit_fraction:number};
export type Rules14History={version:'rules14-history-v1';authority:'server-rules14-chain-v1';ownerId:string;capturedAt:number;
 anchorReference:{ownerId:string;version:number;sourceRequestId:string;sourceGoalId:string};baselineAcceptedAt:number;baselineIntakeKcal:number;
 acceptedCount:number;acceptedDeltaKcal:number;lastAcceptedAt:number|null;lastReceiptDigest:string|null;currentGoal:Record<string,any>};
const int=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const stop=(reason:string,now:number)=>({kind:'hold' as const,actionable:false as const,reason,reevaluateAt:now+7*86400000});
/** Raw snapshot/history must be read from one trusted own-owner server envelope. */
export function decideRules14(snapshot:unknown,actor:string,history:Rules14History,p:Rules14Policy,now:number){
 if(!int(now)||now<0||now>253401609600000)return stop('invalid_time',0);
 const d=diagnoseObservedSnapshotRateReview(snapshot,actor,now);if(d.kind==='blocked')return stop(d.reason,now);
 const g=(snapshot as any).currentGoal;
 if(!p||p.engine_version!=='rules14-observed-v2'||p.enabled!==true||!hash(p.digest)||typeof p.version!=='string'||!p.version||
 !Number.isFinite(Date.parse(p.expires_at))||Date.parse(p.expires_at)<=now||p.scope!=='profile-adult-observed-v1'||!int(p.revision)||p.revision<1)return stop('energy_policy_required',now);
 if(![p.max_step_kcal,p.max_cumulative_delta_kcal,p.increment_kcal,p.min_days_between_acceptances,p.min_intake_kcal,p.max_intake_kcal].every(int)||
 p.max_step_kcal<1||p.max_step_kcal>200||!finite(p.max_step_fraction)||p.max_step_fraction<=0||p.max_step_fraction>1||
 p.max_cumulative_delta_kcal<1||p.increment_kcal<1||p.increment_kcal>p.max_step_kcal||p.min_days_between_acceptances<14||p.min_days_between_acceptances>365||
 p.min_intake_kcal<=0||p.max_intake_kcal>10000||p.min_intake_kcal>p.max_intake_kcal)return stop('policy_invalid',now);
 if(!rules14ProfileSupportCurrent(snapshot,actor,now))return stop('profile_support_required',now);
 if(!history||history.version!=='rules14-history-v1'||history.authority!=='server-rules14-chain-v1'||history.ownerId!==actor||
 history.anchorReference?.ownerId!==actor||!int(history.anchorReference.version)||history.anchorReference.version<1||
 !int(history.capturedAt)||history.capturedAt>now||now-history.capturedAt>30000||!int(history.baselineAcceptedAt)||history.baselineAcceptedAt>now||history.baselineAcceptedAt<0||
 !int(history.baselineIntakeKcal)||!int(history.acceptedCount)||history.acceptedCount<0||!int(history.acceptedDeltaKcal)||
 history.baselineIntakeKcal+history.acceptedDeltaKcal!==g.daily_calories||Object.keys(g).length!==Object.keys(history.currentGoal??{}).length||Object.keys(g).some(k=>JSON.stringify(g[k])!==JSON.stringify(history.currentGoal?.[k]))||
 (history.acceptedCount===0&&(history.lastAcceptedAt!==null||history.lastReceiptDigest!==null||history.acceptedDeltaKcal!==0))||
 (history.acceptedCount>0&&(!int(history.lastAcceptedAt)||!hash(history.lastReceiptDigest)||history.lastAcceptedAt<history.baselineAcceptedAt||history.lastAcceptedAt>now)))return stop('accepted_history_required',now);
 if(now-(history.lastAcceptedAt??history.baselineAcceptedAt)<p.min_days_between_acceptances*86400000)return stop('review_cooldown',now);
 if(!d.initialCoverage.coverageSufficient)return stop(d.initialCoverage.reason,now);
 const observed=d.observedRateKgPerWeek,target=d.targetRateKgPerWeek;
 if(!finite(observed)||!finite(target))return stop('target_or_trend_unavailable',now);
 const comparison=compareInitialRateToTarget(observed,target,true,RATE_TOLERANCE);
 if(comparison.status!=='comparison'||!comparison.outsideProductTolerance)return stop('within_product_tolerance',now);
 const sensitivity=d.sensitivity;
 if(sensitivity.status!=='descriptive'||!sensitivity.outsideToleranceAcrossEnvelope||!finite(sensitivity.lowerKgPerWeek)||!finite(sensitivity.upperKgPerWeek))return stop('rate_sensitivity_uncertain',now);
 // Closest descriptive pair-slope edge, NOT a confidence limit. Correlated fluid
 // shifts/logging bias may still mislead this rule; disclose approximation in UI.
 const logs=d.loggedIntake,average=logs.averageLoggedCaloriesOnObservedDays;
 if(logs.status!=='observed_logged_days'||!finite(average)||average<=0||average>10000||
  !int(logs.validCalorieDayCount)||logs.validCalorieDayCount<10||logs.unknownCalorieDayCount!==0||logs.validCalorieDayCount!==logs.observedDayCount)return stop('logged_intake_mean_unavailable',now);
 const current=g.daily_calories,net=history.acceptedDeltaKcal;
 if(!int(current)||current<p.min_intake_kcal||current>p.max_intake_kcal||Math.abs(net)>p.max_cumulative_delta_kcal)return stop('current_target_outside_policy',now);
 const expenditure=average-observed*7700/7,desiredIntake=expenditure+target*7700/7;
 const lowDelta=average-current+(target-sensitivity.upperKgPerWeek)*7700/7;
 const highDelta=average-current+(target-sensitivity.lowerKgPerWeek)*7700/7;
 if(!finite(expenditure)||expenditure<=0||expenditure>10000||![desiredIntake,lowDelta,highDelta].every(finite))return stop('energy_estimate_invalid',now);
 if(lowDelta<=0&&highDelta>=0)return stop('intake_sensitivity_uncertain',now);
 const raw=Math.abs(lowDelta)<Math.abs(highDelta)?lowDelta:highDelta,sign=Math.sign(raw);
 // A large reported-intake/target gap can invert the suggested target adjustment.
 // Hold instead of presenting an unexplained opposite-direction recommendation.
 if(sign!==Math.sign(target-observed))return stop('intake_target_adherence_gap',now);
 const edge=raw===lowDelta?sensitivity.upperKgPerWeek:sensitivity.lowerKgPerWeek;
 let deficitRoom=Infinity,maximumDeficit=Infinity;
 if(sign<0){
  if(!int(p.max_total_deficit_kcal)||p.max_total_deficit_kcal<=0||!finite(p.max_total_deficit_fraction)||p.max_total_deficit_fraction<=0||p.max_total_deficit_fraction>=1)return stop('deficit_policy_required',now);
  maximumDeficit=Math.min(p.max_total_deficit_kcal,expenditure*p.max_total_deficit_fraction);
  deficitRoom=maximumDeficit-(expenditure-current);
  if(deficitRoom<=0)return stop('total_deficit_limit',now);
 }
 const cap=Math.min(deficitRoom,Math.abs(raw),200,p.max_step_kcal,current*p.max_step_fraction,
  sign>0?p.max_cumulative_delta_kcal-net:p.max_cumulative_delta_kcal+net,
  sign>0?p.max_intake_kcal-current:current-p.min_intake_kcal);
 // 1e-9 kcal only neutralizes floating representation at an exact increment.
 const magnitude=Math.floor((cap+1e-9)/p.increment_kcal)*p.increment_kcal;
 if(!int(magnitude)||magnitude<1)return stop('policy_limit_or_subincrement',now);
 let deficitEvidence=null;
 if(sign<0){
  const deficit=expenditure-(current-magnitude),maximum=maximumDeficit;
  if(deficit>maximum+1e-9)return stop('total_deficit_limit',now);
  deficitEvidence={version:'rules14-deficit-evidence-v2' as const,method:'observed-intake-minus-observed-rate-v2' as const,
   averageLoggedCaloriesOnObservedDays:average,observedDayCount:logs.observedDayCount,observedRateKgPerWeek:observed,
   estimatedExpenditureKcal:expenditure,totalDeficitKcal:deficit,maxAllowedDeficitKcal:maximum,
   approximateKcalPerKg:7700,measuredExpenditure:false as const,clinicalGuarantee:false as const};
 }
 return {kind:'rules14_candidate' as const,actionable:false as const,requiresExplicitAcceptance:true as const,
 version:'rules14-decision-v2' as const,deficitEvidence,deltaKcal:sign*magnitude,targetCalories:current+sign*magnitude,netDeltaKcal:net+sign*magnitude,
 averageWeightKg:d.window.weights.reduce((sum,w)=>sum+w.weightKg,0)/d.window.weights.length,loggedIntake:logs,
 estimatedExpenditureKcal:expenditure,desiredIntakeKcal:desiredIntake,observedRateKgPerWeek:observed,targetRateKgPerWeek:target,sourceFingerprint:d.sourceFingerprint,sourceCapturedAt:Date.parse(d.sourceCapturedAt),
 windowStart:d.window.startDate,windowEndExclusive:d.window.endDateExclusive,coverage:d.initialCoverage,
 sensitivity:{...sensitivity},conversion:{model:'approximate-energy-equivalent-v1' as const,kcalPerKg:7700,statisticalConfidenceClaim:false as const},
 calculation:{method:'observed-intake-plus-target-minus-observed-v2' as const,edgeKgPerWeek:edge,unroundedDeltaKcal:raw,arithmeticEpsilonKcal:1e-9,incrementKcal:p.increment_kcal},
 qualification:'Deterministic product rule using approximate energy conversion; not a measured TDEE or confidence interval.'};
}

