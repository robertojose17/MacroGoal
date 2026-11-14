/** Private server candidate only: no entrypoint imports, deployment, or bootstrap. */
import {ADAPTIVE_RELEASE_STATE} from './proposal.ts';
import {parseSnapshotReviewContext} from './snapshotReviewContextParser.ts';
import {prepareSnapshotProposal,validatePersistedSnapshotProposal} from './snapshotProposalProducer.ts';
import type {ProposalRecord} from './proposalProducer.ts';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const blocked=(reason:string)=>({reason,proposal:null});
export const SNAPSHOT_SERVER_RPC=Object.freeze({read:'tdee_read_review_context_v1',issue:'tdee_issue_snapshot_proposal_v1'});
/** Pure function. Raw evidence never becomes a reviewed record merely by being loaded. */
export function prepareSnapshotContextRecord(raw:unknown,actor:string,proposalId:string,now:number){
 const parsed=parseSnapshotReviewContext(raw,actor,proposalId,now);
 if(parsed.kind==='blocked')return parsed;
 return prepareSnapshotProposal(parsed.input,parsed.binding);
}
/** Server-only mapping, not an HTTP input schema. Copies isolate issuer mutation. */
export function snapshotIssueArguments(record:ProposalRecord){
 return {p_id:record.id,p_owner:record.ownerId,p_policy:record.policyVersion,p_anchor:record.anchorId,
 p_expires_at:record.expiresAt,p_payload:structuredClone(record.payload)};
}
export interface SnapshotServerDependencies{
 // Must verify the bearer with the authentication service, never decode-only.
 verifyAccessToken(token:string):Promise<{id:string}|null>;
 // This RPC client MUST carry that user's bearer, not the service key.
 loadOwnContext(token:string,rpc:typeof SNAPSHOT_SERVER_RPC.read):Promise<unknown>;
 // Closed-over service client; no credential or role is taken from a request.
 issueAsService(rpc:typeof SNAPSHOT_SERVER_RPC.issue,args:ReturnType<typeof snapshotIssueArguments>):Promise<unknown>;
 now?:()=>number;
 newProposalId?:()=>string;
}
/** Request accepts only authorization. No body/actor/targets/review or enable flags. */
export function createSnapshotServerRuntime(deps:SnapshotServerDependencies){
 return async(request:unknown)=>{
  if(!request||typeof request!=='object'||Array.isArray(request))return blocked('invalid_request');
  const r=request as Record<string,unknown>;
  if(Object.keys(r).length!==1||typeof r.authorization!=='string'||r.authorization.length>16384||
   !/^Bearer [^\s]+$/.test(r.authorization))return blocked('invalid_request');
  // A deployment/code-reviewed release change is required. Dependencies cannot enable.
  if(!ADAPTIVE_RELEASE_STATE.recommendationsEnabled)return blocked('safety_review_required');
  const token=r.authorization.slice(7);
  try{
   const user=await deps.verifyAccessToken(token);
   if(!user||!uuid(user.id))return blocked('authentication_required');
   const actor=user.id;
   const raw=await deps.loadOwnContext(token,SNAPSHOT_SERVER_RPC.read);
   const now=(deps.now??Date.now)();
   const proposalId=(deps.newProposalId??(()=>crypto.randomUUID()))();
   const prepared=prepareSnapshotContextRecord(raw,actor,proposalId,now);
   if(prepared.kind!=='prepared')return blocked(prepared.reason);
   // Owner remains fixed across all async boundaries. SQL issuer checks policy anew.
   if(prepared.record.ownerId!==actor)return blocked('account_changed');
   const persisted=await deps.issueAsService(SNAPSHOT_SERVER_RPC.issue,snapshotIssueArguments(prepared.record));
   const proposal=validatePersistedSnapshotProposal(prepared.record,persisted,(deps.now??Date.now)());
   return {reason:'review_available',proposal};
  }catch{
   // Never return tokens, database errors, or raw snapshots to the caller.
   return blocked('source_error');
  }
 };
}
