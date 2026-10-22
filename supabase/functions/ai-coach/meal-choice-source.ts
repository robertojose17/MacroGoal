import type {Candidate,Mode} from './meal-choice.ts';
import {projectLookupOptions,recommendationMealDraft} from './_shared/coach-recommendation-contract.ts';
import {allowedEvidenceURL} from './coach-source-pages.ts';
// Reuse only an owned, completed receipt from the already verified search path.
// This adapter never invokes search, external fetch, logging or a provider.
export async function receiptCandidates(db:any,owner:string,requestId:string,mode:Mode,now=Date.now()):Promise<Candidate[]>{
 const {data,error}=await db.rpc('coach_recover_requests_v1',{p_user_id:owner,p_request_id:requestId,p_offset:0});
 if(error||!Array.isArray(data))throw Error('source_receipt_unavailable');
 const row=data.find((r:any)=>r.request_id===requestId);if(!row)return [];
 if(row.user_id!==undefined&&row.user_id!==owner)throw Error('source_owner_mismatch');
 const created=Date.parse(row.created_at);if(row.state!=='completed'||!Number.isFinite(created)||created>now||now-created>24*60*60*1000)return [];
 const options=row.result?.verified_food?projectLookupOptions(undefined,row.result.verified_food):row.result?.lookup_options;
 return projectVerifiedOptions(options,owner,mode);
}
export function projectVerifiedOptions(options:unknown,owner:string,mode:Mode):Candidate[]{
 if(!Array.isArray(options))return [];
 return options.slice(0,12).flatMap((o:any):Candidate[]=>{
  if(o.complete_item_verified!==true||o.nutrition_status!=='complete_verified'||!recommendationMealDraft(o,'2000-01-01','lunch',1))return [];
  const mapped:Mode=o.kind==='retrieved_recipe'?'cook':o.kind==='restaurant'?'eat_out':'quick';if(mapped!==mode)return [];
  const url=allowedEvidenceURL(o._source_url??o.recipe?.sourceUrl);if(!url)return [];
  const snack=/\b(cookie|cookies|donut|doughnut|brownie|candy|ice cream|sorbet|chips|galleta|galletas|dona|donas|caramelo|helado)\b/i.test(o.item_name);
  // Verified complete product is not proof of a complete meal. Packaged foods
  // need composition review; don't label a cookie/donut a lunch from its macros.
  // Narrow dish-family classification, not evidence of dietary suitability.
  // Unknown titles stay unknown; neither calories nor a brand name prove a meal.
  const dish=/\b(salad|bowl|sandwich|burger|pizza|pasta|stew|curry|burrito|omelet|omelette|ensalada|guiso|hamburguesa)\b/i.test(o.item_name);
  const mealKind=snack?'snack':o.kind==='product'||!dish?'unknown':'meal';
  return [{id:o.option_id,owner,name:o.item_name,source:o.kind,sourceRef:url,mode:mapped,mealKind,slots:mealKind==='snack'?['snack']:['breakfast','lunch','dinner','snack'],nutrition:{calories:o.nutrition.calories,protein:o.nutrition.protein,carbs:o.nutrition.carbs,fats:o.nutrition.fats,fiber:o.nutrition.fiber},portionLabel:o.serving.label,allowedServings:o.kind==='retrieved_recipe'?[0.5,1,1.5,2]:[1],evidence:'verified',ingredients:o.recipe?.ingredients?.map((i:any)=>i.ingredient)??null,allergens:null,allergenCoverage:'unknown',diet:'unknown'}];
 });
}
