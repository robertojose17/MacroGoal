import {parseManualNutritionReadState,parseManualNutritionRegisterRequest} from './manualNutritionDeclaration.ts';
import type {EvidenceSession,ReadState,RegisterRequest} from './manualNutritionTypes.ts';
export interface AuthPort {getSession():Promise<{data:{session:{user:{id:string};access_token:string}|null};error:unknown}>}
export type FetchPort=(url:string,init:RequestInit)=>Promise<Response>;
export interface TransportOptions {auth:AuthPort;fetch:FetchPort;projectUrl:string;publicKey:string;isCurrent:(owner:string)=>boolean}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** One existing authenticated API path. No service credentials, retries, or writes on construction. */
export function createManualNutritionEvidenceTransport(options:TransportOptions){
 const {auth,fetch:request,publicKey,isCurrent}=options;
 const url=new URL(options.projectUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('invalid_project_url');
 const base=url.origin;let alive=true;const running=new Set<AbortController>();
 const current=(owner:string)=>{if(!alive||!uuid(owner)||!isCurrent(owner))throw Error('account_changed');};
 async function session(expected?:string):Promise<EvidenceSession>{
  if(!alive)throw Error('inactive');if(expected)current(expected);
  const response=await auth.getSession();
  const value=response.data.session;if(response.error||!value||!uuid(value.user.id)||typeof value.access_token!=='string'||!value.access_token)throw Error('authentication_required');
  current(value.user.id);if(expected&&value.user.id!==expected)throw Error('account_changed');
  return {ownerId:value.user.id,accessToken:value.access_token};
 }
 async function rpc(name:string,args:unknown,owner:string,item:string):Promise<ReadState>{
  if(!uuid(item))throw Error('invalid_identity');const signed=await session(owner);
  const abort=new AbortController();running.add(abort);const timer=setTimeout(()=>abort.abort(),30000);
  try{
   current(owner);const response=await request(base+'/rest/v1/rpc/'+name,{method:'POST',cache:'no-store',signal:abort.signal,
    headers:{apikey:publicKey,Authorization:'Bearer '+signed.accessToken,'Content-Type':'application/json'},body:JSON.stringify(args)});
   current(owner);if(response.status!==200)throw Error('evidence_unavailable');
   const text=await response.text();current(owner);if(text.length>65536)throw Error('invalid_evidence_response');
   const raw:unknown=JSON.parse(text);await session(owner);
   return parseManualNutritionReadState(raw,owner,item);
  }finally{clearTimeout(timer);running.delete(abort);}
 }
 return Object.freeze({getSession:()=>session(),
  readEvidence:(item:string,requestId:string|null,signed:EvidenceSession)=>{
   if(requestId!==null&&!uuid(requestId))throw Error('invalid_identity');
   return rpc('tdee_read_logged_nutrition_evidence_v1',{p_item_id:item,p_request_id:requestId},signed.ownerId,item);
  },
  registerEvidence:(body:RegisterRequest,signed:EvidenceSession)=>{const exact=parseManualNutritionRegisterRequest(body);return rpc('tdee_register_logged_nutrition_evidence_v1',{p_request:exact},signed.ownerId,exact.itemId);},
  requireSession:(owner:string)=>session(owner),
  assertCurrent:current,
  dispose:()=>{alive=false;for(const abort of running)abort.abort();running.clear();}
 });
}
