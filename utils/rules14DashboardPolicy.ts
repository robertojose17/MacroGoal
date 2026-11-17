/** Client affordances only. Every write remains independently authorized by the server. */
export function rules14DashboardActionAllowed(action:'review'|'accept'|'check'|'retry',attention:boolean,premium:boolean){
 return action==='check'||(premium&&(action!=='review'||attention));
}
