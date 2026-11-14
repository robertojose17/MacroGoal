import type { Decision } from './authorityClient';
/** One process-wide, bounded diagnostic request budget. No access decisions or retries. */
export function createShadowSingleFlight(now:()=>number=Date.now){
 type Entry={started:number;abort:AbortController;invalid:boolean;promise:Promise<Decision>;until:number};
 const entries=new Map<string,Entry>();
 function invalidate(owner:string){const entry=entries.get(owner);if(entry){entry.invalid=true;entry.abort.abort();}}
 function read(owner:string,work:(signal:AbortSignal,isCurrent:()=>boolean)=>Promise<Decision>):Promise<Decision>{
  const time=now(),old=entries.get(owner);
  // Clock rollback is not permission to start another request or reuse evidence.
  if(old&&time<old.started)return Promise.reject(Error('shadow_clock_changed'));
  if(old&&time<old.started+30000){
   if(old.invalid||time>=old.until)return Promise.reject(Error('shadow_throttled'));
   return old.promise;
  }
  // Never release an SDK/network request budget early when ignored cancellation is pending.
  if(old&&old.until===Infinity)return Promise.reject(Error('shadow_pending'));
  for(const [key,value]of entries)if(value.until!==Infinity&&time>=value.started+30000)entries.delete(key);
  if(entries.size>=32&&!entries.has(owner))return Promise.reject(Error('shadow_capacity'));
  const abort=new AbortController();
  const entry:Entry={started:time,abort,invalid:false,promise:null as unknown as Promise<Decision>,until:Infinity};
  entries.set(owner,entry);
  const timer=setTimeout(()=>{entry.invalid=true;abort.abort();},8000);
  entry.promise=Promise.resolve().then(()=>work(abort.signal,()=>!entry.invalid&&!abort.signal.aborted)).then(result=>{
   if(entry.invalid||abort.signal.aborted)throw Error('stale_shadow_response');
   entry.until=Math.min(result.validUntil??time,time+30000);return result;
  }).catch(error=>{entry.invalid=true;entry.until=time;throw error;}).finally(()=>clearTimeout(timer));
  return entry.promise;
 }
 return {read,invalidate};
}
