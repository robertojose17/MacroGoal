import {fixture,actor,hash,now} from './14d-fixture.mjs';
function setup(){
 const s=fixture();s.profile.journeyStartDate='2026-10-01';s.observation.sources.journeyStartDate='2026-10-01';
 s.currentGoal.goal_type='maintain';s.currentGoal.macro_preset='balanced';s.observation.context.currentGoal={...s.currentGoal};
 s.observation.sources.checkIns.forEach((w,i)=>w.weight=85-i*.1);
 s.policy.engine_version='rate-review-14d-v1';s.policy.increment_kcal=25;
 const input={current:{calories:2000,proteinG:150,carbsG:215,fatsG:60,fiberG:30},anchor:{baselineCapturedAt:now-14*86400000,intake:2000,expenditure:2400,acceptedDelta:0,acceptedCount:0,receiptsVerified:true,lastAcceptedAt:null},observedExpenditure:2400,policy:{reviewed:true,maxStepKcal:200,maxStepFraction:.1,maxNetDeltaKcal:400,reviewIntervalDays:14,incrementKcal:25,minIntakeKcal:1500,maxIntakeKcal:3000},evidence:{eligible:true,modelReviewed:true,logging:'confirmed',capturedAt:now-1000,fingerprint:hash,stability:'stable',goalDirectionValid:true},now};
 s.anchor.baseline_captured_at=new Date(input.anchor.baselineCapturedAt).toISOString();s.anchor.baseline_goal_snapshot=structuredClone(s.currentGoal);s.receiptChain.anchor=structuredClone(s.anchor);s.receiptChain.currentGoal=structuredClone(s.currentGoal);
 const binding={ownerId:actor,proposalId:actor,anchorId:actor,goalSnapshot:s.currentGoal,profileUpdatedAt:s.profile.updatedAt,sourceDate:'2026-11-13',today:'2026-11-14',policyVersion:'p1',policyDigest:hash,engineVersion:'rate-review-14d-v1',policyExpiresAt:s.policy.expires_at,eligibilityDigest:hash,eligibilityFingerprint:hash,eligibilityExpiresAt:s.policy.expires_at,offerExpiresAt:s.policy.expires_at,readinessFingerprint:hash};
 const mb={ownerId:actor,goalId:actor,goalRevision:s.currentGoal.updated_at,preset:'balanced',sourceFingerprint:hash,policyVersion:'p1',policyDigest:hash};
 input.macroBinding=mb;input.macroContext={binding:{...mb},current:{...input.current},review:{status:'reviewed',reviewId:'synthetic-only',reviewedAt:now-1000,expiresAt:now+600000,ageYears:30,eligibility:'eligible'},limits:{proteinMinG:0,proteinMaxG:10000,carbsMinG:0,carbsMaxG:10000,fatsMinG:0,fatsMaxG:10000,fatMinFraction:0,fatMaxFraction:1}};
 const review={version:'fourteen-day-reviewed-input-v1',reviewId:'synthetic-not-approved',methodVersion:'synthetic-test-only',reviewedAt:now-500,expiresAt:now+10000,ownerId:actor,goalId:actor,goalRevision:s.currentGoal.updated_at,profileUpdatedAt:s.profile.updatedAt,journeyBinding:hash,policyVersion:'p1',policyDigest:hash,sourceFingerprint:hash,sourceCapturedAt:now-1000,windowStart:'2026-10-31',windowEndExclusive:'2026-11-14',uncertainty:{validated:true,stable:true,lowerKgPerWeek:-.8,upperKgPerWeek:-.6},conversion:{reviewed:true,model:'approximate-energy-equivalent-v1',kcalPerKg:7700}};
 return {s,input,binding,review};
}
export {setup,actor,hash,now};
