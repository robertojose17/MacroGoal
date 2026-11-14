import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {AppState} from 'react-native';
import * as Crypto from 'expo-crypto';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';
import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {requestTdeeReadiness,readinessDayChanges,type TdeeReadiness,type EligibilityResponse} from '@/utils/tdeeReadiness';
export function useTdeeReadiness(expectedOwner?:string){
 const [state,setState]=useState<TdeeReadiness|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const snapshot=useRef<TdeeReadiness|null>(null),owner=useRef(expectedOwner);owner.current=expectedOwner;
 const mounted=useRef(false),focused=useRef(false),foreground=useRef(AppState.currentState==='active'),epoch=useRef(0),flight=useRef<AbortController|null>(null),saving=useRef(false),refreshRef=useRef<()=>void>(()=>{});
 const clear=useCallback(()=>{++epoch.current;flight.current?.abort();snapshot.current=null;setState(null);setBusy(false);},[]);
 const run=useCallback(async(mutation?:Record<string,unknown>)=>{
  if(!mounted.current||!focused.current||!foreground.current||!owner.current||saving.current)throw Error('readiness_unavailable');
  flight.current?.abort();const controller=new AbortController(),revision=++epoch.current,actor=owner.current;flight.current=controller;
  if(mutation)saving.current=true;setBusy(true);setError(false);
  const current=()=>mounted.current&&focused.current&&foreground.current&&owner.current===actor&&epoch.current===revision&&!controller.signal.aborted;
  try{
   const sessionResult=await supabase.auth.getSession(),session=sessionResult.data.session;
   if(!current()||sessionResult.error||!session||session.user.id!==actor)throw Error('account_changed');
   const result=await requestTdeeReadiness({endpoint:SUPABASE_PROJECT_URL,apiKey:supabasePublicKey,token:session.access_token,owner:actor,signal:controller.signal,isCurrent:current,mutation});
   if(!current())throw Error('account_changed');snapshot.current=result;setState(result);return result;
  }catch(e){if(current()){snapshot.current=null;setState(null);setError(true);}throw e;}
  finally{if(mutation)saving.current=false;if(flight.current===controller)flight.current=null;if(current())setBusy(false);else if(mutation&&mounted.current&&focused.current&&foreground.current&&!saving.current)refreshRef.current();}
 },[]);
 const refresh=useCallback(()=>{if(saving.current)return;void run().catch(()=>{});},[run]);refreshRef.current=refresh;
 useEffect(()=>{mounted.current=true;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user.id!==owner.current){clear();setError(false);}});
  const unsubscribe=subscribeGoalChanged(actor=>{if(actor===undefined||actor===owner.current){clear();refresh();}});
  const app=AppState.addEventListener('change',next=>{foreground.current=next==='active';clear();if(foreground.current&&focused.current)refresh();});
  return()=>{mounted.current=false;clear();subscription.unsubscribe();unsubscribe();app.remove();};
 },[clear,refresh]);
 useFocusEffect(useCallback(()=>{focused.current=true;clear();refresh();return()=>{focused.current=false;clear();};},[expectedOwner,clear,refresh]));
 useEffect(()=>{if(!state)return;const id=setTimeout(()=>{clear();refresh();},Math.max(0,Date.parse(state.capturedAt)+300000-Date.now()));return()=>clearTimeout(id);},[state,clear,refresh]);
 const save=useCallback(async(base:TdeeReadiness,change:{response:EligibilityResponse}|{selected:ReadonlySet<string>})=>{
  if(snapshot.current!==base||base.ownerId!==owner.current||Date.now()-Date.parse(base.capturedAt)>300000)throw Error('readiness_conflict');
  const common={requestId:Crypto.randomUUID(),journeyBinding:base.journeyBinding};
  if('response'in change)return run({...common,kind:'eligibility',version:base.questionnaireVersion,profileBinding:base.profileBinding,response:change.response});
  const days=readinessDayChanges(base,change.selected);if(!days.length)return base;
  return run({...common,kind:'days',version:base.statementVersion,days});
 },[run]);
 return{state:state?.ownerId===expectedOwner?state:null,busy,error,refresh,save};
}
