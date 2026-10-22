type Store={getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void>};
export type ChatEnvelope={experience:'conversation_v1';request_id:string;messages:{role:'user'|'assistant';content:string;timestamp?:number}[];language?:string;weight_unit?:string;conversation_id?:string|null};
type Record={owner:string;date:string;body:ChatEnvelope};
const locks=new Set<string>();const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function createConversationTransport(deps:{store:Store;scope:string;owner():Promise<string|undefined>;today():string;newId():string;timeoutMs?:number;invoke(body:ChatEnvelope,owner:string,signal:AbortSignal):Promise<Response>}){
 const key=(owner:string,date:string)=>`coach_conversation_v1:${JSON.stringify([deps.scope,owner,date])}`;
 const valid=(r:Record,owner:string,date:string)=>r?.owner===owner&&r.date===date&&r.body?.experience==='conversation_v1'&&Object.keys(r.body).every(k=>['experience','request_id','messages','language','weight_unit','conversation_id'].includes(k))&&uuid.test(r.body.request_id)&&Array.isArray(r.body.messages)&&r.body.messages.length>0&&r.body.messages.length<=10&&r.body.messages.at(-1)?.role==='user'&&r.body.messages.every(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length>0&&m.content.length<=16000&&!/^__(FIRST_INTERACTION|RETURNING_USER_OPEN)__/.test(m.content));
 async function pending(){const owner=await deps.owner(),date=deps.today();if(!owner)return null;const raw=await deps.store.getItem(key(owner,date));if(!raw)return null;try{const r=JSON.parse(raw);return valid(r,owner,date)&&await deps.owner()===owner&&deps.today()===date?r as Record:null;}catch{return null;}}
 async function run(input:Omit<ChatEnvelope,'experience'|'request_id'>,recover=false):Promise<Response>{
  const owner=await deps.owner(),date=deps.today();if(!owner)throw Error('unauthorized');const k=key(owner,date);if(locks.has(k))throw Error('conversation_pending');locks.add(k);
  try{const raw=await deps.store.getItem(k);let record:Record;if(raw){try{record=JSON.parse(raw);}catch{throw Error('invalid_pending_conversation');}if(!valid(record,owner,date))throw Error('invalid_pending_conversation');if(!recover)throw Error('recover_conversation_first');}else{if(recover)throw Error('no_pending_conversation');record={owner,date,body:{...input,experience:'conversation_v1',request_id:deps.newId()}};if(!valid(record,owner,date))throw Error('invalid_conversation');await deps.store.setItem(k,JSON.stringify(record));}
   if(await deps.owner()!==owner||deps.today()!==date)throw Error('scope_changed');
   // React Native's AbortSignal has no static timeout(). Keep the same request
   // durable on timeout; aborting the client never proves server cancellation.
   const controller=new AbortController(),deadline=Date.now()+(deps.timeoutMs??45000);
   const bounded=async<T,>(work:Promise<T>):Promise<T>=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('conversation_recovery_required'));},Math.max(0,deadline-Date.now()));})]);}finally{if(timer)clearTimeout(timer);}};
   const response=await bounded(deps.invoke(record.body,owner,controller.signal));
   if(await deps.owner()!==owner||deps.today()!==date)throw Error('scope_changed');
   // Only committed, request-bound final SSE clears recovery. JSON denials and
   // missing/uncertain replies retain the same ID; no automatic new execution.
   const text=await bounded(response.text());if(await deps.owner()!==owner||deps.today()!==date)throw Error('scope_changed');
   if(text.length>131072)throw Error('conversation_response_too_large');let done:any;
   if(!response.ok){let rejection:any;try{rejection=JSON.parse(text)}catch{}
    // Only an explicit request-bound rejection before admission can retire the
    // LOCAL pending marker. Never delete a server receipt or infer this from 403.
    if(rejection?.request_id===record.body.request_id&&rejection.admission_state==='not_admitted'){
     await deps.store.removeItem(k);if(await deps.owner()!==owner||deps.today()!==date)throw Error('scope_changed');
     throw Error(rejection.error==='conversation_permit_closed'?'conversation_paused':'conversation_not_admitted');
    }
    if(rejection?.error==='conversation_permit_closed')throw Error('conversation_paused_unconfirmed');
    if(response.status===401)throw Error('conversation_session_unverified');
    if(['premium_required','subscription_unavailable','premium_expired'].includes(rejection?.error))throw Error('conversation_access_unverified');
   }
   if(response.ok&&response.headers.get('content-type')?.includes('text/event-stream'))for(const block of text.split(/\r?\n\r?\n/)){const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!data)continue;try{const value=JSON.parse(data);if(value.done)done=value;}catch{}}
   if(!done||done.request_id!==record.body.request_id||typeof done.corrected_text!=='string'||!done.corrected_text.trim())throw Error('conversation_recovery_required');
   await deps.store.removeItem(k);if(await deps.owner()!==owner||deps.today()!==date)throw Error('scope_changed');return new Response(text,{status:response.status,headers:response.headers});
  }finally{locks.delete(k);}
 }
 return {pending,run};
}
