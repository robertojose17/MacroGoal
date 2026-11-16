import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { weightDisplayUnit, type WeightUnit } from '@/utils/weightUnits';
/** Unknown, switched owner, and failed preferences never authorize an assumed-unit save. */
export function useWeightDisplayUnit(ownerId: string | null | undefined): WeightUnit | null {
 const [state,setState] = useState<{ownerId:string;unit:WeightUnit}|null>(null);
 useFocusEffect(useCallback(()=>{
  let cancelled=false;
  setState(null);
  const load=async()=>{
   try {
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user||user.id!==ownerId)return;
    const {data,error}=await supabase.from('users').select('preferred_units').eq('id',user.id).single();
    if(error||!data)return;
    const unit=weightDisplayUnit(data.preferred_units);
    if(!cancelled)setState({ownerId:user.id,unit});
   } catch { /* remain unavailable */ }
  };
  void load();
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   if(session?.user.id!==ownerId){cancelled=true;setState(null);}
  });
  return ()=>{cancelled=true;subscription.unsubscribe();};
 },[ownerId]));
 return state !== null && state.ownerId===ownerId ? state.unit : null;
}
