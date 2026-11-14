import {createRCV2Reader} from './rc-v2-adapter.mjs';
import {evaluateV2Evidence} from './v2-evidence.mjs';
// Dependency-injected server authority. No caller-provided actor, environment or evidence.
export function createCommonPremiumAuthority({authenticate,resolveServerContext,readCache,compareAndSet,readVersion,getExistingKey,projectId,request=fetch,now=Date.now,cacheMs=30000}) {
 if(!Number.isInteger(cacheMs)||cacheMs<1||cacheMs>30000)throw Error('invalid_cache_window');
 const official=createRCV2Reader({projectId,now,getJSON:async(url,init)=>{
  const key=getExistingKey();if(!key)return {status:503};
  try{const r=await request(url,{...init,headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:AbortSignal.timeout(4000)});return {status:r.status,body:r.status===200?await r.json():null};}catch{return {status:503};}
 }});
 function usable(record,actor,environment){
  if(!record||record.dirty||!Number.isInteger(record.version)||record.version<0)return null;
  const e=record.evidence;
  if(!e||now()-e.checkedAt>=cacheMs)return null;
  if(!Number.isFinite(e.validUntil)||e.validUntil<=now()||e.validUntil>e.checkedAt+cacheMs)return null;
  if(e.state==='active'&&(!Number.isFinite(e.providerValidUntil)||e.providerValidUntil<=now()))return null;
  const result=evaluateV2Evidence(e,actor,environment,now());
  return result.writeCanonical?{state:result.state,source:'confirmed_cache',checkedAt:e.checkedAt,validUntil:Math.min(e.validUntil,e.checkedAt+cacheMs,e.state==='active'?e.providerValidUntil:Infinity)}:null;
 }
 async function scope(actor,environment){
  let baseline;try{baseline=await readVersion(actor,environment);}catch{return {state:'unknown',source:'unavailable'};}
  if(!Number.isInteger(baseline)||baseline<0)return {state:'unknown',source:'unavailable'};
  let evidence;try{evidence=await official({actor,environment});}catch{/* no raw errors or URLs returned */}
  const decision=evaluateV2Evidence(evidence,actor,environment,now());
  if(decision.writeCanonical){
   try{
    const accepted=await compareAndSet({actor,environment,expectedVersion:baseline,evidence});
    if(accepted!==true)return {state:'unknown',source:'concurrent_change'};
    const fresh=usable(await readCache(actor,environment),actor,environment);
    return fresh?{...fresh,source:'official'}:{state:'unknown',source:'concurrent_change'};
   }catch{return {state:'unknown',source:'unavailable'};}
  }
  // Failed provider read never renews checkedAt/validUntil. Dirty invalidations
  // and changed versions cannot resurrect a prior actor/transfer's entitlement.
  try{const record=await readCache(actor,environment);if(record?.version!==baseline)return {state:'unknown',source:'concurrent_change'};return usable(record,actor,environment)??{state:'unknown',source:'unavailable'};}catch{return {state:'unknown',source:'unavailable'};}
 }
 return async function authorize(authorization){
  let user;try{user=await authenticate(authorization);}catch{}
  if(!user||typeof user.id!=='string'||!user.id||user.isAnonymous!==false)return {access:'unknown',reason:'authentication_required'};
  const actor=user.id;let context;try{context=await resolveServerContext({actor,authorization});}catch{}
  // Production is mandatory. Sandbox may contribute only with server-held
  // explicit protected test-account registry binding, never app headers/body or user_type.
  if(context?.actor!==actor||context.production!==true||typeof context.sandboxAllowed!=='boolean')return {access:'unknown',reason:'context_unavailable'};
  if(context.sandboxAllowed&&(context.sandboxProof?.actor!==actor||context.sandboxProof?.kind!=='server_verified_test_account_registry'||typeof context.sandboxProof?.registryVersion!=='string'||!(/^[1-9][0-9]*$/).test(context.sandboxProof.registryVersion)||!Number.isFinite(context.sandboxProof?.expiresAt)||context.sandboxProof.expiresAt<=now()))return {access:'unknown',reason:'context_unavailable'};
  const environments=context.sandboxAllowed?['PRODUCTION','SANDBOX']:['PRODUCTION'];
  const results=await Promise.all(environments.map(env=>scope(actor,env)));
  let after;try{after=await authenticate(authorization);}catch{}
  if(after?.id!==actor||after.isAnonymous!==false)return {access:'unknown',reason:'authentication_changed'};
  let latest;try{latest=await resolveServerContext({actor,authorization});}catch{}
  if(latest?.actor!==actor||latest.production!==true||latest.sandboxAllowed!==context.sandboxAllowed||context.sandboxAllowed&&(latest.sandboxProof?.kind!=='server_verified_test_account_registry'||latest.sandboxProof.actor!==actor||latest.sandboxProof.registryVersion!==context.sandboxProof.registryVersion||latest.sandboxProof.expiresAt!==context.sandboxProof.expiresAt||latest.sandboxProof.expiresAt<=now())){
   // Registry changes cannot erase an independently verified production right.
   if(results[0]?.state!=='active')return {access:'unknown',reason:'context_changed'};
   context={actor,production:true,sandboxAllowed:false};results.splice(1);environments.splice(1);
  }
  const envelope={version:'premium-authority-v1',ownerId:actor,policyContext:context.sandboxAllowed?'test_account':'production',evaluatedEnvironments:environments};
  const active=results.filter(r=>r.state==='active');
  if(active.length)return {...envelope,checkedAt:Math.min(...active.map(r=>r.checkedAt)),access:'premium',reason:'verified_entitlement',validUntil:Math.min(...active.map(r=>r.validUntil),context.sandboxAllowed?context.sandboxProof.expiresAt:Infinity),sources:active.map(r=>r.source)};
  if(results.every(r=>r.state==='inactive'))return {...envelope,checkedAt:Math.min(...results.map(r=>r.checkedAt)),access:'free',reason:'verified_no_entitlement',validUntil:Math.min(...results.map(r=>r.validUntil),context.sandboxAllowed?context.sandboxProof.expiresAt:Infinity)};
  return {...envelope,access:'unknown',reason:'entitlement_unavailable'};
 };
}
