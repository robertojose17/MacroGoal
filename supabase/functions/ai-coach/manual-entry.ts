import {currentMealCapabilities} from './meal-paid-capabilities.ts';
import {createManualHandoffV1Handler} from './manual/handler.ts';
import {sourceDependencies} from './manual/source-adapter.ts';
import {createV202Admission} from './manual/v202-admission.ts';
import {savedMealReviewPolicy} from './manual/saved-meal-policy.ts';
import {evaluateCoachAccess,type Access} from './_shared/coach-access.ts';
import {localDay} from './manual/daily.ts';
import {withPersistenceDeadline,TOTAL_DEADLINE_MS} from './bounded-provider-phase.ts';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
export function createBoundDailyRoute(db:any,resolveUncertain?:(owner:string,now:number)=>Promise<Access>,now=Date.now,estimatorConfigured:()=>boolean=()=>false){
 const policy=savedMealReviewPolicy(db),admission=createV202Admission(db,policy,now,resolveUncertain);
 const deps=sourceDependencies(db,admission,now),daily=createManualHandoffV1Handler(deps);
 return async(req:Request):Promise<Response|null>=>{
  if(req.method!=='POST')return null;
  let body:any;try{body=await req.clone().json();}catch{return null;}
  if(!body||typeof body!=='object'||!Object.hasOwn(body,'intent'))return null;
  if(body.intent!=='recover_daily'){
   const response=await daily(req);response.headers.set('Access-Control-Allow-Origin','*');return response;
  }
  if(Object.keys(body).some(k=>!['intent','request_id','journey'].includes(k))||body.journey!==undefined&&!['meal_choice_v1','meal_explore_v1'].includes(body.journey)||typeof body.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id))return json({error:'invalid_request'},400);
  const guidedRecovery=['meal_choice_v1','meal_explore_v1'].includes(body.journey);
  const recoveryPermission=async(owner:string)=>{
   if(!guidedRecovery)return (await policy.checkRequest(owner)).allowed;
   const {data,error}=await db.from('coach_permissions').select('permission_level').eq('user_id',owner).maybeSingle();
   return !error&&[1,2,3,4].includes(data?.permission_level);
  };
  const authorization=req.headers.get('authorization')??'';if(!/^Bearer \S+$/.test(authorization))return json({error:'unauthorized'},401);
  try{
   const owner=await deps.authenticate(authorization);if(!owner)return json({error:'unauthorized'},401);
   let access=evaluateCoachAccess(await deps.subscriptions(owner),now());if(access==='unknown'&&resolveUncertain)access=await resolveUncertain(owner,now());
   if(access!=='premium')return json({error:access==='free'?'premium_required':'entitlement_unavailable'},access==='free'?403:503);
   if(!await recoveryPermission(owner))return json({error:'permission_required'},403);
   const {data,error}=await withPersistenceDeadline(()=>db.rpc('coach_recover_requests_v1',{p_user_id:owner,p_request_id:body.request_id,p_offset:0}),now()+TOTAL_DEADLINE_MS);
   if(error||!Array.isArray(data))return json({error:'receipt_unavailable'},503);
   const row=data.find((r:any)=>r.request_id===body.request_id);
   if(!row)return json({error:'request_not_found'},404);
   const payload=row.request_payload;
   if(guidedRecovery&&(payload?.journey!==body.journey||payload?.intent!=='recommend'))return json({error:'receipt_scope_mismatch'},409);
   if(payload?.contract!=='manual_v1'||!['today','recommend'].includes(payload.intent)||typeof payload.time_zone!=='string')return json({error:'receipt_scope_mismatch'},409);
   if(row.state!=='completed')return json({error:'execution_unresolved',request_id:body.request_id,next_action:'recover_existing_request'},409);
   const result=row.result?.manual_handoff_v1;
   if(guidedRecovery&&result?.body?.schema!==(body.journey==='meal_choice_v1'?'guided_meal_choice_v1':'meal_explore_v1'))return json({error:'receipt_scope_mismatch'},409);
   if(row.result?.request_id!==body.request_id||!result||!Number.isInteger(result.status)||result.status<200||result.status>599||!result.body)return json({error:'receipt_unavailable'},503);
   if(await deps.authenticate(authorization)!==owner)return json({error:'authorization_changed'},403);
   const projectedBody=body.journey==='meal_explore_v1'?{...result.body,paid_capabilities:await currentMealCapabilities(db,owner,estimatorConfigured())}:result.body;
   const freshRows=await deps.subscriptions(owner);
   const projected=evaluateCoachAccess(freshRows,now());
   let fresh=projected;if(fresh==='unknown'&&resolveUncertain)fresh=await resolveUncertain(owner,now());
   if(fresh!=='premium'||!await recoveryPermission(owner))return json({error:'authorization_changed'},403);
   // Final session check follows all permission awaits; known expiry is evaluated again.
   if(await deps.authenticate(authorization)!==owner)return json({error:'authorization_changed'},403);
   if(projected==='premium'&&evaluateCoachAccess(freshRows,now())!=='premium')return json({error:'authorization_changed'},403);
   if(result.body.owner!==owner||result.body.date!==localDay(now(),payload.time_zone))return json({error:'stale_receipt'},409);
   // Recommendations are snapshots only: the UI re-admits before Review; Details
   // loads current owned content. No receipt grants permission to log.
   return json(projectedBody,result.status);
  }catch{return json({error:'recovery_unavailable'},503);}
 };
}


