import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
const dir=new URL('../supabase/functions/vision-nutrition-extract/',import.meta.url);
const source=readFileSync(new URL('index.ts',dir),'utf8');
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/sol-label-pilot.json',import.meta.url))).records;
const contract=await import(new URL('recovery-contract.mjs',dir));
const realGate=await import(new URL('nutritionReadGate.mjs',dir));
const owner='offline-owner',secret='offline-signing-fixture',project='https://offline.supabase.co';
const photo=kind=>project+'/storage/v1/object/public/food-photos/submissions/'+owner+'/'+kind+'.jpg';
async function harness({pair=1,mutate=x=>x,finish='stop',http=200,auth=true,timeout=false}={}){
 const calls=[],events=[],receipts=[];let handler;
 const bindings={};
 for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g)){
  if(!match[2].startsWith('.'))continue;
  const mod=await import(new URL(match[2],dir));
  for(const name of match[1].split(',').map(s=>s.trim()))bindings[name]=mod[name];
 }
 const db={auth:{getUser:async()=>auth?{data:{user:{id:owner}}}:{data:null,error:{}}},rpc:async(name,args)=>{
  events.push({name,args});if(name==='claim_barcode_recovery')return {data:1};
  if(name==='confirm_barcode_recovery')return {data:{id:'offline-saved'}};
  if(name==='read_food_correction_targets_v1')return {data:[]};
  throw Error('Unexpected RPC '+name);
 }};
 const fetcher=async(url,init={})=>{
  if(url.startsWith(project))return new Response(new Uint8Array(1100).fill(1),{headers:{'content-type':'image/jpeg'}});
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
  const body=JSON.parse(init.body);calls.push(body);
  if(timeout)return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}));
  if(http!==200)return new Response('{}',{status:http});
  const role=calls.length===1?'primary':'independent';
  const f=fixtures.find(r=>r.pair===pair&&r.role===role);
  return Response.json({model:body.model,choices:[{finish_reason:finish,message:{content:mutate(f.response,role)}}],usage:{prompt_tokens:6000,completion_tokens:500,total_tokens:6500}});
 };
 const context=vm.createContext({...bindings,Request,Response,Headers,AbortController,AbortSignal,URL,TextEncoder,TextDecoder,Uint8Array,crypto,btoa,atob,setTimeout,clearTimeout,fetch:fetcher,console:{log(){},warn(){},error(){}},createClient:()=>db,
  persistRecoveryReceipt:async(...args)=>{receipts.push(args.at(-1));},
  ...(timeout?{runTwoReadGate:(a,b)=>realGate.runTwoReadGate(a,b,{timeoutMs:5})}:{}),
  Deno:{env:{get:n=>({SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:secret,OPENROUTER_API_KEY:'offline-not-secret',BARCODE_RECOVERY_ENABLED:'true'})[n]},serve:fn=>{handler=fn;}}});
 const stripped=source.replace(/^import .*;\s*$/gm,'');
 const code=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 vm.runInContext(code,context);
 const session=await contract.sealDraft({version:1,kind:'session',owner,expires:Date.now()+60000,submission:'offline-submission',unknown_front:true,front_photo_url:photo('front'),binding:{barcode:'669387007523',id:null,nutrition_revision:null},name:"Mini’s Coconut Snacks",brand:'Dulzura'},secret);
 const send=body=>handler(new Request('https://offline.invalid/function',{method:'POST',headers:{Authorization:'Bearer offline','Content-Type':'application/json'},body:JSON.stringify(body)}));
 return {calls,events,receipts,context,send,session,read:()=>send({action:'recovery_photos',session,photo_label_url:photo('label')})};
}
test('actual handler uses both Sol pilot pairs and signed confirmation without changing nutrient gates',async()=>{
 for(const pair of [1,2]){
 const h=await harness({pair}),res=await h.read(),body=await res.json();
 assert.equal(res.status,200);assert.equal(body.status,'review');assert.equal(h.calls.length,2);
 for(const req of h.calls){assert.equal(req.model,'openai/gpt-6.1-sol');assert.equal(req.max_tokens,4096);assert.deepEqual(req.reasoning,{effort:'low'});assert.equal('temperature' in req,false);assert.deepEqual(req.provider.only,['openai']);assert.deepEqual(req.provider.ignore,['openai/flex','openai/fast','openai/ultrafast']);assert.deepEqual(req.provider.max_price,{prompt:2,completion:10});assert.equal('response_format' in req,false);}
 const c=body.photo;assert.equal(c?.can_confirm,true);assert.ok(c);
 const draft=await contract.openDraft(c.proposal,secret,owner);assert.equal(draft.candidate.serving_g,16);
 assert.equal(h.events.some(e=>e.name==='confirm_barcode_recovery'),false);
 const saved=await (await h.send({action:'recovery_confirm',proposal:c.proposal,confirmations:{identity:true,serving:true,nutrition:true,shared:true}})).json();assert.equal(saved.status,'approved');assert.equal(h.calls.length,2);
 assert.equal(h.receipts.length,4);
 }
});
test('auth, bad signed session, missing photo, HTTP error, length and timeout fail closed',async()=>{
 for(const opts of [{auth:false},{http:400},{finish:'length'},{timeout:true}]){
 const h=await harness(opts),r=await h.read(),b=await r.json();
 assert.equal(!!b.photo?.can_confirm||(b.candidates||[]).some(c=>c.can_confirm),false);
 if(opts.auth===false){assert.equal(r.status,401);assert.equal(h.calls.length,0);}
 assert.equal(h.events.some(e=>e.name==='confirm_barcode_recovery'),false);
 }
 const h=await harness();for(const body of [{action:'recovery_photos',session:'bad',photo_label_url:photo('label')},{action:'recovery_photos',session:h.session}]){
 assert.equal((await h.send(body)).status,400);
 }assert.equal(h.calls.length,0);
});
test('real Sol text fences accepted while disagreements, mass and crossed columns remain rejected',async()=>{
 const wrap=await harness({mutate:s=>'\x60\x60\x60json\n'+s+'\n\x60\x60\x60'});assert.equal((await (await wrap.read()).json()).photo?.can_confirm,true);
 for(const mutation of [r=>r.serving_size_g=18,r=>r.serving_size_g=144,r=>r.serving_size_g=null,r=>r.serving_size_evidence='Serving size 1 unit (16ml)',r=>r.nutrients.fat.column_header='Per 100g',r=>r.nutrients.calories.value=99]){
 const h=await harness({mutate:(s,role)=>{if(role!=='independent')return s;const r=JSON.parse(s);mutation(r);return JSON.stringify(r);}});
 const b=await (await h.read()).json();assert.equal(!!b.photo?.can_confirm||(b.candidates||[]).some(c=>c.can_confirm),false);
 }
});
test('source-label OCR retains exact Flash/schema routing; physical functions never temperature',async()=>{
 const h=await harness();
 await vm.runInContext("callVision('label','front',null,undefined,true,fetch,true)",h.context);
 const req=h.calls[0];assert.equal(req.model,'google/gemini-2.5-flash');assert.equal(req.max_tokens,1536);assert.equal(req.temperature,0.1);assert.equal('reasoning' in req,false);assert.ok(req.response_format);assert.equal('only' in req.provider,false);
});
test('receipt allowlist permits Sol only physical chat; denies Responses/tools/plugins/schema before dispatch',async()=>{
 const {createReceiptFetch}=await import(new URL('recovery-receipts.mjs',dir));let sent=0,saved=0;
 const f=createReceiptFetch({fetcher:async()=>{sent++;return Response.json({});},persist:async()=>{saved++;},submission:'offline',revision:1,log:()=>{}});
 for(const [url,extra] of [
 ['https://openrouter.ai/api/v1/responses',{}],
 ['https://openrouter.ai/api/v1/chat/completions',{tools:[]}],
 ['https://openrouter.ai/api/v1/chat/completions',{plugins:[]}],
 ['https://openrouter.ai/api/v1/chat/completions',{response_format:{type:'json_schema'}}],
 ])await assert.rejects(f(url,{body:JSON.stringify({model:'openai/gpt-6.1-sol',...extra})}),/unexpected_receipt_model/);
 assert.equal(sent,0);assert.equal(saved,0);
});
