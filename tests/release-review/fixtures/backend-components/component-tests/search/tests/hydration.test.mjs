import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateSearchRows, searchNutriments, serializeSearchProduct, snapshot, row, uuid, adminFor } from './fixtures.mjs';

test('batch exact IDs; coherent current tuple replaces stale projection, input order unchanged', async () => {
 const old = snapshot(), changed = snapshot({ calories: 80, protein: 0, carbs: 20, fat: 0, fiber: 0, macros_per: 'serving', serving_size: 45, serving_description: 'pieces', serving_count: 3 });
 const second = snapshot({ id: uuid(2), name: 'Banana, fresh' });
 const admin = adminFor([], [row(second), row(changed, true)]);
 const out = await hydrateSearchRows([old, second, old], admin);
 assert.deepEqual(out.map(x => x.row.id), [old.id, second.id, old.id]);
 assert.deepEqual(out[0], { row: changed, authority: 'confirmed_correction' });
 assert.deepEqual(admin.calls[0].args, { p_food_ids: [old.id, second.id] });
 assert.equal(old.calories, 89);
});

test('input markers/private fields cannot grant authority or enter allowlisted snapshot', async () => {
 const old = snapshot({ _serving_authority: 'confirmed_correction', protected: true, ai_verified: true, user_id: 'secret' });
 const current = snapshot({ user_id: 'secret', ai_verified_source: 'secret', _serving_authority: 'confirmed_correction' });
 const [out] = await hydrateSearchRows([old], adminFor([], [row(current, false)]));
 assert.equal(out.authority, 'known');
 for (const key of ['user_id', 'ai_verified_source', '_serving_authority', 'protected', 'ai_verified']) assert.equal(out.row[key], undefined);
 const [unknown] = await hydrateSearchRows([old], adminFor([], []));
 assert.equal(unknown.authority, 'unknown');
});

for (const [name, current] of [
 ['missing/deleted', []], ['duplicate', [row(snapshot(), true), row(snapshot(), false)]],
 ['wrong binding', [row(snapshot({id:uuid(2)}), true)]],
 ['mismatched nested binding', [{id:uuid(1), snapshot:snapshot({id:uuid(2)}), protected:true}]],
 ['missing field', [{id:uuid(1), snapshot:{...snapshot(), macros_per:undefined}, protected:true}]],
 ['missing macro', [row(snapshot({calories:null}), true)]],
 ['invalid serving', [row(snapshot({serving_size:0}), true)]],
 ['invalid boolean', [{...row(snapshot()), protected:'false'}]],
 ['absent authority', [{id:uuid(1),snapshot:snapshot()}]],
 ['array snapshot', [{id:uuid(1),snapshot:[],protected:true}]],
]) test('conservative fallback: ' + name, async () => {
 const original = snapshot(); const [out] = await hydrateSearchRows([original], adminFor([], current));
 assert.equal(out.authority, 'unknown'); assert.deepEqual(out.row, original);
});

test('unknown/malformed entry does not poison other requested IDs', async () => {
 const first=snapshot(), second=snapshot({id:uuid(2)});
 const out=await hydrateSearchRows([first,second],adminFor([],[row(first),{id:second.id,protected:true},row(snapshot({id:uuid(9)}),true)]));
 assert.equal(out[0].authority,'known'); assert.equal(out[1].authority,'unknown');
});

test('timeout and outer abort are bounded even for noncooperative dependency', async () => {
 const admin=adminFor([],()=>new Promise(()=>{})); const start=Date.now();
 assert.equal((await hydrateSearchRows([snapshot()],admin,undefined,10))[0].authority,'unknown');
 assert.ok(Date.now()-start<300); assert.ok(admin.calls[0].signal.aborted);
 const controller=new AbortController(); const pending=hydrateSearchRows([snapshot()],admin,controller.signal,250); controller.abort();
 assert.equal((await pending)[0].authority,'unknown');
 const before=admin.calls.length; await hydrateSearchRows([snapshot()],admin,controller.signal); assert.equal(admin.calls.length,before);
});

test('errors and rejected reads preserve useful projection, max100 exact IDs only', async () => {
 for(const response of [()=>Promise.reject(new Error('secret')),()=>Promise.resolve({data:[row(snapshot(),true)],error:{message:'secret'}})]) {
  assert.equal((await hydrateSearchRows([snapshot()],adminFor([],response)))[0].authority,'unknown');
 }
 const admin=adminFor([],[]); const out=await hydrateSearchRows(Array.from({length:120},(_,i)=>snapshot({id:uuid(i+1)})),admin);
 assert.equal(out.length,100); assert.equal(admin.calls[0].args.p_food_ids.length,100);
});

test('unknown serialization removes enrichment only after dedupe identity has been used', () => {
 const product={_db_id:uuid(1),_usda_fdc_id:'123',_db_row:{user_id:'secret'},_portion_evidence:{bad:true},_serving_authority:'confirmed_correction',serving_quantity:'45'};
 const out=serializeSearchProduct(product,true); assert.deepEqual(out,{_db_id:uuid(1),serving_quantity:'45'}); assert.equal(product._usda_fdc_id,'123');
});

test('nutriment sanitization distinguishes null/missing/true zero and excludes payload objects', () => {
 assert.deepEqual(searchNutriments({'iron_100g':null,'sodium_100g':0,'calcium_100g':'0','secret':123,'bad_100g':{},'fiber_100g':'','fat_serving':4,'proteins_100g':-1}),{'sodium_100g':0,'calcium_100g':0});
});
