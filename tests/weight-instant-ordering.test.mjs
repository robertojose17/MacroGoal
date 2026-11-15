// PREPARED ONLY: backend runner not executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedDatedWeights,weightAtEstimateDate} from '../supabase/functions/observed-snapshot-release/functions/dynamic-tdee/data.ts';
const date='2026-11-13',today='2026-11-14';
const source=()=>({timezone:'UTC',dateOfBirth:'1990-01-01',journeyStartDate:null,trackers:[],trackerWeights:[],checkIns:[],meals:[],items:[]});
const check=(weight,at)=>({date,weight,updated_at:at,created_at:at});
const result=s=>normalizedDatedWeights(s,today,date);
test('offset spelling never outranks a newer instant',()=>{const s=source();s.checkIns=[check(80,date+'T10:00:00Z'),check(79,date+'T11:00:00+02:00')];assert.equal(result(s)[0].kg,80);assert.equal(weightAtEstimateDate(s,date),80);});
test('same instant different spelling and different weights is conflict',()=>{const s=source();s.checkIns=[check(80,date+'T10:00:00Z'),check(79,date+'T12:00:00+02:00')];assert.equal(result(s),null);assert.equal(weightAtEstimateDate(s,date),null);});
test('same instant same weight has stable valid value',()=>{const s=source();s.checkIns=[check(80,date+'T10:00:00Z'),check(80,date+'T12:00:00+02:00')];assert.equal(result(s)[0].kg,80);});
test('tracker offsets use same ordering and conflicts',()=>{const s=source();s.trackers=[{id:'t',unit:'kg'}];s.trackerWeights=[{tracker_id:'t',date,value:80,created_at:date+'T10:00:00Z'},{tracker_id:'t',date,value:79,created_at:date+'T11:00:00+02:00'}];assert.equal(result(s)[0].kg,80);s.trackerWeights[1].created_at=date+'T12:00:00+02:00';assert.equal(result(s),null);});
test('invalid timestamps do not silently select a reading',()=>{for(const at of ['not-time','',null]){const s=source();s.trackers=[{id:'t',unit:'kg'}];s.trackerWeights=[{tracker_id:'t',date,value:80,created_at:at}];assert.equal(result(s),null);}const s=source();s.checkIns=[check(80,'not-time')];assert.equal(result(s),null);});
test('missing optional check-in timestamp remains lower priority, not now',()=>{const s=source();s.checkIns=[check(79,null),check(80,date+'T10:00:00Z')];assert.equal(result(s)[0].kg,80);s.checkIns=[check(80,null)];assert.equal(result(s)[0].kg,80);});
test('cross-source conflict remains fail closed for macro selection',()=>{const s=source();s.checkIns=[check(80,date+'T10:00:00Z')];s.trackers=[{id:'t',unit:'kg'}];s.trackerWeights=[{tracker_id:'t',date,value:90,created_at:date+'T11:00:00Z'}];assert.equal(result(s),null);assert.equal(weightAtEstimateDate(s,date),null);});
