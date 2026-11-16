import {createClient} from 'npm:@supabase/supabase-js@2.83.0';
import {createInternalWorkerRuntime,INTERNAL_WORKER_RUNTIME_RELEASE,INTERNAL_RATE_POLICY_BINDING,type ExistingServiceClient} from '../../../release-candidates/tdee-adaptive-review/internalWorkerRuntime.ts';

// This new endpoint is diagnostic-only and inactive. No cron is installed.
// Server secrets are read only after the immutable release guard, never returned.
Deno.serve(async(request:Request):Promise<Response>=>{
 if(!INTERNAL_WORKER_RUNTIME_RELEASE.enabled)return new Response(
  JSON.stringify({version:'internal-daily-worker-v1',result:'disabled'}),
  {status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const runtime=createInternalWorkerRuntime({
  serviceRoleKey,ratePolicy:INTERNAL_RATE_POLICY_BINDING,
  createExistingServiceClient(){
   const url=Deno.env.get('SUPABASE_URL');
   if(!url||!serviceRoleKey)throw Error('existing_service_configuration_unavailable');
   return createClient(url,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}) as unknown as ExistingServiceClient;
  },
  getExistingV2Key:()=>Deno.env.get('REVENUECAT_API_KEY_V2'),
  request:fetch
 });
 return runtime(request);
});
