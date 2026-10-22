import {parseCompleteRecipe,findVerifiedFood} from './coach-verified-food.ts';
import {projectLookupOptions} from './_shared/coach-recommendation-contract.ts';
import {allowedEvidenceURL} from './coach-source-pages.ts';
import {projectVerifiedOptions} from './meal-choice-source.ts';
import type {Candidate,Mode} from './meal-choice.ts';
import {publisherRecipe} from './publisher-recipe.ts';
// Public discovery links only, never stored nutrition/ingredients or a fabricated
// food catalog. Each must pass fresh original-publisher validation at runtime.
export const PUBLIC_RECIPE_LINKS={
 cook:['https://www.allrecipes.com/recipe/245568/naked-chicken-burrito-bowl/','https://www.allrecipes.com/recipe/237084/lemon-parmesan-chicken-and-rice-bowl/'],
 quick:['https://www.allrecipes.com/recipe/215901/tuna-and-chickpea-salad/','https://www.allrecipes.com/recipe/283867/marinated-greek-inspired-chickpea-salad/']
} as const;
// Reviewed original ingredient + instruction bytes: canned ready-to-eat foods,
// raw vegetables, mixing/serving only. Changed content requires another review;
// missing cookTime alone and recipe names are never proof of no-cook preparation.
const assemblyReviews:Record<string,string>={
 'https://www.allrecipes.com/recipe/215901/tuna-and-chickpea-salad/':'a67420f0744e407b3ae10fabf23e0fe4961dac7069735119baae143e65f0dce9',
 'https://www.allrecipes.com/recipe/283867/marinated-greek-inspired-chickpea-salad/':'fec97119c332a834231640aef45b48dca1606e83705ec5bb2ffa1d4027621dfd'
};
async function reviewedAssembly(url:string,parsed:any){
 if(!assemblyReviews[url])return false;
 const bytes=new TextEncoder().encode(JSON.stringify({ingredients:parsed.ingredients.map((i:any)=>i.text),instructions:parsed.instructions}));
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 return digest===assemblyReviews[url];
}
export function publicRecipeURL(raw:unknown):string|null{
 const url=allowedEvidenceURL(raw);if(!url)return null;const u=new URL(url);
 // No stored/user query strings, tracking tokens, credentials, fragments or
 // dynamic search URLs are disclosed. Existing publisher hosts only.
 if(u.search||u.hash||!/(?:\/recipe[s]?\/)/.test(u.pathname))return null;
 return u.href;
}
export function recipeMetadata(html:string){
 const nodes:any[]=[];const visit=(v:any)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(visit);return;}if(([] as any[]).concat(v['@type']??[]).includes('Recipe'))nodes.push(v);if(v['@graph'])visit(v['@graph']);};
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(m[1]));}catch{}}
 if(nodes.length!==1||typeof nodes[0].name!=='string'||!nodes[0].name.trim())return null;
 const r=nodes[0];const diets=[].concat(r.suitableForDiet??[]).map(String);
 return {name:r.name,noCook:/^PT(?=.+)(?:0H)?(?:0M)?(?:0S)?$/.test(String(r.cookTime??'')),diet:diets.some(x=>/\bVeganDiet$/.test(x))?'vegan':diets.some(x=>/\bVegetarianDiet$/.test(x))?'vegetarian':'unknown',category:[].concat(r.recipeCategory??[]).map(String).join(' ')};
}
export async function readPublisher(url:string,request:typeof fetch):Promise<string>{
 const response=await request(url,{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'text/html'},signal:AbortSignal.timeout(5000)});
 if(response.status!==200||!/^text\/html\b/i.test(response.headers.get('content-type')??'')||!response.body||Number(response.headers.get('content-length')??0)>1048576)throw Error('publisher_unavailable');
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,html='';try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>1048576){await reader.cancel();throw Error('publisher_too_large');}html+=decoder.decode(r.value,{stream:true});}return html+decoder.decode();}finally{reader.releaseLock();}
}
export async function libraryCandidates(db:any,owner:string,mode:Mode,request:typeof fetch=fetch,now=Date.now()):Promise<{candidates:Candidate[];coverage:{library:'available'|'unavailable';pages_checked:number;verified:number;reason?:string}}>{
 if(mode!=='cook'&&mode!=='quick')return {candidates:[],coverage:{library:'available',pages_checked:0,verified:0,reason:'mode_not_library_recipe'}};
 // Same public recipes schema as popular-recipes, without invoking its click
 // tracking or recipe-finder's paid generation/image/audit/write behavior.
 let rows:any[]=[],library:'available'|'unavailable'='available';try{const r=await db.from('recipes').select('id,title,source_url,prep_time_minutes').order('click_count',{ascending:false}).limit(24);if(r.error||!Array.isArray(r.data))throw Error();rows=r.data;}catch{library='unavailable';}
 const stored=rows.map(r=>publicRecipeURL(r.source_url)).filter((x):x is string=>!!x);
 // Two discovered public links guarantee an input source even for an empty shared
 // catalog; availability/verification is still checked, never assumed.
 const urls=[...new Set([...PUBLIC_RECIPE_LINKS[mode],...stored])].slice(0,4);
 const candidates:Candidate[]=[];let checked=0;
 // Two waves, at most four 5-second requests; no external request includes user
 // identity, constraints, diary, targets, prompts or API keys.
 for(let i=0;i<urls.length;i+=2){const results=await Promise.all(urls.slice(i,i+2).map(async url=>{checked++;try{
   const html=await readPublisher(url,request),meta=recipeMetadata(html);if(!meta||/\b(side dish|dessert|snack|appetizer)\b/i.test(meta.category))return [];
   const parsed=parseCompleteRecipe(html,meta.name,url,new Date(now).toISOString())??publisherRecipe(html,meta.name,url,new Date(now).toISOString());if(!parsed?.publisherNutrition)return [];
   if(mode==='quick'&&!meta.noCook&&!await reviewedAssembly(url,parsed))return [];
   // Reuse original parser/verifier with the public HTML already loaded. Prevent
   // any ingredient lookup/USDA cascade; incomplete publisher nutrition declines.
   const verified=await findVerifiedFood({kind:'recipe',url,name:meta.name},{fetch:async()=>{throw Error('additional_lookup_not_allowed');},retrievedAt:new Date(now).toISOString(),recipeSourceHtml:html,parseRecipe:()=>parsed});
   if(!verified.eligible)return [];
   const options=projectLookupOptions(undefined,verified).map(o=>({...o,_source_url:url}));
   const projected=projectVerifiedOptions(options,owner,'cook');
   return projected.map(c=>({...c,id:url,mode,diet:meta.diet as Candidate['diet'],recipeDetails:{source_servings:parsed.servings,ingredients:verified.ingredients??[],instructions:verified.instructions??[]}}));
  }catch{return []}}));candidates.push(...results.flat());if(candidates.length>=3)break;}
 return {candidates,coverage:{library,pages_checked:checked,verified:candidates.length,...(!candidates.length?{reason:'publisher_evidence_unavailable'}:{})}};
}
