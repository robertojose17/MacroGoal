const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const dir=path.resolve(__dirname,'../supabase/premium-checkpoints-rollout/track-onboarding');
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const output=ts.transpileModule(read('router.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exportsObject={};vm.runInNewContext(output,{exports:exportsObject,URL,Response});
const {createOnboardingRouter}=exportsObject;
test('legacy body is exactly the deployed v19 backup with only export wrapper changed',()=>{
 assert.equal(read('legacy.ts'),read('deployed-v19.backup.ts').replace('Deno.serve(async (req) => {','export async function handleLegacy(req: Request) {').replace(/\}\);\n$/,'}\n'));
});
test('one server registration and private reviewed handler body preserved',()=>{
 assert.equal((read('index.ts').match(/Deno\.serve\(/g)||[]).length,1);
 assert.equal(read('legacy.ts').includes('Deno.serve('),false);
 const reviewed=fs.readFileSync(path.join(dir,'../edge/index.ts'),'utf8');
 assert.equal(read('checkpoint.ts'),reviewed.replace("from './protocol.ts'","from '../edge/protocol.ts'").replace('Deno.serve(handleCheckpoint);\n',''));
});
test('only literal private routes dispatch and never read body in router',async()=>{
 let legacy=0,privateCalls=0;
 const router=createOnboardingRouter(()=>{legacy++;return new Response('legacy');},()=>{privateCalls++;return new Response('private',{status:401});});
 for(const p of ['/track-onboarding/premium-checkpoint','/functions/v1/track-onboarding/premium-checkpoint']){
  assert.equal((await router({url:'https://fixture.invalid'+p,method:'POST',json(){throw Error('router read body');}})).status,401);
 }
 for(const p of ['/track-onboarding/premium-checkpoint/','/track-onboarding/premium-checkpoint-extra','/track-onboarding/%70remium-checkpoint','/track-onboarding/private','/functions/v1/track-onboarding/premium-checkpoint/extra']){
  assert.equal((await router({url:'https://fixture.invalid'+p,method:'POST',json(){throw Error('router read body');}})).status,404);
 }
 assert.equal(legacy,0);assert.equal(privateCalls,2);
});
test('private failure is terminal, never legacy fallback',async()=>{
 const router=createOnboardingRouter(()=>{throw Error('legacy called');},()=>{throw Error('private failed');});
 assert.equal((await router(new Request('https://fixture.invalid/track-onboarding/premium-checkpoint'))).status,503);
});
test('root OPTIONS response is delegated unchanged',async()=>{
 const expected=new Response('ok',{headers:{'Access-Control-Allow-Origin':'*'}});
 const router=createOnboardingRouter(()=>expected,()=>{throw Error('wrong route');});
 assert.equal(await router(new Request('https://fixture.invalid/functions/v1/track-onboarding',{method:'OPTIONS'})),expected);
});
