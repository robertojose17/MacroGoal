import fs from 'node:fs';import {rulesFixture,actor,now,hash} from './rules14-fixture.mjs';import {decideRules14} from '../release-candidates/tdee-adaptive-review/rules14Decision.ts';
const cases=[];function add(name,direction,change=()=>{}){const r=rulesFixture(direction);change(r);cases.push({name,snapshot:r.snapshot,actor,history:r.history,policy:r.policy,now,expected:decideRules14(r.snapshot,actor,r.history,r.policy,now)});}
for(const d of ['increase','decrease'])for(const cap of [50,100,200])add(d+cap,d,r=>r.policy.max_step_kcal=cap);
add('actual-mean-no-stacked-deficit','decrease',r=>{r.policy.max_total_deficit_kcal=600;r.policy.max_total_deficit_fraction=.25;for(const g of [r.snapshot.currentGoal,r.snapshot.observation.context.currentGoal,r.history.currentGoal])g.loss_rate_lbs_per_week=.5/.45359237;r.snapshot.observation.sources.items.forEach(i=>i.calories=1250);});
add('remaining-deficit100','decrease',r=>{r.policy.max_total_deficit_fraction=.25;for(const g of [r.snapshot.currentGoal,r.snapshot.observation.context.currentGoal,r.history.currentGoal])g.loss_rate_lbs_per_week=.7/.45359237;r.snapshot.observation.sources.items.forEach(i=>i.calories=1200);});
add('existing-deficit-too-large','decrease',r=>{for(const g of [r.snapshot.currentGoal,r.snapshot.observation.context.currentGoal,r.history.currentGoal])g.loss_rate_lbs_per_week=2;r.snapshot.observation.sources.items.forEach(i=>i.calories=1300);});
add('adherence-opposite-direction','decrease',r=>r.snapshot.observation.sources.items.forEach(i=>i.calories=1500));
for(const [name,change] of Object.entries({
 'coverage-unconfirmed':r=>r.snapshot.readiness.days.forEach(d=>d.confirmed=false),
 'sensitivity-noisy':r=>r.snapshot.observation.sources.checkIns.forEach((w,i)=>w.weight=80+(i%2?5:-5)),
 'premium-false':r=>r.snapshot.observation.context.premium=false,
 'source-stale':r=>{r.snapshot.capturedAt=new Date(now-31000).toISOString();r.snapshot.observation.capturedAt=r.snapshot.capturedAt;},
 'screening-missing':r=>delete r.snapshot.rulesScreening,
 'screening-unknown':r=>r.snapshot.rulesScreening.response='unsure',
 'policy-off':r=>r.policy.enabled=false,
 'increment-missing':r=>delete r.policy.increment_kcal,
 'history-mismatch':r=>r.history.acceptedDeltaKcal=100,
 'history-cooldown':r=>{r.history.baselineAcceptedAt=now-13*86400000;},
 'mean-unknown':r=>r.snapshot.observation.sources.items.forEach(i=>i.calories=null),
 'policy-revision-missing':r=>delete r.policy.revision,
 'screening-profile-changed':r=>r.snapshot.rulesScreening.profileUpdatedAt='different',
 'source-owner-changed':r=>r.snapshot.actor='33333333-3333-4333-8333-333333333333',
}))add(name,'increase',change);
fs.writeFileSync(new URL('./rules14-decision-fixtures.json',import.meta.url),JSON.stringify(cases));console.log(cases.length+' pure synthetic fixtures; no database actions');
