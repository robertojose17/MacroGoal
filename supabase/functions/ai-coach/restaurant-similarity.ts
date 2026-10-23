import {compoundFoodParts} from './meal-retrieval-outcome.ts';
export type RestaurantMatch={kind:'similar';requested_food:string;differences:string[]};
const normalize=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bpollo\b/g,'chicken').replace(/\barroz\b/g,'rice').replace(/\b(?:vegetable|verdura|verduras|vegetal|vegetales)\b/g,'vegetables');
// Relevance only. The caller must independently bind this item's identity to a citation.
export function relatedRestaurantMatch(food:string,evidence:string):RestaurantMatch|null{
 if(food.length>160||evidence.length>700||/[\n\r;|]/.test(evidence))return null;
 const query=normalize(food),text=normalize(evidence);
 const anchors=query.match(/\b(?:chicken|rice|vegetables|beef|pork|fish|salmon|shrimp|tofu|pizza|burger|salad|pasta|burrito|tacos?|sandwich|soup|beans|lentils|eggs?)\b/g)??[];
 if(!anchors.some(word=>new RegExp('\\b'+word+'\\b').test(text)))return null;
 const parts=compoundFoodParts(food)??[query];
 const differences=parts.filter(part=>!text.includes(part)).map(part=>'Requested '+part+' is not established by this item description.');
 return {kind:'similar',requested_food:food,differences:differences.length?differences:['Related source-listed dish; preparation, portions and included sides may differ.']};
}
