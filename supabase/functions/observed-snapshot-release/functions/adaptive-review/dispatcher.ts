type Handler=(request:Request)=>Promise<Response>;
/** Select only adaptive review/accept; all existing requests preserve their original handler. */
export function createAdaptiveReviewDispatcher(existing:Handler,load:()=>Promise<{handleAdaptiveReview:Handler;handleAdaptiveAccept?:Handler}>):Handler{
 return async request=>{
  const url=new URL(request.url),modes=url.searchParams.getAll('mode');
  const accepting=modes.includes('adaptive-accept-v1');
  if(!accepting&&!modes.includes('adaptive-review-v1'))return existing(request);
  const origin=request.headers.get('Origin');
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if(origin==='https://macro-goal.expo.app')headers['Access-Control-Allow-Origin']=origin;
  const reply=(status:number,reason:string)=>new Response(JSON.stringify(accepting?{reason,receipt:null,mayHaveWritten:reason==='reconciliation_required'}:{reason,proposal:null}),{status,headers});
  if(origin&&origin!=='https://macro-goal.expo.app')return reply(403,'origin_not_allowed');
  if(modes.length!==1||[...url.searchParams.keys()].some(k=>k!=='mode'))return reply(400,'invalid_request');
  if(request.method==='OPTIONS'){
   headers['Access-Control-Allow-Methods']='POST, OPTIONS';
   headers['Access-Control-Allow-Headers']='authorization, apikey, x-client-info, content-type';
   return new Response(null,{status:204,headers});
  }
  if(request.method!=='POST'){headers.Allow='POST, OPTIONS';return reply(405,'method_not_allowed');}
  let loaded:Awaited<ReturnType<typeof load>>;
  try{loaded=await load();}catch{return reply(503,'source_error');}
  if(accepting){
   if(!loaded.handleAdaptiveAccept)return reply(503,'source_error');
   try{return await loaded.handleAdaptiveAccept(request);}catch{return reply(409,'reconciliation_required');}
  }
  try{return await loaded.handleAdaptiveReview(request);}catch{return reply(503,'source_error');}
 };
}
