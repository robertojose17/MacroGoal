import {selectedSourceEnvelope} from './selectedNutrition.mjs';
import {handleSelectedNutrition} from './selectedNutritionEndpoint.ts';

/** Register before starting: no detached/untracked provider requests. */
export function scheduleNutritionCapture(task:()=>Promise<unknown>):boolean {
 const runtime=(globalThis as any).EdgeRuntime;
 if(typeof runtime?.waitUntil!=='function')return false;
 let start!:()=>void;
 const registered=new Promise<void>(resolve=>{start=resolve}).then(task).catch(()=>undefined);
 try{runtime.waitUntil(registered);start();return true;}catch{return false;}
}

export function scheduleCachedNutrition(admin:any,request:Request,foodId:string):boolean {
 return scheduleNutritionCapture(async()=>{
  const body={operation:'capture_selected_nutrition_v1',request_id:crypto.randomUUID(),food_item_id:foodId};
  const req=new Request(request.url,{method:'POST',headers:{authorization:request.headers.get('authorization')??'','content-type':'application/json'},body:JSON.stringify(body)});
  await handleSelectedNutrition(req,admin,{});
 });
}

/** Record exactly the provider response already fetched, without an N+1 fetch.
 * Search/filtered OFF responses never claim full source completeness.
 */
export async function recordFetchedNutrition(admin:any,request:Request,provider:string,sourceId:string,raw:unknown,foodId:string|null,scope:'detail_response'|'search_response',signal?:AbortSignal) {
 const evidence=selectedSourceEnvelope(provider,sourceId,raw,undefined,scope);
 const requestId=crypto.randomUUID();
 const call=async(name:string,args:unknown)=>{const q=admin.rpc(name,args);const out=await (signal?q.abortSignal(signal):q);if(out.error)throw Error('nutrition_capture_rpc');return out.data;};
 if(scope==='search_response')return await call('record_selected_nutrition_batch_v1',{p_request_id:requestId,p_items:[{food_id:null,evidence}]});
 const bearer=request.headers.get('authorization')?.match(/^Bearer ([^ ]+)$/i)?.[1];
 if(!bearer)return {status:'unauthenticated'};
 const auth=await admin.auth.getUser(bearer);if(auth.error||!auth.data?.user)return {status:'unauthenticated'};
 const admission=await call('claim_selected_nutrition_v1',{p_user_id:auth.data.user.id,p_request_id:requestId,p_food_id:foodId,p_provider:provider,p_source_id:sourceId});
 if(['fresh','duplicate'].includes(admission?.status))return admission;
 if(admission?.status!=='claimed')return {status:admission?.status??'unavailable'};
 return await call('record_selected_nutrition_v1',{p_food_id:foodId,p_request_id:requestId,p_evidence:evidence});
}

export function scheduleFetchedNutrition(admin:any,request:Request,provider:string,sourceId:string,raw:unknown,foodId:string|null,scope:'detail_response'|'search_response'):boolean {
 return scheduleNutritionCapture(async()=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3000);
  try{await recordFetchedNutrition(admin,request,provider,sourceId,raw,foodId,scope,controller.signal);}finally{clearTimeout(timer);controller.abort();}
 });
}
