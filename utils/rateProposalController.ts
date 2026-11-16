import {canonicalRateJson,decodeRateProposalRecord,type RateProposalRecord,type RateAcceptanceRequest} from '../release-candidates/tdee-adaptive-review/rateProposalRecord.ts';
import {verifyRateAcceptanceChain,type CommittedRateReceipt} from '../release-candidates/tdee-adaptive-review/rateAcceptanceChain.ts';
import type {RateRequestJournal} from './rateAcceptanceJournal.ts';
export const RATE_REVIEW_UI_RELEASE=Object.freeze({enabled:false} as const);
type Obj=Record<string,any>;const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const same=(a:unknown,b:unknown)=>canonicalRateJson(a)===canonicalRateJson(b);
export type RatePreview={record:RateProposalRecord;current:{calories:number;proteinG:number;carbsG:number;fatsG:number;fiberG:number};target:RatePreview['current'];expiresAt:number};
export type RateClientPorts={actor:string;journal:RateRequestJournal;now:()=>number;requestId:()=>string;isCurrent:()=>boolean;digestText:(text:string)=>Promise<string>;
 offer:()=>Promise<unknown>;accept:(q:RateAcceptanceRequest)=>Promise<unknown>;receipt:(q:RateAcceptanceRequest)=>Promise<unknown>;chain:()=>Promise<unknown>;goal:()=>Promise<unknown>;onVerified:(receipt:CommittedRateReceipt,goal:Obj)=>Promise<void>};
export type RateClientResult={status:'idle'}|{status:'unresolved';canRetry:boolean}|{status:'rejected';reason:string}|{status:'committed';refreshFailed:boolean};
export async function parseRateClientOffer(raw:unknown,actor:string,now:number,digestText:RateClientPorts['digestText']):Promise<RatePreview>{
 if(!obj(raw)||raw.reason!=='review_available'||raw.mayHaveWritten!==true||!obj(raw.proposal))throw Error('rate_offer_unavailable');
 const p=raw.proposal;const r=await decodeRateProposalRecord(canonicalRateJson(p),{ownerId:actor,proposalId:p.id,digest:p.digest},now,digestText);
 if(!r||r.payload.engineVersion!=='rate-review-14d-v1')throw Error('rate_offer_unavailable');
 for(const side of ['current','target'])for(const k of ['calories','proteinG','carbsG','fatsG','fiberG'])if(!Number.isSafeInteger(r.payload[side]?.[k])||r.payload[side][k]<0||r.payload[side][k]>10000)throw Error('rate_offer_invalid');
 if(!Number.isSafeInteger(r.payload.deltaKcal)||r.payload.target.calories-r.payload.current.calories!==r.payload.deltaKcal||Math.abs(r.payload.deltaKcal)>200||r.payload.deltaKcal===0)throw Error('rate_offer_invalid');
 const ref=r.payload.anchorReference;if(!obj(ref)||Object.keys(ref).sort().join(',')!=='ownerId,sourceGoalId,sourceRequestId,version'||ref.ownerId!==actor||!uuid(ref.sourceGoalId)||!uuid(ref.sourceRequestId)||!Number.isSafeInteger(ref.version)||ref.version<1)throw Error('rate_offer_invalid');
 return {record:r,current:structuredClone(r.payload.current),target:structuredClone(r.payload.target),expiresAt:r.expiresAt};
}
/** Durable isolated rate acceptance. Recovery reads only; every accept/retry is explicit. */
export function createRateProposalController(p:RateClientPorts){
 let busy=false,recovered=false,epoch=0,preview:RatePreview|null=null,pending:{request:RateAcceptanceRequest;record:RateProposalRecord}|null=null;
 const current=()=>{if(!p.isCurrent())throw Error('rate_account_changed');};
 const available=()=>{current();if(busy)throw Error('rate_busy');};
 const offerEnvelope=(record:unknown)=>({reason:'review_available',mayHaveWritten:true,proposal:record});
 const checkPending=async()=>{if(!pending)throw Error('rate_pending_required');const entry=await p.journal.load(p.actor);current();if(!entry||entry.operation!=='rate_accept'||entry.requestId!==pending.request.requestId||!same(entry.payload,pending))throw Error('rate_durable_request_unverified');};
 const canRetry=()=>!!pending; // Exact retry may settle an expired request as rejected; server revalidates.
 async function recover(){available();busy=true;try{const saved=await p.journal.load(p.actor);current();if(saved){
  if(saved.operation!=='rate_accept'||!obj(saved.payload)||!obj(saved.payload.request)||!obj(saved.payload.record))throw Error('rate_journal_invalid');
  const rawRecord=saved.payload.record;const restored=await parseRateClientOffer(offerEnvelope(rawRecord),p.actor,rawRecord.expiresAt-1,p.digestText);current();const record=restored.record;
  const q=saved.payload.request,expected={version:'rate-acceptance-request-v1',ownerId:p.actor,requestId:saved.requestId,rateProposalId:record.id,rateProposalDigest:record.digest,anchorReference:record.payload.anchorReference};
  if(!uuid(saved.requestId)||!same(q,expected))throw Error('rate_journal_invalid');pending={request:q as RateAcceptanceRequest,record:record as RateProposalRecord};
 }recovered=true;return pending?{status:'unresolved' as const,canRetry:canRetry()}:{status:'idle' as const};}finally{busy=false;}}
 async function review(){available();if(!recovered||pending)throw Error('rate_pending_unresolved');busy=true;const rev=++epoch;try{const raw=await p.offer();current();if(rev!==epoch)throw Error('rate_view_changed');const next=await parseRateClientOffer(raw,p.actor,p.now(),p.digestText);current();if(rev!==epoch)throw Error('rate_view_changed');preview=next;return next;}finally{busy=false;}}
 async function resolve(raw:unknown):Promise<RateClientResult>{
  current();if(!pending||!obj(raw))throw Error('rate_receipt_unverified');const q=pending.request;
  if(raw.version==='rate-acceptance-receipt-v1'&&raw.status==='not_found'&&raw.actionable===false&&same(raw.request,q))return {status:'unresolved',canRetry:canRetry()};
  if(raw.version!=='rate-acceptance-receipt-v1'||!same(raw.request,q))throw Error('rate_receipt_unverified');
  if(raw.status==='rejected'){
   if(Object.keys(raw).sort().join(',')!=='reason,request,status,version'||typeof raw.reason!=='string'||!raw.reason||raw.reason.length>128)throw Error('rate_receipt_unverified');
   await p.journal.resolve(p.actor,q.requestId);current();await p.journal.clear(p.actor,q.requestId);current();pending=null;preview=null;return {status:'rejected',reason:raw.reason};
  }
  if(raw.status!=='committed')throw Error('rate_receipt_unverified');
  // Verify complete authoritative current chain and exact returned committed receipt.
  const source=await p.chain();current();const verified=await verifyRateAcceptanceChain(source,p.now(),p.digestText);current();
  if(!obj(source)||source.ownerId!==p.actor||!Array.isArray(source.rows)||!source.rows.some(row=>obj(row)&&same(row.receipt,raw))||!same(verified.anchorReference,q.anchorReference))throw Error('rate_chain_unverified');
  const readback=await p.goal();current();if(!obj(readback)||readback.ownerId!==p.actor||!same(readback.goal,verified.currentGoal)||readback.goal.user_id!==p.actor)throw Error('rate_goal_unverified');
  // Only now is the effect resolved. Refresh/events never use proposed target values.
  await p.journal.resolve(p.actor,q.requestId);current();await p.journal.clear(p.actor,q.requestId);current();pending=null;preview=null;
  let refreshFailed=false;try{await p.onVerified(raw as CommittedRateReceipt,verified.currentGoal);current();}catch{refreshFailed=true;}
  return {status:'committed',refreshFailed};
 }
 async function send(mode:'accept'|'receipt',prepare=false):Promise<RateClientResult>{
  available();if(!recovered||!pending)throw Error('rate_unavailable');busy=true;
  try{if(prepare)await p.journal.prepare({version:1,project:p.journal.project,owner:p.actor,requestId:pending.request.requestId,operation:'rate_accept',input:{},payload:pending,status:'pending'});
   await checkPending();current();const raw=await (mode==='accept'?p.accept(pending.request):p.receipt(pending.request));current();return await resolve(raw);
  }finally{busy=false;}
 }
 async function accept(){available();if(!recovered||pending||!preview)throw Error('rate_unavailable');const bound=preview,rev=epoch;
  const fresh=await parseRateClientOffer(offerEnvelope(bound.record),p.actor,p.now(),p.digestText);current();if(rev!==epoch||preview!==bound||busy||pending)throw Error('rate_view_changed');
  const requestId=p.requestId();if(!uuid(requestId))throw Error('rate_request_invalid');pending={record:fresh.record,request:{version:'rate-acceptance-request-v1',ownerId:p.actor,requestId,rateProposalId:fresh.record.id,rateProposalDigest:fresh.record.digest,anchorReference:structuredClone(fresh.record.payload.anchorReference)}};
  return send('accept',true);
 }
 async function retry(){available();if(!pending)throw Error('rate_pending_required');return send('accept');}
 return {recover,review,accept,retry,check:()=>send('receipt'),close:()=>{epoch++;preview=null;},isBusy:()=>busy,hasPending:()=>!!pending,canRetry,pendingPreview:()=>pending?{current:pending.record.payload.current,target:pending.record.payload.target,expiresAt:pending.record.expiresAt}:null};
}
