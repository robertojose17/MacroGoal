import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateFromSources} from '../supabase/functions/observed-snapshot-release/functions/dynamic-tdee/data.ts';
import {parseObservedSnapshot} from '../supabase/functions/observed-snapshot-release/functions/observed-program/snapshot.ts';
import {parseSnapshotReviewContext} from '../release-candidates/tdee-adaptive-review/snapshotReviewContextParser.ts';
const actor='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64),now=Date.parse('2026-11-14T12:00:00Z');
function fixture(){
 const dates=Array.from({length:29},(_,i)=>new Date(Date.parse('2026-10-16T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 const goal={id:actor,user_id:actor,is_active:true,updated_at:'2026-10-01T00:00:00Z',created_at:'2026-10-01T00:00:00Z',daily_calories:2000,protein_g:150,carbs_g:215,fats_g:60,fiber_g:30,goal_type:'lose',macro_preset:null};
 const anchor={id:actor,owner_id:actor,policy_version:'p1',active_goal_id:actor,journey_binding:hash,baseline_goal_snapshot:structuredClone(goal),baseline_intake_kcal:2000,baseline_expenditure_kcal:2400,baseline_captured_at:'2026-10-01T00:00:00Z',accepted_delta_kcal:0,last_accepted_at:null,revoked:false};
 const sources={timezone:'UTC',dateOfBirth:'1990-01-01',journeyStartDate:null,trackers:[],trackerWeights:[],checkIns:dates.map((date,i)=>({id:'w'+i,date,weight:80,updated_at:date+'T08:00:00Z',created_at:date+'T08:00:00Z'})),meals:dates.flatMap((date,i)=>[{id:'m'+i+'a',date,meal_type:'breakfast'},{id:'m'+i+'b',date,meal_type:'dinner'}]),items:dates.flatMap((date,i)=>[{id:'i'+i+'a',meal_id:'m'+i+'a',calories:1250,is_scheduled:false},{id:'i'+i+'b',meal_id:'m'+i+'b',calories:1250,is_scheduled:false}])};
 const capturedAt=new Date(now-1000).toISOString();
 const observation={version:'observed-snapshot-v1',ownerId:actor,capturedAt,sourceFingerprint:hash,context:{ownerId:actor,premium:true,enabled:true,reviewDay:0,today:'2026-11-14',nextReviewDate:'2026-11-15',reviewDue:false,currentGoal:{...goal},proposal:null,fingerprint:hash,safety:{enabled:false,eligibility:'unverified'}},sources,counts:{trackers:0,trackerWeights:0,checkIns:29,meals:58,items:58}};
 return {version:'snapshot-review-context-v1',actor,capturedAt,observation,profile:{id:actor,updatedAt:'2026-10-01T00:00:00Z',sex:'male',dateOfBirth:'1990-01-01',timezone:'UTC',journeyStartDate:null,journeyRestartCount:0},currentGoal:goal,
 readiness:{version:'tdee-readiness-v1',ownerId:actor,capturedAt,questionnaireVersion:'general-adult-v1',statementVersion:'complete-day-v1',profileBinding:hash,journeyBinding:hash,timezone:'UTC',today:'2026-11-14',eligibility:{current:true,adult:true,response:'criteria_confirmed'},days:dates.map(date=>({date,contentHash:hash,confirmable:true,confirmed:true}))},readinessFingerprint:hash,
 policy:{version:'p1',engine_version:'observed-v1/snapshot-adjustment-v1',digest:hash,enabled:true,reviewed:true,snapshot_contract_reviewed:true,expires_at:'2026-12-01T00:00:00Z',max_step_kcal:200,max_step_fraction:0.1,max_cumulative_delta_kcal:400,min_days_between_acceptances:14,min_intake_kcal:1500,max_intake_kcal:3000},
 anchor,eligibility:{owner_id:actor,policy_version:'p1',eligible:true,complete_days_verified:true,source_fingerprint:hash,digest:hash,expires_at:'2026-12-01T00:00:00Z'},
 receiptChain:{actor,anchor:structuredClone(anchor),currentGoal:structuredClone(goal),totalCount:0,rows:[]},actionable:false,evidenceStatus:'unverified'};
}

test('future dated food/checkin/tracker data does not enter current estimate',()=>{
 const data=fixture().observation.sources,before=estimateFromSources(data,new Date(now));
 data.checkIns.push({id:'future-weight',date:'2026-11-15',weight:9999,updated_at:'2026-11-15T08:00:00Z',created_at:'2026-11-15T08:00:00Z'});
 data.trackers.push({id:'future-tracker',unit:'kg'});
 data.trackerWeights.push({id:'future-entry',tracker_id:'future-tracker',date:'2026-11-15',value:9999,created_at:'2026-11-15T08:00:00Z'});
 data.meals.push({id:'future-meal',date:'2026-11-15',meal_type:'breakfast'});
 data.items.push({id:'future-food',meal_id:'future-meal',calories:99999,is_scheduled:false});
 assert.deepEqual(estimateFromSources(data,new Date(now)),before);
 assert.equal(before.kcalPerDay,2500);
});
test('today remains incomplete and excluded independently from future dates',()=>{
 const data=fixture().observation.sources,before=estimateFromSources(data,new Date(now));
 data.checkIns.push({id:'today-weight',date:'2026-11-14',weight:200,updated_at:'2026-11-14T08:00:00Z',created_at:'2026-11-14T08:00:00Z'});
 data.meals.push({id:'today-meal',date:'2026-11-14',meal_type:'breakfast'});
 data.items.push({id:'today-food',meal_id:'today-meal',calories:99999,is_scheduled:false});
 assert.deepEqual(estimateFromSources(data,new Date(now)),before);
});
test('day cutoff follows user timezone rather than UTC midnight',()=>{
 const data=fixture().observation.sources;data.timezone='America/New_York';
 const result=estimateFromSources(data,new Date('2026-11-14T02:00:00Z'));
 assert.equal(result.status,'estimated');assert.equal(result.kcalPerDay,2500);
 assert.equal(result.asOf,'2026-11-12');assert.equal(result.windowDays,27);
});
test('atomic snapshot parser rejects injected future or current-day source rows',()=>{
 for(const date of ['2026-11-14','2026-11-15']){
 const x=fixture().observation;x.sources.checkIns[0].date=date;
 assert.throws(()=>parseObservedSnapshot(x,actor),/snapshot_invalid/);
 const y=fixture().observation;y.sources.meals[0].date=date;
 assert.throws(()=>parseObservedSnapshot(y,actor),/snapshot_invalid/);
 }
});
test('editing closed historical food recalculates from new values',()=>{
 const data=fixture().observation.sources;
 assert.equal(estimateFromSources(data,new Date(now)).kcalPerDay,2500);
 data.items[0].calories=2750;
 const result=estimateFromSources(data,new Date(now));
 assert.equal(result.status,'estimated');assert.equal(result.kcalPerDay,2550);
});
test('editing past weight trend changes estimate without using an old cached value',()=>{
 const data=fixture().observation.sources;
 data.checkIns.forEach((w,i)=>w.weight=80+i*0.02);
 const result=estimateFromSources(data,new Date(now));
 assert.equal(result.status,'estimated');assert.equal(result.kcalPerDay,2350);
 assert.equal(result.weightTrendKgPerWeek,0.14);
});
test('a single weight edit can leave rounded estimate unchanged but still needs fresh evidence',()=>{
 const v=fixture();v.observation.sources.checkIns[10].weight+=0.2;
 assert.equal(estimateFromSources(v.observation.sources,new Date(now)).kcalPerDay,2500);
 // Server fingerprint changes on the actual weight field; old eligibility binding
 // is deliberately retained here to exercise the parser's stale-evidence rejection.
 v.observation.sourceFingerprint='b'.repeat(64);
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now).reason,'eligibility_unavailable');
});
test('changed historical food needs reconfirmed complete-day evidence',()=>{
 const v=fixture();v.observation.sources.items[0].calories=2750;
 v.observation.sourceFingerprint='b'.repeat(64);v.eligibility.source_fingerprint='b'.repeat(64);
 // read_state returns confirmed:false when the stored content hash differs.
 v.readiness.days[0].contentHash='c'.repeat(64);v.readiness.days[0].confirmed=false;
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now).reason,'complete_days_required');
});
