import test from 'node:test';import assert from 'node:assert/strict';
import {diagnosticFromSnapshot as map} from '../release-candidates/tdee-adaptive-review/schedulerDiagnostic.ts';
import {createDurableSchedulerPorts} from '../release-candidates/tdee-adaptive-review/dailySchedulerStorage.ts';
const now=Date.parse('2026-11-16T12:00:00Z');
test('only actual snapshot hold reason contracts start seven-day reassessment',()=>{
 for(const reason of ['coverage_insufficient','target_or_trend_unavailable','within_product_tolerance','rate_uncertainty_unverified','rate_difference_uncertain'])assert.deepEqual(map({kind:'no_change',reason,reevaluateAt:now+604800000},now),{kind:'uncertain',reason});
});
test('blocked unknown malformed and timestamp mismatches never clear holds',()=>{
 for(const r of [null,{}, {kind:'draft'}, {kind:'blocked',reason:'review_required'}, {kind:'no_change',reason:'new_reason'}, {kind:'no_change',reason:'rate_difference_uncertain'}, {kind:'no_change',reason:'rate_difference_uncertain',reevaluateAt:now+1}])assert.equal(map(r,now).kind,'preserve');
});
test('explicit same rate target only resolves without reassessment metadata',()=>{
 assert.equal(map({kind:'no_change',reason:'same_rate_target'},now).kind,'resolved');
 assert.equal(map({kind:'no_change',reason:'same_rate_target',reevaluateAt:now+604800000},now).kind,'preserve');
});
test('invalid diagnostic clock never modifies hold',()=>{assert.equal(map({kind:'no_change',reason:'same_rate_target'},NaN).kind,'preserve');});
test('durable wiring OFF blocks every binding and database callback including failure path',async()=>{
 let calls=0;const bad=()=>{calls++;throw Error('unexpected');};
 const ports=createDurableSchedulerPorts({transaction:bad},{loadInput:bad,evaluateSnapshot:bad,now:bad,newClaimId:bad});
 for(const action of [()=>ports.loadOwnContext(),()=>ports.claim({},0),()=>ports.evaluateReadOnly({},'x'),()=>ports.complete({},'x','completed'),()=>ports.complete({},'x','uncertain')])await assert.rejects(action,/safety_review_required/);
 assert.equal(calls,0);
});

test('actual initial assessment hold contract recognizes every supported reason',()=>{
 for(const reason of ['complete_days_insufficient','weight_days_insufficient','weight_distribution_insufficient','complete_days_unverified','journey_start_unverified','initial_fourteen_days_not_elapsed','rate_sensitivity_uncertain','within_product_tolerance','rate_uncertainty_unverified'])
 assert.equal(map({version:'initial-rate-assessment-v1',kind:'hold',actionable:false,recommendation:null,reason,reevaluateAt:now+604800000},now).kind,'uncertain');
});
test('unknown malformed or blocked initial assessment contracts preserve hold',()=>{
 const v={version:'initial-rate-assessment-v1',kind:'hold',actionable:false,recommendation:null,reason:'complete_days_insufficient',reevaluateAt:now+604800000};
 for(const change of [{version:'unknown'},{kind:'blocked'},{actionable:true},{recommendation:{}},{reason:'new_unknown_reason'},{reevaluateAt:now+1}])assert.equal(map({...v,...change},now).kind,'preserve');
});
test('delayed verified evaluation uses actual assessedAt, never old plannedAt',async()=>{
 const {diagnosticFromAssessment}=await import('../release-candidates/tdee-adaptive-review/schedulerDiagnostic.ts');
 const assessedAt=now+2500,result={version:'initial-rate-assessment-v1',kind:'hold',actionable:false,recommendation:null,reason:'rate_sensitivity_uncertain',reevaluateAt:assessedAt+604800000};
 assert.equal(diagnosticFromAssessment({assessedAt,result},now,assessedAt+100).kind,'uncertain');
 for(const [a,p,n] of [[assessedAt,assessedAt+1,assessedAt+100],[assessedAt,now,assessedAt-1],[assessedAt,now,assessedAt+30001],[NaN,now,assessedAt]])assert.equal(diagnosticFromAssessment({assessedAt:a,result},p,n).kind,'preserve');
});
