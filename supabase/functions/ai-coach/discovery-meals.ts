import {safeCitationURL} from './coach-sources.ts';
import {allowedEvidenceURL} from './coach-source-pages.ts';
import {recommendationMealDraft} from './_shared/coach-recommendation-contract.ts';
import type {MealOption} from './gallery-meals.ts';
// Only call with an owned completed modern receipt read by the server. Public
// source references are evidence of identity, not automatic nutrition certainty.
export function ownedDiscoveryMeals(result:any):MealOption[]{
 const out:MealOption[]=[],seen=new Set<string>();
 for(const o of Array.isArray(result?.lookup_options)?result.lookup_options:[]){
  const source=allowedEvidenceURL(o?._source_url??o?.recipe?.sourceUrl);if(!source||!recommendationMealDraft(o,'2000-01-01','lunch',1)||o.complete_item_verified!==true||o.nutrition_status!=='complete_verified')continue;
  const id=String(o.option_id);seen.add(id);
  out.push({...(typeof o.dietary_evidence==='string'&&o.dietary_evidence.length<=400?{dietary_evidence:o.dietary_evidence}:{}),...(o.match?{match:structuredClone(o.match)}:{}),id,name:o.item_name,...(o.kind==='restaurant'&&typeof o.restaurant_name==='string'?{venue:{name:o.restaurant_name,source_url:source}}:{}),identity:{kind:o.kind,entity:o.restaurant_name??o.brand,variant:o.variant,portion_label:o.serving.label},...(o.nutrition.basis?.unit==='g'&&Number.isFinite(o.nutrition.basis.amount)?{physical_portion:{grams:o.nutrition.basis.amount,authority:'source_reported' as const}}:{}),ingredients:Array.isArray(o.recipe?.ingredients)?o.recipe.ingredients.map((i:any)=>i.ingredient):[],instructions:o.recipe?.instructions??[],prep_minutes:null,provenance:{kind:o.kind==='restaurant'?'official':'publisher',source_url:source},nutrition:{authority:o.kind==='restaurant'?'official':'publisher_reported',basis:{amount:1,unit:'serving',label:o.serving.label},values:{calories:o.nutrition.calories,protein:o.nutrition.protein,carbs:o.nutrition.carbs,fats:o.nutrition.fats,fiber:o.nutrition.fiber},assumptions:[...(o.match?.differences??[]),'Nutrition applies to the exact published item and portion; order modifications require review.'],confidence:'source_reported'},allergy_status:'unknown',review_required:true});
 }
 for(const o of Array.isArray(result?.discovery_options)?result.discovery_options:[]){
  if(!o||typeof o.id!=='string'||seen.has(o.id)||typeof o.name!=='string')continue;
  const binding=result.discovery_option_bindings?.[o.id],source=safeCitationURL(binding?.source_url);if(!source||binding.name!==o.name)continue;
  const addressSource=safeCitationURL(binding.address_source_url);
  const venue=binding.kind==='restaurant'&&typeof binding.entity==='string'?{name:binding.entity,source_url:safeCitationURL(binding.entity_source_url)??source,...(addressSource&&typeof binding.address==='string'&&binding.address===o.address?{address:binding.address,address_source_url:addressSource}:{})}:undefined;
  out.push({...(typeof binding.dietary_evidence==='string'&&binding.dietary_evidence.length<=400?{dietary_evidence:binding.dietary_evidence}:{}),...(binding.match?{match:binding.match}:{}),id:o.id,name:o.name,...(venue?{venue}:{}),identity:{kind:binding.kind,entity:binding.entity,variant:binding.variant},ingredients:[],instructions:[],prep_minutes:null,provenance:{kind:'estimate',source_url:source},nutrition:{authority:'unknown',basis:{amount:1,unit:'serving',label:'Portion needs your review'},values:{calories:null,protein:null,carbs:null,fats:null,fiber:null},assumptions:[...(binding.match?.differences??[]),...(binding.kind==='restaurant'?['Local availability and included components require confirmation with the restaurant.']:[]),'Source identifies this food; its portion and nutrition are not verified. Enter or obtain an estimate before logging.'],confidence:'unknown'},allergy_status:'requires_review',review_required:true});
 }
 return out.slice(0,3);
}
