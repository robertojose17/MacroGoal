import {estimateAssumptions,presentedSourceNutrition} from './estimate-integrity.ts';
import {constrainMeals,dietaryConstraints} from './dietary-constraints.ts';
import {editComponents,type MealComponent} from './meal-components.ts';
import {nutrients,type MealOption,type Values} from './gallery-meals.ts';
export function reviewMeal(option:MealOption,input:{servings:number;edited_values?:Partial<Values>;estimate_acknowledged:boolean;ingredient_review_acknowledged:boolean;modification?:string;component_edits?:Array<{component_id:string;quantity:number}>}, additions:MealComponent[]=[]){
 if(!Number.isFinite(input.servings)||input.servings<=0||input.servings>20)throw Error('invalid_portion');
 const aggregateCorrection=input.edited_values!==undefined||input.modification!==undefined;
 if(aggregateCorrection&&(input.component_edits!==undefined||additions.length))throw Error('mixed_component_and_aggregate_edit');
 if(option.components&&option.physical_portion?.authority==='source_reported'){
  const original=editComponents(option.components,undefined,[],1),known=original.components.reduce((sum,c)=>sum+(c.grams??0),0);
  if(known>option.physical_portion.grams+0.1||original.grams!==null&&Math.abs(original.grams-option.physical_portion.grams)>0.1)throw Error('inconsistent_component_mass');
 }
 const composed=option.components&&!aggregateCorrection?editComponents(option.components,input.component_edits,additions,input.servings):null;
 const componentChanged=input.component_edits!==undefined||additions.length>0;
 const physical=option.physical_portion&&!componentChanged?{...option.physical_portion,total_grams:Math.round(option.physical_portion.grams*input.servings*10)/10}:composed&&composed.grams!==null?{grams:composed.grams,total_grams:composed.grams,authority:'estimated' as const}:null;
 if(!composed&&(input.component_edits!==undefined||additions.length))throw Error('components_unavailable');
 if(composed&&option.dietary_constraints&&!constrainMeals([{...option,ingredients:composed.components.map(c=>c.name)}],dietaryConstraints(option.dietary_constraints)).length)throw Error('meal_conflicts_with_constraints');
 const edited=input.edited_values;
 if(edited&&Object.keys(edited).some(k=>!nutrients.includes(k as any)))throw Error('invalid_nutrient_edit');
 if(edited&&Object.values(edited).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('invalid_nutrient_edit');
 if(input.modification&&(!edited||!input.modification.trim()||input.modification.length>300))throw Error('modified_order_requires_editable_estimate');
 const values=composed?composed.values:Object.fromEntries(nutrients.map(k=>[k,edited&&Object.hasOwn(edited,k)?edited[k]:option.nutrition.values[k]===null?null:Math.round(option.nutrition.values[k]!*input.servings*10)/10])) as Values;
 const authority=composed?(composed.components.some(c=>c.authority==='estimated')?'estimated':input.component_edits!==undefined||additions.length?'user_edited':option.nutrition.authority):edited||input.modification?'user_edited':option.nutrition.authority;
 const needsEstimate=['estimated','user_edited','unknown'].includes(authority);
 const complete=nutrients.every(k=>values[k]!==null)&&Number(values.calories)>0;
 const ready=complete&&(!needsEstimate||input.estimate_acknowledged===true)&& (option.allergy_status!=='requires_review'||input.ingredient_review_acknowledged===true);
 const shownNutrition=['estimated','user_edited'].includes(option.nutrition.authority)?{...option.nutrition,assumptions:estimateAssumptions(option)}:option.nutrition;
 const currentAssumptions=componentChanged?[
  'Nutrition was recalculated from the selected ingredient quantities and any added catalog foods; original preparation assumptions may no longer apply.',
  'Estimated ingredient nutrition and mass remain approximate. Catalog values are not independently verified.',
  'Ingredients, preparation, allergens and cross-contact remain unverified.'
 ]:shownNutrition.assumptions;
 return {...(composed?{components:composed.components}:aggregateCorrection&&option.components?{components:[],components_cleared:true}:{}),...(option.total_time?{total_time:structuredClone(option.total_time)}:{}),...(option.match?{match:structuredClone(option.match)}:{}),dietary_constraints:option.dietary_constraints??null,ingredient_warning:option.dietary_constraints?'Verify ingredients, allergens and cross-contact with the restaurant/source; suitability is not guaranteed.':null,option_id:option.id,name:option.name,servings:input.servings,values,authority,original_source:option.provenance,original_nutrition:presentedSourceNutrition(option),review_basis:shownNutrition,physical_portion:physical,assumptions:[...currentAssumptions,...(edited?['Edited values describe the entire selected portion, not one serving.']:[]),...(aggregateCorrection&&option.components?['Aggregate correction clears the ingredient nutrition allocation; component totals no longer represent this corrected meal.']:[]),...(input.modification?[`Order modification: ${input.modification}. Nutrition is an explicit user-edited estimate.`]:[])],ready_for_explicit_confirmation:ready,next_action:ready?'confirm_in_existing_log_flow':'review_estimate_inputs',logged:false};
}
