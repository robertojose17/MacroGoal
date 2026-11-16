import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Text,TouchableOpacity,View} from 'react-native';
import {useFocusEffect} from 'expo-router';import {useTranslation} from 'react-i18next';
import {supabase} from '@/lib/supabase/client';import {colors} from '@/styles/commonStyles';import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {createDiagnosticFollowupController,OPTION2_FOLLOWUP_RELEASE,type FollowupView} from '@/release-candidates/tdee-adaptive-review/diagnosticFollowupController';
import {createOwnDiagnosticLoader,DIAGNOSTIC_OWN_READ_RELEASE,type SignedInReadClient} from '@/release-candidates/tdee-adaptive-review/diagnosticOwnAccountAdapter';
import {followupContext,followupCompletionOwns,type FollowupAcceptedSnapshot} from '@/utils/tdeeFollowupContext';
export const TDEE_FOLLOWUP_UI_RELEASE=Object.freeze({enabled:false} as const);
type Props={snapshot:FollowupAcceptedSnapshot|null;blocked:boolean;isDark:boolean};
/** Read-only separate mount. Every production gate is OFF before hooks/auth/RPC. */
export function TdeeDiagnosticFollowupEntry(props:Props){
 return TDEE_FOLLOWUP_UI_RELEASE.enabled&&OPTION2_FOLLOWUP_RELEASE.enabled&&DIAGNOSTIC_OWN_READ_RELEASE.enabled?<EnabledFollowup {...props}/>:null;
}
function EnabledFollowup({snapshot,blocked,isDark}:Props){
 const {i18n}=useTranslation(),language=i18n.language.startsWith('es')?'es':'en',label=(en:string,es:string)=>language==='es'?es:en;
 const context=followupContext(snapshot),revision=context?.revision??null;
 const current=useRef({context,blocked,mounted:false,focused:false,foreground:AppState.currentState==='active',controller:null as ReturnType<typeof createDiagnosticFollowupController>|null});
 current.current.context=context;current.current.blocked=blocked;
 const flight=useRef(0);
 const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[view,setView]=useState<FollowupView|null>(null);
 const controller=useMemo(()=>createDiagnosticFollowupController({
  currentContext:()=>current.current.mounted&&current.current.focused&&current.current.foreground&&!current.current.blocked?current.current.context:null,
  now:Date.now,
  // Existing installed RPC is selected by the adapter and derives auth.uid() itself.
  // No service key, actor body, provider refresh, acceptance, or write port exists.
  load:createOwnDiagnosticLoader({client:supabase as unknown as SignedInReadClient,now:Date.now,previous:()=>null}),
 },language),[language,revision]);
 current.current.controller=controller;
 const invalidate=useCallback(()=>{flight.current++;controller.dispose();setView(null);setBusy(false);},[controller]);
 useFocusEffect(useCallback(()=>{current.current.focused=true;setActive(current.current.foreground);return()=>{current.current.focused=false;setActive(false);invalidate();};},[invalidate]));
 useEffect(()=>{current.current.mounted=true;setView(null);setBusy(false);
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user.id!==current.current.context?.actor){invalidate();setActive(false);}});
  const app=AppState.addEventListener('change',state=>{current.current.foreground=state==='active';setActive(current.current.focused&&state==='active');if(state!=='active')invalidate();});
  const unsubscribe=subscribeGoalChanged(owner=>{if(!owner||owner===current.current.context?.actor)invalidate();});
  return()=>{current.current.mounted=false;controller.dispose();data.subscription.unsubscribe();app.remove();unsubscribe();};
 },[controller,invalidate]);
 useEffect(()=>{if(blocked)invalidate();},[blocked,invalidate]);
 async function refresh(){
  if(!revision||busy||blocked||!active)return;const bound=controller,captured={revision,controller:bound},token=++flight.current;setBusy(true);
  const owns=()=>token===flight.current&&followupCompletionOwns({...current.current,revision:current.current.context?.revision??null},captured);
  try{const next=await bound.refresh();if(owns())setView(next);}finally{if(owns())setBusy(false);}
 }
 const text=isDark?colors.textDark:colors.text,muted=isDark?colors.textSecondaryDark:colors.textSecondary;
 let date='';if(view?.proposedReassessmentAt!==null&&view?.proposedReassessmentAt!==undefined){try{date=new Date(view.proposedReassessmentAt).toLocaleDateString(language,{timeZone:context?.scope.timezone});}catch{date='';}}
 return <View accessibilityLabel={label('Read-only 14-day follow-up','Seguimiento de 14 días, solo lectura')} style={{gap:8,paddingVertical:12}}>
  <Text style={{color:text,fontSize:17,fontWeight:'600'}}>{view?.title??label('14-day follow-up','Seguimiento de 14 días')}</Text>
  <Text style={{color:muted}}>{label('Read-only tracking. Refreshing does not change targets or accept a recommendation.','Seguimiento de solo lectura. Actualizar no cambia metas ni acepta una recomendación.')}</Text>
  <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:blocked||busy||!active||!context,busy}} disabled={blocked||busy||!active||!context} onPress={()=>{void refresh();}} style={{padding:12,borderWidth:1,borderColor:colors.primary,borderRadius:10,opacity:(blocked||busy||!active||!context)?0.5:1}}>
   <Text style={{color:colors.primary}}>{busy?label('Checking data…','Consultando datos…'):view?.refreshLabel??label('Refresh data','Actualizar datos')}</Text>
  </TouchableOpacity>
  {view&&<View accessibilityLiveRegion="polite" style={{gap:6}}><Text style={{color:text}}>{view.message}</Text>
   {!!view.trendText&&<Text style={{color:text}}>{view.trendText}</Text>}
   <Text style={{color:muted}}>{view.uncertainty}</Text><Text style={{color:muted}}>{view.caution}</Text>
   {!!date&&<Text style={{color:muted}}>{label('Proposed reassessment','Reevaluación propuesta')}: {date}</Text>}
   <Text style={{color:muted}}>{view.schedulingNote}</Text>
  </View>}
 </View>;
}
