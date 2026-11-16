import {planRateAnchorAppend,RATE_ANCHOR_PERSISTENCE_RELEASE} from './rateAnchorPersistencePlan.ts';
export const RATE_ANCHOR_RPC=Object.freeze({source:'tdee_internal_rate_anchor_source_v1',append:'tdee_internal_rate_anchor_append_v1'});
type Obj=Record<string,any>;
const obj=(x:unknown):x is Obj=>!!x&&typeof x==='object'&&!Array.isArray(x);
const uuid=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const equal=(a:unknown,b:unknown):boolean=>a===b||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i])))||(obj(a)&&obj(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k])));
export type AnchorBootstrapPorts={rpc(name:string,args:Record<string,unknown>):Promise<unknown>;now():number};
const stop=(reason:string,mayHaveWritten=false)=>({status:'blocked' as const,reason,mayHaveWritten,actionable:false as const});
function envelope(s:unknown,actor:string,now:number):s is Obj{
 if(!obj(s)||s.version!=='accepted-goal-rate-anchor-source-v1'||s.ownerId!==actor||s.actionable!==false||s.unavailable===true||!obj(s.currentGoal)||!obj(s.receipt))return false;
 const t=typeof s.capturedAt==='string'?Date.parse(s.capturedAt):NaN;
 return Number.isSafeInteger(now)&&Number.isSafeInteger(t)&&t<=now&&now-t<=30000;
}
function head(h:unknown,actor:string):h is Obj{
 return obj(h)&&h.kind==='rate_anchor_head'&&h.ownerId===actor&&Number.isSafeInteger(h.version)&&h.version>0&&uuid(h.sourceRequestId)&&uuid(h.sourceGoalId)&&obj(h.anchor)&&h.anchor.ownerId===actor&&h.anchor.contract==='accepted-intake-rate-anchor-v1'&&h.anchor.initialGoalId===h.sourceGoalId&&obj(h.anchor.sourceReceipt)&&h.anchor.sourceReceipt.requestId===h.sourceRequestId;
}
/** Internal review seam. Only coherent service SQL source, never a client body.
 * Does not establish nutritional approval, eligibility, or a valid adaptive chain.
 * Downstream MUST verify the complete current chain before issuance.
 */
export async function bootstrapRateAnchorForReview(actor:string,p:AnchorBootstrapPorts){
 let writing=false;
 try{
  if(!uuid(actor))return stop('authentication_required');
  const s=await p.rpc(RATE_ANCHOR_RPC.source,{p_owner:actor});
  if(!envelope(s,actor,p.now()))return stop('rate_anchor_source_unavailable');
  const h=s.existingAnchor;
  if(h!==null&&!head(h,actor))return stop('rate_anchor_head_invalid');
  // A saved original receipt may remain the latest receipt after adaptive edits.
  // Never reset that anchor; downstream chain validation decides current validity.
  if(h!==null&&s.receipt.request_id===h.sourceRequestId)return {status:'present' as const,actionable:false as const,mayHaveWritten:false};
  const plan=planRateAnchorAppend(s,actor,p.now(),h===null?0:h.version);
  if(plan.kind!=='append_plan')return stop(plan.reason);
  writing=true;
  const saved=await p.rpc(RATE_ANCHOR_RPC.append,{p_owner:actor,p_expected_version:plan.expectedVersion,p_anchor:structuredClone(plan.anchor)});
  if(obj(saved)&&saved.enabled===false&&saved.actionable===false)return stop('anchor_persistence_contract_off');
  const expected={ownerId:actor,version:plan.nextVersion,sourceRequestId:plan.anchor.sourceReceipt.requestId,sourceGoalId:plan.anchor.initialGoalId,anchor:plan.anchor,actionable:false};
  if(!equal(saved,expected))return stop('anchor_reconciliation_required',true);
  // Independent authoritative readback, not an echoed mutation response.
  const readback=await p.rpc(RATE_ANCHOR_RPC.source,{p_owner:actor});
  const expectedHead={kind:'rate_anchor_head',ownerId:actor,version:plan.nextVersion,sourceRequestId:expected.sourceRequestId,sourceGoalId:expected.sourceGoalId,anchor:plan.anchor};
  if(!envelope(readback,actor,p.now())||!equal(readback.existingAnchor,expectedHead))return stop('anchor_reconciliation_required',true);
  // A concurrent goal/profile edit cannot be called a completed current baseline.
  const fresh=planRateAnchorAppend({...readback,existingAnchor:s.existingAnchor},actor,p.now(),plan.expectedVersion);
  if(fresh.kind!=='append_plan'||!equal(fresh.anchor,plan.anchor))return stop('anchor_reconciliation_required',true);
  return {status:'stored' as const,actionable:false as const,mayHaveWritten:true};
 }catch{return stop(writing?'anchor_reconciliation_required':'rate_anchor_source_error',writing);}
}
export async function ensureRateAnchor(actor:string,p:AnchorBootstrapPorts){
 if(!RATE_ANCHOR_PERSISTENCE_RELEASE.enabled)return stop('anchor_persistence_contract_off');
 return bootstrapRateAnchorForReview(actor,p);
}
