/** Private pure bootstrap planner. No writes, policy selection, or release authority. */
import {parseObservedSnapshot} from '../../supabase/functions/observed-snapshot-release/functions/observed-program/snapshot.ts';
import {estimateFromSources} from '../../supabase/functions/observed-snapshot-release/functions/dynamic-tdee/data.ts';
import {dayNumber,dateForDay} from '../../supabase/functions/observed-snapshot-release/functions/_shared/dynamic-tdee.ts';
import {SNAPSHOT_ENGINE_CONTRACT} from './snapshotReviewContextParser.ts';
type Obj=Record<string,unknown>;
const rec=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const time=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&dayNumber(v.slice(0,10))!==null&&Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60?Date.parse(v):NaN;
const same=(a:unknown,b:unknown):boolean=>a===b||(rec(a)&&rec(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
const block=(reason:string)=>({kind:'blocked' as const,reason});
/** Policy argument must come from an exact server-selected registry version, never HTTP input.
 * Writer must reread policy/context, lock profile then goal, reject anchor conflicts,
 * compare CAS/hashes, and compute its own canonical digest. This is not a write permit.
 */
export function planSnapshotBootstrap(value:unknown,actor:string,serverReviewedPolicy:unknown,now:number){
 if(!uuid(actor)||!Number.isFinite(now)||!rec(value)||value.version!=='snapshot-review-context-v1'||
 value.actor!==actor||value.actionable!==false||value.evidenceStatus!=='unverified')return block('review_context_invalid');
 let observation;
 try{observation=parseObservedSnapshot(value.observation,actor);}catch{return block('observation_invalid');}
 const captured=time(observation.capturedAt);
 if(!Number.isFinite(captured)||captured>now||now-captured>30000||value.capturedAt!==observation.capturedAt)return block('source_expired');
 if(!observation.context.premium||!observation.context.enabled||!observation.sources)return block('source_unavailable');
 const profile=value.profile,g=value.currentGoal,r=value.readiness,p=serverReviewedPolicy,c=value.receiptChain;
 // Even a revoked/current-goal anchor requires a separately reviewed replacement path.
 if(value.anchor!==null||value.policy!==null||value.eligibility!==null)return block('bootstrap_already_bound');
 if(!rec(profile)||profile.id!==actor||!Number.isFinite(time(profile.updatedAt))||time(profile.updatedAt)>captured||
 profile.timezone!==observation.sources.timezone||profile.dateOfBirth!==observation.sources.dateOfBirth||
 profile.journeyStartDate!==(observation.sources.journeyStartDate??null)||!['female','male'].includes(profile.sex as string))return block('profile_binding_mismatch');
 if(!rec(g)||g.user_id!==actor||g.is_active!==true||!uuid(g.id)||!Number.isFinite(time(g.updated_at))||time(g.updated_at)>captured||
 !observation.context.currentGoal||g.id!==observation.context.currentGoal.id||
 !['daily_calories','protein_g','carbs_g','fats_g','fiber_g','goal_type'].every(k=>g[k]===(observation.context.currentGoal as unknown as Obj)[k]))return block('goal_binding_mismatch');
 if(!rec(c)||c.actor!==actor||c.anchor!==null||!same(c.currentGoal,g)||c.totalCount!==0||!Array.isArray(c.rows)||c.rows.length!==0)return block('bootstrap_receipt_conflict');
 if(!rec(p)||p.enabled!==true||p.reviewed!==true||p.snapshot_contract_reviewed!==true||
 p.engine_version!==SNAPSHOT_ENGINE_CONTRACT.engineVersion||typeof p.version!=='string'||!p.version||!hash(p.digest)||
 !Number.isFinite(time(p.expires_at))||time(p.expires_at)<=now)return block('policy_unavailable');
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
 const gap=(g.daily_calories as number)-estimate.kcalPerDay;
 if(!(g.goal_type==='lose'?gap<0:g.goal_type==='gain'?gap>0:g.goal_type==='maintain'?gap===0:false))return block('goal_direction_mismatch');
 return {kind:'bootstrap_draft' as const,actionable:false as const,ownerId:actor,
 expectedProfileUpdatedAt:profile.updatedAt as string,expectedGoalSnapshot:structuredClone(g),
 journeyBinding:r.journeyBinding as string,sourceFingerprint:observation.sourceFingerprint,
 readinessFingerprint:value.readinessFingerprint as string,sourceCapturedAt:observation.capturedAt,
 policyVersion:p.version,policyDigest:p.digest as string,engineVersion:SNAPSHOT_ENGINE_CONTRACT.engineVersion,
 baseline:{intakeKcal:g.daily_calories as number,expenditureKcal:estimate.kcalPerDay,capturedAt:observation.capturedAt},
 eligibilityEvidence:{responseVersion:r.questionnaireVersion,readinessVerified:true as const,completeDaysVerified:true as const,
 windowStart:estimate.windowStart,asOf:estimate.asOf,expiresAt:new Date(Math.min(time(p.expires_at),captured+300000)).toISOString()}};
}
