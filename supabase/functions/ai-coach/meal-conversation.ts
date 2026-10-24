import {savedMealConstraints,type SavedFoodPreferences} from './saved-food-preferences.ts';
import {dietaryConstraints} from './dietary-constraints.ts';
import {publicFood,publicPlace} from './coach-lookup-intent.ts';
export const MEAL_HANDOFF_MARKER='MEAL_HANDOFF:';
export const MEAL_CONVERSATION_INSTRUCTIONS=`For meal-choice conversation, speak naturally and use the user's language. Ask at most ONE useful missing question per turn. Do not force a named restaurant: for eating out, first learn a public city/area; a flexible meal and a macro preference are enough to offer a public search. Do not infer location from private profile data. When relevant, end your response with MEAL_HANDOFF: followed by one JSON object with exactly {"mode":"cook"|"quick"|"eat_out"|null,"food_query":string|null,"public_area":string|null,"restaurant":string|null,"preference":"balanced"|"high_protein"|"lower_calorie"|"preferred_food"|null}. Also include exclusions:string[], allergens:string[], dietary_preferences:string[]; preserve every explicit or saved restriction using exact user words, never invent an allergy or translate away a restriction. Empty means not collected, not no restrictions. Use saved preferences without asking the user to repeat them; include restrictions in the existing search consent rather than adding a separate preference confirmation. Use the user's actual public restaurant/area words, not invented entities. For an unrestricted restaurant request food_query may be "meal". No URLs, addresses, images, nutrition, source claims, logging or action proposals inside the handoff. Do not claim you searched: offer explicit search confirmation. This metadata is an optional intake handoff, not an action. Never append a meal-plan/food-logging ACTION_PROPOSAL for choosing a meal; reviewed source/estimate cards own that path. For ordinary conversation omit MEAL_HANDOFF. Put it last, with no following text.`;
const norm=(s:string)=>s.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// Normalize only bounded comma separators; reuse all existing public-food guards.
export function conversationalPublicFood(value:string){
 if(value.length>72||/[\u0000-\u001f\u007f]/.test(value))return undefined;
 if(!value.includes(','))return publicFood(value);
 const parts=value.split(',');if(parts.length>4||parts.some(p=>!p.trim()))return undefined;
 return publicFood(parts.map(p=>p.trim()).join(' '));
}
export function validateMealConversation(value:any,messages:any[],saved?:SavedFoodPreferences){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['mode','food_query','public_area','restaurant','preference','exclusions','allergens','dietary_preferences'].includes(k)))return null;
 if(value.mode!==null&&!['cook','quick','eat_out'].includes(value.mode)||value.preference!==null&&!['balanced','high_protein','lower_calorie','preferred_food'].includes(value.preference))return null;
 for(const key of ['food_query','public_area','restaurant'])if(value[key]!==null&&(typeof value[key]!=='string'||value[key].length>160))return null;
 const userTurns=messages.filter(x=>x?.role==='user'&&typeof x.content==='string').map(x=>' '+norm(x.content)+' ');
 const grounded=(s:string|null,kind:'area'|'restaurant')=>{if(!s)return null;const parsed=publicPlace(s,kind);return parsed&&userTurns.some(t=>t.includes(' '+norm(parsed)+' '))?parsed:null;};
 let constraints;try{const base=savedMealConstraints(saved??{dietary_restrictions:[],protein_preferences:[],recipe_styles:[],disliked_foods:''});constraints=dietaryConstraints(value);for(const key of ['exclusions','allergens','dietary_preferences'] as const){if(constraints[key].some(t=>!base[key].some(v=>norm(v)===norm(t))&&!userTurns.some(u=>u.includes(' '+norm(t)+' '))))return null;}constraints=dietaryConstraints(Object.fromEntries((['exclusions','allergens','dietary_preferences'] as const).map(key=>[key,[...new Set([...base[key],...constraints[key]])]])));}catch{return null;}
 const fields={...constraints,mode:value.mode,food_query:value.food_query?conversationalPublicFood(value.food_query)??null:null,public_area:grounded(value.public_area,'area'),restaurant:grounded(value.restaurant,'restaurant'),preference:value.preference};
 if(fields.mode==='eat_out'&&value.food_query===null)fields.food_query='meal';
 const missing=value.food_query!==null&&!fields.food_query?'food_query':!fields.mode?'mode':fields.mode==='eat_out'&&!fields.public_area?'public_area':!fields.food_query?'food_query':null;
 return {schema:'meal_conversation_v1',fields,status:missing?'clarify':'ready',question:missing?{key:missing}:null,requires_search_consent:true,constraints_review_required:true,options:[]};
}
export function extractMealConversation(text:string,messages:any[],saved?:SavedFoodPreferences){
 const at=text.indexOf(MEAL_HANDOFF_MARKER);if(at<0)return {text:stripConversationDirectives(text),handoff:null};
 let handoff=null;const metadata=text.slice(at+MEAL_HANDOFF_MARKER.length).trim();if(metadata.length<=2048){try{handoff=validateMealConversation(JSON.parse(metadata),messages,saved);}catch{}}
 return {text:stripConversationDirectives(text.slice(0,at)).trimEnd(),handoff};
}
// Hold only the marker-sized tail, preserving natural streaming while preventing
// partial metadata markers/JSON from appearing in the user's transcript.
export function stripConversationDirectives(text:string){const points=['MEMORY_UPDATE:','ACTION_PROPOSAL:'].map(m=>text.indexOf(m)).filter(n=>n>=0);return points.length?text.slice(0,Math.min(...points)).trimEnd():text;}
export function mealConversationStream(){const markers=[MEAL_HANDOFF_MARKER,'MEMORY_UPDATE:','ACTION_PROPOSAL:'];let pending='',hidden=false;return {push(chunk:string){if(hidden)return '';pending+=chunk;const hits=markers.map(m=>pending.indexOf(m)).filter(i=>i>=0);if(hits.length){hidden=true;const out=pending.slice(0,Math.min(...hits));pending='';return out;}const length=Math.max(0,pending.length-Math.max(...markers.map(m=>m.length))+1),out=pending.slice(0,length);pending=pending.slice(length);return out;},finish(){const out=hidden?'':pending;pending='';return out;}};}
