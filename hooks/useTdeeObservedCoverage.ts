import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {AppState} from 'react-native';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';
import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {requestObservedCoverage,type TdeeObservedCoverage} from '@/utils/tdeeObservedCoverage';
export function useTdeeObservedCoverage(expectedOwner?:string){
 const [state,setState]=useState<TdeeObservedCoverage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const owner=useRef(expectedOwner);owner.current=expectedOwner;
 const mounted=useRef(false),focused=useRef(false),foreground=useRef(AppState.currentState==='active'),epoch=useRef(0),flight=useRef<AbortController|null>(null);
 const clear=useCallback(()=>{++epoch.current;flight.current?.abort();setState(null);setBusy(false);},[]);
 const run=useCallback(async()=>{
  if(!mounted.current||!focused.current||!foreground.current||!owner.current)throw Error('readiness_unavailable');
  flight.current?.abort();const controller=new AbortController(),revision=++epoch.current,actor=owner.current;flight.current=controller;
  setBusy(true);setError(false);
  const current=()=>mounted.current&&focused.current&&foreground.current&&owner.current===actor&&epoch.current===revision&&!controller.signal.aborted;
  try{
   const sessionResult=await supabase.auth.getSession(),session=sessionResult.data.session;
   if(!current()||sessionResult.error||!session||session.user.id!==actor)throw Error('account_changed');
   const result=await requestObservedCoverage({endpoint:SUPABASE_PROJECT_URL,apiKey:supabasePublicKey,token:session.access_token,owner:actor,signal:controller.signal,isCurrent:current});
   if(!current())throw Error('account_changed');setState(result);return result;
  }catch(e){if(current()){setState(null);setError(true);}throw e;}
  finally{if(flight.current===controller)flight.current=null;if(current())setBusy(false);}
 },[]);
 const refresh=useCallback(()=>{void run().catch(()=>{});},[run]);
 useEffect(()=>{mounted.current=true;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user.id!==owner.current){clear();setError(false);}});
  const unsubscribe=subscribeGoalChanged(actor=>{if(actor===undefined||actor===owner.current){clear();refresh();}});
  const app=AppState.addEventListener('change',next=>{foreground.current=next==='active';clear();if(foreground.current&&focused.current)refresh();});
  return()=>{mounted.current=false;clear();subscription.unsubscribe();unsubscribe();app.remove();};
 },[clear,refresh]);
 useFocusEffect(useCallback(()=>{focused.current=true;clear();refresh();return()=>{focused.current=false;clear();};},[expectedOwner,clear,refresh]));
 useEffect(()=>{if(!state)return;const id=setTimeout(()=>{clear();refresh();},Math.max(0,Date.parse(state.capturedAt)+300000-Date.now()));return()=>clearTimeout(id);},[state,clear,refresh]);
 return{state:state?.ownerId===expectedOwner?state:null,busy,error,refresh};
}
