/** Smart allocation regressions PREPARED, NOT EXECUTED: runner blocked. */
import test from 'node:test';import assert from 'node:assert/strict';
import {draftSnapshotAdjustment as draft} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
const now=1794668400000;
function syntheticMacro(input,preset='balanced',owner='11111111-1111-4111-8111-111111111111',revision='2026-11-01T00:00:00Z',policyVersion='reviewed',policyDigest='a'.repeat(64)){
 // Synthetic arithmetic evidence only, never a production review or policy.
 const binding={ownerId:owner,goalId:owner,goalRevision:revision,preset,sourceFingerprint:input.evidence.fingerprint,policyVersion,policyDigest};
 input.macroBinding=binding;
 input.macroContext={binding:{...binding},current:input.current,
 review:{status:'reviewed',reviewId:'synthetic-review',reviewedAt:input.now-1000,expiresAt:input.now+60000,ageYears:30,eligibility:'eligible'},
 limits:{proteinMinG:0,proteinMaxG:10000,carbsMinG:0,carbsMaxG:10000,fatsMinG:0,fatsMaxG:10000,fatMinFraction:0,fatMaxFraction:1}};
 return input;
}

function fixture(){return syntheticMacro({current:{calories:2000,proteinG:150,carbsG:215,fatsG:60,fiberG:30},
 anchor:{baselineCapturedAt:now-14*86400000,intake:2000,expenditure:2500,acceptedDelta:0,acceptedCount:0,receiptsVerified:true,lastAcceptedAt:null},observedExpenditure:2300,
 policy:{reviewed:true,maxStepKcal:200,maxStepFraction:.05,maxNetDeltaKcal:300,reviewIntervalDays:14,incrementKcal:50,minIntakeKcal:1500,maxIntakeKcal:4000},
 evidence:{eligible:true,modelReviewed:true,logging:'confirmed',capturedAt:now,fingerprint:'a'.repeat(64),stability:'stable',goalDirectionValid:true},now});}
test('reductions suspended; capped upward draft remains non-actionable',()=>{const f=fixture();f.observedExpenditure=2300;assert.equal(draft(f).reason,'individual_deficit_review_required');f.observedExpenditure=2800;const r=draft(f);assert.equal(r.deltaKcal,100);assert.equal(r.target.calories,2100);assert.equal(r.actionable,false);});
test('anchor preserves deficit rather than stacking another deficit',()=>{const f=fixture();f.current={calories:1900,proteinG:150,carbsG:190,fatsG:60,fiberG:30};f.anchor.acceptedDelta=-100;f.anchor.acceptedCount=1;f.anchor.lastAcceptedAt=now-14*86400000;f.observedExpenditure=2400;assert.equal(draft(f).kind,'no_change');});
test('huge expenditure shifts cannot produce500or1000 change',()=>{for(const x of [1000,5000]){const f=fixture();f.observedExpenditure=x;const r=draft(f);if(x<2500)assert.equal(r.reason,'individual_deficit_review_required');else assert.ok(Math.abs(r.deltaKcal)<=200);}});
test('reduction remains blocked above floor; missing floor still rejected',()=>{const f=fixture();f.observedExpenditure=2300;f.policy.minIntakeKcal=1950;assert.equal(draft(f).reason,'individual_deficit_review_required');f.policy.minIntakeKcal=undefined;assert.equal(draft(f).reason,'policy_invalid');});
test('unreviewed unknown or inferred completeness never grants adaptation',()=>{for(const patch of [{eligible:false},{modelReviewed:false},{logging:'heuristic'},{logging:'unknown'},{stability:'uncertain'},{goalDirectionValid:false}]){const f=fixture();Object.assign(f.evidence,patch);assert.equal(draft(f).kind,'blocked');}});
test('cooldown exact14days and fresh snapshot boundary',()=>{const f=fixture();f.observedExpenditure=2800;f.anchor.acceptedCount=1;f.anchor.lastAcceptedAt=now-14*86400000+1;assert.equal(draft(f).reason,'review_cooldown');f.anchor.lastAcceptedAt-=1;assert.equal(draft(f).kind,'draft');f.evidence.capturedAt=now-30001;assert.equal(draft(f).reason,'source_expired_or_invalid');});
test('net deviation still bounds increases and cannot authorize reductions',()=>{const f=fixture();f.policy.maxNetDeltaKcal=50;f.observedExpenditure=2300;assert.equal(draft(f).reason,'individual_deficit_review_required');f.observedExpenditure=3000;assert.equal(draft(f).deltaKcal,50);});
test('malformed and anchor mismatch blocked',()=>{assert.equal(draft(null).kind,'blocked');const f=fixture();f.anchor.acceptedDelta=1;assert.equal(draft(f).reason,'anchor_mismatch');});
test('future timestamps and nonfinite policy inputs rejected',()=>{const f=fixture();f.evidence.capturedAt=now+1;assert.equal(draft(f).kind,'blocked');f.evidence.capturedAt=now;f.policy.maxStepKcal=Infinity;assert.equal(draft(f).reason,'policy_invalid');});

test('returning to baseline cannot erase accepted history cooldown',()=>{const f=fixture();f.anchor.acceptedCount=2;assert.equal(draft(f).reason,'acceptance_history_invalid');f.anchor.lastAcceptedAt=now-86400000;assert.equal(draft(f).reason,'review_cooldown');});

test('first review waits fourteen days after baseline without fabricating acceptance history',()=>{
 const f=fixture();f.observedExpenditure=2800;f.anchor.baselineCapturedAt=now-14*86400000+1;assert.equal(draft(f).reason,'review_cooldown');
 f.anchor.baselineCapturedAt--;assert.equal(draft(f).kind,'draft');
 for(const v of [undefined,null,NaN,now+1]){f.anchor.baselineCapturedAt=v;assert.equal(draft(f).reason,'baseline_invalid');}
});

test('protein and fiber remain exact for permitted upward adjustments',()=>{
 for(const [expenditure,calories,carbs,fats] of [[2800,2100,240,60]]){
 const f=fixture();f.observedExpenditure=expenditure;const r=draft(f);
 assert.equal(r.kind,'draft');assert.deepEqual(r.target,{calories,proteinG:150,carbsG:carbs,fatsG:fats,fiberG:30});
 assert.ok(Math.abs(calories-4*r.target.proteinG-4*carbs-9*fats)<=10);
 }
});
test('explicit synthetic limits permit carbs-only and fat-priority residual',()=>{
 const f=fixture();f.observedExpenditure=2800;f.current.carbsG=350;f.current.fatsG=0;let r=draft(f);
 assert.equal(r.kind,'draft');assert.equal(r.target.fatsG,0);assert.equal(r.target.carbsG,375);
 f.current.carbsG=0;f.current.fatsG=156;r=draft(f);
 assert.equal(r.kind,'draft');assert.equal(r.target.carbsG,24);assert.equal(r.target.fatsG,156);
 assert.equal(r.target.proteinG,150);
});
test('explicit synthetic protein range permits residual while reductions remain blocked',()=>{
 const f=fixture();f.observedExpenditure=2800;f.current.proteinG=500;f.current.carbsG=0;f.current.fatsG=0;
 assert.equal(draft(f).target.carbsG,25);
 f.current.proteinG=490;f.current.carbsG=10;f.observedExpenditure=2300;
 assert.equal(draft(f).reason,'individual_deficit_review_required');
});
test('fixed fractional macros are not silently rounded',()=>{
 const f=fixture();f.observedExpenditure=2800;f.current.proteinG=150.5;assert.equal(draft(f).reason,'macro_input_invalid');
 f.current.proteinG=150;f.current.fiberG=30.5;assert.equal(draft(f).reason,'macro_input_invalid');
});
test('residual rounding stays nonnegative integer and within energy tolerance',()=>{
 for(let protein=50;protein<=300;protein+=25)for(let fat=0;fat<=100;fat+=10){
 const f=fixture();f.current.proteinG=protein;f.current.fatsG=fat;
 f.current.carbsG=Math.round((2000-4*protein-9*fat)/4);
 if(f.current.carbsG<0)continue;
 for(const expenditure of [2200,2800]){
 f.observedExpenditure=expenditure;const r=draft(f);
 if(expenditure<2500){assert.equal(r.reason,'individual_deficit_review_required');continue;}
 if(r.kind!=='draft'){assert.equal(r.reason,'macro_distribution_unavailable');continue;}
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

/** Prepared reduction-suspension regressions; not executed while runner is blocked. */
test('extra synthetic review fields cannot authorize any reduction or mutate input',()=>{
 for(const observed of [1,1000,2300,2499]){
 const f=fixture();f.observedExpenditure=observed;
 f.individualDeficitReview={reviewed:true,maxTotalDeficitKcal:100000};
 f.policy.individualDeficitReviewed=true;f.evidence.individualDeficitReviewed=true;
 const before=structuredClone(f);
 assert.equal(draft(f).reason,'individual_deficit_review_required');assert.deepEqual(f,before);
 }
});
test('unchanged anchored target stays no_change without invented individual review',()=>{
 const f=fixture();f.observedExpenditure=2500;
 assert.deepEqual(draft(f),{kind:'no_change',reason:'same_anchored_target'});
});

test('missing reviewed macro context blocks only after prior safety gates',()=>{
 const f=fixture();delete f.macroContext;delete f.macroBinding;
 f.observedExpenditure=2800;assert.equal(draft(f).reason,'macro_context_required');
 f.observedExpenditure=2300;assert.equal(draft(f).reason,'individual_deficit_review_required');
 f.observedExpenditure=2500;assert.equal(draft(f).kind,'no_change');
});
