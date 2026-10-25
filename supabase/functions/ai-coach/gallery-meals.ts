import {containsExcludedIngredient,exclusionTerms} from './ingredient-constraints.ts';
export const nutrients=['calories','protein','carbs','fats','fiber'] as const;
export type Values=Record<typeof nutrients[number],number|null>;
export type MealOption={components?:import('./meal-components.ts').MealComponent[];total_time?:{minutes:number;authority:'source_reported';source_url:string};estimated_prep_minutes?:number;dietary_evidence?:string;match?:import('./restaurant-similarity.ts').RestaurantMatch;dietary_constraints?:import('./dietary-constraints.ts').DietaryConstraints;venue?:{name:string;source_url:string;address?:string;address_source_url?:string};source_nutrition?:MealOption['nutrition'];physical_portion?:{grams:number;authority:'source_reported'|'estimated'};identity?:{kind?:string;entity?:string;variant?:string;portion_label?:string};id:string;name:string;ingredients:string[];instructions:string[];prep_minutes:number|null;provenance:{kind:'gallery'|'official'|'publisher'|'estimate';gallery_id?:string;source_url?:string};nutrition:{authority:'official'|'publisher_reported'|'estimated'|'user_edited'|'unknown';basis:{amount:number;unit:'serving';label:string};values:Values;assumptions:string[];confidence:'source_reported'|'low'|'unknown'};allergy_status:'unknown'|'requires_review';review_required:true};
const n=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)&&Number.isFinite(Number(v))?Number(v):null;
const words=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
const stop=new Set('i want would like please something with a an the me some and recipe recipes meal eat cook quiero quisiera algo con de el la los las para una un receta recetas comer cocinar'.split(' '));
const canonicalWord=(word:string)=>exclusionTerms([word]).groups[0]?.[0]??word;
export function foodSearchTerms(query:string){return words(query).filter(w=>w.length>1&&!stop.has(w)).map(canonicalWord).slice(0,12);}
const text=(v:any)=>typeof v==='string'?v.trim():typeof v?.name==='string'?`${typeof v.amount==='string'?v.amount+' ':''}${v.name}`:typeof v?.ingredient==='string'?v.ingredient:'';
const url=(v:unknown)=>{try{const u=new URL(String(v));return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?u.href:undefined;}catch{return undefined;}};
export function galleryOption(row:any):MealOption|null{
 const isMealGallery=typeof row.name==='string';
 const title=isMealGallery?row.name:row.title;
 if(typeof row.id!=='string'||typeof title!=='string'||!title.trim())return null;
 const ingredients=Array.isArray(row.ingredients)?row.ingredients.map(text).filter(Boolean):[];
 const rawInstructions=Array.isArray(row.instructions)?row.instructions.map((s:any)=>typeof s==='string'?s:typeof s?.text==='string'?s.text:''):typeof row.instructions==='string'?[row.instructions]:[];
 const instructions=rawInstructions.filter((s:any)=>typeof s==='string'&&s.trim().length>0&&s.length<=300&&!/[<>\u0000-\u001f\u007f]/.test(s)).slice(0,8);
 const values=isMealGallery?{calories:n(row.calories),protein:n(row.protein),carbs:n(row.carbs),fats:n(row.fat),fiber:null}:{calories:n(row.calories_per_serving),protein:n(row.protein_per_serving),carbs:n(row.carbs_per_serving),fats:n(row.fat_per_serving),fiber:n(row.fiber_per_serving)};
 const sourceURL=url(isMealGallery?row.source:row.source_url);
 return {id:row.id,name:title,ingredients,instructions,prep_minutes:isMealGallery?null:n(row.prep_time_minutes),provenance:{kind:'gallery',gallery_id:row.id,...(sourceURL?{source_url:sourceURL}:{})},nutrition:{authority:values.calories!==null?'estimated':'unknown',basis:{amount:1,unit:'serving',label:isMealGallery?'1 gallery entry; physical serving size unspecified':`1 stored recipe serving (recipe yield ${n(row.servings)??'unknown'})`},values,assumptions:['Stored gallery nutrition has not been independently verified.',...(isMealGallery?['Gallery schema does not establish serving size, preparation time or fiber; review those inputs before logging.']:['Ingredients and instructions describe the full original recipe; portion values are per stored serving.']),...(!ingredients.length?['Ingredient list is incomplete; exclusions and allergens cannot be cleared.']:[]),...(!instructions.length?['Preparation instructions are not present in this gallery entry.']:[])],confidence:values.calories!==null?'low':'unknown'},allergy_status:ingredients.length?'unknown':'requires_review',review_required:true};
}
export type GalleryQuery={desired_food:string;available_minutes?:number;exclusions:string[];allergens:string[];preference?:'balanced'|'high_protein'|'lower_calorie'|'preferred_food'};
export async function searchExistingGallery(db:any,input:GalleryQuery,owner:string){
 const terms=foodSearchTerms(input.desired_food).filter(term=>term.length>2);if(!terms.length)return {options:[] as MealOption[],coverage:'query_needs_food' as const};
 const libraryColumns='id,title,description,source_name,source_url,prep_time_minutes,servings,calories_per_serving,protein_per_serving,carbs_per_serving,fat_per_serving,fiber_per_serving,ingredients,instructions,tags,click_count';
 // Food > Recipes reads the public `recipes` library and stores a user's saved
 // snapshots in `saved_recipes`. This function uses service-role access, so the
 // private saved snapshot query is explicitly scoped and rechecked by owner.
 const [libraryResult,savedResult]=await Promise.all([
  db.from('recipes').select(libraryColumns).textSearch('search_vector',terms.map((term:string)=>term+':*').join(' & ')).order('click_count',{ascending:false}).limit(30),
  db.from('saved_recipes').select('id,user_id,recipe_data,created_at').eq('user_id',owner).order('created_at',{ascending:false}).limit(100),
 ]);
 if(libraryResult.error||savedResult.error)throw Error('gallery_unavailable');
 const savedRows=(Array.isArray(savedResult.data)?savedResult.data:[]).flatMap((saved:any)=>{
  if(saved?.user_id!==owner||typeof saved?.id!=='string'||!saved.recipe_data||typeof saved.recipe_data!=='object'||Array.isArray(saved.recipe_data))return [];
  const recipe=saved.recipe_data;
  if(typeof recipe.id!=='string'||recipe.id!==saved.id)return [];
  return [{
   id:recipe.id,title:typeof recipe.title==='string'?recipe.title:recipe.name,description:recipe.description,
   source_name:recipe.source_name,source_url:recipe.source_url,prep_time_minutes:recipe.prep_time_minutes,
   servings:recipe.servings,calories_per_serving:recipe.calories_per_serving,protein_per_serving:recipe.protein_per_serving,
   carbs_per_serving:recipe.carbs_per_serving,fat_per_serving:recipe.fat_per_serving,fiber_per_serving:recipe.fiber_per_serving,
   ingredients:recipe.ingredients,instructions:recipe.instructions,tags:recipe.tags,
  }];
 });
 const seen=new Set<string>();
 const rows=[...(Array.isArray(libraryResult.data)?libraryResult.data:[]),...savedRows].filter((row:any)=>{
  if(typeof row?.id!=='string'||seen.has(row.id))return false;
  seen.add(row.id);return true;
 });
 const ranked=rows.flatMap((r:any)=>{const option=galleryOption(r);if(!option)return [];
  const hay=words([option.name,r.description??'',...(Array.isArray(r.ingredients)?r.ingredients.map(text):[]),...(Array.isArray(r.tags)?r.tags:[])].join(' ')).map(canonicalWord);
  const score=terms.filter(t=>hay.some(w=>w.startsWith(t))).length/terms.length;if(score<1)return [];
  if(input.available_minutes!==undefined&&option.prep_minutes!==null&&option.prep_minutes>input.available_minutes)return [];
  if(input.available_minutes!==undefined&&option.prep_minutes===null)option.nutrition.assumptions.push(`Preparation time is unknown; the ${input.available_minutes}-minute preference is not verified.`);
  const supported=exclusionTerms(input.exclusions).unsupported.length===0;
  if(supported&&input.exclusions.length&&containsExcludedIngredient(option.ingredients,input.exclusions))return [];
  if(!supported||input.allergens.length)option.allergy_status='requires_review';
  // Unknown translated restrictions and cross-contact remain explicit review work,
  // not false certification or a fabricated complete allergen list.
  if(!supported)option.nutrition.assumptions.push('Some exclusions need ingredient review; their absence is not verified.');
  if(input.allergens.length)option.nutrition.assumptions.push('Allergen ingredients and cross-contact are not certified; review with the source before choosing.');
  return [{option,score}];
 });
 ranked.sort((a:any,b:any)=>b.score-a.score||(input.preference==='high_protein'?(b.option.nutrition.values.protein??-1)-(a.option.nutrition.values.protein??-1):input.preference==='lower_calorie'?(a.option.nutrition.values.calories??Infinity)-(b.option.nutrition.values.calories??Infinity):0)||a.option.id.localeCompare(b.option.id));
 return {options:ranked.slice(0,3).map((r:any)=>r.option) as MealOption[],coverage:'bounded_gallery_search' as const};
}
