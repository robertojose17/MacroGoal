// Recovered from tool-call source; no UI mounted, no real JWT/durable-storage proof.
import {prepareManualEvidenceFromIntent,prepareManualEvidenceRequest} from './manualNutritionDeclaration.mjs';
const clone=v=>structuredClone(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const result=(status,extra={})=>Object.freeze({status,...extra});
const id=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const equal=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));};
function receiptValid(state,entry){const r=state?.receipt;return state?.version==='logged-nutrition-evidence-state-v1'&&state.ownerId===entry.ownerId&&state.itemId===entry.itemId&&r?.requestId===entry.request.requestId&&/^[a-f0-9]{64}$/.test(r.requestDigest)&&Number.isSafeInteger(r.eventVersion)&&r.eventVersion===entry.request.expectedEvidenceVersion+1&&r.status==='active';}
const receiptOnly=r=>freeze({requestId:r.requestId,requestDigest:r.requestDigest,eventVersion:r.eventVersion,status:r.status});
export function createManualNutritionEvidenceController(ports){
 const {getSession,readEvidence,registerEvidence,journal,newRequestId}=ports;
 const append=journal.append.bind(journal),read=journal.read.bind(journal),listPending=journal.listPending.bind(journal),clearExact=journal.clearExact.bind(journal);
 let alive=true,generation=0,busy=false;const stop=()=>{alive=false;generation++;};
 async function sessionFor(owner,g){if(!alive||generation!==g)throw Error('inactive');const session=await getSession();if(!alive||generation!==g||session?.ownerId!==owner)throw Error('account_changed');return session;}
 async function terminal(entry,receipt,g){let cleared=false;try{cleared=await clearExact(entry.ownerId,entry.request.requestId,clone(entry))===true;}catch{}try{await sessionFor(entry.ownerId,g);}catch{return result('uncertain',{requestId:entry.request.requestId});}return result('receipt_found',{receipt:receiptOnly(receipt),currentEvidenceActive:'not_asserted',cleanupPending:!cleared});}
 async function send(entry,g){const session=await sessionFor(entry.ownerId,g);let response;try{response=await registerEvidence(clone(entry.request),session);}catch{return result('uncertain',{requestId:entry.request.requestId});}try{await sessionFor(entry.ownerId,g);}catch{return result('uncertain',{requestId:entry.request.requestId});}if(!receiptValid(response,entry))return result('uncertain',{requestId:entry.request.requestId});return await terminal(entry,response.receipt,g);}
 async function guarded(work){if(!alive)return result('inactive');if(busy)return result('busy');busy=true;try{return await work(generation);}catch{return result('stopped_without_dispatch');}finally{busy=false;}}
 return Object.freeze({deactivate:stop,
 beginConfirmedLog(input){const captured=clone(input);return guarded(async g=>{
  const {authenticatedOwnerId:owner,confirmedItemId:item}=captured;if(!id(owner)||!id(item))return result('invalid_identity');await sessionFor(owner,g);
  if((await listPending(owner,item)).length)return result('recovery_required');const s=await sessionFor(owner,g);const state=await readEvidence(item,null,s);await sessionFor(owner,g);
  const prepared=prepareManualEvidenceFromIntent({...captured,readState:state,requestId:newRequestId()});if(!prepared.ok)return result('not_registered',{reason:prepared.reason});
  const entry=freeze({version:'manual-evidence-journal-v1',ownerId:owner,itemId:item,request:clone(prepared.request)});
  if(await append(clone(entry))!==true)return result('recovery_required');if(!equal(await read(owner,entry.request.requestId),entry))return result('journal_verification_failed');return await send(entry,g);
 });},
 recover(owner,item,requestId){return guarded(async g=>{
  if(!id(owner)||!id(item)||!id(requestId))return result('invalid_identity');await sessionFor(owner,g);const entry=await read(owner,requestId);if(!entry)return result('nothing_to_recover');
  if(entry.version!=='manual-evidence-journal-v1'||entry.ownerId!==owner||entry.itemId!==item||entry.request?.itemId!==item||entry.request?.requestId!==requestId||entry.request.version!=='user-entered-v1'||entry.request.kind!=='register')return result('invalid_journal');
  const saved=freeze(clone(entry)),s=await sessionFor(owner,g),state=await readEvidence(item,saved.request.requestId,s);await sessionFor(owner,g);
  if(receiptValid(state,saved))return await terminal(saved,state.receipt,g);
  if(state?.version!=='logged-nutrition-evidence-state-v1'||state.ownerId!==owner||state.itemId!==item||state.receipt!==null)return result('uncertain',{requestId:saved.request.requestId});
  const validated=prepareManualEvidenceRequest({declaration:{version:'manual-nutrition-capture-v1',declaredFields:saved.request.declaredFields,values:saved.request.expected?.values},authenticatedOwnerId:owner,confirmedItemId:item,expectedLoggedBinding:saved.request.expected,readState:state,requestId:saved.request.requestId});
  if(!validated.ok||!equal(validated.request,saved.request))return result('stale_or_invalid_journal');if(!equal(await read(owner,requestId),saved))return result('journal_verification_failed');return await send(saved,g);
 });}
 });
}
