const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {createClient}=require('@supabase/supabase-js');
const exportsBox={};
const code=ts.transpileModule(fs.readFileSync('features/communityPrivacyV2/communityPrivacyRolloutController.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:exportsBox,AbortController,Headers,setTimeout,clearTimeout,Date});
const {applyCommunityPrivacyAbort,createCommunityPrivacyRolloutController}=exportsBox;
const nutritionExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('utils/profileNutritionTotals.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:nutritionExports,Date});
const {profileNutritionByDate}=nutritionExports;
test('terminal real SDK maybeSingle retains explicit token and abort',async()=>{
 let calls=0,authorization,signal;
 const client=createClient('https://example.supabase.co','public-test',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async (_url,init)=>{calls++; authorization=new Headers(init.headers).get('Authorization');signal=init.signal; return new Response('[]',{status:200,headers:{'content-type':'application/json'}});}}});
 const abort=new AbortController();
 const query=client.from('goals').select('id').maybeSingle().setHeader('Authorization','Bearer scoped-test-token');
 const result=await applyCommunityPrivacyAbort(query,abort.signal);
 assert.equal(result.error,null);assert.equal(result.data,null);assert.equal(calls,1);assert.equal(authorization,'Bearer scoped-test-token');assert.equal(signal,abort.signal);
});
test('adapter missing abort is rejected before then',()=>{
 let executions=0;
 assert.throws(()=>applyCommunityPrivacyAbort({then(){executions++;}},new AbortController().signal),/unavailable/);
 assert.equal(executions,0);
});
test('signout aborts inflight protected request and prevents late success',async(t)=>{
 let notify;let state;let release;let observedSignal;
 const session={userId:'owner',sessionKey:'session',accessToken:'scoped',isAnonymous:false,expiresAtSeconds:Date.now()/1000+60};
 state={status:'ready',session};
 const binding={start(){notify();},stop(){},subscribe(fn){notify=fn;return()=>{};},getSnapshot(){return state;},async getSession(){return state.session;}};
 const controller=createCommunityPrivacyRolloutController({requested:true,createAuthBinding:()=>binding,eligibility:async()=>({version:1,enabled:true,rollout:'general'})});
 t.after(()=>controller.stop());
 controller.start();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(controller.getSnapshot().status,'ready');
 const scope=controller.getScope();
 assert.throws(()=>scope.assertActor('another'),/unavailable/);
 const query={then(resolve){release=resolve;},setHeader(name,value){assert.equal(name,'Authorization');assert.equal(value,'Bearer scoped');return this;},abortSignal(signal){observedSignal=signal;return this;}};
 const pending=scope.request(query);await Promise.resolve();
 state={status:'signed_out',session:null};notify();
 assert.equal(observedSignal.aborted,true);release({data:'late'});
 await assert.rejects(pending,/unavailable/);controller.stop();
});
for(const suffix of ['', '.ios','.android'])test(`profile${suffix} preserves unknown targets, zero and latest-owner guards`,()=>{
 const source=fs.readFileSync(`app/(tabs)/profile${suffix}.tsx`,'utf8');
 assert.doesNotMatch(source,/goal\?\.[a-z_]+ \|\| (2000|150|200|65|30)/);
 assert.doesNotMatch(source,/daily_calories \?\? 2000|protein_g \?\? 150/);
 assert.match(source,/acceptedGoalSnapshot\(goalsResult.data\)/);
 assert.match(source,/goal\?\.protein_g \?\? null/);
 assert.match(source,/setGoal\(verifiedGoal\)/);
 assert.match(source,/revision !== scoreRead.current \|\| actorRef.current !== userId/);
 assert.match(source,/revision !== nutritionRead.current \|\| actorRef.current !== userId/);
 assert.match(source,/onAuthStateChange/);
 assert.match(source,/currentUserId && posts.map/);
 assert.match(source,/consistencyScore === null \? '—'/);
});
function scoreHarness(responses){
 const source=fs.readFileSync('app/(tabs)/profile.tsx','utf8');
 const chunk=source.slice(source.indexOf('  const loadConsistencyScore ='),source.indexOf('  const loadData ='));
 const writes=[];const scoreRead={current:0};const actorRef={current:'owner'};const profileFocused={current:true};
 const query=new Proxy({}, {get:()=>()=>query});
 const scope={assertActor(){},assertCurrent(){},request(){return responses.shift();}};
 const context=vm.createContext({profileNutritionByDate,scoreRead,actorRef,profileFocused,activation:{scopeKey:'x'},supabase:{from:()=>query},withCommunityPrivacyScope:fn=>fn(scope),toLocalDateString:d=>d.toISOString().slice(0,10),calcDailyScore:(_tracked,_cal,target,_protein,proteinTarget)=>target===2000&&proteinTarget===0?10:5,setConsistencyScore:value=>writes.push(value),console:{log(){},error(){}}});
 vm.runInContext(ts.transpileModule(chunk+'\nglobalThis.runScore=loadConsistencyScore;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {run:()=>context.runScore('owner'),writes,actorRef,profileFocused};
}
test('runtime score preserves valid zero protein and rejects missing targets',async()=>{
 const h=scoreHarness([Promise.resolve({data:[]}),Promise.resolve({data:{daily_calories:2000,protein_g:0}}),Promise.resolve({data:[]}),Promise.resolve({data:null})]);
 await h.run();await h.run();assert.deepEqual(h.writes,[10,null]);
});
test('runtime late score cannot overwrite newer request or different actor',async()=>{
 let release;const slow=new Promise(resolve=>release=resolve);
 const h=scoreHarness([slow,Promise.resolve({data:{daily_calories:1500,protein_g:50}}),Promise.resolve({data:[]}),Promise.resolve({data:{daily_calories:2000,protein_g:0}})]);
 const old=h.run();await h.run();release({data:[]});await old;assert.deepEqual(h.writes,[10]);
 let finish;const late=new Promise(resolve=>finish=resolve);const another=scoreHarness([late,Promise.resolve({data:{daily_calories:2000,protein_g:0}})]);
 const pending=another.run();another.actorRef.current='other';finish({data:[]});await pending;assert.deepEqual(another.writes,[]);
});
