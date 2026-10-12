import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {supabase,SUPABASE_PROJECT_URL} from '@/lib/supabase/client';
import {loadPrivatePhoto,parsePrivatePhotoReference,encodePhotoBytes} from '@/utils/privatePhotoClient';
// Shared epoch contains no bytes or tokens; auth transitions invalidate every mounted consumer.
let generation=0;
export function privatePhotoGeneration(){return generation;}
const listeners=new Set<()=>void>();
let subscribed=false;
function subscribe(listener:()=>void){
 if(!subscribed){subscribed=true;supabase.auth.onAuthStateChange(()=>{generation++;for(const fn of listeners)fn();});}
 listeners.add(listener);return()=>{listeners.delete(listener);};
}
/** Returns null for legacy public/signed/local URIs. Those are never a private-media fallback. */
export function usePrivatePhoto(reference:string|null|undefined):string|null{
 const [epoch,setEpoch]=useState(generation);
 const [result,setResult]=useState<{reference:string;epoch:number;uri:string}|null>(null);
 const [active,setActive]=useState(AppState.currentState==='active');
 useEffect(()=>subscribe(()=>{setResult(null);setEpoch(generation);}),[]);
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{setResult(null);setActive(state==='active');});return()=>sub.remove();},[]);
 useEffect(()=>{
  setResult(null);const target=parsePrivatePhotoReference(reference);if(!target||!active)return;
  let disposed=false;const controller=new AbortController();
  const capturedEpoch=epoch;
  loadPrivatePhoto(target,{
   endpoint:`${SUPABASE_PROJECT_URL}/functions/v1/check-in-photos/media`,fetch,
   session:async()=>{const before=generation;const {data:{session}}=await supabase.auth.getSession();return session&&before===generation?{actor:session.user.id,token:session.access_token,generation:before}:null;},encode:encodePhotoBytes,
  },controller.signal).then(uri=>{if(!disposed&&generation===capturedEpoch)setResult({reference:reference!,epoch:capturedEpoch,uri});}).catch(()=>{if(!disposed)setResult(null);});
  return()=>{disposed=true;controller.abort();};
 },[reference,epoch,active]);
 return active&&result&&result.reference===reference&&result.epoch===generation?result.uri:null;
}
