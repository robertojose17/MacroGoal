import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSourceEvidenceResponse} from '../supabase/functions/vision-nutrition-extract/recovery-web-evidence.mjs';
const url='https://example.com/product/coconut';
const response=text=>({object:'response',status:'completed',error:null,incomplete_details:null,usage:{server_tool_use_details:{tool_calls_requested:1,tool_calls_executed:1}},output:[{type:'openrouter:web_fetch',status:'completed',url,httpStatus:200,content:'Coconut product detail. Product identity only; nutrition panel is not present.'},{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]}]});
test('accepted source plus empty proposals means parsed model abstention, not response-contract failure',async()=>{
 const r=await parseSourceEvidenceResponse(response('{"proposals":[]}'),[url],'669387007523');assert.equal(r.candidates.length,0);assert.deepEqual(r.source_links,[url]);for(const code of ['source_content_accepted','proposal_output_empty','source_accepted_without_proposal'])assert.ok(r.diagnostics.some(x=>x.outcome===code));
});
test('malformed and unsupported proposals have distinct diagnostics from explicit empty array',async()=>{
 for(const [text,code] of [['not JSON','proposal_output_malformed'],['{"candidates":[]}','proposal_output_unsupported']]){const r=await parseSourceEvidenceResponse(response(text),[url],'669387007523');assert.ok(r.diagnostics.some(x=>x.outcome===code));assert.ok(!r.diagnostics.some(x=>x.outcome==='proposal_output_empty'));}
});
