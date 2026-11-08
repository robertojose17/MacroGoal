import { selectedNutritionScope, invokeSelectedNutritionCapture } from './usdaSelectionPersistence';
import { readUsdaPortions } from '../supabase/functions/_shared/foodPortions.mjs';
type Owner={userId:string;epoch:string};
type Evidence={foodItemId:string;fdcId:string;foodDescription:string;portionEvidence:unknown};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const same=(a:Owner|null,b:Owner)=>a?.userId===b.userId&&a.epoch===b.epoch;
let scope:{key:string;pending:Map<string,Promise<Evidence|null>>;success:Map<string,Promise<Evidence|null>>;reads:Map<string,Promise<Evidence|null>>}|null=null;
function validated(result:{error?:unknown;data?:Record<string,unknown>},foodId:string):Evidence|null{
 const d=result?.data;
 if(result?.error||!d||d.food_item_id!==foodId||d.binding_verified!==true||typeof d.food_description!=='string'||!d.food_description.trim()||(d.portion_evidence as {foodDescription?:unknown})?.foodDescription!==d.food_description||typeof d.fdc_id!=='string'||!/^\d{1,20}$/.test(d.fdc_id)||!readUsdaPortions(d.portion_evidence,d.fdc_id).length)return null;
 return {foodItemId:foodId,fdcId:d.fdc_id,foodDescription:d.food_description,portionEvidence:d.portion_evidence};
}
/** Initial detail hydration only. UUID is resolved by the authenticated server;
 * neither a name nor a client FDC guess establishes catalog identity. */
export async function resolveCatalogUsdaPortions(foodId:unknown,mode:'detail'|'background'='detail'):Promise<Evidence|null>{
 if(!uuid(foodId))return null;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let expired=false;
 const run=async():Promise<Evidence|null>=>{
  const owner=await selectedNutritionScope();if(!owner||expired)return null;
  const key=JSON.stringify([owner.userId,owner.epoch]);
  if(scope?.key!==key)scope={key,pending:new Map(),success:new Map(),reads:new Map()};
  const active=scope;
  let operation=active.success.get(foodId)||active.pending.get(foodId);
  if(!operation){
   if(active.pending.size>=128)return null;
   operation=Promise.resolve().then(async():Promise<Evidence|null>=>{
    if(expired||!same(await selectedNutritionScope(),owner)||expired)return null;
    try{
     const result=await invokeSelectedNutritionCapture(owner,{operation:'usda_portions_v1',food_item_id:foodId}) as {error?:unknown;data?:Record<string,unknown>};
     // A caller deadline retires its UI wait, not this shared request. Preserve a
     // late authenticated success for later opens without dispatching again.
     if(!same(await selectedNutritionScope(),owner))return null;
     return validated(result,foodId);
    }catch{return null;}
   });
   active.pending.set(foodId,operation);
   void operation.then(result=>{if(result&&active.pending.get(foodId)===operation){active.pending.delete(foodId);active.success.set(foodId,operation!);while(active.success.size>64)active.success.delete(active.success.keys().next().value!);}});
  }else if(active.success.has(foodId)){active.success.delete(foodId);active.success.set(foodId,operation);}
  let result=await operation;
  if(expired||!same(await selectedNutritionScope(),owner)||expired)return null;
  if(!result){
   // The write-capable original request is NEVER retried. A completed null may
   // have persisted its cache before losing its response; reread that cache only.
   let read=active.reads.get(foodId);
   if(!read){
    read=Promise.resolve().then(async():Promise<Evidence|null>=>{
     if(expired||!same(await selectedNutritionScope(),owner)||expired)return null;
     try{
      const response=await invokeSelectedNutritionCapture(owner,{operation:'usda_portions_cached_v1',food_item_id:foodId}) as {error?:unknown;data?:Record<string,unknown>};
      if(!same(await selectedNutritionScope(),owner)||response.data?.cache_only!==true||response.data?.cached!==true)return null;
      return validated(response,foodId);
     }catch{return null;}
    });
    active.reads.set(foodId,read);
    void read.then(value=>{
     if(active.reads.get(foodId)===read)active.reads.delete(foodId);
     if(value){active.success.set(foodId,Promise.resolve(value));while(active.success.size>64)active.success.delete(active.success.keys().next().value!);}
    });
   }
   result=await read;
  }
  return !expired&&same(await selectedNutritionScope(),owner)&&!expired?result:null;
 };
 try{return await Promise.race([run(),new Promise<null>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(null);},mode==='background'?8000:4000);})]);}
 catch{return null;}
 finally{if(timer)clearTimeout(timer);}
}
