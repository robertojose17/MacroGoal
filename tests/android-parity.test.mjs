import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readAndroidSteps} from '../utils/healthConnectSteps.mjs';
function provider(overrides={}) {return {SdkAvailabilityStatus:{SDK_AVAILABLE:3,SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED:2},getSdkStatus:async()=>3,initialize:async()=>true,getGrantedPermissions:async()=>[{recordType:'Steps',accessType:'read'}],aggregateRecord:async()=>({COUNT_TOTAL:1234}),...overrides};}
test('Android uses deduplicated aggregate only with complete local calendar-day range',async()=>{
 const day=new Date(2026,2,8,12);let call;
 const result=await readAndroidSteps(provider({aggregateRecord:async r=>{call=r;return {COUNT_TOTAL:1234};},readRecords:()=>{throw Error('Raw records must not be read');}}),day);
 assert.equal(result.steps,1234);assert.equal(result.permission,'granted');assert.equal(call.recordType,'Steps');
 const start=new Date(day);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
 assert.equal(call.timeRangeFilter.startTime,start.toISOString());assert.equal(call.timeRangeFilter.endTime,end.toISOString());assert.equal(day.getHours(),12);
});
test('unavailable/update/denied never reads health records or reports fabricated zero',async()=>{
 for(const status of [1,2]) {const result=await readAndroidSteps(provider({getSdkStatus:async()=>status,initialize:()=>{throw Error('must not initialize');}}),new Date());assert.equal(result.available,false);assert.equal(result.steps,null);assert.match(result.error,status===2?/Install or update/:/not available/);}
 const result=await readAndroidSteps(provider({getGrantedPermissions:async()=>[],aggregateRecord:()=>{throw Error('must not read');}}),new Date());assert.equal(result.steps,null);assert.equal(result.permission,'not_determined');
});
test('aggregate empty day, caps and failures preserve established semantics',async()=>{
 for(const [count,expected] of [[0,0],[1234.4,1234],[60000,50000]]) assert.equal((await readAndroidSteps(provider({aggregateRecord:async()=>({COUNT_TOTAL:count})}),new Date())).steps,expected);
 for(const count of [-1,NaN,Infinity]) await assert.rejects(readAndroidSteps(provider({aggregateRecord:async()=>({COUNT_TOTAL:count})}),new Date()),/invalid step total/);
 await assert.rejects(readAndroidSteps(provider({aggregateRecord:async()=>{throw Error('provider failed');}}),new Date()),/provider failed/);
});
test('Android profile/settings match iPhone source and tabs hide recipes',()=>{
 for(const base of ['app/(tabs)/profile','app/settings']) assert.equal(fs.readFileSync(new URL('../'+base+'.android.tsx',import.meta.url),'utf8'),fs.readFileSync(new URL('../'+base+'.ios.tsx',import.meta.url),'utf8'));
 const layout=fs.readFileSync(new URL('../app/(tabs)/_layout.tsx',import.meta.url),'utf8');assert.match(layout,/name="recipes" options={{ href: null }}/);
});

// Exercise the same acceptance/progress helpers used by the native component and hook.
import {acceptWithHealthBaseline,readChallengeMetric,healthChallengeProgress} from '../utils/challengeHealth.mjs';
test('Android pre-acceptance activity never counts toward a newly accepted challenge',async()=>{
 let baseline;const readers={getStepsForDate:async()=>({available:true,permission:'granted',steps:8000})};
 await acceptWithHealthBaseline('steps',readers,async value=>{baseline=value;});
 assert.equal(baseline,8000);assert.deepEqual(healthChallengeProgress(8000,baseline,1000),{progress:0,progressPct:0});
 assert.deepEqual(healthChallengeProgress(8250,baseline,1000),{progress:250,progressPct:25});
 assert.deepEqual(healthChallengeProgress(9000,baseline,1000),{progress:1000,progressPct:100});
});
test('denied, unsupported and failed health reads cannot submit a zero baseline',async()=>{
 let saves=0;
 for(const result of [{available:false,permission:'denied',steps:null},{available:true,permission:'not_determined',steps:null},{available:true,permission:'granted',steps:null}]) await assert.rejects(acceptWithHealthBaseline('steps',{getStepsForDate:async()=>result},async()=>saves++),/Connect/);
 await assert.rejects(acceptWithHealthBaseline('exercise_minutes',{},async()=>saves++),/Connect/);
 await assert.rejects(acceptWithHealthBaseline('steps',{getStepsForDate:async()=>{throw Error('offline')}},async()=>saves++),/Connect/);
 assert.equal(saves,0);assert.equal(await readChallengeMetric('steps',{}),null);
 assert.deepEqual(healthChallengeProgress(9000,null,1000),{progress:0,progressPct:0});
 assert.deepEqual(healthChallengeProgress(null,8000,1000),{progress:0,progressPct:0});
});
test('a genuinely granted zero remains a valid baseline',async()=>{
 let value;await acceptWithHealthBaseline('steps',{getStepsForDate:async()=>({available:true,permission:'granted',steps:0})},async b=>{value=b});assert.equal(value,0);
});

import {acceptChallengeWithBaseline} from '../utils/challengeHealth.mjs';
test('referral acceptance retains its independent zero baseline on both platforms without health access',async()=>{
 for(const platform of ['ios','android']) {
  const readers=new Proxy({}, {get(){throw Error('Referral must not read health')}});let calls=0;
  const result=await acceptChallengeWithBaseline('referral',readers,async baseline=>{calls++;assert.equal(baseline,0,platform);});
  assert.equal(result,0);assert.equal(calls,1);
 }
});
test('shared acceptance dispatcher still blocks unavailable health baselines',async()=>{
 let calls=0;await assert.rejects(acceptChallengeWithBaseline('steps',{getStepsForDate:async()=>({available:false,permission:'denied',steps:null})},async()=>calls++),/Connect/);assert.equal(calls,0);
});
