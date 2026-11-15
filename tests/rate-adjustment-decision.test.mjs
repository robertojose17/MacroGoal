/** Prepared contract tests, NOT RUN. Runner remains blocked; no alternative execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {decideRateAdjustment as decide,readPersistedTargetRate as readRate,decidePersistedGoalRateAdjustment as decideGoal,selectFourteenDayRateWindow as selectWindow,diagnoseFourteenDayRate as diagnose} from '../release-candidates/tdee-adaptive-review/rateAdjustmentDecision.ts';
const now=Date.parse('2026-11-15T12:00:00Z');
function fixture(){return {now,targetRateKgPerWeek:-0.5,observedRateKgPerWeek:-0.3,
 interval:{lower:-0.4,upper:-0.2},data:{sufficient:true,stable:true,reliableInterval:true},
 currentIntakeKcal:2000,acceptedNetDeltaKcal:0,
 policy:{conversionReviewed:true,kcalPerKg:7000,maxStepKcal:200,maxStepFraction:0.1,
 minIntakeKcal:1500,maxIntakeKcal:3000,maxNetDeltaKcal:400}};}
test('variable adjustment uses nearest interval edge not point estimate',()=>{
 const f=fixture(),r=decide(f);assert.equal(r.kind,'candidate');
 // Floating arithmetic may yield99; truncation must never overstate magnitude.
 assert.ok(r.deltaKcal>=-100&&r.deltaKcal<=-99);assert.equal(r.actionable,false);assert.equal(r.requiresAcceptance,true);
 assert.equal('target' in r,false);assert.equal('macros' in r,false);
});
test('signed gain and faster-than-target loss produce upward candidates',()=>{
 for(const [target,observed,lower,upper]of [[0.5,0.3,0.2,0.4],[-0.2,-0.5,-0.6,-0.4]]){
 const f=fixture();f.targetRateKgPerWeek=target;f.observedRateKgPerWeek=observed;f.interval={lower,upper};
 const r=decide(f);assert.equal(r.kind,'candidate');assert.ok(r.deltaKcal>0&&r.deltaKcal<=200);
 }
});
test('target inside interval including boundaries holds exactly seven days',()=>{
 for(const target of [-0.4,-0.3,-0.2]){
 const f=fixture();f.targetRateKgPerWeek=target;
 assert.deepEqual(decide(f),{kind:'hold',actionable:false,reason:'target_within_interval',reevaluateAt:now+7*86400000});
 }
});
test('unreliable insufficient or unstable evidence never creates adjustment',()=>{
 for(const key of ['sufficient','stable','reliableInterval'])for(const value of [false,undefined,'true']){
 const f=fixture();f.data[key]=value;const r=decide(f);
 assert.equal(r.kind,'hold');assert.equal(r.reevaluateAt,now+7*86400000);
 }
});
test('reviewed explicit conversion and finite positive caps required with no defaults',()=>{
 for(const key of ['kcalPerKg','maxStepKcal','maxStepFraction','minIntakeKcal','maxIntakeKcal','maxNetDeltaKcal'])
 for(const value of [null,undefined,0,-1,NaN,Infinity,'7000']){
 const f=fixture();f.policy[key]=value;assert.equal(decide(f).kind,'blocked');
 }
 for(const value of [false,'true',1,undefined]){const f=fixture();f.policy.conversionReviewed=value;assert.equal(decide(f).reason,'conversion_review_required');}
});
test('absolute200 fractional step net and intake caps only tighten output',()=>{
 const base=fixture();base.targetRateKgPerWeek=-10;
 assert.equal(decide(base).deltaKcal,-200);
 for(const [key,value,max]of [['maxStepKcal',75,75],['maxStepFraction',0.025,50],['maxNetDeltaKcal',60,60],['minIntakeKcal',1970,30]]){
 const f=structuredClone(base);f.policy[key]=value;assert.ok(Math.abs(decide(f).deltaKcal)<=max);
 }
 const f=structuredClone(base);f.acceptedNetDeltaKcal=-390;assert.equal(decide(f).deltaKcal,-10);
});
test('outside existing policy holds without expanding limits',()=>{
 for(const [key,value]of [['currentIntakeKcal',1400],['currentIntakeKcal',3100],['acceptedNetDeltaKcal',401],['acceptedNetDeltaKcal',-401]]){
 const f=fixture();f[key]=value;assert.equal(decide(f).reason,'current_target_outside_policy');
 assert.equal(decide(f).reevaluateAt,now+7*86400000);
 }
});
test('malformed intervals and times block; overflowing arithmetic holds',()=>{
 for(const interval of [{lower:0,upper:-1},{lower:NaN,upper:1},{lower:-1,upper:Infinity},{lower:0,upper:1}]){
 const f=fixture();f.interval=interval;assert.equal(decide(f).kind,'blocked');
 }
 for(const time of [NaN,Infinity,1.5,8640000000000000]){const f=fixture();f.now=time;assert.equal(decide(f).kind,'blocked');}
 const f=fixture();f.targetRateKgPerWeek=-Number.MAX_VALUE;f.policy.kcalPerKg=Number.MAX_VALUE;assert.equal(decide(f).reason,'numeric_range_invalid');assert.equal(decide(f).kind,'hold');
});
test('inputs unchanged and subunit changes hold instead of rounding up',()=>{
 const f=fixture(),before=structuredClone(f);decide(f);assert.deepEqual(f,before);
 f.targetRateKgPerWeek=-0.4001;assert.equal(decide(f).kind,'hold');
});

test('insufficient data holds seven days without inventing policy or interval',()=>{
 for(const key of ['sufficient','stable','reliableInterval']){
  const f=fixture();f.data[key]=false;f.policy=undefined;f.interval=undefined;const before=structuredClone(f);
  assert.deepEqual(decide(f),{kind:'hold',actionable:false,reason:'insufficient_or_uncertain_data',reevaluateAt:now+7*86400000});
  assert.equal('deltaKcal' in decide(f),false);assert.deepEqual(f,before);
 }
 for(const [field,value] of [['now',NaN],['currentIntakeKcal',0],['acceptedNetDeltaKcal',Infinity]]){
  const f=fixture();f.data.sufficient=false;f.policy=undefined;f[field]=value;assert.equal(decide(f).kind,'blocked');
 }
});
test('sufficient evidence still requires policy conversion and interval',()=>{
 for(const field of ['policy','interval']){const f=fixture();f[field]=undefined;assert.equal(decide(f).kind,'blocked');}
 const f=fixture();f.policy.conversionReviewed=false;assert.equal(decide(f).reason,'conversion_review_required');
});
test('misconfigured above200 step is rejected consistently with snapshot engine',()=>{
 for(const maximum of [201,500,1000]){const f=fixture();f.policy.maxStepKcal=maximum;assert.equal(decide(f).reason,'policy_invalid');}
});

test('persisted loss magnitude converts pounds to negative kilograms without rounding',()=>{
 assert.deepEqual(readRate({goal_type:'lose',loss_rate_lbs_per_week:1}),
 {kind:'target_rate',targetRateKgPerWeek:-0.45359237,source:'loss_rate_lbs_per_week'});
 assert.equal(readRate({goal_type:'lose',loss_rate_lbs_per_week:0.5}).targetRateKgPerWeek,-0.226796185);
});
test('missing or malformed loss rate never falls back to intensity or calorie deficit',()=>{
 for(const rate of [undefined,null,'1',0,-1,NaN,Infinity,Number.MIN_VALUE]){
 assert.equal(readRate({goal_type:'lose',loss_rate_lbs_per_week:rate,goal_intensity:1,daily_calories:1800,base_daily_calories:2300}).kind,'blocked');
 }
 for(const goal of [null,[],{}, {goal_type:'unknown'}])assert.equal(readRate(goal).kind,'blocked');
});
test('maintain ignores legacy loss rate and gain cannot borrow it',()=>{
 assert.deepEqual(readRate({goal_type:'maintain',loss_rate_lbs_per_week:2}),
 {kind:'target_rate',targetRateKgPerWeek:0,source:'maintain'});
 assert.equal(readRate({goal_type:'gain',loss_rate_lbs_per_week:2,goal_intensity:1}).reason,'target_gain_rate_unavailable');
});
test('goal adapter overrides untrusted target field and preserves input and guards',()=>{
 const f=fixture(),goal={goal_type:'lose',loss_rate_lbs_per_week:1};
 const before=structuredClone(f),beforeGoal=structuredClone(goal);
 assert.deepEqual(decideGoal(goal,f),decide({...f,targetRateKgPerWeek:-0.45359237}));
 assert.deepEqual(f,before);assert.deepEqual(goal,beforeGoal);
 f.data.reliableInterval=false;f.policy=undefined;
 assert.equal(decideGoal(goal,f).reason,'insufficient_or_uncertain_data');
 assert.equal(decideGoal(goal,f).reevaluateAt,now+7*86400000);
});

test('review window uses fourteen completed local dates and excludes today and future',()=>{
 const rows=[{date:'2026-10-31',weightKg:80},{date:'2026-11-01',weightKg:79},
 {date:'2026-11-14',weightKg:78},{date:'2026-11-15',weightKg:77},{date:'2026-11-16',weightKg:76}];
 const before=structuredClone(rows),r=selectWindow('2026-11-15',rows);
 assert.equal(r.kind,'window');assert.equal(r.startDate,'2026-11-01');assert.equal(r.endDateExclusive,'2026-11-15');
 assert.deepEqual(r.weights,[rows[1],rows[2]]);assert.equal(r.weightDays,2);assert.equal(r.missingWeightDates.length,12);
 assert.equal('sufficient' in r,false);assert.equal('reliableInterval' in r,false);assert.deepEqual(rows,before);
});
test('empty and flat series do not establish plateau or reliable evidence',()=>{
 const empty=selectWindow('2026-11-15',[]);assert.equal(empty.weightDays,0);assert.equal(empty.missingWeightDates.length,14);
 const rows=empty.missingWeightDates.map(date=>({date,weightKg:80}));
 const flat=selectWindow('2026-11-15',rows);assert.equal(flat.weightDays,14);assert.deepEqual(flat.missingWeightDates,[]);
 for(const key of ['plateau','sufficient','reliableInterval','deltaKcal'])assert.equal(key in flat,false);
 assert.equal(flat.actionable,false);
});
test('calendar boundaries and missing dates do not use elapsed daylight-saving hours',()=>{
 const leap=selectWindow('2024-03-01',[]);assert.equal(leap.startDate,'2024-02-16');assert.equal(leap.missingWeightDates.at(-1),'2024-02-29');
 assert.equal(selectWindow('2026-01-05',[]).startDate,'2025-12-22');
 for(const date of ['2026-02-30','2026-2-01','2026-11-15T00:00:00Z','0000-01-01',null])assert.equal(selectWindow(date,[]).kind,'blocked');
});
test('in-window duplicate invalid or unnormalized weights fail closed',()=>{
 for(const weightKg of [null,0,-1,NaN,Infinity,'80'])assert.equal(selectWindow('2026-11-15',[{date:'2026-11-14',weightKg}]).kind,'blocked');
 assert.equal(selectWindow('2026-11-15',[{date:'2026-11-14',weightKg:80},{date:'2026-11-14',weightKg:80}]).reason,'rate_weight_date_conflict');
 assert.equal(selectWindow('2026-11-15',[{date:'not-a-date',weightKg:80}]).kind,'blocked');
});

test('flat fourteen-day diagnosis never becomes a plateau recommendation',()=>{
 const rows=selectWindow('2026-11-15',[]).missingWeightDates.map(date=>({date,weightKg:80}));
 const r=diagnose('2026-11-15',rows,{goal_type:'lose',loss_rate_lbs_per_week:1},now);
 assert.equal(r.kind,'rate_diagnostic');assert.equal(r.observedRateKgPerWeek,0);
 assert.equal(r.targetMinusObservedKgPerWeek,-0.45359237);
 assert.equal(r.reliableInterval,false);assert.equal(r.interval,null);assert.equal(r.recommendation,null);
 assert.equal(r.reason,'uncertainty_not_established');assert.equal(r.actionable,false);
 assert.equal('plateau' in r,false);assert.equal('deltaKcal' in r,false);assert.equal(r.reevaluateAt,now+7*86400000);
});
test('sustained linear change is descriptive and preserves signed units',()=>{
 const dates=selectWindow('2026-11-15',[]).missingWeightDates;
 const rows=dates.map((date,i)=>({date,weightKg:80-i*0.1}));
 const r=diagnose('2026-11-15',rows,{goal_type:'maintain'},now);
 assert.ok(Math.abs(r.observedRateKgPerWeek+0.7)<1e-10);
 assert.ok(Math.abs(r.targetMinusObservedKgPerWeek-0.7)<1e-10);assert.equal(r.reliableInterval,false);
});
test('isolated spike does not receive confidence from pair count',()=>{
 const rows=selectWindow('2026-11-15',[]).missingWeightDates.map((date,i)=>({date,weightKg:i===6?85:80}));
 const r=diagnose('2026-11-15',rows,{goal_type:'maintain'},now);
 assert.equal(r.observedRateKgPerWeek,0);assert.ok(r.eligiblePairCount>0);
 assert.equal(r.recommendation,null);assert.equal(r.reliableInterval,false);
});
test('sparse and old data abstain without filling missing days',()=>{
 for(const rows of [[],[{date:'2026-11-14',weightKg:80}],[{date:'2026-11-10',weightKg:80},{date:'2026-11-14',weightKg:79}],
 [{date:'2026-10-15',weightKg:80},{date:'2026-10-30',weightKg:79}]]){
 const r=diagnose('2026-11-15',rows,{goal_type:'maintain'},now);
 assert.equal(r.observedRateKgPerWeek,null);assert.equal(r.reason,'insufficient_pair_span');
 assert.equal(r.recommendation,null);assert.equal(r.reevaluateAt,now+7*86400000);
 }
});
test('future readings and caller arrays cannot alter completed-window diagnostic',()=>{
 const rows=[{date:'2026-11-01',weightKg:80},{date:'2026-11-14',weightKg:79}],before=structuredClone(rows);
 const base=diagnose('2026-11-15',rows,{goal_type:'maintain'},now);
 const extra=diagnose('2026-11-15',[...rows,{date:'2026-11-15',weightKg:60},{date:'2026-11-16',weightKg:40}],{goal_type:'maintain'},now);
 assert.deepEqual(base,extra);assert.deepEqual(rows,before);
});
test('unavailable target never invents gain rate; invalid time blocks',()=>{
 const r=diagnose('2026-11-15',[{date:'2026-11-01',weightKg:80},{date:'2026-11-14',weightKg:79}],{goal_type:'gain'},now);
 assert.equal(r.targetRateKgPerWeek,null);assert.equal(r.targetMinusObservedKgPerWeek,null);
 assert.equal(r.targetRateStatus,'target_gain_rate_unavailable');assert.equal(r.recommendation,null);
 for(const value of [NaN,Infinity,8640000000000000])assert.equal(diagnose('2026-11-15',[],{goal_type:'maintain'},value).kind,'blocked');
});
