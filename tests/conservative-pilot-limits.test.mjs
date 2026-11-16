import {test} from 'node:test';import assert from 'node:assert/strict';import {checkPilotRelease,checkConservativePilotLimits as check} from '../release-candidates/tdee-adaptive-review/conservativePilotLimits.ts';
const now=Date.parse('2026-11-16T12:00:00Z'),day=86400000;
// Synthetic guard fixtures only; these numbers are NOT operational policy.
const input=()=>({now,sourceCapturedAt:now,baselineAcceptedAt:now-14*day,lastAcceptedAt:null,baselineIntakeKcal:2000,currentIntakeKcal:2000,acceptedNetDeltaKcal:0,requestedDeltaKcal:150,coverageSufficient:true,policy:{maxStepKcal:200,maxStepFraction:.1,maxNetDeltaKcal:400,minIntakeKcal:1500,maxIntakeKcal:3000,minDaysBetweenAcceptances:14,incrementKcal:50}});
test('OFF refuses before input getter',()=>{assert.equal(checkPilotRelease(new Proxy({},{get(){throw Error('no');}})).reason,'conservative_pilot_off');});
test('no policy means no default step',()=>{assert.equal(check({...input(),policy:null}).reason,'pilot_policy_not_configured');});
test('valid synthetic step only passes limits, never authorizes acceptance',()=>{const r=check(input());assert.equal(r.kind,'limits_pass');assert.equal(r.actionable,false);assert.equal(r.recommendation,null);assert.equal(r.acceptanceAuthorized,false);assert.equal(r.requiresExplicitAcceptance,true);});
test('never round or clamp requested step',()=>{for(const v of [151,201,100000])assert.equal(check({...input(),requestedDeltaKcal:v}).reason,'step_limit');});
test('existing reduction block retained',()=>{assert.equal(check({...input(),requestedDeltaKcal:-50}).reason,'individual_deficit_review_required');});
test('14days cannot be shortened',()=>{const i=input();i.policy.minDaysBetweenAcceptances=13;assert.equal(check(i).reason,'pilot_policy_invalid');assert.equal(check({...input(),baselineAcceptedAt:now-14*day+1}).reason,'review_cooldown');});
test('accepted adjustment restarts actual cadence',()=>{assert.equal(check({...input(),lastAcceptedAt:now-day}).reason,'review_cooldown');});
test('source TTL unchanged',()=>{assert.equal(check({...input(),sourceCapturedAt:now-30001}).reason,'source_not_current');});
test('coverage is required but never establishes precision',()=>{assert.equal(check({...input(),coverageSufficient:false}).reason,'coverage_insufficient');});
test('cumulative history rechecked',()=>{assert.equal(check({...input(),currentIntakeKcal:2300,acceptedNetDeltaKcal:300,lastAcceptedAt:now-14*day}).reason,'cumulative_or_intake_limit');});
test('anchor delta cannot be invented or omitted',()=>{assert.equal(check({...input(),currentIntakeKcal:2100}).reason,'anchor_history_mismatch');assert.equal(check({...input(),currentIntakeKcal:2100,acceptedNetDeltaKcal:100}).reason,'acceptance_history_invalid');});
test('intake and fractional bounds enforced',()=>{let i=input();i.policy.maxIntakeKcal=2100;assert.equal(check(i).reason,'cumulative_or_intake_limit');i=input();i.policy.maxStepFraction=.05;assert.equal(check(i).reason,'step_limit');});
test('invalid NaN/Infinity and future times fail closed',()=>{assert.equal(check({...input(),requestedDeltaKcal:NaN}).reason,'anchor_history_mismatch');assert.equal(check({...input(),lastAcceptedAt:now+1}).reason,'acceptance_history_invalid');const i=input();i.policy.maxStepFraction=Infinity;assert.equal(check(i).reason,'pilot_policy_invalid');});
test('pure checker changes no input',()=>{const i=input(),before=structuredClone(i);check(i);assert.deepEqual(i,before);});
