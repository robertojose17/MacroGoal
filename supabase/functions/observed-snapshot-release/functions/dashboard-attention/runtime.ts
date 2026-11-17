import {createClient} from 'npm:@supabase/supabase-js@2.83.0';
import {createTdeeAccessRefresh} from '../observed-program/tdee-access-refresh.mjs';
import {createDashboardAttentionHandler} from './handler.ts';
const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const own=(authorization?:string)=>createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},...(authorization?{global:{headers:{Authorization:authorization}}}:{})});
const context=async(authorization:string)=>{const {data,error}=await own(authorization).rpc('automatic_get_dynamic_tdee_context_v1');if(error||!data)throw Error('context_unavailable');return data;};
const prepare=createTdeeAccessRefresh({readContext:context,refreshAuthority:async(authorization:string,options:{timeoutMs:number})=>{const response=await fetch(url+'/functions/v1/common-premium-authority',{headers:{Authorization:authorization,apikey:anon},signal:AbortSignal.timeout(options.timeoutMs)});if(!response.ok)throw Error('access_unavailable');return response.json();}});
// Service credentials are confined to the authenticated owner-scoped read-only source.
const service=()=>createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
export const handleDashboardAttention=createDashboardAttentionHandler({prepare,context,
 authenticate:async token=>{const {data,error}=await own().auth.getUser(token);return error?null:data.user?.id??null;},
 source:async owner=>{const {data,error}=await service().rpc('tdee_internal_dashboard_attention_source_v1',{p_owner:owner});if(error)throw Error('source_unavailable');return data;},
});
