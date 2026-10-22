import type {DailyPolicy} from './v202-admission.ts';
import {validNutrition} from './daily.ts';
export function savedMealReviewPolicy(db:any):DailyPolicy{
 return {
  async checkRequest(owner){
   const {data,error}=await db.from('coach_permissions').select('permission_level,can_add_food').eq('user_id',owner).maybeSingle();
   return !error&&[2,3,4].includes(data?.permission_level)&&data.can_add_food===true?{allowed:true}:{allowed:false,reason:'safety_gate'};
  },
  async checkSavedMeal(owner,id){
   const {data,error}=await db.from('saved_meals').select('id,user_id,name,saved_meal_items(calories,protein,carbs,fat,fiber,serving_amount,servings_count)').eq('user_id',owner).eq('id',id).maybeSingle();
   if(error||!data||data.user_id!==owner||data.id!==id||typeof data.name!=='string'||!data.name.trim()||data.name.length>300||!Array.isArray(data.saved_meal_items)||!data.saved_meal_items.length)return false;
   return data.saved_meal_items.every((r:any)=>validNutrition({calories:r.calories,protein:r.protein,carbs:r.carbs,fats:r.fat,fiber:r.fiber})&&typeof r.serving_amount==='number'&&Number.isFinite(r.serving_amount)&&r.serving_amount>0&&typeof r.servings_count==='number'&&Number.isFinite(r.servings_count)&&r.servings_count>0);
  }
 };
}
// Eligibility means owned, complete stored data suitable for explicit Details
// review. It makes no allergy/medical/dietary suitability claim. No memory read,
// inferred restriction, transcript disclosure, external lookup or diary mutation.
