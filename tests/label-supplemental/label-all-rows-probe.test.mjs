import test from 'node:test';import assert from 'node:assert/strict';
import {runLabelRowsProbe,ANCHOR} from './label-all-rows-probe.mjs';
function harness(cost=.01,mutate=x=>x){let claimed=false,calls=0,state;
const db={from(table){assert.equal(table,'analytics_events');return {async insert(){if(claimed)return {error:true};claimed=true;return{}},update(v){state=structuredClone(v.properties);return this},eq(){return this},select(){return this},async single(){return {data:{id:'ok'}}}}}};
const result={schema:'label_rows_v1',declared_serving_line:ANCHOR.serving_line,selected_column_header:ANCHOR.header,selected_basis:ANCHOR.basis,complete:true,rows:[{row_label:'Sodium',column_header:ANCHOR.header,amount_text:'15',unit:'mg',dv_text:'1%',printed_text:'Sodium 15 mg 1%'}]};
const options={db,readImage:async()=> 'data:image/jpeg;base64,abc',parseJSON:JSON.parse,expires:Date.now()+60000,
fetcher:async()=>{calls++;return new Response(JSON.stringify({id:'gen-test',usage:{cost},choices:[{message:{content:JSON.stringify(mutate(result))},finish_reason:'stop'}]}));},
requestVision:async(stage,content,signal,bounded,transport)=>{const res=await transport('https://openrouter.ai/api/v1/chat/completions',{body:JSON.stringify({model:'openai/gpt-6.1-sol',max_tokens:4096,messages:[{role:'user',content}],provider:{only:['openai'],allow_fallbacks:false}})});const json=await res.json();return {text:json.choices[0].message.content,finishReason:json.choices[0].finish_reason};}};
return {options,get calls(){return calls},get state(){return state}};}
test('50 concurrent starts share unique claim and only two provider calls; replay zero',async()=>{const h=harness();await Promise.all(Array.from({length:50},()=>runLabelRowsProbe(h.options)));assert.equal(h.calls,2);assert.equal(h.state.result.status,'two_read_agreement');await runLabelRowsProbe(h.options);assert.equal(h.calls,2)});
test('unknown billing stops second request',async()=>{const h=harness(null);await runLabelRowsProbe(h.options);assert.equal(h.calls,1);assert.equal(h.state.uncertain,true)});
test('expired diagnostic makes zero requests',async()=>{const h=harness();await runLabelRowsProbe({...h.options,expires:0});assert.equal(h.calls,0);assert.equal(h.state,undefined)});

test('failed exact header retains bounded parsed rows and separate mismatch reason',async()=>{const h=harness(.01,r=>({...r,selected_column_header:'Amount per serving'}));await runLabelRowsProbe(h.options);assert.equal(h.calls,1);const d=h.state.read_diagnostics[0];assert.equal(d.validation,'supplemental_basis_mismatch');assert.equal(d.anchor_match.header,false);assert.equal(d.parsed.rows[0].amount_text,'15');assert.equal(h.state.result.status,'unavailable')});
