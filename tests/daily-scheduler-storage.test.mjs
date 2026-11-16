import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createTrustedSchedulerStorage,prepareDiagnosticCompletion as prepare,SCHEDULER_STORAGE_RELEASE_STATE,STORAGE_SQL} from '../release-candidates/tdee-adaptive-review/dailySchedulerStorage.ts';
import {planDailyAssessment,claimDailyAssessment} from '../release-candidates/tdee-adaptive-review/dailyAssessmentScheduler.ts';
const t=Date.parse('2026-11-16T12:00:00Z'),day=86400000,owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const input={ownerId:owner,expectedOwnerId:owner,contextRevision:'a'.repeat(64),timezone:'UTC',now:t,observationEnabled:true,currentAccessVerified:true,sourceBindingVerified:true,lastAcceptedAt:null,hold:null};
const plan=planDailyAssessment(input,null),record=claimDailyAssessment(plan,null,0,id);
test('all storage runtime methods immutable OFF before any transaction',async()=>{
 let calls=0;const s=createTrustedSchedulerStorage({transaction:async()=>{calls++;throw Error('unexpected');}});
 for(const run of [()=>s.load(input),()=>s.claim(plan,0,id),()=>s.complete(input,id,t,{kind:'resolved'}),()=>s.uncertain(input,id,t),()=>s.reconcile(input,id,t)])await assert.rejects(run,/safety_review_required/);
 assert.equal(calls,0);assert.equal(SCHEDULER_STORAGE_RELEASE_STATE.enabled,false);assert.ok(Object.isFrozen(SCHEDULER_STORAGE_RELEASE_STATE));
});
test('verified uncertainty completes diagnostic and atomically prepares first seven-day hold',()=>{
 const next=prepare(record,null,id,t+1,{kind:'uncertain'});assert.equal(next.record.status,'completed');assert.deepEqual(next.hold,{assessedAt:t+1,reevaluateAt:t+1+7*day});
});
test('daily uncertainty preserves initial hold rather than sliding it',()=>{
 const h={assessedAt:t-day,reevaluateAt:t+6*day};assert.deepEqual(prepare(record,h,id,t+1,{kind:'uncertain'}).hold,h);
});
test('due verified reassessment can establish next seven-day hold',()=>{
 const h={assessedAt:t-7*day,reevaluateAt:t};assert.equal(prepare(record,h,id,t+1,{kind:'uncertain'}).hold.reevaluateAt,t+1+7*day);
});
test('only verified resolved evaluator result clears a valid hold',()=>{
 assert.equal(prepare(record,{assessedAt:t,reevaluateAt:t+7*day},id,t+1,{kind:'resolved'}).hold,null);
 for(const d of [null,{}, {kind:'timeout'}, {kind:'not_executed'}])assert.throws(()=>prepare(record,null,id,t+1,d),/verified_diagnostic_required/);
});
test('foreign claims, backwards time and malformed holds are rejected',()=>{
 assert.throws(()=>prepare(record,null,owner,t+1,{kind:'uncertain'}),/invalid_completion/);
 assert.throws(()=>prepare(record,null,id,t-1,{kind:'uncertain'}),/invalid_completion/);
 for(const h of [undefined,{}, {assessedAt:t,reevaluateAt:t+1}])for(const kind of ['resolved','uncertain'])assert.throws(()=>prepare(record,h,id,t+1,{kind}),/invalid_hold/);
});
test('SQL contract uses private owner scope CAS and immutable receipt identity',()=>{
 assert.match(STORAGE_SQL.read,/owner_id=\$1::uuid and context_revision=\$2::text for update/);
 assert.match(STORAGE_SQL.update,/and revision=\$6::bigint returning revision/);
 assert.match(STORAGE_SQL.lock,/pg_advisory_xact_lock/);
 assert.match(STORAGE_SQL.insert,/on conflict do nothing/);
 assert.doesNotMatch(STORAGE_SQL.receipt,/on conflict.*update/i);
});
test('DDL candidate is rollback-only with RLS, no grants cron or definer',()=>{
 const sql=readFileSync(new URL('../release-candidates/tdee-adaptive-review/dailySchedulerStorageCandidate.sql',import.meta.url),'utf8');
 assert.match(sql,/rollback;\s*$/);assert.equal((sql.match(/enable row level security/g)||[]).length,2);assert.match(sql,/primary key\(owner_id,context_revision,claim_id\)/);
 assert.doesNotMatch(sql,/^\s*(grant |create policy|create role|select cron\.|security definer)/im);
});

test('blocked or unknown diagnostic preserves hold without granting completion authority',()=>{
 const h={assessedAt:t,reevaluateAt:t+7*day};assert.deepEqual(prepare(record,h,id,t+1,{kind:'preserve',reason:'review_required'}).hold,h);
 assert.throws(()=>prepare(record,undefined,id,t+1,{kind:'preserve',reason:'unknown'}),/invalid_hold/);
});
