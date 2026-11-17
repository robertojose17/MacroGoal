import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
const read=n=>fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/'+n,import.meta.url),'utf8');
const issuer=read('rules14IssuerCandidate.sql'),storage=read('rules14StorageCandidate.sql');
test('v1 index retained and v2 has isolated null-safe scope index and profile digest',()=>{
 assert.match(issuer,/CREATE UNIQUE INDEX rate_proposal_source_scope_unique[\s\S]*screeningEvidence,requestId/);
 assert.match(issuer,/CREATE UNIQUE INDEX rate_proposal_observed_v2_source_scope_unique/);
 assert.match(issuer,/NULLS NOT DISTINCT WHERE record#>>'\{payload,contract\}'='explicit-rules14-acceptance-v2'/);
 for(const key of ['source_request_id,source_goal_id','goalSnapshot,id','goalSnapshot,updated_at','profileUpdatedAt','policyBinding,version','policyBinding,digest','policyBinding,revision','sourceFingerprint','sourceCapturedAt','profile_support_digest_v2'])assert.ok(issuer.includes(key),key);
});
test('exact historical replay precedes v2-only new issuance and source dedupe never uses screening',()=>{
 const fn=issuer.split('CREATE FUNCTION tdee_rules14_private.issue_proposal')[1];
 assert.ok(fn.indexOf('existing.record IS DISTINCT FROM p_record')<fn.indexOf('rules14_observed_v2_required'));
 assert.ok(fn.indexOf('rules14_observed_v2_required')<fn.indexOf('validate_rate_proposal_locked('));
 const dedupe=fn.split(' IF EXISTS(')[1].split("'already_prepared'")[0];
 assert.ok(dedupe.includes('profile_support_digest_v2'));assert.ok(dedupe.includes("p.record#>'{payload,profileSupport}'=p_record#>'{payload,profileSupport}'"));assert.ok(!dedupe.includes('screeningEvidence'));
 assert.ok(fn.includes('v_proposal_id uuid'));assert.ok(fn.includes('IF NOT false THEN'));
});
test('storage keeps v1 contract and accepts only explicit v2 engine/support envelope without screening',()=>{
 assert.match(storage,/CHECK\(\(record#>>'\{payload,contract\}' IS NOT DISTINCT FROM 'explicit-rules14-acceptance-v1'\) OR/);
 for(const x of ['explicit-rules14-acceptance-v2','rules14-observed-v2',"jsonb_typeof(record#>'{payload,profileSupport}') IS NOT DISTINCT FROM 'object'", "NOT ((record->'payload') ? 'screeningEvidence')"])assert.ok(storage.includes(x),x);
 for(const x of ['immutable_rate_proposal','immutable_rate_receipt','ENABLE ROW LEVEL SECURITY','rate_receipt_request_fk'])assert.ok(storage.includes(x));
});
