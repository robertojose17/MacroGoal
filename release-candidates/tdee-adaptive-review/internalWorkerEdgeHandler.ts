import {readAdaptiveReviewPolicyBinding} from './adaptivePolicyBinding.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.83.0';
import {createInternalWorkerRuntime,INTERNAL_WORKER_RUNTIME_RELEASE,INTERNAL_RATE_POLICY_BINDING,type ExistingServiceClient} from './internalWorkerRuntime.ts';
/** Lazy server entry. Existing gateway setting is untouched; internal auth is additional. */
export async function handleInternalWorker(request:Request):Promise<Response>{
 if(!INTERNAL_WORKER_RUNTIME_RELEASE.enabled)return new Response(JSON.stringify({version:'internal-daily-worker-v1',result:'disabled'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 const binding=readAdaptiveReviewPolicyBinding(key=>Deno.env.get(key));
 if(!binding||binding.engineVersion!=='rules14-v1'||!('revision' in binding)||typeof binding.revision!=='number')return new Response(JSON.stringify({result:'server_policy_required'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 return createInternalWorkerRuntime({
  serviceRoleKey,recommendationEngine:'rules14-v1',rulesPolicy:{version:binding.version,revision:binding.revision,digest:binding.digest,engineVersion:'rules14-v1'},ratePolicy:INTERNAL_RATE_POLICY_BINDING,
  createExistingServiceClient(){
   const url=Deno.env.get('SUPABASE_URL');
   if(!url||!serviceRoleKey)throw Error('existing_service_configuration_unavailable');
   return createClient(url,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}) as unknown as ExistingServiceClient;
  },
  getExistingV2Key:()=>Deno.env.get('REVENUECAT_API_KEY_V2'),
  request:fetch
 })(request);
}

