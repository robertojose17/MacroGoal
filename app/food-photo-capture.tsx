import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import BarcodeRecoveryScreen from '@/components/BarcodeRecoveryScreen';
import LegacyFoodPhotoCaptureScreen from '@/components/LegacyFoodPhotoCaptureScreen';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';

/** Capability probe performs no search, upload, report or catalog write. Old servers stay compatible. */
export default function FoodPhotoCaptureRoute() {
  const [enabled,setEnabled]=useState<boolean|null>(null);
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    void (async()=>{
      try {
        const {data:{session}}=await supabase.auth.getSession();
        if(!session){if(active)setEnabled(false);return;}
        const response=await fetch(SUPABASE_PROJECT_URL+'/functions/v1/vision-nutrition-extract',{
          method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
          body:JSON.stringify({action:'recovery_capabilities'}),
        });
        const data=response.ok?await response.json():null;
        if(active)setEnabled(data?.recovery_enabled===true);
      }catch{if(active)setEnabled(false);}
      finally{clearTimeout(timeout);}
    })();
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[]);
  if(enabled===null)return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator/></View>;
  return enabled?<BarcodeRecoveryScreen/>:<LegacyFoodPhotoCaptureScreen/>;
}
