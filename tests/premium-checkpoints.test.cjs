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
 assert.equal(source.includes(contract.trim()),true);
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
 return {provider,attempt,result,verified:new Set([user]),start:'2026-10-31T00:00:00.000Z'};
}
test('exact verified transaction matches irrespective of arrival order and duplicate provider rows',()=>{
 const f=reconciliationFixture();const r=reconcileObservedPayments([f.provider,f.provider],[f.result,f.attempt],f.start,f.verified);
 assert.equal(r.payments.length,1);assert.equal(r.payments[0].status,'matched');assert.equal(r.payments[0].firstPaidStatus,'unknown');
});
test('client dimensions cannot hide multiple trusted transaction keys',()=>{
 const f=reconciliationFixture(),other=JSON.parse(JSON.stringify(f.provider));other.raw_event.event.id='vendor2';other.raw_event.event.environment='SANDBOX';f.result.payload.detail.correlation.environment='PRODUCTION';
 const r=reconcileObservedPayments([f.provider,other],[f.attempt,f.result],f.start,f.verified);assert.equal(r.payments.every(p=>p.status==='ambiguous'),true);
});
test('missing attempt and replayed historical purchase remain unattributed',()=>{
 const f=reconciliationFixture();assert.equal(reconcileObservedPayments([f.provider],[f.result],f.start,f.verified).payments[0].status,'unattributed');
 f.attempt.received_at='2026-10-31T13:00:00.000Z';assert.equal(reconcileObservedPayments([f.provider],[f.attempt,f.result],f.start,f.verified).payments[0].status,'unattributed');
});

test('trusted raw provider UUID resolves against server Auth snapshot when normalized user_id is null',()=>{
 const f=reconciliationFixture();f.provider.user_id=null;
 const r=reconcileObservedPayments([f.provider],[f.attempt,f.result],f.start,f.verified);
 assert.equal(r.observedPaymentCount,1);assert.equal(r.matchedPaymentCount,1);assert.equal(r.unmappedPaymentCount,0);
 const noMapping=reconcileObservedPayments([f.provider],[f.attempt,f.result],f.start,new Set());
 assert.equal(noMapping.matchedPaymentCount,0);assert.equal(noMapping.unmappedPaymentCount,1);
});
test('financial conflicts are quarantined with no arbitrary payment amount or product',()=>{
 const f=reconciliationFixture(),other=JSON.parse(JSON.stringify(f.provider));other.raw_event.event.id='vendor2';other.raw_event.event.price_in_purchased_currency=19.99;
 const r=reconcileObservedPayments([f.provider,other],[f.attempt,f.result],f.start,f.verified);
 assert.equal(r.payments.length,0);assert.equal(r.quarantined.length,1);
 assert.equal('price' in r.quarantined[0],false);assert.equal('productId' in r.quarantined[0],false);
});
test('same vendor ID with zero or trial variant conflicts before qualification',()=>{
 for(const change of [e=>e.price_in_purchased_currency=0,e=>e.period_type='TRIAL']){
  const f=reconciliationFixture(),other=JSON.parse(JSON.stringify(f.provider));change(other.raw_event.event);
  const r=reconcileObservedPayments([f.provider,other],[f.attempt,f.result],f.start,f.verified);
  assert.equal(r.payments.length,0);assert.equal(r.conflictingVendorIds,1);assert.equal(r.quarantined.length,1);
 }
});
test('attempt received after result cannot attribute an otherwise valid financial fact',()=>{
 const f=reconciliationFixture();f.attempt.received_at=new Date(Date.parse(f.result.received_at)+60000).toISOString();
 const r=reconcileObservedPayments([f.provider],[f.attempt,f.result],f.start,f.verified);
 assert.equal(r.observedPaymentCount,1);assert.equal(r.matchedPaymentCount,0);assert.equal(r.payments[0].status,'unattributed');assert.equal(r.quarantined.length,0);
});

test('valid Auth without a profile is an explicit nonretrying coverage rejection',async()=>{
 for(const mode of ['profile_unavailable','profile_deleted_during_insert','account_unavailable','invalid_jwt']){
  const db={auth:{getUser:async()=>mode==='invalid_jwt'?{data:{user:null},error:{status:401}}:{data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:null}},rpc:async()=>mode==='profile_deleted_during_insert'?{data:null,error:{code:'23503',message:'violates foreign key constraint "checkpoint_profile_retention"'}}:{data:mode,error:null}};
  const edge=load('supabase/premium-checkpoints-rollout/edge/index.ts',{'npm:@supabase/supabase-js@2.83.0':{createClient:()=>db},'./protocol.ts':protocol},{Response,Request,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('No network allowed in regression');},Deno:{serve(){},env:{get:key=>key==='SUPABASE_URL'?'https://esgptfiofoaeguslgvcq.supabase.co':'test-only-placeholder'}}});
  const response=await edge.handleCheckpoint(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer a.b.c','Content-Type':'application/json'},body:JSON.stringify(event())}));
  const body=await response.json();
  if(mode.startsWith('profile_')){assert.equal(response.status,409);assert.equal(body.error,'profile_unavailable');}
  else {assert.equal(response.status,401);assert.equal(body.error,mode==='invalid_jwt'?'unauthorized':'account_unavailable');}
 }
});


test('pinned shared transport rejects alternate hosts and preserves delivery/status rules',async()=>{
 const contract=load('utils/premiumCheckpointContract.ts');
 const runtime=load('utils/premiumCheckpointRuntime.ts',{'./premiumCheckpointContract':contract});
 const endpoint='https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/track-onboarding/premium-checkpoint';
 assert.equal(runtime.CHECKPOINT_ENDPOINT,endpoint);
 const actor={userId:'actor-a',sessionId:'session-a',credentials:{accessToken:'fixture-token'}};let current=actor;
 const body=JSON.stringify(event()),signal=new AbortController().signal;
 assert.throws(()=>runtime.pinnedCheckpointTransport('https://example.invalid',()=>current,async()=>true,async()=>{}),/unapproved_checkpoint_endpoint/);
 for(const [status,ack,want] of [[202,{eventId:event().eventId,status:'accepted'},'ack'],[200,{eventId:event().eventId,status:'duplicate'},'ack'],[202,{eventId:'wrong',status:'accepted'},'retry'],[400,{},'reject'],[401,{},'reject'],[403,{},'reject'],[409,{},'reject'],[408,{},'retry'],[429,{},'retry'],[503,{},'retry']]){
  let sent;const transport=runtime.pinnedCheckpointTransport(endpoint,()=>current,async()=>true,async(url,options)=>(sent={url,options},{status,json:async()=>ack}));
  assert.equal(await transport(body,actor,signal),want);assert.equal(sent.url,endpoint);assert.equal(sent.options.redirect,'error');assert.equal(sent.options.credentials,'omit');assert.equal(sent.options.body,body);assert.equal(sent.options.signal,signal);assert.equal(sent.options.headers.Authorization,'Bearer fixture-token');
 }
 let calls=0;const switched=runtime.pinnedCheckpointTransport(endpoint,()=>current,async()=>{current={...actor};return true;},async()=>{calls++;});
 assert.equal(await switched(body,actor,signal),'reject');assert.equal(calls,0);
});
test('wired auth verifier preserves token refresh and rejects account or session replacement',async()=>{
 const contract=load('utils/premiumCheckpointContract.ts');
 const sessionId='11111111-1111-4111-8111-111111111111';
 const token=(id,n)=>'header.'+Buffer.from(JSON.stringify({session_id:id,n})).toString('base64url')+'.signature';
 let session={user:{id:'actor-a'},access_token:token(sessionId,1)},listener,current,verify,invalidations=0;
 const api=load('utils/premiumCheckpoints.ts',{'react-native':{Platform:{OS:'ios'}},'@/lib/supabase/client':{supabase:{auth:{onAuthStateChange:f=>{listener=f;},getSession:async()=>({data:{session},error:null})}}},'./premiumCheckpointContract':contract,'./premiumCheckpointRuntime':{CHECKPOINT_ENDPOINT:'verified-test-endpoint',pinnedCheckpointTransport:(_endpoint,c,v)=>{current=c;verify=v;return ()=>{};},createCheckpointQueue:()=>({enqueue:()=>true,invalidate:()=>invalidations++}),validDisplayedOffer:()=>true}});
 api.checkpointActor();await Promise.resolve();await Promise.resolve();const actor=current();assert.ok(actor);
 session={user:{id:'actor-a'},access_token:token(sessionId,2)};listener('TOKEN_REFRESHED',session);
 assert.equal(current(),actor);assert.equal(await verify(actor),true);assert.equal(actor.credentials.accessToken,session.access_token);
 session={user:{id:'actor-b'},access_token:token(sessionId,3)};assert.equal(await verify(actor),false);
 session={user:{id:'actor-a'},access_token:token('22222222-2222-4222-8222-222222222222',4)};assert.equal(await verify(actor),false);
 listener('SIGNED_OUT',null);assert.equal(current(),null);assert.equal(await verify(actor),false);assert.ok(invalidations>=2);
});
