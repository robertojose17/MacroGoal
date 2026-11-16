import {serializeBrowserRequestJournal} from '@/utils/browserRequestJournalLock';
import * as Crypto from 'expo-crypto';import AsyncStorage from '@react-native-async-storage/async-storage';import {Platform} from 'react-native';
import {supabase,SUPABASE_PROJECT_URL} from '@/lib/supabase/client';
import {createRulesScreeningRequestJournal} from '@/utils/rulesScreeningJournal';
import {createSecureRulesScreeningJournal} from '@/utils/secureRulesScreeningJournal';
import type {ScreeningRequest} from '@/utils/rulesScreeningController';
/** Browser journal holds only the aggregate answer and exact request bindings.
 * No tokens, diagnoses, condition fields, free text, or automatic retries. */
export function rulesScreeningJournal(){
 const project=new URL(SUPABASE_PROJECT_URL).hostname.split('.')[0];
 if(Platform.OS!=='web')return createSecureRulesScreeningJournal(project,true);
 return serializeBrowserRequestJournal(createRulesScreeningRequestJournal({project,newGeneration:Crypto.randomUUID,digest:value=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value),storage:{
  get:key=>AsyncStorage.getItem(key),set:async(key,value)=>{if(value.length>4096)throw Error('screening_journal_oversize');await AsyncStorage.setItem(key,value);},remove:key=>AsyncStorage.removeItem(key),
 }}),'tdee_rules_screening_v1');
}
export function makeRulesScreeningPorts(owner:string,isCurrent:()=>boolean){
 return {owner,isCurrent,now:Date.now,newRequestId:Crypto.randomUUID,journal:rulesScreeningJournal(),rpc:async(action:'read'|'confirm'|'receipt',request:ScreeningRequest|null)=>{
  const check=async()=>{if(!isCurrent())throw Error('screening_account_changed');const auth=await supabase.auth.getUser();if(auth.error||auth.data.user?.id!==owner||auth.data.user.is_anonymous||!isCurrent())throw Error('screening_account_changed');};
  await check();const client=supabase as unknown as {rpc(name:'tdee_rules14_screening_v1',args:{p_action:string;p_request:ScreeningRequest|null}):PromiseLike<{data:unknown;error:unknown}>};
  const result=await client.rpc('tdee_rules14_screening_v1',{p_action:action,p_request:request});await check();if(result.error)throw Error('screening_unavailable');return result.data;
 }};
}
