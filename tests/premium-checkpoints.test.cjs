const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={},globals={}){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 const exports={};const context={exports,require:name=>{if(name in mocks)return mocks[name];throw Error('Unexpected import '+name);},...globals};
 vm.runInNewContext(code,context,{filename:file});return exports;
}
const protocol=load('supabase/premium-checkpoints-rollout/edge/protocol.ts');
const event=()=>({namespace:'premium_checkpoint',schema_version:1,eventId:'event_0001',occurredAt:'2026-10-31T12:00:00.000Z',flow:{flowId:'flow_0001',source:'settings_upgrade'},platform:'ios',detail:{name:'entrypoint_clicked'}});
test('server validator stays byte-identical to client contract and validation implementation',()=>{
 const source=fs.readFileSync(path.join(root,'supabase/premium-checkpoints-rollout/edge/protocol.ts'),'utf8');
 const contract=fs.readFileSync(path.join(root,'utils/premiumCheckpointContract.ts'),'utf8');
 const runtime=fs.readFileSync(path.join(root,'utils/premiumCheckpointRuntime.ts'),'utf8');
 assert.equal(source.slice(source.indexOf('export ')).includes(contract.trim()),true);
 assert.equal(source.includes(runtime.slice(runtime.indexOf('type Obj ='),runtime.indexOf('export type ActorLease'))),true);
});
test('closed protocol rejects actor, payment confirmation, health and purchase token fields',()=>{
 assert.equal(protocol.validCheckpoint(event()),true);
 for(const mutate of [e=>e.userId='forged',e=>e.detail.name='payment_confirmed',e=>e.detail.health='private',e=>e.detail={name:'purchase_result',attemptId:'attempt_1',outcome:'sdk_returned_entitlement',attribution:'consistent',correlation:{transactionId:'tx',productId:'product',purchaseToken:'secret'}}]){
  const e=event();mutate(e);assert.equal(protocol.validCheckpoint(e),false);
 }
});
function visibility(clip,card,enabled=true){
 const effects=[],events=[];let tick;const actor={};
 const ref=rect=>({current:rect?{measureInWindow:cb=>cb(...rect)}:null});
 const react={useContext:()=>[],useEffect:f=>effects.push(f),useRef:v=>({current:v})};
 const exports=load('hooks/usePremiumCheckpointVisibility.ts',{
  react,'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})},useWindowDimensions:()=>({width:400,height:800})},
  '@react-navigation/native':{useIsFocused:()=>true},
  '@/utils/premiumCheckpoints':{checkpoint:(...args)=>events.push(args),checkpointActor:()=>actor,actorStillCurrent:a=>a===actor},
  '@/utils/premiumCheckpointContract':{createFlowImpressionObserver:protocol.createFlowImpressionObserver},
  '@/components/PremiumCheckpointViewport':{PremiumViewportContext:{}},
 },{setInterval:f=>(tick=f,1),clearInterval(){}});
 exports.usePremiumCheckpointVisibility(event().flow,enabled,ref(clip))('card',{name:'inline_impression'})(ref(card).current);
 const cleanup=effects[0]();tick();cleanup();return events.length;
}
test('enabled visibility retains clips and records one visible impression',()=>assert.equal(visibility([0,50,400,300],[10,80,200,100]),1));
test('scroll clipping suppresses a card that is inside the window but mostly outside its scroll viewport',()=>assert.equal(visibility([0,50,400,300],[10,300,200,100]),0));
test('unresolved clip and disabled observation fail closed',()=>{assert.equal(visibility(null,[10,80,200,100]),0);assert.equal(visibility([0,50,400,300],[10,80,200,100],false),0);});
const {reconcileObservedPayments}=load('supabase/premium-checkpoints-rollout/reconcileObservedPayments.ts');
function reconciliationFixture(){
 const user='11111111-1111-4111-8111-111111111111',time=Date.parse('2026-10-31T12:00:00.000Z');
 const provider={user_id:user,created_at:new Date(time+1000).toISOString(),event_data:null,raw_event:{event:{id:'vendor1',app_user_id:user,transaction_id:'transaction1',product_id:'product1',store:'APP_STORE',environment:'PRODUCTION',currency:'USD',type:'INITIAL_PURCHASE',period_type:'NORMAL',purchased_at_ms:time,event_timestamp_ms:time,price_in_purchased_currency:9.99}}};
 const attempt={user_id:user,received_at:new Date(time-1000).toISOString(),payload:{...event(),detail:{name:'purchase_attempt',attemptId:'attempt_1',attribution:'consistent',offer:{productId:'product1'}}}};
 const result={user_id:user,received_at:new Date(time+1000).toISOString(),payload:{...event(),eventId:'event_0002',detail:{name:'purchase_result',attemptId:'attempt_1',attribution:'consistent',outcome:'sdk_returned_entitlement',correlation:{transactionId:'transaction1',productId:'product1'}}}};
 return {provider,attempt,result,start:'2026-10-31T00:00:00.000Z'};
}
test('exact verified transaction matches irrespective of arrival order and duplicate provider rows',()=>{
 const f=reconciliationFixture();const r=reconcileObservedPayments([f.provider,f.provider],[f.result,f.attempt],f.start);
 assert.equal(r.payments.length,1);assert.equal(r.payments[0].status,'matched');assert.equal(r.payments[0].firstPaidStatus,'unknown');
});
test('client dimensions cannot hide multiple trusted transaction keys',()=>{
 const f=reconciliationFixture(),other=JSON.parse(JSON.stringify(f.provider));other.raw_event.event.id='vendor2';other.raw_event.event.environment='SANDBOX';f.result.payload.detail.correlation.environment='PRODUCTION';
 const r=reconcileObservedPayments([f.provider,other],[f.attempt,f.result],f.start);assert.equal(r.payments.every(p=>p.status==='ambiguous'),true);
});
test('missing attempt and replayed historical purchase remain unattributed',()=>{
 const f=reconciliationFixture();assert.equal(reconcileObservedPayments([f.provider],[f.result],f.start).payments[0].status,'unattributed');
 f.attempt.received_at='2026-10-31T13:00:00.000Z';assert.equal(reconcileObservedPayments([f.provider],[f.attempt,f.result],f.start).payments[0].status,'unattributed');
});
