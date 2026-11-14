import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';
import {emitGoalChanged} from '@/utils/goalChangeEvents';
import {parseTdeeAcceptRequest,parseTdeeProposal,parseTdeeReceipt,type TdeeReviewServices,type TdeeProposal} from '@/utils/tdeeProposalReview';
const prefix=(owner:string)=>'@tdee_accept_pending_v2:'+owner+':';
const key=(request:{ownerId:string;requestId:string})=>prefix(request.ownerId)+request.requestId;
/** No tokens or nutrition data in the journal. Account-owned pending requests survive navigation. */
export function makeTdeeReviewServices(actor:()=>string|undefined):TdeeReviewServices {
 const current=(owner:string)=>{if(actor()!==owner)throw Error('account_changed');};
 const rpc=async(name:string,request:unknown,owner:string)=>{
  current(owner);const {data,error}=await supabase.auth.getSession();current(owner);
  if(error||!data.session||data.session.user.id!==owner)throw Error('account_changed');
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
  try{const response=await fetch(SUPABASE_PROJECT_URL+'/rest/v1/rpc/'+name,{method:'POST',signal:abort.signal,cache:'no-store',headers:{apikey:supabasePublicKey,Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_request:request})});if(!response.ok)throw Error('review_unavailable');const raw=await response.json();
   if(name!=='tdee_read_snapshot_offer_v1'){
    // Receipt reconciliation outlives the screen. Never expose old-account results,
    // but invalidate same-account consumers even if navigation unmounted the hook.
    const exact=parseTdeeReceipt(raw,parseTdeeAcceptRequest(request,owner));
    if(exact.status==='committed'){const latest=await supabase.auth.getSession();if(latest.error||latest.data.session?.user.id!==owner)throw Error('account_changed');emitGoalChanged(owner);}
   }
   current(owner);return raw;
  }finally{clearTimeout(timer);}
 };
 return {actor,newRequestId:()=>Crypto.randomUUID(),
  readPending:async owner=>{current(owner);const keys=(await AsyncStorage.getAllKeys()).filter(k=>k.startsWith(prefix(owner))).sort();current(owner);for(const candidate of keys){const raw=await AsyncStorage.getItem(candidate);current(owner);if(raw===null)continue;const request=parseTdeeAcceptRequest(JSON.parse(raw),owner);if(key(request)!==candidate)throw Error('invalid_journal');return request;}return null;},
  writePending:async(owner,request)=>{current(owner);const safe=parseTdeeAcceptRequest(request,owner);await AsyncStorage.setItem(key(safe),JSON.stringify(safe));current(owner);},
  clearPending:async request=>{current(request.ownerId);const safe=parseTdeeAcceptRequest(request,request.ownerId);await AsyncStorage.removeItem(key(safe));current(request.ownerId);},
  accept:request=>rpc('tdee_accept_snapshot_proposal_v1',request,request.ownerId),
  receipt:request=>rpc('tdee_read_snapshot_receipt_v1',request,request.ownerId),
  offer:request=>rpc('tdee_read_snapshot_offer_v1',request,request.ownerId),
  closeExpired:request=>rpc('tdee_close_expired_snapshot_request_v1',request,request.ownerId)
 };
}
/** Prepared only. Do not call until the reviewed issuer selector is enabled. */
export async function readTdeeReviewProposal(owner:string,isCurrent:()=>boolean,signal:AbortSignal):Promise<{reason:string;proposal:TdeeProposal|null;mayHaveWritten:boolean}>{
 const current=()=>{if(!isCurrent()||signal.aborted)throw Error('account_changed');};current();
 const {data,error}=await supabase.auth.getSession();current();if(error||!data.session||data.session.user.id!==owner)throw Error('account_changed');
 const response=await fetch(SUPABASE_PROJECT_URL+'/functions/v1/progress-intelligence?mode=adaptive-review-v1',{method:'POST',signal,cache:'no-store',headers:{apikey:supabasePublicKey,Authorization:'Bearer '+data.session.access_token}});current();const raw=await response.json();current();
 if(!raw||typeof raw.reason!=='string'||!(raw.proposal===null||typeof raw.proposal==='object'))throw Error('invalid_proposal');
 if(raw.reason==='calibration_required'||raw.reason==='reconciliation_required'){
  if(raw.proposal!==null||raw.mayHaveWritten!==true||response.status!==(raw.reason==='calibration_required'?202:409))throw Error('invalid_proposal');
  return {reason:raw.reason,proposal:null,mayHaveWritten:true};
 }
 if(response.status===200&&raw.reason==='no_change'&&raw.proposal===null&&(raw.mayHaveWritten===undefined||raw.mayHaveWritten===true))return {reason:'no_change',proposal:null,mayHaveWritten:raw.mayHaveWritten===true};
 if(response.status!==200||raw.reason!=='review_available'||raw.proposal===null||raw.mayHaveWritten!==undefined)throw Error('review_unavailable');
 return {reason:'review_available',proposal:parseTdeeProposal(raw.proposal,owner),mayHaveWritten:false};
}
