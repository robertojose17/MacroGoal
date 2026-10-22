import { NUTRIENTS, type Nutrition, type RecipeIngredient, offNutrition, usdaNutrition, officialTableNutrition, verifiedRecipe } from './coach-nutrition-evidence.ts';
import { allowedEvidenceURL } from './coach-source-pages.ts';
export type VerifiedFoodRequest =
 | {kind:'product';barcode:string;productName?:string;brand?:string;marketTag:string;grams:number}
 | {kind:'official';url:string;name:string;market:string;portion:string;modifications?:string[]}
 | {kind:'recipe';url:string;name:string;confirmedIngredients?:Record<string,string>;confirmedPreparations?:Record<string,'raw'|'cooked'>;confirmedQuantities?:Record<string,number>;confirmedServings?:number};
export type VerifiedRecipeIngredient={ingredient:string;quantity?:number;quantityText?:string;quantityRange?:{min:number;max:number};unit?:string;grams?:number;preparation?:'raw'|'cooked'|'not_applicable';usdaIdentity?:string;evidence:{recipeSource:string;recipeField:string;gramsSource?:'publisher'|'user_confirmed';usdaSource?:string;usdaFdcId?:string;nutrientFactSources?:Record<string,{provider:string;id:string;url:string;field:string}>}};
export type VerifiedRecipe={name:string;sourceUrl:string;ingredients:VerifiedRecipeIngredient[];yield:{servings:number;basis:'source_stated';servingDescription?:string};instructions:string[];nutritionPerServing:{calories:number;protein_g:number;carbohydrates_g:number;fat_g:number;fiber_g:number;basis:'calculated_from_verified_ingredients'|'publisher_provided'};servingBasis:{description:string;grams:null}};
export type VerifiedFoodResult={kind?:VerifiedFoodRequest['kind'];eligible:boolean;name?:string;nutrition?:Nutrition;ingredients?:string[];instructions?:string[];recipe?:VerifiedRecipe;missing:string[];clarification?:string;lookup_context?:unknown;sources:{url:string;retrievedAt:string}[]};
export type VerifiedFoodDeps={fetch:typeof fetch;retrievedAt:string;parseRecipe?:(html:string,name:string)=>any;recipeSourceHtml?:string;recipeBudget?:{startedAt:number;reads:number;maxReads:number;maxDurationMs:number};onSourceReadDiagnostic?:(value:{outcome:'http_ok'|'http_denied'|'http_redirect'|'http_error'|'unsupported_content_type'|'page_too_large'|'timeout'|'read_error'|'recipe_incomplete';http_status?:number})=>void};
const normalize=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const containsPhrase=(value:string,phrase:string)=>{const text=normalize(value).replace(/[^\p{L}\p{N}]+/gu,' '),needle=normalize(phrase).replace(/[^\p{L}\p{N}]+/gu,' ');return !!needle&&(` ${text} `).includes(` ${needle} `);};
const parseGrams=(value:string):number|undefined=>{const match=/^(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram|grams|gramo|gramos)$/i.exec(value.trim());if(!match)return undefined;const amount=Number(match[1].replace(',','.'));return Number.isFinite(amount)&&amount>0?amount:undefined;};
function exactUSDAFoodPortionGrams(portions:unknown,unit:unknown,quantity:unknown):{grams:number;field:string}|null{
 if(typeof unit!=='string'||typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||!Array.isArray(portions))return null;
 const key=unit.toLowerCase().replace(/\.$/,'').replace(/s$/,'').replace(/tablespoon/,'tbsp').replace(/teaspoon/,'tsp');
 const match=portions.flatMap((p:any,index:number)=>{const raw=typeof p?.measureUnit?.name==='string'?p.measureUnit.name:typeof p?.portionDescription==='string'?p.portionDescription:'';const unitKey=raw.toLowerCase().replace(/\.$/,'').replace(/s$/,'').replace(/tablespoon/,'tbsp').replace(/teaspoon/,'tsp').trim();const amount=Number(p?.amount),gramWeight=Number(p?.gramWeight);return unitKey===key&&Number.isFinite(amount)&&amount>0&&Number.isFinite(gramWeight)&&gramWeight>0?[{amount,gramWeight,index}]:[];});
 if(match.length!==1)return null;const portion=match[0];const grams=portion.gramWeight*quantity/portion.amount;if(!Number.isFinite(grams)||grams<=0||grams>100000)return null;return {grams,field:`foodPortions[${portion.index}].gramWeight * recipeIngredient.quantity / foodPortions[${portion.index}].amount`};
}
const complete=(n:Nutrition|null):n is Nutrition=>!!n&&!n.missing.length&&NUTRIENTS.every(k=>!!n.fields[k]&&Number.isFinite(n.fields[k]!.value));
type RecipeReadBudget={startedAt:number;reads:number;maxReads:number;maxDurationMs:number};
const recipeReadBudgetError='recipe_lookup_budget_exhausted';
async function publicRead(url:string,deps:VerifiedFoodDeps,budget?:RecipeReadBudget):Promise<string>{
 let timeout=5000;if(budget){const remaining=budget.maxDurationMs-(Date.now()-budget.startedAt);if(budget.reads>=budget.maxReads||remaining<=0)throw Error(recipeReadBudgetError);budget.reads++;timeout=Math.min(timeout,remaining);}
 const signal=AbortSignal.timeout(timeout);let response:Response;
 try{response=await deps.fetch(url,{redirect:'manual',credentials:'omit',headers:{Accept:'application/json,text/html,text/plain'},signal});}catch(error){const timeout=signal.aborted||error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);deps.onSourceReadDiagnostic?.({outcome:timeout?'timeout':'read_error'});if(budget&&timeout)throw Error('recipe_lookup_timeout');throw error;}
 if(response.status!==200){const outcome=response.status===402||response.status===403?'http_denied':response.status>=300&&response.status<400?'http_redirect':'http_error';deps.onSourceReadDiagnostic?.({outcome,http_status:response.status});throw Error('source_unavailable');}
 if(!response.body||Number(response.headers.get('content-length')??0)>1048576){deps.onSourceReadDiagnostic?.({outcome:'page_too_large',http_status:response.status});throw Error('source_unavailable');}
 const type=response.headers.get('content-type')??'';if(!/^(application\/(?:ld\+)?json|text\/(?:html|plain))\b/i.test(type)){deps.onSourceReadDiagnostic?.({outcome:'unsupported_content_type',http_status:response.status});throw Error('source_format');}
 const reader=response.body.getReader(),decoder=new TextDecoder();let body='',bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1048576){await reader.cancel();deps.onSourceReadDiagnostic?.({outcome:'page_too_large',http_status:response.status});throw Error('source_too_large');}body+=decoder.decode(part.value,{stream:true});}deps.onSourceReadDiagnostic?.({outcome:'http_ok',http_status:response.status});return body+decoder.decode();}catch(error){const timeout=signal.aborted||error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);if(timeout)deps.onSourceReadDiagnostic?.({outcome:'timeout',http_status:response.status});if(budget&&timeout)throw Error('recipe_lookup_timeout');throw error;}finally{reader.releaseLock();}
}
function schemas(html:string):any[]{
 const records:any[]=[];const visit=(v:any)=>{if(Array.isArray(v)){v.forEach(visit);return;}if(v&&typeof v==='object'){records.push(v);if(v['@graph'])visit(v['@graph']);}};
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(match[1]));}catch{/* Malformed schema is not repaired by a model. */}}
 return records;
}
const hasType=(row:any,type:string)=>[row?.['@type']].flat().includes(type);
function steps(value:any):string[]|null{
 if(!Array.isArray(value)||!value.length)return null;const result:string[]=[];let nutritionSection=false;
 for(const entry of value){let line:string|undefined;
  if(typeof entry==='string'&&entry.trim())line=entry.trim();
  else if(hasType(entry,'HowToStep')&&typeof entry.text==='string'&&entry.text.trim())line=entry.text.trim();
  else if(hasType(entry,'HowToSection')){if(/nutrition|per serving|nutrition facts/i.test(String(entry.name??''))){nutritionSection=true;break;}const nested=steps(entry.itemListElement);if(!nested)return null;result.push(...nested);continue;}
  else return null;
  if(/^(?:\(?\s*)?(?:nutrition information|nutrition facts|per serving)\b/i.test(line)||/\b(?:calories|total fat|protein|carbohydrates?|dietary fiber)\s*:\s*\d/i.test(line)){nutritionSection=true;break;}
  if(!nutritionSection)result.push(line);
 }
 return result.length?result:null;
}
function instructionText(value:any):string[]{if(!Array.isArray(value))return [];const out:string[]=[];for(const item of value){if(typeof item==='string')out.push(item);else if(hasType(item,'HowToStep')&&typeof item.text==='string')out.push(item.text);else if(hasType(item,'HowToSection'))out.push(...instructionText(item.itemListElement));}return out;}
/** Only a single exact Recipe schema is accepted; every ingredient and every source step is retained. */
function amount(value:string):number|undefined{
 const normalized=value.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g,m=>({'¼':' 1/4','½':' 1/2','¾':' 3/4','⅐':' 1/7','⅑':' 1/9','⅒':' 1/10','⅓':' 1/3','⅔':' 2/3','⅕':' 1/5','⅖':' 2/5','⅗':' 3/5','⅘':' 4/5','⅙':' 1/6','⅚':' 5/6','⅛':' 1/8','⅜':' 3/8','⅝':' 5/8','⅞':' 7/8'} as Record<string,string>)[m]??m).trim();
 const mixed=/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(normalized),fraction=/^(\d+)\s*\/\s*(\d+)$/.exec(normalized);let result:number;
 if(mixed){const d=Number(mixed[3]);if(!d)return;result=Number(mixed[1])+Number(mixed[2])/d;}else if(fraction){const d=Number(fraction[2]);if(!d)return;result=Number(fraction[1])/d;}else result=Number(normalized);
 return Number.isFinite(result)&&result>0?result:undefined;
}
const units='kg|g|grams?|gramos?|oz|ounces?|lbs?|pounds?|ml|l|cups?|tbsp|tablespoons?|tsp|teaspoons?|small|medium|large|cloves?|pieces?|slices?|eggs?';
function parseIngredient(text:string){
 const raw=text.trim().replace(/\s+/g,' ');const quantity='(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';
 const prefix=new RegExp('^('+quantity+')\\s*(?:('+units+')\\b\\.?\\s*)?(?:\\(\\s*('+quantity+')\\s*g\\s*\\)\\s*)?(.+)$','i').exec(raw);
 const suffix=new RegExp('^(.+?)\\s+('+quantity+')(?:\\s*('+units+')\\.?)?$','i').exec(raw);
 let quantityText:string|undefined,measure:string|undefined,ingredient:string|undefined,grams:number|undefined;
 if(prefix){quantityText=prefix[1];measure=prefix[2]?.toLowerCase().replace(/\.$/,'');ingredient=prefix[4]?.trim();const publishedGrams=prefix[3]?amount(prefix[3]):undefined;const factor:Record<string,number>={g:1,gram:1,grams:1,gramos:1,kg:1000,oz:28.349523125,ounce:28.349523125,ounces:28.349523125,lb:453.59237,lbs:453.59237,pound:453.59237,pounds:453.59237};grams=publishedGrams??(measure&&factor[measure]?amount(quantityText)*factor[measure]:undefined);}
 else if(suffix){ingredient=suffix[1].trim();quantityText=suffix[2];measure=suffix[3]?.toLowerCase().replace(/\.$/,'');if(!measure&&!/\([^)]{1,80}\)/.test(ingredient))return null;}
 const parentheticalMass=ingredient?new RegExp('\\(\\s*('+quantity+')\\s*(g|grams?|oz|ounces?)\\s*\\)','i').exec(ingredient):null;
 if(parentheticalMass){const mass=amount(parentheticalMass[1]),massUnit=parentheticalMass[2].toLowerCase();if(mass&&(!grams||grams===mass))grams=mass*(massUnit==='g'||massUnit==='gram'||massUnit==='grams'?1:28.349523125);ingredient=ingredient!.replace(parentheticalMass[0],' ').replace(/\s+/g,' ').trim();}
 const qty=quantityText?amount(quantityText):undefined;if(!qty||!ingredient||ingredient.length>180||/^[-+]/.test(raw)||/\b(?:to taste|as needed|optional)\b/i.test(raw))return null;
 // Sum repeated amounts only when the publisher repeats the same ingredient and unit.
 const compoundPattern=new RegExp(',\\s*(?:and\\s+)?('+quantity+')\\s*('+units+')\\b\\.?\\s*(.+)$','i');const compound=prefix?compoundPattern.exec(ingredient):null;
 let finalQuantity=qty,finalQuantityText=quantityText,finalIngredient=ingredient;
 if(compound){const firstName=ingredient.slice(0,compound.index).split(',')[0].trim(),secondName=compound[3].split(',')[0].trim(),secondUnit=compound[2].toLowerCase().replace(/\.$/,'');const secondAmount=amount(compound[1]);if(!firstName||normalize(firstName)!==normalize(secondName)||!measure||measure!==secondUnit||!secondAmount)return null;finalQuantity=qty+secondAmount;finalQuantityText=`${quantityText} ${measure} + ${compound[1]} ${secondUnit}`;finalIngredient=firstName;}
 else if(/\b\d+(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+|(?:\.\d+)?)\s*(?:cups?|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|oz|ounces?|lbs?|pounds?)\b/i.test(ingredient.replace(/\([^)]*\)/g,' ')))return null;
 return {text:raw,quantityText:finalQuantityText,quantity:finalQuantity,unit:measure,grams,name:finalIngredient};
}
function parsePublisherRangeIngredient(text:string){
 const raw=text.trim().replace(/\s+/g,' '),rangeNumber='(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?)';
 const match=new RegExp('^('+rangeNumber+')\\s+to\\s+('+rangeNumber+')\\s+('+units+')\\b\\.?\\s+(.+)$','i').exec(raw);if(!match)return null;
 const min=amount(match[1]),max=amount(match[2]),unit=match[3].toLowerCase().replace(/\.$/,'').replace(/s$/,''),name=match[4].trim();
 if(min===undefined||max===undefined||!Number.isFinite(min)||!Number.isFinite(max)||min<=0||max<=0||min>max||!name||name.length>180||/\b(?:to taste|as needed|optional)\b/i.test(name))return null;
 return {text:raw,quantityText:`${match[1]} to ${match[2]}`,quantityRange:{min,max},unit,name};
}
function parseYield(value:any):{servings?:number;description?:string}{
 if(Array.isArray(value)){if(value.length!==1)return {};value=value[0];}
 if(typeof value!=='string')return {};const raw=value.trim();const match=/^(?:(?:serves?|makes?)\s+(\d+(?:\.\d+)?)(?:\s+servings?)?|(?:\d+(?:\.\d+)?)\s+(?:servings?|portions?))(?:\s*[,;]\s*(.+))?$/i.exec(raw);if(!match)return {};
 const count=/^(?:serves?|makes?)\s+(\d+(?:\.\d+)?)/i.exec(raw)?.[1]??/^(\d+(?:\.\d+)?)\s+(?:servings?|portions?)/i.exec(raw)?.[1];const servings=Number(count);if(!Number.isFinite(servings)||servings<=0||servings>100)return {};
 const description=match[1]&&/^\d/.test(match[1])?match[2]:match[1];
 const per=description&&/\bper\s+serving\b/i.test(description)?description.replace(/\s*per\s+serving\s*/i,'').trim():undefined;
 return {servings,description:per};
}
function publisherNutrition(html:string,recipe:any,yieldInfo:{servings?:number;description?:string},url:string,retrievedAt:string){
 const structured=recipe.nutrition&&typeof recipe.nutrition==='object'?recipe.nutrition:null;
 // Visible whole-document nutrition is intentionally not used: only this exact
 // Recipe node and its own ordered HowToStep tail can provide publisher macros.
 const panel='';
 const schemaNutritionSteps=instructionText(recipe.recipeInstructions);const stepMarker=schemaNutritionSteps.findIndex(step=>/\b(?:per\s+serving|nutrition\s+(?:facts|information))\b/i.test(step));const schemaPanel=stepMarker>=0?schemaNutritionSteps.slice(stepMarker).join(String.fromCharCode(10)).slice(0,1400):'';
 const schemaRaw=structured?{calories:structured.calories,protein:structured.proteinContent,carbs:structured.carbohydrateContent,fat:structured.fatContent,fiber:structured.fiberContent}:null;
 const parseSchemaValue=(value:unknown,key:string):number|undefined=>{if(key==='calories'&&typeof value==='number')return Number.isFinite(value)&&value>=0?value:undefined;if(typeof value!=='string')return;const re=key==='calories'?/^\s*(\d+(?:\.\d+)?)\s*(?:(?:kcal|calories?))?\s*$/i:/^\s*(\d+(?:\.\d+)?)\s*g\s*$/i;const m=re.exec(value);if(!m)return;const n=Number(m[1]);return Number.isFinite(n)&&n>=0?n:undefined;};
 const schemaValues=schemaRaw?Object.fromEntries(Object.entries(schemaRaw).map(([key,value])=>[key,parseSchemaValue(value,key)])):null;
 const schemaHasAny=!!schemaRaw&&Object.values(schemaRaw).some(v=>v!==undefined&&v!==null&&v!=='');
 if(schemaHasAny&&(!schemaValues||!Object.values(schemaValues).every(v=>v!==undefined)))return {conflict:true};
 const schemaText=schemaHasAny?`Calories ${schemaValues!.calories} kcal Protein ${schemaValues!.protein}g Carbohydrates ${schemaValues!.carbs}g Total Fat ${schemaValues!.fat}g Fiber ${schemaValues!.fiber}g`:'';
 const schemaServing=typeof structured?.servingSize==='string'?structured.servingSize.trim():Array.isArray(structured?.servingSize)&&structured.servingSize.length===1&&typeof structured.servingSize[0]==='string'?structured.servingSize[0].trim():'';
 const visibleServing=panel.match(/\bserving\s+size\s*[:\-]?\s*([^.;]{1,100}?)(?=\s+(?:amount\s+per\s+serving|calories|total\s+fat|total\s+carbohydrate|protein|$))/i)?.[1]?.trim()??'';
 const schemaServingAmbiguous=!!schemaServing&&/[=|;\r\n]/.test(schemaServing);if(schemaServingAmbiguous&&!visibleServing)return null;
 const servingSize=(visibleServing||(!schemaServingAmbiguous?schemaServing:'')||yieldInfo.description||'').trim();
 if(structured&&!panel&&!schemaPanel&&!schemaServing)return null;
 if(!panel&&!schemaPanel&&!schemaText)return null;
const parseBlock=(block:string)=>{
  let malformed=false;const values:Record<string,number|undefined>={calories:undefined,protein:undefined,carbs:undefined,fat:undefined,fiber:undefined};
  const rows=block.split(/\r?\n/).map(row=>row.trim()).filter(Boolean);
  for(const row of rows){
   let key:string|undefined;let pattern:RegExp|undefined;
   if(/^(?:total\s+)?calories\b/i.test(row)){key='calories';pattern=/^(?:total\s+)?calories\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:(?:kcal|calories?)\b)?\.?$/i;}
   else if(/^(?:total\s+)?fat\b/i.test(row)){key='fat';pattern=/^(?:total\s+)?fat\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g\.?$/i;}
   else if(/^(?:(?:total\s+)?carbohydrates?|carbs)\b/i.test(row)){key='carbs';pattern=/^(?:(?:total\s+)?carbohydrates?|carbs)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g\.?$/i;}
   else if(/^protein\b/i.test(row)){key='protein';pattern=/^protein\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g\.?$/i;}
   else if(/^(?:dietary\s+)?fiber\b/i.test(row)){key='fiber';pattern=/^(?:dietary\s+)?fiber\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g\.?$/i;}
   if(!key||!pattern)continue;if(values[key]!==undefined){malformed=true;continue;}
   const match=pattern.exec(row);if(!match){malformed=true;continue;}const n=Number(match[1]);if(!Number.isFinite(n)||n<0){malformed=true;continue;}values[key]=n;
  }
  return {values,malformed};
 };
 const isComplete=(v:any)=>Object.values(v).every(x=>x!==undefined);const parsed=[panel?parseBlock(panel):null,schemaPanel?parseBlock(schemaPanel):null,schemaHasAny?{values:schemaValues,malformed:false}:null].flat().filter(Boolean) as Array<{values:any;malformed:boolean}>;
 if(parsed.some(x=>x.malformed))return {conflict:true};
 const mentions=parsed.flatMap(x=>Object.entries(x.values).filter(([,v])=>v!==undefined).map(([k,v])=>[k,v]));for(const [key,value] of mentions){if(mentions.some(([otherKey,otherValue])=>otherKey===key&&otherValue!==value))return {conflict:true};}
 const available=parsed.map(x=>x.values).filter(isComplete);if(!available.length)return null;
 if(available.some((x:any)=>Object.keys(x).some(k=>x[k]!==available[0][k])))return null;
 const values=available[0];
 if(Object.values(values).some(v=>v===undefined)||!yieldInfo.servings)return null;
 const nutrition={identity:String(recipe.name),basis:{amount:1,unit:'serving',label:servingSize||yieldInfo.description||'1 publisher-stated serving'},fields:{} as any,missing:[] as string[]};
 for(const [key,value] of Object.entries(values)){const unit=key==='calories'?'kcal':'g';nutrition.fields[key]={value,unit,method:'reported',source:{provider:'Publisher-provided recipe nutrition',id:String(recipe['@id']??recipe.name),url,field:`nutrition panel per serving: ${key}`,retrievedAt}};}
 return {nutrition,servingDescription:servingSize||yieldInfo.description||'1 publisher-stated serving'};
}
/** Only an exact Recipe schema is accepted; quantities, ordered steps, yield, and panel remain source-bound. */
export function parseCompleteRecipe(html:string,name:string,url='',retrievedAt=''){
 const matches=schemas(html).filter(r=>hasType(r,'Recipe')&&typeof r.name==='string'&&normalize(r.name)===normalize(name));if(matches.length!==1)return null;const recipe=matches[0];
 const structuredServing=typeof recipe.nutrition?.servingSize==='string'?recipe.nutrition.servingSize:Array.isArray(recipe.nutrition?.servingSize)&&recipe.nutrition.servingSize.length===1?String(recipe.nutrition.servingSize[0]):'';
 const visibleServing=undefined;
 if(structuredServing&&/[=|;\r\n]/.test(structuredServing)&&!visibleServing)return null;
 if(!Array.isArray(recipe.recipeIngredient)||!recipe.recipeIngredient.length||recipe.recipeIngredient.length>30||recipe.recipeIngredient.some((v:any)=>typeof v!=='string'||!v.trim()))return null;
 const yieldInfo=parseYield(recipe.recipeYield),instructions=steps(recipe.recipeInstructions);if(!yieldInfo.servings||!instructions)return null;
 const published=publisherNutrition(html,recipe,yieldInfo,url,retrievedAt);if(published?.conflict)return null;
 const hasCompletePublisherNutrition=!!published?.nutrition&&complete(published.nutrition);
 const ingredients=recipe.recipeIngredient.map((text:string)=>hasCompletePublisherNutrition?parsePublisherRangeIngredient(text)??parseIngredient(text):parseIngredient(text));if(ingredients.some((x:any)=>!x))return null;
 return {name:recipe.name,ingredients,servings:yieldInfo.servings,servingDescription:yieldInfo.description,instructions,publisherNutrition:published?.nutrition,publisherServingDescription:published?.servingDescription};
}
/** Public reads only. Exact selection is supplied by a validated user selection, never an LLM guess. */
export async function findVerifiedFood(request:VerifiedFoodRequest,deps:VerifiedFoodDeps):Promise<VerifiedFoodResult>{
 const sources:VerifiedFoodResult['sources']=[];const missing=(field:string,clarification?:string):VerifiedFoodResult=>({kind:request.kind,eligible:false,missing:[field],...(clarification?{clarification}:{}),sources});
 const budget:RecipeReadBudget|undefined=request.kind==='recipe'?(deps.recipeBudget??{startedAt:Date.now(),reads:0,maxReads:21,maxDurationMs:20000}):undefined;
 const read=async(url:string)=>{if(request.kind==='recipe'&&url===request.url&&deps.recipeSourceHtml){sources.push({url,retrievedAt:deps.retrievedAt});return deps.recipeSourceHtml;}const body=await publicRead(url,deps,budget);sources.push({url,retrievedAt:deps.retrievedAt});return body;};
 try{
  if(request.kind==='product'){
   if(!/^\d{8,14}$/.test(request.barcode)||!Number.isFinite(request.grams)||request.grams<=0||!request.marketTag?.trim())return missing('exact_product_and_grams');
   const url=`https://world.openfoodfacts.org/api/v2/product/${request.barcode}.json`;const raw=JSON.parse(await read(url));const nutrition=offNutrition(raw.product,request.barcode,deps.retrievedAt,{productName:request.productName??raw.product?.product_name,brand:request.brand??raw.product?.brands,marketTag:request.marketTag});
   if(!complete(nutrition))return missing('complete_product_label');if(nutrition.basis.unit!=='g')return missing('measured_mass_or_published_density');
   const fields: Nutrition['fields']={};for(const key of NUTRIENTS){const input=nutrition.fields[key]!;fields[key]={...input,value:input.value*request.grams/100,method:'calculated',inputs:[input],source:{...input.source,field:`${input.source.field} * selected_grams / 100`}};}
   return {kind:request.kind,eligible:true,name:nutrition.identity,nutrition:{...nutrition,basis:{amount:request.grams,unit:'g',label:`${request.grams} g`},fields},missing:[],sources};
  }
  const url=allowedEvidenceURL(request.url);if(!url)return missing('supported_public_source');
  if(request.kind==='official'){
   if(request.modifications?.length)return missing('published_modified_item_nutrition');const parsed=new URL(url);const mcd=parsed.hostname==='www.mcdonalds.com'&&parsed.pathname==='/dnaapp/itemDetails';
   if(!request.market||(mcd?parsed.searchParams.get('country'):sourceMarket(url))!==request.market.toUpperCase())return missing('exact_market');
   const body=await read(url),nutrition=mcd?mcdonaldsNutrition(JSON.parse(body),request,url,deps.retrievedAt):officialTableNutrition(body,request.name,url,deps.retrievedAt);
   if(!complete(nutrition)||normalize(nutrition.basis.label)!==normalize(request.portion))return missing('exact_item_portion_and_complete_macros');
   return {kind:request.kind,eligible:true,name:nutrition.identity,nutrition,missing:[],sources};
  }
  const source=await read(url);
  const continuation=(ingredientText:string,need?:'identity'|'preparation'|'quantity'|'yield')=>({food:'recipe',mode:'recipe',recipeSelection:{url,name:request.name,ingredientText,...(need?{need}:{}),...(request.confirmedIngredients?{confirmedIngredients:request.confirmedIngredients}:{}),...(request.confirmedPreparations?{confirmedPreparations:request.confirmedPreparations}:{}),...(request.confirmedQuantities?{confirmedQuantities:request.confirmedQuantities}:{}),...(request.confirmedServings?{confirmedServings:request.confirmedServings}:{})}});
  const recipe=deps.parseRecipe?await deps.parseRecipe(source,request.name):parseCompleteRecipe(source,request.name,url,deps.retrievedAt);if(!recipe){deps.onSourceReadDiagnostic?.({outcome:'recipe_incomplete'});return {...missing('complete_recipe_schema'),clarification:'I could not verify a complete ingredient list, instructions, and yield on that page. Please choose another recipe page.'};}
  const confirmedServings=request.confirmedServings;
  if(!Number.isFinite(recipe.servings)||recipe.servings<=0)return {...missing('publisher_recipe_yield'),clarification:'The recipe page does not provide a clear serving yield, so I cannot certify per-serving nutrition. Please choose a recipe page that states its yield.'};
  if(recipe.publisherNutrition&&complete(recipe.publisherNutrition)){
   const serving=recipe.publisherServingDescription??recipe.publisherNutrition.basis.label;
   const recipeEvidence:VerifiedRecipe={name:recipe.name,sourceUrl:url,ingredients:recipe.ingredients.map((item:any)=>({ingredient:item.name,...(item.quantity!==undefined?{quantity:item.quantity}:{}),...(item.quantityText?{quantityText:item.quantityText}:{}),...(item.quantityRange?{quantityRange:item.quantityRange}:{}),...(item.unit?{unit:item.unit}:{}),...(item.grams?{grams:item.grams}:{}),evidence:{recipeSource:url,recipeField:`recipeIngredient:${item.text}`,...(item.grams?{gramsSource:'publisher' as const}:{})}})),yield:{servings:recipe.servings,basis:'source_stated',...(recipe.servingDescription?{servingDescription:recipe.servingDescription}:{})},instructions:recipe.instructions,nutritionPerServing:{calories:recipe.publisherNutrition.fields.calories!.value,protein_g:recipe.publisherNutrition.fields.protein!.value,carbohydrates_g:recipe.publisherNutrition.fields.carbs!.value,fat_g:recipe.publisherNutrition.fields.fat!.value,fiber_g:recipe.publisherNutrition.fields.fiber!.value,basis:'publisher_provided'},servingBasis:{description:serving,grams:null}};
   return {kind:request.kind,eligible:true,name:recipe.name,nutrition:recipe.publisherNutrition,ingredients:recipe.ingredients.map((i:any)=>i.text),instructions:recipe.instructions,recipe:recipeEvidence,missing:[],sources};
  }
  if(recipe.ingredients.length>10)return missing(recipeReadBudgetError,'This source recipe has more than 10 ingredients, beyond the current USDA verification read budget. Please choose a shorter recipe page.');
  const ingredients:RecipeIngredient[]=[];
  for(const item of recipe.ingredients){
   const query=new URL('https://api.nal.usda.gov/fdc/v1/foods/search');query.searchParams.set('query',item.name);query.searchParams.set('dataType','Foundation,SR Legacy');query.searchParams.set('pageSize','25');query.searchParams.set('api_key','DEMO_KEY');
   const data=JSON.parse(await read(query.href));const foods=Array.isArray(data.foods)?data.foods:[];
   const exact=foods.filter((f:any)=>normalize(f.description)===normalize(item.name));
   const selection=request.confirmedIngredients?.[item.text];
   const confirmedPreparation=request.confirmedPreparations?.[item.text];
   const prepared=confirmedPreparation?foods.filter((f:any)=>normalize(f.description).startsWith(normalize(item.name))&&usdaNutrition(f,deps.retrievedAt)?.preparation===confirmedPreparation):[];
   const candidates=selection?foods.filter((f:any)=>normalize(f.description)===normalize(selection)):confirmedPreparation?prepared:exact;
   if(candidates.length!==1){const options=foods.slice(0,5).map((f:any)=>String(f.description??'').trim()).filter(Boolean);const ask=options.length?`Which USDA ingredient matches "${item.name}": ${options.map((v:string,i:number)=>`${i+1}) ${v}`).join('; ')}? Reply with the exact food name.`:`Which exact USDA food identity and preparation matches "${item.name}"?`;return {...missing('ingredient_identity:'+item.name),clarification:ask,lookup_context:continuation(item.text,'identity')};}
   const match=candidates[0],detailUrl=`https://api.nal.usda.gov/fdc/v1/food/${match.fdcId}?api_key=DEMO_KEY`;
   const raw=JSON.parse(await read(detailUrl));const food=usdaNutrition(raw,deps.retrievedAt);
   if(!food||raw.fdcId!==match.fdcId||normalize(food.identity)!==normalize(match.description))return {...missing('exact_ingredient_identity'),clarification:`I could not verify an exact USDA identity for "${item.name}". Please choose another exact USDA food identity.`,lookup_context:continuation(item.text,'identity')};
   const selectedText=selection??'';const explicitPrep=request.confirmedPreparations?.[item.text]??(/\b(raw|uncooked|fresh)\b/i.test(item.name+' '+selectedText)?'raw':/\b(cooked|boiled|roasted|baked|fried|steamed)\b/i.test(item.name+' '+selectedText)?'cooked':undefined);
   const prep=food.preparation==='not_applicable'?'not_applicable':explicitPrep??food.preparation;
   if(!prep||prep==='as_sold'||food.preparation!==prep)return {...missing('ingredient_preparation:'+item.name),clarification:`Please choose an exact USDA identity that specifies raw or cooked preparation for "${item.name}". I will not infer that state.`,lookup_context:continuation(item.text,'preparation')};
   const portion=!item.grams&&!request.confirmedQuantities?.[item.text]?exactUSDAFoodPortionGrams(raw.foodPortions,item.unit,item.quantity):null;
   const grams=item.grams??request.confirmedQuantities?.[item.text]??portion?.grams;if(!grams||!Number.isFinite(grams)||grams<=0)return {...missing('ingredient_mass:'+item.text),clarification:`I could not verify an exact USDA portion conversion for "${item.text}". Please give its mass in grams or choose another recipe with a published weight.`,lookup_context:continuation(item.text,'quantity')};
   ingredients.push({name:item.name,grams,food,identityConfirmed:true,preparation:prep,quantityEvidence:{source:portion?'https://api.nal.usda.gov/fdc/v1/food/'+match.fdcId:url,field:item.grams?`recipeIngredient:${item.text}`:request.confirmedQuantities?.[item.text]?`user-confirmed grams for recipeIngredient:${item.text}`:portion!.field}});
  }
  const servings=recipe.servings;const checked=verifiedRecipe({name:recipe.name,ingredients,servings,yieldEvidence:{source:url,field:'recipeYield'},instructions:recipe.instructions,instructionsComplete:true});
  if(!checked.eligible)return {kind:request.kind,eligible:false,missing:checked.missing,sources};
  const nutrient=(key:keyof typeof checked.nutrition.fields)=>checked.nutrition.fields[key]!.value;
  const recipeEvidence:VerifiedRecipe={name:recipe.name,sourceUrl:url,ingredients:ingredients.map((item,index)=>{const src=recipe.ingredients[index];const facts=Object.fromEntries(Object.entries(item.food!.fields).map(([key,fact])=>[key,{provider:fact!.source.provider,id:fact!.source.id,url:fact!.source.url,field:fact!.source.field}]));return {ingredient:item.name,quantity:src.quantity,quantityText:src.quantityText,unit:src.unit,grams:item.grams!,preparation:item.preparation as 'raw'|'cooked'|'not_applicable',usdaIdentity:item.food!.identity,evidence:{recipeSource:url,recipeField:`recipeIngredient:${src.text}`,gramsSource:src.grams?'publisher':'user_confirmed',usdaSource:`https://fdc.nal.usda.gov/food-details/${item.food!.fields.calories!.source.id}/nutrients`,usdaFdcId:item.food!.fields.calories!.source.id,nutrientFactSources:facts}};}),yield:{servings, basis:'source_stated',...(recipe.servingDescription?{servingDescription:recipe.servingDescription}:{})},instructions:recipe.instructions,nutritionPerServing:{calories:nutrient('calories'),protein_g:nutrient('protein'),carbohydrates_g:nutrient('carbs'),fat_g:nutrient('fat'),fiber_g:nutrient('fiber'),basis:'calculated_from_verified_ingredients'},servingBasis:{description:`1 of ${servings} equal recipe servings (calculated)`,grams:null}};
  return {kind:request.kind,eligible:true,name:recipe.name,nutrition:{...checked.nutrition,basis:{amount:1,unit:'serving',label:`1 of ${servings} equal recipe servings (calculated)`}},ingredients:recipe.ingredients.map((i:any)=>i.text),instructions:recipe.instructions,recipe:recipeEvidence,missing:[],sources};
 }catch(error){if(error instanceof Error&&error.message===recipeReadBudgetError)return missing(recipeReadBudgetError,'Recipe verification reached its public-read or time limit. No partial macros were used. Choose a shorter recipe page or retry later.');if(error instanceof Error&&error.message==='recipe_lookup_timeout')return {...missing('recipe_lookup_timeout'),clarification:'The public recipe or nutrition source timed out. No nutrition was certified. Retry later or choose a shorter supported recipe page.'};return missing('public_source_unavailable');}
}

/** Explicit barcode, country and measured grams only; no guessed brand, portion or country. */
export function parseVerifiedFoodRequest(text:string):VerifiedFoodRequest|null{
 if(/\b(?:do not|don't|never|avoid|no quiero|no busques|no consultes|sin consultar)\b/i.test(text))return null;
 const confirm=/^recipe_confirmation_url\s*:\s*(https:\/\/[^;\s]+)\s*;\s*recipe\s*:\s*([^;\n]{1,120})\s*;\s*ingredient\s*:\s*([^;\n]{1,200})\s*;\s*need\s*:\s*(identity|preparation|quantity|yield)\s*;\s*selected\s*:\s*([^;\n]{1,160})[.!]?$/i.exec(text.trim());
 if(confirm){const url=allowedEvidenceURL(confirm[1]),name=confirm[2].trim(),ingredientText=confirm[3].trim(),need=confirm[4].toLowerCase(),selected=confirm[5].trim();if(url&&name&&ingredientText&&selected){if(need==='quantity'){const grams=parseGrams(selected);if(grams)return {kind:'recipe',url,name,confirmedQuantities:{[ingredientText]:grams}};}if(need==='yield'&&/^\d+(?:[.,]\d+)?(?:\s+servings?)?$/i.test(selected))return {kind:'recipe',url,name,confirmedServings:Number.parseFloat(selected.replace(',','.'))};if(need==='identity')return {kind:'recipe',url,name,confirmedIngredients:{[ingredientText]:selected}};if(need==='preparation'&&/^(raw|uncooked|cooked|boiled|roasted|baked|fried|steamed)$/i.test(selected)){const preparation=/^(raw|uncooked)$/i.test(selected)?'raw':'cooked';return {kind:'recipe',url,name,confirmedPreparations:{[ingredientText]:preparation}};}}}
 const official=/^official_url\s*:\s*(https:\/\/[^;\s]+)\s*;\s*item\s*:\s*([^;\n]{1,120})\s*;\s*market\s*:\s*(US|UK|CA|AU|NZ|ES|MX|FR)\s*;\s*portion\s*:\s*([^;\n]{1,80})[.!]?$/i.exec(text.trim());
 if(official){const url=allowedEvidenceURL(official[1]),market=official[3].toUpperCase(),portion=official[4].trim();if(url&&portion&&!/\b(?:extra|without|double|half|no|sin|menos|light)\b/i.test(text))return {kind:'official',url,name:official[2].trim(),market,portion};}
 // Consume the entire selection: trailing substitutions, alternative codes or
 // dietary variants must not silently receive the original product's label.
 if(!/^(?:barcode|c[oó]digo(?: de barras)?)\s*[:=]?\s*\d{8,14}\s*;\s*(?:market|country|mercado|pa[ií]s)\s*[:=]?\s*(?:US|UK|CA|AU|NZ|ES|MX|FR)\s*;?\s*\d+(?:\.\d+)?\s*(?:g|grams?|gramos?)\s*[.!]?$/i.test(text.trim()))return null;
 const barcode=/(?:barcode|c[oó]digo(?: de barras)?)\s*[:=]?\s*(\d{8,14})\b/i.exec(text)?.[1];
 const country=/(?:market|country|mercado|pa[ií]s)\s*[:=]?\s*(US|UK|CA|AU|NZ|ES|MX|FR)\b/i.exec(text)?.[1]?.toUpperCase();
 const weights=[...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:g|grams?|gramos?)\b/gi)];
 if(!barcode||!country||weights.length!==1)return null;
 const markets:Record<string,string>={US:'en:united-states',UK:'en:united-kingdom',CA:'en:canada',AU:'en:australia',NZ:'en:new-zealand',ES:'en:spain',MX:'en:mexico',FR:'en:france'};
 const grams=Number(weights[0][1]);return grams>0?{kind:'product',barcode,marketTag:markets[country],grams}:null;
}
export function verifiedFoodReply(result:VerifiedFoodResult,language='en'):string{
 const es=language.startsWith('es');if(!result.eligible||!complete(result.nutrition))return result.clarification??(result.kind==='recipe'?(es?'¿Qué receta con cantidades en gramos y número de porciones quieres consultar?':'Which recipe with ingredient amounts in grams and a serving count should I check?'):result.kind==='official'?(es?'¿Qué restaurante, plato estándar, país y porción quieres consultar?':'Which restaurant, standard item, country and serving should I check?'):(es?'Indica el código de barras, país y gramos de la porción que quieres consultar.':'Please give the barcode, country and grams for the serving you want to check.'));
 const labels=es?['Energía','Proteína','Carbohidratos','Grasa','Fibra']:['Energy','Protein','Carbs','Fat','Fiber'];
 const macros=NUTRIENTS.map((key,i)=>`${labels[i]}: ${Number(result.nutrition!.fields[key]!.value.toFixed(3))} ${result.nutrition!.fields[key]!.unit}`).join(' · ');
 return [result.name,result.nutrition.basis.label,macros,...(result.ingredients??[]),...(result.instructions??[])].filter(Boolean).join('\n');
}

/** The endpoint's item-level value is per selected standard item; never use component or per100g values. */
export function mcdonaldsNutrition(raw:any,request:{name:string;portion:string;modifications?:string[]},url:string,retrievedAt:string):Nutrition|null{
 const parsed=new URL(url),item=raw?.item,id=Number(parsed.searchParams.get('item'));if(parsed.hostname!=='www.mcdonalds.com'||parsed.pathname!=='/dnaapp/itemDetails'||parsed.searchParams.get('country')!=='US'||request.modifications?.length||!Number.isSafeInteger(id)||item?.id!==id||item?.item_id!==id||typeof item.item_name!=='string'||normalize(item.item_name)!==normalize(request.name)||!/^1 [a-z][a-z -]{0,40}$/i.test(request.portion))return null;
 const ids:Record<string,number>={calories:2,protein:11,carbs:22,fat:21,fiber:32};const fields:Nutrition['fields']={};
 for(const key of NUTRIENTS){const rows=(Array.isArray(item.nutrient_facts?.nutrient)?item.nutrient_facts.nutrient:[]).filter((r:any)=>r.id===ids[key]);if(rows.length!==1)continue;const row=rows[0],expected=key==='calories'?'Cal.':'g';if(typeof row.value!=='string'||!/^\d+(?:\.\d+)?$/.test(row.value)||String(row.uom).trim()!==expected)continue;const value=Number(row.value);if(!Number.isFinite(value))continue;fields[key]={value,unit:key==='calories'?'kcal':'g',method:'reported',source:{provider:'McDonalds official item nutrition',id:String(id),url,field:`item.nutrient_facts.nutrient[id=${ids[key]}].value`,retrievedAt}};}
 return {identity:item.item_name,basis:{amount:1,unit:'serving',label:'1 burger'},fields,missing:NUTRIENTS.filter(k=>!fields[k])};
}



