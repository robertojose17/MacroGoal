/** PREPARED NOT RUN. Synthetic data only; no review is created or clinically approved. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {nutritionReviewEvidence,nutritionReviewExpected} from '../release-candidates/tdee-adaptive-review/nutritionReviewEvidence.ts';
const actor='11111111-1111-4111-8111-111111111111',now=Date.parse('2026-11-15T04:00:00Z');
function fixture(){
 const request={binding:{ownerId:actor,goalId:actor,goalRevision:'2026-11-01T00:00:00Z',preset:'balanced',sourceFingerprint:'a'.repeat(64),policyVersion:'synthetic',policyDigest:'b'.repeat(64)},
 current:{calories:2000,proteinG:150,carbsG:200,fatsG:67,fiberG:30},sourceCapturedAt:new Date(now-1000).toISOString(),profileUpdatedAt:'2026-11-01T00:00:00Z',profileBinding:'c'.repeat(64),journeyBinding:'d'.repeat(64),today:'2026-11-15',ageYears:30};
 const value={version:'nutrition-review-record-v1',ownerId:actor,reviewId:actor,reviewVersion:1,decision:'eligible',binding:nutritionReviewExpected(request,'synthetic-engine'),
 limits:{proteinMinG:0,proteinMaxG:10000,carbsMinG:0,carbsMaxG:10000,fatsMinG:0,fatsMaxG:10000,fatMinFraction:0,fatMaxFraction:1},
 reviewedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+60000).toISOString(),
 provenance:{approvalRef:'synthetic-only',approvalSha256:'e'.repeat(64),approvalVersion:'v1',verifiedBy:'synthetic-administrator',verifiedAt:new Date(now-50000).toISOString()},
 capturedAt:new Date(now).toISOString(),actionable:false};
 return {request,value};
}
test('empty source never supplies review',()=>{const f=fixture();assert.equal(nutritionReviewEvidence(actor,f.request,'synthetic-engine',null,now),null);});
test('exact administrative record maps cloned limits and original review timestamps',()=>{
 const {request,value}=fixture();const r=nutritionReviewEvidence(actor,request,'synthetic-engine',value,now);
 assert.ok(r);assert.equal(r.review.reviewedAt,Date.parse(value.reviewedAt));assert.equal(r.review.ageYears,request.ageYears);
 value.limits.proteinMaxG=0;request.binding.goalId='changed';assert.equal(r.limits.proteinMaxG,10000);assert.equal(r.binding.goalId,actor);
 assert.equal(Object.hasOwn(r,'customChoice'),false);
});
test('revoked expired wrong owner wrong binding malformed provenance and limits fail closed',()=>{
 for(const mutate of [
  v=>v.decision='revoked',v=>v.expiresAt=new Date(now).toISOString(),v=>v.ownerId='other',
  v=>v.binding.profileBinding='f'.repeat(64),v=>v.binding.engineVersion='old',
  v=>v.binding.current.proteinG=1,v=>v.provenance.approvalSha256='invalid',
  v=>v.provenance.verifiedAt=new Date(now+1).toISOString(),
  v=>v.limits.fatMaxFraction=2,v=>v.reviewVersion=0]){
  const {request,value}=fixture();mutate(value);assert.equal(nutritionReviewEvidence(actor,request,'synthetic-engine',value,now),null);
 }
});
test('stale source does not become fresh through a new lookup',()=>{
 const {request,value}=fixture();request.sourceCapturedAt=new Date(now-31000).toISOString();
 assert.equal(nutritionReviewEvidence(actor,request,'synthetic-engine',value,now),null);
});
