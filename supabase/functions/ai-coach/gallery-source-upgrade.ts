import {publicRecipeURL,readPublisher,recipeMetadata} from './meal-choice-library.ts';
import {parseCompleteRecipe} from './coach-verified-food.ts';
import {publisherRecipe} from './publisher-recipe.ts';
import type {MealOption} from './gallery-meals.ts';
const same=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export async function upgradeGallerySources(options:MealOption[],request:typeof fetch,now:number){
 return Promise.all(options.slice(0,3).map(async option=>{
  const url=publicRecipeURL(option.provenance.source_url);if(!url)return option;
  try{const html=await readPublisher(url,request),meta=recipeMetadata(html);if(!meta||same(meta.name)!==same(option.name))return option;
   const at=new Date(now).toISOString(),parsed=parseCompleteRecipe(html,meta.name,url,at)??publisherRecipe(html,meta.name,url,at);const facts=parsed?.publisherNutrition?.fields;if(!facts)return option;
   const values={calories:facts.calories?.value??null,protein:facts.protein?.value??null,carbs:facts.carbs?.value??null,fats:facts.fat?.value??null,fiber:facts.fiber?.value??null};if(Object.values(values).some(v=>v===null||!Number.isFinite(v)))return option;
   return {...option,ingredients:parsed.ingredients.map((i:any)=>i.text),instructions:parsed.instructions,provenance:{...option.provenance,kind:'publisher' as const},nutrition:{authority:'publisher_reported' as const,basis:{amount:1,unit:'serving' as const,label:parsed.publisherServingDescription??'1 source serving'},values,assumptions:['Publisher-reported nutrition for the original recipe; modifications require an estimate.'],confidence:'source_reported' as const}};
  }catch{return option;}
 }));
}
