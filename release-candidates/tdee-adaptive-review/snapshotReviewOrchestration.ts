/** Server-only candidate. Pure state machine plus immutable-OFF interpreter.
 * Not mounted in GET/HTTP. No policy, calibration or release defaults.
 * Enabled async execution is unverified; pure command tests are not live E2E proof.
 */
import {ADAPTIVE_RELEASE_STATE} from './proposal.ts';
import {SNAPSHOT_ENGINE_CONTRACT,assessFourteenDaySnapshotReview,parseSnapshotReviewContext,prepareSnapshotMacroContextRequest,type SnapshotMacroRequest} from './snapshotReviewContextParser.ts';
import {planSnapshotBootstrap} from './snapshotBootstrapPlanner.ts';
import {planSnapshotEligibilityRefresh} from './snapshotEligibilityRefreshPlanner.ts';
import {prepareSnapshotProposal,validatePersistedSnapshotProposal} from './snapshotProposalProducer.ts';
import type {ProposalRecord} from './proposalProducer.ts';
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a:unknown,b:unknown):boolean=>a===b||(obj(a)&&obj(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
/** Server-selected version only; never read from request payload. */
export const INITIAL_RATE_ENGINE_VERSION='rate-review-14d-v1';
export type ServerPolicyBinding={version:string;digest:string;engineVersion:string};
type Outcome={reason:string;proposal:unknown;mayHaveWritten:boolean};
type Phase='read_policy'|'load_context'|'write_bootstrap'|'write_refresh'|'reload_context'|'load_macro'|'issue'|'done';
export type SnapshotWorkflow={phase:Phase;actor:string;proposalId:string;binding:ServerPolicyBinding;policy?:Obj;plan?:Obj;
 branch?:'bootstrap'|'refresh';writer?:Obj;record?:ProposalRecord;outcome?:Outcome;macroRequest?:SnapshotMacroRequest;macroRaw?:unknown};
const done=(s:SnapshotWorkflow,reason:string,mayHaveWritten=false,proposal:unknown=null):SnapshotWorkflow=>
 ({...s,phase:'done',outcome:{reason,proposal,mayHaveWritten}});
const policyMatches=(p:unknown,b:ServerPolicyBinding)=>obj(p)&&p.version===b.version&&p.digest===b.digest&&p.engine_version===b.engineVersion;
/** Pure commands are test artifacts, not permissions to execute network actions. */
export function beginSnapshotWorkflow(actor:string,proposalId:string,binding:ServerPolicyBinding):SnapshotWorkflow{
 const s:SnapshotWorkflow={phase:'read_policy',actor,proposalId,binding:structuredClone(binding)};
 if(!uuid(actor)||!uuid(proposalId))return done(s,'authentication_required');
 if(!binding||typeof binding.version!=='string'||!binding.version||!hash(binding.digest)||
 ![SNAPSHOT_ENGINE_CONTRACT.engineVersion,INITIAL_RATE_ENGINE_VERSION].includes(binding.engineVersion))return done(s,'server_policy_required');
 return s;
}
/** Each successful writer must cross reload_context; its return is never source evidence. */
export function advanceSnapshotWorkflow(state:SnapshotWorkflow,result:{ok:boolean;value?:unknown},now:number):SnapshotWorkflow{
 const s=structuredClone(state);
 if(s.phase==='done')return s;
 const writing=s.phase==='write_bootstrap'||s.phase==='write_refresh'||s.phase==='issue';
 if(result.ok!==true)return done(s,writing?'reconciliation_required':'source_error',writing||s.phase==='reload_context'||s.phase==='load_macro');
 if(!Number.isFinite(now))return done(s,'source_error',writing||s.phase==='reload_context'||s.phase==='load_macro');
 const v=result.value;
 try{
 if(s.phase==='read_policy'){
  if(!policyMatches(v,s.binding)||!obj(v)||v.enabled!==true||v.reviewed!==true||v.snapshot_contract_reviewed!==true||
   typeof v.expires_at!=='string'||!Number.isFinite(Date.parse(v.expires_at))||Date.parse(v.expires_at)<=now)return done(s,'server_policy_required');
  return {...s,phase:'load_context',policy:structuredClone(v)};
 }
 if(s.phase==='load_context'){
  if(!obj(v)||v.actor!==s.actor)return done(s,'account_changed');
  if(s.binding.engineVersion===INITIAL_RATE_ENGINE_VERSION){
   // Separate initial14d contract: no legacy expenditure substitution, no fallback
   // to21d, bootstrap, refresh or issue while uncertainty remains unverified.
   const assessment=assessFourteenDaySnapshotReview(v,s.actor,now);
   return done(s,assessment.reason,false);
  }
  let plan;
  if(v.anchor===null){
   plan=planSnapshotBootstrap(v,s.actor,s.policy,now);
   if(plan.kind==='blocked')return done(s,plan.reason);
   return {...s,phase:'write_bootstrap',branch:'bootstrap',plan:structuredClone(plan)};
  }
  if(!policyMatches(v.policy,s.binding))return done(s,'policy_changed');
  plan=planSnapshotEligibilityRefresh(v,s.actor,now);
  if(plan.kind==='blocked')return done(s,plan.reason);
  return {...s,phase:'write_refresh',branch:'refresh',plan:structuredClone(plan)};
 }
 if(s.phase==='write_bootstrap'||s.phase==='write_refresh'){
  if(!obj(v)||v.actionable!==false||!uuid(v.anchorId))return done(s,'reconciliation_required',true);
  if(s.phase==='write_bootstrap'){
   if(v.version!=='snapshot-bootstrap-v1'||!['created','existing'].includes(v.status as string))return done(s,'reconciliation_required',true);
  }else{
   if(v.version!=='snapshot-eligibility-refresh-v1'||v.status!=='refreshed'||v.ownerId!==s.actor||
    v.anchorId!==s.plan?.anchorId||!hash(v.eligibilityDigest))return done(s,'reconciliation_required',true);
  }
  return {...s,phase:'reload_context',writer:structuredClone(v)};
 }
 if(s.phase==='reload_context'){
  if(!obj(v)||v.actor!==s.actor)return done(s,'account_changed',true);
  const p=s.plan,a=v.anchor;
  if(!p||!obj(v.profile)||v.profile.updatedAt!==p.expectedProfileUpdatedAt||!same(v.currentGoal,p.expectedGoalSnapshot)||
   !obj(v.readiness)||v.readiness.journeyBinding!==p.journeyBinding||!obj(a)||a.id!==s.writer?.anchorId||
   !policyMatches(v.policy,s.binding))return done(s,'reload_binding_changed',true);
  // Validate refreshed raw evidence/chain without fabricating eligibility flags.
  const checked=planSnapshotEligibilityRefresh(v,s.actor,now);
  if(checked.kind==='blocked')return done(s,checked.reason,true);
  if(s.branch==='bootstrap'){
   if(!obj(p.baseline)||a.baseline_intake_kcal!==p.baseline.intakeKcal||a.baseline_expenditure_kcal!==p.baseline.expenditureKcal||
    Date.parse(a.baseline_captured_at as string)!==Date.parse(p.baseline.capturedAt as string)||
    !same(a.baseline_goal_snapshot,p.expectedGoalSnapshot)||a.accepted_delta_kcal!==0||a.last_accepted_at!==null)
    return done(s,'reload_baseline_changed',true);
   return done(s,'calibration_required',true);
  }
  if(!same(a,p.expectedAnchorSnapshot)||!obj(v.eligibility)||v.eligibility.digest!==s.writer?.eligibilityDigest)
   return done(s,'reload_binding_changed',true);
  const parsed=parseSnapshotReviewContext(v,s.actor,s.proposalId,now);
  if(parsed.kind==='blocked'){
   if(parsed.reason!=='macro_context_required')return done(s,parsed.reason,true);
   const requested=prepareSnapshotMacroContextRequest(v,s.actor,s.proposalId,now);
   if(requested.kind==='blocked')return done(s,requested.reason,true);
   return {...s,phase:'load_macro',macroRequest:structuredClone(requested.request),macroRaw:structuredClone(v)};
  }
  const prepared=prepareSnapshotProposal(parsed.input,parsed.binding);
  if(prepared.kind!=='prepared')return done(s,prepared.reason,true);
  return {...s,phase:'issue',record:structuredClone(prepared.record)};
 }
 if(s.phase==='load_macro'){
  if(!s.macroRequest||!s.macroRaw)return done(s,'macro_context_required',true);
  const requested=prepareSnapshotMacroContextRequest(s.macroRaw,s.actor,s.proposalId,now);
  if(requested.kind==='blocked')return done(s,requested.reason,true);
  if(!same(requested.request,s.macroRequest))return done(s,'macro_evidence_binding_mismatch',true);
  const parsed=parseSnapshotReviewContext(s.macroRaw,s.actor,s.proposalId,now,v);
  if(parsed.kind==='blocked')return done(s,parsed.reason,true);
  const prepared=prepareSnapshotProposal(parsed.input,parsed.binding);
  if(prepared.kind!=='prepared')return done(s,prepared.reason,true);
  return {...s,phase:'issue',record:structuredClone(prepared.record),macroRaw:undefined,macroRequest:undefined};
 }
 if(s.phase==='issue'){
  if(!s.record)return done(s,'source_error',true);
  return done(s,'review_available',true,validatePersistedSnapshotProposal(s.record,v,now));
 }
 return done(s,'source_error');
 }catch{return done(s,writing?'reconciliation_required':'source_error',writing||s.phase==='reload_context'||s.phase==='load_macro');}
}
export interface SnapshotOrchestrationPorts{
 verifyAccessToken(token:string):Promise<{id:string}|null>;
 readPolicyExact(binding:ServerPolicyBinding):Promise<unknown>;
 loadOwnContext(token:string):Promise<unknown>;
 // Optional trusted-server evidence store. No raw request flags or fabricated records.
 loadReviewedMacroContext?(actor:string,request:SnapshotMacroRequest,token:string):Promise<unknown>;
 bootstrapAsService(record:Obj):Promise<unknown>;
 refreshAsService(record:Obj):Promise<unknown>;
 issueAsService(record:ProposalRecord):Promise<unknown>;
 now?:()=>number;newProposalId?:()=>string;
}
export function createSnapshotReviewOrchestrator(ports:SnapshotOrchestrationPorts,binding:ServerPolicyBinding){
 const configured=structuredClone(binding);
 return async(request:unknown):Promise<Outcome>=>{
  if(!obj(request)||Object.keys(request).length!==1||typeof request.authorization!=='string'||
   request.authorization.length>16384||!/^Bearer [^\s]+$/.test(request.authorization))
   return {reason:'invalid_request',proposal:null,mayHaveWritten:false};
  if(!ADAPTIVE_RELEASE_STATE.recommendationsEnabled)return {reason:'safety_review_required',proposal:null,mayHaveWritten:false};
  const token=request.authorization.slice(7);
  let actor;
  try{actor=await ports.verifyAccessToken(token);}catch{return {reason:'authentication_required',proposal:null,mayHaveWritten:false};}
  if(!actor||!uuid(actor.id))return {reason:'authentication_required',proposal:null,mayHaveWritten:false};
  let state:SnapshotWorkflow;
  try{state=beginSnapshotWorkflow(actor.id,(ports.newProposalId??(()=>crypto.randomUUID()))(),configured);}
  catch{return {reason:'source_error',proposal:null,mayHaveWritten:false};}
  // Finite sequence, no retry or hidden rebootstrap after uncertainty.
  for(let steps=0;state.phase!=='done'&&steps<7;steps++){
   let result:{ok:boolean;value?:unknown};
   try{
    const value=state.phase==='read_policy'?await ports.readPolicyExact({version:configured.version,digest:configured.digest,engineVersion:configured.engineVersion}):
     state.phase==='load_context'||state.phase==='reload_context'?await ports.loadOwnContext(token):
     state.phase==='write_bootstrap'?await ports.bootstrapAsService(structuredClone(state.plan!)):
     state.phase==='write_refresh'?await ports.refreshAsService(structuredClone(state.plan!)):
     state.phase==='load_macro'?(ports.loadReviewedMacroContext?await ports.loadReviewedMacroContext(actor.id,structuredClone(state.macroRequest!),token):null):
     state.phase==='issue'?await ports.issueAsService(structuredClone(state.record!)):
     await Promise.reject(new Error('invalid_workflow_phase'));
    result={ok:true,value};
   }catch{result={ok:false};}
   let now:number;try{now=(ports.now??Date.now)();}catch{now=NaN;}
   state=advanceSnapshotWorkflow(state,result,now);
  }
  return state.outcome??{reason:'source_error',proposal:null,mayHaveWritten:true};
 };
}
