import {RULES14_RELEASE,runRules14ForReview} from './rules14Runtime.ts';
import {ADAPTIVE_RELEASE_STATE} from './proposal.ts';
import {createSnapshotOrchestrationSupabasePorts,type SnapshotOrchestrationSupabaseConfig} from './snapshotOrchestrationSupabaseAdapter.ts';
import type {ServerPolicyBinding} from './snapshotReviewOrchestration.ts';
export type Rules14ServerBinding=ServerPolicyBinding&{revision:number;engineVersion:'rules14-v1'};
/** Explicit source/runtime selection. User never sends source, actor, rules or policy. */
export function createRules14SupabaseRuntime(config:SnapshotOrchestrationSupabaseConfig,binding:Rules14ServerBinding){
 const fixed=structuredClone(binding),authPorts=createSnapshotOrchestrationSupabasePorts(config,fixed);
 let service:ReturnType<typeof config.createClient>|undefined;
 const rpc=async(name:string,args:Record<string,unknown>)=>{service??=config.createClient(config.url,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const r=await service.rpc(name,structuredClone(args));if(r.error)throw Error('source_error');return structuredClone(r.data);};
 return async(request:unknown)=>{
  const stop=(reason:string)=>({reason,proposal:null,mayHaveWritten:false});
  if(!request||typeof request!=='object'||Array.isArray(request))return stop('invalid_request');const r=request as Record<string,unknown>;
  if(Object.keys(r).length!==1||typeof r.authorization!=='string'||r.authorization.length>16384||!/^Bearer [^\s]+$/.test(r.authorization))return stop('invalid_request');
  if(!RULES14_RELEASE.enabled||!ADAPTIVE_RELEASE_STATE.recommendationsEnabled)return stop('safety_review_required');
  if(fixed.engineVersion!=='rules14-v1'||!Number.isSafeInteger(fixed.revision)||fixed.revision<1)return stop('rules14_policy_required');
  try{
   const token=r.authorization.slice(7),user=await authPorts.verifyAccessToken(token);if(!user)return stop('authentication_required');
   await authPorts.loadOwnContext(token); // Existing legitimate purchase refresh; no expiry extension.
   return runRules14ForReview(user.id,{rpc,now:Date.now,newProposalId:()=>crypto.randomUUID(),expectedPolicy:fixed});
  }catch{return stop('source_error');}
 };
}
