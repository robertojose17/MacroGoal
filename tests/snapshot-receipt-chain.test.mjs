import test from 'node:test';import assert from 'node:assert/strict';
import {verifySnapshotReceiptChain as verify} from '../release-candidates/tdee-adaptive-review/receiptChain.ts';
function fixture(){
 const old={id:'g0',user_id:'a',is_active:true,daily_calories:2000,protein_g:150,carbs_g:200,fats_g:66,fiber_g:28,created_at:'2026-01-01T00:00:00Z'};
 const goal={...old,id:'g1',daily_calories:1900,protein_g:145,carbs_g:190,fats_g:62,created_at:'2026-02-01T00:00:00Z'};
 const proposal={id:'p',owner_id:'a',anchor_id:'anchor',policy_version:'v',digest:'a'.repeat(64),consumed_request:'r',
 payload:{goalId:'g0',goalSnapshot:old,sourceFingerprint:'b'.repeat(64),deltaKcal:-100,target:{calories:1900,proteinG:145,carbsG:190,fatsG:62,fiberG:28}}};
 const receipt={owner_id:'a',status:'committed',request_id:'r',request:{ownerId:'a',requestId:'r',proposalId:'p',proposalDigest:'a'.repeat(64)},
 accepted_goal_id:'g1',accepted_goal:goal,acceptance_evidence:{contract:'as-of-revalidated-v1',fingerprint:'b'.repeat(64),capturedAt:'2026-01-31T23:59:50Z'}};
 return {actor:'a',anchor:{id:'anchor',owner_id:'a',revoked:false,policy_version:'v',baseline_intake_kcal:2000,accepted_delta_kcal:-100,last_accepted_at:goal.created_at,active_goal_id:'g1'},currentGoal:goal,totalCount:1,rows:[{receipt,proposal}]};
}
test('verified signed chain derives count and net rather than a claimed boolean',()=>{
 assert.deepEqual(verify(fixture()),{acceptedCount:1,acceptedDelta:-100,lastAcceptedAt:Date.parse('2026-02-01T00:00:00Z'),receiptsVerified:true});
});
test('empty chain only valid untouched anchor',()=>{const f=fixture();f.rows=[];f.totalCount=0;assert.throws(()=>verify(f));f.anchor.accepted_delta_kcal=0;f.anchor.last_accepted_at=null;f.currentGoal.daily_calories=2000;assert.equal(verify(f).acceptedCount,0);});
test('missing and duplicate rows fail closed',()=>{let f=fixture();f.totalCount=2;assert.throws(()=>verify(f));f.rows.push(f.rows[0]);assert.throws(()=>verify(f));});
test('owner, request, proposal, anchor, policy binding cannot be substituted',()=>{
 for(const mutate of [
 f=>f.rows[0].receipt.owner_id='b',f=>f.rows[0].proposal.owner_id='b',f=>f.rows[0].proposal.anchor_id='other',
 f=>f.rows[0].proposal.policy_version='other',f=>f.rows[0].proposal.consumed_request='other',
 f=>f.rows[0].receipt.request.proposalDigest='other',f=>f.rows[0].receipt.accepted_goal.user_id='b']){
 const f=fixture();mutate(f);assert.throws(()=>verify(f));}
});
test('target, delta, receipt evidence or changed active goal invalidate',()=>{
 for(const mutate of [f=>f.rows[0].proposal.payload.deltaKcal=-500,f=>f.rows[0].proposal.payload.target.proteinG=999,
 f=>f.rows[0].receipt.acceptance_evidence.fingerprint='other',f=>f.anchor.last_accepted_at=null,
 f=>f.currentGoal={...f.currentGoal,daily_calories:1800},f=>f.anchor.revoked=true]){
 const f=fixture();mutate(f);assert.throws(()=>verify(f));}
});

test('round trip net zero retains two acceptances and last timestamp',()=>{
 const f=fixture(),first=structuredClone(f.rows[0]),second=structuredClone(first);
 const g2={...f.currentGoal,id:'g2',daily_calories:2000,created_at:'2026-02-15T00:00:00Z'};
 second.proposal.id='p2';second.proposal.consumed_request='r2';
 second.proposal.payload.goalId='g1';second.proposal.payload.goalSnapshot=structuredClone(f.currentGoal);
 second.proposal.payload.target.calories=2000;second.proposal.payload.deltaKcal=100;
 second.receipt.request_id='r2';second.receipt.request.requestId='r2';second.receipt.request.proposalId='p2';
 second.receipt.accepted_goal=g2;second.receipt.accepted_goal_id='g2';
 second.receipt.acceptance_evidence.capturedAt='2026-02-14T23:59:50Z';
 f.rows=[second,first];f.totalCount=2;f.currentGoal=g2;f.anchor.active_goal_id='g2';
 f.anchor.accepted_delta_kcal=0;f.anchor.last_accepted_at=g2.created_at;
 assert.equal(verify(f).acceptedCount,2);assert.equal(verify(f).acceptedDelta,0);
 second.proposal.payload.goalSnapshot={...second.proposal.payload.goalSnapshot,protein_g:999};assert.throws(()=>verify(f));
});
