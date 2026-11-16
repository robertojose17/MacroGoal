import {RATE_ISSUANCE_RELEASE,runRateIssuanceWithAnchor} from './rateIssuanceRuntime.ts';
import {ADAPTIVE_RELEASE_STATE} from './proposal.ts';
import {createSnapshotOrchestrationSupabasePorts,type SnapshotOrchestrationSupabaseConfig} from './snapshotOrchestrationSupabaseAdapter.ts';
import type {ServerPolicyBinding} from './snapshotReviewOrchestration.ts';
/** Uses the already configured client/session/provider refresh. No new credentials. */
export function createUserRateIssuanceRuntime(config:SnapshotOrchestrationSupabaseConfig,binding:ServerPolicyBinding){
 const fixed=structuredClone(binding),ownPorts=createSnapshotOrchestrationSupabasePorts(config,fixed);
 let service:ReturnType<typeof config.createClient>|undefined;
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  service??=config.createClient(config.url,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const result=await service.rpc(name,structuredClone(args));if(result.error)throw Error('source_error');return structuredClone(result.data);
 };
 return async(request:unknown)=>{
  const stop=(reason:string)=>({reason,proposal:null,mayHaveWritten:false});
  if(!request||typeof request!=='object'||Array.isArray(request))return stop('invalid_request');
  const r=request as Record<string,unknown>;
  if(Object.keys(r).length!==1||typeof r.authorization!=='string'||r.authorization.length>16384||!/^Bearer [^\s]+$/.test(r.authorization))return stop('invalid_request');
  if(!RATE_ISSUANCE_RELEASE.enabled||!ADAPTIVE_RELEASE_STATE.recommendationsEnabled)return stop('safety_review_required');
  try{
   const token=r.authorization.slice(7),user=await ownPorts.verifyAccessToken(token);if(!user)return stop('authentication_required');
   const p=await ownPorts.readPolicyExact(fixed) as Record<string,unknown>|null;
   if(!p||p.enabled!==true||p.reviewed!==true||p.snapshot_contract_reviewed!==true)return stop('server_policy_required');
   await ownPorts.loadOwnContext(token); // Includes existing legitimate purchase refresh, never a TTL extension.
   return await runRateIssuanceWithAnchor(user.id,{rpc,now:Date.now,newProposalId:()=>crypto.randomUUID(),expectedPolicy:fixed});
  }catch{return stop('source_error');}
 };
}

