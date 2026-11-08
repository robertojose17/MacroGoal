import test from 'node:test';
import assert from 'node:assert/strict';
import {manualCandidate,manualConfirmationPayload,handleManualReview} from '../supabase/functions/vision-nutrition-extract/recovery-manual.mjs';
import {openDraft} from '../supabase/functions/vision-nutrition-extract/recovery-contract.mjs';

const barcode='669387007523', owner='owner', secret='test-only';
const values=()=>({name:'Coconut Snacks',brand:'Dulzura',serving:'1 unit',serving_g:16,nutrition:{calories:60,protein:0,carbs:13,fat:2.5,fiber:null}});
const session=()=>({version:1,kind:'session',owner,expires:Date.now()+60000,submission:'submission',unknown_front:true,binding:{barcode,id:null}});
const confirmations={identity:true,serving:true,nutrition:true,shared:true};
test('manual draft is explicitly user-entered, never verified nutrition',()=>{
 const c=manualCandidate(values(),session());
 assert.equal(c.validated,false);assert.equal(c.nutrition_validated,false);assert.equal(c.exact_barcode,false);
 assert.equal(c.provenance.kind,'user_entered');assert.equal(c.nutrition.protein,0);assert.equal(c.nutrition.fiber,null);
 const payload=manualConfirmationPayload(c,session().binding,confirmations);
 assert.equal(payload.provenance.identity,'user_entered_barcode');assert.equal(payload.provenance.exact_barcode,false);
 assert.equal(payload.expected_id,null);assert.equal(payload.fiber,null);
});
test('required nutrients and serving reject absent, coerced, nonfinite or oversized values',()=>{
 for(const k of ['calories','protein','carbs','fat'])for(const value of [null,undefined,'0',-1,Infinity,NaN,1000001]){
  const v=values();v.nutrition[k]=value;assert.throws(()=>manualCandidate(v,session()),/invalid_manual_values/);
 }
 for(const value of [0,-1,'16',Infinity,1000001])assert.throws(()=>manualCandidate({...values(),serving_g:value},session()),/invalid_manual_values/);
 assert.throws(()=>manualCandidate({...values(),brand:''},session()),/invalid_manual_values/);
 assert.throws(()=>manualCandidate({...values(),name:'\u0000bad'},session()),/invalid_manual_values/);
});
test('manual cannot inherit verified provenance, change barcode or target an existing product',()=>{
 const c=manualCandidate({...values(),barcode:'000000000000',validated:true,provenance:{kind:'physical_label'}},session());
 assert.equal(c.barcode,barcode);assert.equal(c.provenance.kind,'user_entered');assert.equal(c.validated,false);
 assert.throws(()=>manualCandidate(values(),{...session(),binding:{barcode,id:'existing'}}),/invalid_manual_session/);
 assert.throws(()=>manualConfirmationPayload(c,session().binding,{}),/confirmation_required/);
});
function fixture(){
 let row=null,manualRevision=0,claims=0;
 const db={async rpc(name,args){
  assert.equal(name,'claim_barcode_recovery');claims++;
  if(args.p_phase==='discover')row??={barcode:args.p_barcode,status:'pending',created_at:new Date().toISOString(),extracted_data:{recovery_version:1,photo_attempts:0}};
  if(args.p_phase==='manual'){manualRevision++;row.extracted_data.manual_revision=manualRevision;}
  return {data:args.p_phase==='manual'?manualRevision:0,error:null};
 },from(table){assert.equal(table,'food_submissions');return {select(){return this},eq(){return this},async maybeSingle(){return {data:row,error:null};}}}};
 return {deps:{userId:owner,secret,supabase:db},repo:{findByBarcodes:async()=>[]},get row(){return row;},get claims(){return claims;}};
}
const startBody={action:'recovery_manual_start',barcode,request_id:'a7cfe526-2680-4759-8f8f-9db382d8a4e1'};
test('start resumes same owner-bound session and review signs distinct manual revisions without food writes',async()=>{
 const f=fixture(),a=await handleManualReview(startBody,f.deps,f.repo),b=await handleManualReview(startBody,f.deps,f.repo);
 assert.equal(a.next_step,'manual');assert.equal((await openDraft(a.session,secret,owner)).submission,(await openDraft(b.session,secret,owner)).submission);
 const one=await handleManualReview({action:'recovery_manual_review',session:a.session,values:values()},f.deps,f.repo);
 const two=await handleManualReview({action:'recovery_manual_review',session:a.session,values:values()},f.deps,f.repo);
 assert.equal(one.next_step,'review');assert.equal(one.photo.can_confirm,true);assert.equal(one.photo.nutrition_validated,false);
 assert.equal((await openDraft(one.photo.proposal,secret,owner)).manual_revision,1);
 assert.equal((await openDraft(two.photo.proposal,secret,owner)).manual_revision,2);
 assert.equal((await openDraft(two.photo.proposal,secret,owner)).revision,0);
 await assert.rejects(()=>openDraft(one.photo.proposal,secret,'other'));
 await assert.rejects(()=>openDraft(one.photo.proposal.slice(0,-4)+'xxxx',secret,owner));
});
test('known barcode, expired or nonpending session cannot generate manual proposal',async()=>{
 const f=fixture();
 const known=await handleManualReview(startBody,f.deps,{findByBarcodes:async()=>[{id:'existing'}]});
 assert.equal(known.code,'barcode_now_known');assert.equal(f.claims,0);
 const a=await handleManualReview(startBody,f.deps,f.repo);
 f.row.status='approved';
 await assert.rejects(()=>handleManualReview({action:'recovery_manual_review',session:a.session,values:values()},f.deps,f.repo),/invalid_manual_session/);
 f.row.status='pending';f.row.created_at='2000-01-01';
 await assert.rejects(()=>handleManualReview({action:'recovery_manual_review',session:a.session,values:values()},f.deps,f.repo),/expired_proposal/);
});
test('failed claim cannot create a manual session or dispatch a provider',async()=>{
 const db={rpc:async()=>({data:null,error:{message:'user_limit'}}),from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})}}};
 await assert.rejects(()=>handleManualReview(startBody,{userId:owner,secret,supabase:db},{findByBarcodes:async()=>[]}),/invalid_manual_session/);
});
