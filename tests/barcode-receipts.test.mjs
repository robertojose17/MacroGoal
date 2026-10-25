import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReceiptFetch,persistRecoveryReceipt} from '../supabase/functions/vision-nutrition-extract/recovery-receipts.mjs';
const url='https://openrouter.ai/api/v1/chat/completions';
const init={method:'POST',body:JSON.stringify({model:'google/gemini-2.5-pro',plugins:[{id:'web'}]})};
const make=(extra={})=>{const records=[],logs=[];const fetcher=createReceiptFetch({submission:'submission',revision:0,persist:async r=>records.push(structuredClone(r)),log:(...args)=>logs.push(args),...extra});return{fetcher,records,logs};};
test('receipt is durable before dispatch and original response remains readable',async()=>{
 const body={id:'gen-123',usage:{cost:0.012,prompt_tokens:20,completion_tokens:10},choices:[{finish_reason:'stop',message:{content:'private source text'}}]};
 const run=make({fetcher:async()=>{assert.equal(run.records[0].outcome,'started');return new Response(JSON.stringify(body));}});
 const response=await run.fetcher(url,init);assert.deepEqual(await response.json(),body);
 assert.equal(run.records[1].cost_usd,0.012);assert.equal(run.records[1].generation_id,'gen-123');
 assert.equal(JSON.stringify(run.records).includes('private source text'),false);
});
test('pre-dispatch persistence failure prevents all paid calls',async()=>{
 let calls=0;const run=make({persist:async()=>{throw Error('db');},fetcher:async()=>{calls++;}});
 await assert.rejects(run.fetcher(url,init));await assert.rejects(run.fetcher(url,init));assert.equal(calls,0);
});
test('transport uncertainty retains null cost rather than claiming zero',async()=>{
 const run=make({fetcher:async()=>{throw new TypeError('secret transport details');}});
 await assert.rejects(run.fetcher(url,init));assert.equal(run.records[1].outcome,'transport_error');assert.equal(run.records[1].cost_usd,null);assert.equal(run.records[1].cost_state,'unknown');
 assert.equal(JSON.stringify(run.records).includes('secret transport details'),false);
});
test('HTTP errors preserve safe receipts; malformed and invalid costs stay unknown',async()=>{
 for(const data of [{id:'gen-safe',usage:{cost:0.02},error:{message:'secret'}},{id:'unsafe id',usage:{cost:-1}},{usage:{cost:'0'}},null]){
 const run=make({fetcher:async()=>new Response(data?JSON.stringify(data):'invalid',{status:503,headers:{'x-request-id':'req-safe'}})});
 await run.fetcher(url,init);const r=run.records[1];assert.equal(r.cost_usd,data?.usage?.cost===0.02?0.02:null);assert.equal(r.generation_id,data?.id==='gen-safe'?'gen-safe':null);assert.equal(JSON.stringify(r).includes('secret'),false);
 }
});
test('post-dispatch audit failure blocks another paid call and emits sanitized receipt',async()=>{
 let writes=0,calls=0;const run=make({persist:async()=>{if(++writes>1)throw Error('db');},fetcher:async()=>{calls++;return new Response(JSON.stringify({id:'gen-ok',usage:{cost:0.03}}));}});
 await assert.rejects(run.fetcher(url,init));await assert.rejects(run.fetcher(url,init));assert.equal(calls,1);assert.equal(run.logs[0][1].includes('gen-ok'),true);
});
test('source page fetches do not create provider receipts',async()=>{
 const run=make({fetcher:async()=>new Response('page')});assert.equal(await(await run.fetcher('https://www.walmart.com/ip/example')).text(),'page');assert.equal(run.records.length,0);
});
test('receipt persistence CAS preserves existing claims and rejects concurrent changes',async()=>{
 const old={recovery_version:1,photo_attempts:1,discover_claimed:true};let update,filters=[];
 const db={from:()=>{let writing=false;const q={select:()=>q,eq:(...args)=>{filters.push(args);return q;},update:value=>{writing=true;update=value;return q;},maybeSingle:async()=>writing?{data:null}:{data:{extracted_data:old}}};return q;}};
 await assert.rejects(persistRecoveryReceipt(db,'owner','submission',{attempt_id:'attempt'}));
 assert.equal(update.extracted_data.photo_attempts,1);assert.equal(update.extracted_data.discover_claimed,true);assert.equal(filters.some(([k,v])=>k==='extracted_data'&&v===JSON.stringify(old)),true);
 assert.equal(old.provider_receipts,undefined);
});
