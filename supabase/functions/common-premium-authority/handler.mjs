import {createCommonPremiumAuthority} from './authority.mjs';
const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'GET,OPTIONS'};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
export function createShadowHandler({identityClient,serviceClient,getExistingV2Key,request=fetch,now=Date.now}){
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='GET')return reply(405,{error:'method_not_allowed'});
  if(new URL(req.url).search)return reply(400,{error:'invalid_request'});
  const authorization=req.headers.get('authorization')??'';
  if(!/^Bearer \S+$/i.test(authorization))return reply(401,{error:'authentication_required'});
  let initial;try{const r=await identityClient.auth.getUser(authorization.slice(7));initial=r.error?null:r.data?.user;}catch{}
  if(!initial?.id||initial.is_anonymous===true)return reply(401,{error:'authentication_required'});
  const owner=initial.id;
  // Lazily instantiate service only after real authentication. No body identity.
  let db;try{db=serviceClient();}catch{return reply(503,{error:'authority_unavailable'});}
  const rpc=async(name,args)=>{const r=await db.rpc(name,args);if(r.error)throw Error('rpc_unavailable');return r.data;};
  const read=async(actor,env)=>{
   if(actor!==owner)throw Error('actor_changed');
   const r=await rpc('common_premium_read_scope_v1',{p_owner:actor,p_environment:env});
   const version=Number(r?.version);if(!Number.isSafeInteger(version)||version<0)throw Error('invalid_version');
   return {...r,version};
  };
  const authority=createCommonPremiumAuthority({projectId:'0d801cfa',getExistingKey:getExistingV2Key,request,now,
   authenticate:async()=>{const r=await identityClient.auth.getUser(authorization.slice(7));const u=r.error?null:r.data?.user;return u?{id:u.id,isAnonymous:u.is_anonymous===true}:null;},
   resolveServerContext:async({actor})=>{
    if(actor!==owner)throw Error('actor_changed');
    const proof=await rpc('common_premium_qa_scope_v1',{p_actor:actor});
    return {actor,production:true,sandboxAllowed:proof!==null,sandboxProof:proof??undefined};
   },readVersion:async(a,e)=>(await read(a,e)).version,readCache:read,
   compareAndSet:async({actor,environment,expectedVersion,evidence})=>{
    if(actor!==owner)throw Error('actor_changed');
    const r=await rpc('common_premium_refresh_v1',{p_owner:actor,p_environment:environment,p_expected:String(expectedVersion),p_proof:evidence});
    return r?.committed===true;
   },
  });
  try{
   const result=await authority(authorization);
   // Shadow never mutates profiles, subscriptions, SDK identity or feature gates.
   if(result.ownerId!==owner)return reply(result.reason==='authentication_required'?401:503,{error:'authority_unavailable'});
   return reply(200,{...result,mode:'shadow',enforced:false});
  }catch{return reply(503,{error:'authority_unavailable'});}
 };
}
