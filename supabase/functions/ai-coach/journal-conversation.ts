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
export function createJournalConversation(db:any,legacy:(r:Request,c?:{providerFetch:typeof fetch})=>Promise<Response>,resolve?:any,now=Date.now,fetcher:typeof fetch=fetch){
 const policy={async checkRequest(owner:string){const p=await db.from('coach_permissions').select('permission_level').eq('user_id',owner).maybeSingle();return !p.error&&[1,2,3,4].includes(p.data?.permission_level)?{allowed:true as const}:{allowed:false as const,reason:'safety_gate' as const};},async checkSavedMeal(){return false;}};
 const admission=createPaidMealAdmission(db,policy,now,resolve);
 const run=guardedChat(db,async(req:Request)=>{
  const b=await req.clone().json();const auth=await db.auth.getUser(req.headers.get('authorization')!.slice(7));const owner=auth.data?.user?.id;
  if(!owner)return Response.json({error:'unauthorized'},{status:401});
  if(Object.keys(b).some(k=>!['experience','request_id','messages','language','weight_unit','conversation_id'].includes(k))||b.experience!=='conversation_v1')return Response.json({error:'invalid_request'},{status:400});
  let parsed;try{parsed=coachRequest(b);}catch{return Response.json({error:'invalid_request'},{status:400});}
  if(parsed.kind==='opening')return Response.json({error:'use_local_greeting'},{status:400});
  const payload={...JSON.parse(parsed.fingerprintInput),experience:'conversation_v1',journey:'conversation_v1'};
  const response=await admission.run({ownerId:owner,requestId:parsed.requestId,intent:'recommend',fingerprint:JSON.stringify(payload)},async context=>{
   const original=await legacy(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(b)}),{providerFetch:boundedConversationFetch(context.deadline,fetcher,context.record)});
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
 return async(req:Request):Promise<Response|null>=>{let b:any;try{b=await req.clone().json();}catch{return null;}if(b?.experience==='conversation_v1')return run(req);if(Array.isArray(b?.messages))return Response.json({error:'journal_conversation_required'},{status:400});return null;};
}
