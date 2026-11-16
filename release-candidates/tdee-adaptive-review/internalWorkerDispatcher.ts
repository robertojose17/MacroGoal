type Handler=(request:Request)=>Promise<Response>;
export const INTERNAL_DISPATCH_RELEASE=Object.freeze({enabled:false} as const);
const paths=new Set(['/functions/v1/ai-coach-daily/internal-tdee-daily-v1','/ai-coach-daily/internal-tdee-daily-v1']);
/** Preserve every existing route and its original Request. Gateway unchanged.
 * Only the exact new path is selected. No actor/context/credential query input. */
export function createInternalWorkerDispatcher(existing:Handler,load:()=>Promise<{handleInternalWorker:Handler}>):Handler{
 return async request=>{
  const url=new URL(request.url);
  if(!paths.has(url.pathname))return existing(request);
  const reply=(status:number,result:string)=>new Response(JSON.stringify({version:'internal-daily-worker-v1',result}),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
  // OFF precedes body reads, module loading, credentials or data.
  if(!INTERNAL_DISPATCH_RELEASE.enabled)return reply(503,'disabled');
  if(url.search)return reply(400,'query_not_allowed');
  if(request.method!=='POST')return reply(405,'method_not_allowed');
  if(request.headers.has('origin'))return reply(403,'browser_request_not_allowed');
  try{return await(await load()).handleInternalWorker(request);}catch{return reply(503,'internal_worker_unavailable');}
 };
}
