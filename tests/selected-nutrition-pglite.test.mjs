// Offline synthetic PostgreSQL tests. Uses the repository's existing CI tooling.
import {pathToFileURL} from 'node:url';
const pgliteUrl=process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : import.meta.resolve('@electric-sql/pglite');
const {PGlite}=await import(pgliteUrl);
const {pgcrypto}=await import(new URL('./contrib/pgcrypto.js',pgliteUrl));
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const db=new PGlite({extensions:{pgcrypto}});let checks=0;
const owner=randomUUID(),owner2=randomUUID(),food=randomUUID(),offFood=randomUUID();
await db.exec(`CREATE ROLE service_role BYPASSRLS;CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE SCHEMA macrogoal_food_private;CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE public.food_items(id uuid PRIMARY KEY,barcode text,usda_fdc_id text,name text,calories numeric,verified boolean);
 CREATE TABLE macrogoal_food_private.nutrition_current(food_id uuid PRIMARY KEY,revision integer,confirmed boolean);
 GRANT USAGE ON SCHEMA macrogoal_food_private,extensions TO service_role;
 GRANT SELECT,UPDATE ON public.food_items TO service_role;GRANT SELECT ON macrogoal_food_private.nutrition_current TO service_role;`);
await db.query('INSERT INTO auth.users VALUES($1),($2)',[owner,owner2]);
await db.query("INSERT INTO food_items VALUES($1,NULL,'123','Confirmed',91,true),($2,'0669387007523',NULL,'OFFConfirmed',60,true)",[food,offFood]);
await db.query('INSERT INTO macrogoal_food_private.nutrition_current VALUES($1,7,true),($2,2,true)',[food,offFood]);
await db.exec(fs.readFileSync([new URL('./selected-nutrition-snapshots.sql',import.meta.url),new URL('../supabase/proposed/selected-nutrition-snapshots.sql',import.meta.url)].find(p=>fs.existsSync(p)),'utf8'));
const before=(await db.query('select * from food_items order by id')).rows;
const scope='detail_response';
const envelope=(id='123',sc=scope)=>({version:4,provider:'usda',source_id:id,capture_scope:sc,captured_at:new Date().toISOString(),source_url:'https://fdc.nal.usda.gov/food-details/'+id,raw_payload:{fdcId:Number(id),foodNutrients:[]},nutrition:{basis:'per_100g',nutrients:[{provider_key:'1',name:'Zero',amount:0,unit:'g',status:'valid',basis:'per_100g'},{provider_key:'2',name:'Unknown',amount:null,unit:null,status:'missing',basis:'per_100g'}]},complete:sc==='detail_response'});
const call=async(name,args)=>{await db.exec('set role service_role');try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;}finally{await db.exec('reset role');}};
const claim=(request,id='123',f=food,o=owner)=>call('claim_selected_nutrition_v1',[o,request,f,'usda',id]);
const rec=(request,e=envelope(),f=food)=>call('record_selected_nutrition_v1',[f,request,e]);
const batch=(items,req=randomUUID())=>call('record_selected_nutrition_batch_v1',[req,items]);
const check=(a,b)=>{assert.deepEqual(a,b);checks++};
for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select public.record_selected_nutrition_v1(null,$1,$2)',[randomUUID(),envelope()]),/permission denied/);await assert.rejects(()=>db.query('select * from macrogoal_food_private.selected_nutrition_snapshots_v1'),/permission denied/);await db.exec('reset role');checks+=2;}
check((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='macrogoal_food_private' and c.relname like 'selected_nutrition_%' and c.relkind='r' and c.relrowsecurity")).rows[0].n,3);
await assert.rejects(()=>rec(randomUUID()),/claim_required/);checks++;
await assert.rejects(()=>claim(randomUUID(),'999',food),/identity_conflict/);checks++;
await assert.rejects(()=>claim(randomUUID(),'123',randomUUID()),/food_unavailable/);checks++;
let request=randomUUID();check((await claim(request)).status,'claimed');check((await claim(request)).status,'busy');check((await claim(randomUUID(),'123',food,owner2)).status,'busy');
let e=envelope();let saved=await rec(request,e);check(saved.status,'captured');check(saved.version,1);check(saved.food_revision,7);
check((await rec(request,{...e,captured_at:new Date().toISOString()})).snapshot_id,saved.snapshot_id);
await assert.rejects(()=>rec(request,{...e,raw_payload:{...e.raw_payload,changed:true}}),/request_id_conflict/);checks++;
check((await claim(request)).status,'duplicate');
let fresh=await claim(randomUUID());check(fresh.status,'fresh');check(fresh.evidence.raw_payload,e.raw_payload);
let search=envelope('123','search_response');let b=await batch([{food_id:null,evidence:search}]);check(b.status,'recorded');check(b.results[0].version,2);check((await claim(randomUUID())).snapshot_id,saved.snapshot_id);
let reqBatch=randomUUID();b=await batch([{food_id:null,evidence:search}],reqBatch);check(b.results[0].status,'duplicate');check((await batch([{food_id:null,evidence:{...search,captured_at:new Date().toISOString()}}],reqBatch)).results[0].snapshot_id,b.results[0].snapshot_id);
await assert.rejects(()=>batch([{food_id:null,evidence:{...search,raw_payload:{fdcId:999}}}]),/source_identity_mismatch/);checks++;
await assert.rejects(()=>batch([{food_id:null,evidence:{...search,source_url:'https://evil.example'}}]),/invalid_source_url/);checks++;
await assert.rejects(()=>batch([{food_id:null,evidence:{...search,raw_payload:{fdcId:123,big:'x'.repeat(262145)}}}]),/source_payload_too_large/);checks++;
await assert.rejects(()=>batch(Array(101).fill({food_id:null,evidence:search})),/batch_too_large/);checks++;
await assert.rejects(()=>batch([{food_id:null,evidence:{...search,nutrition:{...search.nutrition,nutrients:Array(513).fill(search.nutrition.nutrients[0])}}}]),/too_many_nutrients/);checks++;
await assert.rejects(()=>batch([{food_id:null,evidence:{...search,nutrition:{...search.nutrition,nutrients:[{...search.nutrition.nutrients[1],amount:0}]}}}]),/missing_is_not_zero/);checks++;
// Rollback entire batch when later member is invalid.
const nBefore=(await db.query('select count(*)::int n from macrogoal_food_private.selected_nutrition_snapshots_v1')).rows[0].n;
await assert.rejects(()=>batch([{food_id:null,evidence:envelope('555','search_response')},{food_id:null,evidence:{}}]));
check((await db.query('select count(*)::int n from macrogoal_food_private.selected_nutrition_snapshots_v1')).rows[0].n,nBefore);
// Expired claims never redispatch. Changed food revision refuses link.
request=randomUUID();check((await claim(request,'444',null,owner2)).status,'claimed');await db.query("update macrogoal_food_private.selected_nutrition_claims_v1 set lease_until=now()-interval '1 second' where request_id=$1",[request]);check((await claim(request,'444',null,owner2)).reason,'request_expired');await assert.rejects(()=>rec(request,envelope('444'),null),/claim_required/);checks++;
// Drop fixture freshness only by aging receipts, not production behavior.
await db.exec("update macrogoal_food_private.selected_nutrition_receipts_v1 set received_at=now()-interval '2 days'; update macrogoal_food_private.selected_nutrition_claims_v1 set created_at=now()-interval '2 hours';");
request=randomUUID();check((await claim(request)).status,'claimed');await db.query('update macrogoal_food_private.nutrition_current set revision=8 where food_id=$1',[food]);await assert.rejects(()=>rec(request),/food_revision_conflict/);checks++;
// OFF exact link and source conflict, zero remains zero, null remains null.
let off={...envelope(),provider:'openfoodfacts',source_id:'669387007523',source_url:'https://world.openfoodfacts.org/product/669387007523',raw_payload:{code:'669387007523',nutriments:{}},nutrition:{basis:'provider_declared',nutrients:[]}};
request=randomUUID();check((await call('claim_selected_nutrition_v1',[owner2,request,offFood,'openfoodfacts','669387007523'])).status,'claimed');check((await rec(request,off,offFood)).link_status,'identity_linked');
await assert.rejects(()=>batch([{food_id:null,evidence:{...off,capture_scope:'search_response',complete:false,raw_payload:{code:'669387007523',_id:'999'}}}]),/source_identity_mismatch/);checks++;
// Authenticated admission budget stops at six requests/minute.
await db.exec("update macrogoal_food_private.selected_nutrition_claims_v1 set created_at=now()-interval '2 hours';");for(let i=0;i<6;i++)check((await claim(randomUUID(),String(700+i),null,owner2)).status,'claimed');check((await claim(randomUUID(),'799',null,owner2)).status,'rate_limited');

// Exercise the actual search builder and scheduler against real SQL, not a fixture envelope.
const searchModule=[new URL('./searchNutritionCapture.mjs',import.meta.url),new URL('../supabase/functions/_shared/searchNutritionCapture.mjs',import.meta.url)].find(p=>fs.existsSync(p));
const {createSearchNutritionBatch,scheduleSearchNutritionBatch}=await import(searchModule.href);
const actualBatch=createSearchNutritionBatch();
actualBatch.add('usda',[{fdcId:8001,foodNutrients:[{nutrientId:1003,nutrientName:'Protein',value:0,unitName:'G'}]}]);
actualBatch.add('openfoodfacts',[{code:'80020003',nutriments:{fat_100g:0,fat_unit:'g',sodium_100g:null}}]);
let tracked;const actualRequest=randomUUID();
const admin={rpc(name,args){return {abortSignal(){return call(name,[args.p_request_id,args.p_items]).then(data=>({data,error:null}));}};}};
check(scheduleSearchNutritionBatch(admin,actualBatch,{requestId:()=>actualRequest,waitUntil:p=>{tracked=p;}}).status,'scheduled');
check((await tracked).status,'completed');
const actualRows=(await db.query("select payload from macrogoal_food_private.selected_nutrition_snapshots_v1 where source_id in ('8001','80020003') order by source_id")).rows;
check(actualRows.length,2);check(actualRows[0].payload.capture_scope,'search_response');check(actualRows[0].payload.complete,false);
check(actualRows[0].payload.nutrition.nutrients[0].amount,0);
check(actualRows[1].payload.nutrition.nutrients.find(n=>n.provider_key==='sodium_100g').amount,null);
const replayActual=await batch(actualBatch.snapshot().items.reverse(),actualRequest);
check(replayActual.results.every(r=>r.replayed===true),true);

// Match PostgreSQL actual jsonb byte accounting, including exponent expansion.
const {postgresJsonbBytes}=await import(new URL('./selectedNutrition.mjs',searchModule));
for(const value of [null,{},[],{name:'café 🥥',nested:[true,null,0,1e21,1e-7,-1.234e-20,1.7976931348623157e308,5e-324],quoted:'"\\\\\t\n'}, {x:[{a:1},{b:2}]}]) {
 check(postgresJsonbBytes(value),(await db.query('select octet_length($1::jsonb::text)::int n',[JSON.stringify(value)])).rows[0].n);
}
const sizeBatch=createSearchNutritionBatch();
const oversizeRaw={fdcId:9001,foodNutrients:[],padding:'x'.repeat(262000),extra:[1e100,1e-100]};
check(Buffer.byteLength(JSON.stringify(oversizeRaw))<262144,true);
sizeBatch.add('usda',[oversizeRaw,{fdcId:9002,foodNutrients:[]}]);
check(sizeBatch.snapshot().skipped,1);check(sizeBatch.snapshot().items.length,1);
check((await batch(sizeBatch.snapshot().items)).status,'recorded');

// Global daily snapshot budget; duplicates do not use extra versions.
await db.exec("insert into macrogoal_food_private.selected_nutrition_snapshots_v1(provider,source_id,revision,capture_scope,content_hash,payload) select 'usda',(10000+i)::text,1,'search_response',lpad(i::text,64,'0'),'{}'::jsonb from generate_series(1,1000)i");
check((await batch([{food_id:null,evidence:envelope('900','search_response')}])).status,'storage_quota');check((await batch([{food_id:null,evidence:search}])).results[0].status,'duplicate');
check((await db.query('select * from food_items order by id')).rows,before);
await db.exec('set role service_role');await assert.rejects(()=>db.exec('delete from macrogoal_food_private.selected_nutrition_snapshots_v1'),/permission denied/);await assert.rejects(()=>db.exec("update macrogoal_food_private.selected_nutrition_snapshots_v1 set payload='{}'"),/permission denied/);await db.exec('reset role');checks+=2;
console.log(`PASS ${checks} functional PostgreSQL/PGlite assertions; no external DB writes. In-memory minimal schema; no production triggers exercised.`);await db.close();
