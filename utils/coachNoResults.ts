import {parseConstraints} from './coachDietaryConstraints';
import type {MealExploreInput} from './coachMealTransport';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=160;
export function noResultsContext(body:any,mode:MealExploreInput['mode'],receiptId:string):{sourceRequestId:string;reason:'source_evidence_unavailable'|'dietary_constraints_filtered';input:MealExploreInput}|null {
 if(body?.outcome!=='no_validated_options'||body.status!=='clarify'||body.question?.key!=='dish_and_portion'||!['source_evidence_unavailable','dietary_constraints_filtered'].includes(body.reason)||body.next_action!=='revise_search'||body.retry_automatically!==false||body.server_auto_logging!==false||body.confirmation_transport!=='existing_log_food'||!Array.isArray(body.options)||body.options.length||!uuid(body.source_request_id)||body.source_request_id===receiptId)return null;
 const q=body.discovery_request,c=parseConstraints(body.dietary_constraints);if(!q||!c||q.mode!==(mode==='eat_out'?'restaurant':'recipe')||!text(q.food)||mode==='eat_out'&&!text(q.area))return null;
 if(q.restaurant!==undefined&&!text(q.restaurant)||q.area!==undefined&&!text(q.area)||q.preference!==undefined&&!['balanced','high_protein','lower_calorie','preferred_food'].includes(q.preference)||q.max_minutes!==undefined&&(!Number.isInteger(q.max_minutes)||q.max_minutes<1||q.max_minutes>240))return null;
 if(q.dietary_constraints!==undefined){const nested=parseConstraints(q.dietary_constraints);if(!nested||JSON.stringify(nested)!==JSON.stringify(c))return null;}
 return {sourceRequestId:body.source_request_id,reason:body.reason,input:{mode,food_query:q.food,exclusions:c.exclusions,allergens:c.allergens,dietary_preferences:c.dietary_preferences,...(q.restaurant?{restaurant:q.restaurant}:{}),...(q.area?{public_area:q.area}:{}),...(q.preference?{preference:q.preference}:{}),...(q.max_minutes!==undefined?{available_minutes:q.max_minutes}:{})}};
}
