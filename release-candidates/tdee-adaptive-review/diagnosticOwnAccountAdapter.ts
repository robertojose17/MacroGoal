/** Existing own-auth read RPC only. No service client, credentials, provider refresh or writes. */
import {evaluateDiagnosticHold,type BoundDiagnosticHold} from './diagnosticHoldRuntime.ts';
import {matchesKnownScope,type FollowupPorts} from './diagnosticFollowupController.ts';
export const DIAGNOSTIC_OWN_READ_RELEASE=Object.freeze({enabled:false} as const);
export const DIAGNOSTIC_OWN_READ_RPC='tdee_read_review_context_v1';
type Result={data:unknown;error:unknown};
type AuthResult={data:{user:{id:string;is_anonymous?:boolean}|null}|null;error:unknown};
export type SignedInReadClient={auth:{getUser():Promise<AuthResult>};rpc(name:string):{abortSignal(signal:AbortSignal):PromiseLike<Result>}};
export type OwnReadPorts={client:SignedInReadClient;now():number;previous():BoundDiagnosticHold|null};
const fail=()=>{throw new Error('diagnostic_own_context_unavailable');};
function adapter(p:OwnReadPorts,enabled:boolean):FollowupPorts['load']{return async(context,signal)=>{
 if(!enabled)throw new Error('diagnostic_own_read_off');
 const expected=structuredClone(context);
 const check=()=>{if(signal.aborted)fail();};
 check();const before=await p.client.auth.getUser();check();
 if(before.error||!before.data?.user||before.data.user.id!==expected.actor||before.data.user.is_anonymous===true)fail();
 // No actor/body parameters. The installed RPC obtains auth.uid() itself.
 const result=await p.client.rpc(DIAGNOSTIC_OWN_READ_RPC).abortSignal(signal);check();
 if(result.error)fail();
 const after=await p.client.auth.getUser();check();
 if(after.error||!after.data?.user||after.data.user.id!==expected.actor||after.data.user.is_anonymous===true)fail();
 const previous=structuredClone(p.previous()),snapshot=structuredClone(result.data);
 const diagnostic=evaluateDiagnosticHold(snapshot,expected.actor,p.now(),previous);check();
 if(diagnostic.kind!=='diagnostic_hold'||!matchesKnownScope(diagnostic.proposedHold.scope,expected.scope))fail();
 return {snapshot,actor:expected.actor,previous};
};}
export function createOwnDiagnosticLoader(p:OwnReadPorts):FollowupPorts['load']{return adapter(p,DIAGNOSTIC_OWN_READ_RELEASE.enabled);}
/** Explicit offline seam; never mounted by this candidate. */
export function createOwnDiagnosticLoaderForReview(p:OwnReadPorts):FollowupPorts['load']{return adapter(p,true);}
