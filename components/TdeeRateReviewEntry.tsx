import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Modal,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {useFocusEffect} from 'expo-router';import {useTranslation} from 'react-i18next';
import {supabase} from '@/lib/supabase/client';import {colors} from '@/styles/commonStyles';
import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {createRateProposalController,RATE_REVIEW_UI_RELEASE,type RatePreview} from '@/utils/rateProposalController';
import {makeRateProposalServices} from '@/utils/rateProposalServices';
type Props={ownerId?:string;isDark:boolean;blocked:boolean;refreshVerifiedGoal:()=>Promise<{profile:{id:string};goal:{user_id:string}}>};
type Controller=ReturnType<typeof createRateProposalController>;type Preview=Pick<RatePreview,'current'|'target'|'expiresAt'>;
/** Separate rate contract. OFF before mounting hooks, auth, storage, transport or controls. */
export function TdeeRateReviewEntry(props:Props){return RATE_REVIEW_UI_RELEASE.enabled?<EnabledRateReview {...props}/>:null;}
function EnabledRateReview({ownerId,isDark,blocked,refreshVerifiedGoal}:Props){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),label=(en:string,sp:string)=>es?sp:en;
 const [preview,setPreview]=useState<Preview|null>(null),[pending,setPending]=useState(false),[busy,setBusy]=useState(false),[visible,setVisible]=useState(false),[message,setMessage]=useState<'none'|'unavailable'|'unresolved'|'rejected'|'committed'|'refresh_failed'>('none'),[now,setNow]=useState(Date.now());
 const state=useRef({ownerId,blocked,mounted:false,focused:false,foreground:AppState.currentState==='active'}),controller=useRef<Controller|null>(null),generation=useRef(0),flight=useRef<object|null>(null),refresh=useRef(refreshVerifiedGoal);
 state.current.ownerId=ownerId;state.current.blocked=blocked;refresh.current=refreshVerifiedGoal;
 const close=useCallback(()=>{generation.current++;controller.current?.close();setPreview(null);setVisible(false);},[]);
 useFocusEffect(useCallback(()=>{state.current.focused=true;return()=>{state.current.focused=false;close();};},[close]));
 useEffect(()=>{state.current.mounted=true;close();setPending(false);setBusy(false);setMessage('none');flight.current=null;const actor=ownerId;
  const current=()=>!!actor&&state.current.mounted&&state.current.focused&&state.current.foreground&&state.current.ownerId===actor;
  controller.current=actor?createRateProposalController(makeRateProposalServices(actor,current,()=>refresh.current())):null;
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user.id!==actor){state.current.focused=false;close();}});
  const app=AppState.addEventListener('change',value=>{state.current.foreground=value==='active';if(value!=='active')close();});
  const unsubscribe=subscribeGoalChanged(id=>{if(!id||id===actor)close();});
  return()=>{state.current.mounted=false;close();data.subscription.unsubscribe();app.remove();unsubscribe();};
 },[ownerId,close]);
 useEffect(()=>{if(blocked)close();},[blocked,close]);
 useEffect(()=>{if(!visible)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[visible]);
 const run=async(action:'review'|'accept'|'check'|'retry')=>{
  const c=controller.current,actor=ownerId;if(!c||!actor||busy||flight.current||blocked||!state.current.focused||!state.current.foreground)return;
  const token={},rev=++generation.current;flight.current=token;setBusy(true);setMessage('none');
  const owns=()=>state.current.mounted&&controller.current===c&&state.current.ownerId===actor&&flight.current===token;
  const shown=()=>owns()&&generation.current===rev&&state.current.focused&&state.current.foreground;
  try{
   if(action==='review'){
    const recovery=await c.recover();if(!shown())return;
    if(recovery.status==='unresolved'){setPending(true);setPreview(c.pendingPreview());setVisible(true);setMessage('unresolved');return;}
    const next=await c.review();if(shown()){setPending(false);setPreview(next);setNow(Date.now());setVisible(true);}return;
   }
   const result=action==='accept'?await c.accept():action==='check'?await c.check():await c.retry();
   if(shown()||(owns()&&state.current.focused&&state.current.foreground&&(result.status==='committed'||result.status==='rejected'))){setPending(c.hasPending());setMessage(result.status==='committed'?(result.refreshFailed?'refresh_failed':'committed'):result.status==='rejected'?'rejected':'unresolved');if(result.status==='unresolved'){setPreview(c.pendingPreview());setVisible(true);}else{setPreview(null);setVisible(false);}}
  }catch{if(shown()){setPending(c.hasPending());setMessage(c.hasPending()?'unresolved':'unavailable');if(c.hasPending()){setPreview(c.pendingPreview());setVisible(true);}}}
  finally{if(owns()){flight.current=null;setBusy(false);setPending(c.hasPending());}}
 };
 const text=isDark?colors.textDark:colors.text,bg=isDark?colors.cardDark:colors.card;
 const button=(title:string,onPress:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={{padding:12,borderWidth:1,borderColor:colors.primary,borderRadius:10,opacity:disabled?.5:1}}><Text style={{color:colors.primary}}>{title}</Text></TouchableOpacity>;
 const messages={none:'',unavailable:label('A verified 14-day proposal is not available. No targets were assumed changed.','No hay una propuesta verificada de 14 días disponible. No se da por cambiada ninguna meta.'),unresolved:label('The previous result is unconfirmed. Checking reads only. Retrying sends the same saved request, never a new one. Closing does not cancel a request already sent.','El resultado anterior no está confirmado. Consultar solo lee. Reintentar envía la misma solicitud guardada, nunca una nueva. Cerrar no cancela una solicitud ya enviada.'),rejected:label('This request did not change your targets.','Esta solicitud no cambió tus metas.'),committed:label('The saved targets and current plan were verified.','Las metas guardadas y el plan actual se verificaron.'),refresh_failed:label('The change was verified, but the visible plan could not be refreshed. Reload your current targets.','El cambio se verificó, pero no se pudo actualizar el plan visible. Vuelve a cargar tus metas actuales.')};
 return <View style={{gap:10,paddingVertical:10}}>
  {button(label('Review my 14-day targets','Revisar mis metas de 14 días'),()=>{void run('review');},busy||blocked||!ownerId)}
  {message!=='none'&&<Text accessibilityRole="alert" style={{color:text}}>{messages[message]}</Text>}
  {pending&&!visible&&button(label('Check previous request','Consultar solicitud anterior'),()=>{void run('check');},busy||blocked)}
  <Modal transparent visible={visible&&!!preview} onRequestClose={close} animationType="fade"><View style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'rgba(0,0,0,.45)'}}><ScrollView accessibilityViewIsModal style={{backgroundColor:bg,borderRadius:16,padding:20,maxHeight:'85%'}} contentContainerStyle={{gap:12}}>
   <Text style={{color:text,fontSize:20}}>{label('Review your daily targets','Revisa tus metas diarias')}</Text>
   <Text style={{color:text}}>{label('Current → New','Actuales → Nuevas')}</Text>
   {preview&&(['calories','proteinG','carbsG','fatsG','fiberG'] as const).map((key,index)=><Text key={key} style={{color:text}}>{[label('Calories','Calorías'),label('Protein','Proteína'),label('Carbs','Carbohidratos'),label('Fat','Grasa'),label('Fiber','Fibra')][index]}: {preview.current[key]} → {preview.target[key]} {index===0?'kcal':'g'}</Text>)}
   <Text style={{color:text}}>{label('Targets change only after explicit acceptance and server verification.','Las metas cambian solo después de tu aceptación explícita y verificación del servidor.')}</Text>
   {preview&&preview.expiresAt<=now&&<Text style={{color:text}}>{label('This offer expired. A saved request can only be checked or retried unchanged; the server will reject it if it was not accepted in time.','Esta propuesta venció. Una solicitud guardada solo se puede consultar o reintentar sin cambios; el servidor la rechazará si no se aceptó a tiempo.')}</Text>}
   {pending?<>{button(label('Check status','Consultar estado'),()=>{void run('check');},busy||blocked)}{button(label('Retry this same saved request','Reintentar esta misma solicitud guardada'),()=>{void run('retry');},busy||blocked)}</>:button(label('Accept these targets','Aceptar estas metas'),()=>{void run('accept');},busy||blocked||!preview||preview.expiresAt<=now)}
   {busy&&<Text style={{color:text}}>{label('Closing does not cancel acceptance already requested.','Cerrar no cancela una aceptación ya solicitada.')}</Text>}
   {button(pending||busy?label('Close','Cerrar'):label('Keep current targets','Conservar metas actuales'),close)}
  </ScrollView></View></Modal>
 </View>;
}
