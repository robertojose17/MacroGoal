import {mealEvidenceFromOption} from './coachMealReviewAdapter';
import {parseConstraints,mergeConstraints,type DietaryConstraints} from './coachDietaryConstraints';
import type { MealExploreInput } from './coachMealTransport';
export type MealConversation = {schema:'meal_conversation_v1';fields:DietaryConstraints&{mode:'cook'|'quick'|'eat_out'|null;food_query:string|null;public_area:string|null;restaurant:string|null;preference:'balanced'|'high_protein'|'lower_calorie'|'preferred_food'|null};status:'clarify'|'ready';question:{key:'mode'|'food_query'|'public_area'}|null;requires_search_consent:boolean;constraints_review_required:true;options:Record<string,unknown>[];selected_meal?:{name:string;portion_label:string};next_action?:'prepare_general_estimate';requires_estimate_consent?:true};
export type ScopedMealConversation={requestId?:string;value:MealConversation;owner:string;date:string};
export function parseMealConversation(value:unknown):MealConversation|null {
 const v=value as any;if(!v||v.schema!=='meal_conversation_v1'||v.constraints_review_required!==true||!Array.isArray(v.options)||v.options.length>6||!v.fields||typeof v.fields!=='object'||Array.isArray(v.fields))return null;
 if(Object.keys(v).some(k=>!['schema','fields','status','question','requires_search_consent','constraints_review_required','options','selected_meal','next_action','requires_estimate_consent'].includes(k))||Object.keys(v.fields).some(k=>!['mode','food_query','public_area','restaurant','preference','exclusions','allergens','dietary_preferences','provenance','verification'].includes(k)))return null;
 const selected=v.selected_meal;
 const recommendations=v.options.length>0;
 if(recommendations&&(selected!==undefined||v.status!=='ready'||v.question!==null||!['cook','quick','eat_out'].includes(v.fields.mode)||v.requires_search_consent!==false||v.next_action!=='prepare_general_estimate'||v.requires_estimate_consent!==false||v.options.some((o:any)=>!mealEvidenceFromOption(o,v.fields.mode))||new Set(v.options.map((o:any)=>o.id)).size!==v.options.length))return null;
 if(selected!==undefined){
  if(!selected||typeof selected!=='object'||Array.isArray(selected)||Object.keys(selected).some(k=>!['name','portion_label'].includes(k))||['name','portion_label'].some(k=>typeof selected[k]!=='string'||!selected[k].trim()||selected[k].length>160||/[\r\n\x00-\x1f]/.test(selected[k]))||v.next_action!=='prepare_general_estimate'||v.requires_estimate_consent!==true||v.requires_search_consent!==false||v.status!=='ready'||v.fields.mode!=='quick'||v.fields.restaurant!==null||v.fields.public_area!==null)return null;
 }else if(!recommendations&&(v.requires_search_consent!==true||v.next_action!==undefined||v.requires_estimate_consent!==undefined))return null;
 if(!parseConstraints(v.fields))return null;
 const f=v.fields;if(f.mode!==null&&!['cook','quick','eat_out'].includes(f.mode)||f.preference!==null&&!['balanced','high_protein','lower_calorie','preferred_food'].includes(f.preference))return null;
 for(const k of ['food_query','public_area','restaurant'])if(f[k]!==null&&(typeof f[k]!=='string'||!f[k].trim()||f[k].length>160))return null;
 const missing=recommendations?null:!f.mode?'mode':f.mode==='eat_out'&&!f.public_area?'public_area':!f.food_query?'food_query':null;
 if(missing?(v.status!=='clarify'||v.question?.key!==missing):v.status!=='ready'||v.question!==null)return null;
 return JSON.parse(JSON.stringify(v));
}
export function mealConversationInput(value:MealConversation,restrictions:{exclusions:string[];allergens:string[];dietary_preferences?:string[]}):MealExploreInput|null {
 const v=parseMealConversation(value);if(!v||v.selected_meal||v.options.length||v.status!=='ready'||!v.fields.mode||!v.fields.food_query)return null;
 const f=v.fields;return {mode:f.mode!,food_query:f.food_query!,exclusions:restrictions.exclusions,allergens:restrictions.allergens,dietary_preferences:restrictions.dietary_preferences??f.dietary_preferences,...(f.restaurant?{restaurant:f.restaurant}:{}),...(f.public_area?{public_area:f.public_area}:{}),...(f.preference?{preference:f.preference}:{})};
}
