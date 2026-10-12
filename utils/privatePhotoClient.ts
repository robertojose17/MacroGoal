/** No browser/native disk cache, bearer URLs, tokens in query strings or URL fallback. */
export type PrivatePhotoTarget={kind:'original'|'shared';id:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function privatePhotoReference(target:PrivatePhotoTarget):string {
 if(!UUID.test(target.id)||!['original','shared'].includes(target.kind))throw Error('Invalid media reference');
 return `macrogoal-private-photo:${target.kind}/${target.id}`;
}
export function parsePrivatePhotoReference(value:unknown):PrivatePhotoTarget|null {
 if(typeof value!=='string')return null;
 const match=/^macrogoal-private-photo:(original|shared)\/([a-f0-9-]+)$/.exec(value);
 return match&&UUID.test(match[2])?{kind:match[1] as 'original'|'shared',id:match[2]}:null;
}
export interface MediaSession{actor:string;token:string;generation:number}
export interface PrivatePhotoLoaderDependencies{
 endpoint:string;
 session:()=>Promise<MediaSession|null>;
 fetch:typeof fetch;
 encode:(bytes:Uint8Array)=>string;
}
export async function loadPrivatePhoto(target:PrivatePhotoTarget,deps:PrivatePhotoLoaderDependencies,signal:AbortSignal):Promise<string>{
 privatePhotoReference(target);
 const initial=await deps.session();if(!initial||signal.aborted)throw Error('Media unavailable');
 const endpoint=new URL(deps.endpoint);
 if(endpoint.protocol!=='https:'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)throw Error('Invalid media endpoint');
 const response=await deps.fetch(`${deps.endpoint.replace(/\/$/,'')}/${target.kind}/${target.id}`,{
   headers:{Authorization:`Bearer ${initial.token}`,'Cache-Control':'no-store'},signal,redirect:'error',
   // Deliberately omit cache:no-store: native whatwg-fetch adds an unsupported `_` query.
 });
 if(!response.ok||response.redirected)throw Error('Media unavailable');
 const mime=response.headers.get('content-type')?.split(';')[0];
 if(!['image/jpeg','image/png','image/webp','image/heic'].includes(mime??''))throw Error('Media unavailable');
 const declared=Number(response.headers.get('content-length'));
 if(!Number.isInteger(declared)||declared<=0||declared>12*1024*1024)throw Error('Media unavailable');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.byteLength!==declared)throw Error('Media unavailable');
 const current=await deps.session();
 if(signal.aborted||!current||current.actor!==initial.actor||current.generation!==initial.generation||current.token!==initial.token)throw Error('Media unavailable');
 return `data:${mime};base64,${deps.encode(bytes)}`;
}

export function encodePhotoBytes(bytes:Uint8Array):string{
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 const chunks:string[]=[];let chunk='';
 for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1]??0,c=bytes[i+2]??0;
  chunk+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b>>4)]+(i+1<bytes.length?alphabet[((b&15)<<2)|(c>>6)]:'=')+(i+2<bytes.length?alphabet[c&63]:'=');
  if(chunk.length>=16384){chunks.push(chunk);chunk='';}
 }
 chunks.push(chunk);return chunks.join('');
}
