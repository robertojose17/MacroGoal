import {nutrients,type MealOption,type Values} from './gallery-meals.ts';
export function reviewMeal(option:MealOption,input:{servings:number;edited_values?:Partial<Values>;estimate_acknowledged:boolean;ingredient_review_acknowledged:boolean;modification?:string}){
 if(!Number.isFinite(input.servings)||input.servings<=0||input.servings>20)throw Error('invalid_portion');
 const edited=input.edited_values;
 if(edited&&Object.keys(edited).some(k=>!nutrients.includes(k as any)))throw Error('invalid_nutrient_edit');
 if(edited&&Object.values(edited).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('invalid_nutrient_edit');
 if(input.modification&&(!edited||!input.modification.trim()||input.modification.length>300))throw Error('modified_order_requires_editable_estimate');
 const values=Object.fromEntries(nutrients.map(k=>[k,edited&&Object.hasOwn(edited,k)?edited[k]:option.nutrition.values[k]===null?null:Math.round(option.nutrition.values[k]!*input.servings*10)/10])) as Values;
 const authority=edited||input.modification?'user_edited':option.nutrition.authority;
 const needsEstimate=['estimated','user_edited','unknown'].includes(authority);
 const complete=nutrients.every(k=>values[k]!==null)&&Number(values.calories)>0;
 const ready=complete&&(!needsEstimate||input.estimate_acknowledged===true)&& (option.allergy_status!=='requires_review'||input.ingredient_review_acknowledged===true);
 return {...(option.total_time?{total_time:structuredClone(option.total_time)}:{}),...(option.match?{match:structuredClone(option.match)}:{}),dietary_constraints:option.dietary_constraints??null,ingredient_warning:option.dietary_constraints?'Verify ingredients, allergens and cross-contact with the restaurant/source; suitability is not guaranteed.':null,option_id:option.id,name:option.name,servings:input.servings,values,authority,original_source:option.provenance,original_nutrition:option.source_nutrition??option.nutrition,review_basis:option.nutrition,physical_portion:option.physical_portion?{...option.physical_portion,total_grams:Math.round(option.physical_portion.grams*input.servings*10)/10}:null,assumptions:[...option.nutrition.assumptions,...(edited?['Edited values describe the entire selected portion, not one serving.']:[]),...(input.modification?[`Order modification: ${input.modification}. Nutrition is an explicit user-edited estimate.`]:[])],ready_for_explicit_confirmation:ready,next_action:ready?'confirm_in_existing_log_flow':'review_estimate_inputs',logged:false};
}
