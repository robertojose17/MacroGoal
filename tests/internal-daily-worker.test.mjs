import test from 'node:test';import assert from 'node:assert/strict';
import {isInternalWorkerAuthorized as auth,validWorkerEnvelope as envelope,validateWorkerSelection as selection,freshInternalProof as proof,createInternalDailyWorker,INTERNAL_DAILY_WORKER_RELEASE} from '../release-candidates/tdee-adaptive-review/internalDailyWorker.ts';
const secret='TEST_ONLY_NOT_A_CREDENTIAL_'.repeat(3),owner='11111111-1111-4111-8111-111111111111',scope={ownerId:owner,contextRevision:'a'.repeat(64)},t=Date.parse('2026-11-16T12:00:00Z');
test('exact existing server-configured opaque Bearer credential accepted by pure validator',async()=>{assert.equal(await auth(`Bearer ${secret}`,secret),true);});
test('fake service-role JWT claims do not grant worker authentication',async()=>{
 const fake=['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({role:'service_role',sub:owner})).toString('base64url'),'fake'].join('.');
 assert.equal(await auth(`Bearer ${fake}`,secret),false);
});
test('missing key, wrong token, malformed transport and whitespace fail closed',async()=>{
 for(const header of [null,secret,`bearer ${secret}`,`Bearer wrong`, `Bearer ${secret} `,`Bearer ${secret}\n`])assert.equal(await auth(header,secret),false);
 for(const key of [undefined,'', 'tiny',' '.repeat(64)])assert.equal(await auth(`Bearer ${secret}`,key),false);
});
test('only fixed version envelope allowed; actor keys configuration and paging rejected',()=>{
 assert.equal(envelope({version:'internal-daily-worker-v1'}),true);
 for(const extra of [{ownerId:owner},{actor:owner},{serviceRoleKey:secret},{limit:1},{cursor:'x'},{environment:'sandbox'},{approved:true}])assert.equal(envelope({version:'internal-daily-worker-v1',...extra}),false);
 for(const item of [null,[],{},'x'])assert.equal(envelope(item),false);
});
test('bounded unique validated selection rejects oversized duplicate malformed and foreign fields',()=>{
 assert.equal(selection([scope]),true);assert.equal(selection([]),true);
 for(const batch of [[scope,scope],Array(26).fill(scope),[{...scope,actor:owner}],[{...scope,contextRevision:'bad'}],[null]])assert.equal(selection(batch),false);
});
const valid={...scope,checkedAt:t,expiresAt:t+30000,active:true,revoked:false};
test('provider proof needs exact owner stable scope active unrevoked fresh bounded authority',()=>{
 assert.equal(proof(valid,scope,t+1),true);
 for(const changed of [{ownerId:'other'},{contextRevision:'b'.repeat(64)},{active:false},{revoked:true},{checkedAt:t+2},{expiresAt:t+30001},{expiresAt:t},{checkedAt:NaN}])assert.equal(proof({...valid,...changed},scope,t+1),false);
});
test('provider TTL never extended, equality expiry is rejected',()=>{
 assert.equal(proof(valid,scope,t+30000),false);assert.equal(proof(valid,scope,t+30001),false);
});
test('immutable OFF calls no selector clock provider or evaluator even with valid configured credential',async()=>{
 let calls=0;const bad=()=>{calls++;throw Error('unexpected');};const run=createInternalDailyWorker({serviceRoleKey:secret},{selectDueOwners:bad,refreshProviderProof:bad,runOwnAssessment:bad,now:bad});
 for(const request of [new Request('https://example.test/worker',{method:'POST',headers:{authorization:`Bearer ${secret}`},body:JSON.stringify({version:'internal-daily-worker-v1'})}),new Request('https://example.test/worker?owner='+owner)]){
  const res=await run(request);assert.equal(res.status,503);assert.equal((await res.json()).result,'disabled');
 }
 assert.equal(calls,0);assert.equal(INTERNAL_DAILY_WORKER_RELEASE.enabled,false);assert.ok(Object.isFrozen(INTERNAL_DAILY_WORKER_RELEASE));
});
