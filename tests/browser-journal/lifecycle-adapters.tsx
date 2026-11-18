// EXPLICIT TEST BOUNDARIES: DOM for React Native, focus/app lifecycle, synthetic auth/transport/controller.
// React/ReactDOM and the repository component/hook code remain real.
import React,{useEffect} from 'react';
export const env:any={owner:'11111111-1111-4111-8111-111111111111',focused:true,foreground:'active',auth:new Set(),focus:new Set(),app:new Set(),calls:{recover:0,offer:0,accept:0,receipt:0,retry:0},pendingRequests:[],defer:false};
(globalThis as any).__lifecycleEnv=env;
export const View=({children,...props}:any)=><div>{children}</div>,Text=({children}:any)=><span>{children}</span>,ScrollView=View;
export const TouchableOpacity=({children,onPress,disabled}:any)=><button disabled={disabled} onClick={onPress}>{children}</button>;
export const Modal=({children,visible}:any)=>visible?<div role="dialog">{children}</div>:null;
export const StyleSheet={create:(v:any)=>v};
export const AppState={get currentState(){return env.foreground},addEventListener:(_event:string,fn:any)=>{env.app.add(fn);return{remove:()=>env.app.delete(fn)}}};
export function useFocusEffect(callback:any){useEffect(()=>{let cleanup:any;const invoke=()=>{cleanup?.();cleanup=undefined;if(env.focused)cleanup=callback();};invoke();env.focus.add(invoke);return()=>{env.focus.delete(invoke);cleanup?.();}},[callback]);}
export function useTranslation(){return {i18n:{language:'en'},t:(key:string)=>key};}
const session=()=>({user:{id:env.owner,is_anonymous:false},access_token:'synthetic-test-token'});
export const supabase:any={auth:{getSession:async()=>({data:{session:session()},error:null}),getUser:async()=>({data:{user:session().user},error:null}),onAuthStateChange:(fn:any)=>{env.auth.add(fn);return{data:{subscription:{unsubscribe:()=>env.auth.delete(fn)}}}}}};
export const SUPABASE_PROJECT_URL='https://synthetic.invalid',supabasePublicKey='synthetic-public';
export const colors={text:'#111',textDark:'#fff',card:'#fff',cardDark:'#111',primary:'#357A87'};
export const RULES14_REVIEW_UI_RELEASE={enabled:true};
export function makeRules14ProposalServices(actor:string,isCurrent:any,onVerified:any){return{actor,isCurrent,onVerified};}
export function createRules14ProposalController(p:any){
 let pending:any=null,preview:any=null;const key='synthetic-rules14:'+p.actor;
 const stored=()=>JSON.parse(sessionStorage.getItem(key)||'null');
 return {recover:async()=>{env.calls.recover++;if(env.recoveryError)throw Error('synthetic recovery error');pending=stored();return pending?'pending':'idle';},hasPending:()=>!!pending,pendingPreview:()=>pending?.preview??null,close:()=>{preview=null;},
 review:async()=>{env.calls.offer++;if(env.offerError)throw Error('synthetic offer error');if(env.offerHold)return env.offerHold;preview=env.preview;return preview;},accept:async()=>{env.calls.accept++;return{status:'unresolved'};},
 check:async()=>{env.calls.receipt++;return{status:'unresolved'};},retry:async()=>{env.calls.retry++;env.lastRetry=stored()?.requestId;return{status:'unresolved'};}};
}


export const useRouter=()=>({push:(p:any)=>{env.calls.route=(env.calls.route||0)+1;env.route=p;}});
export const premiumEntry=()=>"/synthetic-premium";
export const PremiumCheckpointInline=({children}:any)=>children("synthetic-flow");
export const TdeeMacroChoice=()=>null;
