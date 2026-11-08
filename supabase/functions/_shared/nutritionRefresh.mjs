import {createRefreshService} from './nutritionProvider.mjs';

/** Stream-cap provider JSON before parsing. Content-Length is only an early check.
 * @param {Response} response
 * @param {{signal?: AbortSignal, maxBytes?: number}} [options]
 */
export async function readProviderJSON(response,{signal,maxBytes=262144}={}) {
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw Error('invalid_body_limit');
 const advertised=Number(response.headers?.get('content-length'));
 if(Number.isFinite(advertised)&&advertised>maxBytes)throw Error('provider_body_too_large');
 const reader=response.body?.getReader();if(!reader)throw Error('provider_body_unavailable');
 let size=0;const chunks=[];
 const abort=()=>{void reader.cancel().catch(()=>{});};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  while(true){if(signal?.aborted)throw Error('provider_aborted');const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>maxBytes){abort();throw Error('provider_body_too_large');}chunks.push(value);
  }
  if(signal?.aborted)throw Error('provider_aborted');
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}

/** Backend-only best-effort selection hook. Never returns or modifies a food row.
 * Both switches are deliberately false by default. No background work/retries.
 * Call only after exact persisted food selection, never on autocomplete results.
 */
/** @param {{admin:any,enabled?:boolean,networkEnabled?:boolean,fetchImpl?:typeof fetch,usdaKey?:string,requestId?:()=>string,now?:()=>number,timeoutMs?:number}} [options] */
export function createSelectionCapture({admin,enabled=false,networkEnabled=false,fetchImpl=globalThis.fetch,usdaKey='DEMO_KEY',requestId=()=>crypto.randomUUID(),now=Date.now,timeoutMs=8000}={}) {
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000)throw Error('invalid_timeout');
 return async function capture(/** @type {{request?:Request,foodId?:string|null,provider?:string,sourceId?:string,providerFood?:unknown,authenticated?:boolean,returnFoodItem?:boolean}} */ {request,foodId,provider,sourceId,providerFood,authenticated=false,returnFoodItem=false}={}) {
  if(!enabled||!networkEnabled)return {status:'disabled'};
  if(!foodId||!['usda','openfoodfacts'].includes(provider)||!/^\d{1,20}$/.test(String(sourceId)))return {status:'ineligible'};
  const deadline=Date.now()+timeoutMs;
  async function bounded(fn){
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('deadline_exceeded');
   let timer;const controller=new AbortController();
   try{return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline_exceeded'));},remaining);})]);}
   finally{clearTimeout(timer);}
  }
  const rpc=async(name,args,{signal})=>{const result=await admin.rpc(name,args).abortSignal(signal);if(result.error)throw Error('rpc_error');return result.data;};
  try{
   // Ordinary barcode requests did not previously need user auth; hook requires it
   // without changing the legacy response. USDA caller already verified getUser.
   if(!authenticated){
    const bearer=request?.headers?.get('authorization')?.match(/^Bearer ([^ ]+)$/i)?.[1];
    if(!bearer)return {status:'unauthenticated'};
    const auth=await bounded(()=>admin.auth.getUser(bearer));
    if(auth?.error||!auth?.data?.user)return {status:'unauthenticated'};
   }
   const state=await bounded(signal=>rpc('read_food_nutrition_refresh_state_v1',{p_food_id:foodId},{signal}));
   if(!Number.isSafeInteger(state?.revision)||state.revision<0)return {status:'state_unavailable'};
   const remaining=deadline-Date.now();if(remaining<=0)return {status:'timeout'};
   const service=createRefreshService({networkEnabled:true,budget:1,timeoutMs:remaining,now,
    claimRefresh:(args,options)=>rpc('claim_food_nutrition_refresh_v1',args,options),
    refreshEvidence:(args,options)=>rpc('refresh_food_nutrition_v1',args,options),
    fetchProvider:async({provider,source_id,signal})=>{
     if(providerFood!==undefined)return providerFood; // Existing full provider response, no duplicate fetch.
     const url=provider==='usda'
      ?'https://api.nal.usda.gov/fdc/v1/food/'+source_id+'?api_key='+encodeURIComponent(usdaKey)
      :'https://world.openfoodfacts.org/api/v2/product/'+source_id+'.json?fields=code,product_name,brands,ingredients_text,preparation,nutriments,serving_quantity,serving_quantity_unit,serving_size,nutrition_data_per,nutrition_data_prepared_per,nutrition';
     const response=await fetchImpl(url,{signal,headers:provider==='openfoodfacts'?{'User-Agent':'MacroGoal/1.0 (macro-goal.app)'}:{}});
     if(!response.ok)throw Error('provider_http_error');
     const body=await readProviderJSON(response,{signal});
     if(provider==='openfoodfacts'){if(body.status!==1||!body.product)throw Error('provider_not_found');return body.product;}
     return body;
    }
   });
   // OFF stays provider_100: this integration never guesses density or label basis.
   const result=await service.reuse({id:foodId,revision:state.revision,provider,source_id:String(state.source_id??sourceId),mass_bound:state.mass_bound===true,captured_at:state.captured_at},{explicitReuse:true,requestId:requestId()});
   if(result.status==='applied'&&returnFoodItem&&Date.now()<deadline){
    try{
     const reread=await bounded(signal=>admin.from('food_items').select('*').eq('id',foodId).maybeSingle().abortSignal(signal));
     if(!reread?.error&&reread?.data?.id===foodId)return {...result,food_item:reread.data};
    }catch{/* No retry. Original successful lookup remains the response fallback. */}
   }
   return result;
  }catch{return {status:'capture_unavailable'};}
 };
}

/** Deno runtime entry point; tests use the dependency-injected factory above. */
export async function captureSelectedNutrition(admin,request,selection){
 try{
  const capture=createSelectionCapture({admin,
   enabled:Deno.env.get('NUTRIENT_REFRESH_ENABLED')==='true',
   networkEnabled:Deno.env.get('NUTRIENT_REFRESH_NETWORK_ENABLED')==='true',
   usdaKey:Deno.env.get('USDA_API_KEY')||'DEMO_KEY'});
  return await capture({request,...selection});
 }catch{return {status:'capture_unavailable'};}
}

/** Exact cached-hit reuse only. Runtime tracks the entire bounded task before
 * it starts; absent/rejected scheduling falls back to an actual <=150ms hook.
 * Cached responses always retain their original item. New facts appear next read.
 */
export async function scheduleCachedSelection(options,selection,{waitUntil,backgroundTimeoutMs=8000,foregroundTimeoutMs=150}={}) {
 if(!options?.enabled||!options?.networkEnabled)return {status:'disabled'};
 if(!Number.isSafeInteger(backgroundTimeoutMs)||backgroundTimeoutMs<1||backgroundTimeoutMs>8000||!Number.isSafeInteger(foregroundTimeoutMs)||foregroundTimeoutMs<1||foregroundTimeoutMs>150)throw Error('invalid_scheduler_budget');
 const run=async timeoutMs=>{
  try{return await createSelectionCapture({...options,timeoutMs})({...selection,returnFoodItem:false});}
  catch{return {status:'capture_unavailable'};}
 };
 if(typeof waitUntil==='function'){
  let finish;const tracked=new Promise(resolve=>{finish=resolve;});
  try{
   waitUntil(tracked); // Register first. A throwing runtime cannot strand long work.
   void run(backgroundTimeoutMs).then(finish,()=>finish({status:'capture_unavailable'}));
   return {status:'scheduled'};
  }catch{finish({status:'scheduling_unavailable'});}
 }
 return await run(foregroundTimeoutMs);
}

export async function refreshCachedSelection(admin,request,selection){
 try{
  const runtime=globalThis.EdgeRuntime;
  return await scheduleCachedSelection({admin,
   enabled:Deno.env.get('NUTRIENT_REFRESH_ENABLED')==='true',
   networkEnabled:Deno.env.get('NUTRIENT_REFRESH_NETWORK_ENABLED')==='true',
   usdaKey:Deno.env.get('USDA_API_KEY')||'DEMO_KEY'},
   {request,...selection},{waitUntil:typeof runtime?.waitUntil==='function'?runtime.waitUntil.bind(runtime):undefined});
 }catch{return {status:'capture_unavailable'};}
}

