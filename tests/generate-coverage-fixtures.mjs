import fs from 'node:fs';
import {fixture,actor,now} from './14d-fixture.mjs';
import {normalizedDatedWeights} from '../supabase/functions/observed-snapshot-release/functions/dynamic-tdee/data.ts';
import {selectFourteenDayRateWindow,assessInitialRateCoverage,diagnoseFourteenDayRate} from '../release-candidates/tdee-adaptive-review/rateAdjustmentDecision.ts';
const source=new URL('../release-candidates/tdee-adaptive-review/snapshotReviewContextParser.ts',import.meta.url);
const oracle=new URL('../release-candidates/tdee-adaptive-review/.coverageOracle.generated-'+crypto.randomUUID()+'.ts',import.meta.url);
fs.writeFileSync(oracle,fs.readFileSync(source,'utf8')+'\nexport {diagnosticReadinessCoverage};\n');
let diagnosticReadinessCoverage;
try { ({diagnosticReadinessCoverage}=await import(oracle.href)); } finally { fs.unlinkSync(oracle); }
const base=()=>{const c=fixture();c.profile.journeyStartDate=c.observation.sources.journeyStartDate='2026-10-01';return c;};
const cases=[];const add=(name,mutate)=>{const c=base();mutate(c,c.observation.sources);cases.push({name,args:{context:c,actor,atTime:new Date(now).toISOString()}});};
add('complete',()=>{});
add('linear_loss',(c,s)=>{s.checkIns.forEach((r,i)=>r.weight=85-i*.1);c.currentGoal.loss_rate_lbs_per_week=1;});
add('maintain_target',(c,s)=>c.currentGoal.goal_type='maintain');
add('eight_weight_ten_complete',(c,s)=>{s.checkIns=s.checkIns.filter(r=>r.date<'2026-10-31'||r.date>='2026-11-06');c.readiness.days.forEach(d=>{if(d.date>='2026-11-10')d.confirmed=false;});});
add('nine_complete',(c)=>c.readiness.days.forEach(d=>{if(d.date>='2026-11-09')d.confirmed=false;}));
add('seven_weights',(c,s)=>s.checkIns=s.checkIns.filter(r=>r.date<'2026-10-31'||r.date>='2026-11-07'));
add('missing_journey',(c,s)=>c.profile.journeyStartDate=s.journeyStartDate=null);
add('young_journey',(c,s)=>c.profile.journeyStartDate=s.journeyStartDate='2026-11-10');
add('same_max_duplicate',(c,s)=>s.checkIns.push({...s.checkIns.at(-1)}));
add('conflicting_max_duplicate',(c,s)=>s.checkIns.push({...s.checkIns.at(-1),weight:81}));
add('superseded_older_conflict',(c,s)=>{s.checkIns.push({...s.checkIns.at(-1),weight:81});s.checkIns.push({...s.checkIns.at(-1),weight:82,updated_at:'2026-11-13T09:00:00Z'});});
add('microsecond_latest',(c,s)=>{s.checkIns.push({...s.checkIns.at(-1),weight:81,updated_at:'2026-11-13T08:00:00.000001Z'});});
add('same_instant_offset_conflict',(c,s)=>s.checkIns.push({...s.checkIns.at(-1),weight:81,updated_at:'2026-11-13T09:00:00+01:00'}));
add('latest_missing_timestamps',(c,s)=>s.checkIns=s.checkIns.map(r=>({...r,created_at:null,updated_at:null})));
add('tracker_kg',(c,s)=>{s.trackers=[{id:'t',unit:'kg'}];s.trackerWeights=[{tracker_id:'t',date:'2026-11-13',value:80.3,created_at:'2026-11-13T09:00:00Z'}];});
add('tracker_lb',(c,s)=>{s.trackers=[{id:'t',unit:'LBS'}];s.trackerWeights=[{tracker_id:'t',date:'2026-11-13',value:80*2.2046226218,created_at:'2026-11-13T09:00:00Z'}];});
add('tracker_disagrees',(c,s)=>{s.trackers=[{id:'t',unit:'kg'}];s.trackerWeights=[{tracker_id:'t',date:'2026-11-13',value:80.50001,created_at:'2026-11-13T09:00:00Z'}];});
add('unknown_unit',(c,s)=>{s.trackers=[{id:'t',unit:null}];s.trackerWeights=[{tracker_id:'t',date:'2026-11-13',value:80,created_at:'2026-11-13T09:00:00Z'}];});
add('tracker_missing_timestamp',(c,s)=>{s.trackers=[{id:'t',unit:'kg'}];s.trackerWeights=[{tracker_id:'t',date:'2026-11-13',value:80,created_at:null}];});
add('invalid_clock',(c,s)=>s.checkIns.at(-1).updated_at='2026-11-13T24:00:00Z');
add('invalid_numeric',(c,s)=>s.checkIns.at(-1).weight='');
add('decimal_adapter',(c,s)=>s.checkIns.at(-1).weight=' 8e1 ');
add('nonpositive_latest',(c,s)=>s.checkIns.at(-1).weight=0);
add('duplicate_readiness',(c)=>{c.readiness.days=c.readiness.days.slice(1);c.readiness.days.push({...c.readiness.days.at(-1)});});
add('stale_readiness',(c)=>c.readiness.capturedAt=new Date(now-31000).toISOString());
add('inconsistent_confirmed',(c)=>{c.readiness.days.at(-1).confirmable=false;});
for(const f of cases){const c=f.args.context,s=c.observation.sources,today=c.observation.context.today,start='2026-10-31',min=s.journeyStartDate&&s.journeyStartDate>start?s.journeyStartDate:start;
 const normalized=normalizedDatedWeights(s,today,min);const window=normalized===null?null:selectFourteenDayRateWindow(today,normalized.map(r=>({date:r.date,weightKg:r.kg})));
 if(!window||window.kind==='blocked'){f.expected={status:'blocked'};continue;}
 const rate=diagnoseFourteenDayRate(today,normalized.map(r=>({date:r.date,weightKg:r.kg})),c.currentGoal,now);
 const r=diagnosticReadinessCoverage(c,actor,today,c.profile.timezone,now),cov=assessInitialRateCoverage(window,r);
 let reason=cov.reason;if(s.journeyStartDate==null)reason='journey_start_unverified';else if(s.journeyStartDate>start)reason='initial_fourteen_days_not_elapsed';
 f.expected={status:'coverage_checked',observedRateKgPerWeek:rate.observedRateKgPerWeek,targetRateKgPerWeek:rate.targetRateKgPerWeek,targetRateStatus:rate.targetRateStatus,eligiblePairCount:rate.eligiblePairCount,weights:window.weights,missingWeightDates:window.missingWeightDates,weightDays:window.weightDays,firstHalfWeightDays:window.weights.filter(w=>w.date<'2026-11-07').length,secondHalfWeightDays:window.weights.filter(w=>w.date>='2026-11-07').length,readinessStatus:r.status,confirmedDays:r.confirmedDays,unconfirmedDays:r.unconfirmedDays,unavailableDays:r.unavailableDays,coverageSufficient:reason==='coverage_met_uncertainty_requires_evaluation',reason};
}
for(const f of cases){const c=f.args.context,s=c.observation.sources;f.args.context={version:c.version,actor:c.actor,actionable:c.actionable,evidenceStatus:c.evidenceStatus,capturedAt:c.capturedAt,observation:{ownerId:c.observation.ownerId,capturedAt:c.observation.capturedAt,context:{today:c.observation.context.today},sources:{timezone:s.timezone,journeyStartDate:s.journeyStartDate,checkIns:s.checkIns,trackerWeights:s.trackerWeights,trackers:s.trackers}},profile:{id:c.profile.id,timezone:c.profile.timezone,journeyStartDate:c.profile.journeyStartDate},currentGoal:c.currentGoal,readiness:c.readiness,readinessFingerprint:c.readinessFingerprint};}

fs.writeFileSync(new URL('./coverage-parity-fixtures.json',import.meta.url),JSON.stringify(cases,null,2));
console.log(cases.length+' synthetic oracle fixtures generated');

// Assertion script changes only private function definitions inside ROLLBACK.
// Synthetic contexts never enter operational tables or reviewed records.
const candidate=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/rateCoverageParityCandidate.sql',import.meta.url),'utf8');
let sql=candidate.replace(/ROLLBACK;\s*$/,'')+'\nDO $test$ DECLARE got jsonb;expected jsonb;BEGIN\n';
const quoteJson=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
for(const f of cases){const a=f.args;sql+=`got:=macrogoal_snapshot_review_private.inspect_rate_coverage_v1(${quoteJson(a.context)},'${a.actor}'::uuid,'${a.atTime}'::timestamptz); expected:=${quoteJson(f.expected)};\nIF NOT got @> expected THEN RAISE EXCEPTION 'coverage fixture ${f.name} mismatch: % versus %',got,expected;END IF;\n`;}
sql+='END $test$;\nROLLBACK;\n';
fs.writeFileSync(new URL('./coverage-parity-rollback.sql',import.meta.url),sql);
