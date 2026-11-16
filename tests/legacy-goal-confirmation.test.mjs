import test from 'node:test';import assert from 'node:assert/strict';
import {LEGACY_GOAL_CONFIRMATION_RELEASE,legacyGoalBindingForReview,legacyGoalConfirmationViewModel,legacyGoalConfirmationIntent,parseLegacyGoalConfirmationRequest,prepareLegacyGoalAcknowledgmentForReview,confirmLegacyGoal} from '../release-candidates/tdee-adaptive-review/legacyGoalConfirmation.ts';
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',now=Date.parse('2026-11-16T12:00:00Z'),at=new Date(now).toISOString();
function context(){return {version:'legacy-goal-current-context-v1',ownerId:actor,capturedAt:new Date(now-1000).toISOString(),currentGoal:{id,ownerId:actor,isActive:true,updatedAt:'2026-10-01T08:00:00.123456Z',targets:{calories:2100,proteinG:150,carbsG:225,fatsG:67}},profileUpdatedAt:'2026-10-01T07:00:00Z',profileBinding:'a'.repeat(64),journeyBinding:'b'.repeat(64),goalFingerprint:'c'.repeat(64)};}
function request(c=context()){const b=legacyGoalBindingForReview(c,actor,now);assert.ok(b);return legacyGoalConfirmationIntent(b,actor,'keep_current_targets',id).request;}
test('English and Spanish views show exact current targets, keep and cancel, with no default action',()=>{
 for(const locale of ['en','es']){const c=context(),view=legacyGoalConfirmationViewModel(c,actor,locale,now);assert.equal(view.kind,'confirmation_preview');assert.deepEqual(view.rows.map(r=>r.value),[2100,150,225,67]);assert.equal(view.rows[0].unit,'kcal');assert.equal(view.defaultChoice,null);assert.equal(view.actionable,false);assert.equal(view.requiresExplicitConfirmation,true);assert.ok(view.keep&&view.cancel&&view.caution&&view.timing);}
 assert.equal(legacyGoalConfirmationViewModel(context(),actor,'toString',now).kind,'unavailable');
});
test('display and missing prior receipt do not create confirmation or infer approval',()=>{
 const c=context();c.priorReceipt=null;const view=legacyGoalConfirmationViewModel(c,actor,'es',now);assert.equal(view.kind,'confirmation_preview');assert.equal(Object.hasOwn(view,'request'),false);assert.equal(Object.hasOwn(view,'confirmedAt'),false);assert.equal(Object.hasOwn(view,'accepted'),false);
});
test('cancel and absent explicit keep do not create any request',()=>{
 const b=legacyGoalBindingForReview(context(),actor,now);
 assert.deepEqual(legacyGoalConfirmationIntent(b,actor,'cancel',id),{kind:'cancelled',request:null});
 for(const choice of [undefined,null,true,'accept','keep','automatic'])assert.equal(legacyGoalConfirmationIntent(b,actor,choice,id).request,null);
});
test('explicit keep creates immutable intent, never a committed receipt',()=>{
 const c=context(),before=structuredClone(c),r=request(c);assert.equal(r.decision,'keep_current_targets');assert.deepEqual(c,before);assert.equal(Object.isFrozen(r),true);assert.equal(Object.isFrozen(r.binding.targets),true);assert.equal(Object.hasOwn(r,'confirmedAt'),false);assert.equal(Object.hasOwn(r,'receipt'),false);
});
test('request parser rejects client timestamps and legacy goal writing fields',()=>{
 const r=request();assert.ok(parseLegacyGoalConfirmationRequest(r,actor));
 for(const key of ['confirmedAt','createdAt','baselineCapturedAt','serverConfirmedAt','daily_calories','userId','is_active','action'])assert.equal(parseLegacyGoalConfirmationRequest({...r,[key]:at},actor),null,key);
 assert.equal(parseLegacyGoalConfirmationRequest(r,other),null);
});
test('future/stale captures, foreign owner and inactive goals cannot produce a confirmation',()=>{
 for(const mutate of [c=>c.ownerId=other,c=>c.currentGoal.ownerId=other,c=>c.currentGoal.isActive=false,c=>c.capturedAt=new Date(now-30001).toISOString(),c=>c.capturedAt=new Date(now+1).toISOString(),c=>c.profileBinding='bad',c=>c.currentGoal.updatedAt='2026-02-30T08:00:00Z']){const c=context();mutate(c);assert.equal(legacyGoalBindingForReview(c,actor,now),null);}
});
test('invalid targets fail closed without clamping, rounding or recalculating macros',()=>{
 for(const mutate of [t=>t.calories=0,t=>t.proteinG=-1,t=>t.carbsG=NaN,t=>t.fatsG=Infinity,t=>t.fiberG=30]){const c=context();mutate(c.currentGoal.targets);assert.equal(legacyGoalBindingForReview(c,actor,now),null);}
 const c=context();c.currentGoal.targets.carbsG=225.5;assert.equal(legacyGoalBindingForReview(c,actor,now).targets.carbsG,225.5);
});
test('every binding mutation invalidates the confirmed view',()=>{
 const c=context(),r=request(c);
 const mutations=[v=>v.currentGoal.id=other,v=>v.currentGoal.updatedAt='2026-10-01T08:00:00.123457Z',v=>v.profileUpdatedAt='2026-10-01T07:00:00.000001Z',v=>v.profileBinding='d'.repeat(64),v=>v.journeyBinding='d'.repeat(64),v=>v.goalFingerprint='d'.repeat(64),v=>v.currentGoal.targets.calories++,v=>v.currentGoal.targets.proteinG++,v=>v.currentGoal.targets.carbsG++,v=>v.currentGoal.targets.fatsG++];
 for(const mutate of mutations){const current=structuredClone(c);mutate(current);assert.equal(prepareLegacyGoalAcknowledgmentForReview(r,current,actor,at).reason,'confirmation_context_changed');}
});
test('server confirmation starts a new period without backdating goal or expenditure',()=>{
 const c=context(),before=structuredClone(c),r=request(c),p=prepareLegacyGoalAcknowledgmentForReview(r,c,actor,at);
 assert.equal(p.kind,'prepared_acknowledgment');assert.equal(p.confirmedAt,at);assert.equal(p.observationPeriodStartsAt,at);assert.equal(p.requiresServerCommit,true);
 for(const key of ['goalsModified','nutritionalApproval','expenditureVerified','macroAllocationConsent','historicalBaselineAuthorized','actionable'])assert.equal(p[key],false,key);
 assert.deepEqual(c,before);assert.notEqual(p.confirmedAt,c.currentGoal.updatedAt);
});
test('microsecond ordering is retained, not collapsed into millisecond consent',()=>{
 const c=context();c.capturedAt='2026-11-16T12:00:00.000001Z';const oldRequest=request();
 assert.equal(prepareLegacyGoalAcknowledgmentForReview(oldRequest,c,actor,'2026-11-16T12:00:00.000000Z').kind,'blocked');
 const p=prepareLegacyGoalAcknowledgmentForReview(oldRequest,c,actor,'2026-11-16T12:00:00.000002Z');assert.equal(p.kind,'prepared_acknowledgment');assert.equal(p.confirmedAt,'2026-11-16T12:00:00.000002Z');
});
test('server time is required and unparseable timestamps never create a preparation',()=>{
 for(const value of [undefined,null,'',0,'2026-11-16','2026-11-16T24:00:00Z'])assert.equal(prepareLegacyGoalAcknowledgmentForReview(request(),context(),actor,value).kind,'blocked');
});
test('immutable release OFF invokes no ports or supplied methods',async()=>{
 assert.equal(LEGACY_GOAL_CONFIRMATION_RELEASE.enabled,false);let called=0;const ports=new Proxy({},{get(){called++;throw Error('unexpected');}});
 assert.deepEqual(await confirmLegacyGoal(request(),ports),{status:'disabled',actionable:false});assert.equal(called,0);
});
