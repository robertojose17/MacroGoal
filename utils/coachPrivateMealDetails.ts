import type { MealEvidence, PreparedMealEntry } from './coachMealReview';

type Store={getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void>};
type CleanupStore=Store&{getAllKeys():Promise<readonly string[]>;multiRemove(keys:readonly string[]):Promise<void>};
export type CoachPrivateDetailsReference={version:1;review_request_id:string;option_id:string};
export type CoachPrivateDetailsLinkOutcome='invalid_reference'|'owner_changed'|'read_failed'|'invalid_read_shape'|'already_linked'|'write_failed'|'linked'|'write_not_confirmed'|'exception';
export type CoachPrivateMealDetails={owner:string;mealItemId:string;portion:string;confirmedMass:number|null;ingredients:string[];instructions:string[];assumptions:string[];components:{name:string;quantity:number;unit:string;grams:number|null;nutrition?:Record<string,number|null>;authority?:string}[];source:string|null;authority:PreparedMealEntry['authority']};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const key=(owner:string,id:string)=>`coach_private_meal_details_v1:${JSON.stringify([owner,id])}`;
export function hasCoachPrivateDetailsReference(value:unknown):value is CoachPrivateDetailsReference{
 if(!isRecord(value))return false;return value.version===1&&uuid(value.review_request_id)&&typeof value.option_id==='string'&&value.option_id.trim().length>0&&value.option_id.length<=200&&!/[\u0000-\u001f\u007f]/.test(value.option_id);
}
/** Merge a private receipt pointer into the existing diary JSON without replacing unrelated off_data keys. */
export async function persistCoachPrivateDetailsReference(input:{owner:string;mealItemId:string;reviewRequestId:string;optionId:string;currentOwner():Promise<string|undefined>;read(id:string):Promise<{value:unknown|null;error?:unknown}>;compareAndSet(id:string,expected:unknown|null,next:Record<string,unknown>):Promise<{updated:boolean;error?:unknown}>;onOutcome?:(value:CoachPrivateDetailsLinkOutcome)=>void}):Promise<boolean>{
 const finish=(value:CoachPrivateDetailsLinkOutcome,success=false)=>{try{input.onOutcome?.(value);}catch{}return success;};
 const {owner,mealItemId,reviewRequestId,optionId}=input;if(!uuid(owner)||!uuid(mealItemId)||!uuid(reviewRequestId)||typeof optionId!=='string'||!optionId.trim()||optionId.length>200||/[\u0000-\u001f\u007f]/.test(optionId))return finish('invalid_reference');
 try{
  for(let attempt=0;attempt<3;attempt++){
   if(await input.currentOwner()!==owner)return finish('owner_changed');
   const row=await input.read(mealItemId);if(row.error)return finish('read_failed');if(row.value!==null&&!isRecord(row.value))return finish('invalid_read_shape');
   const previous=(row.value??{}) as Record<string,unknown>;
   const reference:CoachPrivateDetailsReference={version:1,review_request_id:reviewRequestId,option_id:optionId};
   if(hasCoachPrivateDetailsReference(previous.coach_private_details)&&previous.coach_private_details.review_request_id===reviewRequestId&&previous.coach_private_details.option_id===optionId)return finish('already_linked',true);
   const result=await input.compareAndSet(mealItemId,row.value,{...previous,coach_private_details:reference});
   if(result.error)return finish('write_failed');if(result.updated)return await input.currentOwner()===owner?finish('linked',true):finish('owner_changed');
  }
 }catch{/* The diary write already succeeded; a private-link failure must not repeat it. */return finish('exception');}
 return finish('write_not_confirmed');
}
/** Validate the read-only server resolver before showing cross-device receipt details. */
export function coachPrivateDetailsFromResolver(value:unknown,owner:string,mealItemId:string):CoachPrivateMealDetails|null{
 if(!isRecord(value)||value.schema!=='saved_meal_details_v1'||value.meal_item_id!==mealItemId||!uuid(value.review_request_id)||typeof value.option_id!=='string'||!value.option_id||value.option_id.length>200||value.logged!==false||typeof value.name!=='string'||!value.name.trim()||value.name.length>300||typeof value.servings!=='number'||!Number.isFinite(value.servings)||value.servings<=0||value.servings>20||!isRecord(value.values)||!Array.isArray(value.components)||value.components.length>24||!Array.isArray(value.assumptions)||value.assumptions.length>12||value.assumptions.some(x=>typeof x!=='string'||x.length>300))return null;
 const values=value.values as Record<string,unknown>,servings=value.servings as number,assumptions=value.assumptions as string[],rawComponents=value.components as unknown[];
 if(!['calories','protein','carbs','fats','fiber'].every(k=>values[k]===null||typeof values[k]==='number'&&Number.isFinite(values[k])&&(values[k] as number)>=0))return null;
 const authority=value.authority;if(!['official','publisher_reported','estimated','user_edited','unknown'].includes(authority as string))return null;
 const components:(CoachPrivateMealDetails['components'][number])[]=[];
 for(const item of rawComponents){if(!isRecord(item)||typeof item.name!=='string'||!item.name.trim()||item.name.length>160||typeof item.unit!=='string'||item.unit.length>40||typeof item.quantity!=='number'||!Number.isFinite(item.quantity)||item.quantity<=0||!(item.grams===null||typeof item.grams==='number'&&Number.isFinite(item.grams)&&item.grams>0&&item.grams<=20000)||!isRecord(item.nutrition)||!['official','publisher_reported','estimated'].includes(item.authority as string))return null;const nutrition=item.nutrition as Record<string,unknown>;if(!['calories','protein','carbs','fats','fiber'].every(k=>typeof nutrition[k]==='number'&&Number.isFinite(nutrition[k])&&(nutrition[k] as number)>=0))return null;components.push({name:item.name,quantity:item.quantity,unit:item.unit,grams:item.grams as number|null,nutrition:nutrition as Record<string,number>,authority:item.authority as string});}
 const physical=value.physical_portion,confirmedMass=physical===null?null:isRecord(physical)&&typeof physical.total_grams==='number'&&Number.isFinite(physical.total_grams)&&physical.total_grams>0&&physical.total_grams<=100000?physical.total_grams:undefined;if(confirmedMass===undefined)return null;
 const originalSource=value.original_source,source=isRecord(originalSource)&&typeof originalSource.source_url==='string'&&originalSource.source_url.length<=600?originalSource.source_url:null;
 return {owner,mealItemId,portion:`${servings} serving${servings===1?'':'s'}`,confirmedMass,ingredients:[],instructions:[],assumptions,components,source,authority:authority as PreparedMealEntry['authority']};
}
export async function clearCoachPrivateMealDetails(store:CleanupStore,owner:string,mealItemId?:string){
 if(!uuid(owner))return;
 try{
  if(mealItemId){if(uuid(mealItemId))await store.removeItem(key(owner,mealItemId));return;}
  const prefix='coach_private_meal_details_v1:'+JSON.stringify([owner]).slice(0,-1)+',';
  const keys=(await store.getAllKeys()).filter(k=>k.startsWith(prefix));if(keys.length)await store.multiRemove(keys);
 }catch{/* Local cache cleanup must not affect diary data. */}
}
export async function saveCoachPrivateMealDetails(store:Store,owner:string,mealItemId:string,entry:PreparedMealEntry,option:MealEvidence){
 if(!uuid(owner)||!uuid(mealItemId)||entry.owner!==owner||entry.sourceReceiptId!==option.id&&entry.optionId!==option.id)return;
 const row:CoachPrivateMealDetails={owner,mealItemId,portion:(option.identity?.portion_label??entry.portionLabel).slice(0,300),confirmedMass:entry.physicalPortion?.total_grams??null,ingredients:(option.ingredients??[]).slice(0,30).map(x=>x.slice(0,300)),instructions:(option.instructions??[]).slice(0,30).map(x=>x.slice(0,600)),assumptions:entry.assumptions.slice(0,12),components:(entry.components??option.components??[]).slice(0,24).map(c=>({name:c.name,quantity:c.quantity,unit:c.unit,grams:c.grams})),source:option.provenance.url??option.provenance.label,authority:entry.authority};
 await store.setItem(key(owner,mealItemId),JSON.stringify(row));
}
export async function loadCoachPrivateMealDetails(store:Store,owner:string,mealItemId:string):Promise<CoachPrivateMealDetails|null>{
 if(!uuid(owner)||!uuid(mealItemId))return null;
 try{
  const raw=await store.getItem(key(owner,mealItemId));if(!raw)return null;const v=JSON.parse(raw);
  const assumptions=v?.assumptions??[];
  if(v?.owner!==owner||v.mealItemId!==mealItemId||typeof v.portion!=='string'||v.portion.length>300||!(v.confirmedMass===null||Number.isFinite(v.confirmedMass)&&v.confirmedMass>0&&v.confirmedMass<=100000)||!Array.isArray(v.ingredients)||v.ingredients.length>30||v.ingredients.some((x:unknown)=>typeof x!=='string'||x.length>300)||!Array.isArray(v.instructions)||v.instructions.length>30||v.instructions.some((x:unknown)=>typeof x!=='string'||x.length>600)||!Array.isArray(assumptions)||assumptions.length>12||assumptions.some((x:unknown)=>typeof x!=='string'||x.length>300)||!Array.isArray(v.components)||v.components.length>24||v.components.some((x:any)=>!x||typeof x.name!=='string'||x.name.length>160||typeof x.unit!=='string'||x.unit.length>40||!Number.isFinite(x.quantity)||x.quantity<=0||!(x.grams===null||Number.isFinite(x.grams)&&x.grams>0&&x.grams<=20000))||!(v.source===null||typeof v.source==='string'&&v.source.length<=600)||!['official','publisher_reported','estimated','user_edited','unknown'].includes(v.authority))return null;
  return {...v,assumptions};
 }catch{return null;}
}
