/** Server-only candidate ports. No entrypoint mount, release switch or policy defaults. */
import {createSnapshotReviewOrchestrator,type SnapshotOrchestrationPorts,type ServerPolicyBinding} from './snapshotReviewOrchestration.ts';
import {snapshotIssueArguments} from './snapshotServerRuntime.ts';
import type {SnapshotSupabaseConfig} from './snapshotSupabaseAdapter.ts';

const RPC=Object.freeze({
 read:'tdee_read_review_context_v1',policy:'tdee_read_snapshot_policy_v1',
 bootstrap:'tdee_bootstrap_snapshot_review_v1',refresh:'tdee_refresh_snapshot_eligibility_v1',
 issue:'tdee_issue_snapshot_proposal_v1'
});
/** Private module boundary, not an endpoint. Binding comes only from server configuration. */
export function createSnapshotOrchestrationSupabasePorts(config:SnapshotSupabaseConfig,binding:ServerPolicyBinding):SnapshotOrchestrationPorts{
 const {url,anonKey,serviceKey,createClient}=config;
 const fixed=structuredClone(binding);
 if(typeof url!=='string'||!url.startsWith('https://')||typeof anonKey!=='string'||!anonKey||
 typeof serviceKey!=='string'||!serviceKey||typeof createClient!=='function'||
 !fixed||typeof fixed.version!=='string'||!fixed.version.trim()||fixed.version!==fixed.version.trim()||
 typeof fixed.digest!=='string'||!/^[a-f0-9]{64}$/.test(fixed.digest)||
 typeof fixed.engineVersion!=='string'||!fixed.engineVersion.trim()||fixed.engineVersion!==fixed.engineVersion.trim())
  throw new Error('server_configuration_required');
 const options=()=>({auth:{persistSession:false as const,autoRefreshToken:false as const,detectSessionInUrl:false as const}});
 const own=(token:string)=>{
  if(typeof token!=='string'||!token||token.length>16377||/\s/.test(token))throw new Error('source_error');
  return createClient(url,anonKey,{...options(),global:{headers:{Authorization:'Bearer '+token}}});
 };
 let service:ReturnType<SnapshotSupabaseConfig['createClient']>|undefined;
 const serviceRpc=async(name:string,args:Record<string,unknown>)=>{
  try{
   const copied=structuredClone(args);
   service??=createClient(url,serviceKey,options());
   const result=await service.rpc(name,copied);
   if(result.error)throw new Error('source_error');
   return structuredClone(result.data);
  }catch{throw new Error('source_error');}
 };
 return {
  async verifyAccessToken(token){
   try{
    const result=await own(token).auth.getUser(token);
    if(result.error||!result.data?.user||typeof result.data.user.id!=='string')return null;
    return {id:result.data.user.id};
   }catch{return null;}
  },
  async loadOwnContext(token){
   try{
    const result=await own(token).rpc(RPC.read);
    if(result.error)throw new Error('source_error');
    return structuredClone(result.data);
   }catch{throw new Error('source_error');}
  },
  async readPolicyExact(requested){
   if(!requested||requested.version!==fixed.version||requested.digest!==fixed.digest||requested.engineVersion!==fixed.engineVersion)
    throw new Error('source_error');
   return serviceRpc(RPC.policy,{p_version:fixed.version,p_digest:fixed.digest,p_engine_version:fixed.engineVersion});
  },
  async bootstrapAsService(record){return serviceRpc(RPC.bootstrap,{p_record:record});},
  async refreshAsService(record){return serviceRpc(RPC.refresh,{p_record:record});},
  async issueAsService(record){try{return await serviceRpc(RPC.issue,snapshotIssueArguments(record));}catch{throw new Error('source_error');}}
 };
}
/** Immutable OFF orchestrator remains authoritative; no network clients are created here. */
export function createSnapshotOrchestrationSupabaseRuntime(config:SnapshotSupabaseConfig,binding:ServerPolicyBinding){
 const fixed=structuredClone(binding);
 return createSnapshotReviewOrchestrator(createSnapshotOrchestrationSupabasePorts(config,fixed),fixed);
}
