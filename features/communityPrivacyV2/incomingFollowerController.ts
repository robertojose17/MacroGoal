import { parseIncomingStatus, parseRemoval } from './incomingFollowerContract';
import type { IncomingFollowerStatus, RemoveFollowerInput } from './incomingFollowerContract';
import { boundedFollowerOperation, validFollowerScope } from './incomingFollowerTransport';
import type { FollowerScope, IncomingFollowerTransport } from './incomingFollowerTransport';
export type IncomingFollowerState = 'idle'|'loading'|'ready'|'confirming'|'removing'|'removed'|'unconfirmed'|'error'|'not_following';
export interface IncomingFollowerSnapshot {
 status: IncomingFollowerState;
 scopeKey: string | null;
 descriptor: IncomingFollowerStatus['follow_request'];
 confirmationKey: string | null;
 reconciledNotFollowing: boolean;
}
export function incomingFollowerScopeKey(scope: FollowerScope): string {
 return JSON.stringify([scope.session.userId,scope.session.sessionKey,scope.requesterId]);
}
let controllerSerial = 0;
/** Construct once per menu. Close/background/session/target changes call setScope(null).
 * No profile posts or outgoing follow state is read or changed by this controller. */
export function createIncomingFollowerController({transport,onInvalidate,isGlobalScopeCurrent,timeoutMs=10000}: {
 transport: IncomingFollowerTransport; onInvalidate?: () => void;
 isGlobalScopeCurrent?: (scope: FollowerScope) => boolean;
 timeoutMs?: number;
}) {
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>60000) throw new TypeError('Invalid follower timeout.');
 const instance = ++controllerSerial;
 let scope: FollowerScope|null=null, generation=0, serial=0, disposed=false;
 let active: AbortController|null=null;
 let mutationPending: { done: Promise<void>; finish(): void } | null = null;
 let captured: {key:string;generation:number;request:RemoveFollowerInput}|null=null;
 let snapshot: IncomingFollowerSnapshot=Object.freeze({status:'idle',scopeKey:null,descriptor:null,confirmationKey:null,reconciledNotFollowing:false});
 const listeners=new Set<()=>void>();
 function publish(status:IncomingFollowerState,extra:Partial<IncomingFollowerSnapshot>={}) {
  snapshot=Object.freeze({status,scopeKey:scope?incomingFollowerScopeKey(scope):null,descriptor:null,confirmationKey:null,reconciledNotFollowing:false,...extra});
  for(const listener of listeners) { try {listener();} catch { /* Consumer errors must not affect request settlement. */ } }
 }
 function notifyInvalidate(){try{onInvalidate?.();}catch{/* No external diagnostic propagation. */}}
 function clear(){generation++;active?.abort();active=null;captured=null;}
 function current(observed: FollowerScope,at:number){
  try{return !disposed && at===generation && !!scope && incomingFollowerScopeKey(scope)===incomingFollowerScopeKey(observed) && (!isGlobalScopeCurrent||isGlobalScopeCurrent(observed));}catch{return false;}
 }
 async function load(){
  if(disposed||!scope)return;
  if(mutationPending){
   // Preserve this explicit load request across an aborting old mutation. A later
   // close/scope/invalidation supersedes it; only the still-current request reads.
   const waitingScope=scope,waitingGeneration=generation,pending=mutationPending;
   await pending.done;
   if(current(waitingScope,waitingGeneration))await load();
   return;
  }
  clear(); const observed=scope,at=generation; const request=active=new AbortController();
  if(!current(observed,at)){publish('error');return;}
  publish('loading');
  const result=await boundedFollowerOperation(request.signal,timeoutMs,async(signal)=>transport.read({...observed,signal}));
  if(!current(observed,at))return;
  const value=result.ok?parseIncomingStatus(result.value,observed.session.userId,observed.requesterId):null;
  if(!value){publish('error');return;}
  publish(value.follow_request?'ready':'not_following',{descriptor:value.follow_request?Object.freeze({...value.follow_request}):null});
 }
 function invalidate(){if(disposed)return;clear();publish('idle');notifyInvalidate();}
 function setScope(next:FollowerScope|null){
  if(disposed)return;
  const frozen=next&&validFollowerScope(next)?Object.freeze({session:Object.freeze({...next.session}),requesterId:next.requesterId}):null;
  if((frozen?incomingFollowerScopeKey(frozen):null)===(scope?incomingFollowerScopeKey(scope):null))return;
  clear();scope=frozen;publish('idle');notifyInvalidate();
 }
 function beginConfirm():string|null {
  if(disposed||mutationPending||!scope||snapshot.status!=='ready'||!snapshot.descriptor||!current(scope,generation))return null;
  const key=`incoming-follower:${instance}:${generation}:${++serial}`;
  captured={key,generation,request:Object.freeze({p_requester_id:scope.requesterId,p_request_id:snapshot.descriptor.request_id,p_expected_revision:snapshot.descriptor.revision})};
  publish('confirming',{descriptor:snapshot.descriptor,confirmationKey:key});return key;
 }
 function cancelConfirm(){if(disposed||snapshot.status==='removing')return;invalidate();}
 async function remove(confirmationKey:string):Promise<void>{
  if(disposed||mutationPending||!scope||snapshot.status!=='confirming'||!captured||captured.key!==confirmationKey||captured.generation!==generation||!current(scope,generation))return;
  const observed=scope,confirmation=captured;clear();const at=generation,request=active=new AbortController();
  let release!: () => void;
  const ownMutation={done:new Promise<void>(resolve=>{release=resolve;}),finish:()=>release()};
  mutationPending=ownMutation;publish('removing');notifyInvalidate();
  try {
  let acknowledged=false;
  await boundedFollowerOperation(request.signal,timeoutMs,async(signal,live)=>{
   if(!current(observed,at))return {ok:false};
   let result;try{result=await transport.remove({...observed,signal,request:confirmation.request});}catch{result={ok:false} as const;}
   if(!live()||!current(observed,at))return {ok:false};
   acknowledged=result.ok&&!!parseRemoval(result.value,observed.session.userId,confirmation.request);
   publish(acknowledged?'removed':'unconfirmed');notifyInvalidate();
   // Read-only reconciliation. Never update the captured request or automatically retry.
   let read;try{read=await transport.read({...observed,signal});}catch{read={ok:false} as const;}
   if(!live()||!current(observed,at))return {ok:false};
   const value=read.ok?parseIncomingStatus(read.value,observed.session.userId,observed.requesterId):null;
   publish(acknowledged?'removed':'unconfirmed',{reconciledNotFollowing:!!value&&value.follow_request===null});
   return {ok:true,value:true};
  });
  if(current(observed,at)&&(snapshot as IncomingFollowerSnapshot).status==='removing'){publish('unconfirmed');notifyInvalidate();
   // The mutation deadline expired; a separate bounded read is safe, but cannot confirm causality.
   const read=await boundedFollowerOperation(request.signal,timeoutMs,async(signal)=>transport.read({...observed,signal}));
   if(current(observed,at)&&(snapshot as IncomingFollowerSnapshot).status==='unconfirmed'){
    const value=read.ok?parseIncomingStatus(read.value,observed.session.userId,observed.requesterId):null;
    publish('unconfirmed',{reconciledNotFollowing:!!value&&value.follow_request===null});
   }
  }
  } finally {
   // Retain the lock through timeout reconciliation. An old completion can never
   // release another operation's lock, including after scope/session changes.
   if(mutationPending===ownMutation)mutationPending=null;
   ownMutation.finish();
  }
 }
 return {getSnapshot:()=>snapshot,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},setScope,load,beginConfirm,cancelConfirm,remove,invalidate,
  dispose(){if(disposed)return;clear();scope=null;publish('idle');disposed=true;listeners.clear();notifyInvalidate();}};
}
export type IncomingFollowerController = ReturnType<typeof createIncomingFollowerController>;
