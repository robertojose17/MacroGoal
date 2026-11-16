import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {energyParityFixtures} from './rate-energy-parity-fixtures.mjs';
test('canonical TS provides36synthetic differential fixtures, never operational records',()=>{
 const cases=energyParityFixtures();assert.equal(cases.length,36);assert.equal(new Set(cases.map(c=>c.name)).size,36);
 assert.equal(cases.find(c=>c.name==='positive_capped_step').expected.deltaKcal,200);
 assert.equal(cases.find(c=>c.name==='nondividing_increment').expected.deltaKcal,180);
 assert.equal(cases.find(c=>c.name==='coverage_hold').expected.status,'no_change');
 assert.equal(cases.find(c=>c.name==='reduction_blocked').expected.reason,'individual_deficit_review_required');
 for(const c of cases){assert.equal(c.expected.actionable,false);assert.equal(c.expected.acceptanceAuthorized,false);}
});
test('SQL layer is immutable private revoked rollback-only and cannot mutate or accept',()=>{
 const sql=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/rateEnergyParityCandidate.sql',import.meta.url),'utf8');
 assert.match(sql,/IMMUTABLE SECURITY INVOKER/);assert.match(sql,/ROLLBACK;\s*$/);assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE public|DELETE FROM|GRANT EXECUTE|accept_proposal\()\b/i);
 assert.match(sql,/normalization_coverage_macro_and_acceptance_unverified/);
});
