import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';
import {parseMacroRequest,parseMacroState,verifyMacroReceipt,type MacroRequest} from '@/utils/tdeeMacroChoice';
const prefix=(owner:string)=>'@tdee_macro_choice_v1:'+owner+':';
/** Persist only this actor's exact pending preference; never tokens or target data. */
export function makeMacroChoiceServices(actor:()=>string|undefined){
 const current=(owner:string)=>{if(actor()!==owner)throw Error('account_changed');};
 const session=async(owner:string)=>{current(owner);const r=await supabase.auth.getSession();current(owner);if(r.error||r.data.session?.user.id!==owner)throw Error('account_changed');return r.data.session;};
 const rpc=async(owner:string,name:string,request?:MacroRequest)=>{const auth=await session(owner),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);try{const response=await fetch(SUPABASE_PROJECT_URL+'/rest/v1/rpc/'+name,{method:'POST',cache:'no-store',signal:abort.signal,headers:{apikey:supabasePublicKey,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify(request?{p_request:request}:{})});const raw=await response.json();await session(owner);if(!response.ok){const error=new Error('macro_unavailable');if(['40001','22023','42501','55000'].includes(raw?.code))Object.assign(error,{definite:true});throw error;}return raw;}finally{clearTimeout(timer);}};
 const pending=async(owner:string)=>{await session(owner);const keys=(await AsyncStorage.getAllKeys()).filter(k=>k.startsWith(prefix(owner))).sort();current(owner);for(const k of keys){const v=await AsyncStorage.getItem(k);current(owner);if(v===null)continue;const request=parseMacroRequest(JSON.parse(v));if(k!==prefix(owner)+request.requestId)throw Error('invalid_journal');return request;}return null;};
 const clear=async(owner:string,request:MacroRequest)=>{await session(owner);await AsyncStorage.removeItem(prefix(owner)+request.requestId);current(owner);};
 const submit=async(owner:string,input:MacroRequest,retry=false)=>{const request=parseMacroRequest(input);await session(owner);const existing=await pending(owner);if(existing&&JSON.stringify(existing)!==JSON.stringify(request))throw Error('pending_request');if(retry&&!existing)throw Error('pending_missing');await AsyncStorage.setItem(prefix(owner)+request.requestId,JSON.stringify(request));current(owner);try{const raw=await rpc(owner,request.mode==='revoked'?'tdee_revoke_macro_choice_v1':'tdee_save_macro_choice_v1',request);verifyMacroReceipt(raw,request);await clear(owner,request);return raw;}catch(e){if((e as {definite?:boolean}).definite)await clear(owner,request);throw e;}};
 return{newId:()=>Crypto.randomUUID(),pending,submit,read:async(owner:string)=>parseMacroState(await rpc(owner,'tdee_read_macro_choice_v1'),owner)};
}
