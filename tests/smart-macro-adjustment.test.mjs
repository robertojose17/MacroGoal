/** PREPARED, NOT EXECUTED: runner blocker. Reviews/limits are synthetic arithmetic fixtures, not clinical policy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustSmartMacros as adjust} from '../release-candidates/tdee-adaptive-review/smartMacroAdjustment.ts';
const now=1794668400000,hash='a'.repeat(64);
function fixture(){
 const current={calories:2000,proteinG:150,carbsG:200,fatsG:67,fiberG:30};
 const binding={ownerId:'synthetic-owner',goalId:'synthetic-goal',goalRevision:'r1',preset:'balanced',sourceFingerprint:hash,policyVersion:'synthetic-v1',policyDigest:hash};
 return {current,newCalories:1800,now,sourceFingerprint:hash,binding,
 context:{binding:{...binding},current:structuredClone(current),
 review:{status:'reviewed',reviewId:'synthetic-review',reviewedAt:now-1000,expiresAt:now+1000,ageYears:30,eligibility:'eligible'},
 limits:{proteinMinG:140,proteinMaxG:160,carbsMinG:130,carbsMaxG:400,fatsMinG:40,fatsMaxG:90,fatMinFraction:.2,fatMaxFraction:.35}}};
}
test('50 100 200 kcal reductions preserve protein and prefer current fat',()=>{
 for(const [calories,carbs] of [[1950,187],[1900,174],[1800,149]]){
 const x=fixture();x.newCalories=calories;const r=adjust(x);
 assert.equal(r.kind,'candidate');assert.deepEqual(r.target,{calories,proteinG:150,carbsG:carbs,fatsG:67,fiberG:30});
 assert.equal(r.actionable,false);assert.equal(r.requiresAcceptance,true);
 }
});
test('increase primarily changes carbs not protein',()=>{
 const x=fixture();x.newCalories=2100;const r=adjust(x);
 assert.equal(r.target.proteinG,150);assert.equal(r.target.fatsG,67);assert.equal(r.target.carbsG,224);
});
test('carb floor allows protected fat redistribution',()=>{
 const x=fixture();x.context.limits.carbsMinG=160;const r=adjust(x);
 assert.equal(r.kind,'candidate');assert.equal(r.target.fatsG,62);assert.equal(r.target.carbsG,161);
});
test('infeasible distribution does not change goals',()=>{
 const x=fixture();x.context.limits.carbsMinG=300;const before=structuredClone(x);
 assert.equal(adjust(x).reason,'macro_distribution_unavailable');assert.deepEqual(x,before);
});
test('protein outside reviewed range is never automatically reduced',()=>{
 const x=fixture();x.context.limits.proteinMaxG=149;
 assert.equal(adjust(x).reason,'protein_review_required');
});
test('explicit low carb and low fat limits honored with supplied review',()=>{
 const x=fixture();x.newCalories=1500;x.context.limits.carbsMinG=50;x.context.limits.carbsMaxG=100;x.context.limits.fatMaxFraction=.5;
 const r=adjust(x);assert.equal(r.kind,'candidate');assert.ok(r.target.carbsG>=50&&r.target.carbsG<=100);
 const y=fixture();y.context.limits.fatsMaxG=45;y.context.limits.fatMaxFraction=.25;
 const s=adjust(y);assert.equal(s.kind,'candidate');assert.equal(s.target.fatsG,45);
});
test('custom consent must be explicit bound and smart',()=>{
 const x=fixture();x.binding.preset='custom';x.context.binding.preset='custom';
 assert.equal(adjust(x).reason,'custom_macro_consent_required');
 x.context.customChoice={mode:'preserve_percent',binding:{...x.binding},consentId:'synthetic-consent',acceptedAt:now-1};
 assert.equal(adjust(x).reason,'custom_percentage_review_required');
 x.context.customChoice.mode='smart';assert.equal(adjust(x).kind,'candidate');
 x.context.customChoice.binding.goalRevision='old';assert.equal(adjust(x).reason,'custom_macro_consent_required');
});
test('absent expired restricted underage or truthy evidence blocks',()=>{
 const x=fixture();delete x.context;assert.equal(adjust(x).reason,'macro_context_required');
 for(const patch of [{status:true},{eligibility:'unknown'},{eligibility:'restricted'},{ageYears:18.99},{expiresAt:now},{reviewedAt:now+1},{expiresAt:Infinity}]){
 const y=fixture();Object.assign(y.context.review,patch);assert.equal(adjust(y).reason,'macro_review_required');
 }
});
test('binding components and exact current target are checked',()=>{
 for(const key of ['ownerId','goalId','goalRevision','preset','sourceFingerprint','policyVersion','policyDigest']){
 const x=fixture();x.context.binding[key]='other';assert.equal(adjust(x).reason,'macro_binding_mismatch');
 }
 const x=fixture();x.context.current.fiberG++;assert.equal(adjust(x).reason,'macro_binding_mismatch');
});
test('malformed limits and numeric ranges fail closed',()=>{
 for(const v of [undefined,null,'130',NaN,Infinity,-1]){
 const x=fixture();x.context.limits.carbsMinG=v;assert.equal(adjust(x).reason,'macro_limits_invalid');
 }
 const x=fixture();x.newCalories=10001;assert.equal(adjust(x).reason,'macro_input_invalid');
 x.newCalories=1800;x.context.limits.fatMinFraction=.9;x.context.limits.fatMaxFraction=.2;
 assert.equal(adjust(x).reason,'macro_limits_invalid');
});
test('deterministic copied result has no acceptance or rejection side effects',()=>{
 const x=fixture();const before=structuredClone(x);const a=adjust(x),b=adjust(x);
 assert.deepEqual(a,b);a.target.proteinG=1;assert.deepEqual(x,before);
 x.binding.goalRevision='r2';assert.equal(adjust(x).reason,'macro_binding_mismatch');
});
