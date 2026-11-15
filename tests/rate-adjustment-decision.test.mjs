/** Prepared contract tests, NOT RUN. Runner remains blocked; no alternative execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {decideRateAdjustment as decide} from '../release-candidates/tdee-adaptive-review/rateAdjustmentDecision.ts';
const now=Date.parse('2026-11-15T12:00:00Z');
function fixture(){return {now,targetRateKgPerWeek:-0.5,observedRateKgPerWeek:-0.3,
 interval:{lower:-0.4,upper:-0.2},data:{sufficient:true,stable:true,reliableInterval:true},
 currentIntakeKcal:2000,acceptedNetDeltaKcal:0,
 policy:{conversionReviewed:true,kcalPerKg:7000,maxStepKcal:200,maxStepFraction:0.1,
 minIntakeKcal:1500,maxIntakeKcal:3000,maxNetDeltaKcal:400}};}
test('variable adjustment uses nearest interval edge not point estimate',()=>{
 const f=fixture(),r=decide(f);assert.equal(r.kind,'candidate');
 // Floating arithmetic may yield99; truncation must never overstate magnitude.
 assert.ok(r.deltaKcal>=-100&&r.deltaKcal<=-99);assert.equal(r.actionable,false);assert.equal(r.requiresAcceptance,true);
 assert.equal('target' in r,false);assert.equal('macros' in r,false);
});
test('signed gain and faster-than-target loss produce upward candidates',()=>{
 for(const [target,observed,lower,upper]of [[0.5,0.3,0.2,0.4],[-0.2,-0.5,-0.6,-0.4]]){
 const f=fixture();f.targetRateKgPerWeek=target;f.observedRateKgPerWeek=observed;f.interval={lower,upper};
 const r=decide(f);assert.equal(r.kind,'candidate');assert.ok(r.deltaKcal>0&&r.deltaKcal<=200);
 }
});
test('target inside interval including boundaries holds exactly seven days',()=>{
 for(const target of [-0.4,-0.3,-0.2]){
 const f=fixture();f.targetRateKgPerWeek=target;
 assert.deepEqual(decide(f),{kind:'hold',actionable:false,reason:'target_within_interval',reevaluateAt:now+7*86400000});
 }
});
test('unreliable insufficient or unstable evidence never creates adjustment',()=>{
 for(const key of ['sufficient','stable','reliableInterval'])for(const value of [false,undefined,'true']){
 const f=fixture();f.data[key]=value;const r=decide(f);
 assert.equal(r.kind,'hold');assert.equal(r.reevaluateAt,now+7*86400000);
 }
});
test('reviewed explicit conversion and finite positive caps required with no defaults',()=>{
 for(const key of ['kcalPerKg','maxStepKcal','maxStepFraction','minIntakeKcal','maxIntakeKcal','maxNetDeltaKcal'])
 for(const value of [null,undefined,0,-1,NaN,Infinity,'7000']){
 const f=fixture();f.policy[key]=value;assert.equal(decide(f).kind,'blocked');
 }
 for(const value of [false,'true',1,undefined]){const f=fixture();f.policy.conversionReviewed=value;assert.equal(decide(f).reason,'conversion_review_required');}
});
test('absolute200 fractional step net and intake caps only tighten output',()=>{
 const base=fixture();base.targetRateKgPerWeek=-10;
 assert.equal(decide(base).deltaKcal,-200);
 for(const [key,value,max]of [['maxStepKcal',75,75],['maxStepFraction',0.025,50],['maxNetDeltaKcal',60,60],['minIntakeKcal',1970,30]]){
 const f=structuredClone(base);f.policy[key]=value;assert.ok(Math.abs(decide(f).deltaKcal)<=max);
 }
 const f=structuredClone(base);f.acceptedNetDeltaKcal=-390;assert.equal(decide(f).deltaKcal,-10);
});
test('outside existing policy holds without expanding limits',()=>{
 for(const [key,value]of [['currentIntakeKcal',1400],['currentIntakeKcal',3100],['acceptedNetDeltaKcal',401],['acceptedNetDeltaKcal',-401]]){
 const f=fixture();f[key]=value;assert.equal(decide(f).reason,'current_target_outside_policy');
 assert.equal(decide(f).reevaluateAt,now+7*86400000);
 }
});
test('malformed intervals and times block; overflowing arithmetic holds',()=>{
 for(const interval of [{lower:0,upper:-1},{lower:NaN,upper:1},{lower:-1,upper:Infinity},{lower:0,upper:1}]){
 const f=fixture();f.interval=interval;assert.equal(decide(f).kind,'blocked');
 }
 for(const time of [NaN,Infinity,1.5,8640000000000000]){const f=fixture();f.now=time;assert.equal(decide(f).kind,'blocked');}
 const f=fixture();f.targetRateKgPerWeek=-Number.MAX_VALUE;f.policy.kcalPerKg=Number.MAX_VALUE;assert.equal(decide(f).reason,'numeric_range_invalid');assert.equal(decide(f).kind,'hold');
});
test('inputs unchanged and subunit changes hold instead of rounding up',()=>{
 const f=fixture(),before=structuredClone(f);decide(f);assert.deepEqual(f,before);
 f.targetRateKgPerWeek=-0.4001;assert.equal(decide(f).kind,'hold');
});
