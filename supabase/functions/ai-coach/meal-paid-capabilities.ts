import {WEB_PILOT_USER_IDS,WEB_SEARCH_APPROVED} from './coach-web-search.ts';
// Display eligibility only, never a reservation/permission grant. Recompute on
// every response, including replay/recovery; never trust stored receipt metadata.
export async function currentMealCapabilities(db:any,owner:string,estimatorConfigured:boolean){
 const listed=WEB_SEARCH_APPROVED&&WEB_PILOT_USER_IDS.includes(owner);
 let opted=false;if(listed){try{const r=await db.rpc('coach_web_pilot_enabled_v1',{p_user_id:owner});opted=!r.error&&r.data===true;}catch{/* Unknown is unavailable. */}}
 return {discovery:listed&&opted,estimate:listed&&opted&&estimatorConfigured,reason:!listed?'pilot_not_enabled':!opted?'opt_in_unavailable':!estimatorConfigured?'estimator_not_configured':null,budget_checked:false};
}
