import test from 'node:test';import assert from 'node:assert/strict';
import {createInternalWorkerDispatcher} from '../release-candidates/tdee-adaptive-review/internalWorkerDispatcher.ts';
test('OFF internal route never invokes existing handler or runtime loader for any method/body/query',async()=>{
 let calls=0;const bad=()=>{calls++;throw Error('unexpected')},handle=createInternalWorkerDispatcher(bad,bad);
 for(const prefix of ['/functions/v1/ai-coach-daily','/ai-coach-daily'])for(const method of ['GET','POST','OPTIONS','DELETE'])for(const query of ['','?mode=adaptive-accept-v1','?actor=forged']){
  const r=await handle(new Request('https://example.invalid'+prefix+'/internal-tdee-daily-v1'+query,{method,headers:{authorization:'Bearer fake',origin:'https://example.invalid'}}));
  assert.equal(r.status,503);assert.equal((await r.json()).result,'disabled');assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
 assert.equal(calls,0);
});
test('all existing modes and methods forward original Request and response untouched',async()=>{
 let loads=0,count=0;const response=new Response('unchanged',{status:207});let expected;
 const handle=createInternalWorkerDispatcher(async r=>{assert.strictEqual(r,expected);count++;return response},async()=>{loads++;throw Error('unexpected')});
 for(const path of ['/functions/v1/ai-coach-daily','/ai-coach-daily'])for(const query of ['','?mode=adaptive-accept-v1','?mode=adaptive-review-v1','?mode=observed-progress-v1','?mode=observed-v1','?mode=preview-v1','?mode=adaptive-review-v1&mode=preview-v1'])for(const method of ['GET','POST','OPTIONS']){
  expected=new Request('https://example.invalid'+path+query,{method});assert.strictEqual(await handle(expected),response);
 }
 assert.equal(count,42);assert.equal(loads,0);
});
test('similar paths and injected route strings never hijack an existing request',async()=>{
 let count=0;const handle=createInternalWorkerDispatcher(async()=>{count++;return new Response('legacy')},async()=>{throw Error('load')});
 for(const p of ['/other/internal-tdee-daily-v1','/ai-coach-daily/internal-tdee-daily-v1/','/ai-coach-daily?mode=internal-tdee-daily-v1','/ai-coach-daily?next=/internal-tdee-daily-v1','/ai-coach-daily/INTERNAL-TDEE-DAILY-V1']){
  assert.equal(await(await handle(new Request('https://example.invalid'+p))).text(),'legacy');
 }
 assert.equal(count,5);
});
