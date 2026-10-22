import type {Nutrition} from './coach-nutrition-evidence.ts';
// Isolated Allrecipes adapter: publisher-reported per-serving facts only.
// No inferred ingredient quantities, grams, food identity or calculated nutrition.
export function publisherRecipe(html:string,name:string,url:string,retrievedAt:string){
 if(new URL(url).hostname!=='www.allrecipes.com')return null;
 const nodes:any[]=[];const visit=(v:any)=>{if(Array.isArray(v))return v.forEach(visit);if(v&&typeof v==='object'){if([v['@type']].flat().includes('Recipe'))nodes.push(v);if(v['@graph'])visit(v['@graph']);}};
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(m[1]));}catch{}}
 if(nodes.length!==1||nodes[0].name!==name)return null;const r=nodes[0];
 // Do not override a conflicting/ambiguous explicit structured portion merely
 // because the visible page says per serving.
 if(r.nutrition?.servingSize!==undefined&&r.nutrition.servingSize!=='1 serving')return null;
 const visible=[...html.matchAll(/class="mm-recipes-details__label">Servings:<\/div>\s*<div class="mm-recipes-details__value">\s*(\d+)\s*<\/div>/g)];
 if(visible.length!==1)return null;const servings=Number(visible[0][1]);if(servings<1||servings>100)return null;
 const yields=[r.recipeYield].flat();if(!yields.length||yields.some(v=>typeof v!=='string'||!/^\d+(?:\s+servings?)?$/.test(v)||Number.parseInt(v)!==servings))return null;
 // Explicit visible per-serving heading must agree with this recipe's complete
 // structured label. The isolated page template is required, never arbitrary text.
 const summary=html.match(/<h2 class="mm-recipes-nutrition-facts-summary__heading[^>]*>Nutrition Facts <span[^>]*>\(per serving\)<\/h2>([\s\S]*?)<\/table>/);
 if(!summary)return null;
 const pairs=[...summary[1].matchAll(/<tr[^>]*>\s*<td[^>]*>\s*(\d+(?:\.\d+)?)(g)?\s*<\/td>\s*<td[^>]*>\s*(Calories|Fat|Carbs|Protein)\s*<\/td>\s*<\/tr>/g)];
 if(pairs.length!==4||new Set(pairs.map(x=>x[3])).size!==4)return null;
 const keys={calories:'calories',protein:'proteinContent',carbs:'carbohydrateContent',fat:'fatContent',fiber:'fiberContent'};
 const fields:any={};for(const [key,sourceKey] of Object.entries(keys)){const value=r.nutrition?.[sourceKey];if(typeof value!=='string')return null;const m=(key==='calories'?/^(\d+(?:\.\d+)?) kcal$/:/^(\d+(?:\.\d+)?) g$/).exec(value);if(!m)return null;fields[key]={value:Number(m[1]),unit:key==='calories'?'kcal':'g',method:'reported',source:{provider:'Allrecipes publisher recipe label',id:url,url,field:sourceKey,retrievedAt}};}
 const map:any={Calories:'calories',Fat:'fat',Carbs:'carbs',Protein:'protein'};if(pairs.some(p=>fields[map[p[3]]].value!==Number(p[1])||(p[3]==='Calories'?!!p[2]:p[2]!=='g')))return null;
 if(!Array.isArray(r.recipeIngredient)||!r.recipeIngredient.length||r.recipeIngredient.length>30||r.recipeIngredient.some((x:any)=>typeof x!=='string'||!x.trim()||x.length>500))return null;
 if(!Array.isArray(r.recipeInstructions)||!r.recipeInstructions.length||r.recipeInstructions.length>30||r.recipeInstructions.some((s:any)=>s?.['@type']!=='HowToStep'||typeof s.text!=='string'||!s.text.trim()||s.text.length>3000))return null;
 const publisherNutrition:Nutrition={identity:name,basis:{amount:1,unit:'serving',label:`1 of ${servings} publisher-stated servings`},fields,missing:[]};
 return {name,servings,servingDescription:publisherNutrition.basis.label,publisherServingDescription:publisherNutrition.basis.label,publisherNutrition,ingredients:r.recipeIngredient.map((text:string)=>({text,name:text})),instructions:r.recipeInstructions.map((s:any)=>s.text)};
}
