import React,{useEffect,useRef,useState} from 'react';
import {AppState,Platform,Text,TouchableOpacity,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useTranslation} from 'react-i18next';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';
import {useColorScheme} from '@/hooks/useColorScheme';
import {colors} from '@/styles/commonStyles';
import {TdeeSessionSimulation} from '@/components/TdeeSessionSimulation';
import {parseSimulationEnvelope,type SimulationEnvelope} from '@/utils/tdeeSessionSimulation';
import {simulationSessionId} from '@/utils/tdeeSimulationSession';
/** Isolated route: never mounts real Dashboard/Foods, goal hooks or acceptance services. */
export default function TdeeSimulationRoute(){
 const router=useRouter(),{i18n}=useTranslation(),isDark=useColorScheme()==='dark',es=i18n.language.startsWith('es');
 const [envelope,setEnvelope]=useState<SimulationEnvelope|null>(null),[status,setStatus]=useState<'loading'|'denied'|'closed'>('loading');
 const identity=useRef<{ownerId:string;sessionId:string}|null>(null),generation=useRef(0);
 const exit=()=>{++generation.current;identity.current=null;setEnvelope(null);setStatus('closed');};
 useEffect(()=>{
  const revision=++generation.current,abort=new AbortController();let alive=true;
  const clear=()=>{++generation.current;identity.current=null;abort.abort();setEnvelope(null);setStatus('denied');};
  const current=()=>alive&&generation.current===revision&&AppState.currentState==='active';
  const {data:subscription}=supabase.auth.onAuthStateChange((_event,session)=>{const expected=identity.current;if(expected&&(!session||session.user.id!==expected.ownerId||simulationSessionId(session.access_token)!==expected.sessionId))clear();});
  const app=AppState.addEventListener('change',s=>{if(s!=='active')clear();});
  const hidden=()=>{if(typeof document!=='undefined'&&document.visibilityState==='hidden')clear();};
  if(Platform.OS==='web')globalThis.addEventListener('visibilitychange',hidden);
  void(async()=>{try{
   if(Platform.OS!=='web')throw Error('web_only');
   const {data,error}=await supabase.auth.getSession();if(error||!data.session||!current())throw Error('unavailable');
   const session=data.session,sessionId=simulationSessionId(session.access_token);if(!sessionId)throw Error('unavailable');
   identity.current={ownerId:session.user.id,sessionId};
   const verified=await supabase.auth.getUser(session.access_token);if(verified.error||verified.data.user?.id!==session.user.id||!current())throw Error('unavailable');
   const response=await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/tdee-session-simulation`,{method:'GET',headers:{Authorization:`Bearer ${session.access_token}`,apikey:supabasePublicKey},cache:'no-store',signal:abort.signal});
   if(!response.ok)throw Error('unavailable');const raw=await response.json();if(!current())return;
   const latest=await supabase.auth.getSession();if(!current()||latest.error||latest.data.session?.user.id!==session.user.id||simulationSessionId(latest.data.session.access_token)!==sessionId)throw Error('unavailable');
   setEnvelope(parseSimulationEnvelope(raw,session.user.id,sessionId,Date.now()));
  }catch{if(current()){identity.current=null;setEnvelope(null);setStatus('denied');}}})();
  return()=>{alive=false;++generation.current;identity.current=null;abort.abort();subscription.subscription.unsubscribe();app.remove();if(Platform.OS==='web')globalThis.removeEventListener('visibilitychange',hidden);};
 },[]);
 const text=isDark?colors.textDark:colors.text;
 return <View style={{flex:1,padding:24,justifyContent:'center',gap:16,backgroundColor:isDark?colors.backgroundDark:colors.background}}>
  <Text accessibilityRole="header" style={{color:text,fontSize:22,fontWeight:'700'}}>{es?'SIMULACIÓN · Datos ficticios':'SIMULATION · Fictional data'}</Text>
  {!envelope&&<Text style={{color:text}}>{status==='loading'?(es?'Verificando acceso temporal…':'Verifying temporary access…'):(es?'Esta simulación no está disponible para esta sesión. Tus datos reales no cambiaron.':'This simulation is unavailable for this session. Your real data is unchanged.')}</Text>}
  <TouchableOpacity accessibilityRole="button" onPress={()=>router.replace('/(tabs)/dashboard')} style={{padding:12}}><Text style={{color:colors.primary}}>{es?'Abrir la aplicación real':'Open the real app'}</Text></TouchableOpacity>
  {envelope&&identity.current&&<TdeeSessionSimulation envelope={envelope} ownerId={identity.current.ownerId} sessionId={identity.current.sessionId} isDark={isDark} language={i18n.language} onExit={exit}/>}
 </View>;
}
