export const STRUCTURED_PROVIDER_PHASE_LIMIT_MS = 60_000;
export const PLANNER_PROVIDER_PHASE_LIMIT_MS = 30_000;
export const FINAL_PROVIDER_PHASE_LIMIT_MS = 25_000;
export const DISCOVERY_PROVIDER_PHASE_LIMIT_MS = 55_000;
export const PUBLIC_PAGE_PHASE_LIMIT_MS = 12_000;
export const WORK_DEADLINE_MS = 110_000;
export const TOTAL_DEADLINE_MS = 125_000;
export const PERSISTENCE_RPC_LIMIT_MS = 8_000;
export const STRUCTURED_PROVIDER_BODY_LIMIT_BYTES = 1_048_576;

export function providerReceipt(data:any):{cost:number|null;generationId:string|null}{
  return {
    cost:typeof data?.usage?.cost==='number'&&Number.isFinite(data.usage.cost)&&data.usage.cost>=0?data.usage.cost:null,
    generationId:typeof data?.id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(data.id)?data.id:null,
  };
}

export function providerPhaseTimeoutMs(deadlineAt:number,phaseLimitMs=STRUCTURED_PROVIDER_PHASE_LIMIT_MS,now=Date.now()):number{
  return Math.floor(Math.min(phaseLimitMs,deadlineAt-now));
}

export function providerPhaseSignal(deadlineAt:number,phaseLimitMs=STRUCTURED_PROVIDER_PHASE_LIMIT_MS,now=Date.now()):AbortSignal{
  const remaining=providerPhaseTimeoutMs(deadlineAt,phaseLimitMs,now);
  if(!Number.isFinite(remaining)||remaining<=0)throw Object.assign(new Error('provider_phase_deadline_exceeded'),{knownCost:null,errorCode:'uncertain'});
  return AbortSignal.timeout(Math.floor(remaining));
}

export async function raceWithAbort<T>(operation:PromiseLike<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError');
  let onAbort:(()=>void)|undefined;
  const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(signal.reason??new DOMException('Aborted','AbortError'));signal.addEventListener('abort',onAbort,{once:true});});
  try{return await Promise.race([Promise.resolve(operation),aborted]);}
  finally{if(onAbort)signal.removeEventListener('abort',onAbort);}
}

/** Wrap a fetcher so both response arrival and downstream body consumption observe one shared abort signal. */
export function fetchWithAbortSignal(fetcher:typeof fetch,signal:AbortSignal):typeof fetch{
  return (async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
    const combined=init?.signal?AbortSignal.any([signal,init.signal]):signal;
    const response=await raceWithAbort(fetcher(input,{...init,signal:combined}),combined);
    if(!response.body)return response;
    const reader=response.body.getReader();
    const body=new ReadableStream<Uint8Array>({
      async pull(controller){
        try{const next=await raceWithAbort(reader.read(),combined);if(next.done){controller.close();reader.releaseLock();}else controller.enqueue(next.value);}
        catch(error){void reader.cancel(error).catch(()=>{});controller.error(error);}
      },
      cancel(reason){void reader.cancel(reason).catch(()=>{});},
    });
    const wrapped=new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
    for(const key of ['url','redirected','type'] as const){try{Object.defineProperty(wrapped,key,{value:response[key]});}catch{}}
    return wrapped;
  }) as typeof fetch;
}

export async function readBoundedProviderJson(response:Response,signal:AbortSignal,maxBytes=STRUCTURED_PROVIDER_BODY_LIMIT_BYTES):Promise<any>{
  const declared=Number(response.headers.get('content-length')??0);
  if(declared>maxBytes)throw Object.assign(new Error('provider_response_too_large'),{knownCost:null,errorCode:'uncertain'});
  if(!response.body)throw Object.assign(new Error('provider_response_missing_body'),{knownCost:null,errorCode:'uncertain'});
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0,aborted=false;
  const abort=()=>{aborted=true;void reader.cancel(signal.reason).catch(()=>{});};
  if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      if(aborted||signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError');
      const next=await raceWithAbort(reader.read(),signal);if(next.done)break;
      size+=next.value.byteLength;
      if(size>maxBytes){void reader.cancel().catch(()=>{});throw Object.assign(new Error('provider_response_too_large'),{knownCost:null,errorCode:'uncertain'});}
      chunks.push(next.value);
    }
    if(aborted||signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError');
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(error){
    if(aborted||signal.aborted)throw Object.assign(new Error('provider_phase_timeout'),{knownCost:null,errorCode:'uncertain',cause:error});
    throw error;
  }finally{
    signal.removeEventListener('abort',abort);reader.releaseLock();
  }
}

/** The original absolute deadline is shared by planner and final calls. */
export async function fetchBoundedProviderJson(fetcher:typeof fetch,url:string,init:RequestInit,deadlineAt:number,maxBytes=STRUCTURED_PROVIDER_BODY_LIMIT_BYTES,parentSignal?:AbortSignal,phaseLimitMs=STRUCTURED_PROVIDER_PHASE_LIMIT_MS):Promise<{response:Response;data:any}>{
  if(parentSignal?.aborted)throw Object.assign(new Error('provider_phase_aborted'),{knownCost:null,errorCode:'uncertain'});
  const deadlineSignal=providerPhaseSignal(deadlineAt,phaseLimitMs);
  const signal=parentSignal?AbortSignal.any([deadlineSignal,parentSignal]):deadlineSignal;
  try{
    return await raceWithAbort((async()=>{
      const response=await fetcher(url,{...init,signal});
      const data=await readBoundedProviderJson(response,signal,maxBytes);
      return {response,data};
    })(),signal);
  }catch(error){
    if(signal.aborted)throw Object.assign(new Error('provider_phase_timeout'),{knownCost:null,errorCode:'uncertain',cause:error});
    throw error;
  }
}

/** Settlement is deliberately one-shot; failure must not trigger a provider retry. */
export function createOneShotSettlement(settle:(cost:number|null,errorCode?:string)=>Promise<void>){
  let attempted=false;
  return async(cost:number|null,errorCode?:string):Promise<boolean>=>{
    if(attempted)return false;attempted=true;
    try{await settle(cost,errorCode);return true;}catch{return false;}
  };
}


/** Bound one persistence RPC without reusing an already-aborted provider signal. */
export async function withPersistenceDeadline<T>(run:()=>PromiseLike<T>|T,totalDeadlineAt:number,reserveAfterMs=0,maxMs=PERSISTENCE_RPC_LIMIT_MS):Promise<T>{
  const remaining=totalDeadlineAt-Date.now(),timeoutMs=Math.min(maxMs,remaining-reserveAfterMs);
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('persistence_deadline_insufficient');
  let timer:number|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('persistence_rpc_timeout')),timeoutMs) as unknown as number;});
  try{return await Promise.race([Promise.resolve().then(run),timeout]);}
  finally{if(timer!==undefined)clearTimeout(timer);}
}
