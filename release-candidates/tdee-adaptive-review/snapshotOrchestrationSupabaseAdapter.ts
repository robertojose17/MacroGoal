/** Server-only candidate ports. No entrypoint mount, release switch or policy defaults. */
import {createSnapshotReviewOrchestrator,type SnapshotOrchestrationPorts,type ServerPolicyBinding} from './snapshotReviewOrchestration.ts';
import {snapshotIssueArguments} from './snapshotServerRuntime.ts';
import {createTesterRefresh} from '../../supabase/functions/observed-snapshot-release/functions/observed-program/scoped-tester-refresh.mjs';
import type {SnapshotMacroRequest,SnapshotMacroEvidence} from './snapshotReviewContextParser.ts';
import type {SnapshotSupabaseConfig} from './snapshotSupabaseAdapter.ts';

export type SnapshotOrchestrationSupabaseConfig=SnapshotSupabaseConfig & {fetch?:typeof globalThis.fetch};
const RPC=Object.freeze({
 context:'observed_get_dynamic_tdee_context_v1',
 read:'tdee_read_review_context_v1',policy:'tdee_read_snapshot_policy_v1',
 bootstrap:'tdee_bootstrap_snapshot_review_v1',refresh:'tdee_refresh_snapshot_eligibility_v1',
 issue:'tdee_issue_snapshot_proposal_v1',choice:'tdee_read_macro_choice_v1'
});

/** Only validates a read from the authenticated own-actor RPC, never request body data.
 * Preference provenance is separate from nutritional review and final proposal acceptance.
 */
export function macroPreferenceEvidence(actor:string,request:SnapshotMacroRequest,value:unknown,now:number):SnapshotMacroEvidence{
 const requestCopy=structuredClone(request);
 const out:SnapshotMacroEvidence={version:'snapshot-macro-evidence-v1',request:requestCopy,review:null,consent:null};
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const stamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
 const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
 if(!uuid(actor)||requestCopy.binding.ownerId!==actor||!object(value))return out;
 const captured=stamp(value.capturedAt),source=stamp(requestCopy.sourceCapturedAt),c=value.choice;
 if(!Number.isFinite(stamp(requestCopy.binding.goalRevision))||!Number.isFinite(now)||!Number.isFinite(source)||source>now||now-source>30000||
  !Number.isFinite(captured)||captured<source||captured>now||now-captured>30000||
  value.version!=='macro-choice-state-v1'||value.actionable!==false||value.ownerId!==actor||
  value.copyVersion!=='macro-choice-v1'||value.bindingStatus!=='available'||
  value.goalId!==requestCopy.binding.goalId||value.goalUpdatedAt!==requestCopy.binding.goalRevision||
  value.profileBinding!==requestCopy.profileBinding||value.journeyBinding!==requestCopy.journeyBinding||
  !object(c)||c.current!==true||c.mode!=='smart'||c.copyVersion!=='macro-choice-v1'||c.splitBps!==null||
  !Number.isSafeInteger(value.choiceVersion)||(value.choiceVersion as number)<1||c.choiceVersion!==value.choiceVersion||
  c.goalUpdatedAt!==requestCopy.binding.goalRevision||c.profileBinding!==requestCopy.profileBinding||
  c.journeyBinding!==requestCopy.journeyBinding||!uuid(c.requestId))return out;
 const recorded=stamp(c.recordedAt);
 // A choice made after the source capture needs a new snapshot, not retroactive binding.
 if(!Number.isFinite(recorded)||recorded<0||recorded>source)return out;
 out.consent={mode:'smart',binding:structuredClone(requestCopy.binding),consentId:c.requestId as string,acceptedAt:recorded};
 return out;
}

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
 const prepare=createTesterRefresh({
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
  // Own-actor preference read only. No clinical review source exists: review stays null.
  async loadReviewedMacroContext(actor,request,token){
   try{
    const copied=structuredClone(request);
    if(copied.binding.ownerId!==actor)throw new Error('source_error');
    const result=await own(token).rpc(RPC.choice);
    if(result.error)throw new Error('source_error');
    return macroPreferenceEvidence(actor,copied,structuredClone(result.data),Date.now());
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
 return createSnapshotReviewOrchestrator(createSnapshotOrchestrationSupabasePorts(config,fixed),fixed);
}
