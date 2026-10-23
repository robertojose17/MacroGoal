import {compoundFoodParts} from './meal-retrieval-outcome.ts';
import {foodSearchTerms} from './gallery-meals.ts';
import {lookupIntent,publicFood} from './coach-lookup-intent.ts';
import {validateDiscoverFoodArgs} from './coach-model-led-contract.ts';
/** Separate bounded explicit recipe timing from dish identity; the stored user request is untouched. */
export function normalizedDiscoveryQuery(query:any){
 if(query.mode!=='recipe'||typeof query.food!=='string')return query;
 let food=query.food.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
 const timing=/\s+(?:en|in|within)\s+(\d{1,3})\s*(?:minutos?|minutes?|mins?)\s*$/i.exec(food);
 let minutes=query.max_minutes;
 if(timing){const n=Number(timing[1]);if(n<1||n>240||minutes!==undefined&&minutes!==n)throw Error('public_search_fields_invalid');minutes=n;food=food.slice(0,timing.index).trim();}
 food=food.replace(/^(?:una?\s+)?receta\s+(?:rapida\s+)?(?:de\s+)?/i,'').replace(/^(?:a\s+)?(?:quick|fast)\s+(?:recipe\s+(?:for\s+)?)?/i,'').replace(/^recipe\s+(?:for\s+)?/i,'');
 // Bounded chicken/rice equivalence, retaining any preparation or exclusion qualifiers.
 food=food.replace(/\bpollo\s+con\s+arroz\b/gi,'chicken and rice').replace(/\bchicken\s+(?:with\s+)?rice\b/gi,'chicken and rice');
 return {...query,food,...(minutes!==undefined?{max_minutes:minutes}:{})};
}
export function recipeTimingOptions<T extends {prep_minutes:number|null;nutrition:{assumptions:string[]}}>(options:T[],query:any):T[]{
 const normalized=normalizedDiscoveryQuery(query??{}),minutes=normalized.mode==='recipe'?normalized.max_minutes:undefined;
 if(minutes===undefined)return options;
 return options.filter(o=>o.prep_minutes===null||o.prep_minutes<=minutes).map(o=>o.prep_minutes!==null?o:{...o,nutrition:{...o.nutrition,assumptions:[...o.nutrition.assumptions,`Preparation time is unknown; the requested maximum of ${minutes} minutes is not verified.`]}});
}
// Only called after owned source and explicit consent checks in meal-explore-route.
export function discoveryConsentMessage(query:any){
 query=normalizedDiscoveryQuery(query);
 // Preserve recognized compound preparation/components before gallery keyword reduction.
 const compound=compoundFoodParts(query.food);
 if(!compound&&!publicFood(query.food))throw Error('public_search_fields_invalid');
 const desired=compound?compound.join(' and '):foodSearchTerms(query.food).join(' ');
 const food=desired||(query.mode==='restaurant'&&query.food==='meal'?'meal':'');
 const proposal={version:1,food,mode:query.mode,...(query.mode==='recipe'&&query.max_minutes!==undefined?{max_minutes:query.max_minutes}:{}),...(query.mode==='restaurant'?{locality:query.area,...(query.restaurant?{restaurant:query.restaurant}:{})}:{}),...(query.preference&&query.preference!=='preferred_food'?{preference:query.preference}:{})};
 const text='public_lookup_confirmation:'+JSON.stringify(proposal),intent=lookupIntent(text);
 const args=confirmedDiscoveryArgs(intent);
 if(!args)throw Error(query.mode==='restaurant'&&!query.area?'public_area_required':'public_search_fields_invalid');
 return text;
}


export function confirmedDiscoveryArgs(intent:ReturnType<typeof lookupIntent>){return intent.kind==='search'?validateDiscoverFoodArgs({food:intent.food,mode:intent.mode,...(intent.context?.max_minutes!==undefined?{max_minutes:intent.context.max_minutes}:{}),...(intent.restaurant?{restaurant:intent.restaurant}:{}),...(intent.area?{city:intent.area.split(',')[0].trim(),...(intent.area.split(',')[1]?{region:intent.area.split(',')[1].trim()}:{})}:{}),...(intent.context?.preference?{preference:intent.context.preference}:{})}):null;}
