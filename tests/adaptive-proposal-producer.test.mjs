import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareProposalRecord,createProposalProducer} from '../release-candidates/tdee-adaptive-review/proposalProducer.ts';
const owner='11111111-1111-4111-8111-111111111111',goal='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const now=Date.parse('2026-11-13T12:01:00Z'),model='a'.repeat(64),digest='b'.repeat(64);
// Test fixture choices only. No production policy is registered by this file.
function fixture(){
 const policy={id:'synthetic-unapproved',digest,modelRevision:model,maxStepKcal:100,maxStepFraction:.05,maxCumulativeIncreaseKcal:200,minDaysBetweenAcceptances:7,incrementKcal:50,minIntakeKcal:1200,maxIntakeKcal:4000,maxEvidenceAgeMs:300000,maxWeightAgeDays:3,macroStrategy:'preserve_accepted_energy_ratios'};
 const context={ownerId:owner,expectedOwnerId:owner,profileUpdatedAt:null,sex:'male',dateOfBirth:'1990-06-15',currentWeightKg:80,targetWeightKg:75,
  goal:{id:goal,updatedAt:null,kind:'lose',calories:2000,proteinG:150,carbsG:215,fatsG:60,fiberG:30},
  source:{kind:'adaptive-evidence-v1',fingerprint:'c'.repeat(64),ownerRevision:'d'.repeat(64),writerProtocol:'serialized-owner-v1',capturedAt:'2026-11-13T12:00:00Z',today:'2026-11-13',timezone:'UTC',modelRevision:model,validation:'reviewed_for_adaptation',logging:'explicit_complete_day_attestations',completenessDigest:'e'.repeat(64),kcalPerDay:3000,sensitivityLow:2700,sensitivityHigh:3300,windowStart:'2026-10-15',asOf:'2026-11-12',windowDays:28,loggedDays:28,weightDays:29,latestWeight:{source:'check_in',rowId:other,date:'2026-11-12',valueKg:80,selection:'latest_non_conflicting_normalized_weight_v1'}},
  eligibility:{status:'reviewed_eligible',digest:'f'.repeat(64),policyDigest:digest,expiresAt:'2026-11-14T00:00:00Z',goalId:goal,goalUpdatedAt:null,profileUpdatedAt:null},
  anchor:{ownerId:owner,goalId:goal,goalUpdatedAt:null,modelRevision:model,baselineIntakeKcal:2000,baselineExpenditureKcal:2200,sensitivityLow:1900,sensitivityHigh:2500,acceptedIncreaseKcal:0,receiptChainValidated:true,lastAcceptedAt:null}};
 const binding={ownerId:owner,proposalId:other,anchorId:other,sourceEpoch:other,sourceRevision:'1',ownerRevisionDigest:'d'.repeat(64),goalSnapshot:{id:goal,user_id:owner,updated_at:null,is_active:true,goal_type:'lose',daily_calories:2000,protein_g:150,carbs_g:215,fats_g:60,fiber_g:30}};
 return {context,policy,binding};
}
test('producer remains OFF and does not fetch or persist regardless of fixtures',async()=>{
 let calls=0;const producer=createProposalProducer({loadReviewedContext:async()=>{calls++;return fixture();},persist:async()=>{calls++;throw Error('must not call');}});
 assert.deepEqual(await producer(owner),{reason:'safety_review_required',proposal:null});assert.equal(calls,0);
});
test('pure candidate record binds exact goal/source/policy and creates no actionable marker',()=>{
 const {context,policy,binding}=fixture();const r=prepareProposalRecord(context,policy,binding,now);
 assert.equal(r.kind,'prepared');assert.equal(r.record.payload.target.calories,2100);assert.equal(r.record.payload.sourceFingerprint,context.source.fingerprint);
 assert.equal(r.record.expiresAt,'2026-11-13T12:05:00.000Z');assert.equal('actionable' in r.record,false);
 binding.goalSnapshot.daily_calories=999;assert.equal(r.record.payload.goalSnapshot.daily_calories,2000);
});
test('stale or mismatched goal bindings reject instead of rebasing',()=>{
 for(const patch of [{updated_at:'2026-11-13T12:00:00Z'},{daily_calories:2100},{user_id:other},{is_active:false}]){
  const f=fixture();Object.assign(f.binding.goalSnapshot,patch);assert.equal(prepareProposalRecord(f.context,f.policy,f.binding,now).reason,'goal_binding_mismatch');
 }
});
test('arbitrary source revision and owner cannot issue proposals',()=>{
 for(const patch of [{ownerId:other},{sourceRevision:'-1'},{sourceRevision:'9223372036854775808'},{ownerRevisionDigest:'0'.repeat(64)},{sourceEpoch:'x'}]){
  const f=fixture();Object.assign(f.binding,patch);assert.equal(prepareProposalRecord(f.context,f.policy,f.binding,now).reason,'coherent_binding_required');
 }
});
test('explicit cap above owner limit fails even if policy fixture asks for it',()=>{
 const f=fixture();f.policy.maxStepKcal=500;assert.equal(prepareProposalRecord(f.context,f.policy,f.binding,now).reason,'product_step_limit');
});
test('observation data cannot be relabeled complete by producer',()=>{
 const f=fixture();f.context.source.logging='unverified';assert.equal(prepareProposalRecord(f.context,f.policy,f.binding,now).reason,'validated_evidence_required');
});
