// Recovered tool-call source. AsyncStorage methods only; no atomic CAS/encryption claim.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validId=v=>typeof v==='string'&&UUID.test(v);
const equal=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));};
export function createManualNutritionEvidenceJournal(storage,namespace='macrogoal:manual-nutrition-evidence:v1'){
 if(typeof namespace!=='string'||!/^[a-z0-9:_-]{1,100}$/.test(namespace))throw Error('invalid_namespace');
 const getItem=storage.getItem.bind(storage),setItem=storage.setItem.bind(storage),getAllKeys=storage.getAllKeys.bind(storage),removeItem=storage.removeItem.bind(storage);
 const key=(owner,rid)=>{if(!validId(owner)||!validId(rid))throw Error('invalid_identity');return `${namespace}:${owner}:${rid}`;};
 const valid=(e,owner,rid)=>e&&e.version==='manual-evidence-journal-v1'&&e.ownerId===owner&&validId(e.itemId)&&e.request?.itemId===e.itemId&&e.request?.requestId===rid&&e.request.version==='user-entered-v1'&&e.request.kind==='register';
 async function read(owner,rid){const raw=await getItem(key(owner,rid));if(raw===null)return null;const e=JSON.parse(raw);if(!valid(e,owner,rid))throw Error('invalid_journal');return e;}
 return Object.freeze({read,
 async append(entry){const e=JSON.parse(JSON.stringify(entry)),rid=e.request?.requestId,k=key(e.ownerId,rid);if(!valid(e,e.ownerId,rid))throw Error('invalid_journal');const old=await getItem(k);if(old!==null)return equal(JSON.parse(old),e);await setItem(k,JSON.stringify(e));return equal(await read(e.ownerId,rid),e);},
 async listPending(owner,item){if(!validId(owner)||!validId(item))throw Error('invalid_identity');const prefix=`${namespace}:${owner}:`,out=[];for(const k of await getAllKeys()){if(!k.startsWith(prefix))continue;const rid=k.slice(prefix.length);if(!validId(rid))throw Error('invalid_journal_key');const e=await read(owner,rid);if(e&&e.itemId===item)out.push(e);}return out;},
 async clearExact(owner,rid,expected){const k=key(owner,rid),old=await read(owner,rid);if(old===null)return true;if(!valid(expected,owner,rid)||!equal(old,expected))return false;await removeItem(k);return await getItem(k)===null;}
 });
}
