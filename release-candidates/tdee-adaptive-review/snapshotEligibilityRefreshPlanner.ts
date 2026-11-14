/** Private pure eligibility-refresh planner. No writes, policy selection, or release authority. */
import {parseObservedSnapshot} from '../../supabase/functions/observed-snapshot-release/functions/observed-program/snapshot.ts';
import {estimateFromSources} from '../../supabase/functions/observed-snapshot-release/functions/dynamic-tdee/data.ts';
import {dayNumber,dateForDay} from '../../supabase/functions/observed-snapshot-release/functions/_shared/dynamic-tdee.ts';
import {verifySnapshotReceiptChain} from './receiptChain.ts';
import {SNAPSHOT_ENGINE_CONTRACT} from './snapshotReviewContextParser.ts';
type Obj=Record<string,unknown>;
const rec=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const time=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&dayNumber(v.slice(0,10))!==null&&Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60?Date.parse(v):NaN;
const same=(a:unknown,b:unknown):boolean=>a===b||(rec(a)&&rec(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
const block=(reason:string)=>({kind:'blocked' as const,reason});
/** Consumes an owner-scoped coherent loader result, never HTTP evidence.
 * Revalidates the actual anchor/receipt chain without resetting calibration or
 * bypassing proposal cadence. Writer must reread evidence and compare all CAS
 * fields/hashes, computing its own digest. No baseline or goal writes allowed.
 */
export function planSnapshotEligibilityRefresh(value:unknown,actor:string,now:number){
 if(!uuid(actor)||!Number.isFinite(now)||!rec(value)||value.version!=='snapshot-review-context-v1'||
 value.actor!==actor||value.actionable!==false||value.evidenceStatus!=='unverified')return block('review_context_invalid');
 let observation;
 try{observation=parseObservedSnapshot(value.observation,actor);}catch{return block('observation_invalid');}
 const captured=time(observation.capturedAt);
 if(!Number.isFinite(captured)||captured>now||now-captured>30000||value.capturedAt!==observation.capturedAt)return block('source_expired');
 if(!observation.context.premium||!observation.context.enabled||!observation.sources)return block('source_unavailable');
 const profile=value.profile,g=value.currentGoal,r=value.readiness,p=value.policy,c=value.receiptChain,a=value.anchor;
 if(!rec(a)||a.owner_id!==actor||a.revoked!==false||!uuid(a.id))return block('anchor_unavailable');
 if(!rec(profile)||profile.id!==actor||!Number.isFinite(time(profile.updatedAt))||time(profile.updatedAt)>captured||
 profile.timezone!==observation.sources.timezone||profile.dateOfBirth!==observation.sources.dateOfBirth||
 profile.journeyStartDate!==(observation.sources.journeyStartDate??null)||!['female','male'].includes(profile.sex as string))return block('profile_binding_mismatch');
 if(!rec(g)||g.user_id!==actor||g.is_active!==true||!uuid(g.id)||!Number.isFinite(time(g.updated_at))||time(g.updated_at)>captured||
 !observation.context.currentGoal||g.id!==observation.context.currentGoal.id||
 !['daily_calories','protein_g','carbs_g','fats_g','fiber_g','goal_type'].every(k=>g[k]===(observation.context.currentGoal as unknown as Obj)[k]))return block('goal_binding_mismatch');
 if(a.active_goal_id!==g.id||!rec(c)||c.actor!==actor||!same(c.anchor,a)||!same(c.currentGoal,g))return block('receipt_binding_mismatch');
 let verified;try{verified=verifySnapshotReceiptChain(c);}catch{return block('receipt_chain_unverified');}
 if(verified.receiptsVerified!==true)return block('receipt_chain_unverified');
 if(!rec(p)||p.enabled!==true||p.reviewed!==true||p.snapshot_contract_reviewed!==true||
 p.engine_version!==SNAPSHOT_ENGINE_CONTRACT.engineVersion||typeof p.version!=='string'||!p.version||!hash(p.digest)||
 !Number.isFinite(time(p.expires_at))||time(p.expires_at)<=now)return block('policy_unavailable');
 if(a.policy_version!==p.version)return block('anchor_policy_mismatch');
 const ints=['max_step_kcal','min_days_between_acceptances','min_intake_kcal'];
 if(!ints.every(k=>typeof p[k]==='number'&&Number.isSafeInteger(p[k])&&(p[k] as number)>0)||
 (p.max_step_kcal as number)>200||(p.min_days_between_acceptances as number)<14||
 typeof p.max_step_fraction!=='number'||!Number.isFinite(p.max_step_fraction)||p.max_step_fraction<=0||p.max_step_fraction>1||
 !['max_cumulative_delta_kcal','max_intake_kcal'].every(k=>(typeof p[k]==='number'&&Number.isSafeInteger(p[k])&&(p[k] as number)>0))||
 ((p.max_intake_kcal as number)<(p.min_intake_kcal as number)))return block('policy_invalid');
 if(!rec(r)||r.version!=='tdee-readiness-v1'||r.ownerId!==actor||r.questionnaireVersion!=='general-adult-v1'||
 r.statementVersion!=='complete-day-v1'||r.today!==observation.context.today||r.timezone!==profile.timezone||
 !hash(r.profileBinding)||!hash(r.journeyBinding)||!hash(value.readinessFingerprint)||!rec(r.eligibility)||
 r.eligibility.current!==true||r.eligibility.adult!==true||r.eligibility.response!=='criteria_confirmed'||
 !Array.isArray(r.days)||r.days.length>29||!Number.isFinite(time(r.capturedAt))||time(r.capturedAt)>now||now-time(r.capturedAt)>30000)return block('readiness_unavailable');
 if(a.journey_binding!==r.journeyBinding||!Number.isFinite(time(a.baseline_captured_at))||time(a.baseline_captured_at)>captured||
 typeof a.baseline_expenditure_kcal!=='number'||!Number.isSafeInteger(a.baseline_expenditure_kcal)||a.baseline_expenditure_kcal<=0)return block('anchor_baseline_unverified');
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
 const goalNumbers=['daily_calories','protein_g','carbs_g','fats_g','fiber_g'];
 if(!goalNumbers.every(k=>typeof g[k]==='number'&&Number.isSafeInteger(g[k])&&(g[k] as number)>=0)||
 (g.daily_calories as number)<=0||Math.abs((g.daily_calories as number)-4*(g.protein_g as number)-4*(g.carbs_g as number)-9*(g.fats_g as number))>10)return block('current_target_invalid');
 if((g.daily_calories as number)<Math.max(p.min_intake_kcal as number,profile.sex==='female'?1200:1500)||
 ((g.daily_calories as number)>(p.max_intake_kcal as number)))return block('current_target_outside_policy');
 const gap=(a.baseline_intake_kcal as number)-a.baseline_expenditure_kcal;
 if(!(g.goal_type==='lose'?gap<0:g.goal_type==='gain'?gap>0:g.goal_type==='maintain'?gap===0:false))return block('goal_direction_mismatch');
 return {kind:'eligibility_refresh_draft' as const,actionable:false as const,ownerId:actor,
 expectedProfileUpdatedAt:profile.updatedAt as string,expectedGoalSnapshot:structuredClone(g),
 journeyBinding:r.journeyBinding as string,sourceFingerprint:observation.sourceFingerprint,
 readinessFingerprint:value.readinessFingerprint as string,sourceCapturedAt:observation.capturedAt,
 policyVersion:p.version,policyDigest:p.digest as string,engineVersion:SNAPSHOT_ENGINE_CONTRACT.engineVersion,
 expectedAnchorSnapshot:structuredClone(a),anchorId:a.id as string,
 eligibilityEvidence:{responseVersion:r.questionnaireVersion,readinessVerified:true as const,completeDaysVerified:true as const,
 windowStart:estimate.windowStart,asOf:estimate.asOf,expiresAt:new Date(Math.min(time(p.expires_at),captured+300000)).toISOString()}};
}
