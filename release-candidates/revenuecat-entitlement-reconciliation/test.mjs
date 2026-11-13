import assert from 'node:assert/strict';
import {planExpiration,verifyExpiration,classifyProvider} from './policy.mjs';
const now=Date.parse('2026-11-14T00:00:00Z');
const event={type:'EXPIRATION',app_user_id:'owner',product_id:'yearly',store:'APP_STORE',environment:'PRODUCTION',expiration_at_ms:now-1000};
const mirror={product_id:'yearly',store:'APP_STORE',environment:'PRODUCTION',expiration_at:new Date(now-1000).toISOString()};
const inactive={subscriber:{entitlements:{}}};
const active={subscriber:{entitlements:{pro:{expires_date:new Date(now+100000).toISOString()}}}};
const base={event,mirror,providerBody:inactive,providerStatus:200,now};
let n=0;
for(const [change,reason] of [
 [{},'provider_confirmed_inactive'],
 [{providerStatus:503},'provider_unavailable'],
 [{providerBody:{}},'provider_unavailable'],
 [{providerBody:active},'other_or_renewed_entitlement_active'],
 [{event:{...event,store:'PROMOTIONAL'}},'promotional_requires_separate_registry'],
 [{event:{...event,period_type:'PROMOTIONAL'}},'promotional_requires_separate_registry'],
 [{event:{...event,product_id:'other'}},'unrelated_mirror'],
 [{event:{...event,environment:'SANDBOX'}},'unrelated_mirror'],
 [{mirror:{...mirror,expiration_at:new Date(now+100000).toISOString()}},'stale_or_invalid_expiration'],
 [{event:{...event,expiration_at_ms:null}},'stale_or_invalid_expiration'],
 [{event:{...event,type:'RENEWAL'}},'outside_scope']
]){const r=planExpiration({...base,...change});assert.equal(r.reason,reason);
if(reason!=='provider_confirmed_inactive'){assert.equal(r.profilePatch,null);assert.equal(r.subscriptionPatch,null);}
n++;}
assert.equal(classifyProvider({subscriber:{entitlements:{pro:{expires_date:null}}}},200,now),'active');n++;
assert.equal(classifyProvider({subscriber:{entitlements:{pro:{expires_date:'bad'}}}},200,now),'unknown');n++;
assert.equal(classifyProvider({subscriber:{entitlements:{pro:{expires_date:'2020-01-01',grace_period_expires_date:new Date(now+5000).toISOString()}}}},200,now),'active');n++;
assert.equal((await verifyExpiration(base,{loadProvider:async()=>{throw Error('timeout')},readMirror:async()=>mirror})).profilePatch,null);n++;
console.log(n+' policy checks passed. No production writes or SQL integration tested.');
