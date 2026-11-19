import {TdeeTargetComparison} from './TdeeTargetComparison';
import {rules14DashboardActionAllowed} from '@/utils/rules14DashboardPolicy';
import {rules14HoldCopy,type Rules14Hold} from '@/utils/rules14Hold';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Modal,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {useFocusEffect} from 'expo-router';import {useTranslation} from 'react-i18next';
import {supabase} from '@/lib/supabase/client';import {colors} from '@/styles/commonStyles';
import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {createRules14ProposalController,RULES14_REVIEW_UI_RELEASE,type Rules14Preview} from '@/utils/rules14ProposalController';
import {makeRules14ProposalServices} from '@/utils/rules14ProposalServices';
type Props={ownerId?:string;isDark:boolean;blocked:boolean;attention:boolean;premium:boolean;automaticRecovery?:boolean;setup?:boolean;onCheckAvailability?:()=>Promise<void>;refreshVerifiedGoal:()=>Promise<{profile:{id:string};goal:{user_id:string}}>};
type Controller=ReturnType<typeof createRules14ProposalController>;type Preview=Rules14Preview;
/** Separate rate contract. OFF before mounting hooks, auth, storage, transport or controls. */
export function TdeeRules14ReviewEntry(props:Props){return RULES14_REVIEW_UI_RELEASE.enabled?<EnabledRules14Review {...props}/>:null;}
function EnabledRules14Review({ownerId,isDark,blocked,attention,premium,automaticRecovery=false,onCheckAvailability,refreshVerifiedGoal}:Props){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),label=(en:string,sp:string)=>es?sp:en;
 const [hold,setHold]=useState<Rules14Hold|null>(null),[renderOwner,setRenderOwner]=useState(ownerId);
 const [preview,setPreview]=useState<Preview|null>(null),[pending,setPending]=useState(false),[busy,setBusy]=useState(false),[visible,setVisible]=useState(false),[message,setMessage]=useState<'none'|'recovery_failed'|'unavailable'|'unresolved'|'rejected'|'committed'|'refresh_failed'|'review_changed'>('none'),[now,setNow]=useState(Date.now());
 const state=useRef({ownerId,blocked,mounted:false,focused:false,foreground:AppState.currentState==='active'}),controller=useRef<Controller|null>(null),generation=useRef(0),flight=useRef<object|null>(null),refresh=useRef(refreshVerifiedGoal);
 state.current.ownerId=ownerId;state.current.blocked=blocked;refresh.current=refreshVerifiedGoal;
 const recoveryRef=useRef<()=>void>(()=>{});
 const close=useCallback(()=>{generation.current++;controller.current?.close();setHold(null);setPreview(null);setVisible(false);},[]);
 useFocusEffect(useCallback(()=>{state.current.focused=true;Promise.resolve().then(()=>recoveryRef.current());return()=>{state.current.focused=false;close();};},[close]));
 useEffect(()=>{state.current.mounted=true;setRenderOwner(ownerId);close();setPending(false);setBusy(false);setMessage('none');flight.current=null;const actor=ownerId;
  const current=()=>!!actor&&state.current.mounted&&state.current.focused&&state.current.foreground&&state.current.ownerId===actor;
  controller.current=actor?createRules14ProposalController(makeRules14ProposalServices(actor,current,()=>refresh.current())):null;
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user.id!==actor){state.current.focused=false;close();}});
  const app=AppState.addEventListener('change',value=>{state.current.foreground=value==='active';if(value!=='active')close();else Promise.resolve().then(()=>recoveryRef.current());});
  Promise.resolve().then(()=>recoveryRef.current());
  const unsubscribe=subscribeGoalChanged(id=>{if(!id||id===actor)close();});
  return()=>{state.current.mounted=false;close();data.subscription.unsubscribe();app.remove();unsubscribe();};
 },[ownerId,close]);
 useEffect(()=>{if(blocked)close();},[blocked,close]);
 useEffect(()=>{if(!visible)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[visible]);
 const run=async(action:'review'|'accept'|'check'|'retry')=>{
  const c=controller.current,actor=ownerId;if(!c||!actor||busy||flight.current||blocked||!state.current.focused||!state.current.foreground)return;
  // Entitlement changes never authorize a new offer, acceptance or retry. Read-only status remains available.
  if(!rules14DashboardActionAllowed(action,attention,premium))return;
  const token={},rev=++generation.current;flight.current=token;setBusy(true);setMessage('none');setHold(null);
  const owns=()=>state.current.mounted&&controller.current===c&&state.current.ownerId===actor&&flight.current===token;
  const shown=()=>owns()&&generation.current===rev&&state.current.focused&&state.current.foreground;
  try{
   if(action==='review'){
    const recovery=await c.recover();if(!shown())return;
    if(recovery==='pending'){setPending(true);setPreview(c.pendingPreview());setVisible(true);setMessage('unresolved');return;}
    const next=await c.review();if(shown()){setPending(false);if('kind' in next){setHold(next);setPreview(null);setVisible(false);}else{setPreview(next);setNow(Date.now());setVisible(true);}}return;
   }
   const result=action==='accept'?await c.accept():action==='check'?await c.check():await c.retry();
   if(result.status==='hold'){if(shown()){setHold(result.hold);setPreview(null);setVisible(false);setPending(false);}return;}
   if(result.status==='review_changed'){if(shown()){setPending(false);setPreview(result.preview);setNow(Date.now());setVisible(true);setMessage('review_changed');}return;}
   if(shown()||(owns()&&state.current.focused&&state.current.foreground&&(result.status==='committed'||result.status==='rejected'))){setPending(c.hasPending());setMessage(result.status==='committed'?(result.refreshFailed?'refresh_failed':'committed'):result.status==='rejected'?'rejected':'unresolved');if(result.status==='unresolved'){setPreview(c.pendingPreview());setVisible(true);}else{setPreview(null);setVisible(false);}}
  }catch{if(shown()){setPending(c.hasPending());setMessage(c.hasPending()?'unresolved':'unavailable');if(c.hasPending()){setPreview(c.pendingPreview());setVisible(true);}}}
  finally{if(owns()){flight.current=null;setBusy(false);setPending(c.hasPending());}}
 };
 // Recovery restores only the exact saved local request. It never sends an offer or mutation.
 recoveryRef.current=()=>{
  const c=controller.current,actor=ownerId;
  if(!automaticRecovery||!c||!actor||flight.current||blocked||!state.current.mounted||!state.current.focused||!state.current.foreground)return;
  const token={},rev=++generation.current;flight.current=token;setBusy(true);
  const current=()=>state.current.mounted&&controller.current===c&&state.current.ownerId===actor&&flight.current===token&&generation.current===rev&&state.current.focused&&state.current.foreground;
  void c.recover().then(result=>{if(current()){setPending(result==='pending');if(result==='pending'){setPreview(c.pendingPreview());setMessage('unresolved');}}}).catch(()=>{if(current())setMessage('recovery_failed');}).finally(()=>{if(state.current.mounted&&controller.current===c&&flight.current===token){flight.current=null;setBusy(false);if(generation.current!==rev&&state.current.focused&&state.current.foreground)Promise.resolve().then(()=>recoveryRef.current());}});
 };
 useEffect(()=>{if(!blocked)Promise.resolve().then(()=>recoveryRef.current());},[blocked,automaticRecovery,ownerId]);
 const holdCopy=hold?rules14HoldCopy(hold.holdReason,es?'es':'en'):null;
 const text=isDark?colors.textDark:colors.text,bg=isDark?colors.cardDark:colors.card;
 const button=(title:string,onPress:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={{padding:12,borderWidth:1,borderColor:colors.primary,borderRadius:10,opacity:disabled?.5:1}}><Text style={{color:colors.primary}}>{title}</Text></TouchableOpacity>;
 const messages={none:'',recovery_failed:label('A saved request could not be verified. Check it again before starting another change.','No se pudo verificar una solicitud guardada. Consúltala otra vez antes de iniciar otro cambio.'),unavailable:label('A verified 14-day proposal is not available. No targets were assumed changed.','No hay una propuesta verificada de 14 días disponible. No se da por cambiada ninguna meta.'),unresolved:label('The previous result is unconfirmed. Checking reads only. Retrying sends the same saved request, never a new one. Closing does not cancel a request already sent.','El resultado anterior no está confirmado. Consultar solo lee. Reintentar envía la misma solicitud guardada, nunca una nueva. Cerrar no cancela una solicitud ya enviada.'),rejected:label('This request did not change your targets.','Esta solicitud no cambió tus metas.'),committed:label('The saved targets and current plan were verified.','Las metas guardadas y el plan actual se verificaron.'),review_changed:label('The refreshed proposal changed. Review these new targets and confirm again.','La propuesta actualizada cambió. Revisa estas nuevas metas y confirma de nuevo.'),refresh_failed:label('The change was verified, but the visible plan could not be refreshed. Reload your current targets.','El cambio se verificó, pero no se pudo actualizar el plan visible. Vuelve a cargar tus metas actuales.')};
 if(renderOwner!==ownerId)return null;
 if(!attention&&!pending&&!hold&&message==='none')return null;
 return <View style={{gap:10,paddingVertical:10}}>
  {attention&&premium&&button(label('Review my 14-day targets','Revisar mis metas de 14 días'),()=>{void run('review');},busy||blocked||!ownerId)}
  {holdCopy&&<View accessibilityLiveRegion="polite" style={{gap:6}}><Text style={{color:text,fontWeight:'600'}}>{holdCopy.title}</Text><Text style={{color:text}}>{holdCopy.message}</Text><Text style={{color:text}}>{holdCopy.next}</Text><Text style={{color:text}}>{holdCopy.caution}</Text></View>}
  {message!=='none'&&<Text accessibilityRole="alert" style={{color:text}}>{messages[message]}</Text>}
  {!attention&&!pending&&(hold||message==='unavailable')&&onCheckAvailability&&button(label('Check availability again','Comprobar disponibilidad otra vez'),()=>{void onCheckAvailability();},busy||blocked)}
  {!pending&&(hold||message!=='none')&&button(label('Dismiss message','Cerrar mensaje'),()=>{close();setMessage('none');},busy)}
  {message==='recovery_failed'&&button(label('Check saved request','Consultar solicitud guardada'),()=>recoveryRef.current(),busy||blocked)}
  {pending&&!premium&&<Text style={{color:text}}>{label('A previous request still needs verification. You can check its status; Premium access is required before retrying an adjustment.','Una solicitud anterior aún necesita verificarse. Puedes consultar su estado; se requiere Premium antes de reintentar un ajuste.')}</Text>}
  {pending&&!visible&&button(label('Check previous request','Consultar solicitud anterior'),()=>{void run('check');},busy||blocked)}
  <Modal transparent visible={visible&&!!preview} onRequestClose={close} animationType="fade"><View style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'rgba(0,0,0,.45)'}}><ScrollView accessibilityViewIsModal style={{backgroundColor:bg,borderRadius:16,padding:20,maxHeight:'85%'}} contentContainerStyle={{gap:12}}>
   <Text style={{color:text,fontSize:20}}>{premium?label('Review your daily targets','Revisa tus metas diarias'):label('Previous request status','Estado de la solicitud anterior')}</Text>
   {premium&&<Text style={{color:text}}>{label('Current → New','Actuales → Nuevas')}</Text>}
   {premium&&preview&&<TdeeTargetComparison current={preview.current} target={preview.target} text={text} es={es}/>}
   {premium&&preview&&<Text style={{color:text}}>{preview.allocationMode==='manual-percent-nearest-gram-v1'?label('Macro allocation: your manual split','Distribución de macros: tu proporción manual'):label('Macro allocation: Smart','Distribución de macros: Smart')}</Text>}
   {message!=='none'&&<Text accessibilityRole="alert" style={{color:text}}>{messages[message]}</Text>}
   {premium&&<Text style={{color:text}}>{label('Estimate based on your 14-day logs; it is not a direct measurement of your energy expenditure.','Estimación basada en tus registros de 14 días; no es una medición directa de tu gasto energético.')}</Text>}
   <Text style={{color:text}}>{label('Only the pending request reference and displayed targets are saved on this device for recovery, not medical details.','Solo se guardan en este dispositivo la referencia pendiente y las metas mostradas para recuperar el resultado, no detalles médicos.')}</Text>
   <Text style={{color:text}}>{label('Targets change only after explicit acceptance and server verification.','Las metas cambian solo después de tu aceptación explícita y verificación del servidor.')}</Text>
   {premium&&preview&&preview.expiresAt<=now&&<Text style={{color:text}}>{label('This offer expired. Accept refreshes it using current data. Changed targets or policy require a new confirmation. A saved pending request is only checked or retried unchanged.','Esta propuesta venció. Aceptar la actualiza con datos actuales. Si cambian las metas o la política, debes confirmar de nuevo. Una solicitud pendiente guardada solo se consulta o reintenta sin cambios.')}</Text>}
   {pending?<>{button(label('Check status','Consultar estado'),()=>{void run('check');},busy||blocked)}{premium&&button(label('Retry this same saved request','Reintentar esta misma solicitud guardada'),()=>{void run('retry');},busy||blocked)}</>:premium&&button(label('Accept these targets','Aceptar estas metas'),()=>{void run('accept');},busy||blocked||!preview)}
   {busy&&<Text style={{color:text}}>{label('Closing does not cancel acceptance already requested.','Cerrar no cancela una aceptación ya solicitada.')}</Text>}
   {button(pending||busy?label('Close','Cerrar'):label('Keep current targets','Conservar metas actuales'),close)}
  </ScrollView></View></Modal>
 </View>;
}



