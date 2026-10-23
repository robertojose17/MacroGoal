import {evaluateCoachAccess} from './_shared/coach-access.ts';
import {withPersistenceDeadline,TOTAL_DEADLINE_MS} from './bounded-provider-phase.ts';
export type PaidEligibility={enabled:boolean;reason:string|null;chat:boolean;discovery:boolean;estimate:boolean};
export async function paidEligibility(db:any,owner:string,now=Date.now()):Promise<PaidEligibility>{
 const denied=(reason:string):PaidEligibility=>({enabled:false,reason,chat:false,discovery:false,estimate:false});
 try{
  const deadline=now+TOTAL_DEADLINE_MS;
  const s=await withPersistenceDeadline(()=>db.from('subscriptions').select('entitlement_ids,status,expiration_at,purchased_at,trial_end,billing_issues_detected_at,cancel_at_period_end').eq('user_id',owner),deadline);
  if(s.error||!Array.isArray(s.data))return denied('entitlement_unavailable');
  const access=evaluateCoachAccess(s.data,now);if(access!=='premium')return denied(access==='free'?'premium_required':'entitlement_unavailable');
  const p=await withPersistenceDeadline(()=>db.from('coach_permissions').select('permission_level').eq('user_id',owner).maybeSingle(),deadline);
  if(p.error||![1,2,3,4].includes(p.data?.permission_level))return denied('permission_required');
  const r=await withPersistenceDeadline(()=>db.rpc('coach_begin_execution_v2',{p_user_id:owner,p_request_id:null,p_fingerprint:null,p_access:null,p_request_payload:{control:'paid_admission_status_v1'},p_retry_of_request_id:null,p_reserve_web:false}),deadline);
  const d=r.data;if(r.error||d?.kind!=='paid_admission_status_v1')return denied('paid_access_unavailable');
  if(d.enabled===false&&d.reason==='account_paused')return denied('account_paused');
  if(d.enabled!==true||![d.account_remaining,d.global_remaining].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))return denied('paid_access_unavailable');
  const available=Math.min(d.account_remaining,d.global_remaining);
  return {enabled:true,chat:available>=.25,discovery:available>=3,estimate:available>=3,reason:available>=3?null:d.global_remaining<3?'global_budget_exhausted':'account_budget_exhausted'};
 }catch{return denied('paid_access_unavailable');}
}
