import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {buildSourceEvidenceRequest,parseSourceEvidenceResponse} from '../supabase/functions/vision-nutrition-extract/recovery-web-evidence.mjs';
test('Exa is sole change in runtime source; request keeps all caps and no strict schema',async()=>{
const file='supabase/functions/vision-nutrition-extract/recovery-web-evidence.mjs';
const current=await readFile(new URL('../'+file,import.meta.url),'utf8');
assert.equal(createHash('sha256').update(current.replace("engine:'exa'","engine:'openrouter'")).digest('hex'),'1e1fc5f9a1925e5bd292da6463afbb6bff60b5edbec50daa984548f30d721b99');
const r=buildSourceEvidenceRequest({barcode:'669387007523',name:'Example',brand:'Example'},['https://example.com/p/a','https://example.com/p/b','https://example.com/p/c']);
assert.equal(r.tools[0].parameters.engine,'exa');assert.equal(r.tools[0].parameters.max_uses,3);assert.equal(r.max_tool_calls,3);assert.equal(r.max_output_tokens,4096);assert.equal(r.model,'google/gemini-2.5-pro');assert.equal('text' in r,false);
});
test('documented response without HTTP status remains rejected; HTTP200 with empty proposals is not nutrition',async()=>{
const url='https://example.com/p/a';const p={object:'response',status:'completed',error:null,incomplete_details:null,usage:{server_tool_use_details:{tool_calls_requested:1,tool_calls_executed:1}},output:[{type:'openrouter:web_fetch',url,status:'completed',content:'A product'}, {type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"proposals":[]}'}]}]};
let r=await parseSourceEvidenceResponse(p,[url],'669387007523');assert.equal(r.candidates.length,0);assert.ok(r.diagnostics.some(d=>d.reason==='source_http_status_missing'));
p.output[0].httpStatus=200;r=await parseSourceEvidenceResponse(p,[url],'669387007523');assert.equal(r.candidates.length,0);assert.ok(r.diagnostics.some(d=>d.outcome==='source_content_accepted'));assert.ok(r.diagnostics.some(d=>d.outcome==='proposal_output_empty'));
});
test('sanitized observed Exa protocol completes with three accepted texts and honest empty proposals',async()=>{
const p=JSON.parse(await readFile(new URL('./fixtures/exa-empty-protocol.json',import.meta.url),'utf8'));
const urls=p.output.filter(x=>x.type==='openrouter:web_fetch').map(x=>x.url);
const r=await parseSourceEvidenceResponse(p,urls,'669387007523');
assert.equal(r.candidates.length,0);assert.equal(r.diagnostics.filter(x=>x.outcome==='source_content_accepted').length,3);
assert.ok(r.diagnostics.some(x=>x.outcome==='source_fetch_protocol_accounted'&&x.complete===true));assert.ok(r.diagnostics.some(x=>x.outcome==='proposal_output_empty'));
});
