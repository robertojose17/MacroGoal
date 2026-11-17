import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observedCoverage} from '../utils/tdeeObservedCoverage.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('observed coverage ignores confirmations and does not mutate state',()=>{
 const state={days:[{date:'2026-11-14',hasValidLoggedIntake:true},{date:'2026-11-15',hasValidLoggedIntake:false},{date:'2026-11-16',hasValidLoggedIntake:true}]};
 const original=structuredClone(state);assert.deepEqual(observedCoverage(state),{usableLoggedDays:2,calendarDays:14,throughDate:'2026-11-16'});assert.deepEqual(state,original);
 assert.deepEqual(observedCoverage({days:[]}),{usableLoggedDays:0,calendarDays:14,throughDate:null});
});
test('screening entry is inert, without imports, hooks, persistence or auto-answer',()=>{
 const s=read('components/TdeeRulesScreeningEntry.tsx');assert.match(s,/return null/);assert.doesNotMatch(s,/^import|useEffect|rpc\(|confirm\(|retry\(|eligible['"]/m);
});
test('coverage UI has refresh only, no health or completeness question',()=>{
 const s=read('components/TdeeDataReadiness.tsx');assert.match(s,/Días con registros utilizables/);assert.doesNotMatch(s,/Modal|checkbox|radio|api\.save|confirmed|api.state.eligibility|Tengo 19|embaraz|Save confirmation/);
});
test('read-only hook cannot send mutations and retains account, focus and expiry protection',()=>{
 const s=read('hooks/useTdeeObservedCoverage.ts');assert.doesNotMatch(s,/mutation|Crypto|\bsave\b|readinessDayChanges|confirm_readiness/);for(const guard of ['session.user.id!==actor','owner.current===actor','epoch.current===revision','!controller.signal.aborted','focused.current','foreground.current','300000'])assert.ok(s.includes(guard),guard);
});
import {parseObservedCoverage,requestObservedCoverage} from '../utils/tdeeObservedCoverage.ts';
const now=Date.parse('2026-11-17T12:00:00Z');
const fixture=()=>({version:'observed-log-coverage-v1',ownerId:'owner',capturedAt:new Date(now).toISOString(),dataBasis:'observed-logs-v1',coverageBasis:'observed_logs_not_confirmed_complete',profileBinding:'a'.repeat(64),journeyBinding:'b'.repeat(64),timezone:'UTC',today:'2026-11-17',ageYears:30,completenessEstablished:false,clinicalEligibilityEstablished:false,days:Array.from({length:14},(_,i)=>({date:new Date(Date.parse('2026-11-03T00:00:00Z')+i*86400000).toISOString().slice(0,10),contentHash:'c'.repeat(64),hasValidLoggedIntake:i<10}))});
test('strict14day summary counts observed flags only, never zero/invalid flag-false days',()=>{const f=fixture();const parsed=parseObservedCoverage(f,'owner',now);assert.equal(observedCoverage(parsed).usableLoggedDays,10);assert.equal(observedCoverage(parsed).calendarDays,14);f.days[0].hasValidLoggedIntake=false;assert.equal(observedCoverage(parseObservedCoverage(f,'owner',now)).usableLoggedDays,9);f.days=f.days.slice(-3);assert.deepEqual(observedCoverage(parseObservedCoverage(f,'owner',now)),{usableLoggedDays:0,calendarDays:14,throughDate:'2026-11-16'});});
test('old-only, incomplete ranges, invalid fields and manufactured completeness rejected',()=>{for(const mutate of [f=>f.days=[{...f.days[0],date:'2026-10-25'}],f=>f.days.pop(),f=>f.days.splice(5,1),f=>f.days.reverse(),f=>f.days[0].date='2026-11-17',f=>f.days[0].date='2026-02-30',f=>f.days[0].contentHash='invalid',f=>f.days[0].hasValidLoggedIntake='true',f=>f.days[0].confirmed=true,f=>f.completenessEstablished=true,f=>f.ownerId='other',f=>f.today='2026-11-18',f=>f.capturedAt='2026-11-17T13:00:00Z',f=>f.version='tdee-readiness-v1']){const f=fixture();mutate(f);assert.throws(()=>parseObservedCoverage(f,'owner',now),/unverified/);}});
test('transport invokes only new noargs own account read and rejects switched account',async()=>{const f=fixture();f.capturedAt=new Date().toISOString();f.today=new Date().toISOString().slice(0,10);f.days=[];const calls=[];const args={endpoint:'https://example.test',apiKey:'public',token:'synthetic',owner:'owner',signal:new AbortController().signal,isCurrent:()=>true,fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(f));}};await requestObservedCoverage(args);assert.equal(calls[0].url,'https://example.test/rest/v1/rpc/tdee_read_observed_coverage_v1');assert.equal(calls[0].options.body,'{}');assert.equal(calls.length,1);await assert.rejects(()=>requestObservedCoverage({...args,isCurrent:()=>false}),/account_changed/);assert.equal(calls.length,1);});
test('SQL wrapper is noargs owner scoped authenticated-only and never writes',()=>{const s=read('release-candidates/tdee-adaptive-review/observedCoverageUiWrapper.sql');assert.match(s,/actor uuid:=auth.uid\(\)/);assert.match(s,/is_anonymous/);assert.match(s,/read_observed_coverage_v1\(actor\)/);assert.match(s,/TO authenticated/);assert.doesNotMatch(s,/INSERT|UPDATE|DELETE|GRANT.*TO (?:anon|service_role)/);});
