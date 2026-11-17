import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const sql=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/rules14IssuerCandidate.sql',import.meta.url),'utf8');
const fn=sql.split('CREATE FUNCTION tdee_rules14_private.issue_proposal')[1].split('END $fn$;')[0];
test('issuer local proposal identifier cannot collide with users/proposals id columns',()=>{
 assert.match(fn,/v_proposal_id uuid/);assert.doesNotMatch(fn,/(?:;|DECLARE\s+)\s*id\s+uuid/i);
 assert.match(fn,/PERFORM 1 FROM public\.users WHERE id=p_owner FOR UPDATE/);
 assert.match(fn,/v_proposal_id:=\(p_record->>'id'\)::uuid/);
 assert.match(fn,/p\.id=v_proposal_id/);assert.doesNotMatch(fn,/p\.id=id\b/);
 assert.equal((fn.match(/VALUES\(p_owner,v_proposal_id,/g)||[]).length,2);
 assert.match(fn,/proposals\(owner_id,id,anchor_version/);
});
test('identifier repair preserves exact record replay, shared admission, expiry and default OFF guard',()=>{
 for(const fragment of ['existing.record IS DISTINCT FROM p_record','validate_rate_proposal_locked(p_owner,p_record,at_time)',"admission->>'status' IS DISTINCT FROM 'validated'","floor(extract(epoch FROM clock_timestamp())*1000)>=(p_record->>'expiresAt')::bigint",'IF NOT false THEN'])assert.ok(sql.includes(fragment),fragment);
 assert.doesNotMatch(sql,/#variable_conflict|SET\s+(?:LOCAL\s+)?plpgsql\.variable_conflict/i);
});
test('SQL negative-path regression asserts random owner absence and exact account rejection without impersonation',()=>{
 const negative=fs.readFileSync(new URL('./rules14-issuer-missing-owner-rollback.sql',import.meta.url),'utf8');
 assert.match(negative,/u\.id=missing_owner/);assert.match(negative,/valid_content\(record_value/);assert.match(negative,/issue_proposal\(missing_owner,record_value\)/);
 assert.match(negative,/SQLSTATE '42501'/);assert.match(negative,/SQLERRM IS DISTINCT FROM 'account_unavailable'/);assert.match(negative,/ROLLBACK;/);
 assert.doesNotMatch(negative,/set_config|request\.jwt|SET ROLE|INSERT INTO|UPDATE public|DELETE FROM/i);
});
