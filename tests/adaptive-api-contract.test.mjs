import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAdaptiveApiHandler, parseAdaptiveRequest } from '../release-candidates/tdee-adaptive-review/apiContract.ts';
const owner='11111111-1111-4111-8111-111111111111';
const request={ownerId:owner,requestId:'22222222-2222-4222-8222-222222222222',proposalId:'33333333-3333-4333-8333-333333333333',proposalDigest:'a'.repeat(64)};
const state=JSON.parse(fs.readFileSync('release-candidates/tdee-adaptive-review/program-contract-example.json','utf8'));
function setup(overrides={}) {
 const calls=[];
 const deps={authenticate:async()=>owner,program:async()=>state,
  accept:async(auth,r)=>{calls.push(['accept',auth,r]);return {version:'adaptive-receipt-v1',status:'rejected',request:r,reason:'safety_review_required'};},
  receipt:async(auth,r)=>{calls.push(['receipt',auth,r]);return {version:'adaptive-receipt-v1',status:'not_found'};},...overrides};
 return {calls,run:createAdaptiveApiHandler(deps)};
}
const req=(body,query='mode=adaptive-review-v1',token='Bearer owner-token')=>new Request('https://example.invalid/progress?'+query,{method:'POST',headers:{authorization:token},body:JSON.stringify(body)});
test('accept request has exact immutable identity only',()=>{
 assert.deepEqual(parseAdaptiveRequest(request,owner),request);
 for(const bad of [{...request,calories:1000},{...request,ownerId:'other'},{...request,requestId:'bad'},{...request,proposalDigest:'bad'},null]) assert.equal(parseAdaptiveRequest(bad,owner),null);
});
test('program returns explicit OFF contract without recommendations',async()=>{
 const {run,calls}=setup(); const r=await run(req({action:'program'}));
 assert.equal(r.status,200); assert.deepEqual(await r.json(),state); assert.equal(calls.length,0); assert.equal(r.headers.get('cache-control'),'no-store');
});
test('authoritative durable rejection is returned, not hidden as retryable error',async()=>{
 const {run,calls}=setup();const r=await run(req({action:'accept',request}));
 assert.equal(r.status,200);assert.equal((await r.json()).reason,'safety_review_required');assert.equal(calls[0][1],'Bearer owner-token');
});
test('receipt reconciliation is allowed with capability OFF',async()=>{
 const {run,calls}=setup();const r=await run(req({action:'receipt',request}));
 assert.equal((await r.json()).status,'not_found');assert.equal(calls[0][0],'receipt');
});
test('same receipt identity required, never trust other account result',async()=>{
 const {run}=setup({accept:async()=>({version:'adaptive-receipt-v1',status:'rejected',request:{...request,ownerId:'other'},reason:'no'})});
 assert.equal((await run(req({action:'accept',request}))).status,503);
});
test('not_found cannot be an acceptance outcome',async()=>{
 const {run}=setup({accept:async()=>({version:'adaptive-receipt-v1',status:'not_found'})});
 assert.equal((await run(req({action:'accept',request}))).status,503);
});
test('invalid auth or account never calls write dependency',async()=>{
 const {run,calls}=setup({authenticate:async()=>null});assert.equal((await run(req({action:'accept',request}))).status,401);assert.equal(calls.length,0);
});
test('mode, actions and overposted target values fail closed',async()=>{
 for(const [body,query] of [[{action:'accept',request,targets:{calories:1000}},undefined],[{action:'accept',request:{...request,calories:1000}},undefined],[{action:'accept',request},'mode=adaptive-review-v1&mode=adaptive-review-v1'],[{action:'dynamic_accept',request},undefined]]) {
  const {run,calls}=setup();assert.equal((await run(req(body,query))).status,400);assert.equal(calls.length,0);
 }
});
test('unknown backend errors do not leak internals',async()=>{
 const {run}=setup({receipt:async()=>{throw Error('secret SQL detail');}});
 assert.deepEqual(await (await run(req({action:'receipt',request}))).json(),{error:'source_error'});
});
test('OFF state cannot expose an actionable proposal',async()=>{
 const {run}=setup({program:async()=>({...state,proposal:{ownerId:owner}})});
 assert.equal((await run(req({action:'program'}))).status,503);
});
test('SQL candidate is uninstalled, private, gate-empty and no target request',()=>{
 const sql=fs.readFileSync('release-candidates/tdee-adaptive-review/registryCandidate.sql','utf8');
 assert.match(sql,/source_writer_protocol_required/);assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON ALL FUNCTIONS/);assert.doesNotMatch(sql,/GRANT EXECUTE|INSERT INTO macrogoal_adaptive_private\.policies/);
 assert.match(sql,/CREATE FUNCTION macrogoal_adaptive_private.accept_proposal\(p_request jsonb\)/);
 assert.match(sql,/max_step_kcal BETWEEN 1 AND 200/);assert.match(sql,/FOR UPDATE/);assert.match(sql,/sourceFingerprint/);
 assert.match(sql,/status IN \('committed','rejected'\)/);assert.match(sql,/PRIMARY KEY\(owner_id,request_id\)/);
 assert.match(sql,/g.start_date,g.start_journey_date/);assert.match(sql,/anchor.baseline_intake_kcal/);
});
