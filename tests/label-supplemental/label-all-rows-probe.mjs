// TEST-ONLY sanitized historical diagnostic harness. Never deployed/imported by runtime.
import {readSupplementalLabel,supplementalLabelPrompt,validateSupplementalRead} from '../../supabase/functions/vision-nutrition-extract/label-all-rows.mjs';
export const CLAIM='5b0fa024-1ca1-498b-bf4c-35091aa49341';
export const OWNER='00000000-0000-4000-8000-000000000001';
export const FRONT_PATH='submissions/'+OWNER+'/example_front.jpg';
export const LABEL_PATH='submissions/'+OWNER+'/example_label.jpg';
const BASE='https://example.supabase.co/storage/v1/object/public/food-photos/';
// This literal anchor is independently visible in the already supplied photo.
export const ANCHOR={header:'Amount per serving / Cantidad por ración',basis:'per_serving',serving_line:'Serving size/Tamaño servicio 1 unit/unidad (16g)'};
// Retain only bounded nutrition-schema fields, never request headers, credentials,
// image URLs/base64 or unrestricted provider envelopes/free-form response text.
const safeText=v=>typeof v==='string'?v.slice(0,500).replace(/[\u0000-\u001f]/g,' ').replace(/(?:https?:\/\/|data:)[^\s]+/gi,'[redacted]'):v===null?null:typeof v==='boolean'?v:'[invalid_type]';
export function diagnosticRead(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {shape:'invalid_object'};
 const out={};for(const k of ['schema','declared_serving_line','selected_column_header','selected_basis','complete'])out[k]=safeText(raw[k]);
 out.rows=Array.isArray(raw.rows)?raw.rows.slice(0,64).map(row=>{const r={};for(const k of ['row_label','column_header','amount_text','unit','dv_text','printed_text'])r[k]=safeText(row?.[k]);return r;}):null;
 out.row_count=Array.isArray(raw.rows)?raw.rows.length:null;return out;
}
const norm=v=>typeof v==='string'?v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim():null;
export async function runLabelRowsProbe({db,readImage,requestVision,parseJSON,expires,fetcher=fetch,now=Date.now}){
 if(!Number.isFinite(expires)||now()>=expires)return;
 const claim=await db.from('analytics_events').insert({id:CLAIM,user_id:OWNER,event_name:'internal_label_rows_validation',properties:{status:'claimed',calls:0}});
 if(claim.error)return; // Unique primary key admits at most one isolate, ever.
 const state={status:'claimed',calls:0,attempts:[],max_requests:2,estimated_reservation_usd:.15,uncertain:false};
 const save=async()=>{const r=await db.from('analytics_events').update({properties:state}).eq('id',CLAIM).eq('user_id',OWNER).select('id').single();if(r.error||!r.data)throw Error('receipt_unavailable');};
 const deadline=Math.min(expires,now()+30000);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-now()));
 let expectedMessages=null,blocked=false;
 const transport=async(url,init)=>{
  if(blocked||state.calls>=2||now()>=deadline||controller.signal.aborted)throw Error('probe_limit');
  const body=JSON.parse(init.body);
  if(url!=='https://openrouter.ai/api/v1/chat/completions'||body.model!=='openai/gpt-6.1-sol'||body.max_tokens!==4096||body.tools||body.plugins||body.functions||JSON.stringify(body.messages)!==JSON.stringify(expectedMessages)||body.provider?.allow_fallbacks!==false||JSON.stringify(body.provider?.only)!=='["openai"]')throw Error('probe_request');
  const attempt={ordinal:++state.calls,state:'dispatched_unknown'};state.attempts.push(attempt);state.uncertain=true;blocked=true;await save();
  if(now()>=deadline||controller.signal.aborted)throw Error('probe_deadline');
  const response=await fetcher(url,{...init,signal:controller.signal,redirect:'error'});
  const reader=response.body?.getReader();if(!reader)throw Error('probe_response');
  let bytes=0,raw='';const decoder=new TextDecoder();
  try{while(true){if(controller.signal.aborted)throw Error('probe_deadline');const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>1048576){await reader.cancel();throw Error('probe_response');}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
  const parsed=JSON.parse(raw),cost=parsed.usage?.cost;
  attempt.http_status=response.status;attempt.generation_id=typeof parsed.id==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(parsed.id)?parsed.id:null;
  attempt.cost_usd=typeof cost==='number'&&Number.isFinite(cost)&&cost>=0?cost:null;attempt.state='response_retained';
  state.cost_usd=state.attempts.reduce((n,x)=>n+(x.cost_usd||0),0);state.uncertain=attempt.cost_usd===null;
  await save();blocked=state.uncertain||state.cost_usd>=.15||!response.ok;
  return new Response(raw,{status:response.status,headers:{'content-type':'application/json'}});
 };
 try{
  // Both exact Storage objects were read-only verified against storage.objects
  // owner_id=OWNER and image/jpeg before preparing this one-shot diagnostic.
  // No caller can choose a URL or another owner; storage schema is not exposed
  // through PostgREST and must not be queried through admin.schema('storage').
  if(!FRONT_PATH.startsWith('submissions/'+OWNER+'/')||!LABEL_PATH.startsWith('submissions/'+OWNER+'/'))throw Error('photo_owner_mismatch');
  const label=await readImage(BASE+LABEL_PATH,deadline),front=await readImage(BASE+FRONT_PATH,deadline);
  const content=[{type:'image_url',image_url:{url:label}},{type:'image_url',image_url:{url:front}},{type:'text',text:supplementalLabelPrompt(ANCHOR)}];
  expectedMessages=[{role:'user',content}];
  if(now()>=deadline)throw Error('probe_deadline');
  const result=await readSupplementalLabel(async(n,signal)=>{
   const response=await requestVision('supplemental_label_probe',content,signal,true,transport,undefined,false);
   const diagnostic={ordinal:n,finish_reason:safeText(response.finishReason),response_chars:response.text.length};
   (state.read_diagnostics??=[]).push(diagnostic);
   let parsed;
   try{parsed=parseJSON(response.text);}catch{diagnostic.parse_error='invalid_json';await save();throw Error('probe_parse_failed');}
   diagnostic.parsed=diagnosticRead(parsed);
   diagnostic.anchor_match={header:norm(parsed?.selected_column_header)===norm(ANCHOR.header),basis:parsed?.selected_basis===ANCHOR.basis,serving_line:norm(parsed?.declared_serving_line)===norm(ANCHOR.serving_line)};
   try{validateSupplementalRead(parsed,ANCHOR);diagnostic.validation='valid';}
   catch(error){diagnostic.validation=/^[a-z_]{1,90}$/.test(error?.message)?error.message:'validation_failed';}
   await save();
   return {result:parsed,finishReason:response.finishReason};
  },ANCHOR,{timeoutMs:Math.max(1,Math.min(30000,deadline-now()))});
  state.result=result;state.status='finished';
 }catch(error){state.status='stopped_safely';state.error=/^[a-z_]{1,90}$/.test(error?.message)?error.message:'probe_failure';}
 finally{controller.abort();clearTimeout(timer);}
 await save();
}
