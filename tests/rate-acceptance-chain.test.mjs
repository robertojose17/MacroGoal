import test from 'node:test';import assert from 'node:assert/strict';
import {energyParityFixtures} from './rate-energy-parity-fixtures.mjs';
import {acceptedRateSource} from './accepted-rate-adjustment-fixture.mjs';
import {prepareAcceptedIntakeRateAnchor} from '../release-candidates/tdee-adaptive-review/acceptedIntakeRateAnchor.ts';
import {canonicalRateJson} from '../release-candidates/tdee-adaptive-review/rateProposalRecord.ts';
import {verifyRateAcceptanceChain,rateReceiptDigest,RATE_ACCEPTANCE_CHAIN_RELEASE} from '../release-candidates/tdee-adaptive-review/rateAcceptanceChain.ts';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,hash='a'.repeat(64),day=86400000;
async function fixture(count=2){
 const input=energyParityFixtures()[0].input,source=acceptedRateSource(input),built=prepareAcceptedIntakeRateAnchor(source,source.ownerId,input.now),a=built.anchor,owner=a.ownerId;
 const ref={ownerId:owner,version:1,sourceRequestId:a.sourceReceipt.requestId,sourceGoalId:a.initialGoalId};
 const head={kind:'rate_anchor_head',...ref,anchor:a};let prior=structuredClone(a.baselineGoalSnapshot),previousDigest=null;const rows=[];
 const first=input.now+1000;
 for(let index=0;index<count;index++){
  const at=first+index*14*day,iso=new Date(at).toISOString(),target={calories:prior.daily_calories+200,proteinG:150,carbsG:prior.carbs_g+50,fatsG:60,fiberG:30};
  const next={...prior,id:id(100+index),daily_calories:target.calories,protein_g:target.proteinG,carbs_g:target.carbsG,fats_g:target.fatsG,fiber_g:target.fiberG,created_at:iso,updated_at:iso,last_adaptive_update:iso,base_daily_calories:a.baselineIntakeKcal};
  const policy={version:'p1',digest:hash,engine_version:'rate-review-14d-v1',enabled:true,reviewed:true,snapshot_contract_reviewed:true,expires_at:'2026-12-01T00:00:00Z',max_step_kcal:200,max_step_fraction:.1,max_cumulative_delta_kcal:400,min_days_between_acceptances:14,increment_kcal:25,min_intake_kcal:1500,max_intake_kcal:3000};
  const review={reviewId:id(300+index),reviewVersion:1,ownerId:owner,goalId:prior.id,goalRevision:prior.updated_at,profileBinding:a.profileBinding,journeyBinding:a.journeyBinding,policyDigest:hash,policyVersion:'p1',sourceFingerprint:hash,sourceCapturedAt:at-2500,reviewedAt:at-2000,expiresAt:at+10000,uncertainty:{validated:true,stable:true,lowerKgPerWeek:-.8,upperKgPerWeek:-.6},conversion:{reviewed:true,model:'approximate-energy-equivalent-v1',kcalPerKg:7700}};
  const payload={contract:'explicit-rate-acceptance-v1',engineVersion:'rate-review-14d-v1',anchorReference:ref,anchorSnapshot:a,goalSnapshot:prior,profileBinding:a.profileBinding,journeyBinding:a.journeyBinding,profileUpdatedAt:a.sourceReceipt.acceptedProfileUpdatedAt,sourceFingerprint:hash,sourceCapturedAt:at-2500,policyBinding:{version:'p1',digest:hash,engineVersion:'rate-review-14d-v1'},policySnapshot:policy,reviewedRate:review,current:{calories:prior.daily_calories,proteinG:prior.protein_g,carbsG:prior.carbs_g,fatsG:prior.fats_g,fiberG:prior.fiber_g},target,deltaKcal:200,netDeltaKcal:200*(index+1),preparedAt:at-1500,requiresExplicitAcceptance:true,actionable:false};
  const unsignedProposal={version:'rate-proposal-record-v1',id:id(200+index),ownerId:owner,expiresAt:at+5000,payload};
  const proposal={...unsignedProposal,canonicalContent:canonicalRateJson(unsignedProposal),digest:await rateReceiptDigest(unsignedProposal)};
  const request={version:'rate-acceptance-request-v1',ownerId:owner,requestId:id(400+index),rateProposalId:proposal.id,rateProposalDigest:proposal.digest,anchorReference:ref};
  const unsigned={version:'rate-acceptance-receipt-v1',status:'committed',sequence:index+1,request,anchorReference:ref,previousGoalSnapshot:prior,acceptedGoalSnapshot:next,acceptedAt:at,deltaKcal:200,netDeltaKcal:200*(index+1),previousReceiptDigest:previousDigest,
   acceptanceEvidence:{contract:'rate-as-of-revalidated-v1',sourceFingerprint:hash,sourceCapturedAt:at-2500,reviewId:review.reviewId,reviewVersion:1,policyDigest:hash,profileBinding:a.profileBinding,journeyBinding:a.journeyBinding}};
  const receipt={...unsigned,canonicalContent:canonicalRateJson(unsigned),receiptDigest:await rateReceiptDigest(unsigned)};
  rows.push({proposal,receipt});prior=next;previousDigest=receipt.receiptDigest;
 }
 const now=(count?rows.at(-1).receipt.acceptedAt:input.now)+1000;
 return {now,value:{version:'rate-acceptance-chain-source-v1',ownerId:owner,capturedAt:now,anchorHead:head,totalCount:rows.length,rows,currentGoal:prior,currentProfileBinding:a.profileBinding,currentJourneyBinding:a.journeyBinding,currentJourneyStartDate:a.journeyStartDate,currentJourneyRestartCount:a.journeyRestartCount}};
}
async function reseal(row){const {digest,canonicalContent,...p}=row.proposal;row.proposal={...p,canonicalContent:canonicalRateJson(p),digest:await rateReceiptDigest(p)};row.receipt.request.rateProposalDigest=row.proposal.digest;const {receiptDigest,canonicalContent:_,...r}=row.receipt;row.receipt={...r,canonicalContent:canonicalRateJson(r),receiptDigest:await rateReceiptDigest(r)};}
test('synthetic zero first and second accepted states verify separate intake-only chain',async()=>{
 for(const count of [0,1,2]){const {value,now}=await fixture(count),r=await verifyRateAcceptanceChain(value,now);assert.equal(r.acceptedCount,count);assert.equal(r.acceptedDeltaKcal,count*200);assert.equal(r.lastAcceptedAt,count?value.rows.at(-1).receipt.acceptedAt:null);assert.equal(r.receiptsVerified,true);assert.equal(r.actionable,false);assert.equal(r.acceptanceAuthorized,false);}
 assert.equal(RATE_ACCEPTANCE_CHAIN_RELEASE.enabled,false);
});
test('missing outoforder duplicated or totalcount-mismatched chain rejects',async()=>{
 for(const change of [v=>v.rows.reverse(),v=>v.rows.pop(),v=>{v.rows.shift();v.totalCount--;},v=>v.rows.push(v.rows[0]),v=>v.totalCount++,v=>{v.rows=[];v.totalCount=0;}]){
  const {value,now}=await fixture();change(value);await assert.rejects(()=>verifyRateAcceptanceChain(value,now),/rate_receipt_chain_unverified/);
 }
});
test('current manualgoal restart profilechange owner and anchorreference invalidate chain',async()=>{
 for(const change of [v=>v.currentGoal.id=id(900),v=>v.currentGoal.protein_g++,v=>v.currentJourneyRestartCount++,v=>v.currentJourneyBinding='b'.repeat(64),v=>v.currentProfileBinding='b'.repeat(64),v=>v.ownerId=id(901),v=>v.anchorHead.version++,v=>v.anchorHead.sourceRequestId=id(902)]){
  const {value,now}=await fixture();change(value);await assert.rejects(()=>verifyRateAcceptanceChain(value,now));
 }
});
test('even rehashed wrong netdelta, shortcadence, policycaps, reduction and alteredgoals reject',async()=>{
 for(const change of [row=>{row.receipt.netDeltaKcal=300;row.proposal.payload.netDeltaKcal=300;},row=>row.receipt.acceptedAt-=day,row=>row.proposal.payload.policySnapshot.max_cumulative_delta_kcal=300,row=>{row.receipt.deltaKcal=-200;row.proposal.payload.deltaKcal=-200;},row=>row.receipt.acceptedGoalSnapshot.goal_type='gain',row=>row.receipt.acceptedGoalSnapshot.base_daily_calories=2200,row=>row.receipt.previousReceiptDigest='b'.repeat(64)]){
  const {value,now}=await fixture();change(value.rows[1]);await reseal(value.rows[1]);value.currentGoal=structuredClone(value.rows[1].receipt.acceptedGoalSnapshot);await assert.rejects(()=>verifyRateAcceptanceChain(value,now));
 }
});
test('digest bytes and fullpreviousgoal are checked, not just calorie count',async()=>{
 for(const change of [v=>v.rows[0].proposal.canonicalContent+=' ',v=>v.rows[0].receipt.canonicalContent+=' ',v=>v.rows[1].receipt.previousGoalSnapshot.macro_preset='low_carb',v=>v.rows[1].receipt.acceptanceEvidence.sourceCapturedAt-=1]){
  const {value,now}=await fixture();change(value);await assert.rejects(()=>verifyRateAcceptanceChain(value,now));
 }
});
test('stale source unknown receipt status and expired proposal at acceptance reject',async()=>{
 const {value,now}=await fixture();await assert.rejects(()=>verifyRateAcceptanceChain(value,now+30001));
 const a=await fixture();a.value.rows[1].receipt.status='unknown';await reseal(a.value.rows[1]);await assert.rejects(()=>verifyRateAcceptanceChain(a.value,a.now));
 const b=await fixture();b.value.rows[1].proposal.expiresAt=b.value.rows[1].receipt.acceptedAt;await reseal(b.value.rows[1]);await assert.rejects(()=>verifyRateAcceptanceChain(b.value,b.now));
});

test('receipt canonical bytes are preserved separately from semanticJSON representation',async()=>{
 const {value}=await fixture(1),r=value.rows[0].receipt,p=value.rows[0].proposal;
 assert.equal(JSON.parse(r.canonicalContent).acceptedAt,r.acceptedAt);
 assert.equal(JSON.parse(p.canonicalContent).id,p.id);
 const {canonicalContent,receiptDigest,...unsigned}=r;assert.equal(await rateReceiptDigest(unsigned),receiptDigest);
 assert.equal(canonicalContent,canonicalRateJson(unsigned));
});
