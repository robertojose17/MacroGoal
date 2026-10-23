import type {MealOption} from './gallery-meals.ts';
import {dietaryConstraints,constrainMeals} from './dietary-constraints.ts';
import {compoundFoodParts} from './meal-retrieval-outcome.ts';
import {publicFood,publicPortionPart} from './coach-lookup-intent.ts';
export function validatePublicPortion(portion:unknown):asserts portion is string{
 if(typeof portion!=='string'||!portion.trim()||portion.length>160)throw Error('portion_clarification_required');
 // Validate every complete comma-delimited description; never strip private words.
 const parts=portion.split(',').map(x=>x.trim());
 if(parts.length>5||parts.some(x=>!publicPortionPart(x)))throw Error('portion_clarification_required');
}
export function validateGeneralEstimateOption(option:MealOption):void{
 const portion=option.identity?.portion_label;
 validatePublicPortion(portion);
 const screened=constrainMeals([{...option,ingredients:[...option.ingredients,portion]}],dietaryConstraints(option.dietary_constraints));
 if(!screened.length)throw Error('general_meal_conflicts_with_constraints');
}
export function prepareGeneralMeal(origin:any,portion:string):MealOption{
 const name=origin?.discovery_request?.food;
 if(typeof name!=='string'||name.length>160||(!publicFood(name)&&!(compoundFoodParts(name)?.every(part=>!!publicFood(part)))))throw Error('general_food_clarification_required');
 validatePublicPortion(portion);
 const option:MealOption={id:'general-meal',name,identity:{kind:'general_meal',portion_label:portion.trim()},ingredients:[],instructions:[],prep_minutes:null,provenance:{kind:'estimate'},nutrition:{authority:'unknown',basis:{amount:1,unit:'serving',label:portion.trim()},values:{calories:null,protein:null,carbs:null,fats:null,fiber:null},confidence:'unknown',assumptions:['User-described general meal; not a verified restaurant item or available menu order.','Portion is user-described; physical weight and all nutrient values are unknown until explicitly estimated.','Ingredients, preparation, allergens and cross-contact are unverified.']},allergy_status:'requires_review',review_required:true};
 const screened=constrainMeals([option],dietaryConstraints(origin.dietary_constraints));
 if(!screened.length)throw Error('general_meal_conflicts_with_constraints');
 validateGeneralEstimateOption(screened[0]);
 return screened[0];
}
