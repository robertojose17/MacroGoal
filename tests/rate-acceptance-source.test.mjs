/** Static SQL contract checks, not SQL compilation or enabled acceptance proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../release-candidates/tdee-adaptive-review/rateAcceptanceBindingCandidate.sql',import.meta.url),'utf8');
test('binding inspector remains private rollback-only and never authorizes acceptance',()=>{
 assert.match(sql,/ROLLBACK;\s*$/);assert.match(sql,/'acceptanceAuthorized',false/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/auth.uid\(\) IS DISTINCT FROM p_actor/);
 assert.doesNotMatch(sql,/UPDATE public.goals|INSERT INTO public.goals|CREATE OR REPLACE FUNCTION .*accept_proposal/);
});
test('latest-row lookup cannot fall back to older reviewed evidence; lock ordering matches owner serialization',()=>{
 const select=sql.indexOf('SELECT * INTO r');
 assert.ok(sql.indexOf('FROM public.users WHERE id=p_actor FOR UPDATE')<select);
 assert.match(sql,/ORDER BY review_version DESC LIMIT 1 FOR SHARE/);
 assert.ok(sql.indexOf("r.decision IS DISTINCT FROM 'reviewed'")>select);
 assert.match(sql,/evidence IS DISTINCT FROM expected/);
});
test('timestamp validation rejects absent future nonfinite data and preserves millisecond wire precision',()=>{
 assert.match(sql,/\(p_snapshot->>'capturedAt'\) IS NULL/);
 assert.match(sql,/\(p_snapshot->>'capturedAt'\)::timestamptz>n/);
 assert.match(sql,/NOT isfinite\(\(p_policy->>'expires_at'\)::timestamptz\)/);
 assert.match(sql,/floor\(extract\(epoch FROM r.source_captured_at\)\*1000\)/);
 assert.match(sql,/date_trunc\('milliseconds',r.source_captured_at\)/);
});
