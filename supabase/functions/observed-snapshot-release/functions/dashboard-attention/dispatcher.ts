import {attentionHeaders} from './handler.ts';
type Handler=(request:Request)=>Promise<Response>;
export function createDashboardAttentionDispatcher(existing:Handler,load:()=>Promise<{handleDashboardAttention:Handler}>){return async(req:Request)=>{
 const modes=new URL(req.url).searchParams.getAll('mode');if(!modes.includes('dashboard-attention-v1'))return existing(req);
 if(modes.length!==1)return new Response(JSON.stringify({error:'invalid_request'}),{status:400,headers:attentionHeaders});
 try{return await(await load()).handleDashboardAttention(req);}catch{return new Response(JSON.stringify({error:'attention_unavailable'}),{status:503,headers:attentionHeaders});}
};}
