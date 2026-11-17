import {createTdeeAccessRefresh} from '@/supabase/functions/observed-snapshot-release/functions/observed-program/tdee-access-refresh.mjs';
import {serializeBrowserRequestJournal} from '@/utils/browserRequestJournalLock';
import * as Crypto from 'expo-crypto';import AsyncStorage from '@react-native-async-storage/async-storage';import {Platform} from 'react-native';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';import {emitGoalChanged} from '@/utils/goalChangeEvents';
import {createRules14RequestJournal} from '@/utils/rules14AcceptanceJournal';import {createSecureRules14AcceptanceJournal} from '@/utils/secureRules14AcceptanceJournal';
import {canonicalRateJson} from '@/release-candidates/tdee-adaptive-review/rateProposalRecord';
import {verifyRules14AcceptanceChain} from '@/release-candidates/tdee-adaptive-review/rules14AcceptanceChain';
import type {Rules14ClientPorts} from '@/utils/rules14ProposalController';
export function makeRules14ProposalServices(actor:string,isCurrent:()=>boolean,refreshVerifiedGoal:()=>Promise<{profile:{id:string};goal:{user_id:string}}>):Rules14ClientPorts{
 const project=new URL(SUPABASE_PROJECT_URL).hostname.split('.')[0],digestText=(s:string)=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,s);
 const journal=Platform.OS==='web'?serializeBrowserRequestJournal(createRules14RequestJournal({project,newGeneration:Crypto.randomUUID,digest:digestText,storage:{get:key=>AsyncStorage.getItem(key),set:async(key,value)=>{if(value.length>4096)throw Error('rules14_journal_oversize');await AsyncStorage.setItem(key,value);},remove:key=>AsyncStorage.removeItem(key)}}),'tdee_rules14_accept_v1'):createSecureRules14AcceptanceJournal(project,true);
 const auth=async()=>{if(!isCurrent())throw Error('rules14_account_changed');const {data,error}=await supabase.auth.getSession();if(error||data.session?.user.id!==actor||data.session.user.is_anonymous||!isCurrent())throw Error('rules14_account_changed');return data.session;};
 const request=async(path:string,body:unknown,method='POST')=>{const session=await auth(),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);try{const response=await fetch(SUPABASE_PROJECT_URL+path,{method,signal:abort.signal,cache:'no-store',headers:{apikey:supabasePublicKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!response.ok)throw Error('rules14_request_unavailable');const value=await response.json();await auth();return value;}finally{clearTimeout(timer);}};
 const prepareAccess=createTdeeAccessRefresh({
  readContext:()=>request('/rest/v1/rpc/observed_get_dynamic_tdee_context_v1',{}),
  refreshAuthority:()=>request('/functions/v1/common-premium-authority',undefined,'GET'),
 });
 return {actor,isCurrent,now:Date.now,requestId:Crypto.randomUUID,digestText,journal,
  offer:()=>request('/functions/v1/progress-intelligence?mode=adaptive-review-v1',undefined),accept:async q=>{
   // Reconcile prior writes before refreshing; retries never lose a known receipt.
   const prior=await request('/rest/v1/rpc/tdee_read_rules14_acceptance_receipt_v1',{p_request:q});
   if(prior?.version!=='rules14-acceptance-receipt-v1'||prior.status!=='not_found')return prior;
   await prepareAccess('Bearer '+(await auth()).access_token);
   return request('/rest/v1/rpc/tdee_accept_rules14_proposal_v1',{p_request:q});
  },receipt:q=>request('/rest/v1/rpc/tdee_read_rules14_acceptance_receipt_v1',{p_request:q}),chain:()=>request('/rest/v1/rpc/tdee_rules14_acceptance_chain_v1',{}),
  verifyChain:(source,now)=>verifyRules14AcceptanceChain(source,now,digestText),
  goal:async()=>{await auth();const {data,error}=await supabase.from('goals').select('*').eq('user_id',actor).eq('is_active',true).limit(2);await auth();if(error||data?.length!==1)throw Error('rules14_goal_unavailable');return {ownerId:actor,goal:data[0]};},
  onVerified:async(_receipt,goal)=>{await auth();const snapshot=await refreshVerifiedGoal();await auth();if(snapshot.profile.id!==actor||snapshot.goal.user_id!==actor||canonicalRateJson(snapshot.goal)!==canonicalRateJson(goal))throw Error('rules14_goal_changed');emitGoalChanged(actor);},
 };
}

