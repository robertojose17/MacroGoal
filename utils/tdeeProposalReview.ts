/** TDEE-only explicit acceptance. Storage holds identifiers, never targets or tokens. */
export type TdeeTargets={calories:number;proteinG:number;carbsG:number;fatsG:number;fiberG:number};
export type TdeeProposal={type:'persisted_reviewed_proposal';actionable:true;ownerId:string;id:string;digest:string;policyVersion:string;engineVersion:string;expiresAt:string;current:TdeeTargets;target:TdeeTargets;deltaKcal:number;sourceDate:string};
export type TdeeAcceptRequest={ownerId:string;requestId:string;proposalId:string;proposalDigest:string};
export type TdeeOffer={version:'adaptive-offer-v1';request:TdeeAcceptRequest;status:'available';proposal:TdeeProposal}|{version:'adaptive-offer-v1';request:TdeeAcceptRequest;status:'expired'|'consumed'|'unavailable'|'not_found';proposal:null};
export type TdeeReceipt={version:'adaptive-receipt-v1';status:'committed';request:TdeeAcceptRequest;acceptedGoal:{id:string;updatedAt:string};goalState:'current'|'superseded'}|{version:'adaptive-receipt-v1';status:'rejected';request:TdeeAcceptRequest;reason:string}|{version:'adaptive-receipt-v1';status:'not_found';request:TdeeAcceptRequest};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('invalid_proposal');return v as Record<string,unknown>;};
const string=(v:unknown)=>{if(typeof v!=='string'||!v||v.length>200)throw Error('invalid_proposal');return v;};
const uuid=(v:unknown)=>{const s=string(v);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s))throw Error('invalid_proposal');return s;};
const digest=(v:unknown)=>{const s=string(v);if(!/^[a-f0-9]{64}$/.test(s))throw Error('invalid_proposal');return s;};
const iso=(v:unknown)=>{const s=string(v);if(!Number.isFinite(Date.parse(s)))throw Error('invalid_proposal');return s;};
function targets(v:unknown):TdeeTargets {const x=obj(v);for(const k of ['calories','proteinG','carbsG','fatsG','fiberG'])if(!Number.isSafeInteger(x[k])||(x[k] as number)<0)throw Error('invalid_proposal');if(x.calories===0)throw Error('invalid_proposal');return {calories:x.calories as number,proteinG:x.proteinG as number,carbsG:x.carbsG as number,fatsG:x.fatsG as number,fiberG:x.fiberG as number};}
export function parseTdeeProposal(raw:unknown,owner:string,now=Date.now()):TdeeProposal {
 const v=obj(raw),current=targets(v.current),target=targets(v.target),expiresAt=iso(v.expiresAt),sourceDate=string(v.sourceDate);
 if(v.type!=='persisted_reviewed_proposal'||v.actionable!==true||v.ownerId!==owner||Date.parse(expiresAt)<=now||!Number.isSafeInteger(v.deltaKcal)||v.deltaKcal!==target.calories-current.calories||!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)||!Number.isFinite(Date.parse(sourceDate))||new Date(sourceDate+'T12:00:00Z').toISOString().slice(0,10)!==sourceDate)throw Error('invalid_proposal');
 return {type:'persisted_reviewed_proposal',actionable:true,ownerId:uuid(v.ownerId),id:uuid(v.id),digest:digest(v.digest),policyVersion:string(v.policyVersion),engineVersion:string(v.engineVersion),expiresAt,current,target,deltaKcal:v.deltaKcal as number,sourceDate};
}
export function parseTdeeAcceptRequest(raw:unknown,owner:string):TdeeAcceptRequest {const v=obj(raw);if(v.ownerId!==owner)throw Error('account_changed');return {ownerId:uuid(v.ownerId),requestId:uuid(v.requestId),proposalId:uuid(v.proposalId),proposalDigest:digest(v.proposalDigest)};}
function sameRequest(a:TdeeAcceptRequest,b:TdeeAcceptRequest){return a.ownerId===b.ownerId&&a.requestId===b.requestId&&a.proposalId===b.proposalId&&a.proposalDigest===b.proposalDigest;}
export function parseTdeeReceipt(raw:unknown,request:TdeeAcceptRequest):TdeeReceipt {
 const v=obj(raw);if(v.version!=='adaptive-receipt-v1')throw Error('invalid_receipt');
 if(v.status==='not_found')return {version:'adaptive-receipt-v1',status:'not_found',request};
 const echo=parseTdeeAcceptRequest(v.request,request.ownerId);if(!sameRequest(echo,request))throw Error('invalid_receipt');
 if(v.status==='committed'){const goal=obj(v.acceptedGoal);if(v.goalState!=='current'&&v.goalState!=='superseded')throw Error('invalid_receipt');return {version:'adaptive-receipt-v1',status:'committed',request:echo,acceptedGoal:{id:uuid(goal.id),updatedAt:iso(goal.updatedAt)},goalState:v.goalState};}
 if(v.status==='rejected')return {version:'adaptive-receipt-v1',status:'rejected',request:echo,reason:string(v.reason)};
 throw Error('invalid_receipt');
}
export function parseTdeeOffer(raw:unknown,request:TdeeAcceptRequest):TdeeOffer {
 const v=obj(raw),echo=parseTdeeAcceptRequest(v.request,request.ownerId);if(v.version!=='adaptive-offer-v1'||!sameRequest(echo,request))throw Error('invalid_offer');
 if(v.status==='available'){const proposal=parseTdeeProposal(v.proposal,request.ownerId);if(proposal.id!==request.proposalId||proposal.digest!==request.proposalDigest)throw Error('invalid_offer');return {version:'adaptive-offer-v1',request:echo,status:'available',proposal};}
 if(!['expired','consumed','unavailable','not_found'].includes(String(v.status))||v.proposal!==null)throw Error('invalid_offer');
 return {version:'adaptive-offer-v1',request:echo,status:v.status as 'expired'|'consumed'|'unavailable'|'not_found',proposal:null};
}
export type TdeeReviewServices={
 actor:()=>string|undefined;newRequestId:()=>string;
 readPending:(owner:string)=>Promise<unknown|null>;writePending:(owner:string,request:TdeeAcceptRequest)=>Promise<void>;clearPending:(request:TdeeAcceptRequest)=>Promise<void>;
 accept:(request:TdeeAcceptRequest)=>Promise<unknown>;receipt:(request:TdeeAcceptRequest)=>Promise<unknown>;
 offer:(request:TdeeAcceptRequest)=>Promise<unknown>;closeExpired:(request:TdeeAcceptRequest)=>Promise<unknown>;
 onCommitted?:(receipt:Extract<TdeeReceipt,{status:'committed'}>)=>void|Promise<void>;
};
export type ReviewResult={status:'idle'}|{status:'unresolved';request:TdeeAcceptRequest;offer?:TdeeOffer}|{status:'resolved';receipt:Exclude<TdeeReceipt,{status:'not_found'}>};
const actorFlights=new Set<string>();
/** One instance per mounted review surface. The durable journal protects across remounts. */
export function createTdeeReviewController(service:TdeeReviewServices){
 let busy=false;
 const run=async<T>(work:()=>Promise<T>):Promise<T>=>{const owner=service.actor();if(!owner)throw Error('account_changed');if(busy||actorFlights.has(owner))throw Error('review_busy');busy=true;actorFlights.add(owner);try{return await work();}finally{busy=false;actorFlights.delete(owner);}};
 const actor=()=>{const value=service.actor();if(!value)throw Error('account_changed');return value;};
 const current=(owner:string)=>{if(service.actor()!==owner)throw Error('account_changed');};
 const finish=async(raw:unknown,request:TdeeAcceptRequest):Promise<ReviewResult>=>{
  current(request.ownerId);const receipt=parseTdeeReceipt(raw,request);
  if(receipt.status==='not_found')return {status:'unresolved',request};
  let cleanupError:unknown;
  try{await service.clearPending(request);}catch(error){cleanupError=error;}
  current(request.ownerId);
  if(receipt.status==='committed')try{await service.onCommitted?.(receipt);}catch{/* Readback failure does not undo the verified commit. */}
  current(request.ownerId);if(cleanupError)throw cleanupError;return {status:'resolved',receipt};
 };
 const recoverRequest=async(request:TdeeAcceptRequest):Promise<ReviewResult>=>{
  try{const result=await finish(await service.receipt(request),request);if(result.status!=='unresolved')return result;
   const raw=await service.offer(request);current(request.ownerId);return {status:'unresolved',request,offer:parseTdeeOffer(raw,request)};
  }catch{current(request.ownerId);return {status:'unresolved',request};}
 };
 const requirePending=async(request:TdeeAcceptRequest)=>{const owner=actor();parseTdeeAcceptRequest(request,owner);const raw=await service.readPending(owner);current(owner);if(raw===null||!sameRequest(parseTdeeAcceptRequest(raw,owner),request))throw Error('pending_changed');};
 return {
  get busy(){return busy;},
  recover:()=>run(async():Promise<ReviewResult>=>{const owner=actor(),raw=await service.readPending(owner);current(owner);if(raw===null)return {status:'idle'};return recoverRequest(parseTdeeAcceptRequest(raw,owner));}),
  retryReviewed:(offer:TdeeOffer)=>run(async():Promise<ReviewResult>=>{
   // Called only after the exact recovered targets are displayed and explicitly accepted.
   const request=offer.request;await requirePending(request);const checked=parseTdeeOffer(offer,request);if(checked.status!=='available')throw Error('offer_unavailable');
   try{return await finish(await service.accept(request),request);}catch{current(request.ownerId);return recoverRequest(request);}
  }),
  closeExpired:(request:TdeeAcceptRequest)=>run(async():Promise<ReviewResult>=>{await requirePending(request);try{return await finish(await service.closeExpired(request),request);}catch{current(request.ownerId);return recoverRequest(request);}}),
  accept:(proposal:TdeeProposal)=>run(async():Promise<ReviewResult>=>{
   const owner=actor();parseTdeeProposal(proposal,owner);const prior=await service.readPending(owner);current(owner);
   if(prior!==null)return recoverRequest(parseTdeeAcceptRequest(prior,owner));
   const request=parseTdeeAcceptRequest({ownerId:owner,requestId:service.newRequestId(),proposalId:proposal.id,proposalDigest:proposal.digest},owner);
   // Must persist successfully before any mutation; storage failure is fail closed.
   await service.writePending(owner,request);
   // Known-unsent failures may clear only this request while its actor is still current.
   // Once accept() is invoked, every error is ambiguous and retains its request identity.
   try{current(owner);parseTdeeProposal(proposal,owner);}catch(error){if(service.actor()===owner)await service.clearPending(request);throw error;}
   try{return await finish(await service.accept(request),request);}catch{current(owner);return recoverRequest(request);}
  })
 };
}
