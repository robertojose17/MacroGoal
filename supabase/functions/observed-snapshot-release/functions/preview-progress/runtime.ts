import { createClient } from 'npm:@supabase/supabase-js@2.83.0';
import { createPreviewProgressHandler } from './handler.ts';
import { fetchPreviewData } from './queries.ts';
const client=(authorization?:string)=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  ...(authorization?{global:{headers:{Authorization:authorization}}}:{})});
export const handlePreviewProgress=createPreviewProgressHandler({
  authenticate:async token=>{const {data,error}=await client().auth.getUser(token);return error?null:data.user?.id??null;},
  context:async authorization=>{const {data,error}=await client(authorization).rpc('preview_get_dynamic_tdee_context_v1');if(error||!data)throw new Error(error?.message??'preview_access_denied');return data;},
  read:(owner,authorization,now)=>fetchPreviewData(client(authorization),owner,now),
});
