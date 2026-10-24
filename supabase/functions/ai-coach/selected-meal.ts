import {validatePublicPortion} from './general-meal.ts';
import {savedMealConstraints,type SavedFoodPreferences} from './saved-food-preferences.ts';
/** Deterministic intake only. Never extract nutrition from assistant prose. */
export function selectedMealFromMessages(messages:any[]){
 const last=Array.isArray(messages)?messages.filter(x=>x?.role==='user'&&typeof x.content==='string').at(-1)?.content:null;
 if(typeof last!=='string'||last.length>2000)return null;
 // Do not bypass conversational allergy/exclusion collection with a quantity-only fallback.
 if(messages.some(x=>x?.role==='user'&&typeof x.content==='string'&&/\b(?:allerg\w*|al[eé]rg\w*|intoler\w*|avoid|evita\w*|without|sin|no puedo comer|vegetarian\w*|vegetariano\w*|vegan\w*|gluten[- ]free|dairy[- ]free|halal|kosher|no como|do not eat|don't eat|cannot eat|can't eat)\b/iu.test(x.content)))return null;
 // A supplied meal plus explicit request to estimate/review ingredients is sufficient.
 if(!/\b(?:estimaci[oó]n|estima|estimar|estimate|estimating|review|revisa|revisar)\b/i.test(last)||!/\b(?:ingredientes|ingredients|porciones|portion)\b/i.test(last))return null;
 const prefix=/^\s*(?:(?:quiero preparar|voy a preparar|quiero comer|i want to prepare|i want to eat|i am preparing)\s+|(?:please\s+)?(?:estimate|review)\s+(?:the\s+)?(?:ingredients|ingredient estimate|nutrition by ingredient)\s+(?:for|of)\s+|(?:por favor\s+)?(?:estima|estimar|revisa|revisar)\s+(?:los\s+)?ingredientes\s+(?:de|para)\s+)/i.exec(last);
 if(!prefix)return null;
 // Decimal periods are quantities, not sentence boundaries (e.g. 1.5 cups).
 const remainder=last.slice(prefix[0].length),boundary=/(?<!\d)\.|\.(?!\d)|[!?\n]/.exec(remainder);
 const portion=(boundary?remainder.slice(0,boundary.index):remainder).trim();
 if(!/\b\d+(?:[.,]\d+)?\s*(?:g|gramos?|grams?|oz|tazas?|cups?|cucharadas?|tablespoons?)\b/i.test(portion))return null;
 try{validatePublicPortion(portion);}catch{return null;}
 return {name:/^\s*(?:quiero|voy)/i.test(last)?'Comida seleccionada':'Selected meal',portion_label:portion};
}
export function selectedMealHandoff(messages:any[],saved:SavedFoodPreferences){
 const selected=selectedMealFromMessages(messages);if(!selected)return null;
 return {schema:'meal_conversation_v1',fields:{...savedMealConstraints(saved),mode:'quick',food_query:selected.name,public_area:null,restaurant:null,preference:'preferred_food'},status:'ready',question:null,requires_search_consent:false,requires_estimate_consent:true,constraints_review_required:true,selected_meal:selected,next_action:'prepare_general_estimate',options:[]};
}
