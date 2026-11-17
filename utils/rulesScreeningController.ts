import type {RulesScreeningRequestJournal} from './rulesScreeningJournal.ts';
export const RULES_SCREENING_UI_RELEASE=Object.freeze({enabled:true} as const);
export const RULES_SCREENING_COPY_VERSION='rules-screening-copy-v1';
export type ScreeningResponse='eligible'|'restricted'|'unsure'|'revoked';
export type ScreeningRequest={version:'rules-screening-request-v1';requestId:string;response:ScreeningResponse;copyVersion:typeof RULES_SCREENING_COPY_VERSION;profileBinding:string;journeyBinding:string;profileUpdatedAt:string};
export type ScreeningContext={version:'rules-screening-v1';ownerId:string;copyVersion:typeof RULES_SCREENING_COPY_VERSION;profileBinding:string;journeyBinding:string;profileUpdatedAt:string;current:boolean;response:ScreeningResponse|null;acceptedAt:string|null;expiresAt:string|null;requestId:string|null;rowVersion:number};
type Ports={owner:string;now():number;newRequestId():string;isCurrent():boolean;journal:RulesScreeningRequestJournal;rpc(action:'read'|'confirm'|'receipt',request:ScreeningRequest|null):Promise<unknown>};
const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v),hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const responses=['eligible','restricted','unsure','revoked'];
const exact=(a:unknown,b:unknown):boolean=>{if(a===b)return true;if(!obj(a)||!obj(b))return false;return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&exact(a[k],b[k]));};
export function parseScreeningRequest(v:unknown):ScreeningRequest{
 if(!obj(v)||Object.keys(v).sort().join(',')!=='copyVersion,journeyBinding,profileBinding,profileUpdatedAt,requestId,response,version'||v.version!=='rules-screening-request-v1'||v.copyVersion!==RULES_SCREENING_COPY_VERSION||!uuid(v.requestId)||!responses.includes(v.response)||!hash(v.profileBinding)||!hash(v.journeyBinding)||typeof v.profileUpdatedAt!=='string'||v.profileUpdatedAt.length>64||!Number.isFinite(Date.parse(v.profileUpdatedAt)))throw Error('screening_request_invalid');return structuredClone(v) as ScreeningRequest;
}
export function parseScreeningContext(v:unknown,owner:string):ScreeningContext{
 if(!obj(v)||v.version!=='rules-screening-v1'||v.ownerId!==owner||v.copyVersion!==RULES_SCREENING_COPY_VERSION||!hash(v.profileBinding)||!hash(v.journeyBinding)||typeof v.profileUpdatedAt!=='string'||v.profileUpdatedAt.length>64||!Number.isFinite(Date.parse(v.profileUpdatedAt))||typeof v.current!=='boolean'||!Number.isSafeInteger(v.rowVersion)||v.rowVersion<0||!(v.response===null||responses.includes(v.response)))throw Error('screening_context_unverified');
 if(v.response===null){if(v.requestId!==null||v.acceptedAt!==null||v.expiresAt!==null||v.current)throw Error('screening_context_unverified');}
 else if(!uuid(v.requestId)||typeof v.acceptedAt!=='string'||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.acceptedAt))||!Number.isFinite(Date.parse(v.expiresAt))||Date.parse(v.expiresAt)<=Date.parse(v.acceptedAt))throw Error('screening_context_unverified');
 return structuredClone(v) as ScreeningContext;
}
/** No default choice. User confirms only the aggregate response, never medical details. */
export function createRulesScreeningController(p:Ports){let busy=false,recovered=false,epoch=0,context:ScreeningContext|null=null,pending:ScreeningRequest|null=null;
 const available=()=>{if(busy||!p.isCurrent())throw Error('screening_unavailable');};const current=()=>{if(!p.isCurrent())throw Error('screening_account_changed');};
 async function recover(){available();busy=true;try{const saved=await p.journal.load(p.owner);current();if(saved){const q=parseScreeningRequest(saved.payload);if(saved.operation!=='rules_screening'||q.requestId!==saved.requestId)throw Error('screening_journal_invalid');pending=q;}recovered=true;return pending?'pending':'idle';}finally{busy=false;}}
 async function read(){available();if(!recovered||pending)throw Error('screening_pending');busy=true;const rev=++epoch;try{const raw=await p.rpc('read',null);current();if(rev!==epoch)throw Error('screening_view_changed');context=parseScreeningContext(raw,p.owner);return context;}finally{busy=false;}}
 async function send(action:'confirm'|'receipt',prepare=false){available();if(!recovered||!pending)throw Error('screening_unavailable');busy=true;const q=pending;try{
  if(prepare)await p.journal.prepare({version:1,project:p.journal.project,owner:p.owner,requestId:q.requestId,operation:'rules_screening',input:{},payload:q,status:'pending'});
  const saved=await p.journal.load(p.owner);current();if(!saved||saved.requestId!==q.requestId||!exact(saved.payload,q))throw Error('screening_durable_request_unverified');
  const raw=await p.rpc(action,q);current();if(!obj(raw)||raw.version!=='rules-screening-receipt-v1'||!exact(raw.request,q))throw Error('screening_receipt_unverified');
  if(raw.status==='not_found')return {status:'pending' as const};
  if(raw.status!=='recorded')throw Error('screening_receipt_unverified');const receipt=parseScreeningContext(raw.screening,p.owner);
  if(receipt.requestId!==q.requestId||receipt.response!==q.response||receipt.copyVersion!==q.copyVersion||receipt.profileBinding!==q.profileBinding||receipt.journeyBinding!==q.journeyBinding||receipt.profileUpdatedAt!==q.profileUpdatedAt||!receipt.acceptedAt||Date.parse(receipt.acceptedAt)>p.now()||Date.parse(receipt.acceptedAt)<Date.parse(q.profileUpdatedAt))throw Error('screening_receipt_unverified');
  await p.journal.resolve(p.owner,q.requestId);current();await p.journal.clear(p.owner,q.requestId);current();pending=null;context=null;epoch++;return {status:'recorded' as const,response:receipt.response};
 }finally{busy=false;}}
 async function confirm(response:ScreeningResponse){available();if(!recovered||pending||!context||!responses.includes(response))throw Error('screening_unavailable');pending=parseScreeningRequest({version:'rules-screening-request-v1',requestId:p.newRequestId(),response,copyVersion:RULES_SCREENING_COPY_VERSION,profileBinding:context.profileBinding,journeyBinding:context.journeyBinding,profileUpdatedAt:context.profileUpdatedAt});return send('confirm',true);}
 return {recover,read,confirm,check:()=>send('receipt'),retry:()=>send('confirm'),close:()=>{epoch++;context=null;},hasPending:()=>!!pending,pendingResponse:()=>pending?.response??null};
}
