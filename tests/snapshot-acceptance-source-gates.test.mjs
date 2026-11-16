/** Source assertions only. They do not execute SQL or prove live acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../release-candidates/tdee-adaptive-review/snapshotAcceptanceMacroHardeningCandidate.sql',import.meta.url),'utf8');
test('rollback-only SQL candidate rejects unimplemented rate evidence before target writes',()=>{
 const gate=sql.indexOf("IF policy.engine_version='rate-review-14d-v1' OR p.payload ? 'rateEvidence' THEN");
 assert.ok(gate>0);
 assert.ok(sql.indexOf("'rate_acceptance_contract_unavailable'",gate)>gate);
 assert.ok(gate<sql.indexOf("target:=p.payload->'target'"));
 assert.match(sql,/ROLLBACK;\s*$/);
 assert.match(sql,/e7dc77b7470a63bc1f079a3b1de0d3a2/);
});
test('source candidate uses requested 19+ adult floor without relaxing reviewed nutrition gate',()=>{
 assert.match(sql,/today-interval '19 years'/);
 assert.doesNotMatch(sql,/today-interval '18 years'/);
 assert.match(sql,/nutrition_review/);
 assert.match(sql,/individual_deficit_review_required/);
});
