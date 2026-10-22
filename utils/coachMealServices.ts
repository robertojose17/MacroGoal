import {parseConstraints,emptyConstraints,type DietaryConstraints} from './coachDietaryConstraints';
import type { DailyMealSlot } from './coachDailyAction';
import { dailyAccess } from './coachDailyAction';
import { createMealTransport, type MealAccess, type MealExploreInput, type MealResponse, type MealRetryOffer } from './coachMealTransport';
import { createMealReviewSession, NUTRIENTS, scaleMealNutrition, type MealReviewContext, type MealReviewDependencies, type MealReviewEdit, type MealEvidence, type PreparedMealEntry } from './coachMealReview';
import { existingMealLogPayload, mealEvidenceFromOption } from './coachMealReviewAdapter';

export type MealChoices = { kind:'ready'; owner:string; date:string; meal:DailyMealSlot; mode:MealExploreInput['mode']; requestId:string; options:MealEvidence[]; question?:string; publicRequest?:Record<string,unknown>; capabilities:{discovery:boolean;estimate:boolean;reason:string|null}; };
export type MealChoiceOutcome = MealChoices | Exclude<MealResponse,{kind:'ready'}>;
export const estimatePublicDetails = (option:MealEvidence, portionLabel?:string) => ({ name:option.name.slice(0,160), identity:portionLabel ? {...option.identity, portion_label:portionLabel} : option.identity??null, physical_portion:option.physicalPortion??null, source:{url:option.provenance.url??null,nutrition:{authority:(option.sourceNutrition??option.nutrition).authority,basis:(option.sourceNutrition??option.nutrition).basis,values:(option.sourceNutrition??option.nutrition).values}}, ingredients:(option.ingredients??[]).slice(0,30).map(s=>s.slice(0,180)) });
export function createMealServices(deps: {
  transport:ReturnType<typeof createMealTransport>;
  owner:MealReviewDependencies['owner']; today:MealReviewDependencies['today']; store:MealReviewDependencies['store'];
  subscribeInvalidation(owner:string,onInvalidate:()=>void):()=>void;
  write(body:ReturnType<typeof existingMealLogPayload>&{p_logged_at:string}):Promise<void>;
}) {
 function choices(result:MealResponse):MealChoiceOutcome {
  if(result.kind!=='ready')return result;
  const b=result.body;if(b.schema!=='meal_explore_v1'||!['options','clarify','discovery_available'].includes(b.status)||!Array.isArray(b.options))return {kind:'unavailable',reason:'invalid_meal_response'};
  const options=b.options.map((o:any)=>mealEvidenceFromOption(o,result.mode));
  if(options.some((o:MealEvidence|null)=>!o)||b.status==='options'&&!options.length)return {kind:'unavailable',reason:'invalid_meal_option'};
  if(b.question&&!['food_query','mode','restaurant','dish_and_portion','portion_label','public_area'].includes(b.question.key))return {kind:'unavailable',reason:'unsupported_question'};
  return {kind:'ready',owner:result.owner,date:result.date,meal:result.meal,mode:result.mode,requestId:result.requestId,options,
   capabilities:{discovery:b.paid_capabilities?.discovery===true,estimate:b.paid_capabilities?.estimate===true,reason:typeof b.paid_capabilities?.reason==='string'?b.paid_capabilities.reason:null},
   ...(b.question?{question:b.question.key}:{}),...(b.discovery_request&&typeof b.discovery_request==='object'?{publicRequest:b.discovery_request}:{})};
 }
 function session(context:MealReviewContext,access:()=>ReturnType<MealReviewDependencies['access']>,cached?:{response:MealResponse;edit:MealReviewEdit}) {
  return createMealReviewSession(context,{
  owner:deps.owner,today:deps.today,access,store:deps.store,subscribeInvalidation:f=>deps.subscribeInvalidation(context.owner,f),
   async prepare(c,edit){
    const edits=Object.fromEntries(edit.changed.filter(k=>edit.values[k]!==null).map(k=>[k,edit.values[k]!]));
    if(edit.changed.some(k=>edit.values[k]===null))throw Error('unknown_edit_not_numeric');
    const result=cached&&cached.edit.multiplier===edit.multiplier&&JSON.stringify(cached.edit.values)===JSON.stringify(edit.values)&&cached.edit.estimateAcknowledged===edit.estimateAcknowledged&&cached.edit.ingredientAcknowledged===edit.ingredientAcknowledged?cached.response:await deps.transport.run(access,{operation:'review',source_request_id:c.sourceReceiptId,option_id:c.option.id,servings:edit.multiplier,
     estimate_acknowledged:edit.estimateAcknowledged===true,ingredient_review_acknowledged:edit.ingredientAcknowledged===true,...(Object.keys(edits).length?{edited_values:edits}:{})},{meal:c.meal,mode:c.option.kind==='restaurant'?'eat_out':'cook'});
    cached=undefined;
    if(result.kind!=='ready'||result.body.status!=='review'||result.owner!==c.owner||result.date!==c.date)throw Error('review_unavailable');
    const r=result.body.review;
    if (r?.review_basis && (!NUTRIENTS.every(k=>r.review_basis.values?.[k]===c.option.nutrition.values[k]) || r.review_basis.authority!==c.option.nutrition.authority || r.review_basis.basis?.label!==c.option.nutrition.basis.label)) throw Error('review_basis_mismatch');
    const grams=c.option.physicalPortion;
    if (grams ? r?.physical_portion?.grams!==grams.grams || r.physical_portion.authority!==grams.authority || r.physical_portion.total_grams!==Math.round(grams.grams*edit.multiplier*10)/10 : r?.physical_portion!=null) throw Error('review_portion_mismatch');
    if(!r||r.logged!==false||r.option_id!==c.option.id||r.name!==c.option.name||r.servings!==edit.multiplier||!NUTRIENTS.every(k=>r.original_nutrition?.values?.[k]===(c.option.sourceNutrition??c.option.nutrition).values[k])||r.original_nutrition.authority!==(c.option.sourceNutrition??c.option.nutrition).authority||r.original_source?.gallery_id!==c.option.provenance.galleryId||r.original_source?.source_url!==c.option.provenance.url)throw Error('review_scope_mismatch');
    const entry:PreparedMealEntry={confirmationId:result.requestId,owner:c.owner,date:c.date,meal:c.meal,sourceReceiptId:c.sourceReceiptId,optionId:r.option_id,name:r.name,multiplier:r.servings,
     portionLabel:String(r.servings)+' x '+c.option.nutrition.basis.label,...(r.physical_portion?{physicalPortion:r.physical_portion}:{}),nutrition:r.values,authority:r.authority,assumptions:r.assumptions,readyForConfirmation:r.ready_for_explicit_confirmation===true};
    return entry;
   },
   confirm:async entry=>{const payload=existingMealLogPayload(context,entry);await deps.write({...payload,p_logged_at:new Date().toISOString()});},
  },cached?.edit);
 }
 async function importDiscovery(access:MealAccess,result:MealResponse):Promise<MealChoiceOutcome>{if(result.kind!=='ready')return result;if(await deps.owner()!==result.owner||deps.today()!==result.date)return {kind:'blocked',reason:'scope_changed'};return choices(await deps.transport.run(access,{operation:'import_discovery',source_request_id:result.requestId},{meal:result.meal,mode:result.mode}));}
 return {
  async confirmedConstraints(){
   const owner=await deps.owner(),date=deps.today(),key='coach_constraints_v1';const raw=await deps.store.getItem(key);if(!raw)return emptyConstraints();
   const saved=JSON.parse(raw);if(!owner||saved.owner!==owner||saved.date!==date){await deps.store.removeItem(key);return emptyConstraints();}
   const value=parseConstraints(saved.value);if(!value)throw Error('invalid_saved_constraints');if(await deps.owner()!==owner||deps.today()!==date)throw Error('scope_changed');return value;
  },
  async confirmConstraints(value:DietaryConstraints,owner:string,date:string){const v=parseConstraints(value);if(!v||await deps.owner()!==owner||deps.today()!==date)throw Error('scope_changed');await deps.store.setItem('coach_constraints_v1',JSON.stringify({owner,date,value:v}));if(await deps.owner()!==owner||deps.today()!==date)throw Error('scope_changed');},
  owner:deps.owner,today:deps.today,subscribeInvalidation:deps.subscribeInvalidation,
  pending:deps.transport.pending,
  saved:deps.transport.saved,
  restore:async(access:MealAccess)=>choices(await deps.transport.restore(access)),
  explore:async(access:MealAccess,input:MealExploreInput,meal:DailyMealSlot)=>choices(await deps.transport.run(access,{operation:'explore',...input},{meal,mode:input.mode})),
  discover:async(access:MealAccess,source:MealChoices)=>{
   if(!source.capabilities.discovery||!source.publicRequest||await deps.owner()!==source.owner||deps.today()!==source.date||dailyAccess(typeof access==='function'?access():access)!=='ready')return {kind:'blocked',reason:source.capabilities.reason??'discovery_unavailable'} as const;
   return importDiscovery(access,await deps.transport.run(access,{operation:'discover',source_request_id:source.requestId,consent:true},{meal:source.meal,mode:source.mode}));
  },
  retrySearch:async(access:MealAccess,offer:MealRetryOffer)=>importDiscovery(access,await deps.transport.retry(access,offer)),
  estimate:async(access:MealAccess,source:MealChoices,optionId:string,portionLabel?:string)=>{
   if(!source.capabilities.estimate||!source.options.some(o=>o.id===optionId)||await deps.owner()!==source.owner||deps.today()!==source.date||dailyAccess(typeof access==='function'?access():access)!=='ready')return {kind:'blocked',reason:source.capabilities.reason??'estimate_unavailable'} as const;
   return choices(await deps.transport.run(access,{operation:'estimate',source_request_id:source.requestId,option_id:optionId,consent:true,...(portionLabel?{portion_label:portionLabel}:{})},{meal:source.meal,mode:source.mode}));
  },
  async recover(access:()=>ReturnType<MealReviewDependencies['access']>){
   const pending=await deps.transport.pending(access);if(!pending)return {kind:'blocked',reason:'no_pending_request'} as const;
   const result=await deps.transport.recover(access);
   if(pending.envelope.operation==='discover')return importDiscovery(access,result);
   if(pending.envelope.operation==='review'&&result.kind==='ready'){
    const r=result.body.review;if(!r||r.logged!==false)return {kind:'unavailable',reason:'invalid_review'} as const;
    // Recovery receipts omit allergy status. Keep ingredient review available;    // never downgrade a previously required acknowledgement to unknown.    const option=mealEvidenceFromOption({id:r.option_id,name:r.name,provenance:r.original_source,nutrition:r.review_basis??r.original_nutrition,source_nutrition:r.original_nutrition,physical_portion:r.physical_portion??undefined,ingredients:[],instructions:[],allergy_status:'requires_review',review_required:true,dietary_constraints:r.dietary_constraints},pending.mode);
    if(!option)return {kind:'unavailable',reason:'invalid_review'} as const;
    const context={owner:result.owner,date:result.date,meal:pending.meal,sourceReceiptId:pending.envelope.source_request_id,option};
    const scaled=scaleMealNutrition(option,r.servings);if(!scaled)return {kind:'unavailable',reason:'invalid_portion'} as const;
    const edit:MealReviewEdit={multiplier:r.servings,values:r.values,changed:NUTRIENTS.filter(k=>scaled[k]!==r.values[k]),estimateAcknowledged:pending.envelope.estimate_acknowledged,ingredientAcknowledged:pending.envelope.ingredient_review_acknowledged};
    return {kind:'recovered_review' as const,session:session(context,access,{response:result,edit})};
   }
   return choices(result);
  },
  review(source:MealChoices,optionId:string,access:()=>ReturnType<MealReviewDependencies['access']>){const option=source.options.find(o=>o.id===optionId);if(!option)throw Error('option_not_found');return session({owner:source.owner,date:source.date,meal:source.meal,sourceReceiptId:source.requestId,option},access);},
 };
}
export type MealExperienceServices=ReturnType<typeof createMealServices>;
