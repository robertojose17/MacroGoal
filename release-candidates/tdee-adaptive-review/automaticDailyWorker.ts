import {isInternalWorkerAuthorized,validWorkerEnvelope,validateWorkerSelection,type WorkerSelection} from './internalDailyWorker.ts';
import {planDailyAssessment,type AssessmentInput,type DailyPlan,type DailyRecord,type UncertainHold} from './dailyAssessmentScheduler.ts';
import type {SchedulerDiagnostic} from './schedulerDiagnostic.ts';

type Signal=AbortSignal;
// Keep a two-second margin under the production scheduler's 10s HTTP timeout.
const AUTOMATIC_DAILY_RUN_MS=8000;
const AUTOMATIC_SELECTOR_RUN_MS=5000;
export type AutomaticAttention={kind:'attention'|'none';reason:string;actionable:false};
export interface AutomaticDailyPorts {
 selectDueOwners(limit:number,deadline:number,signal:Signal):Promise<WorkerSelection[]>;
 readCurrentSelection(selection:WorkerSelection,signal:Signal):Promise<unknown>;
 loadContext(owner:string,signal:Signal):Promise<unknown>;
 evaluate(owner:string,now:number,signal:Signal):Promise<AutomaticAttention>;
 storage:{
  load(scope:AssessmentInput):Promise<{record:DailyRecord|null;hold:UncertainHold|null}>;
  recordComplete(plan:DailyPlan,revision:number,claimId:string,diagnostic:SchedulerDiagnostic,evaluatedAt:number):Promise<void>;
 };
 now():number;newClaimId():string;
}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** This is analysis authorization, deliberately NOT a Premium ProviderProof. */
export function automaticAssessmentInput(raw:unknown,s:WorkerSelection,now:number):AssessmentInput {
 if(!object(raw)||raw.version!=='snapshot-review-context-v1'||raw.actor!==s.ownerId||raw.actionable!==false||
 !object(raw.profile)||raw.profile.id!==s.ownerId||typeof raw.profile.timezone!=='string'||
 !object(raw.observation)||raw.observation.ownerId!==s.ownerId||!object(raw.observation.context)||
 raw.observation.context.ownerId!==s.ownerId||raw.observation.context.analysisMode!=='automatic-v1'||
 typeof raw.observation.context.premium!=='boolean'||raw.capturedAt!==raw.observation.capturedAt||
 !Number.isFinite(Date.parse(raw.capturedAt))||Date.parse(raw.capturedAt)>now||now-Date.parse(raw.capturedAt)>30000)
 throw Error('automatic_context_unverified');
 const last=raw.anchor?.last_accepted_at,accepted=last==null?null:Date.parse(last);
 if(accepted!==null&&(!Number.isSafeInteger(accepted)||accepted>now))throw Error('invalid_acceptance_time');
 return {...s,expectedOwnerId:s.ownerId,timezone:raw.profile.timezone,now,observationEnabled:true,
 currentAccessVerified:false,automaticAnalysisVerified:true,sourceBindingVerified:true,lastAcceptedAt:accepted,hold:null};
}
/** No target/anchor/proposal writes or notifications. Only existing daily ledger CAS. */
export async function runAutomaticAssessment(p:AutomaticDailyPorts,s:WorkerSelection,deadline:number,signal:Signal):Promise<'completed'|'skipped'|'reconcile'>{
 const time=()=>{const n=p.now();if(!Number.isSafeInteger(n)||n<0||n>=deadline||signal.aborted)throw Error('worker_deadline');return n;};
 let stage='selection';
 const context=async()=>{stage='selection';time();await p.readCurrentSelection(s,signal);stage='context';const raw=await p.loadContext(s.ownerId,signal);stage='selection_recheck';await p.readCurrentSelection(s,signal);return automaticAssessmentInput(raw,s,time());};
 try {
  const input=await context();stage='ledger_read';const state=await p.storage.load(input),candidate=planDailyAssessment({...input,hold:state.hold},state.record);
  if(candidate.kind!=='assessment_plan')return candidate.kind==='reconcile'?'reconcile':'skipped';
  // Read-only evaluation precedes persistence. A crash cannot leave a new claim.
  stage='evaluation';const evaluatedAt=time(),result=await p.evaluate(s.ownerId,evaluatedAt,signal);
  if(!result||!['attention','none'].includes(result.kind)||result.actionable!==false||typeof result.reason!=='string'||result.reason.length>100)throw Error('invalid_analysis');
  const fresh=await context();stage='ledger_recheck';const latest=await p.storage.load(fresh),current=planDailyAssessment({...fresh,hold:latest.hold},latest.record);
  if(current.kind!=='assessment_plan')return current.kind==='reconcile'?'reconcile':'skipped';
  if(current.key!==candidate.key||(latest.record?.revision??0)!==(state.record?.revision??0))return 'reconcile';
  stage='final_selection';await p.readCurrentSelection(s,signal);time();
  stage='ledger_complete';
  // Service RPC claims and completes under one transaction using the existing CAS.
  // Failure rolls back both; unknown transport is reconciled by the next read only.
  await p.storage.recordComplete(current,latest.record?.revision??0,p.newClaimId(),{kind:'preserve',reason:result.kind==='attention'?'automatic_attention_ready':result.reason},evaluatedAt);
  return 'completed';
 }catch{console.warn('[tdee-auto-worker] assessment deferred',{stage,deadline_exceeded:signal.aborted||p.now()>=deadline});return 'reconcile';}
}

async function readEnvelope(request:Request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json'||!request.body)throw Error('invalid_body');
 const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>256)throw Error('body_too_large');text+=decoder.decode(r.value,{stream:true});}return JSON.parse(text+decoder.decode());}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createAutomaticDailyWorker(key:string|undefined,p:AutomaticDailyPorts){return async(request:Request)=>{
 const reply=(code:number,result:string,counts?:Record<string,number>)=>new Response(JSON.stringify({version:'internal-daily-worker-v1',result,...(counts?{counts}:{})}),{status:code,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(request.method!=='POST')return reply(405,'method_not_allowed');if(new URL(request.url).search||request.headers.has('origin'))return reply(400,'invalid_request');
 if(!await isInternalWorkerAuthorized(request.headers.get('authorization'),key))return reply(401,'unauthorized');
 try{if(!validWorkerEnvelope(await readEnvelope(request)))return reply(400,'invalid_request');}catch{return reply(400,'invalid_request');}
 const start=p.now();if(!Number.isSafeInteger(start)||start<0)return reply(503,'clock_unavailable');
 const deadline=start+AUTOMATIC_DAILY_RUN_MS,abort=new AbortController(),timer=setTimeout(()=>abort.abort(),AUTOMATIC_DAILY_RUN_MS),counts={completed:0,skipped:0,reconcile:0};let previous=start;
 try{
  const owners=await p.selectDueOwners(25,Math.min(deadline,start+AUTOMATIC_SELECTOR_RUN_MS),abort.signal);if(!validateWorkerSelection(owners))return reply(503,'invalid_server_selection');
  for(const owner of owners){const now=p.now();if(now<previous||now>=deadline||abort.signal.aborted)return reply(503,'budget_exhausted',counts);previous=now;counts[await runAutomaticAssessment(p,owner,deadline,abort.signal)]++;}
  return reply(200,'batch_finished',counts);
 }catch{return reply(503,'reconciliation_required',counts);}finally{clearTimeout(timer);abort.abort();}
};}
