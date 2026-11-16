import {prepareRules14Proposal,decodeRules14Record} from '../release-candidates/tdee-adaptive-review/rules14Proposal.ts';
import {canonicalRateJson} from '../release-candidates/tdee-adaptive-review/rateProposalRecord.ts';
import {verifyRules14AcceptanceChain} from '../release-candidates/tdee-adaptive-review/rules14AcceptanceChain.ts';
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const permit=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(v);
export type DiagnosticPorts={refreshProvider?(owner:string):Promise<{before:unknown;program:unknown;after:unknown}>;currentOwner():Promise<string|null>;rpc(name:'tdee_rules14_diagnostic_capability_v1'|'tdee_run_rules14_rollback_diagnostic_v1',args?:Record<string,unknown>):Promise<{data:unknown;error:unknown}>};
export async function loadRules14DiagnosticCapability(owner:string,ports:DiagnosticPorts):Promise<string|null>{
 try{if(await ports.currentOwner()!==owner)return null;const r=await ports.rpc('tdee_rules14_diagnostic_capability_v1');if(r.error||await ports.currentOwner()!==owner)return null;const d=r.data;if(!object(d)||d.version!=='rules14-diagnostic-capability-v1'||d.enabled!==true||!permit(d.permitVersion)||Object.keys(d).sort().join(',')!=='enabled,permitVersion,version')return null;return d.permitVersion;}catch{return null;}
}
/** Offline differential verification of a rolled-back fixture only. Captured test
 * time is NEVER reused to authorize a production write or extend an expiry. */
export async function verifyRules14DiagnosticResult(value:unknown,owner:string,permitVersion:string){
 if(!object(value)||value.version!=='rules14-rollback-diagnostic-result-v1'||value.permitVersion!==permitVersion||!object(value.result))throw Error('diagnostic_not_verified');
 const r=value.result,c=r.sqlCoreChecks,checks=c?.checks;
 if(r.fullFixtureRolledBack!==true||r.fullOwnerStateRestored!==true||r.testOnly!==true||r.fictionalFixture!==true||r.notRealConsent!==true||r.actualTsProducerRanInsideDatabase!==false||c?.testOnly!==true||c?.rolledBack!==true||c?.ownerStateRestored!==true||c?.productionRecommendationEnabled!==false||!object(checks)||!Number.isSafeInteger(r.preparedAt)||r.source?.ownerId!==owner||r.record?.ownerId!==owner)throw Error('diagnostic_not_verified');
 for(const key of ['issuerStored','issuerReplayExact','badDigestRejected','acceptCommitted','acceptReplayExact','requestIdReuseRejected','secondAcceptanceRejected','oneNewGoal','oneNewReceipt','chainVerified'])if(checks[key]!==true)throw Error('diagnostic_not_verified');
 const rebuilt=await prepareRules14Proposal(r.source,owner,r.record.id,r.preparedAt);
 if(rebuilt.kind!=='rules14_record_prepared'||canonicalRateJson(rebuilt.record)!==canonicalRateJson(r.record)||!await decodeRules14Record(r.record,owner,r.preparedAt))throw Error('diagnostic_not_verified');
 const chain=checks.postWriteChain;if(chain?.ownerId!==owner||!Number.isSafeInteger(chain.capturedAt)||chain.capturedAt<r.preparedAt||chain.capturedAt-r.preparedAt>30000)throw Error('diagnostic_not_verified');
 const verified=await verifyRules14AcceptanceChain(chain,chain.capturedAt);
 const last=chain.rows?.at(-1);
 if(!last||canonicalRateJson(last.proposal)!==canonicalRateJson(r.record)||canonicalRateJson(last.receipt)!==canonicalRateJson(checks.acceptedReceipt)||verified.lastReceiptDigest!==checks.acceptedReceipt?.receiptDigest||verified.lastReceiptDigest!==checks.verifiedChain?.lastReceiptDigest||canonicalRateJson(verified.currentGoal)!==canonicalRateJson(checks.verifiedChain?.currentGoal))throw Error('diagnostic_not_verified');
 return {kind:'rules14_diagnostic_pass' as const,producerParity:true,chainVerified:true,sqlChecksPassed:10,fixtureRolledBack:true,ownerStateRestored:true,recommendationsEnabled:false};
}
export async function runRules14RollbackDiagnostic(owner:string,permitVersion:string,ports:DiagnosticPorts){
 if(!permit(permitVersion)||await loadRules14DiagnosticCapability(owner,ports)!==permitVersion)throw Error('diagnostic_not_verified');
 if(!ports.refreshProvider)throw Error('diagnostic_provider_unavailable');
 const fresh=await ports.refreshProvider(owner),before=fresh.before,program=fresh.program,after=fresh.after;
 if(await ports.currentOwner()!==owner||!object(before)||!object(after)||!object(program)||before.ownerId!==owner||after.ownerId!==owner||
  after.premium!==true||program.premium!==true||program.version!=='dynamic-program-v1'||program.observationOnly!==true||program.observationVersion!=='observation-v1'||program.proposal!==null||program.reviewDue!==false||
  before.enabled!==after.enabled||program.enabled!==after.enabled||before.reviewDay!==after.reviewDay||program.reviewDay!==after.reviewDay||canonicalRateJson(before.currentGoal)!==canonicalRateJson(after.currentGoal)||
  after.safety?.enabled!==false||after.safety?.eligibility!=='unverified'||after.proposal!==null||!Number.isSafeInteger(after.accessValidUntil)||after.accessValidUntil<=Date.now()||program.accessValidUntil!==after.accessValidUntil)throw Error('diagnostic_provider_unavailable');
 const response=await ports.rpc('tdee_run_rules14_rollback_diagnostic_v1',{p_permit_version:permitVersion});
 if(response.error||await ports.currentOwner()!==owner)throw Error('diagnostic_not_verified');
 const summary=await verifyRules14DiagnosticResult(response.data,owner,permitVersion);
 if(await ports.currentOwner()!==owner)throw Error('diagnostic_not_verified');return summary;
}
