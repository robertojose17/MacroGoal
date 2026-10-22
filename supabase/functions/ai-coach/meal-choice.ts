import {validNutrition,type Nutrition,type DailyData,dailyContext} from './manual/daily.ts';
import {exclusionTerms,containsExcludedIngredient} from './ingredient-constraints.ts';
export type Mode='cook'|'eat_out'|'quick'|'saved';
export type ChoiceInput={mode:Mode;meal_type:'breakfast'|'lunch'|'dinner'|'snack';constraints:{allergens:string[];exclude_ingredients:string[];diet:'unrestricted'|'vegetarian'|'vegan'};preference:'balanced'|'protein';meals_remaining:number;diary_complete:boolean};
// Only server adapters construct these; never accept candidate data from clients.
export type Candidate={id:string;owner:string;name:string;source:'saved_meal'|'retrieved_recipe'|'restaurant'|'product';sourceRef:string;mode:Mode;mealKind:'meal'|'snack'|'unknown';slots:Array<ChoiceInput['meal_type']>;nutrition:Nutrition;portionLabel:string;allowedServings:number[];evidence:'verified'|'advisory';ingredients:string[]|null;allergens:string[]|null;allergenCoverage:'complete'|'unknown';diet:'vegan'|'vegetarian'|'unrestricted'|'unknown';recipeDetails?:{source_servings:number;ingredients:string[];instructions:string[]}};
const keys=['calories','protein','carbs','fats','fiber'] as const;
const norm=(s:string)=>s.normalize('NFKC').trim().toLowerCase();
const round=(n:number,step:number)=>Math.round(n/step)*step;
export function mealQuestion(body:any){
 if(!['cook','eat_out','quick','saved'].includes(body.mode))return {key:'mode',choices:['cook','eat_out','quick','saved']};
 if(!['breakfast','lunch','dinner','snack'].includes(body.meal_type))return {key:'meal_type',choices:['breakfast','lunch','dinner','snack']};
 if(!body.constraints)return {key:'constraints',choices:[]};
 if(Array.isArray(body.constraints.exclude_ingredients)){const {unsupported}=exclusionTerms(body.constraints.exclude_ingredients);if(unsupported.length)return {key:'exclude_ingredients',reason:'unsupported_ingredient_terms',unsupported,choices:[]};}
 if(!Number.isInteger(body.meals_remaining)||body.meals_remaining<1||body.meals_remaining>4)return {key:'meals_remaining',choices:[1,2,3,4]};
 if(typeof body.diary_complete!=='boolean')return {key:'diary_complete',choices:[true,false]};
 return null;
}
export function validConstraints(c:any){return c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).every(k=>['allergens','exclude_ingredients','diet'].includes(k))&&['unrestricted','vegetarian','vegan'].includes(c.diet)&&[c.allergens,c.exclude_ingredients].every(xs=>Array.isArray(xs)&&xs.length<=12&&xs.every(x=>typeof x==='string'&&x.trim().length>0&&x.length<=60));}
export function chooseMeals(input:ChoiceInput,data:DailyData,rows:Candidate[],owner:string,date:string){
 const {unsupported}=exclusionTerms(input.constraints.exclude_ingredients);if(unsupported.length)return {status:'clarify',question:{key:'exclude_ingredients',reason:'unsupported_ingredient_terms',unsupported,choices:[]},next_step:'clarify_ingredient_exclusions',options:[]};
 const context=dailyContext(data,owner,date);if(context.status!=='ready')return {status:'coverage_unavailable',reason:'context_unavailable',next_step:'review_diary',options:[]};
 // A successful empty log read is not proof of no consumption.
 const budget=input.diary_complete&&context.target&&context.remaining?{
  calories:round((context.remaining.calories??0)/input.meals_remaining,25),
  protein:round((context.remaining.protein??0)/input.meals_remaining,5),
  basis:'approximate_equal_split_of_confirmed_recorded_remainder',meals_including_this:input.meals_remaining
 }:null;
 const exhausted=!!budget&&context.remaining!.calories<=0;
 const ranked:Array<{score:number;option:any}>=[];const seen=new Set<string>();
 for(const c of rows){
  if(c.owner!==owner||seen.has(c.id)||!c.id||!c.sourceRef||!c.name||c.name.length>300)continue;seen.add(c.id);
  if(c.mode!==input.mode||c.evidence!=='verified'||!validNutrition(c.nutrition)||c.nutrition.calories<=0||!c.portionLabel||!c.slots.includes(input.meal_type))continue;
  if(c.mealKind==='unknown'||input.meal_type!=='snack'&&c.mealKind!=='meal')continue;
  if(input.constraints.allergens.length&&(c.allergenCoverage!=='complete'||!c.allergens||input.constraints.allergens.some(a=>c.allergens!.some(b=>norm(a)===norm(b)))))continue;
  if(input.constraints.exclude_ingredients.length&&(!c.ingredients||containsExcludedIngredient(c.ingredients,input.constraints.exclude_ingredients)))continue;
  if(input.constraints.diet==='vegan'&&c.diet!=='vegan'||input.constraints.diet==='vegetarian'&&!['vegan','vegetarian'].includes(c.diet))continue;
  let best:any=null;
  for(const serving of c.allowedServings){
   if(!Number.isFinite(serving)||serving<0.5||serving>2)continue;
   const nutrition=Object.fromEntries(keys.map(k=>[k,Math.round(c.nutrition[k]*serving*10)/10])) as Nutrition;
   if(!validNutrition(nutrition))continue;
   // Fit is soft; no exclusion based only on macro mismatch or moral food labels.
   const calorieFit=budget&&budget.calories>0?Math.abs(nutrition.calories-budget.calories)/budget.calories:0;
   const proteinFit=budget&&budget.protein>0?Math.max(0,budget.protein-nutrition.protein)/budget.protein:0;
   const score=exhausted?Math.abs(serving-1):calorieFit+proteinFit*(input.preference==='protein'?1:0.35)+(budget&&budget.calories>0?0:Math.abs(serving-1));
   const option={id:c.id,name:c.name,source:c.source,source_ref:c.sourceRef,portion:{source_servings:serving,source_label:c.portionLabel},nutrition,nutrition_authority:'source_snapshot',...(c.recipeDetails?{recipe_details:{...c.recipeDetails,basis:'original_recipe_yield_not_scaled'}}:{}),fit:budget?{calories_vs_planning_share:round(nutrition.calories-budget.calories,25),protein_vs_planning_share:round(nutrition.protein-budget.protein,5),label:exhausted?'recorded_budget_exhausted':budget.calories>0&&calorieFit<=0.25?'near_planning_share':'different_from_planning_share',...(exhausted?{message:'Your recorded intake has reached the daily calorie target. These remain meal options; this is not advice to skip a meal.'}:{})}:{label:'budget_unknown'},next_action:'review_source',requires_explicit_add:true};
   if(!best||score<best.score)best={score,option};
  }if(best)ranked.push(best);
 }
 const names=new Set<string>();const options=ranked.sort((a,b)=>a.score-b.score||a.option.id.localeCompare(b.option.id)).filter(x=>{const name=norm(x.option.name);if(names.has(name))return false;names.add(name);return true;}).slice(0,3).map(x=>x.option);
 return {status:options.length?'options':'coverage_unavailable',context:{coverage:'logged_only',entry_count:context.entry_count,logged:context.logged,target:context.target,remaining:context.remaining,planning_share:budget,diary_complete_confirmed:input.diary_complete},reason:options.length?undefined:'no_verified_constraint_compatible_meals',next_step:options.length?'review_source':({cook:'review_recipe_source',eat_out:'choose_restaurant_menu',quick:'review_no_cook_items',saved:'review_saved_meal_components'}[input.mode]),options};
}
