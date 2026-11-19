import {computeSimulation} from './engine.ts';
export type Config={ownerId:string;issuedAt:number;expiresAt:number;allowedOrigin:string};
export type VerifiedIdentity={ownerId:string;sessionId:string;expiresAt:number};
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
export function createSimulationHandler(p:{config:()=>Config|null;authenticate:(token:string)=>Promise<VerifiedIdentity|null>;now:()=>number}){
 return async(req:Request)=>{
  const now=p.now(),c=p.config(),origin=req.headers.get('origin');
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
  if(!c||!uuid(c.ownerId)||!Number.isSafeInteger(c.issuedAt)||c.issuedAt>now||!Number.isSafeInteger(c.expiresAt)||c.expiresAt-c.issuedAt>86400000||c.expiresAt<=c.issuedAt||c.expiresAt<=now||!Number.isSafeInteger(now)||!/^https:\/\/[^/]+$/.test(c.allowedOrigin))return reply(404,{error:'simulation_unavailable'});
  if(origin&&origin!==c.allowedOrigin)return reply(403,{error:'simulation_unavailable'});
  if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type';headers['Access-Control-Allow-Methods']='GET, OPTIONS';}
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='GET'||new URL(req.url).search||req.body!==null||req.headers.get('content-length')&&!['0'].includes(req.headers.get('content-length')!))return reply(405,{error:'method_not_allowed'});
  const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer ')||auth.length>8192)return reply(401,{error:'authentication_required'});
  try{
   const identity=await p.authenticate(auth.slice(7)),after=p.now();
   if(!identity||identity.ownerId!==c.ownerId||!uuid(identity.sessionId)||identity.expiresAt<=after||c.expiresAt<=after)return reply(403,{error:'simulation_unavailable'});
   const scenario=computeSimulation();return reply(200,{version:'tdee-session-simulation-v1',ownerId:identity.ownerId,sessionId:identity.sessionId,expiresAt:Math.min(c.expiresAt,identity.expiresAt),scenario});
  }catch{return reply(503,{error:'simulation_unavailable'});}
 };
}
