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

test('PostgreSQL microseconds remain distinct instead of false ties',()=>{
 const s=source();s.checkIns=[check(80,date+'T10:00:00.000100Z'),check(81,date+'T10:00:00.000900Z')];
 assert.equal(result(s)[0].kg,81);assert.equal(weightAtEstimateDate(s,date),81);
 s.trackers=[{id:'t',unit:'kg'}];s.checkIns=[];
 s.trackerWeights=[{tracker_id:'t',date,value:80,created_at:date+'T10:00:00.000100Z'},{tracker_id:'t',date,value:81,created_at:date+'T12:00:00.000900+02:00'}];
 assert.equal(result(s)[0].kg,81);
});
function permutations(rows){return rows.length?rows.flatMap((row,i)=>permutations(rows.filter((_,j)=>j!==i)).map(rest=>[row,...rest])):[[]];}
test('older contradictions never override a later unambiguous instant in any order',()=>{
 const rows=[check(79,date+'T09:00:00Z'),check(80,date+'T09:00:00Z'),check(81,date+'T10:00:00Z')];
 for(const order of permutations(rows)){const s=source();s.checkIns=order;assert.equal(result(s)[0].kg,81);}
});
test('maximum-instant conflict rejects every ordering',()=>{
 const rows=[check(79,date+'T09:00:00Z'),check(80,date+'T10:00:00Z'),check(81,date+'T12:00:00+02:00')];
 for(const order of permutations(rows)){const s=source();s.checkIns=order;assert.equal(result(s),null);}
});
test('invalid civil/clock fields and unsupported precision are not normalized',()=>{
 for(const at of [date+'T24:00:00Z',date+'T23:60:00Z',date+'T23:59:60Z','2026-02-30T10:00:00Z',date+'T10:00:00.0000001Z',date+'T10:00:00+24:00',date]){
 const s=source();s.checkIns=[check(80,at)];assert.equal(result(s),null);}
});
test('equivalent microsecond instants with conflicting values still block',()=>{
 const s=source();s.checkIns=[check(80,date+'T10:00:00.123456Z'),check(81,date+'T12:00:00.123456+02:00')];assert.equal(result(s),null);
});
