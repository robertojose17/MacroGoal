/** Web-only durable ciphertext. This is not an OS keychain or protection against same-origin scripts.
 * Independent witnesses detect partial storage loss; clearing ALL site data cannot be detected locally.
 * Call via a journal-wide Web Lock, never use storage operations as a substitute for that lock. */
export function createBrowserEncryptedJournalStorage(project:string,namespace:string){
 if(!/^[a-z0-9-]{6,80}$/.test(project)||!['accepted_goal_v1','tdee_rules14_accept_v1'].includes(namespace))throw Error('browser_journal_scope_invalid');
 const vault=`macrogoal.encrypted-journal.v1.${namespace}.${project}`,marker=vault+'.key-presence',encoder=()=>new TextEncoder();
 const fail=():never=>{throw Error('browser_journal_storage_lost_or_unverified');};
 function ports(){if(globalThis.isSecureContext!==true||!globalThis.indexedDB||!globalThis.crypto?.subtle||!globalThis.navigator?.locks||!globalThis.localStorage)throw Error('browser_journal_not_supported');return{crypto:globalThis.crypto,witness:globalThis.localStorage,locks:globalThis.navigator.locks};}
 function scoped(key:string){const tail=key.slice(`${namespace}.${project}.`.length);if(!key.startsWith(`${namespace}.${project}.`)||!(/^[0-9a-f-]{36}\.(head|[0-9a-f-]{36}\.[0-9]{1,3})$/i.test(tail)))fail();}
 function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{let abandoned=false;const r=indexedDB.open(vault,1);const abandon=(reason:string)=>{abandoned=true;reject(Error(reason));};r.onupgradeneeded=()=>{if(abandoned){r.transaction?.abort();return;}r.result.createObjectStore('vault');};r.onerror=()=>abandon('browser_journal_database_unavailable');r.onblocked=()=>abandon('browser_journal_database_blocked');r.onsuccess=()=>{const db=r.result;if(abandoned){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};});}
 async function transact<T>(db:IDBDatabase,mode:IDBTransactionMode,work:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{let value:T;const t=db.transaction('vault',mode,mode==='readwrite'?{durability:'strict'}:undefined),r=work(t.objectStore('vault'));r.onsuccess=()=>{value=r.result;};t.oncomplete=()=>resolve(value);t.onabort=()=>reject(Error('browser_journal_transaction_aborted'));t.onerror=()=>reject(Error('browser_journal_transaction_failed'));});}
 const get=(db:IDBDatabase,key:string)=>transact(db,'readonly',s=>s.get(key));
 const put=(db:IDBDatabase,key:string,value:unknown)=>transact(db,'readwrite',s=>s.put(value,key));
 function validKey(key:unknown):key is CryptoKey{return key instanceof CryptoKey&&key.type==='secret'&&key.extractable===false&&key.algorithm.name==='AES-GCM'&&(key.algorithm as AesKeyAlgorithm).length===256&&key.usages.length===2&&key.usages.includes('encrypt')&&key.usages.includes('decrypt');}
 async function ready(){const p=ports();return p.locks.request(vault+'.initialize',{mode:'exclusive'},async()=>{const db=await open();try{let key=await get(db,'crypto-key'),w=p.witness.getItem(marker);if(key===undefined){if(w!==null)fail();const count=await transact(db,'readonly',s=>s.count());if(count!==0)fail();key=await p.crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);p.witness.setItem(marker,'present');if(p.witness.getItem(marker)!=='present')fail();await put(db,'crypto-key',key);key=await get(db,'crypto-key');}else if(w!=='present')fail();if(!validKey(key))fail();return{...p,db,key};}catch(e){db.close();throw e;}});}
 const witnessKey=(key:string)=>vault+'.head.'+key;
 const hash=async(data:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
 const aad=(key:string)=>encoder().encode('macrogoal-journal-aesgcm-v1:'+vault+':'+key);
 async function read(db:IDBDatabase,key:CryptoKey,name:string,witness:Storage):Promise<string|null>{const row=await get(db,name),head=name.endsWith('.head'),w=head?witness.getItem(witnessKey(name)):null;
  if(row===undefined){if(head&&w!==null)fail();return null;}
  if(row?.version===1&&row?.empty===true&&Object.keys(row).length===2){if(!head||w!=='empty')fail();return null;}
  if(!row||row.version!==1||Object.keys(row).sort().join(',')!=='ciphertext,iv,version'||!(row.iv instanceof Uint8Array)||row.iv.length!==12||!(row.ciphertext instanceof ArrayBuffer)||row.ciphertext.byteLength>8192)fail();
  if(head&&w!==await hash(row.ciphertext))fail();
  try{return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:aad(name),tagLength:128},key,row.ciphertext));}catch{return fail();}
 }
 return{
  async get(name:string){scoped(name);const p=await ready();try{return await read(p.db,p.key,name,p.witness);}finally{p.db.close();}},
  async set(name:string,value:string){scoped(name);if(typeof value!=='string'||encoder().encode(value).length>4096)fail();const p=await ready();try{const iv=p.crypto.getRandomValues(new Uint8Array(12)),ciphertext=await p.crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(name),tagLength:128},p.key,encoder().encode(value));if(name.endsWith('.head')){const witness=await hash(ciphertext);p.witness.setItem(witnessKey(name),witness);if(p.witness.getItem(witnessKey(name))!==witness)fail();}await put(p.db,name,{version:1,iv,ciphertext});if(await read(p.db,p.key,name,p.witness)!==value)fail();}finally{p.db.close();}},
  async remove(name:string){scoped(name);const p=await ready();try{if(name.endsWith('.head')){p.witness.setItem(witnessKey(name),'clearing');if(p.witness.getItem(witnessKey(name))!=='clearing')fail();await put(p.db,name,{version:1,empty:true});p.witness.setItem(witnessKey(name),'empty');if(p.witness.getItem(witnessKey(name))!=='empty'||await read(p.db,p.key,name,p.witness)!==null)fail();}else await transact(p.db,'readwrite',s=>s.delete(name));}finally{p.db.close();}},
 };
}
export async function browserJournalDigest(value:string){if(!globalThis.crypto?.subtle)throw Error('browser_journal_not_supported');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
export function browserJournalGeneration(){if(!globalThis.crypto?.randomUUID)throw Error('browser_journal_not_supported');return crypto.randomUUID();}
