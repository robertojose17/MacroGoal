/** Local candidate. Repository writes occur only through injected server store. */
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX=8*1024*1024;
export interface Draft {id:string;owner:string;source:string;key:string;sha256:string;state:'uploading'|'ready'|'bound';path:string;}
export interface UploadDeps {
 authenticate(token:string):Promise<string|null>;
 ownsSource(actor:string,source:string):Promise<boolean>;
 // Atomic unique(actor,key); conflicting source/digest must reject. No overwrite.
 reserve(actor:string,source:string,key:string,digest:string):Promise<Draft>;
 uploadNew(path:string,bytes:Uint8Array,mime:string,digest:string):Promise<void>;
 markReady(actor:string,id:string,digest:string):Promise<boolean>;
 bind(actor:string,post:string,ids:string[]):Promise<boolean>;
}
const H={'Cache-Control':'private, no-store, max-age=0','Vary':'Authorization','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,idempotency-key','Access-Control-Allow-Methods':'POST,OPTIONS'};
function result(status:number,data:object){return new Response(JSON.stringify(data),{status,headers:{...H,'Content-Type':'application/json'}});}
async function read(req:Request,limit:number){const reader=req.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let n=0;try{for(;;){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>limit)throw Error();chunks.push(v.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}const bytes=new Uint8Array(n);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.length;}return bytes;}
function mime(b:Uint8Array){if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';return null;}
export function createSharedMediaUpload(deps:UploadDeps){return async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:H});
 if(req.method!=='POST')return result(405,{error:'METHOD'});
 const u=new URL(req.url);const parts=u.pathname.split('/').filter(Boolean);const last=parts.slice(-2);
 if(u.search||u.hash||u.pathname.includes('//')||!((parts.length===6&&parts.slice(0,4).join('/')==='functions/v1/check-in-photos/shared')||(parts.length===4&&parts.slice(0,2).join('/')==='check-in-photos/shared'))||u.pathname.endsWith('/'))return result(400,{error:'REQUEST'});
 const header=req.headers.get('authorization');if(!header||header.length>8192||!/^Bearer [^\s]+$/.test(header))return result(401,{error:'AUTH'});const token=header.slice(7);
 try{
  const actor=await deps.authenticate(token);if(!actor)return result(401,{error:'AUTH'});
  if(!UUID.test(last[1]))return result(400,{error:'REQUEST'});
  if(last[0]==='draft'){
   const key=req.headers.get('idempotency-key');if(!key||! /^[A-Za-z0-9:_-]{1,128}$/.test(key))return result(400,{error:'REQUEST'});
   if(!await deps.ownsSource(actor,last[1]))return result(404,{error:'UNAVAILABLE'});
   const bytes=await read(req,MAX);const type=mime(bytes);if(!type||req.headers.get('content-type')!==type)return result(415,{error:'IMAGE'});
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
   if(req.signal.aborted||await deps.authenticate(token)!==actor||!await deps.ownsSource(actor,last[1]))return result(401,{error:'AUTH'});
   const draft=await deps.reserve(actor,last[1],key,digest);
   if(draft.owner!==actor||draft.source!==last[1]||draft.sha256!==digest||draft.key!==key||draft.path!==`${actor}/${draft.id}`||!UUID.test(draft.id))throw Error();
   if(draft.state==='uploading'){
    // Concurrent/retried upload uses same immutable bytes; adapter verifies conflicts, never overwrites.
    await deps.uploadNew(draft.path,bytes,type,digest);
    if(req.signal.aborted||await deps.authenticate(token)!==actor||!await deps.ownsSource(actor,last[1]))return result(401,{error:'AUTH'});
    if(!await deps.markReady(actor,draft.id,digest))throw Error();
   }
   if(draft.state==='bound')return result(409,{error:'ALREADY_BOUND'});
   return result(200,{media_id:draft.id});
  }
  if(last[0]==='bind'){
   if(req.headers.get('content-type')!=='application/json')return result(400,{error:'REQUEST'});
   const body=JSON.parse(new TextDecoder().decode(await read(req,1024)));
   if(!body||Object.keys(body).join(',')!=='media_ids'||!Array.isArray(body.media_ids)||body.media_ids.length<1||body.media_ids.length>4||body.media_ids.some((x:unknown)=>typeof x!=='string'||!UUID.test(x))||new Set(body.media_ids).size!==body.media_ids.length)return result(400,{error:'REQUEST'});
   if(req.signal.aborted||await deps.authenticate(token)!==actor)return result(401,{error:'AUTH'});
   const ok=await deps.bind(actor,last[1],body.media_ids);return result(ok?200:404,ok?{bound:true}:{error:'UNAVAILABLE'});
  }
  return result(404,{error:'UNAVAILABLE'});
 }catch{return result(409,{error:'SHARING_FAILED'});}
};}
