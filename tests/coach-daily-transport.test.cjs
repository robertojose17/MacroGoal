const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);
const {createCoachDailyTransport}=require('../utils/coachDailyTransport.ts');
const {createManualHandoffServices}=require('../utils/coachManualHandoff.ts');
const access={isPremium:true,premiumLoading:false,gated:false,busy:false};
function fixture(){
 const s={owner:'A',day:'2026-10-21',zone:'UTC',ids:0,calls:[],rows:new Map(),fail:false,writeFail:false};
 const store={getItem:async k=>s.rows.get(k)??null,setItem:async(k,v)=>{if(s.writeFail)throw Error();s.rows.set(k,v)},removeItem:async k=>s.rows.delete(k)};
 const client={auth:{getUser:async()=>({data:{user:{id:s.owner}},error:null})},functions:{invoke:async(name,{body})=>{s.calls.push({name,body});if(s.fail)throw Error();return {data:{status:'ready',owner:s.owner,date:s.day,coverage:'logged_only',entry_count:0},error:null}}}};
 const make=(scope='staging:qa')=>createCoachDailyTransport(client,store,scope,()=>s.day,()=>s.zone,()=>`11111111-1111-4111-8111-${String(++s.ids).padStart(12,'0')}`);
 return {s,store,client,make};
}
test('actual service uses exact existing endpoint and persists before dispatch; free gates never dispatch',async()=>{
 const f=fixture(),t=f.make();const services=createManualHandoffServices({catalogSource:'owned_saved_meals',...t});
 for(const patch of [{isPremium:false},{gated:true},{premiumLoading:true},{premiumError:'unknown'},{busy:true}])await services.load({...access,...patch},f.s.day);
 assert.equal(f.s.calls.length,0);const result=await services.load(access,f.s.day);assert.equal(result.kind,'ready');
 assert.equal(f.s.calls[0].name,'ai-coach');assert.deepEqual(Object.keys(f.s.calls[0].body).sort(),['intent','request_id','time_zone']);assert.equal(f.s.rows.size,0);
});
test('lost response and reload recover the same id, never regenerate or redispatch original intent',async()=>{
 const f=fixture();f.s.fail=true;assert.equal((await f.make().request({intent:'today'})).status,503);const id=f.s.calls[0].body.request_id;
 f.s.fail=false;assert.equal((await f.make().request({intent:'today'})).status,409);assert.equal(f.s.calls.length,1);assert.equal((await f.make().recover({intent:'today'})).status,200);
 assert.deepEqual(f.s.calls[1].body,{intent:'recover_daily',request_id:id});assert.equal(f.s.ids,1);
});
test('unknown recovery and stopped/not-found receipts stay unresolved without new IDs',async()=>{
 const f=fixture();f.s.fail=true;await f.make().request({intent:'today'});
 f.client.functions.invoke=async(name,{body})=>{f.s.calls.push({name,body});return {error:{context:Response.json({error:'request_not_found'},{status:404})}}};
 for(let i=0;i<2;i++)assert.equal((await f.make().recover({intent:'today'})).status,404);
 assert.equal(f.s.ids,1);assert.equal(f.s.rows.size,1);
});
test('storage failure prevents dispatch; duplicate taps share an in-flight scope fence',async()=>{
 const f=fixture();f.s.writeFail=true;await f.make().request({intent:'today'});assert.equal(f.s.calls.length,0);
 f.s.writeFail=false;let release;f.client.functions.invoke=()=>new Promise(r=>{release=r});const pending=f.make().request({intent:'today'});
 while(!release)await new Promise(r=>setImmediate(r));assert.equal((await f.make().request({intent:'today'})).status,409);
 release({error:{}});await pending;
});
test('account/day switches during response parsing fail closed and preserve journal evidence',async()=>{
 for(const change of [s=>s.owner='B',s=>s.day='2026-10-22',s=>s.zone='Europe/Madrid']){
  const f=fixture();f.client.functions.invoke=async()=>({error:{context:{status:200,ok:true,clone:()=>({json:async()=>{change(f.s);return {status:'ready',owner:'A',date:'2026-10-21',coverage:'logged_only'}}})}}});
  assert.equal((await f.make().request({intent:'today'})).status,409);assert.equal(f.s.rows.size,1);
 }
});
test('only matching proven not-admitted receipt permits a later deliberate fresh attempt',async()=>{
 for(const proven of [true,false]){
  const f=fixture();f.client.functions.invoke=async(name,{body})=>{f.s.calls.push({name,body});return {error:{context:Response.json({error:'budget_limit',request_id:proven?body.request_id:'wrong',admission_state:'not_admitted'},{status:403})}}};
  await f.make().request({intent:'today'});assert.equal(f.s.rows.size,proven?0:1);
 }
});
test('QA and normal/project journals are separate; corrupt envelopes never dispatch',async()=>{
 const f=fixture();f.s.fail=true;await f.make('qa').request({intent:'today'});await f.make('normal').request({intent:'today'});assert.equal(f.s.rows.size,2);
 const key=[...f.s.rows.keys()][0];f.s.rows.set(key,'{"owner":"B"}');const calls=f.s.calls.length;
 assert.equal((await f.make('qa').recover({intent:'today'})).status,409);assert.equal(f.s.calls.length,calls);
});
