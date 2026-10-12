/** No overwrite, no deletion. Recovery reads only server-reserved derivative path. */
export interface DerivativeStore{upload:(path:string,bytes:Uint8Array,options:{upsert:false;contentType:string;cacheControl:string})=>Promise<{error:unknown}>;download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;}
export async function ensureDerivativeUpload(store:DerivativeStore,path:string,bytes:Uint8Array,mime:string,digest:string){
 const {error}=await store.upload(path,bytes,{upsert:false,contentType:mime,cacheControl:'0'});
 if(!error)return;
 const {data:blob,error:readError}=await store.download(path);
 if(readError||!blob||blob.size>8*1024*1024)throw Error('Upload unavailable');
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
 if(actual!==digest)throw Error('Upload mismatch');
}
