const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const goal=()=>({version:'accepted-goal-v1',id:'g',updated_at:null,daily_calories:2000,protein_g:0,carbs_g:300,fats_g:60,fiber_g:0});
function moduleFrom(file,imports){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>imports[n]});return exports;}
function setup(){
 let actor='owner',current=true,reads=0,sessionHook,invokeHook,readHook;const calls=[];
 const active=moduleFrom('utils/activeGoal.ts',{'@/lib/supabase/client':{}});
 const supabase={auth:{getSession:async()=>{if(sessionHook)await sessionHook();return{data:{session:{user:{id:actor}}}}}},functions:{invoke:async(name,{body})=>{calls.push({name,body});return invokeHook?invokeHook():{data:{goal_snapshot:goal(),recipes:[]}}}}};
 const api=moduleFrom('utils/acceptedGoalGeneration.ts',{'@/lib/supabase/client':{supabase},'./activeGoal':{...active,assertActiveGoal:async()=>{reads++;if(readHook)await readHook(reads)}}});
 return {api,calls,isCurrent:()=>current,setCurrent:x=>current=x,setActor:x=>actor=x,setSession:f=>sessionHook=f,setInvoke:f=>invokeHook=f,setRead:f=>readHook=f};
}
test('generation binds exact expected_goal, preserves zero/null and userPreferences, rechecks before publishing',async()=>{
 const h=setup(),body={userPreferences:{disliked_foods:'nuts'}};await h.api.invokeAcceptedGoalGeneration('generate-meal-plan','owner',goal(),body,h.isCurrent);assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.expected_goal.protein_g,0);assert.equal(h.calls[0].body.expected_goal.updated_at,null);assert.equal(h.calls[0].body.userPreferences.disliked_foods,'nuts');
});
test('caller mutations during await cannot alter reviewed snapshot or preferences',async()=>{
 const h=setup(),g=goal(),b={userPreferences:{disliked_foods:'nuts'}};let release,count=0;h.setSession(()=>++count===1?new Promise(r=>release=r):undefined);const run=h.api.invokeAcceptedGoalGeneration('generate-meal-plan','owner',g,b,h.isCurrent);g.protein_g=99;b.userPreferences.disliked_foods='fish';release();await run;assert.equal(h.calls[0].body.expected_goal.protein_g,0);assert.equal(h.calls[0].body.userPreferences.disliked_foods,'nuts');
});
test('missing goal, stale goal, wrong actor and final cancellation send no provider request',async()=>{
 for(const mode of ['goal','actor','cancel']){const h=setup();if(mode==='goal')h.setRead(()=>{throw Error('goal_changed')});if(mode==='actor')h.setActor('other');if(mode==='cancel'){let count=0;h.setSession(()=>{if(++count===2)h.setCurrent(false)})}await assert.rejects(h.api.invokeAcceptedGoalGeneration('recipe-finder','owner',goal(),{},h.isCurrent));assert.equal(h.calls.length,0);}
});
test('malformed/mismatched response, late cancellation and post-write goal change reject with no retries',async()=>{
 for(const mode of ['missing','mismatch','cancel','post']){const h=setup();h.setInvoke(async()=>{if(mode==='cancel')h.setCurrent(false);return{data:{goal_snapshot:mode==='missing'?null:{...goal(),...(mode==='mismatch'?{protein_g:10}:{})}}}});if(mode==='post')h.setRead(n=>{if(n===2)throw Error('goal_changed')});await assert.rejects(h.api.invokeAcceptedGoalGeneration('recipe-finder','owner',goal(),{},h.isCurrent));assert.equal(h.calls.length,1);}
});
function callback(file,name,scope){const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText()===name)fn=n.initializer.arguments[0];ts.forEachChild(n,visit)};visit(ast);assert.ok(fn);vm.runInNewContext(ts.transpileModule('globalThis.run='+fn.getText(),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope.run;}
test('actual Generate and Replace share synchronous lock and preserve preferences in both bodies',async()=>{
 let release;const calls=[],plans=[],scope={userGoals:{daily_calories:2000},userPreferences:{disliked_foods:'nuts'},goalContext:{current:{owner:'owner',snapshot:goal()}},generationBusy:{current:false},generationEpoch:{current:0},isMounted:{current:true},foodPrefs:'',replaceText:'rice',replaceTarget:{mealType:'lunch'},setStep(){},setReplacing(){},setGeneratedPlan:x=>plans.push(x),setReplaceSheetVisible(){},showToast(){},t:x=>x,Alert:{alert(){}},i18n:{language:'es'},console:{log(){},error(){}},getMealItems:()=>[],coerceBackendPlan:x=>x,normalizePlan:x=>x,invokeAcceptedGoalGeneration:async(...args)=>{calls.push(args);return new Promise(r=>release=r)}};
 const generate=callback('app/ai-meal-planner.tsx','handleGenerate',scope),replace=callback('app/ai-meal-planner.tsx','handleReplace',scope);const first=generate();await replace();assert.equal(calls.length,1);release({readyToSave:true,planData:{}});await first;const second=replace();assert.equal(calls.length,2);for(const call of calls)assert.equal(call[3].userPreferences.disliked_foods,'nuts');scope.generationEpoch.current++;release({readyToSave:true,planData:{}});await second;assert.equal(plans.length,1);
});
test('personalized recipe cache is not shared across users or goals and opening Food does not auto-generate',()=>{
 const hook=fs.readFileSync('hooks/useRecipeFinder.ts','utf8');assert.doesNotMatch(hook,/AsyncStorage|@recipe_suggestions_/);assert.match(hook,/suggestionsOwner.current/);assert.match(hook,/subscribeGoalChanged/);assert.match(hook,/invokeAcceptedGoalGeneration\('recipe-finder'/);
});
test('actual diary callback rejects stale context before writes and fences partial write without success/retry',async()=>{
 for(const failAt of [1,3]){
  let checks=0,foods=0,rpcs=0,toasts=0;const scope={generationBusy:{current:false},writeBlocked:{current:false},isMounted:{current:true},capturePlannerWrite:()=>({owner:'owner',check:async()=>{if(++checks===failAt)throw Error('account_changed')}}),getTodayStr:()=> '2026-11-12',showToast:()=>toasts++,t:x=>x,Alert:{alert(){}},i18n:{language:'en'},console:{log(){},error(){}},supabase:{from:()=>({insert(){foods++;return this},select(){return this},single:async()=>({data:{id:'food'}})}),rpc:async()=>{rpcs++;return{data:{meal_item_id:'item'}}}}};
  const add=callback('app/ai-meal-planner.tsx','handleAddFood',scope);await add({name:'Water',serving_unit:'g',serving_size:100,calories:0,protein:0,carbs:0,fats:0,fiber:0},'lunch');assert.equal(foods,failAt===1?0:1);assert.equal(rpcs,0);assert.equal(toasts,0);assert.equal(scope.writeBlocked.current,failAt===3);if(failAt===3){await add({name:'Water'},'lunch');assert.equal(foods,1);}
 }
});
test('plan helpers verify optional expected actor after their final auth wait before insert',async()=>{
 let inserts=0,count=0;const db={auth:{getUser:async()=>({data:{user:{id:++count===1?'owner':'other'}}})},from:()=>({insert(){inserts++;return this},select(){return this},single:async()=>({data:{id:'plan'}})})};
 const api=moduleFrom('utils/mealPlansApi.ts',{'@/lib/supabase/client':{supabase:db},'@/utils/dateUtils':{toLocalDateString:()=> '2026-11-12'}});
 await assert.rejects(api.createMealPlan({name:'P',start_date:'2026-11-12',end_date:'2026-11-12'},{expectedUserId:'owner',isCurrent:()=>true}),/account_changed/);assert.equal(inserts,0);
 await assert.rejects(api.addMealPlanItem('p',{date:'2026-11-12',meal_type:'lunch',food_name:'Water'},{expectedUserId:'owner',isCurrent:()=>true}),/account_changed/);assert.equal(inserts,0);
});
