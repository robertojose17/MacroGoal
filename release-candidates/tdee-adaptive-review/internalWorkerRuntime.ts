import {createInternalRules14Runtime} from './rules14Runtime.ts';
import {createInternalRateIssuance} from './rateIssuanceRuntime.ts';
/** Final composition candidate; no runtime activation or credentials provisioned. */
import {createInternalDailyWorker,INTERNAL_DAILY_WORKER_RELEASE,isInternalWorkerAuthorized,type WorkerSelection} from './internalDailyWorker.ts';
import {createInternalSelectorPorts} from './internalSelectorAdapter.ts';
import {createInternalProviderRefresh,createInternalProviderRevalidator,type ProviderProof} from './internalProviderRefresh.ts';
import {createSchedulerRpcStorage,parseSchedulerRpc,type InternalServiceRpc} from './schedulerRpcStorage.ts';
import {planDailyAssessment,revalidateClaimedAssessment,DAILY_SCHEDULER_RELEASE_STATE,type AssessmentInput,type DailyPlan,type DailyRecord,type UncertainHold} from './dailyAssessmentScheduler.ts';
import {assessFourteenDaySnapshotReview,assessFourteenDayObservedSnapshotReview} from './snapshotReviewContextParser.ts';
import {diagnosticFromAssessment,type SchedulerDiagnostic} from './schedulerDiagnostic.ts';
export const INTERNAL_RATE_POLICY_BINDING:null|{version:string;digest:string;engineVersion:string}=null;
export const INTERNAL_WORKER_RUNTIME_RELEASE=Object.freeze({enabled:true} as const);
type Obj=Record<string,any>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
export interface ServiceRpcBuilder extends PromiseLike<{data:unknown;error:unknown}>{abortSignal(signal:AbortSignal):ServiceRpcBuilder;}
export interface ExistingServiceClient{rpc(name:string,args:Record<string,unknown>):ServiceRpcBuilder;}
export type WorkerRuntimeBootstrap={
 /** Already injected existing key, never HTTP input. Never logged or returned. */
 serviceRoleKey?:string;
 recommendationEngine?:'rules14-observed-v2'|'rate-review-14d-v1';
 rulesPolicy?:{version:string;revision:number;digest:string;engineVersion:string}|null;
 /** Exact trusted deployment binding; no fallback/latest policy selection. */
 ratePolicy?:{version:string;digest:string;engineVersion:string}|null;
 createExistingServiceClient():ExistingServiceClient;
 getExistingV2Key():string|undefined;
 request:typeof fetch;
 now?:()=>number;
};
export type ReviewStorage={
 load(scope:AssessmentInput):Promise<{record:DailyRecord|null;hold:UncertainHold|null}>;
 claim(plan:DailyPlan,revision:number,claimId:string):Promise<{status:'claimed';claimId:string}>;
 complete(scope:DailyPlan,claimId:string,diagnostic:SchedulerDiagnostic):Promise<unknown>;
 uncertain(scope:DailyPlan,claimId:string):Promise<unknown>;
};
export type WorkerAssessmentReviewPorts={
 revalidate(selection:WorkerSelection,proof:ProviderProof,deadline:number,signal:AbortSignal):Promise<ProviderProof>;
 loadContext(ownerId:string,signal:AbortSignal):Promise<unknown>;
 assessmentMode?:'observed-v2'|'legacy-v1';
 storage:ReviewStorage;now():number;newClaimId():string;
 reconcileIssued?(scope:AssessmentInput,record:DailyRecord):Promise<boolean>;
 issueRateProposal?(ownerId:string,proposalId:string):Promise<{reason:string;proposal:unknown;mayHaveWritten:boolean;baselineStatus?:'stored';engineVersion?:string}>;
};
function clock(ports:WorkerAssessmentReviewPorts,deadline:number,signal:AbortSignal){const t=ports.now();if(!Number.isSafeInteger(t)||t<0||signal.aborted||t>=deadline)throw Error('worker_deadline');return t;}
/** Pure context envelope check, never converts caller claims into server authority. */
export function workerAssessmentInput(raw:unknown,selection:WorkerSelection,proof:ProviderProof,now:number):AssessmentInput{
 if(!obj(raw)||raw.version!=='snapshot-review-context-v1'||raw.actor!==selection.ownerId||raw.actionable!==false||raw.evidenceStatus!=='unverified'||
 !obj(raw.profile)||raw.profile.id!==selection.ownerId||typeof raw.profile.timezone!=='string'||
 !obj(raw.observation)||raw.observation.ownerId!==selection.ownerId||!obj(raw.observation.context)||raw.observation.context.ownerId!==selection.ownerId||
 raw.observation.context.enabled!==true||raw.observation.context.premium!==true||raw.capturedAt!==raw.observation.capturedAt||
 !Number.isFinite(Date.parse(raw.capturedAt))||Date.parse(raw.capturedAt)>now||now-Date.parse(raw.capturedAt)>30000||
 proof.ownerId!==selection.ownerId||proof.contextRevision!==selection.contextRevision||proof.active!==true||proof.revoked!==false||proof.expiresAt<=now)
 throw Error('worker_context_unavailable');
 const last=raw.anchor?.last_accepted_at;
 const lastAcceptedAt=last===undefined||last===null?null:Date.parse(last);
 if(lastAcceptedAt!==null&&(!Number.isSafeInteger(lastAcceptedAt)||lastAcceptedAt>now))throw Error('invalid_acceptance_time');
 return {...selection,expectedOwnerId:selection.ownerId,timezone:raw.profile.timezone,now,observationEnabled:true,currentAccessVerified:true,sourceBindingVerified:true,lastAcceptedAt,hold:null};
}
/** Unmounted review-core seam. Tests inject synthetic ports, not enabled switches.
 * Runtime below separately guards ALL use. No user auth/sub claims are created. */
export async function runWorkerAssessmentForReview(ports:WorkerAssessmentReviewPorts,selection:WorkerSelection,proof:ProviderProof,deadline:number,signal:AbortSignal):Promise<'completed'|'skipped'|'reconcile'>{
 let claimed:DailyPlan|undefined,claimId:string|undefined;
 const context=async()=>{
  clock(ports,deadline,signal);const verified=await ports.revalidate(selection,proof,deadline,signal);
  const raw=await ports.loadContext(selection.ownerId,signal);
  // A scope, cache or registry change during the context read invalidates it.
  const after=await ports.revalidate(selection,verified,deadline,signal),now=clock(ports,deadline,signal);
  return {raw,input:workerAssessmentInput(raw,selection,after,now)};
 };
 try{
  const initial=await context(),state=await ports.storage.load(initial.input);
  const candidate=planDailyAssessment({...initial.input,hold:state.hold},state.record);
  if(candidate.kind!=='assessment_plan'){
   if(candidate.kind==='reconcile'&&candidate.reason==='unfinished_assessment'&&state.record&&ports.reconcileIssued){
    const recovered=await ports.reconcileIssued(initial.input,state.record);
    await ports.revalidate(selection,proof,deadline,signal);clock(ports,deadline,signal);
    if(recovered)return 'completed';
   }
   return candidate.kind==='reconcile'?'reconcile':'skipped';
  }
  await ports.revalidate(selection,proof,deadline,signal);clock(ports,deadline,signal);
  claimId=ports.newClaimId();const receipt=await ports.storage.claim(candidate,state.record?.revision??0,claimId);
  if(receipt.status!=='claimed'||receipt.claimId!==claimId)throw Error('claim_not_current');claimed=candidate;
  const fresh=await context(),latest=await ports.storage.load(fresh.input);
  const current=revalidateClaimedAssessment({...fresh.input,hold:latest.hold},latest.record,claimId);
  if(current.kind!=='assessment_plan')return 'reconcile';claimed=current;
  // Use the real fourteen-day diagnostic, never the legacy21-day estimator.
  const assessedAt=clock(ports,deadline,signal),result=(ports.assessmentMode==='observed-v2'?assessFourteenDayObservedSnapshotReview:assessFourteenDaySnapshotReview)(fresh.raw,selection.ownerId,assessedAt);
  await ports.revalidate(selection,proof,deadline,signal);
  let diagnostic=diagnosticFromAssessment({assessedAt,result},current.plannedAt,clock(ports,deadline,signal));
  if(ports.issueRateProposal&&(!latest.hold||assessedAt>=latest.hold.reevaluateAt)){
   await ports.revalidate(selection,proof,deadline,signal);clock(ports,deadline,signal);
   const issued=await ports.issueRateProposal(selection.ownerId,claimId);
   const baselineStored=issued.reason==='calibration_required'&&issued.baselineStatus==='stored'&&issued.engineVersion==='rules14-observed-v2'&&issued.proposal===null;
   if(issued.mayHaveWritten&&issued.reason!=='review_available'&&!baselineStored)throw Error('issuance_outcome_unknown');
   if(baselineStored)diagnostic={kind:'preserve',reason:'calibration_required'};
   if(issued.reason==='review_available'){
    const proposal=issued.proposal as {id?:unknown;ownerId?:unknown;version?:unknown}|null;
    if(!proposal||proposal.id!==claimId||proposal.ownerId!==selection.ownerId)throw Error('issuance_receipt_mismatch');
    diagnostic={kind:'resolved',reason:proposal.version==='rules14-proposal-record-v1'?'rules14_proposal_stored':'reviewed_proposal_stored'};
   }
   await ports.revalidate(selection,proof,deadline,signal);clock(ports,deadline,signal);
  }
  await ports.storage.complete(current,claimId,diagnostic);return 'completed';
 }catch{
  // Unknown write outcome is reconciled using durable receipts; no blind replay.
  if(claimed&&claimId&&!signal.aborted){try{await ports.storage.uncertain(claimed,claimId);}catch{/* durable reconciliation required */}}
  return 'reconcile';
 }
}
/** Reconcile an interrupted assessment from authoritative SQL evidence only.
 * A current-baseline outcome is desired-state verification, not writer attribution.
 * A missing/changed/older anchor cannot produce this server evidence. */
export async function reconcileAssessmentOutcomeForReview(scope:AssessmentInput,record:DailyRecord,rules14:boolean,rpc:(name:string,args:Record<string,unknown>)=>Promise<unknown>):Promise<boolean>{
 const args={p_owner:scope.ownerId,p_scope:scope.contextRevision,p_claim:record.claimId,p_revision:record.revision};
 const verified=(data:unknown,version:string,status:string)=>{
  try {const parsed=parseSchedulerRpc(data,scope),e=(data as Obj).evidence;
   return !!parsed.record&&parsed.record.status==='completed'&&parsed.record.claimId===record.claimId&&obj(e)&&e.version===version&&e.status===status&&e.actionable===false&&e.ownerId===scope.ownerId&&e.contextRevision===scope.contextRevision&&e.claimId===record.claimId;
  }catch{return false;}
 };
 // Never continue after transport uncertainty: the first reconciliation may write.
 const issued=await rpc('tdee_internal_rate_issue_outcome_v1',args);
 if(verified(issued,'rate-issuance-outcome-v1','historically_prepared'))return true;
 if(!rules14||!obj(issued)||issued.status!=='unverified'||issued.actionable!==false)return false;
 const baseline=await rpc('tdee_internal_rules14_anchor_outcome_v1',args);
 return verified(baseline,'rules14-anchor-outcome-v1','current_baseline_verified');
}
const disabled=()=>new Response(JSON.stringify({version:'internal-daily-worker-v1',result:'disabled'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
/** Existing service factory is deferred until runtime ON and exact internal auth. */
export function createInternalWorkerRuntime(bootstrap:WorkerRuntimeBootstrap){
 return async(request:Request):Promise<Response>=>{
  if(!INTERNAL_WORKER_RUNTIME_RELEASE.enabled||!INTERNAL_DAILY_WORKER_RELEASE.enabled||!DAILY_SCHEDULER_RELEASE_STATE.enabled)return disabled();
  try{
   if(!await isInternalWorkerAuthorized(request.headers.get('authorization'),bootstrap.serviceRoleKey))return new Response(null,{status:401});
   const client=bootstrap.createExistingServiceClient(),now=bootstrap.now??Date.now;
   const serviceRpc=async(name:string,args:Record<string,unknown>,signal:AbortSignal)=>{
    if(signal.aborted)throw Error('worker_aborted');
    const response=await client.rpc(name,args).abortSignal(signal);
    if(response.error)throw Error('service_rpc_failed');if(signal.aborted)throw Error('worker_aborted');return response.data;
   };
   const selector=createInternalSelectorPorts({serviceRpc,now});
   const providerPorts={readCurrentSelection:selector.readCurrentSelection,serviceRpc,getExistingV2Key:bootstrap.getExistingV2Key,request:bootstrap.request,now};
   const refresh=createInternalProviderRefresh(providerPorts),revalidate=createInternalProviderRevalidator(providerPorts);
   const run=createInternalDailyWorker({serviceRoleKey:bootstrap.serviceRoleKey},{...selector,refreshProviderProof:refresh,now,
    async runOwnAssessment(selection,proof,deadline,signal){
     const scopedRpc:InternalServiceRpc={rpc:(name,args)=>client.rpc(name,args).abortSignal(signal)};
     const storage=createSchedulerRpcStorage(scopedRpc);
     return runWorkerAssessmentForReview({storage,now,assessmentMode:bootstrap.recommendationEngine==='rules14-observed-v2'?'observed-v2':'legacy-v1',reconcileIssued:async(scope,record)=>{
      return reconcileAssessmentOutcomeForReview(scope,record,bootstrap.recommendationEngine==='rules14-observed-v2',(name,args)=>serviceRpc(name,args,signal));
     },issueRateProposal:(ownerId,proposalId)=>bootstrap.recommendationEngine==='rules14-observed-v2'?createInternalRules14Runtime({rpc:(name,args)=>serviceRpc(name,args,signal),now,newProposalId:()=>proposalId,expectedPolicy:bootstrap.rulesPolicy??null})(ownerId):createInternalRateIssuance({rpc:(name,args)=>serviceRpc(name,args,signal),now,newProposalId:()=>proposalId,expectedPolicy:bootstrap.ratePolicy!})(ownerId),newClaimId:()=>crypto.randomUUID(),revalidate,
      loadContext:(ownerId,signal)=>serviceRpc(bootstrap.recommendationEngine==='rules14-observed-v2'?'tdee_internal_observed_context_v1':'tdee_internal_context_v1',{p_owner:ownerId},signal)},selection,proof as ProviderProof,deadline,signal);
    },
   });
   return await run(request);
  }catch{return new Response(JSON.stringify({result:'internal_worker_unavailable'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});}
 };
}


