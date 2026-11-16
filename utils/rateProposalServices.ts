import * as Crypto from 'expo-crypto';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';
import {emitGoalChanged} from '@/utils/goalChangeEvents';
import {createSecureRateAcceptanceJournal} from '@/utils/secureRateAcceptanceJournal';
import {canonicalRateJson} from '@/release-candidates/tdee-adaptive-review/rateProposalRecord';
import type {RateClientPorts} from '@/utils/rateProposalController';
export function makeRateProposalServices(actor:string,isCurrent:()=>boolean,refreshVerifiedGoal:()=>Promise<{profile:{id:string};goal:{user_id:string}}>):RateClientPorts{
 const auth=async()=>{if(!isCurrent())throw Error('rate_account_changed');const {data,error}=await supabase.auth.getSession();if(error||data.session?.user.id!==actor||!isCurrent())throw Error('rate_account_changed');return data.session;};
 const request=async(path:string,body:unknown)=>{const session=await auth(),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);try{
  const response=await fetch(SUPABASE_PROJECT_URL+path,{method:'POST',signal:abort.signal,cache:'no-store',headers:{apikey:supabasePublicKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok)throw Error('rate_request_unavailable');const value=await response.json();await auth();return value;
 }finally{clearTimeout(timer);}};
 return {actor,isCurrent,now:Date.now,requestId:Crypto.randomUUID,digestText:text=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,text),
  journal:createSecureRateAcceptanceJournal(new URL(SUPABASE_PROJECT_URL).hostname.split('.')[0],true),
  offer:()=>request('/functions/v1/progress-intelligence?mode=adaptive-review-v1',undefined),
  accept:q=>request('/rest/v1/rpc/tdee_accept_rate_proposal_v1',{p_request:q}),
  receipt:q=>request('/rest/v1/rpc/tdee_read_rate_receipt_v1',{p_request:q}),
  chain:()=>request('/rest/v1/rpc/tdee_rate_acceptance_chain_v1',{}),
  goal:async()=>{await auth();const {data,error}=await supabase.from('goals').select('*').eq('user_id',actor).eq('is_active',true).limit(2);await auth();if(error||data?.length!==1)throw Error('rate_goal_unavailable');return {ownerId:actor,goal:data[0]};},
  onVerified:async(_receipt,goal)=>{await auth();const snapshot=await refreshVerifiedGoal();await auth();if(snapshot.profile.id!==actor||snapshot.goal.user_id!==actor||canonicalRateJson(snapshot.goal)!==canonicalRateJson(goal))throw Error('rate_goal_changed');emitGoalChanged(actor);},
 };
}
