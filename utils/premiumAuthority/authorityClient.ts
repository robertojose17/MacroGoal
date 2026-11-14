/** Comparative diagnostics only. Never changes application access. */
export type Scope = Readonly<{ownerId:string;policyContext:'production'|'test_account'}>;
export type Decision = Scope & {version:'premium-authority-v1';access:'premium'|'free'|'unknown';reason:string;checkedAt?:number;evaluatedEnvironments:readonly ('PRODUCTION'|'SANDBOX')[];validUntil?:number};
export type Observation = {status:'premium'|'free'|'unavailable';degraded:boolean;confirmedPremium:boolean;reason:string;validUntil:number|null};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const same=(a:Scope|null,b:Scope)=>!!a&&a.ownerId===b.ownerId&&a.policyContext===b.policyContext;
const unavailable=(reason:string):Observation=>({status:'unavailable',degraded:true,confirmedPremium:false,reason,validUntil:null});
export function parseAuthorityDecision(value:unknown,scope:Scope,now:number,maxAgeMs:number):Decision {
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(maxAgeMs)||(maxAgeMs<=0||maxAgeMs>30000)||!object(value)||value.version!=='premium-authority-v1'||!uuid(scope.ownerId)||
    value.ownerId!==scope.ownerId||value.policyContext!==scope.policyContext||!['production','test_account'].includes(scope.policyContext)||
    !['premium','free','unknown'].includes(String(value.access))||typeof value.reason!=='string'||!value.reason||value.reason.length>200||
    ((value.access!=='unknown'||value.checkedAt!==undefined)&&(!Number.isSafeInteger(value.checkedAt)||(value.checkedAt as number)>now||(value.checkedAt as number)<now-maxAgeMs)))throw Error('invalid_authority_decision');
 const environments=scope.policyContext==='production'?['PRODUCTION']:['PRODUCTION','SANDBOX'];
 if(JSON.stringify(value.evaluatedEnvironments)!==JSON.stringify(environments))throw Error('invalid_authority_environments');
 if(value.access==='unknown'&&value.checkedAt===undefined)return {version:'premium-authority-v1',...scope,access:'unknown',reason:value.reason,evaluatedEnvironments:environments as ('PRODUCTION'|'SANDBOX')[]};
 const expires=value.validUntil;
 if((value.access!=='unknown'||value.checkedAt!==undefined)&&(!Number.isSafeInteger(expires)||(expires as number)<=now||(expires as number)<=(value.checkedAt as number)))throw Error('expired_authority_decision');
 if(expires!==undefined&&(!Number.isSafeInteger(expires)||(expires as number)<=(value.checkedAt as number)))throw Error('invalid_authority_expiry');
 return {version:'premium-authority-v1',...scope,access:value.access as Decision['access'],reason:value.reason,evaluatedEnvironments:environments as ('PRODUCTION'|'SANDBOX')[],checkedAt:value.checkedAt as number,...(expires===undefined?{}:{validUntil:expires as number})};
}
/** maxAgeMs is a required reviewed engineering budget, not an entitlement extension.
 * scope.policyContext must come from verified server distribution context, never a UI toggle.
 * transport must call authenticated server authority; SDK/profile payloads are not valid sources.
 */
export function createAuthorityObserver(maxAgeMs:number,now:()=>number=Date.now){
 if(!Number.isSafeInteger(maxAgeMs)||(maxAgeMs<=0||maxAgeMs>30000))throw Error('invalid_cache_policy');
 let scope:Scope|null=null,generation=0,sequence=0,last:Decision|null=null,observedAt=0;
 function bind(next:Scope|null){
  if(next&&(!uuid(next.ownerId)||!['production','test_account'].includes(next.policyContext)))throw Error('invalid_authority_scope');
  if(!next||!same(scope,next)){generation++;sequence++;last=null;observedAt=0;scope=next?Object.freeze({...next}):null;}
 }
 function fallback(reason:string):Observation {
  const time=now();
  if(last&&scope&&same(last,scope)&&last.access==='premium'&&Number.isSafeInteger(time)&&time>=observedAt&&time>=last.checkedAt!&&time<Math.min(last.validUntil!,last.checkedAt!+maxAgeMs))
   return {status:'unavailable',degraded:true,confirmedPremium:true,reason,validUntil:Math.min(last.validUntil!,last.checkedAt!+maxAgeMs)};
  return unavailable(reason);
 }
 async function observe(read:(scope:Scope)=>Promise<unknown>):Promise<Observation>{
  if(!scope)return unavailable('signed_out');
  const captured=scope,rev=generation,ticket=++sequence;
  try{
   const raw=await read(captured);
   if(rev!==generation||ticket!==sequence||!same(scope,captured))return unavailable('stale_response');
   const time=now(),decision=parseAuthorityDecision(raw,captured,time,maxAgeMs);
   if(last&&decision.checkedAt!<last.checkedAt!)return fallback('outdated_response');
   if(decision.access==='unknown')return fallback(decision.reason);
   last=decision;observedAt=time;
   return {status:decision.access,degraded:false,confirmedPremium:decision.access==='premium',reason:decision.reason,validUntil:Math.min(decision.validUntil!,decision.checkedAt!+maxAgeMs)};
  }catch{
   if(rev!==generation||ticket!==sequence||!same(scope,captured))return unavailable('stale_response');
   return fallback('authority_unavailable');
  }
 }
 return {bind,observe,invalidate(){generation++;sequence++;last=null;observedAt=0;}};
}
