import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {setup,actor,hash,now} from './rate-storage-fixture.mjs';
import {rateReviewRequest,rateReviewEvidence} from '../release-candidates/tdee-adaptive-review/rateReviewEvidence.ts';
import {rateMacroRequest,buildRateReviewedContext} from '../release-candidates/tdee-adaptive-review/rateReviewedContext.ts';
const policy={version:'p1',digest:hash,engineVersion:'rate-review-14d-v1'};
function record(){const x=setup(),expected=rateReviewRequest(x.s,actor,policy,now);return {x,expected,value:{version:'rate-review-record-v1',actionable:false,decision:'reviewed',reviewId:actor,reviewVersion:1,binding:expected,methodVersion:'synthetic-only',interval:{lowerKgPerWeek:-.8,upperKgPerWeek:-.6},conversion:{model:'approximate-energy-equivalent-v1',kcalPerKg:7700},reviewedAt:new Date(now-500).toISOString(),expiresAt:new Date(now+10000).toISOString(),recordedAt:new Date(now-100).toISOString(),capturedAt:new Date(now).toISOString(),provenance:{approvalRef:'synthetic-not-approved',approvalDigest:hash,approvalVersion:'test-only',verifiedBy:'synthetic-reviewer',verifiedAt:new Date(now-200).toISOString()}}};}
function derived(){const {x,expected,value}=record(),review=rateReviewEvidence(expected,value,now),request=rateMacroRequest(x.s,actor,policy,now);const consent={mode:'smart',binding:structuredClone(request.binding),consentId:actor,acceptedAt:now-10000,choiceVersion:1,splitBps:null};x.input.macroContext.review.ageYears=request.ageYears;const macro={version:'snapshot-macro-evidence-v1',request,review:x.input.macroContext,consent,preferenceStatus:'current'};return {x,review,macro};}

test('missing or nullable persisted increment remains blocked with no fallback',()=>{
 for(const value of [undefined,null]){const {x,review,macro}=derived();if(value===undefined)delete x.s.policy.increment_kcal;else x.s.policy.increment_kcal=value;
 const before=structuredClone(x.s);assert.equal(buildRateReviewedContext(x.s,actor,actor,policy,review,macro,now),null);assert.deepEqual(x.s,before);}
});
test('invalid positive-integer increment cannot form a reviewed context',()=>{
 for(const value of [0,-1,1.5,201,NaN,Infinity,'25',false]){const {x,review,macro}=derived();x.s.policy.increment_kcal=value;
 assert.equal(buildRateReviewedContext(x.s,actor,actor,policy,review,macro,now),null,String(value));}
});
test('explicit increment is shape only and cannot replace policy or review approval',()=>{
 for(const mutate of [x=>x.s.policy.enabled=false,x=>x.s.policy.reviewed=false,x=>x.s.policy.snapshot_contract_reviewed=false,x=>x.s.eligibility.eligible=false]){
 const {x,review,macro}=derived();mutate(x);assert.equal(buildRateReviewedContext(x.s,actor,actor,policy,review,macro,now),null);}
 const {x,review,macro}=derived();macro.review=null;assert.equal(buildRateReviewedContext(x.s,actor,actor,policy,review,macro,now),null);
});
test('valid synthetic shape preserves explicitly selected increment',()=>{
 const {x,review,macro}=derived(),result=buildRateReviewedContext(x.s,actor,actor,policy,review,macro,now);
 assert.ok(result);assert.equal(result.input.policy.incrementKcal,x.s.policy.increment_kcal);
});

