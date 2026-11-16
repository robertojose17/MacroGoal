/** Cross-tab serialization for bounded own-account browser journals.
 * Web Locks needs no credentials/permission prompt. Unsupported browsers fail closed.
 */
type Journal={readonly project:string;load(owner:string):Promise<any>;prepare(entry:any):Promise<void>;resolve(owner:string,id:string):Promise<void>;reject(owner:string,id:string,code:any):Promise<void>;clear(owner:string,id:string):Promise<void>};
type LockPort={request<T>(name:string,options:{mode:'exclusive'},callback:()=>Promise<T>):Promise<T>};
export function serializeBrowserRequestJournal<T extends Journal>(journal:T,namespace:string,locks:()=>LockPort|undefined=()=>globalThis.navigator?.locks):T{
 const locked=<R>(owner:string,work:()=>Promise<R>)=>{const port=locks();if(!port||typeof port.request!=='function')return Promise.reject(new Error('browser_journal_lock_unavailable'));return port.request(`${namespace}.${journal.project}.${owner}`,{mode:'exclusive'},work);};
 return {...journal,load:(owner:string)=>locked(owner,()=>journal.load(owner)),prepare:(entry:Parameters<T['prepare']>[0])=>locked(entry.owner,()=>journal.prepare(entry)),resolve:(owner:string,id:string)=>locked(owner,()=>journal.resolve(owner,id)),reject:(owner:string,id:string,code:Parameters<T['reject']>[2])=>locked(owner,()=>journal.reject(owner,id,code)),clear:(owner:string,id:string)=>locked(owner,()=>journal.clear(owner,id))} as T;
}
