import { parseIncomingStatus, parseRemoval } from './incomingFollowerContract';
import type { IncomingFollowerStatus, RemoveFollowerInput, RemoveFollowerConfirmation } from './incomingFollowerContract';
export interface FollowerSession { userId: string; sessionKey: string }
export interface VerifiedFollowerSession extends FollowerSession { accessToken: string; expiresAtSeconds: number; isAnonymous: boolean }
export interface FollowerScope { session: FollowerSession; requesterId: string }
export type FollowerContext = FollowerScope & { signal: AbortSignal };
export type FollowerResult<T> = { ok: true; value: T } | { ok: false };
export interface IncomingFollowerTransport {
 read(input: FollowerContext): Promise<FollowerResult<IncomingFollowerStatus>>;
 remove(input: FollowerContext & { request: RemoveFollowerInput }): Promise<FollowerResult<RemoveFollowerConfirmation>>;
}
type RpcBuilder = PromiseLike<{ data: unknown; error: unknown }> & {
 setHeader(name: string, value: string): RpcBuilder;
 abortSignal(signal: AbortSignal): RpcBuilder;
};
export interface FollowerRpcClient { rpc(name: string, args: Record<string,string>, options: { get: false; head: false }): RpcBuilder }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validFollowerScope(scope: FollowerScope): boolean {
 return UUID.test(scope.session.userId) && !!scope.session.sessionKey && UUID.test(scope.requesterId) && scope.session.userId !== scope.requesterId;
}
/** Entire operation deadline, including auth/guard and response; abort is advisory. */
export function boundedFollowerOperation<T>(signal: AbortSignal, timeoutMs: number, run: (signal: AbortSignal, live: () => boolean) => Promise<FollowerResult<T>>): Promise<FollowerResult<T>> {
 return new Promise(resolve => {
  const request = new AbortController(); let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (value: FollowerResult<T>) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancel); resolve(value); };
  const cancel = () => { request.abort(); finish({ok:false}); };
  signal.addEventListener('abort', cancel, {once:true}); timer = setTimeout(cancel, timeoutMs);
  if (signal.aborted) cancel();
  void Promise.resolve().then(() => settled ? {ok:false} as const : run(request.signal, () => !settled)).then(finish, () => finish({ok:false}));
 });
}
/** Inert, ordinary SDK only. Bind getSession to the existing verified auth binding. */
export function createIncomingFollowerTransport({client,getSession,isGlobalScopeCurrent,timeoutMs=10000,now=Date.now}: {
 client: FollowerRpcClient; getSession(): Promise<VerifiedFollowerSession|null>;
 isGlobalScopeCurrent?: (scope: FollowerScope, signal: AbortSignal) => boolean | Promise<boolean>;
 timeoutMs?: number; now?: () => number;
}): IncomingFollowerTransport {
 if (!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>60000) throw new TypeError('Invalid follower timeout.');
 function valid(value: VerifiedFollowerSession|null, scope: FollowerScope): value is VerifiedFollowerSession {
  return !!value && value.userId.toLowerCase()===scope.session.userId && value.sessionKey===scope.session.sessionKey && value.isAnonymous===false &&
   typeof value.accessToken==='string' && !!value.accessToken && !/[\s\u0000-\u001f\u007f]/.test(value.accessToken) && Number.isFinite(value.expiresAtSeconds) && value.expiresAtSeconds*1000>now();
 }
 function execute<T>(input: FollowerContext,name:string,args:Record<string,string>,parse:(raw:unknown)=>T|null):Promise<FollowerResult<T>> {
  const scope: FollowerScope = Object.freeze({session:Object.freeze({...input.session}),requesterId:input.requesterId});
  const frozenArgs=Object.freeze({...args});
  if (!validFollowerScope(scope)) return Promise.resolve({ok:false});
  return boundedFollowerOperation<T>(input.signal,timeoutMs,async(signal,live):Promise<FollowerResult<T>>=>{
   const guard=async()=>live() && !signal.aborted && (!isGlobalScopeCurrent || await isGlobalScopeCurrent(scope,signal)) && live() && !signal.aborted;
   const first=await getSession(); if(!live()||!valid(first,scope)) return {ok:false};
   const started=Object.freeze({...first});
   if(!await guard()) return {ok:false};
   const before=await getSession(); if(!live()||!valid(before,scope)||started.expiresAtSeconds*1000<=now()) return {ok:false};
   const result=await client.rpc(name,{...frozenArgs},{get:false,head:false}).setHeader('Authorization',`Bearer ${started.accessToken}`).abortSignal(signal);
   if(!live()||result.error||!await guard()) return {ok:false};
   const current=await getSession(); if(!live()||!valid(current,scope)||started.expiresAtSeconds*1000<=now()) return {ok:false};
   const value=parse(result.data); return value===null?{ok:false}:{ok:true,value};
  });
 }
 return {
  read(input) { const owner=input.session.userId, requester=input.requesterId;
   return execute(input,'get_incoming_follower_status',{p_requester_id:requester},raw=>parseIncomingStatus(raw,owner,requester)); },
  remove(input) { const request={...input.request}; const owner=input.session.userId;
   // Validate the exact request independently before touching the SDK.
   if(request.p_requester_id!==input.requesterId || !parseIncomingStatus({ownerUserId:owner,requesterId:input.requesterId,follow_request:{request_id:request.p_request_id,revision:request.p_expected_revision,state:'accepted'}},owner,input.requesterId)) return Promise.resolve({ok:false});
   return execute(input,'remove_profile_follower',{p_requester_id:request.p_requester_id,p_request_id:request.p_request_id,p_expected_revision:request.p_expected_revision},raw=>parseRemoval(raw,owner,request));
  }
 };
}
