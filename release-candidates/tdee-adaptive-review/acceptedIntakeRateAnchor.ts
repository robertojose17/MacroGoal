/** Pure intake provenance, NOT an expenditure estimate or approval to adjust.
 * Source must be one trusted owner-scoped SQL snapshot of current goal/profile,
 * stored goal-write receipt and server-computed current fullprofile fingerprint.
 * No endpoint/SQL installation, goal writes, policy defaults, or fabricated history.
 */
export const ACCEPTED_INTAKE_RATE_ANCHOR_RELEASE=Object.freeze({enabled:false} as const);
type Obj=Record<string,unknown>;
const obj=(x:unknown):x is Obj=>!!x&&typeof x==='object'&&!Array.isArray(x);
const uuid=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const same=(a:unknown,b:unknown):boolean=>a===b||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i])))||(obj(a)&&obj(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
const day=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const time=(x:unknown)=>{if(typeof x!=='string')return NaN;const m=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(Z|[+-]\d\d:\d\d)$/.exec(x);return m&&day(m[1])&&+m[2]<24&&+m[3]<60&&+m[4]<60&&(m[5]==='Z'||(+m[5].slice(1,3)<24&&+m[5].slice(4)<60))?Date.parse(x):NaN;};

// Receipt evidence is server-captured, never manufactured from today's profile.
// Missing legacy evidence requires genuine manual baseline reconfirmation.
export function materialEvidenceCurrent(r:Obj,current:unknown,actor:string):boolean {
 const m=r.material_profile;
 return obj(m)&&obj(current)&&same(m,current)&&m.contract==='accepted-goal-material-profile-v1'&&m.ownerId===actor&&
 typeof m.heightCm==='number'&&Number.isFinite(m.heightCm)&&m.heightCm>=100&&m.heightCm<=250&&
 ['male','female'].includes(m.sex as string)&&m.onboardingCompleted===true&&day(m.dateOfBirth)&&
 ['sedentary','light','moderate','active','very_active'].includes(m.activityLevel as string)&&
 Number.isFinite(time(r.material_profile_updated_at));
}

const blocked=(reason:string)=>({kind:'blocked' as const,actionable:false as const,reason});
export type AcceptedIntakeRateAnchor={
 contract:'accepted-intake-rate-anchor-v1';ownerId:string;initialGoalId:string;initialGoalRevision:string;
 acceptedAt:number;baselineIntakeKcal:number;baselineGoalSnapshot:Obj;
 profileBinding:string;journeyBinding:string;journeyStartDate:string;journeyRestartCount:number;
 sourceReceipt:{requestId:string;operation:'initial_onboarding'|'manual_goal';createdAt:string;acceptedProfileFingerprint:string;acceptedProfileUpdatedAt:string};
 acceptedDeltaKcal:0;acceptedCount:0;lastAcceptedAt:null;earliestReviewAt:number;
};
/** Initial builder only. Never replace/reset an existing legacy or rate anchor.
 * The policy/uncertainty/macros and acceptance receipt chain remain independent.
 */
export function prepareAcceptedIntakeRateAnchor(source:unknown,actor:string,now:number){
 if(!uuid(actor)||!Number.isSafeInteger(now)||now<0||!obj(source)||source.version!=='accepted-goal-rate-anchor-source-v1'||source.ownerId!==actor||source.actionable!==false)return blocked('rate_anchor_source_invalid');
 if(source.existingAnchor!==null)return blocked('rate_anchor_already_bound');
 const capture=time(source.capturedAt),g=source.currentGoal,p=source.currentProfile,r=source.receipt;
 if(!Number.isFinite(capture)||capture>now||now-capture>30000)return blocked('rate_anchor_source_expired');
 if(!obj(g)||!obj(p)||!obj(r)||!obj(r.payload)||!obj(r.goal_snapshot)||!uuid(g.id)||g.user_id!==actor||g.is_active!==true||p.id!==actor||p.onboarding_completed!==true)return blocked('rate_anchor_owner_or_goal_invalid');
 if(r.user_id!==actor||!uuid(r.request_id)||r.goal_id!==g.id||!same(r.goal_snapshot,g)||!['initial_onboarding','manual_goal'].includes(r.payload.operation as string))return blocked('accepted_goal_receipt_mismatch');
 if(r.material_profile==null||r.material_profile_updated_at==null)return blocked('baseline_reconfirmation_required');
 if(!hash(r.profile_fingerprint)||!materialEvidenceCurrent(r,source.currentMaterialProfile,actor)||!hash(source.profileBinding)||!hash(source.journeyBinding))return blocked('accepted_profile_provenance_unavailable');
 const accepted=time(g.created_at),updated=time(g.updated_at),profileUpdated=time(r.material_profile_updated_at),receiptAt=time(r.created_at),earliest=accepted+14*86400000;
 if(![accepted,updated,profileUpdated,receiptAt,earliest].every(Number.isSafeInteger)||accepted<0||accepted!==updated||accepted>capture||profileUpdated>capture||receiptAt>capture||earliest>8640000000000000)return blocked('accepted_goal_time_invalid');
 if(!day(p.journey_start_date)||!Number.isSafeInteger(p.journey_restart_count)||(p.journey_restart_count as number)<0||g.start_journey_date!==p.journey_start_date)return blocked('accepted_journey_provenance_unavailable');
 let today:string;
 try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:p.timezone as string,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(capture));today=['year','month','day'].map(k=>parts.find(x=>x.type===k)?.value).join('-');}catch{return blocked('accepted_profile_invalid');}
 if(!day(today)||p.journey_start_date>today||!day(p.date_of_birth)||typeof p.timezone!=='string'||!p.timezone)return blocked('accepted_profile_invalid');
 const age=+today.slice(0,4)-+p.date_of_birth.slice(0,4)-(today.slice(5)<p.date_of_birth.slice(5)?1:0);
 if(age<19||age>100)return blocked('accepted_profile_age_ineligible');
 const keys=['daily_calories','protein_g','carbs_g','fats_g','fiber_g'];
 if(!keys.every(k=>Number.isSafeInteger(g[k])&&(g[k] as number)>=0&&(g[k] as number)<=10000)||(g.daily_calories as number)<=0||
  g.base_daily_calories!==g.daily_calories||g.last_adaptive_update!==null||Math.abs((g.daily_calories as number)-4*(g.protein_g as number)-4*(g.carbs_g as number)-9*(g.fats_g as number))>10)return blocked('accepted_goal_targets_invalid');
 const anchor:AcceptedIntakeRateAnchor={contract:'accepted-intake-rate-anchor-v1',ownerId:actor,initialGoalId:g.id as string,initialGoalRevision:g.updated_at as string,acceptedAt:accepted,
  baselineIntakeKcal:g.daily_calories as number,baselineGoalSnapshot:structuredClone(g),profileBinding:source.profileBinding as string,journeyBinding:source.journeyBinding as string,journeyStartDate:p.journey_start_date,journeyRestartCount:p.journey_restart_count as number,
  sourceReceipt:{requestId:r.request_id as string,operation:r.payload.operation as 'initial_onboarding'|'manual_goal',createdAt:r.created_at as string,acceptedProfileFingerprint:r.profile_fingerprint as string,acceptedProfileUpdatedAt:r.material_profile_updated_at as string},
  acceptedDeltaKcal:0,acceptedCount:0,lastAcceptedAt:null,earliestReviewAt:earliest};
 return {kind:'rate_anchor_draft' as const,actionable:false as const,acceptanceAuthorized:false as const,anchor};
}
