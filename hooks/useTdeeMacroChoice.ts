import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {AppState} from 'react-native';
import {supabase} from '@/lib/supabase/client';
import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {makeMacroChoiceServices} from '@/utils/tdeeMacroChoiceServices';
import {makeMacroRequest,type MacroMode,type MacroSplit,type MacroState,type MacroRequest} from '@/utils/tdeeMacroChoice';
const flights=new Set<string>();
export function useTdeeMacroChoice(expectedOwner?:string){
 const [state,setState]=useState<MacroState|null>(null),[pending,setPending]=useState<MacroRequest|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const owner=useRef(expectedOwner);owner.current=expectedOwner;
 const live=useRef(false),focus=useRef(false),foreground=useRef(AppState.currentState==='active'),epoch=useRef(0),snapshot=useRef<MacroState|null>(null);
 const service=useRef(makeMacroChoiceServices(()=>live.current?owner.current:undefined)).current;
 const invalidate=useCallback(()=>{++epoch.current;snapshot.current=null;if(live.current){setState(null);setPending(null);setBusy(false);}},[]);
 const refresh=useCallback(async()=>{if(!live.current||!focus.current||!foreground.current||!owner.current)return;const actor=owner.current,e=++epoch.current;
  const current=()=>live.current&&focus.current&&foreground.current&&owner.current===actor&&epoch.current===e;setBusy(true);setError(false);
  try{const p=await service.pending(actor);const value=await service.read(actor);if(current()){snapshot.current=value;setState(value);setPending(p);}}catch{if(current()){snapshot.current=null;setState(null);setError(true);}}finally{if(current())setBusy(false);}
 },[service]);
 useEffect(()=>{live.current=true;const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{if(s?.user.id!==owner.current)invalidate();});const unsub=subscribeGoalChanged(id=>{if(!id||id===owner.current){invalidate();void refresh();}});const app=AppState.addEventListener('change',s=>{foreground.current=s==='active';invalidate();if(foreground.current)void refresh();});return()=>{live.current=false;++epoch.current;snapshot.current=null;subscription.unsubscribe();unsub();app.remove();};},[invalidate,refresh]);
 useFocusEffect(useCallback(()=>{focus.current=true;invalidate();void refresh();return()=>{focus.current=false;invalidate();};},[expectedOwner,invalidate,refresh]));
 const submit=useCallback(async(base:MacroState,selected:MacroMode,split:MacroSplit|null,retry?:MacroRequest)=>{
  const actor=owner.current;if(!actor||!live.current||!focus.current||!foreground.current||flights.has(actor)||snapshot.current!==base)throw Error('macro_choice_changed');
  if(!retry&&(Date.now()-Date.parse(base.capturedAt)>300000))throw Error('macro_choice_changed');
  const request=retry??makeMacroRequest(base,service.newId(),selected,split);flights.add(actor);setBusy(true);setError(false);const e=epoch.current;let failed=false;
  try{await service.submit(actor,request,!!retry);}catch(error){failed=true;if(live.current&&owner.current===actor&&epoch.current===e)setError(true);throw error;}finally{flights.delete(actor);if(live.current&&owner.current===actor){snapshot.current=null;setState(null);await refresh();if(failed&&live.current&&owner.current===actor)setError(true);}}
 },[service,refresh]);
 return{state:state?.ownerId===expectedOwner?state:null,pending,busy,error,refresh,submit};
}
