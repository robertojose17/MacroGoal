/** Server-selected owners only. Not an endpoint and never authenticates as a user. */
import {createRCV2Reader} from '../../supabase/functions/common-premium-authority/rc-v2-adapter.mjs';
import {evaluateV2Evidence} from '../../supabase/functions/common-premium-authority/v2-evidence.mjs';
export const INTERNAL_PROVIDER_RELEASE_STATE=Object.freeze({enabled:false} as const);
export type ProviderSelection={ownerId:string;contextRevision:string};
export type RegistryBinding={actor:string;kind:string;registryVersion:string;expiresAt:number};
export type ProviderProof=ProviderSelection&{checkedAt:number;expiresAt:number;active:boolean;revoked:boolean;authority:{version:'internal-provider-proof-v1';scopes:{environment:string;version:number}[];registry:RegistryBinding|null}};
export type InternalProviderPorts={
 /** Trusted current server selector/DB read, never an HTTP echo. */
 readCurrentSelection(selection:ProviderSelection,signal:AbortSignal):Promise<ProviderSelection&{enrolled:boolean;accountActive:boolean}>;
 /** Fixed service-role client only; no new credentials or user JWT. */
 serviceRpc(name:string,args:Record<string,unknown>,signal:AbortSignal):Promise<unknown>;
 getExistingV2Key():string|undefined;
 request:typeof fetch;
 now?:()=>number;
};
const obj=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const uuid=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const versionNumber=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<Number.MAX_SAFE_INTEGER?x:typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)&&Number.isSafeInteger(Number(x))&&Number(x)<Number.MAX_SAFE_INTEGER?Number(x):NaN;
const unavailable=()=>new Error('internal_provider_unavailable');
/**
 * Unmounted reviewed-core seam, exercised with synthetic ports only. The runtime
 * entry below is immutable OFF. Callers must already be internally authenticated
 * and choose an enrolled owner from the protected selector, not request data.
 */
export async function refreshServerSelectedProviderForReview(ports:InternalProviderPorts,selection:ProviderSelection,deadline:number,signal:AbortSignal):Promise<ProviderProof>{
 const now=ports.now??Date.now;
 if(!selection||Object.keys(selection).length!==2||!uuid(selection.ownerId)||!hash(selection.contextRevision)||!Number.isSafeInteger(deadline)||!signal)throw unavailable();
 const selected=structuredClone(selection);
 const check=()=>{const t=now();if(!Number.isSafeInteger(t)||signal.aborted||t>=deadline)throw unavailable();return t;};
 const sameSelection=async()=>{check();const current=await ports.readCurrentSelection(structuredClone(selected),signal);check();
  if(!current||current.ownerId!==selected.ownerId||current.contextRevision!==selected.contextRevision||current.enrolled!==true||current.accountActive!==true)throw unavailable();};
 const rpc=async(name:string,args:Record<string,unknown>)=>{check();const r=await ports.serviceRpc(name,args,signal);check();return r;};
 const qa=async()=>{const p=await rpc('common_premium_qa_scope_v1',{p_actor:selected.ownerId});if(p===null)return null;
  if(!obj(p)||p.actor!==selected.ownerId||p.kind!=='server_verified_test_account_registry'||typeof p.registryVersion!=='string'||!(/^[1-9][0-9]*$/).test(p.registryVersion)||!Number.isFinite(p.expiresAt)||p.expiresAt<=check())throw unavailable();
  return {actor:p.actor,kind:p.kind,registryVersion:p.registryVersion,expiresAt:p.expiresAt};};
 await sameSelection();const registry=await qa();
 const environments=registry?['PRODUCTION','SANDBOX']:['PRODUCTION'];
 const official=createRCV2Reader({projectId:'proj0d801cfa',now:check,getJSON:async(url:string,init:RequestInit)=>{
  const t=check(),key=ports.getExistingV2Key();if(typeof key!=='string'||!key)return {status:503};
  try{const response=await ports.request(url,{...init,headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.min(4000,deadline-t)))])});check();return {status:response.status,body:response.status===200?await response.json():null};}catch{return {status:503};}
 }});
 const results=await Promise.all(environments.map(async environment=>{
  try{
   const baseline=await rpc('common_premium_read_scope_v1',{p_owner:selected.ownerId,p_environment:environment});
   if(!obj(baseline))throw unavailable();const version=versionNumber(baseline.version);
   if(!Number.isSafeInteger(version)||version<0)throw unavailable();
   const evidence=await official({actor:selected.ownerId,environment});check();
   if(!evaluateV2Evidence(evidence,selected.ownerId,environment,check()).writeCanonical)throw unavailable();
   // Recheck enrollment before a cache write as well as after provider completion.
   await sameSelection();
   const committed=await rpc('common_premium_refresh_v1',{p_owner:selected.ownerId,p_environment:environment,p_expected:String(version),p_proof:evidence});
   if(!obj(committed)||committed.committed!==true)throw unavailable();
   const fresh=await rpc('common_premium_read_scope_v1',{p_owner:selected.ownerId,p_environment:environment});
   if(!obj(fresh)||fresh.dirty!==false||!Number.isSafeInteger(versionNumber(fresh.version))||versionNumber(fresh.version)!==version+1||!obj(fresh.evidence))throw unavailable();
   const e=fresh.evidence,t=check(),decision=evaluateV2Evidence(e,selected.ownerId,environment,t);
   if(!decision.writeCanonical||!Number.isFinite(e.validUntil)||e.validUntil<=t||e.validUntil>e.checkedAt+30000||
    (e.state==='active'&&(!Number.isFinite(e.providerValidUntil)||e.providerValidUntil<=t)))throw unavailable();
   return {environment,version:version+1,state:e.state,checkedAt:e.checkedAt,expiresAt:Math.min(e.validUntil,e.checkedAt+30000,e.state==='active'?e.providerValidUntil:Infinity)};
  }catch{return null;}
 }));
 check();await sameSelection();const after=await qa();
 if(JSON.stringify(after)!==JSON.stringify(registry))throw unavailable();
 const active=results.filter((r):r is NonNullable<typeof r>=>r?.state==='active');
 const usable=active.length?active:results.every(r=>r?.state==='inactive')?results as NonNullable<typeof results[number]>[]:[];
 if(!usable.length)throw unavailable();
 const checkedAt=Math.min(...usable.map(r=>r.checkedAt)),expiresAt=Math.min(...usable.map(r=>r.expiresAt),registry?.expiresAt??Infinity);
 if(expiresAt<=check()||expiresAt>checkedAt+30000)throw unavailable();
 return {...selected,checkedAt,expiresAt,active:active.length>0,revoked:false,authority:{version:'internal-provider-proof-v1',scopes:usable.map(r=>({environment:r.environment,version:r.version})),registry}};
}
/** Revalidate cache identity, not provider. Never renew checkedAt/expiry or grant from proof flags. */
export async function revalidateServerSelectedProofForReview(ports:InternalProviderPorts,selection:ProviderSelection,proof:unknown,deadline:number,signal:AbortSignal):Promise<ProviderProof>{
 const now=ports.now??Date.now;
 if(!selection||Object.keys(selection).length!==2||!uuid(selection.ownerId)||!hash(selection.contextRevision)||!Number.isSafeInteger(deadline)||!signal||
  !obj(proof)||proof.ownerId!==selection.ownerId||proof.contextRevision!==selection.contextRevision||proof.revoked!==false||typeof proof.active!=='boolean'||
  !Number.isSafeInteger(proof.checkedAt)||!Number.isSafeInteger(proof.expiresAt)||!obj(proof.authority)||proof.authority.version!=='internal-provider-proof-v1'||
  !Array.isArray(proof.authority.scopes)||proof.authority.scopes.length<1||proof.authority.scopes.length>2)throw unavailable();
 const fixed=structuredClone(proof) as ProviderProof;
 const check=()=>{const t=now();if(!Number.isSafeInteger(t)||signal.aborted||t>=deadline||fixed.checkedAt>t||fixed.expiresAt<=t||fixed.expiresAt>fixed.checkedAt+30000)throw unavailable();return t;};
 const current=async()=>{check();const s=await ports.readCurrentSelection(structuredClone(selection),signal);check();if(!s||s.ownerId!==selection.ownerId||s.contextRevision!==selection.contextRevision||s.enrolled!==true||s.accountActive!==true)throw unavailable();};
 const rpc=async(name:string,args:Record<string,unknown>)=>{check();const r=await ports.serviceRpc(name,args,signal);check();return r;};
 const registry=async()=>{const raw=await rpc('common_premium_qa_scope_v1',{p_actor:selection.ownerId});
  if(raw===null){if(fixed.authority.registry!==null)throw unavailable();return;}
  if(!obj(raw)||raw.actor!==selection.ownerId||raw.kind!=='server_verified_test_account_registry'||typeof raw.registryVersion!=='string'||!(/^[1-9][0-9]*$/).test(raw.registryVersion)||!Number.isFinite(raw.expiresAt)||raw.expiresAt<=check())throw unavailable();
  const normalized={actor:raw.actor,kind:raw.kind,registryVersion:raw.registryVersion,expiresAt:raw.expiresAt};
  if(JSON.stringify(normalized)!==JSON.stringify(fixed.authority.registry))throw unavailable();
 };
 await current();await registry();const seen=new Set<string>();const evidence=[];
 for(const scope of fixed.authority.scopes){
  if(!obj(scope)||Object.keys(scope).length!==2||!['PRODUCTION','SANDBOX'].includes(scope.environment)||
   (scope.environment==='SANDBOX'&&fixed.authority.registry===null)||seen.has(scope.environment)||!Number.isSafeInteger(scope.version)||scope.version<1)throw unavailable();
  seen.add(scope.environment);
  const row=await rpc('common_premium_read_scope_v1',{p_owner:selection.ownerId,p_environment:scope.environment});
  if(!obj(row)||row.dirty!==false||versionNumber(row.version)!==scope.version||!obj(row.evidence))throw unavailable();
  const e=row.evidence,t=check(),decision=evaluateV2Evidence(e,selection.ownerId,scope.environment,t);
  if(!decision.writeCanonical||!Number.isFinite(e.validUntil)||e.validUntil<=t||e.validUntil>e.checkedAt+30000||
   (e.state==='active'&&(!Number.isFinite(e.providerValidUntil)||e.providerValidUntil<=t)))throw unavailable();
  evidence.push({state:e.state,checkedAt:e.checkedAt,expiresAt:Math.min(e.validUntil,e.checkedAt+30000,e.state==='active'?e.providerValidUntil:Infinity)});
 }
 // Active proof contains only the active sources that produced it. Inactive
 // proof requires complete checked scopes, never unknown/missing production.
 if(fixed.active?evidence.some(e=>e.state!=='active'):evidence.some(e=>e.state!=='inactive')||!seen.has('PRODUCTION')||Boolean(fixed.authority.registry)!==seen.has('SANDBOX'))throw unavailable();
 const checkedAt=Math.min(...evidence.map(e=>e.checkedAt)),expiresAt=Math.min(...evidence.map(e=>e.expiresAt),fixed.authority.registry?.expiresAt??Infinity);
 if(checkedAt!==fixed.checkedAt||expiresAt!==fixed.expiresAt)throw unavailable();
 await current();await registry();check();return fixed;
}
/** Sole runtime-facing adapters; no selector/key/RPC/provider callback while OFF. */
export function createInternalProviderRefresh(ports:InternalProviderPorts){
 return async(selection:ProviderSelection,deadline:number,signal:AbortSignal):Promise<ProviderProof>=>{
  if(!INTERNAL_PROVIDER_RELEASE_STATE.enabled)throw new Error('safety_review_required');
  return refreshServerSelectedProviderForReview(ports,selection,deadline,signal);
 };
}
export function createInternalProviderRevalidator(ports:InternalProviderPorts){
 return async(selection:ProviderSelection,proof:unknown,deadline:number,signal:AbortSignal):Promise<ProviderProof>=>{
  if(!INTERNAL_PROVIDER_RELEASE_STATE.enabled)throw new Error('safety_review_required');
  return revalidateServerSelectedProofForReview(ports,selection,proof,deadline,signal);
 };
}
