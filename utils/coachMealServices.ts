import {parseMealConversation,type ScopedMealConversation} from './coachMealConversation';
import {validateReviewedComposition,type MealComponent} from './coachMealComponents';
import {coachCatalogDiaryPayload,type createCoachCatalogIdentity} from './coachCatalogIdentity';
import {parseConstraints,emptyConstraints,type DietaryConstraints} from './coachDietaryConstraints';
import type { DailyMealSlot } from './coachDailyAction';
import { dailyAccess } from './coachDailyAction';
import { createMealTransport, type MealAccess, type MealExploreInput, type MealResponse, type MealRetryOffer } from './coachMealTransport';
import { createMealReviewSession, NUTRIENTS, scaleMealNutrition, type MealReviewContext, type MealReviewDependencies, type MealReviewEdit, type MealEvidence, type PreparedMealEntry } from './coachMealReview';
import { existingMealLogPayload, mealEvidenceFromOption } from './coachMealReviewAdapter';
import {noResultsContext} from './coachNoResults';
import {saveCoachPrivateMealDetails} from './coachPrivateMealDetails';
import type {CoachPrivateMealDetails} from './coachPrivateMealDetails';

export type MealChoices = { flowId?:string;kind:'ready'; owner:string; date:string; meal:DailyMealSlot; mode:MealExploreInput['mode']; requestId:string; options:MealEvidence[]; galleryNoMatch?:boolean; question?:string; publicRequest?:Record<string,unknown>; noResults?:NonNullable<ReturnType<typeof noResultsContext>>; capabilities:{discovery:boolean;estimate:boolean;reason:string|null}; };
export type MealChoiceOutcome = MealChoices | Exclude<MealResponse,{kind:'ready'}>;
export function estimateNeedsPortion(option:MealEvidence):boolean {
 if(option.identity?.portion_label?.trim())return false;
 const mass=option.physicalPortion;
 return !(mass?.authority==='source_reported'&&Number.isFinite(mass.grams)&&mass.grams>0);
}
export const estimatePublicDetails = (option:MealEvidence, portionLabel?:string) => ({ name:option.name.slice(0,160), identity:portionLabel ? {...option.identity, portion_label:portionLabel} : option.identity??null, physical_portion:option.physicalPortion??null, source:{url:option.provenance.url??null,nutrition:{authority:(option.sourceNutrition??option.nutrition).authority,basis:(option.sourceNutrition??option.nutrition).basis,values:(option.sourceNutrition??option.nutrition).values}}, ingredients:(option.ingredients??[]).slice(0,30).map(s=>s.slice(0,180)) });
export function createMealServices(deps: {
  transport:ReturnType<typeof createMealTransport>;
  owner:MealReviewDependencies['owner']; today:MealReviewDependencies['today']; store:MealReviewDependencies['store'];
  subscribeInvalidation(owner:string,onInvalidate:()=>void):()=>void;
  catalogIdentity?:ReturnType<typeof createCoachCatalogIdentity>;
  searchIngredients?(query:string):Promise<MealComponent[]>;
  persistPrivateDetailsLink?(owner:string,mealItemId:string,reviewRequestId:string,optionId:string):Promise<boolean>;
  reportPrivateDetailsOutcome?(value:'log_food_missing_meal_item_id'|'private_link_writer_unavailable'):void;
  resolvePrivateDetails?(mealItemId:string):Promise<CoachPrivateMealDetails|null>;
  write(body:(ReturnType<typeof existingMealLogPayload>|ReturnType<typeof coachCatalogDiaryPayload>)&{p_logged_at:string}):Promise<unknown>;
}) {
 function choices(result:MealResponse):MealChoiceOutcome {
  if(result.kind!=='ready')return result;
  const b=result.body;if(b.schema!=='meal_explore_v1'||!['options','clarify','discovery_available'].includes(b.status)||!Array.isArray(b.options))return {kind:'unavailable',reason:'invalid_meal_response'};
  const noResults=b.outcome==='no_validated_options'?noResultsContext(b,result.mode,result.requestId):null;
  if(b.outcome==='no_validated_options'&&!noResults)return {kind:'unavailable',reason:'no_results_context_unavailable'};
  const options=b.options.map((o:any)=>mealEvidenceFromOption(o,result.mode));
  if(options.some((o:MealEvidence|null)=>!o)||b.status==='options'&&!options.length)return {kind:'unavailable',reason:'invalid_meal_option'};
  if(b.question&&!['food_query','mode','restaurant','dish_and_portion','portion_label','public_area'].includes(b.question.key))return {kind:'unavailable',reason:'unsupported_question'};
  return {kind:'ready',flowId:result.flowId,owner:result.owner,date:result.date,meal:result.meal,mode:result.mode,requestId:result.requestId,options,
   ...(b.status==='discovery_available'&&b.coverage==='bounded_gallery_search'&&result.mode!=='eat_out'&&!options.length?{galleryNoMatch:true}:{}),
   capabilities:{discovery:b.paid_capabilities?.discovery===true,estimate:b.paid_capabilities?.estimate===true,reason:typeof b.paid_capabilities?.reason==='string'?b.paid_capabilities.reason:null},
   ...(b.question&&!noResults?{question:b.question.key}:{}),...(noResults?{noResults}:{}),...(b.discovery_request&&typeof b.discovery_request==='object'?{publicRequest:b.discovery_request}:{})};
 }
 function session(context:MealReviewContext,access:()=>ReturnType<MealReviewDependencies['access']>,cached?:{response:MealResponse;edit:MealReviewEdit},flowId?:string) {
  return createMealReviewSession(context,{
  owner:deps.owner,today:deps.today,access,store:deps.store,searchIngredients:deps.searchIngredients,subscribeInvalidation:f=>deps.subscribeInvalidation(context.owner,f),
   async prepare(c,edit){
    const edits=Object.fromEntries(edit.changed.filter(k=>edit.values[k]!==null).map(k=>[k,edit.values[k]!]));
    if(edit.changed.some(k=>edit.values[k]===null))throw Error('unknown_edit_not_numeric');
    const result=cached&&cached.edit.multiplier===edit.multiplier&&JSON.stringify(cached.edit.values)===JSON.stringify(edit.values)&&cached.edit.estimateAcknowledged===edit.estimateAcknowledged&&cached.edit.ingredientAcknowledged===edit.ingredientAcknowledged&&JSON.stringify(cached.edit.componentEdits)===JSON.stringify(edit.componentEdits)&&JSON.stringify(cached.edit.componentAdditions)===JSON.stringify(edit.componentAdditions)?cached.response:await deps.transport.run(access,{operation:'review',source_request_id:c.sourceReceiptId,option_id:c.option.id,servings:edit.multiplier,
     ...(edit.componentEdits!==undefined?{component_edits:edit.componentEdits}:{}),...(edit.componentAdditions!==undefined?{component_additions:edit.componentAdditions}:{}),estimate_acknowledged:edit.estimateAcknowledged===true,ingredient_review_acknowledged:edit.ingredientAcknowledged===true,...(Object.keys(edits).length?{edited_values:edits}:{})},{flowId,meal:c.meal,mode:c.option.kind==='restaurant'?'eat_out':'cook'});
    cached=undefined;
    if(result.kind!=='ready'||result.body.status!=='review'||result.owner!==c.owner||result.date!==c.date)throw Error('review_unavailable');
    const r=result.body.review;
    if (r?.review_basis && (!NUTRIENTS.every(k=>r.review_basis.values?.[k]===c.option.nutrition.values[k]) || r.review_basis.authority!==c.option.nutrition.authority || r.review_basis.basis?.label!==c.option.nutrition.basis.label)) throw Error('review_basis_mismatch');
    const composition=c.option.components?validateReviewedComposition(c.option.components,edit.componentEdits,edit.componentAdditions,edit.multiplier,r?.components):null;
    if(c.option.components&&(!composition||NUTRIENTS.some(k=>composition.nutrition[k]!==r.values?.[k])))throw Error('review_composition_mismatch');
    const grams=c.option.physicalPortion;
    const componentChanged=edit.componentEdits!==undefined||!!edit.componentAdditions?.length;
    const expectedPhysical=grams&&!componentChanged?{grams:grams.grams,authority:grams.authority,total_grams:Math.round(grams.grams*edit.multiplier*10)/10}:composition&&composition.grams!==null?{grams:composition.grams,total_grams:composition.grams,authority:'estimated'}:null;
    if(expectedPhysical?Object.keys(expectedPhysical).some(k=>(r?.physical_portion as any)?.[k]!==expectedPhysical[k as keyof typeof expectedPhysical]):r?.physical_portion!=null)throw Error('review_portion_mismatch');

    if(!r||r.logged!==false||r.option_id!==c.option.id||r.name!==c.option.name||r.servings!==edit.multiplier||!NUTRIENTS.every(k=>r.original_nutrition?.values?.[k]===(c.option.sourceNutrition??c.option.nutrition).values[k])||r.original_nutrition.authority!==(c.option.sourceNutrition??c.option.nutrition).authority||r.original_source?.gallery_id!==c.option.provenance.galleryId||r.original_source?.source_url!==c.option.provenance.url)throw Error('review_scope_mismatch');
    const entry:PreparedMealEntry={confirmationId:result.requestId,owner:c.owner,date:c.date,meal:c.meal,sourceReceiptId:c.sourceReceiptId,optionId:r.option_id,name:r.name,multiplier:r.servings,
     ...(composition?{components:composition.components}:{}),portionLabel:String(r.servings)+' x '+c.option.nutrition.basis.label,...(r.physical_portion?{physicalPortion:r.physical_portion}:{}),nutrition:r.values,authority:r.authority,assumptions:r.assumptions,readyForConfirmation:r.ready_for_explicit_confirmation===true};
    return entry;
   },
   prepareIdentity:deps.catalogIdentity,
  confirm:async(entry,identityId,consent)=>{const payload=deps.catalogIdentity?(identityId&&consent?coachCatalogDiaryPayload(entry,consent,identityId):(()=>{throw Error('catalog_consent_required')})()):existingMealLogPayload(context,entry);const written=await deps.write({...payload,p_logged_at:new Date().toISOString()}) as any;const mealItemId=typeof written?.meal_item_id==='string'?written.meal_item_id:null;if(mealItemId){if(deps.persistPrivateDetailsLink){try{await deps.persistPrivateDetailsLink(entry.owner,mealItemId,entry.confirmationId,entry.optionId);}catch{/* The diary row is already saved; never repeat log_food to repair metadata. */}}else deps.reportPrivateDetailsOutcome?.('private_link_writer_unavailable');try{await saveCoachPrivateMealDetails(deps.store,entry.owner,mealItemId,entry,context.option);}catch{/* Local detail enrichment must never change the diary save result. */}}else deps.reportPrivateDetailsOutcome?.('log_food_missing_meal_item_id');},
  },cached?.edit);
 }
 async function importDiscovery(access:MealAccess,result:MealResponse):Promise<MealChoiceOutcome>{if(result.kind!=='ready')return result;if(await deps.owner()!==result.owner||deps.today()!==result.date)return {kind:'blocked',reason:'scope_changed'};return choices(await deps.transport.run(access,{operation:'import_discovery',source_request_id:result.requestId},{flowId:result.flowId,meal:result.meal,mode:result.mode}));}
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
  savedDetails:(mealItemId:string)=>deps.resolvePrivateDetails?.(mealItemId)??Promise.resolve(null),
  listSaved:(access:()=>ReturnType<MealReviewDependencies['access']>)=>deps.transport.savedFlows.list(access),
  restoreSaved:async(access:()=>ReturnType<MealReviewDependencies['access']>,flow:Parameters<typeof deps.transport.savedFlows.recover>[1])=>{const r=await deps.transport.savedFlows.recover(access,flow);return r.kind==='ready'?choices({...r,flowId:'saved:'+r.requestId,meal:'lunch'}):{kind:'unavailable' as const,reason:'saved_options_unavailable'};},
  restore:async(access:MealAccess,flowId?:string)=>choices(await deps.transport.restore(access,flowId)),
  explore:async(access:MealAccess,input:MealExploreInput,meal:DailyMealSlot,flowId?:string)=>choices(await deps.transport.run(access,{operation:'explore',...input},{flowId,meal,mode:input.mode})),
  prepareSelected:async(access:MealAccess,handoff:ScopedMealConversation,flowId?:string,optionId?:string)=>{
   const value=parseMealConversation(handoff.value),owner=await deps.owner();
   if(!value||(optionId?!value.options.some(o=>o.id===optionId):!value.selected_meal)||!handoff.requestId||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(handoff.requestId)||owner!==handoff.owner||deps.today()!==handoff.date||dailyAccess(typeof access==='function'?access():access)!=='ready')return {kind:'blocked',reason:'selected_meal_unavailable'} as const;
   return choices(await deps.transport.run(access,optionId?{operation:'prepare_general_estimate',source_request_id:handoff.requestId,option_id:optionId}:{operation:'prepare_general_estimate',source_request_id:handoff.requestId,portion_label:value.selected_meal!.portion_label,general_meal_acknowledged:true},{flowId,meal:'lunch',mode:value.fields.mode??'quick'}));
  },
  prepareGeneral:async(access:MealAccess,source:MealChoices,portion:string)=>{
   if(!source.noResults||!portion.trim()||portion.length>160||await deps.owner()!==source.owner||deps.today()!==source.date||dailyAccess(typeof access==='function'?access():access)!=='ready')return {kind:'blocked',reason:'general_meal_confirmation_required'} as const;
   return choices(await deps.transport.run(access,{operation:'prepare_general_estimate',source_request_id:source.noResults.sourceRequestId,portion_label:portion.trim(),general_meal_acknowledged:true},{flowId:source.flowId,meal:source.meal,mode:source.mode}));
  },
  discover:async(access:MealAccess,source:MealChoices)=>{
   if(!source.capabilities.discovery||!source.publicRequest||await deps.owner()!==source.owner||deps.today()!==source.date||dailyAccess(typeof access==='function'?access():access)!=='ready')return {kind:'blocked',reason:source.capabilities.reason??'discovery_unavailable'} as const;
   return importDiscovery(access,await deps.transport.run(access,{operation:'discover',source_request_id:source.requestId,consent:true},{flowId:source.flowId,meal:source.meal,mode:source.mode}));
  },
  retrySearch:async(access:MealAccess,offer:MealRetryOffer)=>importDiscovery(access,await deps.transport.retry(access,offer)),
  estimate:async(access:MealAccess,source:MealChoices,optionId:string,portionLabel?:string)=>{
   if(!source.capabilities.estimate||!source.options.some(o=>o.id===optionId)||await deps.owner()!==source.owner||deps.today()!==source.date||dailyAccess(typeof access==='function'?access():access)!=='ready')return {kind:'blocked',reason:source.capabilities.reason??'estimate_unavailable'} as const;
   const originalPortion=source.options.find(o=>o.id===optionId)?.identity?.portion_label;
   const override=portionLabel?.trim();
   return choices(await deps.transport.run(access,{operation:'estimate',source_request_id:source.requestId,option_id:optionId,consent:true,...(override&&override!==originalPortion?.trim()?{portion_label:override}:{})},{flowId:source.flowId,meal:source.meal,mode:source.mode}));
  },
  async recover(access:()=>ReturnType<MealReviewDependencies['access']>,flowId?:string){
   const pending=await deps.transport.pending(access);if(!pending)return {kind:'blocked',reason:'no_pending_request'} as const;
   if(flowId!==undefined&&pending.flowId!==flowId)return {kind:'blocked',reason:'recovery_scope_mismatch'} as const;
   // Resolve the admitted option before consuming the pending review receipt.
   // A failed identity lookup must leave that exact review recoverable.
   let reviewSource:any;
   if(pending.envelope.operation==='review'){
    const optionId=pending.envelope.option_id;
    const source=await deps.transport.readSource(access,pending.envelope.source_request_id,{meal:pending.meal,mode:pending.mode});
    if(source.kind!=='ready')return source;
    reviewSource=source.body.options.find((o:any)=>o.id===optionId);
    if(!reviewSource)return {kind:'unavailable',reason:'review_source_unavailable'} as const;
   }
   const result=await deps.transport.recover(access);
   if(pending.envelope.operation==='discover')return importDiscovery(access,result);
   if(pending.envelope.operation==='review'&&result.kind==='ready'){
    const r=result.body.review;if(!r||r.logged!==false)return {kind:'unavailable',reason:'invalid_review'} as const;
    // Recovery receipts omit allergy status. Keep ingredient review available;
    // never downgrade a previously required acknowledgement to unknown.
    const identity=reviewSource?.identity;
    const sourceRecipe=identity?.kind==='recipe'&&pending.mode!=='eat_out'&&reviewSource?.provenance?.kind==='estimate'&&typeof reviewSource.provenance.source_url==='string'&&r.original_source?.source_url===reviewSource.provenance.source_url&&r.option_id===reviewSource.id&&r.name===reviewSource.name&&mealEvidenceFromOption(reviewSource,pending.mode)?.kind==='recipe';
    if(r.original_source?.kind==='estimate'&&identity?.kind!=='general_meal'&&!sourceRecipe)return {kind:'unavailable',reason:'general_review_identity_unavailable'} as const;
    const additionsRequest=pending.envelope.component_additions;
    const cleared=r.components_cleared===true;
    if(cleared&&(!Array.isArray(r.components)||r.components.length!==0||!pending.envelope.edited_values||pending.envelope.component_edits!==undefined||additionsRequest?.length))return {kind:'unavailable',reason:'invalid_component_clear'} as const;
    const option=mealEvidenceFromOption({id:r.option_id,name:r.name,provenance:r.original_source,nutrition:r.review_basis??r.original_nutrition,source_nutrition:r.original_nutrition,physical_portion:reviewSource?.physical_portion??undefined,identity,components:cleared?undefined:reviewSource?.components,total_time:reviewSource?.total_time,match:reviewSource?.match,ingredients:[],instructions:[],allergy_status:'requires_review',review_required:true,dietary_constraints:r.dietary_constraints},pending.mode);
    if(!option)return {kind:'unavailable',reason:'invalid_review'} as const;
    const context={owner:result.owner,date:result.date,meal:pending.meal,sourceReceiptId:pending.envelope.source_request_id,option};
    const scaled=scaleMealNutrition(option,r.servings);if(!scaled)return {kind:'unavailable',reason:'invalid_portion'} as const;
    const edit:MealReviewEdit={multiplier:r.servings,values:option.components?scaled:r.values,changed:option.components?[]:NUTRIENTS.filter(k=>scaled[k]!==r.values[k]),componentEdits:pending.envelope.component_edits,componentAdditions:pending.envelope.component_additions,additionPreviews:Array.isArray(r.components)?r.components.filter((c:any)=>additionsRequest?.some((a:any)=>c.id==='catalog-'+a.food_item_id)).map((c:any)=>({...c,quantity:c.quantity/r.servings,grams:c.grams===null?null:c.grams/r.servings,nutrition:Object.fromEntries(NUTRIENTS.map(k=>[k,c.nutrition[k]/r.servings]))})):undefined,estimateAcknowledged:pending.envelope.estimate_acknowledged,ingredientAcknowledged:pending.envelope.ingredient_review_acknowledged};
    return {kind:'recovered_review' as const,session:session(context,access,{response:result,edit},pending.flowId)};
   }
   return choices(result);
  },
  review(source:MealChoices,optionId:string,access:()=>ReturnType<MealReviewDependencies['access']>){const option=source.options.find(o=>o.id===optionId);if(!option)throw Error('option_not_found');return session({owner:source.owner,date:source.date,meal:source.meal,sourceReceiptId:source.requestId,option},access,undefined,source.flowId);},
 };
}
export type MealExperienceServices=ReturnType<typeof createMealServices>;
