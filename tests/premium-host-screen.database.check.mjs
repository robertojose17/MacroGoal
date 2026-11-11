// Isolated PostgreSQL WASM fixtures only. No network, credentials or real users.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath=process.env.PGLITE_MODULE || path.resolve('scripts/ci/test-tooling/node_modules/@electric-sql/pglite/dist/index.js');
const {PGlite}=await import(pathToFileURL(modulePath).href);
const read=p=>fs.readFileSync(p,'utf8');
const user='11111111-1111-4111-8111-111111111111';
const before=read('tests/fixtures/checkpoint-rpc-pre-screen.sql');
const migration=read('supabase/premium-checkpoints-rollout/40-host-screen.CANDIDATE.sql');
let db;
test.before(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE);
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb $$;
 INSERT INTO auth.users VALUES ('${user}'); INSERT INTO public.users VALUES ('${user}');
 SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);`);
 const original=read('supabase/premium-checkpoints-rollout/10-private-checkpoints.CANDIDATE.sql');
 await db.exec(original.slice(0,original.indexOf('CREATE FUNCTION public.record_private_checkpoint_v1'))+before+'\n'+original.slice(original.indexOf('REVOKE ALL ON FUNCTION public.record_private_checkpoint_v1')));
 await db.exec(migration);
 await db.exec('CREATE TABLE public.revenuecat_events(created_at timestamptz NOT NULL,raw_event jsonb,event_data jsonb);');
});
test.after(async()=>{await db?.close();});
let sequence=0;
function event(screen,flowId){
 const flow={flowId:flowId||`flow_${String(++sequence).padStart(8,'0')}`,source:'floating_badge'};
 if(screen!==undefined)flow.screen=screen;
 return {namespace:'premium_checkpoint',schema_version:1,eventId:`event_${String(++sequence).padStart(8,'0')}`,occurredAt:new Date().toISOString(),flow,platform:'ios',detail:{name:'entrypoint_clicked'}};
}
const insert=async e=>(await db.query('SELECT public.record_private_checkpoint_v1($1,$2::jsonb) AS status',[user,JSON.stringify(e)])).rows[0].status;
test('actual candidate preserves service-only ACL, RLS and closed search path',async()=>{
 const r=(await db.query(`SELECT has_function_privilege('anon','public.record_private_checkpoint_v1(uuid,jsonb)','EXECUTE') anon,
 has_function_privilege('authenticated','public.record_private_checkpoint_v1(uuid,jsonb)','EXECUTE') authenticated,
 has_function_privilege('service_role','public.record_private_checkpoint_v1(uuid,jsonb)','EXECUTE') service,
 (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='macrogoal_checkpoints_private.checkpoint_events'::regclass) rls,
 (SELECT prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.record_private_checkpoint_v1(uuid,jsonb)'::regprocedure) secure;`)).rows[0];
 assert.deepEqual(r,{anon:false,authenticated:false,service:true,rls:true,secure:true});
});
test('actual RPC accepts legacy and all safe screen labels, preserving payload and duplicates',async()=>{
 for(const screen of [undefined,'home','dashboard','check_ins','profile','unknown']){
  const e=event(screen);assert.equal(await insert(e),'accepted');assert.equal(await insert(e),'duplicate');
  const p=(await db.query('SELECT payload FROM macrogoal_checkpoints_private.checkpoint_events WHERE event_id=$1',[e.eventId])).rows[0].payload;
  assert.deepEqual(p,e);
 }
});
test('actual RPC rejects raw routes, private data and invalid screen types',async()=>{
 for(const screen of ['/profile/private-user-id','private@example.test','',null,{},[],12])await assert.rejects(insert(event(screen)),/invalid checkpoint/);
});
test('actual RPC rejects source/screen changes within one flow including adding a screen to history',async()=>{
 for(const screen of [undefined,'home']){
  const e=event(screen);assert.equal(await insert(e),'accepted');
  const changed=event('profile',e.flow.flowId);assert.equal(await insert(changed),'conflict');
 }
});
test('strict SQL report keeps historic source attribution and splits new Go Premium screens',async()=>{
 await db.exec('TRUNCATE macrogoal_checkpoints_private.checkpoint_events,public.revenuecat_events;');
 const now=Date.now();
 for(const [screen,environment] of [[undefined,'PRODUCTION'],['home','PRODUCTION'],['profile','PRODUCTION'],['profile','SANDBOX']]){
  const seed=event(screen);const attemptId=`attempt_${++sequence}`;
  const a={...seed,detail:{name:'purchase_attempt',attemptId,attribution:'consistent',offer:{productId:'Monthly_MG'}}};
  assert.equal(await insert(a),'accepted');
  const transactionId=`transaction_${sequence}`;
  const result={...seed,eventId:`event_result_${++sequence}`,detail:{name:'purchase_result',attemptId,attribution:'consistent',outcome:'sdk_returned_entitlement',correlation:{transactionId,productId:'Monthly_MG',store:'APP_STORE',environment}}};
  assert.equal(await insert(result),'accepted');
  const provider={event:{id:`vendor_${sequence}`,app_user_id:user,transaction_id:transactionId,product_id:'Monthly_MG',store:'APP_STORE',environment,currency:'USD',type:'INITIAL_PURCHASE',period_type:'NORMAL',purchased_at_ms:now,event_timestamp_ms:now,price_in_purchased_currency:9.99}};
  await db.query('INSERT INTO public.revenuecat_events VALUES(now(),$1::jsonb,null)',[JSON.stringify(provider)]);
 }
 let report=read('supabase/premium-checkpoints-rollout/30-owner-report.READONLY.sql');
 report=report.replace('NULL::timestamptz AS trusted_from, NULL::timestamptz AS capture_start',"'1970-01-01'::timestamptz AS trusted_from, now()-interval '1 day' AS capture_start").replace('NULL::timestamptz AS window_start, NULL::timestamptz AS cutoff',"now()-interval '1 day' AS window_start, now()+interval '1 minute' AS cutoff");
 const data=(await db.query(report)).rows[0].owner_report;
 assert.equal(data.coverage.observed_production_payments,3);assert.equal(data.coverage.unattributed_production_payments,0);assert.equal(data.coverage.ambiguous_source_production_payments,0);
 const rows=data.by_entry_screen;assert.equal(rows.find(r=>r.screen===null).matched_production_payments,1);assert.equal(rows.find(r=>r.screen===null).screen_status,'not_recorded');
 assert.equal(rows.find(r=>r.screen==='home').matched_production_payments,1);assert.equal(rows.find(r=>r.screen==='home').entry_label,'Go Premium / home');
 assert.equal(rows.find(r=>r.screen==='profile').matched_production_payments,1);assert.equal(rows.find(r=>r.screen==='profile').matched_sandbox_payments,1);
 assert.equal(data.by_source[0].matched_production_payments,3);
 // Synthetic corruption bypasses the RPC only in this isolated fixture. Never infer a contradictory host screen.
 await db.exec("UPDATE macrogoal_checkpoints_private.checkpoint_events SET payload=jsonb_set(payload,'{flow,screen}','\"profile\"') WHERE name='purchase_result' AND payload#>>'{flow,screen}'='home';");
 const corrupt=(await db.query(report)).rows[0].owner_report;assert.equal(corrupt.coverage.ambiguous_source_production_payments,1);assert.equal(corrupt.by_source[0].matched_production_payments,2);
 // Missing telemetry is not evidence of contradictory attribution, with or without screen.
 await db.exec("DELETE FROM macrogoal_checkpoints_private.checkpoint_events WHERE name='purchase_attempt';");
 const missing=(await db.query(report)).rows[0].owner_report;assert.equal(missing.coverage.unattributed_production_payments,3);assert.equal(missing.coverage.ambiguous_source_production_payments,0);
});
test('candidate refuses replay or a changed live RPC instead of silently overwriting it',async()=>{
 await assert.rejects(db.exec(migration),/changed since review/);await db.exec('ROLLBACK;');
});
