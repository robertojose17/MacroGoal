import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {rulesFixture,actor,now,id} from './rules14-fixture.mjs';
import {prepareRules14Proposal} from '../release-candidates/tdee-adaptive-review/rules14Proposal.ts';
import {runRules14ForReview} from '../release-candidates/tdee-adaptive-review/rules14Runtime.ts';
test('expired policy at boundary or before denies recommendation with no issuer or legacy fallback',async()=>{
 for(const expiry of [now,now-1]){const x=rulesFixture();x.policy.expires_at=new Date(expiry).toISOString();x.snapshot.policy=x.policy;
 assert.notEqual((await prepareRules14Proposal(x,actor,id,now)).kind,'rules14_record_prepared');
 const calls=[];const r=await runRules14ForReview(actor,{now:()=>now,newProposalId:()=>id,rpc:async name=>{calls.push(name);return x;}});
 assert.equal(r.proposal,null);assert.equal(r.mayHaveWritten,false);assert.deepEqual(calls,['tdee_internal_rules14_source_v1']);}
});
test('SQL expiry gates are preserved in selection and atomic final acceptance',()=>{
 const read=name=>fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/'+name,import.meta.url),'utf8');
 const s=read('rules14SelectorCandidate.sql');assert.match(s,/IF NOT EXISTS\(SELECT 1 FROM tdee_rules14_private.policy_versions\) THEN RETURN NULL;END IF;/);
 assert.match(s,/WHERE decision='enabled' AND expires_at>at_time/);assert.match(s,/IF n<>1 THEN RETURN NULL;END IF;/);
 assert.match(read('rules14AtomicWriterCandidate.sql'),/policy.expires_at<=at_time/);
});

