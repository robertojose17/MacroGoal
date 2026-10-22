import {evaluateCoachAccess,type Access} from './_shared/coach-access.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Cache-Control':'no-store'};
const fail=(error:string,status:number)=>Response.json({error,retryable:false}, {status,headers});
// Preserve the current legacy/modern request and response protocols.
// This is an access gate only, not a monetary reservation or retry mechanism.
export function guardedChat(db:any,modern:(req:Request)=>Promise<Response>,resolve?:(id:string,now:number)=>Promise<Access>,now=Date.now){
 return async(req:Request):Promise<Response>=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return fail('method_not_allowed',405);
  const auth=req.headers.get('authorization')??'';
  if(!/^Bearer \S+$/.test(auth))return fail('unauthorized',401);
  try{
   const identify=async()=>{const r=await db.auth.getUser(auth.slice(7));return r.error?null:r.data?.user?.id??null;};
   const owner=await identify();if(!owner)return fail('unauthorized',401);
   const {data:rows,error}=await db.from('subscriptions').select('entitlement_ids,status,expiration_at,purchased_at,trial_end,billing_issues_detected_at,cancel_at_period_end').eq('user_id',owner);
   const projected=error||!Array.isArray(rows)?'unknown':evaluateCoachAccess(rows,now());
   let access=projected;if(access==='unknown'&&resolve)access=await resolve(owner,now());
   if(access!=='premium')return fail(access==='free'?'Subscription Required':'entitlement_unavailable',access==='free'?403:503);
   // Existing UI: 1=recommend only, 2=confirm each action, 3=limited,
   // 4=automatic coaching. These all permit conversation. Action capability
   // flags are not chat consent and are never changed or synthesized here.
   const permission=await db.from('coach_permissions').select('permission_level').eq('user_id',owner).maybeSingle();
   if(permission.error||!Number.isInteger(permission.data?.permission_level)||![1,2,3,4].includes(permission.data.permission_level))return fail('permission_required',403);
   if(await identify()!==owner||projected==='premium'&&evaluateCoachAccess(rows,now())!=='premium')return fail('authorization_changed',403);
   // Delegate original body unchanged, including opening sentinels.
   return modern(req);
  }catch{return fail('chat_access_unavailable',503);}
 };
}

