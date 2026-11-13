import assert from 'node:assert/strict';
import {reconcileExpiration} from './integration.mjs';
const now=Date.parse('2026-11-14');
const event={type:'EXPIRATION',app_user_id:'owner',product_id:'yearly',store:'APP_STORE',environment:'PRODUCTION',expiration_at_ms:now-1000};
const state={profile:{updated_at:'v1',user_type:'premium'},subscription:{id:'s1',updated_at:'v1',status:'active',product_id:'yearly',store:'APP_STORE',environment:'PRODUCTION',expiration_at:new Date(now-1000).toISOString()}};
let tests=0;
for(const mode of ['ok','profile_race','subscription_race','second_write_failure','provider_timeout','active_other','promo','stale_snapshot']){
 let current=structuredClone(state),writes=0,rpcs=0;
 const input=mode==='promo'?{...event,store:'PROMOTIONAL'}:event;
 const result=await reconcileExpiration(input,{
 now:()=>now,
 readState:async()=>structuredClone(state),
 loadProvider:async()=>{
  if(mode==='provider_timeout')throw Error('timeout');
  if(mode==='profile_race')current.profile.updated_at='v2';
  if(mode==='subscription_race')current.subscription.updated_at='v2';
  return {status:200,body:{subscriber:{entitlements:mode==='active_other'?{pro:{expires_date:null}}:{}}}};
 },
 rpc:async(name,p)=>{
  rpcs++;assert.equal(name,'reconcile_expiration_cas_v1');
  // Explicit MODEL of SQL CAS and transaction rollback; not a database runtime.
  if(mode==='stale_snapshot')return {data:{applied:false,reason:'invalid_or_stale_evidence'}};
  if(current.profile.updated_at!==p.p_expected_profile_updated_at||current.subscription.updated_at!==p.p_expected_subscription_updated_at)
   return {data:{applied:false,reason:'version_conflict'}};
  const tx=structuredClone(current);
  tx.subscription.status='inactive';
  if(mode==='second_write_failure')return {error:{message:'rollback'}};
  tx.profile.user_type='free';current=tx;writes+=2;
  return {data:{applied:true}};
 }});
 assert.equal(result.applied,mode==='ok');
 assert.equal(writes,mode==='ok'?2:0);
 if(mode!=='ok'){assert.equal(current.profile.user_type,'premium');assert.equal(current.subscription.status,'active');}
 if(['provider_timeout','active_other','promo'].includes(mode))assert.equal(rpcs,0);
 tests++;
}
console.log(tests+' integration/model race-failure checks passed (not live SQL execution)');
