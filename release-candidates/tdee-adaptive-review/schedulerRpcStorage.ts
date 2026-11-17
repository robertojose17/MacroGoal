import {diagnosticFromAssessment,type AssessedSnapshot} from './schedulerDiagnostic.ts';
import type {DailyPlan,DailyRecord,ScheduleScope,UncertainHold} from './dailyAssessmentScheduler.ts';
import type {SchedulerDiagnostic} from './schedulerDiagnostic.ts';
export const SCHEDULER_RPC_RELEASE=Object.freeze({enabled:true} as const);
export interface InternalServiceRpc{rpc(name:string,args:{p_request:Record<string,unknown>}):PromiseLike<{data:unknown;error:unknown}>;}
type State={record:DailyRecord|null;hold:UncertainHold|null};
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const stamp=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=253402214400000;
export function schedulerRpcRequest(action:'load'|'claim'|'complete'|'uncertain'|'reconcile',scope:ScheduleScope,extra:Record<string,unknown>={}):Record<string,unknown>{
 if(!scope||!uuid(scope.ownerId)||!/^[a-f0-9]{64}$/.test(scope.contextRevision)||typeof scope.timezone!=='string'||!scope.timezone||scope.timezone.length>100)throw Error('invalid_scope');
 const allowed=action==='claim'?['expectedRevision','claimId','localDate','key']:action==='complete'?['expectedRevision','claimId','key','diagnostic','reason']:action==='load'?[]:['expectedRevision','claimId','key'];
 if(!['load','claim','complete','uncertain','reconcile'].includes(action)||Object.keys(extra).some(k=>!allowed.includes(k)))throw Error('invalid_rpc_fields');
 if(action!=='load'&&(!Number.isSafeInteger(extra.expectedRevision)||Number(extra.expectedRevision)<0||Number(extra.expectedRevision)>9007199254740988||!uuid(extra.claimId)||typeof extra.key!=='string'))throw Error('invalid_transition');
 if(action==='claim'&&(typeof extra.localDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(extra.localDate)))throw Error('invalid_calendar');
 if(action==='complete'&&(!['uncertain','resolved','preserve'].includes(String(extra.diagnostic))||typeof extra.reason!=='string'||extra.reason.length>128))throw Error('invalid_diagnostic');
 return {action,ownerId:scope.ownerId,contextRevision:scope.contextRevision,timezone:scope.timezone,...extra};
}
/** Strict boundary parser; a successful HTTP response is not successful storage. */
export function parseSchedulerRpc(data:unknown,scope:ScheduleScope):State{
 if(!data||typeof data!=='object')throw Error('invalid_rpc_response');
 const d=data as Record<string,unknown>;
 if(d.version!=='scheduler-rpc-v1'||d.status!=='ok'||!('record'in d)||!('hold'in d))throw Error('rpc_blocked_or_invalid');
 const r=d.record as DailyRecord|null,h=d.hold as UncertainHold|null;
 if(r!==null){
  if(!r||r.version!=='daily-assessment-ledger-v1'||r.ownerId!==scope.ownerId||r.contextRevision!==scope.contextRevision||r.timezone!==scope.timezone||
  !Number.isSafeInteger(r.revision)||r.revision<1||r.revision>=Number.MAX_SAFE_INTEGER||!uuid(r.claimId)||!stamp(r.claimedAt)||
  !['claimed','completed','uncertain','retryable'].includes(r.status)||!/^\d{4}-\d{2}-\d{2}$/.test(r.localDate)||
  r.key!==JSON.stringify(['daily-assessment-v1',r.ownerId,r.contextRevision,r.localDate])||
  (r.status==='claimed'?r.finishedAt!==null:!stamp(r.finishedAt)||r.finishedAt<r.claimedAt))throw Error('invalid_rpc_record');
 }
 if(h!==null&&(!h||!stamp(h.assessedAt)||!stamp(h.reevaluateAt)||h.reevaluateAt!==h.assessedAt+604800000))throw Error('invalid_rpc_hold');
 if(r===null&&h!==null)throw Error('orphan_hold');return {record:r,hold:h};
}
/** Uses existing server-created service client. No new DB credential/table access.
 * No retries after transport uncertainty: reconcile against durable receipt. */
export function createSchedulerRpcStorage(client:InternalServiceRpc){
 const gate=()=>{if(!SCHEDULER_RPC_RELEASE.enabled)throw Error('safety_review_required');};
 async function call(scope:ScheduleScope,request:Record<string,unknown>){
  gate();const result=await client.rpc('tdee_scheduler_internal_v1',{p_request:request});
  if(!result||result.error)throw Error('storage_outcome_unknown');return parseSchedulerRpc(result.data,scope);
 }
 const load=(scope:ScheduleScope)=>{gate();return call(scope,schedulerRpcRequest('load',scope));};
 async function mutate(action:'complete'|'uncertain'|'reconcile',scope:ScheduleScope,claimId:string,diagnostic?:SchedulerDiagnostic){
  gate();const state=await load(scope),r=state.record;
  if(!r||r.claimId!==claimId)throw Error('claim_not_current');
  const extra:Record<string,unknown>={expectedRevision:r.revision,claimId,key:r.key};
  if(action==='complete'){if(!diagnostic)throw Error('verified_diagnostic_required');extra.diagnostic=diagnostic.kind;extra.reason=diagnostic.reason;}
  const next=await call(scope,schedulerRpcRequest(action,scope,extra));
  if(!next.record||next.record.claimId!==claimId||next.record.key!==r.key||
   (action!=='reconcile'&&next.record.revision!==r.revision+1)||
   (action==='complete'&&next.record.status!=='completed')||(action==='uncertain'&&next.record.status!=='uncertain')||
   (action==='reconcile'&&!['completed','retryable'].includes(next.record.status)))throw Error('storage_outcome_unknown');
  return next;
 }
 return {load,
  async claim(plan:DailyPlan,expectedRevision:number,claimId:string){gate();
   const state=await call(plan,schedulerRpcRequest('claim',plan,{expectedRevision,claimId,localDate:plan.localDate,key:plan.key}));
   if(!state.record||state.record.claimId!==claimId||state.record.key!==plan.key||state.record.status!=='claimed'||state.record.revision!==expectedRevision+1)throw Error('storage_outcome_unknown');
   return {status:'claimed' as const,claimId};},
  complete:(scope:ScheduleScope,claimId:string,diagnostic:SchedulerDiagnostic)=>mutate('complete',scope,claimId,diagnostic),
  uncertain:(scope:ScheduleScope,claimId:string)=>mutate('uncertain',scope,claimId),
  reconcile:(scope:ScheduleScope,claimId:string)=>mutate('reconcile',scope,claimId),
 };
}

/** Bridges RPC persistence to the existing typed scheduler, no direct-PG driver. */
export function createRpcDailySchedulerPorts(client:InternalServiceRpc,bindings:{
 loadInput():Promise<import('./dailyAssessmentScheduler.ts').AssessmentInput>;
 evaluateSnapshot(plan:DailyPlan,claimId:string):Promise<AssessedSnapshot>;
 now():number;
 newClaimId():string;
}):import('./dailyAssessmentScheduler.ts').DailySchedulerPorts{
 const store=createSchedulerRpcStorage(client);
 const gate=()=>{if(!SCHEDULER_RPC_RELEASE.enabled)throw Error('safety_review_required');};
 return {
  async loadOwnContext(){gate();const input=await bindings.loadInput(),state=await store.load(input);
   return {input:{...input,hold:state.hold},record:state.record};},
  async claim(plan,revision){gate();return store.claim(plan,revision,bindings.newClaimId());},
  async evaluateReadOnly(plan,claimId){gate();const assessment=await bindings.evaluateSnapshot(plan,claimId);return diagnosticFromAssessment(assessment,plan.plannedAt,bindings.now());},
  async complete(plan,claimId,outcome,diagnostic){gate();
   if(outcome==='uncertain'){await store.uncertain(plan,claimId);return;}
   if(!diagnostic)throw Error('verified_diagnostic_required');await store.complete(plan,claimId,diagnostic);
  },
 };
}
