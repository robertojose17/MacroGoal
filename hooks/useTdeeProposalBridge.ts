import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {AppState} from 'react-native';
import {supabase} from '@/lib/supabase/client';
import {emitGoalChanged,subscribeGoalChanged} from '@/utils/goalChangeEvents';
import {createTdeeReviewController,type ReviewResult,type TdeeProposal} from '@/utils/tdeeProposalReview';
import {makeTdeeReviewServices,readTdeeReviewProposal} from '@/utils/tdeeReviewServices';
type GoalReadback={profile:{id:string};goal:{user_id:string}};
export function useTdeeProposalBridge(ownerId:string|undefined,blocked:boolean,refreshVerifiedGoal:()=>Promise<GoalReadback>){
 const [proposal,setProposal]=useState<TdeeProposal|null>(null),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[active,setActive]=useState(false),[message,setMessage]=useState<'none'|'unavailable'|'no_proposal'|'refresh_failed'|'refreshed'>('none');
 const owner=useRef(ownerId),locked=useRef(blocked),mounted=useRef(false),focused=useRef(false),foreground=useRef(AppState.currentState==='active'),epoch=useRef(0),flight=useRef<AbortController|null>(null);
 const currentOwner=useRef<string|undefined>(undefined),refreshRef=useRef(refreshVerifiedGoal);refreshRef.current=refreshVerifiedGoal;owner.current=ownerId;locked.current=blocked;
 const controller=useRef<ReturnType<typeof createTdeeReviewController>|null>(null);
 const resolvedRef=useRef<(result:ReviewResult)=>Promise<void>>(async()=>{});
 if(!controller.current)controller.current=createTdeeReviewController({...makeTdeeReviewServices(()=>currentOwner.current),onCommitted:receipt=>resolvedRef.current({status:'resolved',receipt})});
 const clear=useCallback(()=>{++epoch.current;flight.current?.abort();flight.current=null;if(mounted.current){setVisible(false);setProposal(null);setBusy(false);}},[]);
 const lifecycle=useCallback(()=>{const enabled=mounted.current&&focused.current&&foreground.current;if(mounted.current)setActive(enabled);if(!enabled)clear();},[clear]);
 useEffect(()=>{mounted.current=true;currentOwner.current=owner.current;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{const next=session?.user.id;if(next!==owner.current||next!==currentOwner.current){currentOwner.current=next===owner.current?next:undefined;clear();setMessage('none');}});
  const app=AppState.addEventListener('change',value=>{foreground.current=value==='active';lifecycle();});
  const unsubscribe=subscribeGoalChanged(actor=>{if(actor===undefined||actor===owner.current)clear();});
  return()=>{mounted.current=false;currentOwner.current=undefined;clear();subscription.unsubscribe();app.remove();unsubscribe();};
 },[clear,lifecycle]);
 useEffect(()=>{currentOwner.current=ownerId;clear();setMessage('none');},[ownerId,clear]);
 useFocusEffect(useCallback(()=>{focused.current=true;lifecycle();return()=>{focused.current=false;lifecycle();};},[lifecycle]));
 useEffect(()=>{if(blocked)clear();},[blocked,clear]);
 const review=useCallback(async()=>{
  const actor=owner.current;if(!actor||locked.current||flight.current||!mounted.current||!focused.current||!foreground.current)return;
  const revision=++epoch.current,abort=new AbortController();flight.current=abort;setBusy(true);setMessage('none');setProposal(null);
  const current=()=>mounted.current&&focused.current&&foreground.current&&owner.current===actor&&currentOwner.current===actor&&epoch.current===revision&&!abort.signal.aborted;
  try{
   const session=await supabase.auth.getSession();if(!current()||session.error||session.data.session?.user.id!==actor)throw Error('account_changed');
   // Reconcile earlier acceptance before issuing any new proposal. Recovery never POSTs acceptance.
   const recovered=await controller.current!.recover();if(!current())return;
   if(recovered.status==='resolved')return;
   if(recovered.status==='unresolved'){setVisible(true);return;}
   const reply=await readTdeeReviewProposal(actor,current,abort.signal);if(!current())return;
   if(!reply.proposal){setMessage('no_proposal');return;}
   setProposal(reply.proposal);setVisible(true);
  }catch{if(current())setMessage('unavailable');}finally{if(flight.current===abort)flight.current=null;if(current())setBusy(false);}
 },[]);
 const resolved=useCallback(async(result:ReviewResult)=>{
  if(result.status!=='resolved'||result.receipt.status!=='committed')return;
  const actor=result.receipt.request.ownerId;
  if(currentOwner.current!==actor||owner.current!==actor)throw Error('account_changed');
  // Accepted targets come from the authoritative goal read, never from the proposal body.
  emitGoalChanged(actor);
  if(!mounted.current||!focused.current||!foreground.current)return;
  try{const snapshot=await refreshRef.current();const auth=await supabase.auth.getSession();if(auth.error||auth.data.session?.user.id!==actor||(owner.current!==undefined&&owner.current!==actor)||snapshot.profile.id!==actor||snapshot.goal.user_id!==actor)throw Error('account_changed');if(mounted.current)setMessage('refreshed');}
  catch(error){if(mounted.current&&currentOwner.current===actor)setMessage('refresh_failed');throw error;}
 },[]);
 resolvedRef.current=resolved;
 return{proposal,visible,busy,active,message,controller:controller.current,review,close:clear,resolved:async(_result:ReviewResult)=>{}};
}
