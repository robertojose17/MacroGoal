import {observeProviderAccounting,type UsageRecorder} from './provider-stream-accounting.ts';
import {createPaidMealAdmission} from './manual/paid-meal-admission.ts';
import {guardedChat} from './chat-access.ts';
import {coachRequest} from './_shared/coach-access.ts';
// Internal factory; no body/header can supply provider controls or alter limits.
export function boundedConversationFetch(deadline:number,fetcher:typeof fetch=fetch,record?:UsageRecorder):typeof fetch {
 let dispatched=false;
 return async(url,init)=>{
  if(dispatched)throw Error('conversation_already_dispatched');
  if(String(url)!=='https://openrouter.ai/api/v1/chat/completions')throw Error('unexpected_provider');
  const original=JSON.parse(String(init?.body));
  const body=JSON.stringify({model:'google/gemini-2.5-pro',messages:original.messages,temperature:0.7,stream:true,max_tokens:2048,reasoning:{max_tokens:512},provider:{max_price:{prompt:2.5,completion:15},require_parameters:true,allow_fallbacks:false}});
  if(new TextEncoder().encode(body).length>30000)throw Error('conversation_context_too_large');
  const ms=deadline-Date.now();if(ms<=0)throw Error('conversation_deadline');
  dispatched=true;
  const response=await fetcher(url,{...init,body,signal:AbortSignal.timeout(ms)});
  return record?observeProviderAccounting(response,record):response;
 };
}
export type ConversationPermit={owner:string;expiresAt:number};
export const CONVERSATION_OWNER='3af0eabf-e742-4657-80c4-130dfa867502';
// Owner fence is durable in this release: expiry/config failure never opts into legacy.
// Existing begin RPC has a service-only READ-ONLY metadata branch in reviewed controls.
export function sqlConversationPermit(db:any){return async():Promise<ConversationPermit>=>{try{const r=await db.rpc('coach_begin_execution_v2',{p_user_id:CONVERSATION_OWNER,p_request_id:null,p_fingerprint:null,p_access:null,p_request_payload:{control:'conversation_permit_status_v1'},p_retry_of_request_id:null,p_reserve_web:false});const d=r.data,expiry=Date.parse(d?.expires_at);if(!r.error&&d?.kind==='conversation_permit_status_v1'&&d.owner===CONVERSATION_OWNER&&Number.isFinite(expiry))return {owner:CONVERSATION_OWNER,expiresAt:expiry};}catch{}return {owner:CONVERSATION_OWNER,expiresAt:0};};}
// Missing/expired controls allow recovery only; they never release the owner fence.
export function createJournalConversation(db:any,legacy:(r:Request,c?:{providerFetch:typeof fetch})=>Promise<Response>,permit:()=>ConversationPermit|null|Promise<ConversationPermit|null>,resolve?:any,now=Date.now,fetcher:typeof fetch=fetch){
 const policy={async checkRequest(owner:string){const p=await db.from('coach_permissions').select('permission_level').eq('user_id',owner).maybeSingle();return !p.error&&[1,2,3,4].includes(p.data?.permission_level)?{allowed:true as const}:{allowed:false as const,reason:'safety_gate' as const};},async checkSavedMeal(){return false;}};
 const admission=createPaidMealAdmission(db,policy,now,resolve);
 const run=guardedChat(db,async(req:Request)=>{
  const b=await req.clone().json();const conf=await permit();const auth=await db.auth.getUser(req.headers.get('authorization')!.slice(7));const owner=auth.data?.user?.id;
  if(!conf||!owner||owner!==conf.owner)return Response.json({error:'conversation_pilot_unavailable'},{status:403});
  if(Object.keys(b).some(k=>!['experience','request_id','messages','language','weight_unit','conversation_id'].includes(k))||b.experience!=='conversation_v1')return Response.json({error:'invalid_request'},{status:400});
  let parsed;try{parsed=coachRequest(b);}catch{return Response.json({error:'invalid_request'},{status:400});}
  if(parsed.kind==='opening')return Response.json({error:'use_local_greeting'},{status:400});
  const payload={...JSON.parse(parsed.fingerprintInput),experience:'conversation_v1',journey:'conversation_v1'};
  // Recovery remains available after expiry. New admission is fenced by SQL expiry.
  // Work callback also checks server expiry before any provider dispatch.
  if(now()>=conf.expiresAt){const prior=await db.rpc('coach_recover_requests_v1',{p_user_id:owner,p_request_id:parsed.requestId,p_offset:0});if(prior.error||!Array.isArray(prior.data)||!prior.data.some((row:any)=>row.request_id===parsed.requestId))return Response.json({error:'conversation_permit_closed',request_id:parsed.requestId},{status:403});}
  const response=await admission.run({ownerId:owner,requestId:parsed.requestId,intent:'recommend',fingerprint:JSON.stringify(payload)},async context=>{
   const current=await permit();if(!current||current.owner!==owner||current.expiresAt!==conf.expiresAt||now()>=current.expiresAt)throw Error('conversation_permit_expired');
   const original=await legacy(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(b)}),{providerFetch:boundedConversationFetch(Math.min(context.deadline,conf.expiresAt),fetcher,context.record)});
   if(!original.ok||!original.body||!original.headers.get('content-type')?.includes('text/event-stream'))throw Error('conversation_provider_uncertain');
   // Buffer bounded SSE until durable commit: never show a success that cannot be recovered.
   const reader=original.body.getReader(),decoder=new TextDecoder();let wire='';
   while(true){const v=await reader.read();if(v.done)break;wire+=decoder.decode(v.value,{stream:true});if(wire.length>131072){await reader.cancel();throw Error('conversation_output_too_large');}}
   let done:any=null;for(const block of wire.split(/\r?\n\r?\n/)){const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!data)continue;const value=JSON.parse(data);if(value.done)done=value;}
   if(!done||typeof done.corrected_text!=='string')throw Error('conversation_incomplete');
   // Incomplete or invalid provider accounting retains the uncertain hold.
   // Private observer already recorded validated billing, or null for uncertainty.
   return Response.json({...done,action_proposal:null,suggestions:null,request_id:parsed.requestId,nutrition_authority:'unverified_conversation'});
  });
  const final=guardedChat(db,async()=>response,resolve,now);const checked=await final(req.clone());if(!checked.ok)return checked;
  if((await db.auth.getUser(req.headers.get('authorization')!.slice(7))).data?.user?.id!==owner)return Response.json({error:'authorization_changed'},{status:403});
  const value=await checked.json();return new Response('data: '+JSON.stringify(value)+'\n\n',{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
 },resolve,now);
 return async(req:Request):Promise<Response|null>=>{let b:any;try{b=await req.clone().json();}catch{return null;}if(b?.experience==='conversation_v1')return run(req);const conf=await permit();if(conf&&Array.isArray(b?.messages)){const token=req.headers.get('authorization')?.replace(/^Bearer /,'');const auth=token?await db.auth.getUser(token):null;if(auth?.data?.user?.id===conf.owner)return Response.json({error:'journal_conversation_required'},{status:400});}return null;};
}
