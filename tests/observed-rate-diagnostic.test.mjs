/** Prepared backend tests, NOT RUN. Do not bypass the blocked runner. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {observedRateDiagnostic} from '../supabase/functions/observed-snapshot-release/functions/observed-program/rateDiagnostic.ts';
import {createObservationHandler} from '../supabase/functions/observed-snapshot-release/functions/observed-program/handler.ts';
const owner='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64);
function fixture(now=Date.now()){
 const today=new Date(now).toISOString().slice(0,10),end=Date.parse(today+'T00:00:00Z');
 const dates=Array.from({length:14},(_,i)=>new Date(end-(14-i)*86400000).toISOString().slice(0,10));
 const goal={id:owner,daily_calories:2000,protein_g:150,carbs_g:215,fats_g:60,fiber_g:30,macro_preset:'balanced',goal_type:'lose',loss_rate_lbs_per_week:1};
 return {version:'observed-snapshot-v1',ownerId:owner,capturedAt:new Date(now).toISOString(),sourceFingerprint:hash,
 context:{ownerId:owner,premium:true,enabled:true,reviewDay:0,today,nextReviewDate:today,reviewDue:false,
 currentGoal:goal,proposal:null,fingerprint:hash,safety:{enabled:false,eligibility:'unverified'}},
 sources:{timezone:'UTC',dateOfBirth:'1990-01-01',journeyStartDate:null,trackers:[],trackerWeights:[],
 checkIns:dates.map((date,i)=>({id:'w'+i,date,weight:80,updated_at:date+'T08:00:00Z',created_at:date+'T08:00:00Z'})),meals:[],items:[]},
 counts:{trackers:0,trackerWeights:0,checkIns:14,meals:0,items:0}};
}
test('summary describes weight only without raw data or inferred complete days',()=>{
 const now=Date.now(),s=fixture(now),before=structuredClone(s),r=observedRateDiagnostic(s,owner,now);
 assert.equal(r.status,'descriptive');assert.equal(r.observedRateKgPerWeek,0);assert.equal(r.weightDays,14);
 assert.equal(r.loggingCompleteness,'unverified');assert.equal(r.recommendation,null);assert.equal(r.reliableInterval,false);
 for(const key of ['weights','sourceFingerprint','ownerId','goalId','daily_calories','completeDays'])assert.equal(key in r,false);
 assert.deepEqual(s,before);
});
test('stale revoked disabled and cross-actor snapshots never produce descriptive output',()=>{
 const now=Date.now();
 for(const change of [s=>s.context.accessValidUntil=now,s=>s.ownerId='other',s=>s.context.premium=false,s=>s.context.enabled=false]){
 const s=fixture(now);change(s);assert.equal(observedRateDiagnostic(s,owner,now).status,'unavailable');
 }
 assert.equal(observedRateDiagnostic(fixture(now),owner,now+30001).reason,'source_expired');
});
function handler(snapshot,context=snapshot.context){
 const calls=[];
 return {calls,run:createObservationHandler({authenticate:async()=>owner,
 snapshot:async()=>{calls.push('snapshot');return snapshot;},
 context:async()=>{calls.push('context');return context;},
 settings:async()=>{calls.push('settings');return context;}})};
}
const request=(view='program')=>new Request('https://example.invalid/?mode=observed-program-v1&view='+view,{headers:{Authorization:'Bearer fixture'}});
test('program GET invokes diagnosis after context revalidation with no additional read',async()=>{
 const h=handler(fixture()),response=await h.run(request()),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.rateDiagnostic.status,'descriptive');
 assert.equal(body.proposal,null);assert.equal(body.observationOnly,true);assert.deepEqual(h.calls,['snapshot','context']);
});
test('changed context withholds response and estimate view preserves response contract',async()=>{
 const s=fixture(),h=handler(s,{...s.context,fingerprint:'b'.repeat(64)});
 assert.equal((await h.run(request())).status,409);
 const estimate=handler(fixture()),body=await(await estimate.run(request('estimate'))).json();
 assert.equal('rateDiagnostic' in body,false);assert.equal(body.observationOnly,true);
});
test('settings POST is not converted into a diagnostic or source read',async()=>{
 const h=handler(fixture()),response=await h.run(new Request('https://example.invalid/?mode=observed-program-v1',{method:'POST',
 headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({action:'dynamic_settings',enabled:true,reviewDay:0})}));
 const body=await response.json();assert.equal(response.status,200);
 assert.equal('rateDiagnostic' in body,false);assert.deepEqual(h.calls,['context','settings']);
});
