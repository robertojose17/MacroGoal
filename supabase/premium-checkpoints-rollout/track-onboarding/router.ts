// Literal paths only. Never decode or suffix-match a private request into legacy ingestion.
type Handler=(req:Request)=>Promise<Response>|Response;
const legacyPaths=new Set(['/track-onboarding','/track-onboarding/','/functions/v1/track-onboarding','/functions/v1/track-onboarding/']);
const privatePaths=new Set(['/track-onboarding/premium-checkpoint','/functions/v1/track-onboarding/premium-checkpoint']);
const errorHeaders={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
export function createOnboardingRouter(legacy:Handler,premium:Handler):Handler {
 return async(req:Request)=>{
  let path:string;try{path=new URL(req.url).pathname;}catch{return new Response(JSON.stringify({error:'invalid_path'}),{status:400,headers:errorHeaders});}
  if(privatePaths.has(path)){
   try{return await premium(req);}catch{return new Response(JSON.stringify({error:'unavailable'}),{status:503,headers:errorHeaders});}
  }
  if(legacyPaths.has(path))return legacy(req);
  // Undocumented arbitrary paths were accepted by v19; now fail closed before body/DB work.
  return new Response(JSON.stringify({error:'not_found'}),{status:404,headers:errorHeaders});
 };
}
