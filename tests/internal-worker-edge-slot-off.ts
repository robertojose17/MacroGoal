let handler:((r:Request)=>Promise<Response>)|undefined;let reads=0,fetches=0;
Object.defineProperty(Deno,'serve',{value:(h:(r:Request)=>Promise<Response>)=>{handler=h;}});
Object.defineProperty(Deno.env,'get',{value:()=>{reads++;throw Error('unexpected_env');}});
globalThis.fetch=()=>{fetches++;throw Error('unexpected_fetch');};
await import('../supabase/functions/ai-coach-daily/index.ts');
if(!handler)throw Error('missing_handler');
for(const method of ['GET','POST','OPTIONS','DELETE']){
 for(const path of ['/functions/v1/ai-coach-daily','/ai-coach-daily','/ai-coach-daily?anything=1']){
  const r=await handler(new Request('https://example.invalid'+path,{method}));
  if(r.status!==200||await r.text()!==JSON.stringify({ok:true,message:'Use ai-coach instead'})||r.headers.get('content-type')!=='application/json')throw Error('compatibility_changed');
 }
 for(const path of ['/functions/v1/ai-coach-daily/internal-tdee-daily-v1','/ai-coach-daily/internal-tdee-daily-v1']){
  const r=await handler(new Request('https://example.invalid'+path,{method}));
  if(r.status!==503||(await r.json()).result!=='disabled')throw Error('not_off');
 }
}
if(reads||fetches)throw Error('off_side_effect');
console.log('PASS actual compatibility and internalOFF entry, zeroenv/network');
