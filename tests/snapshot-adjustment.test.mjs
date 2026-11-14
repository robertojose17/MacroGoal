import test from 'node:test';import assert from 'node:assert/strict';
import {draftSnapshotAdjustment as draft} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
const now=1794668400000;
function fixture(){return {current:{calories:2000,proteinG:150,carbsG:215,fatsG:60,fiberG:30},
 anchor:{intake:2000,expenditure:2500,acceptedDelta:0,acceptedCount:0,receiptsVerified:true,lastAcceptedAt:null},observedExpenditure:2300,
 policy:{reviewed:true,maxStepKcal:200,maxStepFraction:.05,maxNetDeltaKcal:300,reviewIntervalDays:14,incrementKcal:50,minIntakeKcal:1500,maxIntakeKcal:4000},
 evidence:{eligible:true,modelReviewed:true,logging:'confirmed',capturedAt:now,fingerprint:'a'.repeat(64),stability:'stable',goalDirectionValid:true},now};}
test('bidirectional capped draft, never actionable',()=>{const f=fixture();let r=draft(f);assert.equal(r.deltaKcal,-100);assert.equal(r.target.calories,1900);assert.equal(r.actionable,false);f.observedExpenditure=2800;r=draft(f);assert.equal(r.deltaKcal,100);});
test('anchor preserves deficit rather than stacking another deficit',()=>{const f=fixture();f.current={calories:1900,proteinG:150,carbsG:190,fatsG:60,fiberG:30};f.anchor.acceptedDelta=-100;f.anchor.acceptedCount=1;f.anchor.lastAcceptedAt=now-14*86400000;f.observedExpenditure=2400;assert.equal(draft(f).kind,'no_change');});
test('huge expenditure shift cannot produce500or1000 change',()=>{for(const x of [1000,5000]){const f=fixture();f.observedExpenditure=x;assert.ok(Math.abs(draft(f).deltaKcal)<=200);}});
test('no reduction beyond explicit floor and no hidden floor default',()=>{const f=fixture();f.policy.minIntakeKcal=1950;assert.equal(draft(f).target.calories,1950);f.policy.minIntakeKcal=undefined;assert.equal(draft(f).reason,'policy_invalid');});
test('unreviewed unknown or inferred completeness never grants adaptation',()=>{for(const patch of [{eligible:false},{modelReviewed:false},{logging:'heuristic'},{logging:'unknown'},{stability:'uncertain'},{goalDirectionValid:false}]){const f=fixture();Object.assign(f.evidence,patch);assert.equal(draft(f).kind,'blocked');}});
test('cooldown exact14days and fresh snapshot boundary',()=>{const f=fixture();f.anchor.acceptedCount=1;f.anchor.lastAcceptedAt=now-14*86400000+1;assert.equal(draft(f).reason,'review_cooldown');f.anchor.lastAcceptedAt-=1;assert.equal(draft(f).kind,'draft');f.evidence.capturedAt=now-30001;assert.equal(draft(f).reason,'source_expired_or_invalid');});
test('net deviation bounded in each direction',()=>{const f=fixture();f.policy.maxNetDeltaKcal=50;assert.equal(draft(f).deltaKcal,-50);f.observedExpenditure=3000;assert.equal(draft(f).deltaKcal,50);});
test('malformed and anchor mismatch blocked',()=>{assert.equal(draft(null).kind,'blocked');const f=fixture();f.anchor.acceptedDelta=1;assert.equal(draft(f).reason,'anchor_mismatch');});
test('future timestamps and nonfinite policy inputs rejected',()=>{const f=fixture();f.evidence.capturedAt=now+1;assert.equal(draft(f).kind,'blocked');f.evidence.capturedAt=now;f.policy.maxStepKcal=Infinity;assert.equal(draft(f).reason,'policy_invalid');});

test('returning to baseline cannot erase accepted history cooldown',()=>{const f=fixture();f.anchor.acceptedCount=2;assert.equal(draft(f).reason,'acceptance_history_invalid');f.anchor.lastAcceptedAt=now-86400000;assert.equal(draft(f).reason,'review_cooldown');});
