import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Modal,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useTranslation} from 'react-i18next';
import * as Crypto from 'expo-crypto';
import {supabase,SUPABASE_PROJECT_URL} from '@/lib/supabase/client';
import {colors} from '@/styles/commonStyles';
import {createSecureLegacyConfirmationJournal} from '@/utils/secureLegacyConfirmationJournal';
import {subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {LEGACY_GOAL_CONFIRMATION_RELEASE} from '@/release-candidates/tdee-adaptive-review/legacyGoalConfirmation';
import {createLegacyConfirmationController,ownsLegacyConfirmationFlight,type ConfirmationRpc} from '@/utils/legacyGoalConfirmationController';
type Props={ownerId?:string;isDark:boolean;blocked:boolean};
type Controller=ReturnType<typeof createLegacyConfirmationController>;
type Review=Awaited<ReturnType<Controller['read']>>;
/** OFF before hooks, auth access, RPC, or controls. Never infer consent from missing receipts. */
export function LegacyGoalConfirmationEntry(props:Props){
 return LEGACY_GOAL_CONFIRMATION_RELEASE.enabled?<EnabledConfirmation {...props}/>:null;
}
function EnabledConfirmation({ownerId,isDark,blocked}:Props){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),label=(en:string,sp:string)=>es?sp:en;
 const [recovered,setRecovered]=useState(false),[unresolved,setUnresolved]=useState(false);
 const [review,setReview]=useState<Review|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState<'none'|'failed'|'confirmed'>('none');
 const current=useRef({ownerId,blocked,active:false}),controller=useRef<Controller|null>(null),mounted=useRef(false),generation=useRef(0),flight=useRef<object|null>(null),recoveryFlight=useRef<Promise<void>|null>(null);
 current.current.ownerId=ownerId;current.current.blocked=blocked;
 const close=useCallback(()=>{generation.current++;controller.current?.invalidate();setReview(null);},[]);
 useFocusEffect(useCallback(()=>{current.current.active=true;return()=>{current.current.active=false;close();};},[close]));
 useEffect(()=>{
  mounted.current=true;close();setMessage('none');setRecovered(false);setUnresolved(false);setBusy(false);flight.current=null;
  const actor=ownerId;
  const valid=()=>mounted.current&&current.current.active&&!current.current.blocked&&current.current.ownerId===actor;
  // Contract describes a SOURCE-ONLY, currently absent/OFF SQL candidate.
  // Typed local seam is not a claim that generated Database or live RPC includes it.
  const rpc:ConfirmationRpc=async(action,request)=>{
   if(!actor||!valid())throw Error('account_changed');
   const auth=await supabase.auth.getUser();
   if(auth.error||auth.data.user?.id!==actor||!valid())throw Error('account_changed');
   const transport=supabase as unknown as {rpc:(name:'tdee_legacy_goal_confirmation_v1',args:{p_action:string;p_request:unknown})=>PromiseLike<{data:unknown;error:unknown}>};
   const result=await transport.rpc('tdee_legacy_goal_confirmation_v1',{p_action:action,p_request:request});
   const after=await supabase.auth.getUser();
   if(result.error||after.error||after.data.user?.id!==actor||!valid())throw Error('confirmation_unavailable');
   return result.data;
  };
  controller.current=actor?createLegacyConfirmationController({actor,rpc,now:Date.now,requestId:Crypto.randomUUID,isCurrent:valid,journal:createSecureLegacyConfirmationJournal(new URL(SUPABASE_PROJECT_URL).hostname.split('.')[0],true)}):null;
  const {data}=supabase.auth.onAuthStateChange((_e,s)=>{if(s?.user.id!==actor){current.current.active=false;close();}});
  const unsubscribe=subscribeGoalChanged(id=>{if(!id||id===actor)close();});
  const app=AppState.addEventListener('change',()=>{current.current.active=false;close();});
  return()=>{mounted.current=false;close();data.subscription.unsubscribe();unsubscribe();app.remove();};
 },[ownerId,close]);
 useEffect(()=>{if(blocked)close();},[blocked,close]);
 // Eligibility changes retry LOCAL journal recovery only, never a context/confirmation RPC.
 useEffect(()=>{
  const bound=controller.current,actor=ownerId;
  if(!bound||!actor||blocked||recovered)return;
  let cancelled=false;
  const owns=()=>!cancelled&&mounted.current&&controller.current===bound&&current.current.ownerId===actor&&!current.current.blocked;
  const previous=recoveryFlight.current;
  const work=(async()=>{
   if(previous)await previous.catch(()=>{});
   if(!owns())return;
   await bound.recover();
   if(owns()){setRecovered(true);setUnresolved(bound.hasUnresolved());}
  })();
  recoveryFlight.current=work;
  void work.catch(()=>{if(owns())setMessage('failed');}).finally(()=>{if(recoveryFlight.current===work)recoveryFlight.current=null;});
  return()=>{cancelled=true;};
 },[ownerId,blocked,recovered]);
 useEffect(()=>{if(!review)return;const timer=setTimeout(close,30000);return()=>clearTimeout(timer);},[review,close]);
 const run=async(action:'read'|'confirm'|'receipt'|'retry')=>{
  const c=controller.current;if(!c||busy||blocked||!ownerId||!recovered)return;
  const gen=++generation.current,token={},actor=ownerId;flight.current=token;setBusy(true);setMessage('none');
  try{if(action==='read'){const v=await c.read(es?'es':'en');if(generation.current===gen)setReview(v);}
   else{const result=action==='confirm'?await c.confirm():action==='receipt'?await c.checkReceipt():await c.retry();if(generation.current===gen){setReview(null);setMessage(result.status==='confirmed'?'confirmed':'failed');}}
  }catch{if(mounted.current&&generation.current===gen){setReview(null);setMessage('failed');}}
  finally{if(mounted.current&&ownsLegacyConfirmationFlight({owner:current.current.ownerId,controller:controller.current,flight:flight.current},{owner:actor,controller:c,flight:token})){flight.current=null;setBusy(false);setUnresolved(c.hasUnresolved());}}
 };
 const text=isDark?colors.textDark:colors.text,bg=isDark?colors.cardDark:colors.card;
 const button=(title:string,onPress:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={{padding:12,borderWidth:1,borderRadius:10,borderColor:colors.primary,opacity:disabled?.5:1}}><Text style={{color:colors.primary}}>{title}</Text></TouchableOpacity>;
 return <View style={{gap:10}}>
  {button(label('Review current targets','Revisar metas actuales'),()=>{void run('read');},busy||blocked||!ownerId||!recovered||unresolved)}
  {unresolved&&<><Text style={{color:text}}>{label('A previous confirmation is unresolved. Checking does not submit it again. Retry sends only that exact previous request.','Hay una confirmación pendiente de verificar. Consultar no la vuelve a enviar. Reintentar envía solo aquella misma solicitud.')}</Text>
   {button(label('Check previous confirmation','Consultar confirmación anterior'),()=>{void run('receipt');},busy||blocked||!recovered)}
   {button(label('Retry the same confirmation','Reintentar la misma confirmación'),()=>{void run('retry');},busy||blocked||!recovered)}
  </>}
  {message!=='none'&&<Text accessibilityRole="alert" style={{color:text}}>{message==='confirmed'?label('Your acknowledgment was recorded. Your targets were not changed.','Se registró tu confirmación. Tus metas no cambiaron.'):label('The confirmation could not be verified. No success is assumed.','No se pudo verificar la confirmación. No se da por guardada.')}</Text>}
  {review?.kind==='confirmation_preview'&&<Modal transparent visible onRequestClose={close}>
   <View style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'rgba(0,0,0,0.45)'}}><ScrollView accessibilityViewIsModal style={{backgroundColor:bg,borderRadius:16,padding:20,maxHeight:'85%'}} contentContainerStyle={{gap:12}}>
    <Text style={{color:text,fontSize:20}}>{review.title}</Text><Text style={{color:text}}>{review.body}</Text>
    {review.rows.map(row=><Text key={row.key} style={{color:text}}>{row.label}: {String(row.value)} {row.unit}</Text>)}
    <Text style={{color:text}}>{review.caution}</Text><Text style={{color:text}}>{review.timing}</Text>
    {button(review.keep,()=>{void run('confirm');},busy||blocked)}
    {button(review.cancel,close)}
   </ScrollView></View>
  </Modal>}
 </View>;
}
