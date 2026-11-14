/** Isolated candidate: no application entrypoint mounts this dispatcher. */
export const SNAPSHOT_REVIEW_MODE='adaptive-review-v1';
type Runtime=(request:unknown)=>Promise<{reason:string;proposal:unknown}>;
export function createSnapshotHttpHandler(runtime:Runtime,allowedOrigins:readonly string[]){
 const origins=new Set(allowedOrigins);
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('Origin');
  const headers=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Origin',
   'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'});
  if(origin&&origins.has(origin))headers.set('Access-Control-Allow-Origin',origin);
  const reply=(status:number,reason:string,proposal:unknown=null)=>new Response(JSON.stringify({reason,proposal}),{status,headers});
  if(origin&&!origins.has(origin))return reply(403,'origin_not_allowed');
  const url=new URL(request.url),modes=url.searchParams.getAll('mode');
  if(modes.length!==1||modes[0]!==SNAPSHOT_REVIEW_MODE||
   [...url.searchParams.keys()].some(k=>k!=='mode'))return reply(400,'invalid_request');
  if(request.method==='OPTIONS'){
   headers.set('Access-Control-Allow-Methods','GET, OPTIONS');
   headers.set('Access-Control-Allow-Headers','authorization, apikey, x-client-info, content-type');
   return new Response(null,{status:204,headers});
  }
  if(request.method!=='GET'){headers.set('Allow','GET, OPTIONS');return reply(405,'method_not_allowed');}
  if(request.body!==null)return reply(400,'invalid_request');
  const authorization=request.headers.get('Authorization');
  if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return reply(401,'authentication_required');
  try{
   const result=await runtime({authorization});
   if(result.reason==='review_available'&&result.proposal!==null)return reply(200,'review_available',result.proposal);
   if(result.reason==='authentication_required'||result.reason==='account_changed')return reply(401,result.reason);
   if(result.reason==='safety_review_required')return reply(503,'safety_review_required');
   return reply(503,result.reason==='source_error'?'source_error':'review_not_ready');
  }catch{return reply(503,'source_error');}
 };
}
/** null means not selected: caller's existing legacy dispatcher remains untouched. */
export async function dispatchSnapshotReview(request:Request,handler:(request:Request)=>Promise<Response>):Promise<Response|null>{
 const modes=new URL(request.url).searchParams.getAll('mode');
 if(!modes.includes(SNAPSHOT_REVIEW_MODE))return null;
 return handler(request);
}
