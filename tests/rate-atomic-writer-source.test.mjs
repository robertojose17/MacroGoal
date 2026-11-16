import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/rateAtomicWriterCandidate.sql',import.meta.url),'utf8');
test('new own-only wrapper literalOFF and existing legacy acceptor untouched',()=>{
 assert.match(sql,/DECLARE actor uuid:=tdee_rate_record_private.assert_rate_request\(p_request\)/);
 assert.match(sql,/IF NOT false THEN RETURN jsonb_build_object\('enabled',false/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.tdee_accept_rate_proposal_v1\(jsonb\) TO authenticated/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION.*accept_proposal\(/);
 assert.match(sql,/ROLLBACK;\s*$/);
});
test('owner lock exact replay fullgoalCAS and one transaction for all effects',()=>{
 const lock=sql.indexOf('FROM public.users WHERE id=actor FOR UPDATE'),replay=sql.indexOf('read_exact_request(actor'),write=sql.indexOf('UPDATE public.goals SET');assert.ok(lock<replay&&replay<write);
 assert.match(sql,/to_jsonb\(goals\)=to_jsonb\(g\)/);assert.match(sql,/GET DIAGNOSTICS changed_count=ROW_COUNT/);
 assert.ok(sql.includes('INSERT INTO tdee_rate_record_private.requests'));assert.ok(sql.includes('INSERT INTO tdee_rate_record_private.receipts'));
 assert.doesNotMatch(sql,/EXCEPTION WHEN OTHERS/);
});
test('actual validators replace supplied proof and atomic poststate is checked',()=>{
 for(const fn of ['read_context(actor)','inspect_rate_coverage_v1(c,actor','inspect_rate_binding_trusted(actor','validate_rate_energy_candidate_v1(energy_input','verify_chain(chain,at_ms)'])assert.ok(sql.includes(fn),fn);
 assert.match(sql,/rate_postwrite_chain_invalid/);assert.match(sql,/tdee_macro_math_private.adjust/);assert.doesNotMatch(sql,/smart_macro_sql_parity_unverified/);assert.match(sql,/source_ms>at_ms/);
 assert.match(sql,/'canonicalEncoding','pg-jsonb-v1'/);assert.match(sql,/receipt_content:=unsigned_receipt::text/);assert.match(sql,/sha256\(convert_to\(receipt_content,'UTF8'\)\)/);
});
test('subsequent energy path verifies actualchain rather than accepting a flag',()=>{
 const energy=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/rateEnergyParityCandidate.sql',import.meta.url),'utf8');
 assert.match(energy,/tdee_rate_record_private.verify_chain\(i->'chainSource'/);assert.match(energy,/verified_chain->'acceptedDeltaKcal'/);assert.match(energy,/chain_goal->'daily_calories' IS DISTINCT FROM g->'calories'/);
});
test('reviewed limit fields and managed expiry guards remain exact and null-safe',()=>{
 assert.match(sql,/'fatsMaxG',nr.fats_max_g,'fatMinFraction',nr.fat_min_fraction/);
 assert.match(sql,/jsonb_typeof\(final_access->'validUntil'\) IS DISTINCT FROM 'number'/);
 assert.match(sql,/policy.enabled IS DISTINCT FROM true OR policy.reviewed IS DISTINCT FROM true OR policy.snapshot_contract_reviewed IS DISTINCT FROM true/);
});

test('shared admission has no effects and explicit-owner binding stays private',()=>{
 const helper=sql.split('CREATE FUNCTION tdee_rate_record_private.validate_rate_proposal_locked')[1].split('CREATE FUNCTION tdee_rate_record_private.accept_rate_proposal')[0];
 assert.doesNotMatch(helper,/INSERT INTO|UPDATE public.goals|DELETE FROM/);
 assert.match(helper,/FROM public.users WHERE id=actor FOR UPDATE/);
 assert.match(helper,/REVOKE ALL ON FUNCTION tdee_rate_record_private.validate_rate_proposal_locked/);
 assert.match(sql,/admission_result:=tdee_rate_record_private.validate_rate_proposal_locked\(actor,p.record,at_time\)/);
});

test('both macro modes use actual stored review and choice in shared allocator',()=>{
 assert.match(sql,/trusted_macro:=jsonb_build_object\('binding',mb,'current',energy_input->'current','review',expected_review,'limits',expected_limits,'customChoice',expected_choice\)/);
 assert.match(sql,/'context',trusted_macro/);
 assert.match(sql,/allocation->'target' IS DISTINCT FROM target OR allocation->'allocationMode' IS DISTINCT FROM payload->'allocationMode'/);
 assert.match(sql,/IF mc.mode='preserve_percent' THEN/);
});
