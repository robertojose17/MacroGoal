/** Internal background transport, never a user/foreground request adapter.
 * Existing deployment environment supplies SUPABASE_SERVICE_ROLE_KEY in closure.
 * No secrets are read here, no credentials minted, no decoded JWT claim trusted. */
export const INTERNAL_DAILY_WORKER_RELEASE=Object.freeze({enabled:true} as const);
export const INTERNAL_DAILY_WORKER_LIMITS=Object.freeze({maxOwners:25,maxRunMs:5000,maxBodyBytes:256,providerProofMaxAgeMs:30000} as const);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export type WorkerSelection={ownerId:string;contextRevision:string};
/** Opaque exact-token validation. A service_role JWT payload alone proves nothing.
 * One Bearer transport only; no apikey/x-service-key fallback or user token. */
export async function isInternalWorkerAuthorized(authorization:string|null,serverServiceKey:string|undefined):Promise<boolean>{
 if(typeof serverServiceKey!=='string'||serverServiceKey.length<32||serverServiceKey.length>8192||/\s/.test(serverServiceKey)||
 typeof authorization!=='string'||authorization.length>8200||!authorization.startsWith('Bearer '))return false;
 const provided=authorization.slice(7);if(!provided||/\s/.test(provided))return false;
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(provided)),crypto.subtle.digest('SHA-256',encoder.encode(serverServiceKey))]);
 const x=new Uint8Array(a),y=new Uint8Array(b);let mismatch=0;for(let i=0;i<x.length;i++)mismatch|=x[i]^y[i];return mismatch===0;
}
/** Request cannot choose actors, cursor, limits, environments, approvals or keys. */
export function validWorkerEnvelope(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;return Object.keys(v).length===1&&v.version==='internal-daily-worker-v1';
}
/** Selection comes exclusively from trusted server query, never request JSON. */
export function validateWorkerSelection(value:unknown):value is WorkerSelection[]{
 if(!Array.isArray(value)||value.length>INTERNAL_DAILY_WORKER_LIMITS.maxOwners)return false;
 const owners=new Set<string>();
 for(const item of value){
  if(!item||typeof item!=='object'||Object.keys(item).length!==2||!uuid(item.ownerId)||!digest(item.contextRevision)||owners.has(item.ownerId.toLowerCase()))return false;
  owners.add(item.ownerId.toLowerCase());
 }
 return true;
}
export type InternalProviderProof={ownerId:string;contextRevision:string;checkedAt:number;expiresAt:number;active:boolean;revoked:boolean};
export function freshInternalProof(proof:InternalProviderProof,selection:WorkerSelection,now:number):boolean{
 return !!proof&&Number.isSafeInteger(now)&&now>=0&&proof.ownerId===selection.ownerId&&proof.contextRevision===selection.contextRevision&&
 proof.active===true&&proof.revoked===false&&Number.isSafeInteger(proof.checkedAt)&&Number.isSafeInteger(proof.expiresAt)&&
 proof.checkedAt>=0&&proof.checkedAt<=now&&proof.expiresAt>now&&proof.expiresAt<=proof.checkedAt+INTERNAL_DAILY_WORKER_LIMITS.providerProofMaxAgeMs&&
 now-proof.checkedAt<=INTERNAL_DAILY_WORKER_LIMITS.providerProofMaxAgeMs;
}
export interface InternalDailyWorkerPorts{
 // Existing trusted server-only selector. Must filter consent, current scope and
 // active registry; bound query and leases; no actor supplied by HTTP request.
 selectDueOwners(limit:number,deadline:number,signal:AbortSignal):Promise<WorkerSelection[]>;
 // Internal shared provider reader + revocation check. No auth.uid impersonation,
 // fake JWT, TTL extension, cached unverified entitlement or administrative review.
 refreshProviderProof(selection:WorkerSelection,deadline:number,signal:AbortSignal):Promise<InternalProviderProof>;
 // Must use durable scheduler CAS and reload current context/authority immediately
 // before evaluation. Proof is a prerequisite, never acceptance/policy permission.
 runOwnAssessment(selection:WorkerSelection,proof:InternalProviderProof,deadline:number,signal:AbortSignal):Promise<'completed'|'skipped'|'reconcile'>;
 now():number;
}
async function envelope(request:Request):Promise<unknown>{
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!request.body)throw Error('invalid_body');
 const reader=request.body.getReader();let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>INTERNAL_DAILY_WORKER_LIMITS.maxBodyBytes)throw Error('body_too_large');text+=decoder.decode(part.value,{stream:true});}
 text+=decoder.decode();return JSON.parse(text);
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
const response=(status:number,result:string,counts?:{completed:number;skipped:number;reconcile:number})=>new Response(JSON.stringify({version:'internal-daily-worker-v1',result,...(counts?{counts}:{})}),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
/** Immutable OFF guard precedes auth hashing, request body reads and all ports.
 * Existing privileged credential is passed at server bootstrap, NEVER from HTTP. */
export function createInternalDailyWorker(serverConfig:Readonly<{serviceRoleKey?:string}>,ports:InternalDailyWorkerPorts){
 const serviceRoleKey=serverConfig.serviceRoleKey;
 return async(request:Request):Promise<Response>=>{
  if(!INTERNAL_DAILY_WORKER_RELEASE.enabled)return response(503,'disabled');
  if(request.method!=='POST')return response(405,'method_not_allowed');
  if(new URL(request.url).search)return response(400,'query_not_allowed');
  if(!await isInternalWorkerAuthorized(request.headers.get('authorization'),serviceRoleKey))return response(401,'unauthorized');
  try{if(!validWorkerEnvelope(await envelope(request)))return response(400,'invalid_request');}catch{return response(400,'invalid_request');}
  let start:number;try{start=ports.now();}catch{return response(503,'clock_unavailable');}
  if(!Number.isSafeInteger(start)||start<0)return response(503,'clock_unavailable');
  const deadline=start+INTERNAL_DAILY_WORKER_LIMITS.maxRunMs,abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),INTERNAL_DAILY_WORKER_LIMITS.maxRunMs);
  const counts={completed:0,skipped:0,reconcile:0};
  let previous=start;
  const withinBudget=()=>{const n=ports.now();if(!Number.isSafeInteger(n)||n<previous||n>=deadline||abort.signal.aborted)return false;previous=n;return true;};
  try{
   const batch=await ports.selectDueOwners(INTERNAL_DAILY_WORKER_LIMITS.maxOwners,deadline,abort.signal);
   if(!validateWorkerSelection(batch))return response(503,'invalid_server_selection');
   for(const selection of batch){
    if(!withinBudget())return response(503,'budget_exhausted',counts);
    const proof=await ports.refreshProviderProof(selection,deadline,abort.signal);
    if(!withinBudget())return response(503,'budget_exhausted',counts);
    if(!freshInternalProof(proof,selection,previous)){counts.skipped++;continue;}
    const result=await ports.runOwnAssessment(selection,proof,deadline,abort.signal);
    if(!['completed','skipped','reconcile'].includes(result))return response(503,'unknown_assessment_outcome',counts);
    counts[result]++;
    if(!withinBudget())return response(503,'budget_exhausted',counts);
   }
   return response(200,'batch_finished',counts);
  }catch{return response(503,'reconciliation_required',counts);}
  finally{clearTimeout(timer);abort.abort();}
 };
}
