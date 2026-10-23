import type { DishEvidence, EvidenceResult } from '../coach-dish-evidence.ts';
import { classifyItemIntegrity } from '../coach-nutrition-evidence.ts';
import { normalizeCoachMutation } from './coach-action-contract.ts';

export type LookupOption = {
  dietary_evidence?:string;
  match?:import('../restaurant-similarity.ts').RestaurantMatch;
  option_id: string;
  /** Internal-only source identity key, removed from client projections. */
  _source_url?: string;
  kind: 'restaurant' | 'product' | 'retrieved_recipe';
  brand?: string;
  restaurant_name?: string;
  item_name: string;
  variant?: string;
  /** Suggested count of immutable published source servings. Omitted means one. */
  suggested_servings?: number;
  serving: { label: string; grams?: number; multiplier: number };
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
    basis: { amount: number; unit: 'g'|'ml'|'serving'; label: string };
  };
  complete_item_verified: boolean;
  nutrition_status: 'complete_verified' | 'partial_verified' | 'unverified';
  location?: { name?: string; address?: string; evidence_status: 'verified' };
  retailers?: Array<{ name: string; evidence_status: 'verified' }>;
  recipe?: {
    name:string;sourceUrl:string;
    ingredients:Array<{ingredient:string;quantity?:number;quantityText?:string;quantityRange?:{min:number;max:number};unit?:string;grams?:number;preparation?:'raw'|'cooked'|'not_applicable';usdaIdentity?:string;evidence:Record<string,unknown>}>;
    yield:{servings:number;basis:'source_stated';servingDescription?:string};instructions:string[];
    nutritionPerServing:{calories:number;protein_g:number;carbohydrates_g:number;fat_g:number;fiber_g:number;basis:'calculated_from_verified_ingredients'|'publisher_provided'};
    servingBasis:{description:string;grams:null};
  };
  loggable: boolean;
};

const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const macros = ['calories','protein','carbs','fat','fiber'] as const;
const brandByHost:Record<string,string>={
  'newmansown.com':"Newman's Own",'www.newmansown.com':"Newman's Own",
  'tonys.com':"TONY'S",'www.tonys.com':"TONY'S",
  'us.grandospizza.com':"Grando's",'papajohns.com':"Papa Johns",'www.papajohns.com':"Papa Johns",
  'www.redbaron.com':'Red Baron',
  
  'eatcaulipower.com':'CAULIPOWER','www.eatcaulipower.com':'CAULIPOWER',
  'dominos.com':"Domino's",'www.dominos.com':"Domino's",
  'mcdonalds.com':"McDonald's",'www.mcdonalds.com':"McDonald's",
};

function complete(dish:DishEvidence):boolean {
  const n=dish.nutrition;
  const factsComplete=!!n&&dish.nutritionStatus==='verified'&&!!dish.name.trim()&&!!dish.portion?.trim()&&n.missing.length===0&&macros.every(key=>number(n.fields[key]?.value));
  if(!factsComplete||dish.sourceKind==='retrieved_recipe')return false;
  if(n!.itemIntegrity!==undefined&&n!.itemIntegrity!=='complete')return false;
  if(dish.sourceKind==='product'&&n!.itemAssociation!==undefined&&n!.itemAssociation!=='packaged_product')return false;
  if((dish as any).itemCompleteness==='component'||(dish as any).itemCompleteness==='unknown')return false;
  if(dish.sourceKind==='menu')return (dish as any).itemCompleteness==='complete_menu_item'&&n!.itemIntegrity==='complete';
  if((dish as any).itemCompleteness==='complete_product')return true;
  // Legacy receipt compatibility requires explicit source, identity, serving, and all five macros bound to the same official product page.
  return !!n&&classifyItemIntegrity(dish.name,dish.portion??'','',undefined,'packaged_product')==='complete'&&macros.every(key=>{const f=n.fields[key];return f?.source.provider==='Official manufacturer product label'&&f.source.url===dish.url&&f.source.id===n.identity;})&&n.identity.trim().toLowerCase()===dish.name.trim().toLowerCase();
}
export function verifiedPublisherBrand(url:string,identity:string):string|undefined {
  for(const [host,brand] of Object.entries(brandByHost)){try{if(new URL(url).hostname.toLowerCase()===host&&identity.toLowerCase().includes(brand.toLowerCase()))return brand;}catch{}}
  return undefined;
}
function brandFor(dish:DishEvidence):string|undefined {return verifiedPublisherBrand(dish.url,dish.nutrition?.identity??'');}
function stableId(dish:DishEvidence):string {
  let source='';try{const u=new URL(dish.url);source=u.hostname.toLowerCase()+u.pathname.replace(/\/+$/,'').toLowerCase();}catch{source=dish.url.toLowerCase();}
  const canonical=[source,dish.nutrition?.identity?.trim().toLowerCase()??dish.name.trim().toLowerCase(),dish.variant?.trim().toLowerCase()??'',dish.portion?.trim().toLowerCase()??''].join('|');
  let h=0xcbf29ce484222325n;for(const ch of canonical){h^=BigInt(ch.codePointAt(0)!);h=BigInt.asUintN(64,h*0x100000001b3n);}return 'opt-'+h.toString(16).padStart(16,'0');
}
function gramsFor(dish:DishEvidence):number|undefined {
  if(dish.nutrition?.basis.unit==='g'&&number(dish.nutrition.basis.amount)&&dish.nutrition.basis.amount>0)return dish.nutrition.basis.amount;
  const match=/\((\d+(?:\.\d+)?)\s*g\)/i.exec(dish.portion??'');return match?Number(match[1]):undefined;
}

/** Project only already validated, complete foods; source URLs and internal evidence remain on the receipt object. */
export function projectLookupOptions(evidence:EvidenceResult|undefined,verifiedFood?:unknown,maxOptions=3):LookupOption[] {
  const options:LookupOption[]=(evidence&&Array.isArray(evidence.dishes)?evidence.dishes:[]).flatMap(dish=>{
    if(!complete(dish))return [];
    const n=dish.nutrition!, values=n.fields;
    const grams=gramsFor(dish);
    const option:LookupOption={
      ...(dish.dietary_evidence?{dietary_evidence:dish.dietary_evidence}:{}),
      ...(dish.match?{match:structuredClone(dish.match)}:{}),
      option_id:stableId(dish),
      kind:dish.sourceKind==='menu'?'restaurant':'product',
      ...(dish.sourceKind==='product'&&(dish.retailers?.find(r=>r.evidence_status==='verified')?.brand||brandFor(dish))?{brand:dish.retailers?.find(r=>r.evidence_status==='verified')?.brand||brandFor(dish)}:{}),
      ...(dish.sourceKind==='menu'&&(dish.location?.evidence_status==='verified'&&dish.location.name?{restaurant_name:dish.location.name}:dish.restaurantName?{restaurant_name:dish.restaurantName}:{})),
      ...(dish.location?.evidence_status==='verified'?{location:{name:dish.location.name,address:dish.location.address,evidence_status:'verified' as const}}:{}),
      ...(dish.retailers?.some(r=>r.evidence_status==='verified')?{retailers:dish.retailers.filter(r=>r.evidence_status==='verified').map(r=>({name:r.name,evidence_status:'verified' as const}))}:{}),
      item_name:dish.name,
      _source_url:dish.url,
      ...(dish.variant?{variant:dish.variant}:{}),
      serving:{label:dish.portion!,...(grams!==undefined?{grams}:{}),multiplier:1},
      nutrition:{calories:values.calories!.value,protein:values.protein!.value,carbs:values.carbs!.value,fats:values.fat!.value,fiber:values.fiber!.value,basis:{...n.basis}},
      complete_item_verified:true,
      nutrition_status:'complete_verified',
      loggable:true,
    };
    return [option];
  });
  if(verifiedFood&&typeof verifiedFood==='object'&&!Array.isArray(verifiedFood)){
    const food=verifiedFood as any,r=food.recipe,n=food.nutrition;
    if(food.kind==='recipe'&&food.eligible===true&&r&&r.yield?.basis==='source_stated'&&number(r.yield.servings)&&r.yield.servings>0&&Array.isArray(r.ingredients)&&r.ingredients.length>0&&Array.isArray(r.instructions)&&r.instructions.length>0&&n&&n.missing?.length===0&&macros.every(key=>number(n.fields?.[key]?.value))&&['calories','protein_g','carbohydrates_g','fat_g','fiber_g'].every(key=>number(r.nutritionPerServing?.[key]))){
      const source=typeof r.sourceUrl==='string'?r.sourceUrl:typeof food.sources?.[0]?.url==='string'?food.sources[0].url:'';
      const dish={url:source,name:r.name??food.name,nutrition:{identity:r.name??food.name}} as DishEvidence;
      const vals=r.nutritionPerServing;
      options.push({option_id:stableId(dish),kind:'retrieved_recipe',item_name:r.name??food.name,_source_url:source,serving:{label:r.servingBasis?.description??`1 of ${r.yield.servings} source servings`,multiplier:1},nutrition:{calories:vals.calories,protein:vals.protein_g,carbs:vals.carbohydrates_g,fats:vals.fat_g,fiber:vals.fiber_g,basis:{amount:1,unit:'serving',label:r.servingBasis?.description??`1 of ${r.yield.servings} source servings`}},recipe:r,complete_item_verified:true,nutrition_status:'complete_verified',loggable:true});
    }
  }
  return options.sort((a,b)=>a.option_id.localeCompare(b.option_id)).slice(0,Number.isInteger(maxOptions)&&maxOptions>=1&&maxOptions<=12?maxOptions:3);
}

/** Invalid values never authorize a suggestion; missing means one source serving. */
export function validatedSuggestedServings(value:unknown):number|null {
 if(value===undefined)return 1;
 return typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=10?value:null;
}

/** Derive totals once from immutable source nutrition; never serialize them as base nutrition. */
export function lookupOptionPortion(option:LookupOption,servings:number):{servings:number;nutrition:LookupOption['nutrition'];grams?:number}|null {
 const n=option?.nutrition,s=option?.serving;
 if(option?.loggable!==true||option.complete_item_verified!==true||option.nutrition_status!=='complete_verified'||s?.multiplier!==1||!number(servings)||servings<=0||servings>100||!n||!n.basis||!number(n.basis.amount)||n.basis.amount<=0||!['g','ml','serving'].includes(n.basis.unit)||typeof n.basis.label!=='string'||s.grams!==undefined&&(!number(s.grams)||s.grams<=0)||!['calories','protein','carbs','fats','fiber'].every(k=>number((n as any)[k])))return null;
 const nutrition={...n,basis:{...n.basis,amount:n.basis.amount*servings}};
 for(const k of ['calories','protein','carbs','fats','fiber'] as const)nutrition[k]=Math.round(n[k]*servings*10000)/10000;
 if(!number(nutrition.basis.amount)||!['calories','protein','carbs','fats','fiber'].every(k=>number((nutrition as any)[k])))return null;
 return {servings,nutrition,...(s.grams!==undefined?{grams:s.grams*servings}:{})};
}

/** Scale source-total ingredient quantities to servings without assigning cooked serving grams. */
export function scaleRecipeIngredients(option:unknown,requestedServings:number):Array<Record<string,unknown>>|null {
  if(!option||typeof option!=='object'||Array.isArray(option))return null;const r=(option as any).recipe;
  if(!r||!Number.isFinite(requestedServings)||requestedServings<=0||requestedServings>100||!Number.isFinite(r.yield?.servings)||r.yield.servings<=0||!Array.isArray(r.ingredients))return null;
  const factor=requestedServings/r.yield.servings;
  if(!Number.isFinite(factor))return null;
  return r.ingredients.map((item:any)=>{const range=item.quantityRange,scaledRange=range&&Number.isFinite(range.min)&&Number.isFinite(range.max)&&range.min>0&&range.min<=range.max?{min:range.min*factor,max:range.max*factor}:undefined;return {...item,...(number(item.quantity)?{quantity:item.quantity*factor}:{}),...(scaledRange?{quantityRange:scaledRange}:{}),...(number(item.grams)?{grams:item.grams*factor}:{})};});
}

/** Format the actual source-recipe ingredients for a requested fraction of the source yield. */

/** Build the existing diary-entry proposal shape only after recommendation completeness checks. Does not execute or confirm it. */
export function recommendationMealDraft(option:unknown,date:string,mealType:string,requestedServings?:number):Record<string,unknown>|null {
 if(!option||typeof option!=='object'||Array.isArray(option))return null;
 const o=option as LookupOption,suggested=validatedSuggestedServings(o.suggested_servings);
 if(suggested===null)return null;
 const count=requestedServings??suggested,portion=lookupOptionPortion(o,count),s=o.serving;
 if(!portion||typeof o.item_name!=='string'||!o.item_name.trim()||typeof s?.label!=='string'||!s.label.trim())return null;
 if(o.kind==='retrieved_recipe'&&(!o.recipe||o.recipe.yield.basis!=='source_stated'||!number(o.recipe.yield.servings)||o.recipe.yield.servings<=0))return null;
 const n=portion.nutrition,merchant=o.brand??o.restaurant_name;
 const foodName=merchant&&!o.item_name.toLowerCase().startsWith(merchant.toLowerCase())?`${merchant} - ${o.item_name}`:o.item_name;
 try{return normalizeCoachMutation({action_type:'add_food_to_diary',proposal:{food_name:foodName,calories:n.calories,protein:n.protein,carbs:n.carbs,fats:n.fats,fiber:n.fiber,date,meal_type:mealType,quantity:count,serving_unit:o.kind==='retrieved_recipe'?'servings':s.label,...(o.kind!=='retrieved_recipe'&&portion.grams!==undefined?{grams:portion.grams}:{})}}).proposal;}catch{return null;}
}

function publicValue(value:unknown):unknown {
  if(typeof value==='string')return value.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi,'$1').replace(/https?:\/\/\S+/gi,'').trim();
  if(Array.isArray(value))return value.map(publicValue);
  if(value&&typeof value==='object'){
    const out:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>)){
      if(/url/i.test(key)||key==='evidence')continue;
      out[key]=publicValue(item);
    }
    return out;
  }
  return value;
}

/** Strip evidence URLs only from the client projection; the persisted receipt retains the original provenance. */
export function projectCoachResponseForClient(value:unknown):unknown {
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const raw=value as Record<string,any>;
  const isLookup=!!raw.dish_evidence||!!raw.lookup_options||typeof raw.web_status==='string'||(Array.isArray(raw.sources)&&raw.sources.length>0);
  const projected={...raw} as Record<string,unknown>;
  // Provider generation IDs and phase costs are private receipt audit fields,
  // including ordinary coaching responses without lookup fields.
  delete projected.provider_phase_ledger;
  delete projected.phase_receipts;
  delete projected.private_evidence_refs;
  // Source URL bindings are server-only receipt data used to validate a later selection.
  delete projected.discovery_option_bindings;
  delete projected.private_discovery_diagnostics;
  delete projected.private_source_read_diagnostics;
  delete projected.private_provider_diagnostic;
  delete projected.private_planner_validation_diagnostic;
  delete projected.private_nutrition_snapshot;
  delete projected.private_source_servings;
  delete projected.private_restaurant_pool;
  if(!isLookup)return projected;
  const options=Array.isArray(raw.lookup_options)?publicValue(raw.lookup_options.filter((o:any)=>o&&validatedSuggestedServings(o.suggested_servings)!==null)):projectLookupOptions(raw.dish_evidence);
  if(typeof raw.corrected_text==='string')projected.corrected_text=publicValue(raw.corrected_text);
  if(raw.dish_evidence!==undefined)projected.dish_evidence=publicValue(raw.dish_evidence);
  if(raw.verified_food!==undefined)projected.verified_food=publicValue(raw.verified_food);
  projected.lookup_options=options;
  if(Array.isArray(raw.sources))projected.sources=raw.sources.map((source:any)=>({...(typeof source?.title==='string'?{title:publicValue(source.title)}:{}),...(typeof source?.retrievedAt==='string'?{retrievedAt:source.retrievedAt}:{})}));
  return projected;
}

/** Shared SSE frame encoder used by both lookup replay and streamed completion. */
export function coachResponseSSEFrame(value:unknown):string {
  return `data: ${JSON.stringify(projectCoachResponseForClient(value))}\n\n`;
}
