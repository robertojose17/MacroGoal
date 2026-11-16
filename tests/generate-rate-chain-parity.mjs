/** Synthetic JSON only. Supply existing source tree root; never inserts operational rows. */
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.argv[2]??path.resolve(import.meta.dirname,'..');
const original=fs.readFileSync(path.join(root,'tests/rate-acceptance-chain.test.mjs'),'utf8');
const fixtureSource=original.slice(0,original.indexOf("test('synthetic"))+ '\nexport {fixture,reseal};\n';
const temp=path.join(root,'tests/.chain-parity-fixture-temp.mjs');fs.writeFileSync(temp,fixtureSource);
let fixture,reseal;try{({fixture,reseal}=await import(pathToFileURL(temp)));}finally{fs.unlinkSync(temp);}
const {verifyRateAcceptanceChain}=await import(pathToFileURL(path.join(root,'release-candidates/tdee-adaptive-review/rateAcceptanceChain.ts')));
const cases=[];const add=async(name,mutate,count=2,rehashed=false)=>{const {value,now}=await fixture(count);if(mutate)mutate(value);if(rehashed){await reseal(value.rows.at(-1));value.currentGoal=structuredClone(value.rows.at(-1).receipt.acceptedGoalSnapshot);}let expected;try{expected=await verifyRateAcceptanceChain(value,now);}catch{expected={kind:'blocked',reason:'rate_receipt_chain_unverified',actionable:false,acceptanceAuthorized:false};}cases.push({name,value,now,expected});};
for(const n of [0,1,2])await add(`positive-${n}`,null,n);
for(const [name,mutate] of Object.entries({
 reversed:v=>v.rows.reverse(),missing:v=>v.rows.pop(),count:v=>v.totalCount++,empty:v=>{v.rows=[];v.totalCount=0;},
 currentGoal:v=>v.currentGoal.protein_g++,restart:v=>v.currentJourneyRestartCount++,profile:v=>v.currentProfileBinding='b'.repeat(64),owner:v=>v.ownerId='12345678-1111-4111-8111-111111111111',anchorVersion:v=>v.anchorHead.version++,
 proposalBytes:v=>v.rows[0].proposal.canonicalContent+=' ',receiptBytes:v=>v.rows[0].receipt.canonicalContent+=' ',previousGoal:v=>v.rows[1].receipt.previousGoalSnapshot.macro_preset='low_carb',sourceBinding:v=>v.rows[1].receipt.acceptanceEvidence.sourceCapturedAt--,
 sourceStale:v=>v.capturedAt-=30001,unknownStatus:v=>v.rows[1].receipt.status='unknown',missingSource:v=>delete v.capturedAt,missingAnchorField:v=>delete v.anchorHead.anchor.acceptedAt,
 }))await add(name,mutate);
for(const [name,mutate] of Object.entries({
 net:r=>{r.receipt.netDeltaKcal=300;r.proposal.payload.netDeltaKcal=300;},cadence:r=>r.receipt.acceptedAt-=86400000,cap:r=>r.proposal.payload.policySnapshot.max_cumulative_delta_kcal=300,reduction:r=>{r.receipt.deltaKcal=-200;r.proposal.payload.deltaKcal=-200;},stableGoal:r=>r.receipt.acceptedGoalSnapshot.goal_type='gain',base:r=>r.receipt.acceptedGoalSnapshot.base_daily_calories=2200,previousHash:r=>r.receipt.previousReceiptDigest='b'.repeat(64),expired:r=>r.proposal.expiresAt=r.receipt.acceptedAt,
 policyDisabled:r=>r.proposal.payload.policySnapshot.enabled=false,unknownEngine:r=>r.proposal.payload.policySnapshot.engine_version='other',missingReview:r=>delete r.proposal.payload.reviewedRate,invalidIncrement:r=>r.proposal.payload.policySnapshot.increment_kcal=0,invalidReview:r=>r.proposal.payload.reviewedRate.uncertainty.validated=false,macro:r=>r.receipt.acceptedGoalSnapshot.protein_g++,encoding:r=>r.receipt.canonicalEncoding='unknown',
 }))await add(name,v=>mutate(v.rows.at(-1)),2,true);
for(const field of ['acceptedAt','earliestReviewAt','baselineIntakeKcal','acceptedCount','acceptedDeltaKcal','lastAcceptedAt','sourceReceipt','initialGoalRevision','profileBinding','journeyBinding'])await add('anchor-missing-'+field,v=>delete v.anchorHead.anchor[field]);
for(const field of ['acceptedAt','earliestReviewAt','baselineIntakeKcal','acceptedCount','acceptedDeltaKcal'])await add('anchor-string-'+field,v=>v.anchorHead.anchor[field]=String(v.anchorHead.anchor[field]));
for(const field of ['netDeltaKcal','deltaKcal','acceptedAt','sequence'])await add('receipt-string-'+field,v=>v.rows[1].receipt[field]=String(v.rows[1].receipt[field]),2,true);
const sql=`DO $parity$ DECLARE c jsonb;actual jsonb;n int:=0;BEGIN FOR c IN SELECT value FROM jsonb_array_elements($fixtures$${JSON.stringify(cases)}$fixtures$::jsonb) LOOP actual:=tdee_rate_record_private.verify_chain(c->'value',(c->>'now')::bigint);IF actual IS DISTINCT FROM c->'expected' THEN RAISE EXCEPTION 'chain parity mismatch % actual % expected %',c->>'name',actual,c->'expected';END IF;n:=n+1;END LOOP;RAISE NOTICE 'chain parity % passed',n;END $parity$;\n`;
fs.writeFileSync(path.join(import.meta.dirname,'rate-chain-parity.sql'),sql);fs.writeFileSync(path.join(import.meta.dirname,'rate-chain-fixtures.json'),JSON.stringify(cases,null,2));console.log(`Generated ${cases.length} differential cases; no database action.`);
