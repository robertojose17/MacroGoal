import {compoundFoodParts} from './meal-retrieval-outcome.ts';
import {foodSearchTerms} from './gallery-meals.ts';
import {lookupIntent,publicFood} from './coach-lookup-intent.ts';
import {validateDiscoverFoodArgs} from './coach-model-led-contract.ts';
// Only called after owned source and explicit consent checks in meal-explore-route.
export function discoveryConsentMessage(query:any){
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
