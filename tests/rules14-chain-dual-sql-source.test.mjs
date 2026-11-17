import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/rules14ChainCandidate.sql',import.meta.url),'utf8');
test('version dispatch is reset for each row and all contract boundaries remain explicit',()=>{
 assert.ok(sql.indexOf('observed_v2:=coalesce')>sql.indexOf('FOR row_value IN SELECT'));
 for(const [v2,v1] of [['explicit-rules14-acceptance-v2','explicit-rules14-acceptance-v1'],['rules14-decision-v2','rules14-decision-v1'],['rules14-observed-acceptance-evidence-v2','rules14-as-of-revalidated-v1'],['profile-adult-observed-v1','screened-adult-general-v1'],['rules14-observed-v2','rules14-v1'],['nutrition-policy-application-v2','nutrition-policy-application-v1']])assert.ok(sql.includes(`CASE WHEN observed_v2 THEN '${v2}' ELSE '${v1}' END`));
 for(const version of ['rules14-proposal-record-v1','rules14-acceptance-receipt-v1','rules14-acceptance-request-v1'])assert.ok(sql.includes(version));
});
test('v1 screening stays mandatory within its own branch',()=>{
 const part=sql.split('IF NOT observed_v2 THEN')[1].split('  ELSE')[0];
 for(const x of ["screen->>'response' IS DISTINCT FROM 'eligible'","e->'screeningRequestId' IS DISTINCT FROM screen->'requestId'","screen->'profileUpdatedAt' IS DISTINCT FROM payload->'profileUpdatedAt'","instant(screen->'acceptedAt')","instant(screen->'expiresAt')"])assert.ok(part.includes(x),x);
});
test('v2 exact profile support binds owner, age, dates, evidence and historical local acceptance day',()=>{
 for(const x of ['ageYears,dateOfBirth,journeyBinding,ownerId,profileBinding,supported,today,version',"e->'profileSupport' IS DISTINCT FROM support","payload ? 'screeningEvidence'","e ?| ARRAY['screeningRequestId','screeningVersion']",'support_age NOT BETWEEN 19 AND 100',"to_char(support_dob,'YYYY-MM-DD')", "support_today IS DISTINCT FROM (to_timestamp((r->>'acceptedAt')", "AT TIME ZONE (e->>'acceptanceTimezone')", "pe ? 'eligibility'", "pe->'ageYears' IS DISTINCT FROM support->'ageYears'"])assert.ok(sql.includes(x),x);
});
test('v2 observed basis refuses confirmed fields and changes calculation and deficit semantics explicitly',()=>{
 for(const x of ['observed_logged_days','averageLoggedCaloriesOnObservedDays','observedDayCount',"logs->>'dataBasis' IS DISTINCT FROM 'observed-logs-v1'", "logs->'completenessEstablished' IS DISTINCT FROM 'false'::jsonb", "logs ?| ARRAY['confirmedDayCount','averageLoggedCaloriesOnConfirmedDays']",'observed-intake-plus-target-minus-observed-v2','rules14-deficit-evidence-v2','observed-intake-minus-observed-rate-v2'])assert.ok(sql.includes(x),x);
});
test('history, integrity, cadence, fresh acceptance, macro and stable-goal guards remain shared',()=>{
 for(const x of ["content_valid(r,'receiptDigest')","content_valid(p,'digest')","payload->'historyBinding' IS DISTINCT FROM jsonb_build_object", "(r->>'acceptedAt')::bigint-(payload->>'sourceCapturedAt')::bigint>30000", "(p->>'expiresAt')::bigint>(payload->>'sourceCapturedAt')::bigint+30000",'tdee_rules14_macro_private.adjust(',"invalid_historical_macro_allocation",'(r->>\'acceptedAt\')::bigint-last_at<(policy->>\'min_days_between_acceptances\')::bigint*86400000','old_goal-mutable IS DISTINCT FROM g-mutable',"req_ids:=req_ids||", "EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('kind','blocked'"])assert.ok(sql.includes(x),x);
});
