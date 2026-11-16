import React,{useCallback,useEffect,useRef,useState} from 'react';import {AppState,Modal,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {useFocusEffect} from 'expo-router';import {useTranslation} from 'react-i18next';import {supabase} from '@/lib/supabase/client';import {colors} from '@/styles/commonStyles';import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {createRulesScreeningController,RULES_SCREENING_UI_RELEASE,type ScreeningResponse} from '@/utils/rulesScreeningController';import {makeRulesScreeningPorts} from '@/utils/rulesScreeningServices';
type Props={ownerId?:string;blocked:boolean;isDark:boolean};type Controller=ReturnType<typeof createRulesScreeningController>;
/** New versioned consent only. Old observation readiness is never reinterpreted. */
export function TdeeRulesScreeningEntry(props:Props){return RULES_SCREENING_UI_RELEASE.enabled?<EnabledScreening {...props}/>:null;}
function EnabledScreening({ownerId,blocked,isDark}:Props){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),label=(en:string,sp:string)=>es?sp:en;
 const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[choice,setChoice]=useState<ScreeningResponse|null>(null),[message,setMessage]=useState<'none'|'recorded'|'unresolved'|'unavailable'>('none');
 const current=useRef({ownerId,mounted:false,focused:false,foreground:AppState.currentState==='active'}),controller=useRef<Controller|null>(null),flight=useRef<object|null>(null),epoch=useRef(0);current.current.ownerId=ownerId;
 const close=useCallback(()=>{epoch.current++;controller.current?.close();setVisible(false);setChoice(null);},[]);
 useFocusEffect(useCallback(()=>{current.current.focused=true;return()=>{current.current.focused=false;close();};},[close]));
 useEffect(()=>{current.current.mounted=true;close();setPending(false);setBusy(false);setMessage('none');flight.current=null;const owner=ownerId;
  const valid=()=>!!owner&&current.current.mounted&&current.current.focused&&current.current.foreground&&current.current.ownerId===owner;
  controller.current=owner?createRulesScreeningController(makeRulesScreeningPorts(owner,valid)):null;
  const {data}=supabase.auth.onAuthStateChange((_e,s)=>{if(s?.user.id!==owner){current.current.focused=false;close();}});
  const app=AppState.addEventListener('change',state=>{current.current.foreground=state==='active';if(state!=='active')close();});
  const unsubscribe=subscribeGoalChanged(actor=>{if(!actor||actor===owner)close();});
  return()=>{current.current.mounted=false;close();data.subscription.unsubscribe();app.remove();unsubscribe();};
 },[ownerId,close]);
 useEffect(()=>{if(blocked)close();},[blocked,close]);
 const run=async(action:'read'|'confirm'|'check'|'retry')=>{
  const c=controller.current,owner=ownerId;if(!c||!owner||busy||flight.current||blocked||!current.current.focused||!current.current.foreground)return;
  const rev=++epoch.current,token={};flight.current=token;setBusy(true);setMessage('none');const owns=()=>current.current.mounted&&current.current.ownerId===owner&&controller.current===c&&flight.current===token;const shown=()=>owns()&&epoch.current===rev&&current.current.focused&&current.current.foreground;
  try{if(action==='read'){const recovered=await c.recover();if(!shown())return;if(recovered==='pending'){setPending(true);setMessage('unresolved');return;}await c.read();if(shown()){setChoice(null);setVisible(true);}return;}
   const result=action==='confirm'&&choice?await c.confirm(choice):action==='retry'?await c.retry():await c.check();
   if(shown()){setMessage(result.status==='recorded'?'recorded':'unresolved');if(result.status==='recorded'){setVisible(false);setChoice(null);}}
  }catch{if(shown())setMessage(c.hasPending()?'unresolved':'unavailable');}finally{if(owns()){flight.current=null;setBusy(false);setPending(c.hasPending());}}
 };
 const text=isDark?colors.textDark:colors.text,bg=isDark?colors.cardDark:colors.card;
 const button=(title:string,onPress:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={{padding:12,borderWidth:1,borderColor:colors.primary,borderRadius:10,opacity:disabled?.5:1}}><Text style={{color:colors.primary}}>{title}</Text></TouchableOpacity>;
 const responseLabel=(response:ScreeningResponse)=>response==='eligible'?label('All statements apply to me','Todas las afirmaciones se aplican a mí'):response==='restricted'?label('No, at least one does not apply','No, al menos una no se aplica'):response==='unsure'?label('I am not sure','No estoy seguro/a'):label('Withdraw my previous confirmation','Retirar mi confirmación anterior');
 return <View style={{gap:10,paddingVertical:12}}>
  {button(label('Review adjustment eligibility','Revisar elegibilidad para ajustes'),()=>{void run('read');},busy||blocked||!ownerId)}
  {message!=='none'&&<Text accessibilityRole="alert" style={{color:text}}>{message==='recorded'?label('Your response was recorded. This is not medical approval and does not change targets.','Se registró tu respuesta. Esto no es una aprobación médica ni cambia tus metas.'):message==='unresolved'?label('The save is unconfirmed. Check it or explicitly retry the same response; no new response will be sent automatically.','No se ha confirmado el guardado. Consúltalo o reintenta explícitamente la misma respuesta; no se enviará otra automáticamente.'):label('The current screening could not be verified.','No se pudo verificar la evaluación actual.')}</Text>}
  {pending&&<><Text style={{color:text}}>{label('Pending answer','Respuesta pendiente')}: {controller.current?.pendingResponse()?responseLabel(controller.current.pendingResponse()!):''}</Text>{button(label('Check saved response','Consultar respuesta guardada'),()=>{void run('check');},busy||blocked)}{button(label('Retry this same response','Reintentar esta misma respuesta'),()=>{void run('retry');},busy||blocked)}</>}
  <Modal transparent visible={visible} onRequestClose={close}><View style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'rgba(0,0,0,.45)'}}><ScrollView accessibilityViewIsModal style={{backgroundColor:bg,padding:20,borderRadius:16,maxHeight:'90%'}} contentContainerStyle={{gap:12}}>
   {message==='unresolved'&&<Text accessibilityRole="alert" style={{color:text}}>{label('This save is not confirmed. Close to check or retry the same pending response.','Este guardado no está confirmado. Cierra para consultar o reintentar la misma respuesta pendiente.')}</Text>}
   <Text style={{fontSize:20,color:text}}>{label('Before automatic adjustment proposals','Antes de las propuestas automáticas de ajuste')}</Text>
   <Text style={{color:text}}>{label('Please answer all statements. No option is selected for you.','Responde considerando todas las afirmaciones. No hay una opción preseleccionada.')}</Text>
   {[label('I am 19 or older.','Tengo 19 años o más.'),label('I am not pregnant or breastfeeding.','No estoy embarazada ni en período de lactancia.'),label('I do not have a kidney condition or an eating disorder.','No tengo una enfermedad renal ni un trastorno de la conducta alimentaria.'),label('I do not have a medically prescribed dietary restriction that requires professional guidance for these adjustments.','No tengo una restricción alimentaria indicada médicamente que requiera orientación profesional para estos ajustes.')].map(line=><Text key={line} style={{color:text}}>• {line}</Text>)}
   <Text style={{color:text}}>{label('If any statement does not apply, or you are unsure, adjustment proposals remain blocked. No diagnosis or details are requested.','Si alguna afirmación no se aplica o tienes dudas, las propuestas de ajuste siguen bloqueadas. No se solicitan diagnósticos ni detalles.')}</Text>
   {(['eligible','restricted','unsure','revoked'] as const).map(response=><TouchableOpacity key={response} accessibilityRole="radio" accessibilityState={{checked:choice===response,disabled:busy||pending}} disabled={busy||pending} onPress={()=>setChoice(response)} style={{padding:12,borderWidth:choice===response?2:1,borderColor:colors.primary,borderRadius:10}}><Text style={{color:text}}>{responseLabel(response)}</Text></TouchableOpacity>)}
   <Text style={{color:text}}>{label('Saving stores only this general response and its request reference on your device and account, not medical details. It does not accept a calorie change.','Guardar conserva únicamente esta respuesta general y la referencia de su solicitud en tu dispositivo y cuenta, no detalles médicos. No acepta un cambio de calorías.')}</Text>
   {button(label('Save my selected response','Guardar mi respuesta seleccionada'),()=>{void run('confirm');},busy||blocked||pending||choice===null)}
   {busy&&<Text style={{color:text}}>{label('Closing does not cancel a save already requested.','Cerrar no cancela un guardado ya solicitado.')}</Text>}
   {button(label('Cancel / close without a new response','Cancelar / cerrar sin una nueva respuesta'),close)}
  </ScrollView></View></Modal>
 </View>;
}
