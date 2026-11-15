/** PREPARED, NOT RUN: backend runner remains blocked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assessInitialRateCoverage as assess,selectFourteenDayRateWindow as select,INITIAL_RATE_COVERAGE as rules} from '../release-candidates/tdee-adaptive-review/rateAdjustmentDecision.ts';
const today='2026-11-15';
const rows=Array.from({length:14},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),weightKg:80}));
const coverage={status:'explicit_self_report',confirmedDays:10,windowDays:14};
test('eight distributed weights and ten confirmed days satisfy coverage, never confidence',()=>{
 const w=select(today,rows.filter((_,i)=>[0,2,4,6,7,9,11,13].includes(i)));
 const r=assess(w,coverage);assert.equal(r.coverageSufficient,true);
 assert.equal(r.actionable,false);assert.equal(r.statisticalConfidenceEstablished,false);assert.equal(r.recommendation,null);
});
test('nine complete days and seven weights fail independently',()=>{
 assert.equal(assess(select(today,rows),{...coverage,confirmedDays:9}).reason,'complete_days_insufficient');
 assert.equal(assess(select(today,rows.slice(0,7)),coverage).reason,'weight_days_insufficient');
});
test('unverified completeness never substitutes for explicit confirmation',()=>{
 for(const c of [{...coverage,status:'unverified'},{...coverage,confirmedDays:null},{...coverage,confirmedDays:15}]){
 assert.equal(assess(select(today,rows),c).coverageSufficient,false);
 }
});
test('distribution is configurable and cannot weaken requested count minimums',()=>{
 const w=select(today,rows.slice(0,8));
 assert.equal(assess(w,coverage,{...rules,minWeightsPerHalf:2}).reason,'weight_distribution_insufficient');
 assert.equal(assess(w,coverage,{...rules,minWeightDays:7}).reason,'coverage_rules_invalid');
 assert.equal(assess(w,coverage,{...rules,minCompleteDays:9}).reason,'coverage_rules_invalid');
});
test('future/today weights do not count and duplicate readings cannot create coverage',()=>{
 assert.equal(assess(select(today,[...rows.slice(0,7),{date:today,weightKg:80}]),coverage).coverageSufficient,false);
 assert.equal(assess(select(today,[...rows.slice(0,7),rows[0]]),coverage).coverageSufficient,false);
});
test('coverage has no cooldown or automatic adjustment semantics',()=>{
 const r=assess(select(today,rows),coverage);
 for(const key of ['deltaKcal','nextAdjustmentAt','acceptanceDue','target'])assert.equal(key in r,false);
});
