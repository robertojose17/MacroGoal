/** OFF source candidate. Own-bearer acceptance, never service-role or request evidence. */
import {ADAPTIVE_RELEASE_STATE} from './proposal.ts';
import {parseAdaptiveRequest,validReceipt,type AdaptiveRequest,type AdaptiveReceipt} from './apiContract.ts';
import {createTdeeAccessRefresh} from '../../supabase/functions/observed-snapshot-release/functions/observed-program/tdee-access-refresh.mjs';
import type {SnapshotSupabaseConfig} from './snapshotSupabaseAdapter.ts';
export const SNAPSHOT_ACCEPT_MODE='adaptive-accept-v1';
type Failure={reason:string;receipt:null;mayHaveWritten:boolean};
type Outcome=Failure|{receipt:AdaptiveReceipt;reason:'receipt';mayHaveWritten:false};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const bearer=(v:unknown):v is string=>typeof v==='string'&&v.length<=16384&&/^Bearer [^\s]+$/.test(v);
const failure=(reason:string,mayHaveWritten=false):Failure=>({reason,receipt:null,mayHaveWritten});
export interface SnapshotAcceptPorts{
 authenticate(token:string):Promise<string|null>;
 receipt(token:string,request:AdaptiveRequest):Promise<unknown>;
 prepare(token:string,actor:string):Promise<void>;
 accept(token:string,request:AdaptiveRequest):Promise<unknown>;
}
function safeReceipt(value:unknown,request:AdaptiveRequest):AdaptiveReceipt{
 if(!validReceipt(value,request))throw Error('source_error');
 if(value.status==='not_found')return {version:'adaptive-receipt-v1',status:'not_found'};
 if(value.status==='rejected')return {version:'adaptive-receipt-v1',status:'rejected',request:{...request},reason:value.reason};
 return {version:'adaptive-receipt-v1',status:'committed',request:{...request},
 acceptedGoal:{id:value.acceptedGoal.id,updatedAt:value.acceptedGoal.updatedAt},goalState:value.goalState};
}
/** No mutable enabling dependency. OFF prevents authentication, reads and preflight. */
export function createSnapshotAcceptRuntime(ports:SnapshotAcceptPorts){
 return async(value:unknown):Promise<Outcome>=>{
  if(!object(value)||Object.keys(value).sort().join(',')!=='authorization,request'||!bearer(value.authorization)||
   !object(value.request)||typeof value.request.ownerId!=='string')return failure('invalid_request');
  const request=parseAdaptiveRequest(value.request,value.request.ownerId);
  if(!request)return failure('invalid_request');
  if(!ADAPTIVE_RELEASE_STATE.recommendationsEnabled||!ADAPTIVE_RELEASE_STATE.acceptanceEnabled)return failure('safety_review_required');
  const token=value.authorization.slice(7);
  let accepting=false;
  try{
   const actor=await ports.authenticate(token);
   if(!actor)return failure('authentication_required');
   if(actor!==request.ownerId)return failure('account_changed');
   const prior=safeReceipt(await ports.receipt(token,request),request);
   if(prior.status!=='not_found')return {reason:'receipt',receipt:prior,mayHaveWritten:false};
   // Only a genuinely missing receipt crosses the existing scoped authority refresh.
   await ports.prepare(token,actor);
   accepting=true;
   const result=safeReceipt(await ports.accept(token,request),request);
   if(result.status==='not_found')return failure('reconciliation_required',true);
   return {reason:'receipt',receipt:result,mayHaveWritten:false};
  }catch{return failure(accepting?'reconciliation_required':'source_error',accepting);}
 };
}
export type SnapshotAcceptConfig=Omit<SnapshotSupabaseConfig,'serviceKey'> & {fetch?:typeof globalThis.fetch};
/** Fixed RPC names, copied server configuration and own bearer only. No token persistence. */
export function createSnapshotAcceptPorts(config:SnapshotAcceptConfig):SnapshotAcceptPorts{
 const {url,anonKey,createClient}=config,fetchAuthority=config.fetch??globalThis.fetch;
 if(typeof url!=='string'||!url.startsWith('https://')||typeof anonKey!=='string'||!anonKey||typeof createClient!=='function')
  throw Error('server_configuration_required');
 const own=(token:string)=>{
  if(typeof token!=='string'||!bearer('Bearer '+token))throw Error('source_error');
  return createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+token}}});
 };
 const rpc=async(token:string,name:string,args?:Record<string,unknown>)=>{
  const result=await own(token).rpc(name,args===undefined?undefined:structuredClone(args));
  if(result.error)throw Error('source_error');
  return structuredClone(result.data);
 };
 return {
  async authenticate(token){const r=await own(token).auth.getUser(token);return r.error||!r.data?.user?null:r.data.user.id;},
  receipt:(token,request)=>rpc(token,'tdee_read_snapshot_receipt_v1',{p_request:request}),
  accept:(token,request)=>rpc(token,'tdee_accept_snapshot_proposal_v1',{p_request:request}),
  async prepare(token,actor){
   const refresh=createTdeeAccessRefresh({
    readContext:async()=>{
     const data=await rpc(token,'observed_get_dynamic_tdee_context_v1');
     if(!object(data)||data.ownerId!==actor)throw Error('source_error');
     return data;
    },
    refreshAuthority:async(authorization:string)=>{
     if(typeof fetchAuthority!=='function')throw Error('source_error');
     const response=await fetchAuthority(url+'/functions/v1/common-premium-authority',{
      method:'GET',headers:{Authorization:authorization,apikey:anonKey},signal:AbortSignal.timeout(30000)});
     if(!response.ok)throw Error('source_error');
     return response.json();
    }
   });
   await refresh('Bearer '+token);
  }
 };
}
export function createSnapshotAcceptSupabaseRuntime(config:SnapshotAcceptConfig){
 return createSnapshotAcceptRuntime(createSnapshotAcceptPorts(config));
}
type Runtime=(value:unknown)=>Promise<Outcome>;
/** Body is the four-field identity itself, not {action,request} or {p_request}. */
export function createSnapshotAcceptHttpHandler(runtime:Runtime,allowedOrigins:readonly string[]){
 const origins=new Set(allowedOrigins);
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('Origin');
  const headers=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Origin','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'});
  if(origin&&origins.has(origin))headers.set('Access-Control-Allow-Origin',origin);
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  const fail=(status:number,reason:string,mayHaveWritten=false)=>reply(status,failure(reason,mayHaveWritten));
  if(origin&&!origins.has(origin))return fail(403,'origin_not_allowed');
  const params=new URL(request.url).searchParams;
  if(params.getAll('mode').length!==1||params.get('mode')!==SNAPSHOT_ACCEPT_MODE||[...params.keys()].some(k=>k!=='mode'))return fail(400,'invalid_request');
  if(request.method==='OPTIONS'){
   headers.set('Access-Control-Allow-Methods','POST, OPTIONS');headers.set('Access-Control-Allow-Headers','authorization, apikey, x-client-info, content-type');
   return new Response(null,{status:204,headers});
  }
  if(request.method!=='POST'){headers.set('Allow','POST, OPTIONS');return fail(405,'method_not_allowed');}
  const authorization=request.headers.get('Authorization');
  if(!bearer(authorization))return fail(401,'authentication_required');
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))return fail(400,'invalid_request');
  let body:unknown;
  try{
   if(!request.body)return fail(400,'invalid_request');
   const reader=request.body.getReader(),decoder=new TextDecoder();let text='',size=0;
   try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>2048){await reader.cancel();return fail(400,'invalid_request');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
   finally{reader.releaseLock();}
   body=JSON.parse(text);
  }catch{return fail(400,'invalid_request');}
  if(!object(body)||typeof body.ownerId!=='string'||!parseAdaptiveRequest(body,body.ownerId))return fail(400,'invalid_request');
  try{
   const result=await runtime({authorization,request:body});
   if(result.reason==='receipt'&&result.receipt!==null){
    const receipt=safeReceipt(result.receipt,parseAdaptiveRequest(body,body.ownerId)!);
    if(receipt.status!=='not_found')return reply(200,receipt);
    return fail(409,'reconciliation_required',true);
   }
   if(result.mayHaveWritten)return fail(409,'reconciliation_required',true);
   if(result.reason==='authentication_required')return fail(401,result.reason);
   if(result.reason==='account_changed')return fail(403,result.reason);
   if(result.reason==='invalid_request')return fail(400,result.reason);
   return fail(503,result.reason==='safety_review_required'?'safety_review_required':'source_error');
  }catch{
   // Handler cannot know whether a throwing runtime already submitted acceptance.
   return fail(409,'reconciliation_required',true);
  }
 };
}

