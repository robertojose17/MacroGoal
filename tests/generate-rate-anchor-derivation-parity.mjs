import {writeFileSync} from 'node:fs';
import {prepareAcceptedIntakeRateAnchor as build} from '../release-candidates/tdee-adaptive-review/acceptedIntakeRateAnchor.ts';
const actor='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222',hash='a'.repeat(64),now=Date.parse('2026-11-16T12:00:00Z'),accepted=now-20*86400000;
function fixture(){const at=new Date(accepted).toISOString(),g={id:actor,user_id:actor,is_active:true,goal_type:'lose',loss_rate_lbs_per_week:1,macro_preset:'balanced',daily_calories:2000,protein_g:150,carbs_g:215,fats_g:60,fiber_g:30,base_daily_calories:2000,last_adaptive_update:null,created_at:at,updated_at:at,start_journey_date:at.slice(0,10)};return {version:'accepted-goal-rate-anchor-source-v1',ownerId:actor,actionable:false,capturedAt:new Date(now-1000).toISOString(),existingAnchor:null,currentGoal:g,currentProfile:{id:actor,onboarding_completed:true,updated_at:at,journey_start_date:at.slice(0,10),journey_restart_count:0,date_of_birth:'1990-01-01',timezone:'America/Puerto_Rico'},currentProfileFingerprint:hash,profileBinding:hash,journeyBinding:hash,receipt:{user_id:actor,request_id:request,goal_id:actor,payload:{operation:'initial_onboarding',goal:{daily_calories:2000},profile:{onboarding_completed:true}},goal_snapshot:structuredClone(g),profile_fingerprint:hash,created_at:at}};}

const cases=[];const add=(name,mutate=()=>{})=>{const source=fixture();mutate(source);const r=build(source,actor,now);cases.push({name,source,expected:r.kind==='rate_anchor_draft'?r.anchor:null});};
add('valid initial');add('valid manual',s=>s.receipt.payload.operation='manual_goal');
add('existing anchor',s=>s.existingAnchor={});add('owner mismatch',s=>s.ownerId=request);add('missing goal',s=>delete s.currentGoal);
add('changed profile',s=>s.currentProfileFingerprint='b'.repeat(64));add('bad operation',s=>s.receipt.payload.operation='restart');
add('receipt mismatch',s=>s.receipt.goal_snapshot.protein_g=100);add('stale capture',s=>s.capturedAt=new Date(now-30001).toISOString());
add('future capture',s=>s.capturedAt=new Date(now+1).toISOString());add('bad timezone',s=>s.currentProfile.timezone='not/a/timezone');
add('age18',s=>s.currentProfile.date_of_birth='2008-11-16');add('age101',s=>s.currentProfile.date_of_birth='1925-11-16');
add('missing restart',s=>delete s.currentProfile.journey_restart_count);add('fraction restart',s=>s.currentProfile.journey_restart_count=.5);
add('bad calendar',s=>s.capturedAt='2026-02-30T12:00:00Z');add('24 hour',s=>s.capturedAt='2026-11-15T24:00:00Z');
add('infinite time',s=>s.receipt.created_at='infinity');add('missing capture',s=>delete s.capturedAt);
add('large offset capture',s=>s.capturedAt='2026-11-17T11:00:00+23:00');
add('submillisecond capture',s=>s.capturedAt='2026-11-16T12:00:00.000999Z');
add('negative macro',s=>{s.currentGoal.fats_g=-1;s.receipt.goal_snapshot=structuredClone(s.currentGoal);});
add('energy mismatch',s=>{s.currentGoal.protein_g=1;s.receipt.goal_snapshot=structuredClone(s.currentGoal);});
add('base offset',s=>{s.currentGoal.base_daily_calories=2200;s.receipt.goal_snapshot=structuredClone(s.currentGoal);});
add('adaptive update',s=>{s.currentGoal.last_adaptive_update=new Date(now-10000).toISOString();s.receipt.goal_snapshot=structuredClone(s.currentGoal);});
const quote=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
let sql='-- Synthetic pure differential cases only. No operational receipt rows.\n';
sql+='DO $parity$ DECLARE c jsonb;actual jsonb;failed boolean;n int:=0; BEGIN\n';
sql+='FOR c IN SELECT value FROM jsonb_array_elements('+quote(cases)+') LOOP\n';
sql+=`failed:=false;actual:=NULL; BEGIN actual:=tdee_rate_anchor_private.derive_initial(c->'source','${actor}'::uuid,'${new Date(now).toISOString()}'::timestamptz); EXCEPTION WHEN OTHERS THEN failed:=true; END;
`;
sql+="IF (c->'expected'='null'::jsonb AND NOT failed) OR (c->'expected'<>'null'::jsonb AND (failed OR actual IS DISTINCT FROM c->'expected')) THEN RAISE EXCEPTION 'derivation parity failed: %',c->>'name'; END IF;n:=n+1; END LOOP; RAISE NOTICE 'derivation parity passed % cases',n;END $parity$;\n";
writeFileSync(new URL('../rate-anchor-derivation-parity.sql',import.meta.url),sql);console.log(`${cases.length} differential cases generated`);
