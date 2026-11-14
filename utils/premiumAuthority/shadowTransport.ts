import { parseAuthorityDecision, type Decision } from './authorityClient';
type Session={user:{id:string};access_token:string};
export type ShadowDependencies={endpoint:string;apiKey:string;expectedOwner:string;getSession:()=>Promise<{data:{session:Session|null};error?:unknown}>;request:typeof fetch;signal:AbortSignal;isCurrent:()=>boolean;now?:()=>number};
type FailureCategory='authentication_required'|'transport_or_http'|'invalid_contract'|'stale_or_cancelled'|'unknown';
type FailureCode='session_before_failed'|'session_after_failed'|'session_before_cancelled'|'session_after_cancelled'|'fetch_type_error'|'fetch_failed'|'fetch_cancelled'|'http_response'|'json_parse_failed'|'json_parse_cancelled'|'contract_invalid'|'cancelled'|'unknown';
type FailureDiagnostic={category:FailureCategory;code:FailureCode;status?:number};
const failures=new WeakMap<Error,FailureDiagnostic>();
function failure(code:FailureCode,category:FailureCategory,status?:number):Error{
 const error=Error(category==='stale_or_cancelled'?'stale_shadow_request':code);
 failures.set(error,{category,code,...(Number.isInteger(status)&&status!>=100&&status!<=599?{status}:{} )});return error;
}
// Session reads cannot be cancelled in Supabase. Share the unresolved read per stable
// reader while allowing each observer to stop waiting; never queue another locked read.
type SessionResult=Awaited<ReturnType<ShadowDependencies['getSession']>>;
type SessionWaiter=(value:SessionResult|null,error?:unknown)=>void;
const pendingSessions=new WeakMap<ShadowDependencies['getSession'],Set<SessionWaiter>>();
function sessionUntilAborted(d:ShadowDependencies):ReturnType<ShadowDependencies['getSession']>{
 if(d.signal.aborted)return Promise.reject(Error('stale_shadow_request'));
 let waiters=pendingSessions.get(d.getSession);
 if(!waiters){
  waiters=new Set<SessionWaiter>();pendingSessions.set(d.getSession,waiters);
  const captured=waiters;
  const finish=(value:SessionResult|null,error?:unknown)=>{
   if(pendingSessions.get(d.getSession)===captured)pendingSessions.delete(d.getSession);
   for(const notify of [...captured])notify(value,error);captured.clear();
  };
  void Promise.resolve().then(()=>d.getSession()).then(value=>finish(value),error=>finish(null,error));
 }
 const subscribers=waiters;
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{subscribers.delete(notify);d.signal.removeEventListener('abort',aborted);};
  const aborted=()=>{cleanup();reject(Error('stale_shadow_request'));};
  const notify:SessionWaiter=(value,error)=>{cleanup();if(d.signal.aborted)reject(Error('stale_shadow_request'));else if(value===null)reject(error);else resolve(value);};
  subscribers.add(notify);d.signal.addEventListener('abort',aborted,{once:true});
  if(d.signal.aborted)aborted();
 });
}
/** Authenticated read-only comparison; never writes profile, SDK state or an access gate. */
export async function readShadowAuthority(d:ShadowDependencies):Promise<Decision>{
 const current=()=>!d.signal.aborted&&d.isCurrent();
 if(!current())throw Error('stale_shadow_request');
 let before:SessionResult;
 try{before=await sessionUntilAborted(d);}catch{throw failure(d.signal.aborted?'session_before_cancelled':'session_before_failed',d.signal.aborted?'stale_or_cancelled':'authentication_required');}
 if(before.error||!before.data.session||before.data.session.user.id!==d.expectedOwner||!current())throw failure('session_before_failed','authentication_required');
 let response:Response;
 try{response=await d.request(d.endpoint,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+before.data.session.access_token,apikey:d.apiKey},signal:d.signal,cache:'no-store'});}catch(error){throw failure(d.signal.aborted?'fetch_cancelled':error instanceof TypeError?'fetch_type_error':'fetch_failed',d.signal.aborted?'stale_or_cancelled':'transport_or_http');}
 if(!current())throw failure('cancelled','stale_or_cancelled');
 if(!response.ok)throw failure('http_response','transport_or_http',response.status);
 let raw:unknown;
 try{raw=await response.json();}catch{throw failure(d.signal.aborted?'json_parse_cancelled':'json_parse_failed',d.signal.aborted?'stale_or_cancelled':'invalid_contract');}
 let after:SessionResult;
 try{after=await sessionUntilAborted(d);}catch{throw failure(d.signal.aborted?'session_after_cancelled':'session_after_failed',d.signal.aborted?'stale_or_cancelled':'authentication_required');}
 if(after.error)throw failure('session_after_failed','authentication_required');
 if(after.data.session?.user.id!==d.expectedOwner||!current())throw failure('cancelled','stale_or_cancelled');
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw failure('contract_invalid','invalid_contract');
 const r=raw as Record<string,unknown>;
 if(r.mode!=='shadow'||r.enforced!==false||!['production','test_account'].includes(String(r.policyContext)))throw failure('contract_invalid','invalid_contract');
 // Context is returned by the authenticated server; never supplied in the request.
 let decision:Decision;
 try{decision=parseAuthorityDecision(r,{ownerId:d.expectedOwner,policyContext:r.policyContext as 'production'|'test_account'},(d.now??Date.now)(),30000);}catch{throw failure('contract_invalid','invalid_contract');}
 console.info('[PremiumAuthority] shadow:',decision.access);
 return decision;
}

/** Coarse diagnostics only. Never return an exception message or request/account data. */
export function shadowFailureCategory(error:unknown):'authentication_required'|'transport_or_http'|'invalid_contract'|'stale_or_cancelled'|'unknown'{
 const known=error instanceof Error?failures.get(error):undefined;
 if(known)return known.category;
 const message=error instanceof Error?error.message:'';
 if(message==='shadow_auth_required')return 'authentication_required';
 if(message==='shadow_unavailable')return 'transport_or_http';
 if(['invalid_shadow_response','invalid_shadow_mode','invalid_authority_decision','expired_authority_decision','invalid_authority_environments','invalid_authority_expiry'].includes(message))return 'invalid_contract';
 if(['stale_shadow_request','stale_shadow_response','shadow_throttled','shadow_pending','shadow_clock_changed'].includes(message)||error instanceof Error&&error.name==='AbortError')return 'stale_or_cancelled';
 if(error instanceof TypeError)return 'transport_or_http';
 return 'unknown';
}

/** Returned fields are constructed internally; raw errors are never copied to logs. */
export function shadowFailureDiagnostic(error:unknown):FailureDiagnostic{
 const known=error instanceof Error?failures.get(error):undefined;
 return known?{...known}:{category:shadowFailureCategory(error),code:'unknown'};
}
