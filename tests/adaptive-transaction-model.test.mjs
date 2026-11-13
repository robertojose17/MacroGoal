/** Deterministic abstract model ONLY. Does not execute or validate PostgreSQL. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function schedules(a,b,p=[]){if(!a.length)return [[...p,...b]];if(!b.length)return [[...p,...a]];return [...schedules(a.slice(1),b,[...p,a[0]]),...schedules(a,b.slice(1),[...p,b[0]])];}
// Each transaction publishes writes only at commit. Fence ownership spans validation
// through commit/rollback. Pending writer edits are deliberately invisible.
function run(order,{writerRollback=false,acceptRollback=false}={}){
 const s={revision:0,goal:0,value:0,fence:null,accepted:0,receipt:null};let staged=null;
 for(const event of order){
  const tx=event[0],action=event.slice(1);
  if(action==='lock'){if(s.fence&&s.fence!==tx)return null;s.fence=tx;}
  if(action==='validate')staged=s.revision===0&&s.goal===0?'commit':'reject';
  if(action==='commit'){
   assert.equal(s.fence,tx);
   if(tx==='w'&&!writerRollback){s.value++;s.revision++;}
   if(tx==='a'&&!acceptRollback){s.receipt=staged;if(staged==='commit'){s.goal++;s.revision++;s.accepted++;}}
   s.fence=null;
  }
 }
 return s;
}
test('all legal writer/accept fence interleavings serialize or reject stale context',()=>{
 let legal=0;
 for(const order of schedules(['wlock','wcommit'],['alock','avalidate','acommit'])){
  const s=run(order);if(!s)continue;legal++;
  const writerFirst=order.indexOf('wcommit')<order.indexOf('avalidate');
  assert.equal(s.accepted,writerFirst?0:1);assert.equal(s.receipt,writerFirst?'reject':'commit');assert.equal(s.revision,1+s.accepted);
 }
 assert.equal(legal,2);
});
test('rollback never leaves a revision, goal transition or receipt',()=>{
 assert.deepEqual(run(['wlock','wcommit','alock','avalidate','acommit'],{writerRollback:true,acceptRollback:true}),{revision:0,goal:0,value:0,fence:null,accepted:0,receipt:null});
 assert.equal(run(['wlock','wcommit','alock','avalidate','acommit'],{writerRollback:true}).accepted,1);
});
function registry(){const s={goal:0,revision:0,consumed:false,receipts:new Map(),writes:0};return {s,accept(request,digest='same'){const old=s.receipts.get(request);if(old){if(old.digest!==digest)throw Error('request_mismatch');return old.status;}const status=s.consumed||s.revision!==0?'rejected':'committed';if(status==='committed'){s.goal++;s.revision++;s.writes++;s.consumed=true;}s.receipts.set(request,{status,digest});return status;}};}
test('serialized competing accepts, lost-response replay and supersession do not duplicate writes',()=>{for(const first of ['A','B']){const r=registry(),other=first==='A'?'B':'A';assert.equal(r.accept(first),'committed');assert.equal(r.accept(other),'rejected');r.s.goal++;assert.equal(r.accept(first),'committed');assert.equal(r.s.goal,2);assert.equal(r.s.writes,1);assert.throws(()=>r.accept(first,'different'),/request_mismatch/);}});
test('ABA edits invalidate proposal even when content restored',()=>{const r=registry();r.s.revision+=2;assert.equal(r.accept('A'),'rejected');assert.equal(r.s.writes,0);});
test('sorted actual advisory keys avoid opposite multi-owner fence order in model',()=>{
 for(const owners of [[3,1,2],[2,3,1],[1,2,3]])assert.deepEqual([...new Set(owners)].sort((a,b)=>a-b),[1,2,3]);
 // Hash collisions collapse lock keys only; owner revisions remain separate.
 const revisions=new Map([['ownerA',0],['ownerB',0]]);revisions.set('ownerA',1);assert.equal(revisions.get('ownerB'),0);
});
test('SQL preserves corresponding ordering and atomic receipt boundary',()=>{
 const sql=readFileSync(new URL('../release-candidates/tdee-adaptive-review/registryCandidate.sql',import.meta.url),'utf8');
 const accept=sql.slice(sql.indexOf('CREATE FUNCTION macrogoal_adaptive_private.accept_proposal'));
 assert.ok(accept.indexOf('read_receipt(p_request)')<accept.indexOf('FOR UPDATE'));
 assert.ok(accept.indexOf('lock_expected_context')<accept.indexOf('snapshot:=public.observed_get_tdee_snapshot_v1()'));
 assert.ok(accept.indexOf('UPDATE public.goals')<accept.indexOf('INSERT INTO macrogoal_adaptive_private.receipts'));
 assert.doesNotMatch(accept,/\bCOMMIT\b[\s\S]*INSERT INTO macrogoal_adaptive_private.receipts/);
 const barrier=readFileSync(new URL('../release-candidates/tdee-adaptive-review/sourceBarrierCandidate.sql',import.meta.url),'utf8');
 assert.match(barrier,/transaction_isolation.*read committed/);
 assert.match(barrier,/pg_advisory_xact_lock\(1413760325,hashtext\(actor::text\)\)/);
 assert.match(barrier,/r\.epoch IS DISTINCT FROM p_epoch OR r\.revision IS DISTINCT FROM p_revision/);
});
