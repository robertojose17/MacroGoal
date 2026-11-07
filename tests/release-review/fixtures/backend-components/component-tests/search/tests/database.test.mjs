import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import {SEARCH_SNAPSHOT_FIELDS,uuid,snapshot,adminFor} from './fixtures.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url); const {endpoint}=require('./runtime.cjs');
const sqlRoot=process.env.SEARCH_AUTHORITY_SQL_ROOT || new URL('../sql',import.meta.url).pathname;
const lit=x=>x===null?'NULL':typeof x==='number'?String(x):typeof x==='boolean'?String(x):"'"+(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")+"'"+(typeof x==='object'?'::jsonb':'');
const arr=ids=>`ARRAY[${ids.map(lit).join(',')}]::uuid[]`;
let db;
const readSql=await readFile(path.join(sqlRoot,'search-snapshots.CANDIDATE.sql'),'utf8');
before(async()=>{
 db=new PGlite();
 const schema=JSON.parse(await readFile(new URL('./catalog-schema.json',import.meta.url),'utf8'));
 await db.exec('CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA macrogoal_food_private; GRANT USAGE ON SCHEMA macrogoal_food_private TO service_role;');
 for(const table of ['food_items','nutrition_current']) {
  const cols=schema.columns.filter(c=>c.table===table),ns=cols[0].schema;
  const fields=cols.map(c=>`"${c.name}" ${c.udt==='_text'?'text[]':c.udt}${c.default?' DEFAULT '+c.default:''}${c.nullable==='NO'?' NOT NULL':''}`);
  fields.push('PRIMARY KEY('+ (table==='food_items'?'id':'food_id') +')');
  await db.exec(`CREATE TABLE ${ns}.${table}(${fields.join(',')}); ALTER TABLE ${ns}.${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${ns}.${table} FORCE ROW LEVEL SECURITY;`);
 }
 await db.exec(await readFile(path.join(sqlRoot,'search-snapshots.CANDIDATE.sql'),'utf8'));
 for(let n=1;n<=5;n++) {
  const fields={...snapshot({id:uuid(n),popularity_score:0,logs_last_30d:0,nutriments:{},search_count:0,data_quality_score:0}),off_data:{user_id:'PRIVATE-OFF'},ingredients_text:'PRIVATE-UNNEEDED',ai_verified_source:n===5?'barcode_recovery:source_label':null,ai_verified:n===4,verified:n===3};
  await db.exec(`INSERT INTO public.food_items(${Object.keys(fields).join(',')}) VALUES(${Object.values(fields).map(lit).join(',')});`);
 }
 await db.exec(`INSERT INTO macrogoal_food_private.nutrition_current(food_id,revision,confirmed,snapshot) VALUES('${uuid(2)}',9,true,'{"private_owner_id":"PRIVATE-OWNER"}');`);
});
after(async()=>{await db.close();});
async function asRole(role,query){await db.exec('SET ROLE '+role);try{return await db.query(query);}finally{await db.exec('RESET ROLE');}}
const read=ids=>asRole('service_role',`SELECT * FROM public.read_food_search_snapshots_v1(${arr(ids)});`);

test('SQL snapshot covers private-only correction and every conservatively protected public state',async()=>{
 const ids=[1,2,3,4,5].map(uuid);const result=await read(ids);
 assert.deepEqual(result.rows.map(r=>r.id),ids);assert.deepEqual(result.rows.map(r=>r.protected),[false,true,true,true,true]);
 for(const r of result.rows) assert.deepEqual(Object.keys(r.snapshot).sort(),[...SEARCH_SNAPSHOT_FIELDS].sort());
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(JSON.stringify(result).includes('ai_verified'),false);
 assert.equal(result.rows[0].snapshot.fat,0);assert.deepEqual(result.rows[0].snapshot.nutriments,{});
});

test('SQL input bound, duplicate IDs, missing/deleted ID, empty array and exact order',async()=>{
 assert.deepEqual((await read([uuid(3),uuid(1),uuid(3),uuid(99)])).rows.map(r=>r.id),[uuid(3),uuid(1)]);
 assert.deepEqual((await read([])).rows,[]);
 for(const input of ['NULL',arr(Array.from({length:101},(_,i)=>uuid(i+1))),`ARRAY[NULL]::uuid[]`,`ARRAY[${arr([uuid(1)])},${arr([uuid(2)])}]`]) {
  await assert.rejects(()=>asRole('service_role',`SELECT * FROM public.read_food_search_snapshots_v1(${input});`),e=>e.code==='22023');
 }
 await db.exec(`DELETE FROM public.food_items WHERE id='${uuid(5)}'`);assert.deepEqual((await read([uuid(5)])).rows,[]);
});

test('real role ACLs deny anonymous/authenticated public and private reads, regardless of JWT claims',async()=>{
 for(const role of ['anon','authenticated']) {
  for(const target of ['public.read_food_search_snapshots_v1','macrogoal_food_private.read_search_snapshots_v1']) {
   await assert.rejects(()=>asRole(role,`SELECT * FROM ${target}(${arr([uuid(2)])});`),e=>e.code==='42501');
  }
 }
 await db.exec(`SET request.jwt.claims='{"role":"service_role"}';`);
 await assert.rejects(()=>asRole('authenticated',`SELECT * FROM public.read_food_search_snapshots_v1(${arr([uuid(2)])});`),e=>e.code==='42501');
 await db.exec('RESET request.jwt.claims');
 await assert.rejects(()=>asRole('service_role','SELECT * FROM macrogoal_food_private.nutrition_current'),e=>e.code==='42501');
});

test('defense-in-depth runtime gates deny accidental EXECUTE grants; not current_user in definer',async()=>{
 await db.exec('GRANT USAGE ON SCHEMA macrogoal_food_private TO authenticated; GRANT EXECUTE ON FUNCTION public.read_food_search_snapshots_v1(uuid[]),macrogoal_food_private.read_search_snapshots_v1(uuid[]) TO authenticated;');
 for(const target of ['public.read_food_search_snapshots_v1','macrogoal_food_private.read_search_snapshots_v1']) {
  await assert.rejects(()=>asRole('authenticated',`SELECT * FROM ${target}(${arr([uuid(2)])});`),e=>e.code==='42501'&&e.message.includes('service_only'));
 }
 await db.exec('REVOKE EXECUTE ON FUNCTION public.read_food_search_snapshots_v1(uuid[]),macrogoal_food_private.read_search_snapshots_v1(uuid[]) FROM authenticated; REVOKE USAGE ON SCHEMA macrogoal_food_private FROM authenticated;');
 assert.equal((await read([uuid(2)])).rows[0].protected,true);
});

test('actual endpoint hydrates correction committed after ranking RPC using real SQL private lock',async()=>{
 const old=snapshot({id:uuid(2)});
 await db.exec(`UPDATE public.food_items SET calories=80,protein=0,carbs=20,fat=0,fiber=0,macros_per='serving',serving_size=45,serving_description='pieces',serving_count=3 WHERE id='${old.id}';`);
 const admin=adminFor([old],async()=>({data:(await read([old.id])).rows,error:null}));
 const response=await endpoint(admin).handleSearch(new Request('https://local.invalid',{method:'POST',body:JSON.stringify({query:'banana'})}));
 const p=(await response.json()).products[0];
 assert.equal(p._serving_authority,'confirmed_correction');assert.equal(p.serving_size,'3 pieces (45 g)');assert.equal(p.serving_quantity,'45');assert.ok(Math.abs(p.nutriments['energy-kcal_100g']-80*100/45)<1e-12);
});

test('SQL helpers have empty search_path, read-only STABLE flags, invoker wrapper and exact grants',async()=>{
 const rows=(await db.query(`SELECT n.nspname,p.proname,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text,pg_get_userbyid(p.proowner) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('read_search_snapshots_v1','read_food_search_snapshots_v1') ORDER BY p.proname`)).rows;
 assert.equal(rows.length,2);for(const r of rows){assert.equal(r.provolatile,'s');assert.equal(r.owner,'postgres');assert.ok(r.proconfig.some(x=>x==='search_path=""'));assert.ok(!r.proacl.includes('anon=')&&!r.proacl.includes('authenticated=')&&!r.proacl.includes('{=')&&r.proacl.includes('service_role=X'));}
 assert.equal(rows.find(r=>r.nspname==='public').prosecdef,false);assert.equal(rows.find(r=>r.nspname!=='public').prosecdef,true);
 const before=(await db.query('SELECT count(*) AS count FROM public.food_items')).rows[0].count;await read([uuid(1)]);assert.equal((await db.query('SELECT count(*) AS count FROM public.food_items')).rows[0].count,before);
});


test('migration preflight rejects ambient service owner before definitions or grants change',async()=>{
 const definitions=()=>db.query("SELECT pg_get_functiondef(p.oid) AS definition,p.proacl::text AS acl FROM pg_proc p WHERE p.proname IN ('read_search_snapshots_v1','read_food_search_snapshots_v1') ORDER BY p.proname");
 const before=(await definitions()).rows;
 await db.exec('SET ROLE service_role');
 try { await assert.rejects(()=>db.exec(readSql),e=>e.code==='42501'&&e.message.includes('requires_trusted_postgres_owner')); }
 finally {await db.exec('ROLLBACK; RESET ROLE;');}
 assert.deepEqual((await definitions()).rows,before);
});

test('migration preflight rejects application membership in trusted owner role',async()=>{
 await db.exec('GRANT postgres TO authenticated');
 try {await assert.rejects(()=>db.exec(readSql),e=>e.code==='42501'&&e.message.includes('owner_is_application_accessible'));}
 finally {await db.exec('ROLLBACK; REVOKE postgres FROM authenticated;');}
 assert.equal((await read([uuid(2)])).rows[0].protected,true);
});
