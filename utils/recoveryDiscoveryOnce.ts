type Attempt={promise:Promise<any>;state:'pending'|'ready'|'failed';expires:number};
const attempts=new Map<string,Attempt>();
function startAttempt(key:string,start:()=>Promise<any>,expires=Date.now()+20*60*1000):Promise<any>{
 const entry:Attempt={promise:Promise.resolve(),state:'pending',expires};
 entry.promise=Promise.resolve().then(start).then(value=>{entry.state='ready';if(Number.isFinite(value?.expires_at))entry.expires=value.expires_at;return value;},error=>{entry.state='failed';throw error;});
 attempts.set(key,entry);return entry.promise;
}
// A remount restores the latest discovery OR photo refinement, never redispatches.
export function recoveryDiscoveryOnce(key:string,start:()=>Promise<any>,retry=false,now=Date.now()):Promise<any>{
 const entry=attempts.get(key);
 if(entry){
   if(entry.state==='pending')return entry.promise;
   const expired=now>=entry.expires;
   if(retry&&(entry.state==='failed'||expired))return startAttempt(key,start);
   if(expired)return Promise.reject(Error('expired_proposal'));
   return entry.promise;
 }
 return startAttempt(key,start);
}
export function recoveryRefine(key:string,start:()=>Promise<any>,now=Date.now()):Promise<any>{
 const entry=attempts.get(key);
 if(!entry||now>=entry.expires)return Promise.reject(Error('expired_proposal'));
 if(entry.state==='pending')return entry.promise;
 if(entry.state==='failed')return entry.promise;
 return startAttempt(key,start,entry.expires);
}
export function expireRecovery(key:string){const entry=attempts.get(key);if(entry)entry.expires=0;}
