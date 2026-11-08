import { selectedNutritionScope, invokeSelectedNutritionCapture } from './usdaSelectionPersistence';
type SourceProduct={_db_id?:unknown;_usda_fdc_id?:unknown;_off_id?:unknown;_source?:unknown;code?:unknown;_manual_food_id?:unknown;_serving_authority?:unknown};
type Target={food_item_id:string}|{provider:'usda'|'openfoodfacts';source_id:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const digits=(v:unknown):v is string=>typeof v==='string'&&/^\d{1,20}$/.test(v);
const operationId=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});
export function selectedNutritionTarget(product:SourceProduct,fallbackId?:string):Target|null {
 if(product._serving_authority==='confirmed_correction'||product._manual_food_id)return null;
 if(uuid(product._db_id))return {food_item_id:product._db_id};
 if(uuid(fallbackId))return {food_item_id:fallbackId};
 if(digits(product._usda_fdc_id))return {provider:'usda',source_id:product._usda_fdc_id};
 const off=digits(product._off_id)?product._off_id:(['off','openfoodfacts'].includes(String(product._source))&&digits(product.code)?product.code:null);
 return off&&[8,12,13,14].includes(off.length)?{provider:'openfoodfacts',source_id:off}:null;
}
type Outcome='captured'|'duplicate'|'unavailable'|'unknown'|'ineligible';
type CaptureScope={key:string;pending:Map<string,Promise<Outcome>>;acknowledged:Map<string,Promise<Outcome>>};
// Unknown writes remain reserved for their auth epoch. Acknowledged successes may
// be evicted: a later explicit selection is protected by the server source TTL.
let captureScope:CaptureScope|null=null;
export async function captureSelectedNutrition(product:SourceProduct,fallbackId?:string):Promise<Outcome>{
 const target=selectedNutritionTarget(product,fallbackId);if(!target)return 'ineligible';
 const owner=await selectedNutritionScope();if(!owner)return 'unavailable';
 const ownerKey=JSON.stringify([owner.userId,owner.epoch]);
 if(captureScope?.key!==ownerKey)captureScope={key:ownerKey,pending:new Map(),acknowledged:new Map()};
 const scope=captureScope,key=JSON.stringify(target);
 const existing=scope.pending.get(key);if(existing)return existing;
 const acknowledged=scope.acknowledged.get(key);
 if(acknowledged){scope.acknowledged.delete(key);scope.acknowledged.set(key,acknowledged);return acknowledged;}
 if(scope.pending.size>=128)return 'unavailable';
 const request_id=operationId();
 const pending=Promise.resolve().then(async():Promise<Outcome>=>{
  try{
   const current=await selectedNutritionScope();if(!current||current.userId!==owner.userId||current.epoch!==owner.epoch)return 'unavailable';
   const response=await invokeSelectedNutritionCapture(owner,{operation:'capture_selected_nutrition_v1',request_id,...target}) as {error?:unknown;data?:Record<string,unknown>};
   const latest=await selectedNutritionScope();if(!latest||latest.userId!==owner.userId||latest.epoch!==owner.epoch)return 'unavailable';
   const d=response?.data;
   if(response?.error||!d||d.request_id!==request_id)return 'unknown';
   if('food_item_id' in target?d.food_item_id!==target.food_item_id:d.provider!==target.provider||d.source_id!==target.source_id)return 'unknown';
   // Snapshot capture never replaces displayed nutrition or grants confirmation authority.
   return d.complete===true&&(d.status==='captured'||d.status==='duplicate')?d.status:'unknown';
  }catch{return 'unknown';}
 });
 scope.pending.set(key,pending);
 void pending.then(outcome=>{
  if((outcome==='captured'||outcome==='duplicate')&&scope.pending.get(key)===pending){
   scope.pending.delete(key);scope.acknowledged.set(key,pending);
   while(scope.acknowledged.size>64){const oldest=scope.acknowledged.keys().next().value;if(oldest===undefined)break;scope.acknowledged.delete(oldest);}
  }
 });
 return pending;
}
