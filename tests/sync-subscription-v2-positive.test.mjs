import test from 'node:test';import assert from 'node:assert/strict';import {readV2Active} from '../supabase/functions/sync-subscription/v2-positive.ts';
const NOW=1800000000000,owner='11111111-1111-4111-8111-111111111111', project='proj0d801cfa';
const list=items=>new Response(JSON.stringify({object:'list',items,next_page:null}));
const make=(patch={},alias='Premium')=>async(url,opts)=>{
 const u=new URL(url);assert.equal(u.origin,'https://api.revenuecat.com');assert.equal(opts.redirect,'error');
 assert.equal(opts.headers.Authorization,'Bearer synthetic');
 if(u.pathname.endsWith('/subscriptions')){
  assert.equal(u.searchParams.get('environment'),'production');
  return list([{id:'sub-a',customer_id:owner,environment:'production',object:'subscription',gives_access:true,ends_at:NOW+300000,...patch}]);
 }
 if(u.pathname.endsWith('/purchases')) return list([]);
 if(u.pathname.endsWith('/entitlements')) return list([{id:'ent-a',object:'entitlement',lookup_key:alias,project_id:project}]);
 throw Error('unexpected path');
};
test('only verified active production evidence can restore access',async()=>{
 const probe=(opts,alias)=>readV2Active(owner,'synthetic',make(opts,alias),()=>NOW);
 assert.equal(await probe(),true);
 assert.equal(await probe({environment:'sandbox'}),false);
 assert.equal(await probe({customer_id:'different'}),false);
 assert.equal(await probe({gives_access:false}),false);
 assert.equal(await probe({ends_at:NOW}),false);
 assert.equal(await probe({},'unrelated'),false);
 assert.equal(await readV2Active(owner,'synthetic',async()=>new Response(null,{status:503}),()=>NOW),false);
});
