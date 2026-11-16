import test from 'node:test';import assert from 'node:assert/strict';
import {planDailyAssessment as plan,claimDailyAssessment as claim,finishDailyAssessment as finish,reconcileDailyAssessment as reconcile,scheduleUncertainReassessment as hold,revalidateClaimedAssessment as revalidate,createDailyAssessmentScheduler,DAILY_SCHEDULER_RELEASE_STATE} from '../release-candidates/tdee-adaptive-review/dailyAssessmentScheduler.ts';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',id2='33333333-3333-4333-8333-333333333333',day=86400000,t=Date.parse('2026-11-16T12:00:00Z');
const input=(extra={})=>({ownerId:owner,expectedOwnerId:owner,contextRevision:'a'.repeat(64),timezone:'UTC',now:t,observationEnabled:true,currentAccessVerified:true,sourceBindingVerified:true,lastAcceptedAt:null,hold:null,...extra});
const make=(extra={})=>plan(input(extra),null);
const claimed=()=>claim(make(),null,0,id);
const done=()=>finish(claimed(),id,t+1,'completed');
test('immutable OFF invokes zero context claim evaluation or completion callbacks',async()=>{
 let calls=0;const bad=async()=>{calls++;throw Error('unexpected');};
 const run=createDailyAssessmentScheduler({loadOwnContext:bad,claim:bad,evaluateReadOnly:bad,complete:bad});
 assert.equal((await run()).reason,'safety_review_required');assert.equal(calls,0);assert.equal(DAILY_SCHEDULER_RELEASE_STATE.enabled,false);assert.ok(Object.isFrozen(DAILY_SCHEDULER_RELEASE_STATE));
});
test('daily plan never grants recommendation or acceptance and carries no targets',()=>{
 const p=make();assert.equal(p.kind,'assessment_plan');assert.equal(p.localDate,'2026-11-16');assert.equal(p.recommendationAuthorized,false);assert.equal(p.acceptanceAuthorized,false);assert.equal(p.actionable,false);assert.equal('target'in p,false);
});
test('revocation and current source validation are prerequisites, not inferred from date',()=>{
 for(const extra of [{observationEnabled:false},{currentAccessVerified:false},{sourceBindingVerified:false},{expectedOwnerId:id}])assert.notEqual(make(extra).kind,'assessment_plan');
});
test('invalid timestamps zones and scope revisions fail closed',()=>{
 for(const extra of [{now:NaN},{now:Infinity},{now:t+.5},{now:-1},{timezone:'Not/AZone'},{timezone:''},{contextRevision:'bad'},{ownerId:'bad'}])assert.equal(make(extra).kind,'blocked');
});
test('local date, not UTC date, defines daily key',()=>{
 const p=make({now:Date.parse('2026-11-16T02:00:00Z'),timezone:'America/Los_Angeles'});assert.equal(p.localDate,'2026-11-15');assert.notEqual(p.key,make({now:Date.parse('2026-11-16T02:00:00Z')}).key);
});
test('DST repeated hour deduplicates into one local day',()=>{
 const p=make({now:Date.parse('2026-11-01T05:30:00Z'),timezone:'America/New_York'}),r=finish(claim(p,null,0,id),id,p.plannedAt+1,'completed');
 assert.equal(plan(input({now:Date.parse('2026-11-01T06:30:00Z'),timezone:'America/New_York'}),r).reason,'already_completed_today');
});
test('DST spring-forward and next local midnight make exactly next-day key',()=>{
 const p=make({now:Date.parse('2026-03-08T06:30:00Z'),timezone:'America/New_York'}),r=finish(claim(p,null,0,id),id,p.plannedAt+1,'completed');
 assert.equal(plan(input({now:Date.parse('2026-03-08T07:30:00Z'),timezone:'America/New_York'}),r).reason,'already_completed_today');
 const n=plan(input({now:Date.parse('2026-03-09T04:00:00Z'),timezone:'America/New_York'}),r);assert.equal(n.kind,'assessment_plan');assert.equal(n.localDate,'2026-03-09');
});
test('calendar leap day is valid without fixed24hour daily advancement',()=>{
 assert.equal(make({now:Date.parse('2028-02-29T12:00:00Z')}).localDate,'2028-02-29');
});
test('atomic expected revision rejects two competing claims for the same plan',()=>{
 const p=make(),r=claim(p,null,0,id);assert.equal(r.status,'claimed');assert.equal(claim(p,r,0,id2).reason,'claim_conflict');assert.equal(claim(p,r,1,id2).reason,'unfinished_assessment');
});
test('completed daily ledger skips repeats, then next day accepts new claim',()=>{
 const r=done();assert.equal(plan(input({now:t+2}),r).reason,'already_completed_today');const n=plan(input({now:t+day}),r);assert.equal(n.kind,'assessment_plan');assert.equal(claim(n,r,r.revision,id2).status,'claimed');
});
test('old scope and timezone changes cannot reuse an existing claimed plan',()=>{
 assert.equal(plan(input({contextRevision:'b'.repeat(64)}),done()).reason,'ledger_scope_mismatch');assert.equal(plan(input({timezone:'Europe/Madrid'}),done()).reason,'timezone_changed');
 assert.equal(claim({...make(),contextRevision:'b'.repeat(64)},null,0,id).reason,'invalid_plan');
});
test('backwards clocks do not replay prior daily work',()=>{
 assert.equal(plan(input({now:t-1}),done()).reason,'clock_moved_backwards');
});
test('unfinished or timed-out outcomes require reconciliation even next day',()=>{
 for(const r of [claimed(),finish(claimed(),id,t+1,'uncertain')])assert.equal(plan(input({now:t+day}),r).reason,'unfinished_assessment');
});
test('unknown outcome can resume only after fresh authoritative not-executed evidence',()=>{
 const r=finish(claimed(),id,t+1,'uncertain'),e={key:r.key,claimId:id,checkedAt:t+2,outcome:'not_executed'},resolved=reconcile(r,e,t+3);
 assert.equal(resolved.status,'retryable');const p=plan(input({now:t+4}),resolved);assert.equal(p.kind,'assessment_plan');assert.equal(claim(p,resolved,resolved.revision,id2).status,'claimed');
 assert.equal(claim(p,resolved,resolved.revision,id).reason,'claim_identity_reused');
});
test('authoritative completed reconciliation deduplicates and foreign/stale evidence cannot resolve',()=>{
 const r=finish(claimed(),id,t+1,'uncertain'),e={key:r.key,claimId:id,checkedAt:t+2,outcome:'completed'};
 assert.equal(plan(input({now:t+4}),reconcile(r,e,t+3)).reason,'already_completed_today');
 for(const bad of [{...e,key:'foreign'},{...e,claimId:id2},{...e,checkedAt:t-1},{...e,checkedAt:t+40000},{...e,outcome:'unknown'}])assert.equal(reconcile(r,bad,t+3).kind,'reconcile');
 assert.equal(reconcile(r,e,t+40000).kind,'reconcile');
});
test('completion must match claim identity and monotonically ordered time',()=>{
 for(const [who,now,outcome] of [[id2,t+1,'completed'],[id,t-1,'completed'],[id,t+1,'bogus']])assert.equal(finish(claimed(),who,now,outcome).kind,'blocked');
 assert.equal(finish(done(),id,t+2,'completed').kind,'blocked');
});
test('uncertainty anchors seven elapsed days and daily observations do not postpone it',()=>{
 const h=hold(t,null);assert.deepEqual(h,{assessedAt:t,reevaluateAt:t+7*day});assert.deepEqual(hold(t+day,h),h);assert.deepEqual(hold(t+6*day,h),h);
 assert.equal(make({now:t+day,hold:h}).reevaluationDue,false);assert.equal(make({now:t+7*day,hold:h}).reevaluationDue,true);
 assert.equal(hold(t+7*day,h).reevaluateAt,t+14*day);
});
test('daily diagnostic continues while reassessment or acceptance cadence is not due',()=>{
 const p=make({now:t+day,lastAcceptedAt:t,hold:hold(t,null)});assert.equal(p.kind,'assessment_plan');assert.equal(p.reevaluationDue,false);assert.equal(p.acceptanceCooldownPassed,false);assert.equal(p.recommendationAuthorized,false);
 assert.equal(make({now:t+14*day,lastAcceptedAt:t}).acceptanceCooldownPassed,true);
});
test('future acceptance and malformed sliding hold are rejected',()=>{
 assert.equal(make({lastAcceptedAt:t+1}).kind,'blocked');for(const h of [{assessedAt:t,reevaluateAt:t+day},{assessedAt:t+1,reevaluateAt:t+1+7*day}])assert.equal(make({hold:h}).kind,'blocked');
});
test('ledger tampering and revision overflow fail closed',()=>{
 for(const r of [{...done(),key:'tampered'},{...done(),localDate:'2026-02-30'},{...done(),revision:Number.MAX_SAFE_INTEGER}])assert.equal(plan(input({now:t+day}),r).kind,'blocked');
 assert.equal(claim(make(),null,Number.MAX_SAFE_INTEGER,id).kind,'blocked');
});

test('dispatch revalidation requires latest claim and current owner scope access and local day',()=>{
 const r=claimed();assert.equal(revalidate(input({now:t+1}),r,id).kind,'assessment_plan');
 for(const extra of [{now:t+day},{currentAccessVerified:false},{observationEnabled:false},{sourceBindingVerified:false},{contextRevision:'b'.repeat(64)},{expectedOwnerId:id}])assert.equal(revalidate(input(extra),r,id).kind,'reconcile');
 assert.equal(revalidate(input(),null,id).kind,'reconcile');assert.equal(revalidate(input(),r,id2).kind,'reconcile');assert.equal(revalidate(input(),done(),id).kind,'reconcile');
});
test('pre-failure reconciliation evidence and exhausted ledger revisions cannot advance',()=>{
 const r=finish(claimed(),id,t+100,'uncertain');assert.equal(reconcile(r,{key:r.key,claimId:id,checkedAt:t+50,outcome:'not_executed'},t+101).kind,'reconcile');
 assert.equal(finish({...claimed(),revision:Number.MAX_SAFE_INTEGER-1},id,t+1,'completed').kind,'blocked');
});

test('malformed exported transition arguments fail closed instead of throwing',()=>{
 assert.equal(finish(null,id,t,'completed').kind,'blocked');assert.equal(reconcile(null,null,t).kind,'reconcile');assert.equal(revalidate(null,claimed(),id).kind,'reconcile');assert.equal(hold(t,undefined).kind,'blocked');
});


test('completion spanning midnight blocks rollback in planning and claiming',()=>{
 const start=Date.parse('2026-11-16T23:00:00Z'),end=Date.parse('2026-11-17T02:00:00Z'),back=Date.parse('2026-11-17T01:00:00Z');
 const r=finish(claim(make({now:start}),null,0,id),id,end,'completed');
 assert.equal(plan(input({now:back}),r).reason,'clock_moved_backwards');
 assert.equal(claim(make({now:back}),r,r.revision,id2).reason,'already_claimed_or_clock_changed');
 assert.equal(plan(input({now:end}),r).kind,'assessment_plan');
 assert.equal(claim(make({now:end}),r,r.revision,id2).status,'claimed');
 // Reconciled retryable completion timestamps impose the same monotonic boundary.
 const retry={...r,status:'retryable'};
 assert.equal(plan(input({now:back}),retry).reason,'clock_moved_backwards');
 assert.equal(claim(make({now:back}),retry,retry.revision,id2).reason,'already_claimed_or_clock_changed');
});
test('undefined and malformed holds fail closed without throwing',()=>{
 for(const h of [undefined,false,0,'invalid',[],{}, {assessedAt:t}])assert.equal(make({hold:h}).reason,'invalid_hold');
});
