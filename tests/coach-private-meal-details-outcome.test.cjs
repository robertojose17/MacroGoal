const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);
const {persistCoachPrivateDetailsReference}=require('../utils/coachPrivateMealDetails.ts');
const owner='11111111-1111-4111-8111-111111111111',item='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333',option='option-safe';
const input=(overrides={})=>({owner,mealItemId:item,reviewRequestId:request,optionId:option,currentOwner:async()=>owner,read:async()=>({value:{existing:{kept:true}}}),compareAndSet:async()=>({updated:true}),...overrides});

test('metadata pointer reports a fixed outcome and preserves unrelated off_data keys',async()=>{
 const events=[],state={value:{existing:{kept:true}}};
 const linked=await persistCoachPrivateDetailsReference(input({read:async()=>({value:state.value}),compareAndSet:async(id,expected,next)=>{assert.equal(id,item);assert.deepEqual(expected,state.value);state.value=next;return {updated:true};},onOutcome:value=>events.push(value)}));
 assert.equal(linked,true);assert.deepEqual(events,['linked']);assert.deepEqual(state.value.existing,{kept:true});assert.deepEqual(state.value.coach_private_details,{version:1,review_request_id:request,option_id:option});
 assert.equal(JSON.stringify(events).includes(owner),false);assert.equal(JSON.stringify(events).includes(item),false);
});

test('invalid identity stops before read and reports a stable sanitized outcome',async()=>{
 let reads=0;const events=[];
 const linked=await persistCoachPrivateDetailsReference(input({mealItemId:'not-a-uuid',read:async()=>{reads++;return {value:null};},onOutcome:value=>events.push(value)}));
 assert.equal(linked,false);assert.equal(reads,0);assert.deepEqual(events,['invalid_reference']);
});

test('read and update failures are distinguishable without exposing error details',async()=>{
 const readEvents=[],readOk=await persistCoachPrivateDetailsReference(input({read:async()=>({value:null,error:{message:'private database detail'}}),onOutcome:value=>readEvents.push(value)}));
 assert.equal(readOk,false);assert.deepEqual(readEvents,['read_failed']);
 const writeEvents=[],writeOk=await persistCoachPrivateDetailsReference(input({read:async()=>({value:null}),compareAndSet:async()=>({updated:false,error:{message:'private database detail'}}),onOutcome:value=>writeEvents.push(value)}));
 assert.equal(writeOk,false);assert.deepEqual(writeEvents,['write_failed']);
 assert.equal(JSON.stringify([...readEvents,...writeEvents]).includes('private database detail'),false);
});

test('a zero-row compare-and-set is reported separately after bounded retries',async()=>{
 let writes=0;const events=[];const linked=await persistCoachPrivateDetailsReference(input({read:async()=>({value:null}),compareAndSet:async()=>{writes++;return {updated:false};},onOutcome:value=>events.push(value)}));
 assert.equal(linked,false);assert.equal(writes,3);assert.deepEqual(events,['write_not_confirmed']);
});

test('missing log_food item id is observable without logging the meal payload',()=>{
 const service=fs.readFileSync(path.resolve(__dirname,'../utils/coachMealServices.ts'),'utf8');
 assert.match(service,/else deps\.reportPrivateDetailsOutcome\?\.\('log_food_missing_meal_item_id'\)/);
 assert.match(service,/private_link_writer_unavailable/);
});
