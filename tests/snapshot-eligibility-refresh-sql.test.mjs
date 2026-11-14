import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../release-candidates/tdee-adaptive-review/snapshotEligibilityRefreshWriter.sql',import.meta.url),'utf8');
const tail=readFileSync(new URL('../release-candidates/tdee-adaptive-review/snapshotEligibilityRefreshRollback.sql',import.meta.url),'utf8');
test('writer modifies only private eligibility and never calibration',()=>{
 const inserts=[...sql.matchAll(/INSERT INTO ([a-z_\.]+)/g)].map(x=>x[1]);
 assert.deepEqual(inserts,['macrogoal_snapshot_review_private.eligibility']);
 assert.doesNotMatch(sql,/UPDATE (?:public\.|macrogoal_snapshot_review_private\.)/);
 assert.doesNotMatch(sql,/DELETE FROM|TRUNCATE|GRANT /);
});
test('service-only guards private and wrapper with no client grants',()=>{
 assert.equal((sql.match(/MESSAGE='issuer_required'/g)||[]).length,2);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.tdee_refresh_snapshot_eligibility_v1/);
 assert.match(sql,/SECURITY INVOKER/);
});
test('profile goal policy anchor are locked and full snapshots compared',()=>{
 for(const x of ['profile_changed','goal_changed','anchor_changed','safety_review_required'])assert.ok(sql.includes(x));
 assert.match(sql,/to_jsonb\(a\) IS DISTINCT FROM p_record->'expectedAnchorSnapshot'/);
 assert.match(sql,/to_jsonb\(g\) IS DISTINCT FROM p_record->'expectedGoalSnapshot'/);
 assert.match(sql,/a.journey_binding IS DISTINCT FROM jb/);
 assert.equal((sql.match(/FOR UPDATE/g)||[]).length,3);
});
test('fresh capture bounded TTL and actual attestation rechecked',()=>{
 assert.match(sql,/interval '5 minutes'/);assert.equal((sql.match(/snapshot_time_valid/g)||[]).length,2);
 assert.equal((sql.match(/FROM macrogoal_readiness_private.attestations/g)||[]).length,2);
 assert.match(sql,/t.accepted_at<=at_time/);assert.match(sql,/source_expired_or_readiness_changed/);
});
test('rollback suite is never persistent and contains all requested failures',()=>{
 assert.match(tail,/ROLLBACK;\s*-- Verify separately/);assert.doesNotMatch(tail,/^COMMIT;/m);
 for(const x of ['tester_access','anchor_changed','goal_changed','safety_review_required','eligibility_expired','readiness_changed','issuer_required'])assert.ok(tail.includes(x));
 assert.match(tail,/canonical digest mismatch/);assert.match(tail,/no goal\/anchor writes/);
 assert.doesNotMatch(tail,/UPDATE .*tester|INSERT INTO .*tester/);
});
