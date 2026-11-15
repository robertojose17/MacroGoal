/** Private pure adapter for read_review_context. No RPC, seeds, or release activation. */
import {parseObservedSnapshot} from '../../supabase/functions/observed-snapshot-release/functions/observed-program/snapshot.ts';
import {estimateFromSources,normalizedDatedWeights} from '../../supabase/functions/observed-snapshot-release/functions/dynamic-tdee/data.ts';
import {dayNumber,dateForDay,hasSupportedAdultAge} from '../../supabase/functions/observed-snapshot-release/functions/_shared/dynamic-tdee.ts';
import {verifySnapshotReceiptChain} from './receiptChain.ts';
import {draftSnapshotAdjustment, type SnapshotAdjustmentInput} from './snapshotAdjustment.ts';
import type {SmartMacroBinding,SmartMacroContext,SmartTarget} from './smartMacroAdjustment.ts';
import type {SnapshotBinding} from './snapshotProposalProducer.ts';
import {diagnoseFourteenDayRate} from './rateAdjustmentDecision.ts';
type Obj=Record<string,unknown>;
const rec=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const time=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&dayNumber(v.slice(0,10))!==null?Date.parse(v):NaN;
const same=(a:unknown,b:unknown):boolean=>a===b||(rec(a)&&rec(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
export type ReviewContextResult={kind:'blocked';reason:string}|{kind:'prepared_context';actionable:false;input:SnapshotAdjustmentInput;binding:SnapshotBinding};
/** Versioned technical contract only; no clinical assurance or release authority. */
export const SNAPSHOT_ENGINE_CONTRACT=Object.freeze({engineVersion:'observed-v1/snapshot-adjustment-v1',incrementKcal:25});
export type SnapshotMacroRequest={binding:SmartMacroBinding;current:SmartTarget;sourceCapturedAt:string;profileUpdatedAt:string;profileBinding:string;journeyBinding:string;today:string;ageYears:number};
export type SnapshotMacroEvidence={version:'snapshot-macro-evidence-v1';request:SnapshotMacroRequest;review:Omit<SmartMacroContext,'customChoice'>|null;consent:SmartMacroContext['customChoice']|null;preferenceStatus?:'current'|'absent'|'revoked'|'stale'|'invalid'};
type MacroRequestResult={kind:'macro_request';request:SnapshotMacroRequest};
type InternalResult=ReviewContextResult|MacroRequestResult;
function parseInternal(value:unknown,actor:string,proposalId:string,now:number,serverEvidence:unknown,requestOnly:boolean):InternalResult {
 const engine=SNAPSHOT_ENGINE_CONTRACT;
 const block=(reason:string):ReviewContextResult=>({kind:'blocked',reason});
 if(!uuid(actor)||!uuid(proposalId)||!Number.isFinite(now)||!rec(value)||value.version!=='snapshot-review-context-v1'||
 value.actor!==actor||value.actionable!==false||value.evidenceStatus!=='unverified')return block('review_context_invalid');
 if(!engine||typeof engine.engineVersion!=='string'||!engine.engineVersion||!Number.isSafeInteger(engine.incrementKcal)||engine.incrementKcal<1)return block('engine_contract_required');
 let observation;
 try{observation=parseObservedSnapshot(value.observation,actor);}catch{return block('observation_invalid');}
 const captured=time(observation.capturedAt);
 if(!Number.isFinite(captured)||captured>now||now-captured>30000||value.capturedAt!==observation.capturedAt)return block('source_expired');
 if(!observation.context.premium||!observation.context.enabled||!observation.sources)return block('source_unavailable');
 const profile=value.profile,g=value.currentGoal,policy=value.policy,a=value.anchor,e=value.eligibility,r=value.readiness,chain=value.receiptChain;
 if(!rec(profile)||profile.id!==actor||!Number.isFinite(time(profile.updatedAt))||time(profile.updatedAt)>captured||
 profile.timezone!==observation.sources.timezone||profile.dateOfBirth!==observation.sources.dateOfBirth||
 profile.journeyStartDate!==(observation.sources.journeyStartDate??null)||!['female','male'].includes(profile.sex as string))return block('profile_binding_mismatch');
 if(!rec(g)||g.user_id!==actor||g.is_active!==true||!uuid(g.id)||!Number.isFinite(time(g.updated_at))||time(g.updated_at)>captured||
 !observation.context.currentGoal||g.id!==observation.context.currentGoal.id||
 !['daily_calories','protein_g','carbs_g','fats_g','fiber_g','goal_type'].every(k=>g[k]===(observation.context.currentGoal as unknown as Obj)[k]))return block('goal_binding_mismatch');
 if(!rec(policy)||!rec(a)||!rec(e))return block('reviewed_records_missing');
 if(policy.enabled!==true||policy.reviewed!==true||policy.snapshot_contract_reviewed!==true||
 policy.engine_version!==engine.engineVersion||typeof policy.version!=='string'||!policy.version||!hash(policy.digest)||
 !Number.isFinite(time(policy.expires_at))||time(policy.expires_at)<=now)return block('policy_unavailable');
 if(a.owner_id!==actor||a.revoked!==false||!uuid(a.id)||a.active_goal_id!==g.id||a.policy_version!==policy.version)return block('anchor_binding_mismatch');
 if(e.owner_id!==actor||e.policy_version!==policy.version||e.eligible!==true||e.complete_days_verified!==true||
 e.source_fingerprint!==observation.sourceFingerprint||!hash(e.digest)||!Number.isFinite(time(e.expires_at))||time(e.expires_at)<=now)return block('eligibility_unavailable');
 if(!rec(r)||r.version!=='tdee-readiness-v1'||r.ownerId!==actor||r.questionnaireVersion!=='general-adult-v1'||
 r.statementVersion!=='complete-day-v1'||r.today!==observation.context.today||r.timezone!==profile.timezone||
 !hash(r.profileBinding)||!hash(r.journeyBinding)||!hash(value.readinessFingerprint)||!rec(r.eligibility)||
 r.eligibility.current!==true||r.eligibility.adult!==true||r.eligibility.response!=='criteria_confirmed'||
 !Array.isArray(r.days)||r.days.length>29||!Number.isFinite(time(r.capturedAt))||time(r.capturedAt)>now||now-time(r.capturedAt)>30000)return block('readiness_unavailable');
 if(a.journey_binding!==r.journeyBinding)return block('journey_binding_mismatch');
 const days=new Map<string,Obj>();
 for(const d of r.days){
 if(!rec(d)||typeof d.date!=='string'||dayNumber(d.date)===null||d.date>=r.today||!hash(d.contentHash)||
 typeof d.confirmable!=='boolean'||typeof d.confirmed!=='boolean'||days.has(d.date))return block('readiness_invalid');
 days.set(d.date,d);
 }
 const estimate=estimateFromSources(observation.sources,new Date(captured));
 if(estimate.status!=='estimated'||estimate.kcalPerDay===null||!estimate.windowStart||!estimate.asOf)return block('estimate_'+estimate.reason);
 for(let day=dayNumber(estimate.windowStart)!;day<dayNumber(estimate.asOf)!;day++){
 const d=days.get(dateForDay(day));if(!d||d.confirmable!==true||d.confirmed!==true)return block('complete_days_required');
 }
 if(!rec(chain)||chain.actor!==actor||!same(chain.anchor,a)||!same(chain.currentGoal,g))return block('receipt_binding_mismatch');
 let verified;try{verified=verifySnapshotReceiptChain(chain);}catch{return block('receipt_chain_unverified');}
 const baseline=time(a.baseline_captured_at);
 if(!Number.isFinite(baseline)||baseline>captured)return block('anchor_baseline_unverified');
 if(verified.acceptedCount===0&&now-baseline<14*86400000)return block('initial_review_cooldown');
 const numberKeys=['max_step_kcal','max_step_fraction','min_days_between_acceptances','min_intake_kcal'];
 if(!numberKeys.every(k=>typeof policy[k]==='number'&&Number.isFinite(policy[k])&&(policy[k] as number)>0)||
 (policy.min_days_between_acceptances as number)<14||
 !['max_cumulative_delta_kcal','max_intake_kcal'].every(k=>(typeof policy[k]==='number'&&Number.isFinite(policy[k])&&(policy[k] as number)>0))||
 typeof a.baseline_expenditure_kcal!=='number'||!Number.isFinite(a.baseline_expenditure_kcal)||a.baseline_expenditure_kcal<=0)return block('policy_or_anchor_invalid');
 const gap=(a.baseline_intake_kcal as number)-a.baseline_expenditure_kcal;
 const direction=g.goal_type==='lose'?gap<0:g.goal_type==='gain'?gap>0:g.goal_type==='maintain'?gap===0:false;
 if(!direction)return block('goal_direction_mismatch');
 const input:SnapshotAdjustmentInput={
 current:{calories:g.daily_calories as number,proteinG:g.protein_g as number,carbsG:g.carbs_g as number,fatsG:g.fats_g as number,fiberG:g.fiber_g as number},
 anchor:{intake:a.baseline_intake_kcal as number,expenditure:a.baseline_expenditure_kcal,acceptedDelta:verified.acceptedDelta,
 acceptedCount:verified.acceptedCount,receiptsVerified:verified.receiptsVerified,lastAcceptedAt:verified.lastAcceptedAt,baselineCapturedAt:baseline},
 observedExpenditure:estimate.kcalPerDay,
 policy:{reviewed:true,maxStepKcal:policy.max_step_kcal as number,maxStepFraction:policy.max_step_fraction as number,
 maxNetDeltaKcal:policy.max_cumulative_delta_kcal as number,reviewIntervalDays:policy.min_days_between_acceptances as number,
 incrementKcal:engine.incrementKcal,minIntakeKcal:Math.max(policy.min_intake_kcal as number,profile.sex==='female'?1200:1500),maxIntakeKcal:policy.max_intake_kcal as number},
 evidence:{eligible:true,modelReviewed:true,logging:'confirmed',capturedAt:captured,fingerprint:observation.sourceFingerprint,
 stability:'stable',goalDirectionValid:direction},now};
 const binding:SnapshotBinding={ownerId:actor,proposalId,anchorId:a.id as string,goalSnapshot:structuredClone(g),
 profileUpdatedAt:profile.updatedAt as string,sourceDate:estimate.asOf,today:observation.context.today,
 policyVersion:policy.version,policyDigest:policy.digest as string,engineVersion:engine.engineVersion,
 policyExpiresAt:policy.expires_at as string,eligibilityDigest:e.digest as string,eligibilityFingerprint:observation.sourceFingerprint,
 eligibilityExpiresAt:e.expires_at as string,offerExpiresAt:new Date(captured+300000).toISOString(),readinessFingerprint:value.readinessFingerprint as string};

 // Preserve earlier safety/no-change outcomes before requesting any extra evidence.
 const initial=draftSnapshotAdjustment(input);
 if(initial.kind==='blocked'&&initial.reason!=='macro_context_required')return block(initial.reason);
 if(initial.kind==='blocked'){
  if(!requestOnly&&serverEvidence===undefined)return block('macro_context_required');
  if(typeof g.macro_preset!=='string'||!['balanced','high_protein','low_carb','lean_body','custom'].includes(g.macro_preset))
   return block('macro_context_required');
  const dob=profile.dateOfBirth,today=observation.context.today;
  if(typeof dob!=='string'||dayNumber(dob)===null||dayNumber(today)===null)return block('macro_age_unverified');
  const ageYears=Number(today.slice(0,4))-Number(dob.slice(0,4))-(today.slice(5)<dob.slice(5)?1:0);
  if(!Number.isSafeInteger(ageYears)||ageYears<19||ageYears>100)return block('macro_age_unverified');
  const request:SnapshotMacroRequest={
   binding:{ownerId:actor,goalId:g.id as string,goalRevision:g.updated_at as string,preset:g.macro_preset,
    sourceFingerprint:observation.sourceFingerprint,policyVersion:policy.version,policyDigest:policy.digest as string},
   current:structuredClone(input.current),sourceCapturedAt:observation.capturedAt,profileUpdatedAt:profile.updatedAt as string,
   profileBinding:r.profileBinding as string,journeyBinding:r.journeyBinding as string,today,ageYears};
  if(requestOnly)return {kind:'macro_request',request};
  if(serverEvidence===null)return block('macro_context_required');
  if(!rec(serverEvidence)||serverEvidence.version!=='snapshot-macro-evidence-v1'||!same(serverEvidence.request,request))
   return block('macro_evidence_binding_mismatch');
  // New own-actor loaders declare preference state explicitly. A known missing,
  // revoked, stale or malformed choice must never become implicit Smart consent.
  if(Object.hasOwn(serverEvidence,'preferenceStatus')){
   if(serverEvidence.preferenceStatus!=='current')return block('macro_choice_'+(
    ['absent','revoked','stale','invalid'].includes(serverEvidence.preferenceStatus as string)?serverEvidence.preferenceStatus:'invalid'));
   if(!rec(serverEvidence.consent))return block('macro_evidence_invalid');
  }
  if(serverEvidence.review===null)return block('macro_context_required');
  if(!rec(serverEvidence.review)||Object.hasOwn(serverEvidence.review,'customChoice')||
   !rec(serverEvidence.review.review)||serverEvidence.review.review.ageYears!==ageYears||
   !Object.hasOwn(serverEvidence,'consent'))return block('macro_evidence_invalid');
  if(serverEvidence.consent!==null&&!rec(serverEvidence.consent))return block('macro_evidence_invalid');
  input.macroBinding=structuredClone(request.binding);
  input.macroContext={...structuredClone(serverEvidence.review),...(serverEvidence.consent===null?{}:{customChoice:structuredClone(serverEvidence.consent)})} as SmartMacroContext;
  const checked=draftSnapshotAdjustment(input);
  if(checked.kind==='blocked')return block(checked.reason);
 }
 if(requestOnly)return block('macro_review_not_needed');
 return {kind:'prepared_context',actionable:false,input:structuredClone(input),binding};
}
/** The fifth argument is trusted-server port output, never a raw RPC/request field. */
export function parseSnapshotReviewContext(value:unknown,actor:string,proposalId:string,now:number,serverEvidence?:unknown):ReviewContextResult{
 const result=parseInternal(value,actor,proposalId,now,serverEvidence,false);
 return result.kind==='macro_request'?{kind:'blocked',reason:'macro_context_required'}:result;
}
/** Private minimal request; all earlier source, history and energy guards must pass first. */
export function prepareSnapshotMacroContextRequest(value:unknown,actor:string,proposalId:string,now:number):MacroRequestResult|{kind:'blocked';reason:string}{
 const result=parseInternal(value,actor,proposalId,now,undefined,true);
 return result.kind==='prepared_context'?{kind:'blocked',reason:'macro_review_not_needed'}:result;
}

/**
 * Internal diagnostic from the SAME atomic own-actor review context as proposals.
 * No extra reads, policy fabrication, expenditure-threshold relaxation or writes.
 * Never serialize raw diagnostic weights as a public endpoint response.
 */
export function diagnoseSnapshotRateReview(value:unknown,actor:string,now:number){
 const block=(reason:string)=>({kind:'blocked' as const,actionable:false as const,reason});
 if(!uuid(actor)||!Number.isSafeInteger(now)||!rec(value)||value.version!=='snapshot-review-context-v1'||
 value.actor!==actor||value.actionable!==false||value.evidenceStatus!=='unverified')return block('review_context_invalid');
 let observation;
 try{observation=parseObservedSnapshot(value.observation,actor);}catch{return block('observation_invalid');}
 const captured=time(observation.capturedAt);
 if(!Number.isFinite(captured)||captured>now||now-captured>30000||value.capturedAt!==observation.capturedAt)return block('source_expired');
 if(!observation.context.premium||!observation.context.enabled||!observation.sources)return block('source_unavailable');
 if(observation.context.accessValidUntil!==undefined&&observation.context.accessValidUntil<=now)return block('source_expired');
 if(!hasSupportedAdultAge(observation.sources.dateOfBirth,observation.context.today))return block('unsupported_age');
 const g=value.currentGoal,profile=value.profile;
 if(!rec(g)||g.user_id!==actor||g.is_active!==true||!uuid(g.id)||!Number.isFinite(time(g.updated_at))||
 time(g.updated_at)>captured||!observation.context.currentGoal||g.id!==observation.context.currentGoal.id||
 !['daily_calories','protein_g','carbs_g','fats_g','fiber_g','goal_type','loss_rate_lbs_per_week','macro_preset'].every(k=>g[k]===(observation.context.currentGoal as unknown as Obj)[k]))return block('goal_binding_mismatch');
 if(!rec(profile)||profile.id!==actor||profile.dateOfBirth!==observation.sources.dateOfBirth||profile.timezone!==observation.sources.timezone||
 profile.journeyStartDate!==(observation.sources.journeyStartDate??null)||
 !Number.isFinite(time(profile.updatedAt))||time(profile.updatedAt)>captured)return block('profile_binding_mismatch');
 const today=observation.context.today,cutoff=dateForDay(dayNumber(today)!-14);
 const journey=observation.sources.journeyStartDate;
 if(journey!=null&&dayNumber(journey)===null)return block('journey_binding_mismatch');
 const minDate=journey&&journey>cutoff?journey:cutoff;
 const weights=normalizedDatedWeights(observation.sources,today,minDate);
 if(weights===null)return block('rate_weight_source_conflict');
 const diagnostic=diagnoseFourteenDayRate(today,weights.map(w=>({date:w.date,weightKg:w.kg})),g,now);
 if(diagnostic.kind==='blocked')return diagnostic;
 return {...diagnostic,sourceCapturedAt:observation.capturedAt,sourceFingerprint:observation.sourceFingerprint,
  goalId:g.id as string,goalRevision:g.updated_at as string};
}
