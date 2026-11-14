import { useEffect, useState } from 'react';
import { supabase, SUPABASE_PROJECT_URL, supabasePublicKey } from '@/lib/supabase/client';
import { readShadowAuthority, shadowFailureCategory } from '@/utils/premiumAuthority/shadowTransport';
import { createShadowSingleFlight } from '@/utils/premiumAuthority/shadowSingleFlight';
import type { Decision } from '@/utils/premiumAuthority/authorityClient';
const shadowRequests = createShadowSingleFlight();
/** Read-only diagnostic. Native callers remain disabled.
 * Result is never an isPremium flag and must not be used to decide access during shadow migration.
 */
export function usePremiumAuthorityShadow(expectedOwner:string|null,enabled=false){
 const [observation,setObservation]=useState<Decision|null>(null);
 const [unavailable,setUnavailable]=useState(false);
 useEffect(()=>{
  setObservation(null);setUnavailable(false);
  if(!enabled||!expectedOwner)return;
  let active=true,revision=0;
  const invalidate=()=>{revision++;setObservation(null);};
  const read=async()=>{
   const rev=++revision;
   const isCurrent=()=>active&&revision===rev;
   try{
    const result=await shadowRequests.read(expectedOwner,(signal,current)=>readShadowAuthority({endpoint:SUPABASE_PROJECT_URL+'/functions/v1/common-premium-authority',apiKey:supabasePublicKey,expectedOwner,
     getSession:()=>supabase.auth.getSession(),request:fetch,signal,isCurrent:current}));
    if(isCurrent()){setObservation(result);setUnavailable(false);}
   }catch(error){if(isCurrent()){setObservation(null);setUnavailable(true);console.warn('[PremiumAuthority] shadow unavailable:',shadowFailureCategory(error));}}
  };
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   invalidate();if(session?.user.id!==expectedOwner)shadowRequests.invalidate(expectedOwner);if(session?.user.id===expectedOwner)queueMicrotask(()=>{if(active)void read();});
  });
  void read();
  return ()=>{active=false;revision++;subscription.unsubscribe();};
 },[enabled,expectedOwner]);
 return {observation,unavailable,mode:'shadow' as const,enforced:false as const};
}
