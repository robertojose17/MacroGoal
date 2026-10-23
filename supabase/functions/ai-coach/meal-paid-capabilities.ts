import {paidEligibility} from './paid-eligibility.ts';
// Informational snapshot only: atomic admission remains authoritative.
export async function currentMealCapabilities(db:any,owner:string,estimatorConfigured:boolean){
 const status=await paidEligibility(db,owner);
 return {discovery:status.discovery,estimate:status.estimate&&estimatorConfigured,reason:status.reason??(!estimatorConfigured?'estimator_not_configured':null),budget_checked:true};
}
