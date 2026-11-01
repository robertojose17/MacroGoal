// REVIEW CANDIDATE ONLY. Deploy as premium-checkpoint only after scoped approval.
import { createClient } from 'npm:@supabase/supabase-js@2.83.0';
import { validCheckpoint } from '../edge/protocol.ts';
const PROJECT='https://esgptfiofoaeguslgvcq.supabase.co';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
async function boundedJson(req:Request):Promise<unknown>{
 const reader=req.body?.getReader(); if(!reader)throw new Error('invalid');
 let bytes=0; const chunks:Uint8Array[]=[];
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new Error('timeout'));},5000);});
  return await Promise.race([timeout,(async()=>{
   for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;
    if(bytes>8192){void reader.cancel().catch(()=>{});throw new Error('invalid');}chunks.push(next.value);}
   const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
  })()]);
 } finally {if(timer)clearTimeout(timer);}
}
export async function handleCheckpoint(req:Request):Promise<Response>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return respond(405,{error:'method_not_allowed'});
 const bearer=req.headers.get('Authorization')||'';
 if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)||bearer.length>8192)return respond(401,{error:'unauthorized'});
 if(!(req.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return respond(400,{error:'invalid'});
 let payload:unknown;
 try{payload=await boundedJson(req);}catch{return respond(400,{error:'invalid'});}
 if(!validCheckpoint(payload))return respond(400,{error:'invalid'});
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!serviceKey||Deno.env.get('SUPABASE_URL')!==PROJECT)return respond(503,{error:'unavailable'});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6000);
 try{
  // Explicit JWT verification; never derive identity from body, metadata, or unverified decoding.
  // This service client has no user Authorization override and never persists a session.
  const db=createClient(PROJECT,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:controller.signal,redirect:'error'})}});
  const {data:auth,error:authError}=await db.auth.getUser(bearer.slice(7));
  if(authError){return respond(authError.status&&authError.status>=500?503:401,{error:'unauthorized'});}
  if(!auth.user||!/^[0-9a-f-]{36}$/i.test(auth.user.id))return respond(401,{error:'unauthorized'});
  const {data,error}=await db.rpc('record_private_checkpoint_v1',{p_user_id:auth.user.id,p_payload:payload});
  if(error){
   if(['22023','22P02','22007','22008','23514','23502'].includes(error.code))return respond(400,{error:'invalid'});
   if(error.code==='23503'){
    // A concurrent profile deletion can race the RPC precheck; distinguish it from invalid Auth.
    if((error.message||'').includes('checkpoint_profile_retention'))return respond(409,{error:'profile_unavailable'});
    return respond(401,{error:'account_unavailable'});
   }
   return respond(503,{error:'unavailable'});
  }
  if(data==='account_unavailable')return respond(401,{error:'account_unavailable'});
  if(data==='profile_unavailable')return respond(409,{error:'profile_unavailable'});
  if(data==='conflict')return respond(409,{error:'event_conflict'});
  if(data==='rate_limited')return respond(429,{error:'rate_limited'});
  if(data==='accepted'||data==='duplicate')return respond(data==='accepted'?202:200,{eventId:payload.eventId,status:data});
  return respond(503,{error:'unavailable'});
 }catch{return respond(503,{error:'unavailable'});}finally{clearTimeout(timer);}
}
