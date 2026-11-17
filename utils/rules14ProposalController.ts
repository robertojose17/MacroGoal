import {parseRules14Hold,type Rules14Hold} from './rules14Hold.ts';
import {canonicalRateJson} from '../release-candidates/tdee-adaptive-review/rateProposalRecord.ts';
import {decodeRules14Record,rules14AcceptanceRequest,type Rules14Record} from '../release-candidates/tdee-adaptive-review/rules14Proposal.ts';
import type {Rules14RequestJournal} from './rules14AcceptanceJournal.ts';
export const RULES14_REVIEW_UI_RELEASE=Object.freeze({enabled:true} as const);
type Obj=Record<string,any>;const obj=(x:unknown):x is Obj=>!!x&&typeof x==='object'&&!Array.isArray(x),same=(a:unknown,b:unknown)=>canonicalRateJson(a)===canonicalRateJson(b);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v),hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export type Rules14Request=ReturnType<typeof rules14AcceptanceRequest>;
type Targets={calories:number;proteinG:number;carbsG:number;fatsG:number;fiberG:number};
export type Rules14Preview={current:Targets;target:Targets;allocationMode:string;policyBinding:Obj;goalId:string;goalRevision:string;expiresAt:number};
export type Rules14ClientPorts={actor:string;now():number;requestId():string;isCurrent():boolean;digestText(s:string):Promise<string>;journal:Rules14RequestJournal;
 offer():Promise<unknown>;accept(q:Rules14Request):Promise<unknown>;receipt(q:Rules14Request):Promise<unknown>;chain():Promise<unknown>;goal():Promise<unknown>;
 verifyChain(source:unknown,now:number):Promise<{kind:string;anchorReference:unknown;currentGoal:Obj;receiptsVerified:true;actionable:false;acceptanceAuthorized:false}>;
 onVerified(receipt:Obj,goal:Obj):Promise<void>};
export type Rules14ClientResult={status:'hold';hold:Rules14Hold}|{status:'unresolved'}|{status:'review_changed';preview:Rules14Preview}|{status:'rejected';reason:string}|{status:'committed';refreshFailed:boolean};
function validTargets(v:unknown):v is Targets{return obj(v)&&Object.keys(v).sort().join(',')==='calories,carbsG,fatsG,fiberG,proteinG'&&Object.values(v).every(n=>Number.isSafeInteger(n)&&n>=0&&n<=10000);}
function validatePreview(v:unknown,allowHistorical=false):Rules14Preview{
 if(!obj(v)||Object.keys(v).sort().join(',')!=='allocationMode,current,expiresAt,goalId,goalRevision,policyBinding,target'||!validTargets(v.current)||!validTargets(v.target)||!['manual-percent-nearest-gram-v1','smart-preserve-adequate-protein-v1'].includes(v.allocationMode)||(!obj(v.policyBinding)||Object.keys(v.policyBinding).sort().join(',')!=='digest,engineVersion,revision,version')||!uuid(v.goalId)||typeof v.goalRevision!=='string'||v.goalRevision.length>64||!Number.isFinite(Date.parse(v.goalRevision))||!Number.isSafeInteger(v.expiresAt)||!hash(v.policyBinding.digest)||!(v.policyBinding.engineVersion==='rules14-observed-v2'||(allowHistorical&&v.policyBinding.engineVersion==='rules14-v1'))||typeof v.policyBinding.version!=='string'||v.policyBinding.version.length<1||v.policyBinding.version.length>128||!Number.isSafeInteger(v.policyBinding.revision)||v.policyBinding.revision<1)throw Error('rules14_preview_invalid');return structuredClone(v) as Rules14Preview;
}
function previewOf(r:Rules14Record,allowHistorical=false){return validatePreview({current:r.payload.current,target:r.payload.target,allocationMode:r.payload.allocationMode,policyBinding:r.payload.policyBinding,goalId:r.payload.goalSnapshot?.id,goalRevision:r.payload.goalSnapshot?.updated_at,expiresAt:r.expiresAt},allowHistorical);}
export function rules14ConsentBinding(preview:Rules14Preview){const {expiresAt,...binding}=preview;return binding;}
export async function parseRules14ClientOffer(raw:unknown,actor:string,now:number,digestText:Rules14ClientPorts['digestText']){
 if(!obj(raw)||raw.reason!=='review_available'||raw.mayHaveWritten!==true)throw Error('rules14_offer_unavailable');const r=await decodeRules14Record(raw.proposal,actor,now,digestText);if(!r)throw Error('rules14_offer_unavailable');const preview=previewOf(r);
 if(!Number.isSafeInteger(r.payload.deltaKcal)||r.payload.deltaKcal===0||Math.abs(r.payload.deltaKcal)>200||preview.target.calories-preview.current.calories!==r.payload.deltaKcal)throw Error('rules14_offer_invalid');return {record:r,preview};
}
function parsePending(v:unknown,actor:string){
 if(!obj(v)||Object.keys(v).sort().join(',')!=='preview,request'||!obj(v.request))throw Error('rules14_journal_invalid');const q=v.request;
 if(Object.keys(q).sort().join(',')!=='anchorReference,ownerId,rateProposalDigest,rateProposalId,requestId,version'||q.version!=='rules14-acceptance-request-v1'||q.ownerId!==actor||!uuid(q.requestId)||!uuid(q.rateProposalId)||!hash(q.rateProposalDigest)||(!obj(q.anchorReference)||Object.keys(q.anchorReference).sort().join(',')!=='ownerId,sourceGoalId,sourceRequestId,version')||q.anchorReference.ownerId!==actor||!uuid(q.anchorReference.sourceGoalId)||!uuid(q.anchorReference.sourceRequestId)||!Number.isSafeInteger(q.anchorReference.version)||q.anchorReference.version<1)throw Error('rules14_journal_invalid');
 return {request:structuredClone(q) as Rules14Request,preview:validatePreview(v.preview,true)};
}
/** Isolated rules14 contract. No automatic writes, no fake reviewed/clinical evidence. */
export function createRules14ProposalController(p:Rules14ClientPorts){
 let busy=false,recovered=false,epoch=0,shown:Awaited<ReturnType<typeof parseRules14ClientOffer>>|null=null,pending:ReturnType<typeof parsePending>|null=null;
 const current=()=>{if(!p.isCurrent())throw Error('rules14_account_changed');};const available=()=>{current();if(busy)throw Error('rules14_busy');};
 async function recover(){available();busy=true;try{const saved=await p.journal.load(p.actor);current();if(saved){pending=parsePending(saved.payload,p.actor);if(saved.operation!=='rules14_accept'||saved.requestId!==pending.request.requestId)throw Error('rules14_journal_invalid');}recovered=true;return pending?'pending':'idle';}finally{busy=false;}}
 async function load(){const raw=await p.offer();return parseRules14Hold(raw)??await parseRules14ClientOffer(raw,p.actor,p.now(),p.digestText);}
 async function review(){available();if(!recovered||pending)throw Error('rules14_pending');busy=true;const rev=++epoch;try{const next=await load();current();if(rev!==epoch)throw Error('rules14_view_changed');if('kind' in next){shown=null;return next;}shown=next;return next.preview;}finally{busy=false;}}
 async function resolve(raw:unknown):Promise<Rules14ClientResult>{
  current();if(!pending||!obj(raw)||raw.version!=='rules14-acceptance-receipt-v1'||!same(raw.request,pending.request))throw Error('rules14_receipt_unverified');const {request:q,preview}=pending;
  if(raw.status==='not_found')return {status:'unresolved'};
  if(raw.status==='rejected'){if(Object.keys(raw).sort().join(',')!=='reason,request,status,version'||typeof raw.reason!=='string'||!raw.reason||raw.reason.length>128)throw Error('rules14_receipt_unverified');await finish();return {status:'rejected',reason:raw.reason};}
  if(raw.status!=='committed')throw Error('rules14_receipt_unverified');const source=await p.chain();current();const verified=await p.verifyChain(source,p.now());current();
  if(verified.kind!=='rules14_chain_verified'||!obj(source)||source.version!=='rules14-chain-source-v1'||source.ownerId!==p.actor||!Array.isArray(source.rows)||!same(verified.anchorReference,q.anchorReference))throw Error('rules14_chain_unverified');
  const row=source.rows.find(x=>obj(x)&&same(x.receipt,raw));if(!row||!same(rules14ConsentBinding(previewOf(row.proposal,true)),rules14ConsentBinding(preview)))throw Error('rules14_saved_targets_mismatch');
  const goal=await p.goal();current();if(!obj(goal)||goal.ownerId!==p.actor||!same(goal.goal,verified.currentGoal)||goal.goal.user_id!==p.actor)throw Error('rules14_goal_unverified');await finish();let refreshFailed=false;try{await p.onVerified(raw,verified.currentGoal);current();}catch{refreshFailed=true;}return {status:'committed',refreshFailed};
 }
 async function finish(){if(!pending)throw Error('rules14_pending');const q=pending.request;await p.journal.resolve(p.actor,q.requestId);current();await p.journal.clear(p.actor,q.requestId);current();pending=null;shown=null;}
 async function send(mode:'accept'|'receipt',prepare=false){if(!pending)throw Error('rules14_pending');if(prepare)await p.journal.prepare({version:1,project:p.journal.project,owner:p.actor,requestId:pending.request.requestId,operation:'rules14_accept',input:{},payload:pending,status:'pending'});const saved=await p.journal.load(p.actor);current();if(!saved||saved.requestId!==pending.request.requestId||!same(saved.payload,pending))throw Error('rules14_durable_request_unverified');const raw=await(mode==='accept'?p.accept(pending.request):p.receipt(pending.request));current();return resolve(raw);}
 async function accept():Promise<Rules14ClientResult>{
  available();if(!recovered||pending||!shown)throw Error('rules14_unavailable');busy=true;const rev=epoch,original=shown;
  try{let next=shown;if(next.record.expiresAt<=p.now()){
    const refreshed=await load();current();if(epoch!==rev)throw Error('rules14_view_changed');if('kind' in refreshed){shown=null;return {status:'hold',hold:refreshed};}next=refreshed;shown=next;
    // The explicit click authorizes only the same visible targets/allocation/policy/goal.
    if(!same(rules14ConsentBinding(next.preview),rules14ConsentBinding(original.preview))||!same(next.record.payload.anchorReference,original.record.payload.anchorReference))return {status:'review_changed',preview:next.preview};
   }
   current();if(epoch!==rev||next.record.expiresAt<=p.now())throw Error('rules14_offer_expired');
   pending=parsePending({request:rules14AcceptanceRequest(next.record,p.requestId()),preview:next.preview},p.actor);return await send('accept',true);
  }finally{busy=false;}
 }
 async function checkOrRetry(mode:'accept'|'receipt'){available();if(!recovered||!pending)throw Error('rules14_unavailable');busy=true;try{return await send(mode);}finally{busy=false;}}
 return {recover,review,accept,check:()=>checkOrRetry('receipt'),retry:()=>checkOrRetry('accept'),close:()=>{epoch++;shown=null;},hasPending:()=>!!pending,pendingPreview:()=>pending?.preview??null};
}

