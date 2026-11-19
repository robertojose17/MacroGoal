import {macroPreferenceEvidence} from './macroPreferenceEvidence.ts';
import {createRules14SupabaseRuntime,type Rules14ServerBinding} from './rules14SupabaseRuntime.ts';
import {createUserRateIssuanceRuntime} from './rateIssuanceSupabaseRuntime.ts';
import {rateReviewRequest,rateReviewEvidence} from './rateReviewEvidence.ts';
import {rateMacroRequest,buildRateReviewedContext} from './rateReviewedContext.ts';
/** Server-only candidate ports. No entrypoint mount, release switch or policy defaults. */
import {nutritionReviewExpected,nutritionReviewEvidence} from './nutritionReviewEvidence.ts';
import {createSnapshotReviewOrchestrator,type SnapshotOrchestrationPorts,type ServerPolicyBinding} from './snapshotReviewOrchestration.ts';
import {snapshotIssueArguments} from './snapshotServerRuntime.ts';
import {createTdeeAccessRefresh} from '../../supabase/functions/observed-snapshot-release/functions/observed-program/tdee-access-refresh.mjs';
import type {SnapshotSupabaseConfig} from './snapshotSupabaseAdapter.ts';

export type SnapshotOrchestrationSupabaseConfig=SnapshotSupabaseConfig & {fetch?:typeof globalThis.fetch};
const RPC=Object.freeze({
 context:'observed_get_dynamic_tdee_context_v1',
 read:'tdee_read_review_context_v1',policy:'tdee_read_snapshot_policy_v1',
 bootstrap:'tdee_bootstrap_snapshot_review_v1',refresh:'tdee_refresh_snapshot_eligibility_v1',
 issue:'tdee_issue_snapshot_proposal_v1',choice:'tdee_read_macro_choice_v1',nutrition:'tdee_read_nutrition_review_v1',rate:'tdee_read_rate_review_v1'
});

export {macroPreferenceEvidence} from './macroPreferenceEvidence.ts';

/** Private module boundary, not an endpoint. Binding comes only from server configuration. */
export function createSnapshotOrchestrationSupabasePorts(config:SnapshotOrchestrationSupabaseConfig,binding:ServerPolicyBinding):SnapshotOrchestrationPorts{
 const {url,anonKey,serviceKey,createClient}=config;
 const fetchAuthority=config.fetch??globalThis.fetch;
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
 const prepare=createTdeeAccessRefresh({
  readContext:async(authorization:string)=>{
   const result=await own(authorization.slice(7)).rpc(RPC.context);
   if(result.error||!result.data)throw new Error('source_error');
   return result.data;
  },
  refreshAuthority:async(authorization:string)=>{
   if(typeof fetchAuthority!=='function')throw new Error('source_error');
   const response=await fetchAuthority(url+'/functions/v1/common-premium-authority',{
    method:'GET',headers:{Authorization:authorization,apikey:anonKey},signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw new Error('source_error');
   return response.json();
  }
 });
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
    // Runs only after verified authentication and explicit policy selection in the orchestrator.
    // Marker/owner/expiry checks are shared with the existing observational flow.
    if(typeof token!=='string'||!token||token.length>16377||/\s/.test(token))throw new Error('source_error');
    await prepare('Bearer '+token);
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
  // Own-actor preference first, then fixed service-only administrative review lookup.
  // Empty/uninstalled/unverified review source fails closed; no write or default review.
  async loadReviewedMacroContext(actor,request,token){
   try{
    const copied=structuredClone(request);
    if(copied.binding.ownerId!==actor)throw new Error('source_error');
    const result=await own(token).rpc(RPC.choice);
    if(result.error)throw new Error('source_error');
    const evidence=macroPreferenceEvidence(actor,copied,structuredClone(result.data),Date.now());
    if(evidence.preferenceStatus!=='current')return evidence;
    const value=await serviceRpc(RPC.nutrition,{p_owner:actor,p_expected:nutritionReviewExpected(copied,fixed.engineVersion)});
    evidence.review=nutritionReviewEvidence(actor,copied,fixed.engineVersion,value,Date.now());
    return evidence;
   }catch{throw new Error('source_error');}
  },
  async loadReviewedRateContext(actor,snapshot,proposalId,token){
   try{
    const copied=structuredClone(snapshot),now=Date.now();
    const expected=rateReviewRequest(copied,actor,fixed,now),request=rateMacroRequest(copied,actor,fixed,now);
    if(!expected||!request)return null;
    // Fixed service getter only. Never accept a review object or approval flag
    // from snapshot/request; server provenance is validated independently.
    const raw=await serviceRpc(RPC.rate,{p_owner:actor,p_expected:expected});
    const review=rateReviewEvidence(expected,raw,Date.now());
    if(!review)return null;
    const choice=await own(token).rpc(RPC.choice);
    if(choice.error)throw new Error('source_error');
    const macro=macroPreferenceEvidence(actor,request,structuredClone(choice.data),Date.now());
    if(macro.preferenceStatus!=='current')return null;
    const nutrition=await serviceRpc(RPC.nutrition,{p_owner:actor,p_expected:nutritionReviewExpected(request,fixed.engineVersion)});
    macro.review=nutritionReviewEvidence(actor,request,fixed.engineVersion,nutrition,Date.now());
    return buildRateReviewedContext(copied,actor,proposalId,fixed,review,macro,Date.now());
   }catch{throw new Error('source_error');}
  },
  async bootstrapAsService(record){return serviceRpc(RPC.bootstrap,{p_record:record});},
  async refreshAsService(record){return serviceRpc(RPC.refresh,{p_record:record});},
  async issueAsService(record){try{return await serviceRpc(RPC.issue,snapshotIssueArguments(record));}catch{throw new Error('source_error');}}
 };
}
/** Immutable OFF orchestrator remains authoritative; no network clients are created here. */
export function createSnapshotOrchestrationSupabaseRuntime(config:SnapshotOrchestrationSupabaseConfig,binding:ServerPolicyBinding){
 const fixed=structuredClone(binding);
 if(fixed.engineVersion==='rules14-observed-v2')return createRules14SupabaseRuntime(config,fixed as Rules14ServerBinding);
 if(fixed.engineVersion==='rate-review-14d-v1')return createUserRateIssuanceRuntime(config,fixed);
 return createSnapshotReviewOrchestrator(createSnapshotOrchestrationSupabasePorts(config,fixed),fixed);
}



