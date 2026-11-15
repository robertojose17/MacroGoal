/** PREPARED, NOT RUN; no alternate execution of blocked backend runner. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseFourteenDayRate as diagnose,RATE_PRODUCT_PARAMETERS as parameters} from '../release-candidates/tdee-adaptive-review/rateAdjustmentDecision.ts';
const now=Date.parse('2026-11-15T12:00:00Z'),today='2026-11-15',goal={goal_type:'lose',loss_rate_lbs_per_week:1};
const rows=(fn)=>Array.from({length:14},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),weightKg:fn(i)}));
test('flat trajectory is descriptive zero range, not validated plateau or recommendation',()=>{
 const r=diagnose(today,rows(()=>80),goal,now);
 assert.equal(r.sensitivity.lowerKgPerWeek,0);assert.equal(r.sensitivity.upperKgPerWeek,0);
 assert.equal(r.sensitivity.outsideToleranceAcrossEnvelope,true);
 assert.equal(r.sensitivity.statisticalConfidenceEstablished,false);assert.equal(r.reliableInterval,false);
 assert.equal(r.interval,null);assert.equal(r.recommendation,null);
});
test('isolated central spike broadens envelope and suppresses coherent-deviation assertion',()=>{
 const r=diagnose(today,rows(i=>i===7?82:80),goal,now);
 assert.ok(r.sensitivity.upperKgPerWeek>0);
 // A spike on day8 can pair with day1, but no later7day pair. Use day7
 // to test its falling side as well in a separate trajectory.
 const q=diagnose(today,rows(i=>i===6?82:80),goal,now);
 assert.ok(q.sensitivity.lowerKgPerWeek<0);
 assert.equal(q.sensitivity.outsideToleranceAcrossEnvelope,false);
 assert.equal(q.recommendation,null);
});
test('steady loss has finite sensitivity but remains unverified for prescription',()=>{
 const r=diagnose(today,rows(i=>80-i*0.05),goal,now);
 assert.ok(Math.abs(r.sensitivity.lowerKgPerWeek+0.35)<1e-10);
 assert.ok(Math.abs(r.sensitivity.upperKgPerWeek+0.35)<1e-10);
 assert.equal(r.sensitivity.outsideToleranceAcrossEnvelope,false);
 assert.equal(r.sensitivity.independentSamples,false);
});
test('sparse and future data cannot manufacture a sensitivity envelope',()=>{
 const r=diagnose(today,[{date:'2026-11-14',weightKg:80},{date:today,weightKg:79}],goal,now);
 assert.equal(r.sensitivity.status,'unavailable');assert.equal(r.sensitivity.lowerKgPerWeek,null);
});
test('product configuration never grants release or statistical validation',()=>{
 assert.equal(parameters.maxAdjustmentKcal,200);assert.equal(parameters.windowDays,14);
 assert.equal(parameters.minCompleteDays,10);assert.equal(parameters.minWeightDays,8);
 assert.equal(parameters.approximateKcalPerKg,7700);
 assert.equal(parameters.statisticalValidation,false);assert.equal(parameters.recommendationsEnabled,false);
});
