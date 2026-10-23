import {reserveCoachRequest,type Access} from '../_shared/coach-access.ts';
import {createCoachExecution,admissionDenial} from '../_shared/coach-execution.ts';
import {withPersistenceDeadline,TOTAL_DEADLINE_MS} from '../bounded-provider-phase.ts';
import type {Admission} from './source-adapter.ts';

// Required separately: v202 has no saved-meal suitability policy to invent here.
export type DailyPolicy={
 checkRequest(ownerId:string):Promise<{allowed:true}|{allowed:false;reason:'cost_gate'|'usage_gate'|'safety_gate'|'privacy_gate'}>;
 checkSavedMeal(ownerId:string,mealId:string):Promise<boolean>;
};
type Db={from:(table:string)=>any;rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:any;error:any}>};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const canonical=(v:any):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function project(result:any,requestId:string){
 const stored=result?.manual_handoff_v1;
 if(result?.request_id!==requestId||!stored||!Number.isInteger(stored.status)||stored.status<200||stored.status>599||!stored.body||typeof stored.body!=='object'||Array.isArray(stored.body))throw Error('invalid_receipt');
 // Publish only our saved envelope, never execution token/attempt/private audit.
 return json(stored.body,stored.status);
}
export function createV202Admission(db:Db,policy:DailyPolicy,now=Date.now,resolveUncertain?:(owner:string,now:number)=>Promise<Access>):Admission{
 return {checkSavedMeal:policy.checkSavedMeal,resolveAccess:resolveUncertain,run:async(input,work)=>{
  const decision=await policy.checkRequest(input.ownerId);if(!decision.allowed)return json({error:decision.reason,admission_state:'not_admitted'},403);
  const deadline=now()+TOTAL_DEADLINE_MS;
  const payload=JSON.parse(input.fingerprint);
  // Same owned recovery RPC used by v202, before attempting a new reservation.
  const {data:rows,error}=await withPersistenceDeadline(()=>db.rpc('coach_recover_requests_v1',{p_user_id:input.ownerId,p_request_id:input.requestId,p_offset:0}),deadline);
  if(error||!Array.isArray(rows))return json({error:'receipt_unavailable',request_id:input.requestId,next_action:'recover_existing_request'},503);
  const prior=rows.find((r:any)=>r.request_id===input.requestId);
  if(prior){
   if(canonical(prior.request_payload)!==canonical(payload))return json({error:'conflict',request_id:input.requestId},409);
   if(prior.state==='completed')return project(prior.result,input.requestId);
   return json({error:['committing','stopped'].includes(prior.execution_state)?'execution_'+prior.execution_state:'execution_active',request_id:input.requestId,next_action:'recover_existing_request'},409);
  }
  // Deterministic owned-catalog path has no provider phase, matching v202's local
  // turns (reserveWeb=false). Never settles/releases any existing web cost/hold.
  const reservation=await reserveCoachRequest(db,input.ownerId,input.requestId,await digest(input.fingerprint),now(),payload,resolveUncertain,{retryOfRequestId:null,reserveWeb:false,deadlineAt:deadline});
  if(reservation.kind==='replay')return project(reservation.result,input.requestId);
  if(reservation.kind!=='reserved'){
   const known=['account_budget_exhausted','global_budget_exhausted','account_paused','paid_operation_invalid','premium_required','permission_required','budget_limit','limit','entitlement_unavailable','unauthorized','execution_admission_paused','execution_active','execution_committing','execution_stopped','conflict'];
   const kind=known.includes(reservation.kind)?reservation.kind:'admission_unavailable';
   return json({error:kind,request_id:input.requestId,next_action:'recover_existing_request',...admissionDenial(reservation.kind,'transaction_response',reservation.admission_state)},Number.isInteger(reservation.status)&&reservation.status>=400&&reservation.status<=599?reservation.status:503);
  }
  if(!uuid(reservation.attempt_id)||!uuid(reservation.execution_token)||!Number.isFinite(Date.parse(reservation.execution_deadline_at))||Date.parse(reservation.execution_deadline_at)<=now()||reservation.web_reserved!==false)return json({error:'admission_uncertain',request_id:input.requestId,next_action:'recover_existing_request'},503);
  const execution=createCoachExecution(db,input.ownerId,input.requestId,reservation.attempt_id,reservation.execution_token,deadline);
  let committing=false;
  try{
   const response=await work();const body=await response.clone().json();
   if(response.status>=500){await execution.stop('failed_before_stream',{});return response;}
   committing=true;
   const result=await execution.commit({result:{request_id:input.requestId,manual_handoff_v1:{status:response.status,body},action_proposal:null},memories:[],action_payload:null,mark_insights:false});
   return project(result,input.requestId);
  }catch{
   // Unknown commit outcome is recovery-only; never stop/reset/retry a claimed commit.
   if(!committing){try{await execution.stop('failed_before_stream',{});}catch{/* Leave receipt for owned recovery. */}}
   return json({error:'execution_uncertain',request_id:input.requestId,next_action:'recover_existing_request'},503);
  }
 }};
}


