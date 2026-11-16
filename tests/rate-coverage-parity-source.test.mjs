import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/rateCoverageParityCandidate.sql',import.meta.url),'utf8');
test('coverage helper is private pure OFF validation, never an acceptance grant',()=>{
 assert.match(sql,/RETURNS jsonb LANGUAGE plpgsql IMMUTABLE/);assert.doesNotMatch(sql,/SECURITY DEFINER|GRANT EXECUTE|INSERT INTO|UPDATE public|DELETE FROM/);
 assert.match(sql,/'acceptanceAuthorized',false/);assert.match(sql,/'statisticalConfidenceEstablished',false/);assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);assert.match(sql,/ROLLBACK;\s*$/);
});
test('coverage helper preserves supported normalization source contracts',()=>{
 assert.match(sql,/2\.2046226218/);assert.match(sql,/offset_minutes/);assert.match(sql,/weight_conflict/);assert.match(sql,/old_at/);assert.match(sql,/interval '30 seconds'/);assert.match(sql,/confirmed<10/);assert.match(sql,/weight_count<8/);
 assert.match(sql,/source_bound_exceeded/);assert.match(sql,/pair_count\/2\]\/2\+slopes\[pair_count\/2\+1\]\/2/);
});
