import { parseAuthorityDecision, type Decision } from './authorityClient';
type Session={user:{id:string};access_token:string};
export type ShadowDependencies={endpoint:string;apiKey:string;expectedOwner:string;getSession:()=>Promise<{data:{session:Session|null};error?:unknown}>;request:typeof fetch;signal:AbortSignal;isCurrent:()=>boolean;now?:()=>number};
/** Authenticated read-only comparison; never writes profile, SDK state or an access gate. */
export async function readShadowAuthority(d:ShadowDependencies):Promise<Decision>{
 const current=()=>!d.signal.aborted&&d.isCurrent();
 if(!current())throw Error('stale_shadow_request');
 const before=await d.getSession();
 if(before.error||!before.data.session||before.data.session.user.id!==d.expectedOwner||!current())throw Error('shadow_auth_required');
 const response=await d.request(d.endpoint,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+before.data.session.access_token,apikey:d.apiKey},signal:d.signal,cache:'no-store'});
 if(!response.ok||!current())throw Error('shadow_unavailable');
 const raw:unknown=await response.json();
 const after=await d.getSession();
 if(after.error||after.data.session?.user.id!==d.expectedOwner||!current())throw Error('stale_shadow_request');
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('invalid_shadow_response');
 const r=raw as Record<string,unknown>;
 if(r.mode!=='shadow'||r.enforced!==false||!['production','test_account'].includes(String(r.policyContext)))throw Error('invalid_shadow_mode');
 // Context is returned by the authenticated server; never supplied in the request.
 const decision=parseAuthorityDecision(r,{ownerId:d.expectedOwner,policyContext:r.policyContext as 'production'|'test_account'},(d.now??Date.now)(),30000);
 console.info('[PremiumAuthority] shadow:',decision.access);
 return decision;
}
