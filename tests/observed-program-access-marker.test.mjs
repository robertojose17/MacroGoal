import test from 'node:test';
import assert from 'node:assert/strict';
import {createObservationHandler} from '../supabase/functions/observed-snapshot-release/functions/observed-program/handler.ts';
const owner='11111111-1111-4111-8111-111111111111';
function setup({premium=true,enabled=false,mutate=()=>{},failure=false}={}) {
 const today=new Date().toISOString().slice(0,10);
 const context={ownerId:owner,premium,enabled,reviewDay:0,today,nextReviewDate:today,reviewDue:false,currentGoal:null,proposal:null,fingerprint:'a'.repeat(64),safety:{enabled:false,eligibility:'unverified'}};
 const snapshot={version:'observed-snapshot-v1',ownerId:owner,capturedAt:new Date().toISOString(),sourceFingerprint:'b'.repeat(64),context,counts:null,sources:null};
 const fresh={...structuredClone(context),accessValidUntil:Date.now()+25000}; mutate(fresh);
 let reads=0,writes=0,prepared=0;
 const handler=createObservationHandler({authenticate:async()=>owner,prepare:async()=>{prepared++},snapshot:async()=>snapshot,context:async()=>{reads++;if(failure)throw Error('observation_unavailable');return fresh;},settings:async()=>{writes++;throw Error('unexpected_write')}});
 return {fresh,run:async(view='program')=>{const response=await handler(new Request('https://example.test?mode=observed-program-v1&view='+view,{headers:{authorization:'Bearer test'}}));return {status:response.status,body:await response.json(),reads,writes,prepared}}};
}
test('disabled premium program preserves exact fresh authoritative expiry without enabling observations',async()=>{
 const fixture=setup(),r=await fixture.run();assert.equal(r.status,200);assert.equal(r.body.accessValidUntil,fixture.fresh.accessValidUntil);assert.equal(r.body.premium,true);assert.equal(r.body.enabled,false);assert.equal(r.body.reason,'disabled');assert.equal(r.body.estimate,null);assert.equal(r.body.proposal,null);assert.equal(r.reads,1);assert.equal(r.prepared,1);assert.equal(r.writes,0);
});
test('disabled estimate preserves expiry; inactive grant stays inactive',async()=>{
 for(const premium of [true,false]){const fixture=setup({premium}),r=await fixture.run('estimate');assert.equal(r.status,200);assert.equal(r.body.accessValidUntil,fixture.fresh.accessValidUntil);assert.equal(r.writes,0);}
 const r=await setup({premium:false}).run();assert.equal(r.body.premium,false);assert.equal(r.body.reason,'premium_required');
});
test('normal non-tester context does not acquire an invented expiry',async()=>{
 const r=await setup({mutate:f=>delete f.accessValidUntil}).run();assert.equal(r.status,200);assert.equal(Object.hasOwn(r.body,'accessValidUntil'),false);
});
test('disabled path rejects owner, safety, expiry shape, fingerprint and entitlement changes',async()=>{
 for(const mutate of [f=>f.ownerId='other',f=>f.safety.enabled=true,f=>f.accessValidUntil='bad',f=>f.fingerprint='c'.repeat(64),f=>f.premium=false,f=>f.enabled=true]){const r=await setup({mutate}).run();assert.notEqual(r.status,200);assert.equal(r.writes,0);assert.equal(r.body.accessValidUntil,undefined);}
});
test('fresh context failure never falls back to markerless snapshot',async()=>{
 const r=await setup({failure:true}).run();assert.equal(r.status,403);assert.equal(r.body.error,'observation_unavailable');assert.equal(r.writes,0);
});
