import fs from 'node:fs';
import {legacyGoalBindingForReview,legacyGoalConfirmationIntent,prepareLegacyGoalAcknowledgmentForReview} from '../release-candidates/tdee-adaptive-review/legacyGoalConfirmation.ts';
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',now=Date.parse('2026-11-16T12:00:00Z'),at=new Date(now).toISOString();
function context(){return {version:'legacy-goal-current-context-v1',ownerId:actor,capturedAt:new Date(now-1000).toISOString(),currentGoal:{id,ownerId:actor,isActive:true,updatedAt:'2026-10-01T08:00:00.123456Z',targets:{calories:2100,proteinG:150,carbsG:225,fatsG:67}},profileUpdatedAt:'2026-10-01T07:00:00Z',profileBinding:'a'.repeat(64),journeyBinding:'b'.repeat(64),goalFingerprint:'c'.repeat(64)};}
const cases=[];function add(name,mutate=()=>{}){const c=context(),r=legacyGoalConfirmationIntent(legacyGoalBindingForReview(c,actor,now),actor,'keep_current_targets',id).request,args={request:structuredClone(r),context:c,actor,serverConfirmedAt:at};mutate(args);cases.push({name,args,expected:prepareLegacyGoalAcknowledgmentForReview(args.request,args.context,args.actor,args.serverConfirmedAt)});}
add('valid');add('no_backdate',a=>a.context.currentGoal.createdAt='2000-01-01T00:00:00Z');
add('foreign_actor',a=>a.actor=other);add('foreign_goal',a=>a.context.currentGoal.ownerId=other);add('inactive_goal',a=>a.context.currentGoal.isActive=false);
add('goal_revision_microsecond',a=>a.context.currentGoal.updatedAt='2026-10-01T08:00:00.123457Z');add('profile_revision',a=>a.context.profileUpdatedAt='2026-10-01T07:00:00.000001Z');
for(const key of ['profileBinding','journeyBinding','goalFingerprint'])add(key+'_changed',a=>a.context[key]='d'.repeat(64));
for(const key of ['calories','proteinG','carbsG','fatsG'])add(key+'_changed',a=>a.context.currentGoal.targets[key]++);
for(const key of ['confirmedAt','createdAt','baselineCapturedAt','daily_calories','is_active'])add('injected_'+key,a=>a.request[key]=at);
add('context_future',a=>a.context.capturedAt='2026-11-16T12:00:00.000001Z');add('microsecond_after_capture',a=>{a.context.capturedAt='2026-11-16T12:00:00.000001Z';a.serverConfirmedAt='2026-11-16T12:00:00.000002Z';});
add('stale_context',a=>a.context.capturedAt=new Date(now-30001).toISOString());add('server_time_missing',a=>a.serverConfirmedAt=null);add('invalid_server_date',a=>a.serverConfirmedAt='2026-02-30T00:00:00Z');
add('cancel_not_confirmation',a=>a.request.decision='cancel');add('null_request',a=>a.request=null);add('null_context',a=>a.context=null);
fs.writeFileSync(new URL('./legacy-ack-parity-fixtures.json',import.meta.url),JSON.stringify(cases,null,2));
const src=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/legacyGoalAcknowledgmentCandidate.sql',import.meta.url),'utf8');
let sql=src.replace(/ROLLBACK;\s*$/,'')+'\nDO $test$ DECLARE got jsonb;expected jsonb;BEGIN\n';
const q=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb",t=x=>x===null?'NULL':"'"+x.replaceAll("'","''")+"'";
for(const f of cases){const a=f.args;sql+=`got:=tdee_legacy_ack_private.validate_confirmation(${q(a.request)},${q(a.context)},'${a.actor}'::uuid,${t(a.serverConfirmedAt)});expected:=${q(f.expected)};\nIF got IS DISTINCT FROM expected THEN RAISE EXCEPTION 'legacy acknowledgment ${f.name} mismatch: % versus %',got,expected;END IF;\n`;}
sql+=`BEGIN\n PERFORM public.tdee_legacy_goal_confirmation_v1('context',NULL);\n RAISE EXCEPTION 'unauthenticated wrapper did not reject';\nEXCEPTION WHEN insufficient_privilege THEN NULL;END;\nIF (SELECT count(*) FROM tdee_legacy_ack_private.receipts)<>0 THEN RAISE EXCEPTION 'unexpected operational acknowledgment';END IF;\nEND $test$;\nROLLBACK;\n`;
fs.writeFileSync(new URL('./legacy-ack-parity-rollback.sql',import.meta.url),sql);console.log(cases.length+' pure JSON assertions; unauthenticated wrapper assertion; no operational inserts');
