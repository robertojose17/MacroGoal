import {parseManualNutritionJournalEntry} from './manualNutritionDeclaration.ts';
import type {JournalEntry,OwnerPendingJournal,OwnerPendingInspection,StoragePort} from './manualNutritionTypes.ts';
// Recovered tool-call source. AsyncStorage methods only; no atomic CAS/encryption claim.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validId=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
const equal=(a:unknown,b:unknown):boolean=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));};
export function createManualNutritionEvidenceJournal(storage:StoragePort,namespace='macrogoal:manual-nutrition-evidence:v1'):OwnerPendingJournal{
 if(typeof namespace!=='string'||!/^[a-z0-9:_-]{1,100}$/.test(namespace))throw Error('invalid_namespace');
 const getItem=storage.getItem.bind(storage),setItem=storage.setItem.bind(storage),getAllKeys=storage.getAllKeys.bind(storage),removeItem=storage.removeItem.bind(storage);
 const key=(owner:string,rid:string):string=>{if(!validId(owner)||!validId(rid))throw Error('invalid_identity');return `${namespace}:${owner}:${rid}`;};

 async function read(owner:string,rid:string):Promise<JournalEntry|null>{const raw=await getItem(key(owner,rid));if(raw===null)return null;return parseManualNutritionJournalEntry(JSON.parse(raw),owner,rid);}
 async function listOwnerPending(owner:string):Promise<JournalEntry[]>{
  if(!validId(owner))throw Error('invalid_identity');
  const prefix=`${namespace}:${owner}:`,out:JournalEntry[]=[];
  for(const k of await getAllKeys()){
   if(!k.startsWith(prefix))continue;
   const rid=k.slice(prefix.length);if(!validId(rid))throw Error('invalid_journal_key');
   const e=await read(owner,rid);if(e)out.push(e);
  }
  return out;
 }
 async function inspectOwnerPending(owner:string):Promise<OwnerPendingInspection[]>{
  if(!validId(owner))throw Error('invalid_identity');
  const prefix=`${namespace}:${owner}:`,out:OwnerPendingInspection[]=[];
  for(const k of await getAllKeys()){
   if(!k.startsWith(prefix))continue;
   const rid=k.slice(prefix.length);
   const raw=await getItem(k);if(raw===null)continue;
   if(!validId(rid)){out.push({kind:'invalid-key',storageKey:k,raw});continue;}
   try{out.push({kind:'valid',entry:parseManualNutritionJournalEntry(JSON.parse(raw),owner,rid)});}
   catch{out.push({kind:'invalid',requestId:rid,raw});}
  }
  return out;
 }
 async function discardInvalidKeyExact(owner:string,storageKey:string,expectedRaw:string):Promise<boolean>{
  if(!validId(owner))throw Error('invalid_identity');
  const prefix=`${namespace}:${owner}:`;
  if(typeof storageKey!=='string'||!storageKey.startsWith(prefix)||validId(storageKey.slice(prefix.length)))return false;
  if(typeof expectedRaw!=='string')throw Error('invalid_expected_raw');
  if(await getItem(storageKey)!==expectedRaw)return false;
  // Private local corruption recovery only. Same no-CAS/cooperating-writer
  // limitation as discardInvalidExact; never passed to an RPC or UI directly.
  await removeItem(storageKey);return await getItem(storageKey)===null;
 }
 async function discardInvalidExact(owner:string,rid:string,expectedRaw:string):Promise<boolean>{
  const k=key(owner,rid);
  if(typeof expectedRaw!=='string')throw Error('invalid_expected_raw');
  const raw=await getItem(k);if(raw!==expectedRaw)return false;
  try{parseManualNutritionJournalEntry(JSON.parse(raw),owner,rid);return false;}
  catch{/* Exact invalid own entry only. No RPC, broad deletion or valid cleanup. */}
  // AsyncStorage has no CAS: cooperating writers must not replace existing keys.
  await removeItem(k);return await getItem(k)===null;
 }
 return Object.freeze({read,listOwnerPending,inspectOwnerPending,discardInvalidExact,discardInvalidKeyExact,
 async append(entry:JournalEntry):Promise<boolean>{const e=parseManualNutritionJournalEntry(entry,entry.ownerId,entry.request?.requestId),rid=e.request.requestId,k=key(e.ownerId,rid);const old=await getItem(k);if(old!==null)return equal(JSON.parse(old),e);await setItem(k,JSON.stringify(e));return equal(await read(e.ownerId,rid),e);},
 async listPending(owner:string,item:string):Promise<JournalEntry[]>{if(!validId(owner)||!validId(item))throw Error('invalid_identity');const prefix=`${namespace}:${owner}:`,out:JournalEntry[]=[];for(const k of await getAllKeys()){if(!k.startsWith(prefix))continue;const rid=k.slice(prefix.length);if(!validId(rid))throw Error('invalid_journal_key');const e=await read(owner,rid);if(e&&e.itemId===item)out.push(e);}return out;},
 async clearExact(owner:string,rid:string,expected:JournalEntry):Promise<boolean>{const k=key(owner,rid),old=await read(owner,rid);if(old===null)return true;try{parseManualNutritionJournalEntry(expected,owner,rid);}catch{return false;}if(!equal(old,expected))return false;await removeItem(k);return await getItem(k)===null;}
 });
}
