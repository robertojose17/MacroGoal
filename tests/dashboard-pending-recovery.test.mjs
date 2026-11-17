import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {rulesFixture,actor,now,id} from './rules14-fixture.mjs';
import {prepareRules14Proposal} from '../release-candidates/tdee-adaptive-review/rules14Proposal.ts';
import {createRules14ProposalController} from '../utils/rules14ProposalController.ts';
import {createRules14RequestJournal} from '../utils/rules14AcceptanceJournal.ts';
import {rules14DashboardActionAllowed} from '../utils/rules14DashboardPolicy.ts';
const sha=async s=>createHash('sha256').update(s).digest('hex');
test('actual durable pending survives no attention, Free downgrade and remount; status only until verified Premium retry',async()=>{
 const result=await prepareRules14Proposal(rulesFixture(),actor,id,now);assert.equal(result.kind,'rules14_record_prepared');
 const map=new Map(),journal=createRules14RequestJournal({project:'synthetic-project',newGeneration:randomUUID,digest:sha,storage:{get:async k=>map.get(k)??null,set:async(k,v)=>map.set(k,v),remove:async k=>map.delete(k)}}),calls=[];
 const p={actor,now:()=>now,requestId:randomUUID,isCurrent:()=>true,digestText:sha,journal,offer:async()=>{calls.push('offer');return{reason:'review_available',mayHaveWritten:true,proposal:result.record};},accept:async q=>{calls.push(['accept',q]);throw Error('synthetic-timeout');},receipt:async q=>{calls.push(['receipt',q]);return{version:'rules14-acceptance-receipt-v1',status:'not_found',request:q};},chain:async()=>{throw Error('unexpected');},verifyChain:async()=>{throw Error('unexpected');},goal:async()=>{throw Error('unexpected');},onVerified:async()=>{throw Error('unexpected');}};
 let c=createRules14ProposalController(p);await c.recover();await c.review();await assert.rejects(()=>c.accept());const saved=await journal.load(actor);assert.ok(saved);c.close();
 c=createRules14ProposalController(p);assert.equal(await c.recover(),'pending');assert.equal(c.hasPending(),true);assert.equal(rules14DashboardActionAllowed('review',false,false),false);assert.equal(rules14DashboardActionAllowed('accept',false,false),false);assert.equal(rules14DashboardActionAllowed('retry',false,false),false);
 assert.equal(rules14DashboardActionAllowed('check',false,false),true);assert.equal((await c.check()).status,'unresolved');assert.deepEqual(await journal.load(actor),saved);assert.equal(calls.filter(x=>x==='offer').length,1);assert.equal(calls.filter(x=>Array.isArray(x)&&x[0]==='accept').length,1);c.close();
 p.accept=async q=>{calls.push(['accept',q]);return{version:'rules14-acceptance-receipt-v1',status:'rejected',reason:'synthetic_rejection',request:q};};c=createRules14ProposalController(p);assert.equal(await c.recover(),'pending');assert.equal(rules14DashboardActionAllowed('retry',false,true),true);assert.equal((await c.retry()).status,'rejected');const sends=calls.filter(x=>Array.isArray(x)&&x[0]==='accept');assert.deepEqual(sends[0][1],sends[1][1]);assert.equal(await journal.load(actor),null);
});
