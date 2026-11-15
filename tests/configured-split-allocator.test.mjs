// PREPARED, NOT EXECUTED: runner approval blocker remains. No alternate execution.
// Synthetic arithmetic fixtures, not clinical policy or runtime authorization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateConfiguredSplit } from '../release-candidates/tdee-adaptive-review/configuredSplitAllocator.ts';
const base = () => ({ goal:{goalId:'synthetic-goal',revision:'revision-1',preset:'balanced'},
  newCalories:1800,currentProteinG:135,currentFiberG:27 });
const custom = () => {
 const x=base(); x.goal.preset='custom';
 return {...x,explicitSplit:{version:'configured-split-v1',binding:{...x.goal},proteinBps:3000,carbsBps:4000,fatBps:3000}};
};
test('balanced exact vector is inert and preserves fiber',()=>{
 const r=allocateConfiguredSplit(base());
 assert.deepEqual(r,{kind:'candidate',actionable:false,requiresAcceptance:true,resolverVersion:'configured-split-v1',
 goal:base().goal,calories:1800,proteinG:135,carbsG:180,fatsG:60,fiberG:27,energyErrorKcal:0});
});
test('three fixed presets resolve their configured shares',()=>{
 for(const [preset,proteinG,carbsG,fatsG] of [['balanced',540,720,240],['high_protein',720,630,200],['low_carb',630,450,320]]){
  const x=base();x.goal.preset=preset;x.newCalories=7200;x.currentProteinG=proteinG;
  const r=allocateConfiguredSplit(x);assert.equal(r.kind,'candidate');
  assert.deepEqual([r.proteinG,r.carbsG,r.fatsG],[proteinG,carbsG,fatsG]);
 }
});
test('custom requires explicit record, never reconstructs from grams',()=>{
 const x=base();x.goal.preset='custom';
 assert.equal(allocateConfiguredSplit(x).reason,'configured_split_missing');
 assert.equal(allocateConfiguredSplit(custom()).kind,'candidate');
});
test('custom totals and primitive types are strict, no normalization',()=>{
 for(const value of [2950,-1,3000.1,'3000',NaN,Infinity]){
  const x=custom();x.explicitSplit.proteinBps=value;
  assert.equal(allocateConfiguredSplit(x).reason,'invalid_configured_split');
 }
});
test('custom binding and version mismatches fail closed',()=>{
 for(const key of ['goalId','revision','preset']){
  const x=custom();x.explicitSplit.binding[key]='other';
  assert.equal(allocateConfiguredSplit(x).reason,'configured_split_binding_mismatch');
 }
 const x=custom();x.explicitSplit.version='other';
 assert.equal(allocateConfiguredSplit(x).reason,'configured_split_binding_mismatch');
});
test('lean body, unknown presets and overrides are not silently reinterpreted',()=>{
 const x=base();x.goal.preset='lean_body';
 assert.equal(allocateConfiguredSplit(x).reason,'non_percentage_strategy');
 x.goal.preset='__proto__';assert.equal(allocateConfiguredSplit(x).reason,'unsupported_preset');
 x.goal.preset='balanced';x.explicitSplit=custom().explicitSplit;
 assert.equal(allocateConfiguredSplit(x).reason,'unexpected_split_override');
});
test('changed protein blocks instead of distorting configured split',()=>{
 const x=base();x.newCalories=2000;
 assert.equal(allocateConfiguredSplit(x).reason,'protein_guard_conflict');
});
test('rounding is deterministic, bounded, and does not mutate input',()=>{
 const x=base();x.newCalories=1801;
 const before=structuredClone(x);const r=allocateConfiguredSplit(x);
 assert.equal(r.kind,'candidate');assert.deepEqual(r,allocateConfiguredSplit(x));
 assert.ok(r.energyErrorKcal<=10);
 for(const [g,ideal] of [[r.proteinG,1801*.3/4],[r.carbsG,1801*.4/4],[r.fatsG,1801*.3/9]]) assert.ok(Math.abs(g-ideal)<=1);
 assert.deepEqual(x,before);r.goal.revision='changed';assert.deepEqual(x,before);
});
test('domain, missing binding, nonfinite and malformed inputs reject',()=>{
 for(const value of [0,10001,NaN,Infinity,'1800',1800.5]){
  const x=base();x.newCalories=value;assert.equal(allocateConfiguredSplit(x).reason,'invalid_input');
 }
 for(const key of ['currentProteinG','currentFiberG']){
  for (const value of [NaN,10001]) { const x=base();x[key]=value;assert.equal(allocateConfiguredSplit(x).reason,'invalid_input'); }
 }
 const x=base();x.goal.revision=' ';assert.equal(allocateConfiguredSplit(x).reason,'invalid_input');
 assert.equal(allocateConfiguredSplit(null).reason,'invalid_input');
});
test('zero shares stay zero and extra authority flags grant nothing',()=>{
 const x=custom();x.explicitSplit.proteinBps=0;x.explicitSplit.carbsBps=10000;x.explicitSplit.fatBps=0;x.currentProteinG=0;
 const r=allocateConfiguredSplit(x);assert.equal(r.kind,'candidate');
 assert.deepEqual([r.proteinG,r.carbsG,r.fatsG],[0,450,0]);
 const y=base();y.newCalories=2000;y.reviewed=true;y.overrideProteinGuard=true;
 assert.equal(allocateConfiguredSplit(y).reason,'protein_guard_conflict');
});
