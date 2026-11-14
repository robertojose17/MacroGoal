import {createClient} from 'npm:@supabase/supabase-js@2.83.0';
import {createShadowHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
Deno.serve(createShadowHandler({
 identityClient:createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,options),
 serviceClient:()=>{const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)throw Error('configuration');return createClient(url,key,options);},
 getExistingV2Key:()=>Deno.env.get('REVENUECAT_API_KEY_V2'),
}));
