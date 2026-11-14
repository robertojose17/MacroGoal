/** Caps contract regression changed; execution pending because local runner is blocked. */
import test from 'node:test';import assert from 'node:assert/strict';
import {draftSnapshotAdjustment as draft} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
const now=1794668400000;
function fixture(){return {current:{calories:2000,proteinG:150,carbsG:215,fatsG:60,fiberG:30},
 anchor:{baselineCapturedAt:now-14*86400000,intake:2000,expenditure:2500,acceptedDelta:0,acceptedCount:0,receiptsVerified:true,lastAcceptedAt:null},observedExpenditure:2300,
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

test('first review waits fourteen days after baseline without fabricating acceptance history',()=>{
 const f=fixture();f.anchor.baselineCapturedAt=now-14*86400000+1;assert.equal(draft(f).reason,'review_cooldown');
 f.anchor.baselineCapturedAt--;assert.equal(draft(f).kind,'draft');
 for(const v of [undefined,null,NaN,now+1]){f.anchor.baselineCapturedAt=v;assert.equal(draft(f).reason,'baseline_invalid');}
});

test('protein and fiber remain exact for upward and downward adjustments',()=>{
 for(const [expenditure,calories,carbs,fats] of [[2800,2100,230,64],[2300,1900,200,56]]){
 const f=fixture();f.observedExpenditure=expenditure;const r=draft(f);
 assert.equal(r.kind,'draft');assert.deepEqual(r.target,{calories,proteinG:150,carbsG:carbs,fatsG:fats,fiberG:30});
 assert.ok(Math.abs(calories-4*r.target.proteinG-4*carbs-9*fats)<=10);
 }
});
test('carbs-only or fat-only distributions preserve zero counterpart',()=>{
 const f=fixture();f.current.carbsG=350;f.current.fatsG=0;let r=draft(f);
 assert.equal(r.kind,'draft');assert.equal(r.target.fatsG,0);assert.equal(r.target.carbsG,325);
 f.current.carbsG=0;f.current.fatsG=156;r=draft(f);
 assert.equal(r.kind,'draft');assert.equal(r.target.carbsG,0);assert.equal(r.target.fatsG,144);
 assert.equal(r.target.proteinG,150);
});
test('no distributable energy or exhausted residual fails closed',()=>{
 const f=fixture();f.current.proteinG=500;f.current.carbsG=0;f.current.fatsG=0;
 assert.equal(draft(f).reason,'macro_energy_unavailable');
 f.current.proteinG=490;f.current.carbsG=10;
 assert.equal(draft(f).reason,'macro_energy_unavailable');
});
test('fixed fractional macros are not silently rounded',()=>{
 const f=fixture();f.current.proteinG=150.5;assert.equal(draft(f).reason,'fixed_macros_invalid');
 f.current.proteinG=150;f.current.fiberG=30.5;assert.equal(draft(f).reason,'fixed_macros_invalid');
});
test('residual rounding stays nonnegative integer and within energy tolerance',()=>{
 for(let protein=50;protein<=300;protein+=25)for(let fat=0;fat<=100;fat+=10){
 const f=fixture();f.current.proteinG=protein;f.current.fatsG=fat;
 f.current.carbsG=Math.round((2000-4*protein-9*fat)/4);
 if(f.current.carbsG<0)continue;
 for(const expenditure of [2200,2800]){
 f.observedExpenditure=expenditure;const r=draft(f);
 if(r.kind!=='draft'){assert.equal(r.reason,'macro_energy_unavailable');continue;}
 assert.equal(r.target.proteinG,protein);assert.equal(r.target.fiberG,30);
 assert.ok(Object.values(r.target).every(x=>Number.isInteger(x)&&x>=0));
 assert.ok(Math.abs(r.target.calories-4*protein-4*r.target.carbsG-9*r.target.fatsG)<=10);
 }}
});

test('required finite positive caps reject null without mutating inputs',()=>{
 for(const value of [null,undefined,0,-1,NaN,Infinity,'none'])for(const key of ['maxNetDeltaKcal','maxIntakeKcal']){
  const f=fixture();f.policy[key]=value;const before=structuredClone(f);
  assert.equal(draft(f).reason,'policy_invalid');assert.deepEqual(f,before);
 }
 const f=fixture();f.policy.maxIntakeKcal=f.policy.minIntakeKcal-1;
 assert.equal(draft(f).reason,'policy_invalid');
});
