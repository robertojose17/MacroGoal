import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {verifyRules14AcceptanceChain} from '../release-candidates/tdee-adaptive-review/rules14AcceptanceChain.ts';
import {rules14Digest} from '../release-candidates/tdee-adaptive-review/rules14Proposal.ts';
import {canonicalRateJson} from '../release-candidates/tdee-adaptive-review/rateProposalRecord.ts';
const load=n=>JSON.parse(fs.readFileSync(new URL('./frozen-rules14/'+n+'.json',import.meta.url),'utf8'));
async function resign(c){for(const row of c.rows){const p=row.proposal,{digest,canonicalContent,...pu}=p;p.canonicalContent=canonicalRateJson(pu);p.digest=await rules14Digest(p.canonicalContent);const r=row.receipt;r.request.rateProposalDigest=p.digest;const {receiptDigest,canonicalContent:rc,...ru}=r;r.canonicalContent=JSON.stringify(ru);r.receiptDigest=await rules14Digest(r.canonicalContent);}return c;}
test('immutable historical v1 increase/decrease still verify without upgrading or stripping screening',async()=>{
 for(const dir of ['increase','decrease']){const c=load('legacy-'+dir),before=JSON.stringify(c);const r=await verifyRules14AcceptanceChain(c,c.capturedAt);assert.equal(r.kind,'rules14_chain_verified');assert.equal(r.acceptedCount,1);assert.equal(JSON.stringify(c),before);assert.equal(c.rows[0].proposal.payload.contract,'explicit-rules14-acceptance-v1');}
});
test('historical v1 screened evidence remains required even if proposal/receipt are rehashed',async()=>{
 for(const mutate of [c=>delete c.rows[0].proposal.payload.screeningEvidence,c=>c.rows[0].proposal.payload.screeningEvidence.response='unsure',c=>c.rows[0].receipt.acceptanceEvidence.screeningVersion=99,c=>c.rows[0].proposal.payload.contract='explicit-rules14-acceptance-v2']){const c=load('legacy-increase');mutate(c);await resign(c);await assert.rejects(verifyRules14AcceptanceChain(c,c.capturedAt),/rules14_receipt_chain_unverified/);}
});
test('frozen mixed histories retain original per-row contracts and ordered receipt lineage',async()=>{
 for(const n of ['mixed-legacy','mixed-actual-v2-chain']){const raw=load(n),c=raw.source??raw.chain??raw;const before=JSON.stringify(c),r=await verifyRules14AcceptanceChain(c,c.capturedAt);assert.equal(r.acceptedCount,c.totalCount);assert.equal(JSON.stringify(c),before);}
});
