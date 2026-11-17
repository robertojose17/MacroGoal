import {dashboardAttentionFromSource} from '../../../../../release-candidates/tdee-adaptive-review/dashboardAttention.ts';
import {parseObservationContext} from '../observed-program/snapshot.ts';
export const attentionHeaders={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,OPTIONS'};
type Ports={authenticate(token:string):Promise<string|null>;prepare?(authorization:string):Promise<void>;context(authorization:string):Promise<unknown>;source(owner:string):Promise<unknown>;now?():number};
export function createDashboardAttentionHandler(p:Ports){return async(req:Request)=>{
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:attentionHeaders});
 if(req.method==='OPTIONS')return new Response('ok',{headers:attentionHeaders});
 if(req.method!=='GET')return reply(405,{error:'method_not_allowed'});
 const q=new URL(req.url).searchParams;
 if(q.getAll('mode').length!==1||q.get('mode')!=='dashboard-attention-v1'||[...q.keys()].some(k=>k!=='mode'))return reply(400,{error:'invalid_request'});
 const authorization=req.headers.get('authorization')??'',token=authorization.match(/^Bearer (\S+)$/i)?.[1];if(!token)return reply(401,{error:'authentication_required'});
 try{
  const owner=await p.authenticate(token);if(!owner)return reply(401,{error:'authentication_required'});
  await p.prepare?.(authorization);
  const before=parseObservationContext(await p.context(authorization),owner);if(before.analysisMode!=='automatic-v1')return reply(503,{error:'automatic_analysis_unavailable'});
  const raw=await p.source(owner);
  const after=parseObservationContext(await p.context(authorization),owner);
  if(before.fingerprint!==after.fingerprint||before.premium!==after.premium||after.analysisMode!=='automatic-v1')return reply(409,{error:'context_changed'});
  const embedded=(raw as any)?.snapshot?.observation?.context;
  if(embedded&&(embedded.fingerprint!==after.fingerprint||embedded.premium!==after.premium))return reply(409,{error:'context_changed'});
  const now=p.now?.()??Date.now(),view=dashboardAttentionFromSource(raw,owner,after.premium,now);
  if(after.premium){const expiry=after.accessValidUntil??0;if(expiry<=now)return reply(403,{error:'access_unverified'});view.expiresAt=Math.min(view.expiresAt,expiry);}
  return reply(200,view);
 }catch{return reply(503,{error:'attention_unavailable'});}
};}
