// Structural contract regression tests; NOT a PostgreSQL execution substitute.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
const sql=fs.readFileSync([new URL('./selected-nutrition-snapshots.sql',import.meta.url),new URL('../supabase/proposed/selected-nutrition-snapshots.sql',import.meta.url)].find(p=>fs.existsSync(p)),'utf8');
test('snapshot path never mutates canonical food or nutrition current',()=>{assert(!/(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:public\.food_items|macrogoal_food_private\.nutrition_current)\b/i.test(sql));});
test('snapshots and receipt stores append only',()=>{assert(!/(?:UPDATE|DELETE FROM|TRUNCATE)\s+macrogoal_food_private\.selected_nutrition_(?:snapshots|receipts)_v1/i.test(sql));});
test('every RPC invoker service gated and client execute revoked',()=>{for(const name of ['claim_selected_nutrition_v1','record_selected_nutrition_v1','record_selected_nutrition_batch_v1']){assert(sql.includes('REVOKE ALL ON FUNCTION public.'+name));}assert.equal((sql.match(/SECURITY INVOKER/g)||[]).length,3);assert.equal((sql.match(/current_user\s*<>\s*'service_role'/g)||[]).length,3);assert(!sql.includes('SECURITY DEFINER'));});
test('all three private stores have RLS',()=>{assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length,3);});
test('bounds include raw, envelope, batch, globals and receipts',()=>{for(const cap of ['262144','524288','8388608','67108864','>=1000','>=10000','>512','>100'])assert(sql.includes(cap));});
test('duplicate digest ignores date but scope retained',()=>{assert(sql.includes("p_evidence-'captured_at'"));assert(sql.includes("capture_scope='detail_response'"));assert(sql.includes("to_jsonb(v_scope='detail_response')"));});
test('missing distinct from explicit zero',()=>{assert(sql.includes("'missing_is_not_zero'"));assert(sql.includes("::numeric<0"));assert(!sql.includes("::numeric<=0"));});
test('detail capture requires source bound expiring claim and revision guard',()=>{for(const token of ['claim_required','food_revision_conflict','request_id_conflict',"interval '2 minutes'","interval '1 minute'",'>=6','>=100'])assert(sql.includes(token));});
test('search batch accepts no detail requests',()=>{assert(sql.includes("'batch_search_only'"));assert(sql.includes("EXCEPTION WHEN SQLSTATE '54000'"));});
test('same content new date dedupes while scope/new nutrients version separately',()=>{
 const h=e=>{const {captured_at,...rest}=e;return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex')};
 const a={capture_scope:'search_response',raw_payload:{fdcId:1},captured_at:'a'};
 assert.equal(h(a),h({...a,captured_at:'b'}));assert.notEqual(h(a),h({...a,capture_scope:'detail_response'}));assert.notEqual(h(a),h({...a,raw_payload:{fdcId:1,changed:0}}));
});
