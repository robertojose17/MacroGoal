import {prepareAcceptedIntakeRateAnchor, type AcceptedIntakeRateAnchor} from './acceptedIntakeRateAnchor.ts';
export const RATE_ANCHOR_PERSISTENCE_RELEASE=Object.freeze({enabled:false} as const);
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const block=(reason:string)=>({kind:'blocked' as const,actionable:false as const,reason});
/** Trusted coherent SQL source only, not request input. All versions are immutable.
 * A write must lock the owner and recompute this plan against current database
 * source and latest head in that transaction; this plan is not write authority.
 */
export function planRateAnchorAppend(source:unknown,actor:string,now:number,expectedVersion:number){
 if(!obj(source)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>=Number.MAX_SAFE_INTEGER)return block('anchor_cas_invalid');
 const head=source.existingAnchor;
 if(head!==null){
  if(!obj(head)||head.kind!=='rate_anchor_head'||head.ownerId!==actor||!Number.isSafeInteger(head.version)||head.version!==expectedVersion||!obj(head.anchor))return block('anchor_head_unavailable');
  const a=head.anchor;
  if(a.contract!=='accepted-intake-rate-anchor-v1'||a.ownerId!==actor||!obj(a.sourceReceipt)||!obj(source.receipt)||!obj(source.currentGoal))return block('anchor_head_invalid');
  // Changed profile alone, repeated receipt, or journey restart alone is NOT a new acceptance.
  if(source.receipt.request_id===a.sourceReceipt.requestId||source.currentGoal.id===a.initialGoalId)return block('anchor_reset_forbidden');
  if(!Number.isSafeInteger(a.acceptedAt)||Date.parse(String(source.currentGoal.created_at))<=(a.acceptedAt as number))return block('anchor_acceptance_not_newer');
  if(!obj(source.receipt.payload)||source.receipt.payload.operation!=='manual_goal')return block('anchor_replacement_requires_manual_receipt');
 }else if(expectedVersion!==0)return block('anchor_cas_conflict');
 const built=prepareAcceptedIntakeRateAnchor({...source,existingAnchor:null},actor,now);
 if(built.kind!=='rate_anchor_draft')return built;
 return {kind:'append_plan' as const,actionable:false as const,persistenceAuthorized:false as const,
  ownerId:actor,expectedVersion,nextVersion:expectedVersion+1,
  replacesVersion:expectedVersion===0?null:expectedVersion,anchor:built.anchor};
}
/** Exact provenance binding: false after manual goal, restart, or profile change.
 * This initial-only reader deliberately does not pretend adaptive chain support.
 */
export function isInitialRateAnchorCurrent(anchor:AcceptedIntakeRateAnchor,source:unknown,actor:string,now:number):boolean{
 const built=obj(source)?prepareAcceptedIntakeRateAnchor({...source,existingAnchor:null},actor,now):null;
 if(built?.kind!=='rate_anchor_draft')return false;
 const b=built.anchor;
 const equal=(x:unknown,y:unknown):boolean=>x===y||(obj(x)&&obj(y)&&Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&equal(x[k],y[k])))||(Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&x.every((v,i)=>equal(v,y[i])));
 return equal(anchor,b);
}
