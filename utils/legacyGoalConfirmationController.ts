import type {LegacyRequestJournal} from './legacyConfirmationJournal.ts';
import {legacyGoalConfirmationViewModel,legacyGoalConfirmationIntent,parseLegacyGoalConfirmationRequest,type LegacyGoalConfirmationRequest} from '../release-candidates/tdee-adaptive-review/legacyGoalConfirmation.ts';
type View=ReturnType<typeof legacyGoalConfirmationViewModel>;
export type ConfirmationRpc=(action:'context'|'confirm'|'receipt',request:LegacyGoalConfirmationRequest|null)=>Promise<unknown>;
type Ports={actor:string;rpc:ConfirmationRpc;now:()=>number;requestId:()=>string;isCurrent:()=>boolean;journal:LegacyRequestJournal};
/** Pure session controller. RPC is the sole context/receipt source. No goal write.
 * Pending requests are journaled before submission and recovered without replay.
 */
export function createLegacyConfirmationController(p:Ports){
 let revision=0,busy=false,recovered=false,context:unknown=null,view:View|null=null,pending:LegacyGoalConfirmationRequest|null=null;
 async function recover(){
  if(busy||!p.isCurrent())throw Error('confirmation_unavailable');
  busy=true;
  try{const saved=await p.journal.load(p.actor);
   if(!p.isCurrent())throw Error('confirmation_superseded');
   if(saved){const request=parseLegacyGoalConfirmationRequest(saved.payload,p.actor);
    if(!request||request.requestId!==saved.requestId||saved.operation!=='legacy_ack')throw Error('journal_invalid');
    pending=request;
   }recovered=true;
  }finally{busy=false;}
 }
 const invalidate=()=>{revision++;context=null;view=null;};
 async function read(locale:'en'|'es'){
  if(!recovered||busy||pending||!p.isCurrent())throw Error('confirmation_unavailable');
  const rev=++revision;busy=true;
  try{const c=await p.rpc('context',null);if(rev!==revision||!p.isCurrent())throw Error('confirmation_superseded');
   const v=legacyGoalConfirmationViewModel(c,p.actor,locale,p.now());if(v.kind!=='confirmation_preview')throw Error('confirmation_context_unavailable');
   context=c;view=v;return v;
  }finally{busy=false;}
 }
 async function confirm(){
  if(!recovered||busy||pending||!p.isCurrent()||!view||view.kind!=='confirmation_preview')throw Error('confirmation_unavailable');
  const fresh=legacyGoalConfirmationViewModel(context,p.actor,'en',p.now());
  if(fresh.kind!=='confirmation_preview'){invalidate();throw Error('confirmation_expired');}
  const intent=legacyGoalConfirmationIntent(view.binding,p.actor,'keep_current_targets',p.requestId());
  if(intent.kind!=='intent')throw Error('confirmation_invalid');
  pending=intent.request;
  return send('confirm',true);
 }
 async function send(action:'confirm'|'receipt',prepare=false){
  if(!pending||busy||!p.isCurrent())throw Error('confirmation_unavailable');
  const request=pending,rev=revision;busy=true;
  try{
   if(prepare)await p.journal.prepare({version:1,project:p.journal.project,owner:p.actor,requestId:request.requestId,operation:'legacy_ack',input:{},payload:request,status:'pending'});
   const saved=await p.journal.load(p.actor);
   if(!saved||saved.requestId!==request.requestId||!same(saved.payload,request))throw Error('durable_request_unverified');
   if(!p.isCurrent()||revision!==rev)throw Error('confirmation_superseded');
   const raw=await p.rpc(action,request);
   if(rev!==revision||!p.isCurrent())throw Error('confirmation_superseded');
   if(!raw||typeof raw!=='object')throw Error('confirmation_unverified');
   const r=raw as Record<string,unknown>;
   if(action==='receipt'&&r.version==='legacy-goal-acknowledgment-receipt-v1'&&r.status==='not_found'&&r.actionable===false)return {status:'not_found' as const};
   const at=typeof r.confirmedAt==='string'?Date.parse(r.confirmedAt):NaN;
   if(!Number.isFinite(at)||at>p.now()||at<Math.max(Date.parse(request.binding.goalRevision),Date.parse(request.binding.profileUpdatedAt))||
    typeof r.confirmedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(r.confirmedAt)||
    r.version!=='legacy-goal-acknowledgment-receipt-v1'||r.status!=='confirmed'||
    r.requestId!==request.requestId||r.actionable!==false||r.confirmedAt!==r.observationPeriodStartsAt||
    !same(r.binding,request.binding)||['goalsModified','nutritionalApproval','expenditureVerified','macroAllocationConsent','historicalBaselineAuthorized'].some(k=>r[k]!==false))
     throw Error('confirmation_unverified');
   await p.journal.resolve(p.actor,request.requestId);
   await p.journal.clear(p.actor,request.requestId);
   if(rev!==revision||!p.isCurrent())throw Error('confirmation_superseded');
   pending=null;invalidate();return r;
  }finally{busy=false;}
 }

 return{read,confirm,recover,checkReceipt:()=>send('receipt'),retry:()=>send('confirm'),cancel:invalidate,invalidate,isBusy:()=>busy,hasUnresolved:()=>pending!==null};
}
function same(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return false;
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
 return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));
}

/** A cancelled view may finish its own flight; a replaced account/controller may not. */
export function ownsLegacyConfirmationFlight(current:{owner:string|undefined;controller:unknown;flight:unknown},captured:{owner:string;controller:unknown;flight:unknown}):boolean{
 return !!current.owner&&current.owner===captured.owner&&current.controller===captured.controller&&current.flight===captured.flight;
}
