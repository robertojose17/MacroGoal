const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import fs from 'node:fs';
import path from 'node:path';
export const CANDIDATE=new URL("../nutrition",import.meta.url).pathname;
const schema=JSON.parse(fs.readFileSync(path.join(CANDIDATE,'baseline/schema.json'),'utf8'));
const defs=JSON.parse(fs.readFileSync(path.join(CANDIDATE,'baseline/definitions.json'),'utf8'));
export const lit=v=>v===null?'NULL':typeof v==='boolean'?String(v):typeof v==='number'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'"+(typeof v==='object'?'::jsonb':'');
export async function dbFixture(candidateSql) {
 const db=new PGlite();
 await db.exec(`CREATE ROLE service_role BYPASSRLS;CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA macrogoal_food_private;GRANT USAGE ON SCHEMA macrogoal_food_private TO service_role;`);
 const names=[...new Set(schema.columns.map(c=>c.schema+'.'+c.table))];
 for(const name of names.sort((a,b)=>a==='public.food_items'?-1:b==='public.food_items'?1:0)){
  const cols=schema.columns.filter(c=>c.schema+'.'+c.table===name);
  const ds=cols.map(c=>`${c.name} ${c.type==='ARRAY'?'text[]':c.type}${c.default?' DEFAULT '+c.default:''}${c.nullable==='NO'?' NOT NULL':''}`);
  if(name==='public.food_items')ds.push('PRIMARY KEY(id)');
  await db.exec(`CREATE TABLE ${name} (${ds.join(',')});`);
 }
 for(const c of schema.constraints){if(c.table.endsWith('.usda_portions'))continue;await db.exec(`ALTER TABLE ${c.table} ADD ${c.definition};`);}
 for(const name of names.filter(n=>n.startsWith('macrogoal_food_private.')))await db.exec(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;ALTER TABLE ${name} FORCE ROW LEVEL SECURITY;`);
 for(const g of schema.grants.filter(g=>g.grantee==='service_role'&&g.table_name!=='usda_portions'))await db.exec(`GRANT ${g.privilege_type} ON ${g.table_schema}.${g.table_name} TO service_role;`);
 await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON public.food_items TO service_role,authenticated,anon;');
 for(const name of ['nutrition_snapshot_v1','guard_food_nutrition_v1','audit_food_nutrition_v1','record_food_nutrition_evidence_v1']){
  const d=defs.find(d=>d.proname===name);if(d)await db.exec(d.definition);
 }
 for(const t of schema.triggers)await db.exec(t);
 await db.exec('REVOKE ALL ON FUNCTION public.record_food_nutrition_evidence_v1(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.record_food_nutrition_evidence_v1(uuid,integer,jsonb) TO service_role;');
 if(candidateSql){await db.exec(fs.readFileSync(candidateSql,'utf8'));await db.exec(fs.readFileSync(new URL('../../sql/02-off-registry/off-mass.CANDIDATE.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../../sql/03-search/search-snapshots.CANDIDATE.sql',import.meta.url),'utf8'));}
 return db;
}
export async function seed(db,values={}) {
 await db.exec('RESET ROLE');
 const v={name:'Bananas, raw',source:'usda',usda_fdc_id:'173944',source_id:'173944',macros_per:'100g',serving_size:100,serving_unit:'g',verified:true,calories:89,protein:1.09,carbs:22.84,fat:.33,...values};
 const r=await db.query(`INSERT INTO public.food_items(${Object.keys(v).join(',')}) VALUES(${Object.values(v).map(lit).join(',')}) RETURNING id`);
 return r.rows[0].id;
}
export async function row(db,id) {await db.exec('RESET ROLE');return (await db.query(`SELECT to_jsonb(f) AS row FROM public.food_items f WHERE id=${lit(id)}::uuid`)).rows[0].row;}
