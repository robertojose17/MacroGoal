/** Pure candidate scheduling only. Calendar time never grants a recommendation. */
import {ADAPTIVE_RELEASE_STATE} from './proposal.ts';
export const DAILY_SCHEDULER_RELEASE_STATE=Object.freeze({enabled:false} as const);
const DAY=86400000;
// contextRevision is a stable server digest of accepted goal revision, profile/journey
// scope and scheduler contract version. NEVER include rolling meal/weight source
// fingerprints or current capture timestamps: those would defeat per-day dedup.
// Source freshness is independently revalidated for each dispatch.
export type ScheduleScope={ownerId:string;contextRevision:string;timezone:string};
export type UncertainHold={assessedAt:number;reevaluateAt:number};
export type AssessmentInput=ScheduleScope&{
 expectedOwnerId:string;now:number;observationEnabled:boolean;
 // Server-derived booleans are admission prerequisites, not purchase/review proof.
 currentAccessVerified:boolean;sourceBindingVerified:boolean;
 lastAcceptedAt:number|null;hold:UncertainHold|null;
};
export type DailyRecord=ScheduleScope&{
 version:'daily-assessment-ledger-v1';localDate:string;key:string;revision:number;
 status:'claimed'|'completed'|'uncertain'|'retryable';claimId:string;claimedAt:number;finishedAt:number|null;
};
export type DailyPlan=ScheduleScope&{
 kind:'assessment_plan';actionable:false;localDate:string;key:string;plannedAt:number;
 reevaluationDue:boolean;acceptanceCooldownPassed:boolean;
 // The evaluator must still reload and enforce every current source/policy gate.
 recommendationAuthorized:false;acceptanceAuthorized:false;
};
type Stop={kind:'blocked'|'skip'|'reconcile';reason:string;actionable:false};
const stop=(kind:Stop['kind'],reason:string):Stop=>({kind,reason,actionable:false});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const stamp=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=253402214400000;
const scopeValid=(s:ScheduleScope)=>!!s&&uuid(s.ownerId)&&hash(s.contextRevision)&&typeof s.timezone==='string'&&s.timezone.length>0&&s.timezone.length<=100;
function localDate(now:number,timezone:string):string|null{
 try{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const get=(t:string)=>parts.find(p=>p.type===t)?.value;
  const result=`${get('year')}-${get('month')}-${get('day')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(result)?result:null;
 }catch{return null;}
}
const keyFor=(s:ScheduleScope,date:string)=>JSON.stringify(['daily-assessment-v1',s.ownerId,s.contextRevision,date]);
function recordValid(r:DailyRecord):boolean{
 return scopeValid(r)&&r.version==='daily-assessment-ledger-v1'&&Number.isSafeInteger(r.revision)&&r.revision>=1&&r.revision<Number.MAX_SAFE_INTEGER&&
 ['claimed','completed','uncertain','retryable'].includes(r.status)&&uuid(r.claimId)&&stamp(r.claimedAt)&&
 localDate(r.claimedAt,r.timezone)===r.localDate&&r.key===keyFor(r,r.localDate)&&
 (r.status==='claimed'?r.finishedAt===null:stamp(r.finishedAt)&&r.finishedAt>=r.claimedAt);
}
/** Preserve the first hold until explicitly resolved or a due reassessment finishes. */
export function scheduleUncertainReassessment(assessedAt:number,previous:UncertainHold|null):UncertainHold|Stop{
 if(!stamp(assessedAt)||!stamp(assessedAt+7*DAY))return stop('blocked','invalid_time');
 if(previous!==null){
  if(!previous||typeof previous!=='object'||!stamp(previous.assessedAt)||!stamp(previous.reevaluateAt)||previous.reevaluateAt!==previous.assessedAt+7*DAY||previous.assessedAt>assessedAt)return stop('blocked','invalid_hold');
  // Daily uncertainty does not postpone the original seven-day reassessment.
  if(assessedAt<previous.reevaluateAt)return {...previous};
 }
 return {assessedAt,reevaluateAt:assessedAt+7*DAY};
}
/** Daily diagnostics continue during a hold/cooldown, without authorizing issuance. */
export function planDailyAssessment(input:AssessmentInput,record:DailyRecord|null):DailyPlan|Stop{
 if(!input||!scopeValid(input)||!stamp(input.now)||!uuid(input.expectedOwnerId)||input.ownerId!==input.expectedOwnerId)return stop('blocked','invalid_owner_or_scope');
 const date=localDate(input.now,input.timezone);if(!date)return stop('blocked','invalid_timezone_or_date');
 if(input.observationEnabled!==true)return stop('skip','observation_disabled');
 if(input.currentAccessVerified!==true||input.sourceBindingVerified!==true)return stop('blocked','current_prerequisites_required');
 if(input.lastAcceptedAt!==null&&(!stamp(input.lastAcceptedAt)||input.lastAcceptedAt>input.now))return stop('blocked','invalid_acceptance_time');
 if(input.hold!==null){const h=input.hold;if(!h||typeof h!=='object'||!stamp(h.assessedAt)||!stamp(h.reevaluateAt)||h.assessedAt>input.now||h.reevaluateAt!==h.assessedAt+7*DAY)return stop('blocked','invalid_hold');}
 if(record!==null){
  if(!recordValid(record)||record.ownerId!==input.ownerId||record.contextRevision!==input.contextRevision)return stop('blocked','ledger_scope_mismatch');
  if(record.timezone!==input.timezone)return stop('reconcile','timezone_changed');
  if(record.claimedAt>input.now||(record.finishedAt!==null&&record.finishedAt>input.now)||record.localDate>date)return stop('reconcile','clock_moved_backwards');
  // An expired lease/next day is not proof that an uncertain operation did not run.
  if(record.status!=='completed'&&record.status!=='retryable')return stop('reconcile','unfinished_assessment');
  if(record.status==='completed'&&record.localDate===date)return stop('skip','already_completed_today');
 }
 return {kind:'assessment_plan',actionable:false,ownerId:input.ownerId,contextRevision:input.contextRevision,timezone:input.timezone,
 localDate:date,key:keyFor(input,date),plannedAt:input.now,reevaluationDue:input.hold===null||input.now>=input.hold.reevaluateAt,
 acceptanceCooldownPassed:input.lastAcceptedAt===null||input.now-input.lastAcceptedAt>=14*DAY,
 recommendationAuthorized:false,acceptanceAuthorized:false};
}
/** Pure compare-and-set transition. Storage MUST apply it atomically under UNIQUE(owner,context). */
export function claimDailyAssessment(plan:DailyPlan,record:DailyRecord|null,expectedRevision:number,claimId:string):DailyRecord|Stop{
 if(!plan||plan.kind!=='assessment_plan'||!scopeValid(plan)||!stamp(plan.plannedAt)||localDate(plan.plannedAt,plan.timezone)!==plan.localDate||
 plan.key!==keyFor(plan,plan.localDate)||plan.actionable!==false||plan.recommendationAuthorized!==false||plan.acceptanceAuthorized!==false||!uuid(claimId))return stop('blocked','invalid_plan');
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>Number.MAX_SAFE_INTEGER-2)return stop('blocked','invalid_revision');
 if((record?.revision??0)!==expectedRevision)return stop('reconcile','claim_conflict');
 if(record!==null){
  if(!recordValid(record)||record.ownerId!==plan.ownerId||record.contextRevision!==plan.contextRevision||record.timezone!==plan.timezone)return stop('blocked','ledger_scope_mismatch');
  if(record.status!=='completed'&&record.status!=='retryable')return stop('reconcile','unfinished_assessment');
  if(record.localDate>plan.localDate||(record.status==='completed'&&record.localDate===plan.localDate)||record.claimedAt>plan.plannedAt||(record.finishedAt!==null&&record.finishedAt>plan.plannedAt))return stop('skip','already_claimed_or_clock_changed');
  if(record.claimId===claimId)return stop('blocked','claim_identity_reused');
 }
 return {version:'daily-assessment-ledger-v1',ownerId:plan.ownerId,contextRevision:plan.contextRevision,timezone:plan.timezone,
 localDate:plan.localDate,key:plan.key,revision:expectedRevision+1,status:'claimed',claimId,claimedAt:plan.plannedAt,finishedAt:null};
}
/** Unknown results must reconcile; never mark completed merely because a request timed out. */
export function finishDailyAssessment(record:DailyRecord,claimId:string,now:number,outcome:'completed'|'uncertain'):DailyRecord|Stop{
 if(!recordValid(record)||record.revision>=Number.MAX_SAFE_INTEGER-1||record.status!=='claimed'||record.claimId!==claimId||!stamp(now)||now<record.claimedAt||!['completed','uncertain'].includes(outcome))return stop('blocked','invalid_completion');
 return {...record,status:outcome,finishedAt:now,revision:record.revision+1};
}
/** Only server-verified durable outcome evidence may resolve an uncertain claim. Never a timer. */
export function reconcileDailyAssessment(record:DailyRecord,evidence:{key:string;claimId:string;checkedAt:number;outcome:'completed'|'not_executed'},now:number):DailyRecord|Stop{
 if(!recordValid(record)||record.revision>=Number.MAX_SAFE_INTEGER-1||!['claimed','uncertain'].includes(record.status)||!evidence||evidence.key!==record.key||evidence.claimId!==record.claimId||
 !stamp(now)||!stamp(evidence.checkedAt)||evidence.checkedAt<Math.max(record.claimedAt,record.finishedAt??0)||evidence.checkedAt>now||now-evidence.checkedAt>30000||
 !['completed','not_executed'].includes(evidence.outcome))return stop('reconcile','authoritative_reconciliation_required');
 return {...record,status:evidence.outcome==='completed'?'completed':'retryable',finishedAt:now,revision:record.revision+1};
}
/** Latest locked/atomic server ledger plus fresh scope are both required at dispatch. */
export function revalidateClaimedAssessment(input:AssessmentInput,record:DailyRecord|null,claimId:string):DailyPlan|Stop{
 if(!input||!record||!recordValid(record)||record.status!=='claimed'||record.claimId!==claimId||record.claimedAt>input.now)return stop('reconcile','claim_not_current');
 const plan=planDailyAssessment(input,null);
 if(plan.kind!=='assessment_plan'||plan.key!==record.key||plan.timezone!==record.timezone)return stop('reconcile','claimed_context_changed');
 return plan;
}
export interface DailySchedulerPorts{
 loadOwnContext():Promise<{input:AssessmentInput;record:DailyRecord|null}>;
 // Atomically claim/reload exact key and source scope; no blind upsert.
 claim(plan:DailyPlan,expectedRevision:number):Promise<{status:'claimed'|'conflict';claimId:string}>;
 evaluateReadOnly(plan:DailyPlan,claimId:string):Promise<void>;
 complete(plan:DailyPlan,claimId:string,outcome:'completed'|'uncertain'):Promise<void>;
}
/** Prepared wiring only. Immutable OFF prevents even context/clock/storage callbacks. */
export function createDailyAssessmentScheduler(ports:DailySchedulerPorts){
 return async()=>{
  if(!DAILY_SCHEDULER_RELEASE_STATE.enabled||!ADAPTIVE_RELEASE_STATE.recommendationsEnabled)return stop('blocked','safety_review_required');
  let plan:DailyPlan|undefined,claimId:string|undefined;
  try{
   const {input,record}=await ports.loadOwnContext();const candidate=planDailyAssessment(input,record);
   if(candidate.kind!=='assessment_plan')return candidate;
   plan=candidate;const claim=await ports.claim(plan,record?.revision??0);
   if(claim.status!=='claimed'||!uuid(claim.claimId))return stop('reconcile','claim_conflict');
   claimId=claim.claimId;
   // Recheck scope/revocation/date after claim before dispatching any assessment.
   const fresh=await ports.loadOwnContext(),revalidated=revalidateClaimedAssessment(fresh.input,fresh.record,claimId);
   if(revalidated.kind!=='assessment_plan'||revalidated.key!==plan.key||revalidated.timezone!==plan.timezone)
    return stop('reconcile','claimed_context_changed');
   plan=revalidated;await ports.evaluateReadOnly(plan,claimId);await ports.complete(plan,claimId,'completed');
   return {kind:'completed' as const,actionable:false as const,key:plan.key};
  }catch{
   if(plan&&claimId){try{await ports.complete(plan,claimId,'uncertain');}catch{/* require reconciliation */}}
   return stop('reconcile','assessment_outcome_unknown');
  }
 };
}
