import test from 'node:test';import assert from 'node:assert/strict';
import {buildSourceEvidenceRequest,parseSourceEvidenceResponse,fetchGeneralSourceEvidence} from '../supabase/functions/vision-nutrition-extract/recovery-web-evidence.mjs';
const url='https://example.com/product/coconut',input={barcode:'669387007523',name:'Example Coconut',brand:'Example'};
const payload=()=>({object:'response',status:'completed',error:null,incomplete_details:null,usage:{server_tool_use_details:{tool_calls_requested:1,tool_calls_executed:1}},output:[{type:'openrouter:web_fetch',status:'completed',url,httpStatus:200,content:'Product without full nutrition evidence'},{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"proposals":[]}'}]}]});
test('same managed call without strict schema; wrapper prompt no longer contradictory',()=>{
 const r=buildSourceEvidenceRequest(input,[url]);assert.equal(r.model,'google/gemini-2.5-pro');assert.equal(r.max_output_tokens,4096);assert.equal(r.max_tool_calls,1);assert.equal(r.tools.length,1);assert.equal(r.tools[0].type,'openrouter:web_fetch');assert.equal('text' in r,false);assert.equal('tool_choice' in r,false);
 assert.ok(r.instructions.includes('Each item in the proposals array'));assert.ok(r.instructions.includes('return an empty proposals array if none qualify'));
 assert.equal(r.instructions.includes('Unsupported or incomplete sources yield null.'),false);assert.equal(r.instructions.includes('Return only one JSON extraction proposal with'),false);
 assert.ok(r.instructions.includes('The final response must always be an object with proposals array'));
});
test('unsupported reasons are categorical; empty valid proposals remain ordinary abstention',async()=>{
 for(const [raw,reason] of [['null','root_null'],['[]','root_array'],['1','root_scalar'],['{}','proposals_missing'],['{"proposals":null}','proposals_not_array']]){
 const p=payload();p.output[1].content[0].text=raw;const r=await parseSourceEvidenceResponse(p,[url],input.barcode);assert.ok(r.diagnostics.some(d=>d.output_reason===reason));assert.equal(r.candidates.length,0);
 }
 const p=payload();p.output[1].content.push({type:'output_text',text:'private'});assert.ok((await parseSourceEvidenceResponse(p,[url],input.barcode)).diagnostics.some(d=>d.output_reason==='text_parts_shape'));
 assert.ok((await parseSourceEvidenceResponse(payload(),[url],input.barcode)).diagnostics.some(d=>d.outcome==='proposal_output_empty'));
});
test('scope categories survive actual fetch wrapper, never arbitrary type/body/url text',async()=>{
 for(const [mutate,reason] of [
 [p=>p.output.push({type:'function_call',name:'private-url-secret'}),'unexpected_output_class'],
 [p=>p.output.push({type:'openrouter:unknown-private'}),'unexpected_output_class'],
 [p=>p.output.push(p.output[0]),'fetch_count_exceeded'],
 [p=>p.usage.server_tool_use_details.tool_calls_requested=0,'requested_counter_invalid'],
 [p=>p.usage.server_tool_use_details.tool_calls_executed=99,'executed_counter_invalid'],
 ]){
 const p=payload();mutate(p);let calls=0;
 await assert.rejects(fetchGeneralSourceEvidence(input,[url],{apiKey:'offline',deadline:Date.now()+10000,fetch:async()=>{calls++;return Response.json(p);}}),error=>{
 assert.equal(error.message,'source_tool_scope_invalid');assert.equal(error.diagnostic.scope_reason,reason);const serialized=JSON.stringify(error.diagnostic);assert.equal(serialized.includes('private'),false);assert.equal(serialized.includes(url),false);return true;
 });assert.equal(calls,1);
 }
});
test('null counters remain incomplete, no relaxed source evidence or function-call acceptance',async()=>{
 const p=payload();p.usage.server_tool_use_details={};const r=await parseSourceEvidenceResponse(p,[url],input.barcode);assert.ok(r.diagnostics.some(d=>d.outcome==='source_fetch_protocol_accounted'&&d.complete===false));
 p.output=[{type:'function_call',arguments:'{"proposals":[]}'}];await assert.rejects(parseSourceEvidenceResponse(p,[url],input.barcode),/source_tool_scope_invalid/);
});
test('untrusted transport exceptions cannot smuggle diagnostics',async()=>{
 await assert.rejects(fetchGeneralSourceEvidence(input,[url],{apiKey:'offline',deadline:Date.now()+10000,fetch:async()=>{throw {scopeDiagnostic:{body:'private'},message:'bad'};}}),error=>!JSON.stringify(error.diagnostic).includes('private'));
});
test('existing validator accepts unique quote objects with or without exact offsets, never strings or duplicates',async()=>{
 const {validateFetchedTextEvidence}=await import('../supabase/functions/vision-nutrition-extract/recovery-text-evidence.mjs');
 const barcode='036000291452',name='Example Almond Butter',brand='Example';
 const panel='Nutrition Facts\nServing size: 2 tbsp (32 g)\nAmount per serving\nCalories 190\nProtein 7 g\nTotal Carbohydrate 6 g\nTotal Fat 16 g';
 const content=['Product: '+name,'Brand: '+brand,'UPC: '+barcode,panel].join('\n'),q=quote=>({quote});
 const p={source_url:url,name,brand,variant:name,barcode,serving:'2 tbsp (32 g)',serving_g:32,nutrition:{calories:190,protein:7,carbs:6,fat:16,fiber:null},evidence:{name:q('Product: '+name),brand:q('Brand: '+brand),variant:q('Product: '+name),barcode:q('UPC: '+barcode),panel:q(panel),serving:q('Serving size: 2 tbsp (32 g)'),basis:q('Amount per serving'),calories:q('Calories 190'),protein:q('Protein 7 g'),carbs:q('Total Carbohydrate 6 g'),fat:q('Total Fat 16 g'),fiber:null}};
 const receipt={type:'openrouter:web_fetch',status:'completed',httpStatus:200,url,content,title:name};
 assert.equal((await validateFetchedTextEvidence(receipt,p,barcode)).ok,true);
 const offsets=structuredClone(p);for(const e of Object.values(offsets.evidence)){if(e){e.start=content.indexOf(e.quote);e.end=e.start+e.quote.length;}}
 assert.equal((await validateFetchedTextEvidence(receipt,offsets,barcode)).ok,true);
 const string=structuredClone(p);string.evidence.calories='Calories 190';
 assert.equal((await validateFetchedTextEvidence(receipt,string,barcode)).reason,'invalid_source_quote');
 const repeated={...receipt,content:content+'\nCalories 190'};
 assert.equal((await validateFetchedTextEvidence(repeated,offsets,barcode)).reason,'invalid_source_quote');
 const wrong=structuredClone(offsets);wrong.evidence.calories.start++;
 assert.equal((await validateFetchedTextEvidence(receipt,wrong,barcode)).reason,'invalid_source_quote');
});
