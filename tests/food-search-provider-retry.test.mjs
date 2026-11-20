import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchOffSearch} from '../supabase/functions/search-foods/searchCore.ts';
test('retry gateway once but not rate limit, Retry-After, abort, or expiring budget',async()=>{
 const row=async(status,options,remaining=700,abort=false)=>{
  const c=new AbortController();if(abort)c.abort();
  let n=0;
  const r=await fetchOffSearch(async()=>++n===1?new Response(null,{status,...options}):new Response(null,{status:200}),c.signal,remaining,()=>0);
  return [r.status,n];
 };
 assert.deepEqual(await row(503),[200,2]);
 assert.deepEqual(await row(504),[200,2]);
 assert.deepEqual(await row(429),[429,1]);
 assert.deepEqual(await row(503,{headers:{'Retry-After':'1'}}),[503,1]);
 assert.deepEqual(await row(503,{},300),[503,1]);
 assert.deepEqual(await row(503,{},700,true),[503,1]);
 assert.deepEqual(await row(200),[200,1]);
});
