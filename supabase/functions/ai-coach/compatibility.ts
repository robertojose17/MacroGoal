type Handler=(req:Request)=>Promise<Response>;
export function compatibleCoach(legacy:Handler,modern:Handler,modernEnabled:()=>boolean):Handler {
 return async req=>{
  // Preserve old non-POST/CORS behavior and old body unchanged.
  if(req.method!=='POST')return legacy(req);
  let body:any;
  try{body=await req.clone().json();}catch{return modern(req);}
  const usesModern=body!==null&&typeof body==='object'&&(Object.prototype.hasOwnProperty.call(body,'request_id')||Object.prototype.hasOwnProperty.call(body,'retry_of_request_id'));
  if(!usesModern)return legacy(req);
  // Invalid/null IDs must never fall back to legacy. Recovery has a separate endpoint.
  if(!modernEnabled())return Response.json({error:'coach_protocol_temporarily_paused',retryable:false},{status:503,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
  return modern(req);
 };
}

