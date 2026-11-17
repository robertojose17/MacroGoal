import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';
import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {parseTdeeDashboardAttention,type TdeeDashboardAttention} from '@/utils/tdeeDashboardAttention';
/** Focus/foreground reads only. No auto-offer, enrollment, baseline, or settings mutation. */
export function useTdeeDashboardAttention(ownerId?:string){
 const [value,setValue]=useState<TdeeDashboardAttention|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const state=useRef({ownerId,focused:false,foreground:AppState.currentState==='active',mounted:false,epoch:0});state.current.ownerId=ownerId;
 const flight=useRef<AbortController|null>(null),expiry=useRef<ReturnType<typeof setTimeout>|null>(null);
 const invalidate=useCallback(()=>{state.current.epoch++;flight.current?.abort();flight.current=null;if(expiry.current)clearTimeout(expiry.current);expiry.current=null;setValue(null);setLoading(false);},[]);
 const refresh=useCallback(async():Promise<void>=>{
  const actor=state.current.ownerId;if(!actor||!state.current.mounted||!state.current.focused||!state.current.foreground)return;
  invalidate();const rev=state.current.epoch,abort=new AbortController();flight.current=abort;setLoading(true);setError(false);
  const current=()=>state.current.mounted&&state.current.focused&&state.current.foreground&&state.current.ownerId===actor&&state.current.epoch===rev&&!abort.signal.aborted;
  const timer=setTimeout(()=>abort.abort(),30000);
  try{
   const {data,error:authError}=await supabase.auth.getSession();if(authError||data.session?.user.id!==actor||!current())throw Error('account_changed');
   const response=await fetch(SUPABASE_PROJECT_URL+'/functions/v1/progress-intelligence?mode=dashboard-attention-v1',{method:'GET',signal:abort.signal,cache:'no-store',headers:{apikey:supabasePublicKey,Authorization:'Bearer '+data.session.access_token}});
   if(!response.ok||!current())throw Error('attention_unavailable');
   const result=parseTdeeDashboardAttention(await response.json(),actor);
   const latest=await supabase.auth.getSession();if(latest.error||latest.data.session?.user.id!==actor||!current())throw Error('account_changed');
   setValue(result);expiry.current=setTimeout(()=>{invalidate();if(state.current.focused&&state.current.foreground)void refresh();},Math.max(1,result.expiresAt-Date.now()));
  }catch{if(state.current.mounted&&state.current.epoch===rev){setValue(null);setError(true);}}
  finally{clearTimeout(timer);if(state.current.mounted&&state.current.epoch===rev){flight.current=null;setLoading(false);}}
 },[invalidate]);
 useEffect(()=>{state.current.mounted=true;const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user.id!==state.current.ownerId){invalidate();setError(false);}else if(state.current.focused)void refresh();});
  const app=AppState.addEventListener('change',next=>{state.current.foreground=next==='active';invalidate();if(next==='active')void refresh();});
  const stop=subscribeGoalChanged(actor=>{if(!actor||actor===state.current.ownerId){invalidate();void refresh();}});
  return()=>{state.current.mounted=false;data.subscription.unsubscribe();app.remove();stop();invalidate();};
 },[refresh,invalidate]);
 useFocusEffect(useCallback(()=>{state.current.focused=true;void refresh();return()=>{state.current.focused=false;invalidate();};},[ownerId,refresh,invalidate]));
 const current=value?.ownerId===ownerId&&Date.now()>=Date.parse(value.capturedAt)&&Date.now()<value.expiresAt?value:null;
 return {value:current,loading,error,refresh};
}
