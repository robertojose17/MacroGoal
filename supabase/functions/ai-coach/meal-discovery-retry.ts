import {coachRequest} from './_shared/coach-access.ts';
/** Called only on rows from the authenticated owner's existing recovery RPC. */
export function mealDiscoveryRetryCheck(parent:any,input:{owner:string;parentId:string;requestId:string;fingerprint:string;confirmed:boolean}):{error:string;status:number}|null{
 if(!parent||parent.request_id!==input.parentId||parent.user_id!==undefined&&parent.user_id!==input.owner)return {error:'retry_not_found',status:404};
 if(input.requestId.toLowerCase()===input.parentId.toLowerCase()||input.confirmed!==true)return {error:'explicit_retry_consent_required',status:400};
 try{const {lookup_context:_context,...fields}=parent.request_payload??{};const original=coachRequest({...fields,request_id:parent.request_id});if(original.kind!=='message'||original.fingerprintInput!==input.fingerprint)return {error:'retry_envelope_mismatch',status:409};}catch{return {error:'receipt_identity_unavailable',status:503};}
 if(parent.state==='completed')return null; // Existing modern replay handles this; never dispatch.
 if(parent.successor_request_id)return {error:'retry_exists',status:409};
 if(parent.successor_request_id!==null)return {error:'receipt_identity_unavailable',status:503};
 if(parent.execution_state!=='stopped')return {error:parent.execution_state==='committing'?'execution_committing':'execution_active',status:409};
 if(parent.retry_eligible!==true)return {error:'retry_not_eligible',status:409};
 return null;
}
