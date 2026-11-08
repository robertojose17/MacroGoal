import {selectedSourceEnvelope,postgresJsonbBytes} from './selectedNutrition.mjs';

/** Capture only records already received for this search. Never performs provider I/O. */
export function createSearchNutritionBatch({now=()=>new Date().toISOString(),maxItems=100,maxBytes=8*1024*1024}={}) {
 const items=[],seen=new Set();let bytes=2,skipped=0;
 return {
  add(provider,records){
   for(const raw of Array.isArray(records)?records:[]){
    try{
     const sourceId=String(provider==='usda'?raw?.fdcId:(raw?.code??raw?._id));
     const key=provider+':'+sourceId;if(seen.has(key))continue;
     const evidence=selectedSourceEnvelope(provider,sourceId,raw,now(),'search_response');
     const item={food_id:null,evidence},size=postgresJsonbBytes(item)+(items.length?2:0);
     if(items.length>=Math.min(100,maxItems)||bytes+size>Math.min(8*1024*1024,maxBytes)){skipped++;continue;}
     items.push(item);seen.add(key);bytes+=size;
    }catch{skipped++;}
   }
  },
  snapshot(){return {items:items.slice(),skipped,bytes};}
 };
}

/** Register before starting work. Search latency never waits on storage/network.
 * An unavailable background runtime is explicit, not a pretend durable success.
 */
export function scheduleSearchNutritionBatch(admin,batch,{waitUntil,requestId=()=>crypto.randomUUID(),timeoutMs=8000}={}) {
 const {items,skipped}=batch.snapshot();
 if(!items.length)return {status:'empty',queued:0,skipped};
 if(typeof waitUntil!=='function')return {status:'unavailable',queued:0,skipped:skipped+items.length};
 let finish;const tracked=new Promise(resolve=>{finish=resolve;});
 try{waitUntil(tracked);}catch{finish({status:'unavailable'});return {status:'unavailable',queued:0,skipped:skipped+items.length};}
 const run=async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const result=await admin.rpc('record_selected_nutrition_batch_v1',{p_request_id:requestId(),p_items:items}).abortSignal(controller.signal);
   return {status:!result.error&&result.data?.persisted===true&&result.data?.status==='recorded'?'completed':'unavailable'};
  }catch{return {status:'unavailable'};}finally{clearTimeout(timer);}
 };
 void run().then(finish,()=>finish({status:'unavailable'}));
 return {status:'scheduled',queued:items.length,skipped};
}
