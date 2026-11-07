import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const root=new URL('./fixtures/',import.meta.url);
export async function fixture(){
 const schema=JSON.parse(await readFile(new URL('schema.json',root),'utf8'));
 const defs=JSON.parse(await readFile(new URL('definitions.json',root),'utf8'));
 const db=new PGlite();
 await db.exec(`CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE SCHEMA macrogoal_food_private;GRANT USAGE ON SCHEMA macrogoal_food_private TO service_role;`);
 for(const table of ['food_items','nutrition_current','nutrition_changes','nutrition_evidence','nutrition_write_context']){
  const cols=schema.columns.filter(c=>c.table===table), ns=cols[0].schema;
  let fields=cols.map(c=>`"${c.name}" ${c.udt==='_text'?'text[]':c.udt}${c.default?' DEFAULT '+c.default:''}${c.nullable==='NO'?' NOT NULL':''}`);
  const pk=table==='food_items'?'id':table==='nutrition_current'?'food_id':table==='nutrition_write_context'?'backend_pid,transaction_id':'food_id,revision';
  fields.push('PRIMARY KEY('+pk+')');
  await db.exec(`CREATE TABLE ${ns}.${table}(${fields.join(',')});ALTER TABLE ${ns}.${table} ENABLE ROW LEVEL SECURITY;ALTER TABLE ${ns}.${table} FORCE ROW LEVEL SECURITY;`);
 }
 for(const d of defs) await db.exec(d.definition+';');
 for(const t of schema.triggers)await db.exec(t+';');
 await db.exec(`GRANT SELECT,INSERT,UPDATE ON public.food_items TO service_role;GRANT SELECT,INSERT,UPDATE ON macrogoal_food_private.nutrition_current TO service_role;GRANT SELECT,INSERT ON macrogoal_food_private.nutrition_changes,macrogoal_food_private.nutrition_evidence,macrogoal_food_private.nutrition_write_context TO service_role;REVOKE ALL ON ALL FUNCTIONS IN SCHEMA macrogoal_food_private FROM PUBLIC,anon,authenticated;CREATE TABLE public.synthetic_diary(id integer PRIMARY KEY,food_id uuid,snapshot jsonb);`);
 await db.exec(await readFile(new URL('../../../release-candidates/food-catalog/sql/01-nutrition/enrichment.CANDIDATE.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../release-candidates/food-catalog/sql/02-off-registry/off-mass.CANDIDATE.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../release-candidates/food-catalog/sql/03-search/search-snapshots.CANDIDATE.sql',import.meta.url),'utf8'));
 return db;
}
export const lit=x=>x===null?'NULL':typeof x==='number'?String(x):"'"+(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")+"'"+(typeof x==='object'?'::jsonb':'');
export const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
