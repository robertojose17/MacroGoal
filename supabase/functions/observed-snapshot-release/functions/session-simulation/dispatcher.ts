type Handler=(request:Request)=>Promise<Response>;
const paths=new Set(['/progress-intelligence/session-simulation','/functions/v1/progress-intelligence/session-simulation']);
/** Exact reserved subpath only. Legacy requests/streams/headers are forwarded unchanged. */
export function createSessionSimulationDispatcher(existing:Handler,load:()=>Promise<{handleSimulation:Handler}>):Handler{
 return async(request)=>{
  if(!paths.has(new URL(request.url).pathname))return existing(request);
  // OPTIONS bodies are ignored: transport may expose an empty stream. The runtime only returns CORS metadata.
  if(new URL(request.url).search||(request.method==='GET'&&request.body!==null)||(request.method!=='GET'&&request.method!=='OPTIONS'))return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  try{return await (await load()).handleSimulation(request);}catch{return new Response(JSON.stringify({error:'simulation_unavailable'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
 };
}
