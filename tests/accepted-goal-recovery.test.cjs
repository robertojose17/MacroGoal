const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function load(file,scope={}) {
 let source=stripTypeScriptTypes(fs.readFileSync(file,'utf8'));
 const names=[...source.matchAll(/export (?:async )?function (\w+)/g)].map(x=>x[1]);
 source=source.replace(/^import .*;$/mg,'').replace(/export /g,'');
 return vm.runInNewContext(source+'\n;({'+names.join(',')+'})',scope);
}
const row=()=>({id:'goal',updated_at:null,user_id:'owner',is_active:true,daily_calories:2000,protein_g:0,carbs_g:0,fats_g:0,fiber_g:0});
function helper(result){const calls=[];const q={select(){return q},eq(k,v){calls.push([k,v]);return q},maybeSingle:async()=>result};return{...load('utils/activeGoal.ts',{supabase:{from:()=>q}}),calls};}
test('accepted goal preserves explicit zero and nullable version without synthetic targets',()=>{
 const h=helper({data:row()}),s=h.acceptedGoalSnapshot(row());assert.equal(s.version,'accepted-goal-v1');assert.equal(s.updated_at,null);assert.equal(s.protein_g,0);
 for(const x of [null,undefined,NaN,Infinity,-1,'0'])assert.throws(()=>h.acceptedGoalSnapshot({...row(),protein_g:x}),/unavailable/);
 assert.throws(()=>h.acceptedGoalSnapshot({...row(),daily_calories:0}));assert.throws(()=>h.acceptedGoalSnapshot({...row(),updated_at:undefined}));
});
test('missing, duplicate/error, inactive and wrong-owner goal fail closed',async()=>{
 for(const result of [{data:null},{error:{code:'PGRST116'}},{data:{...row(),is_active:false}},{data:{...row(),user_id:'other'}}])await assert.rejects(helper(result).readActiveGoal('owner'));
 const h=helper({data:row()});assert.equal((await h.readActiveGoal('owner')).id,'goal');assert.deepEqual(h.calls,[['user_id','owner'],['is_active',true]]);
});
test('exact accepted goal mismatch cannot pass generation recheck',async()=>{
 const h=helper({data:row()});await assert.rejects(h.assertActiveGoal('owner',{...h.acceptedGoalSnapshot(row()),protein_g:1}),/goal_changed/);
});
test('goal bus keeps string payload, isolates failed consumer and unsubscribes',()=>{
 const bus=load('utils/goalChangeEvents.ts'),seen=[];bus.subscribeGoalChanged(()=>{throw Error('consumer')});const off=bus.subscribeGoalChanged(id=>seen.push(id));bus.emitGoalChanged('owner');bus.emitGoalChanged();off();bus.emitGoalChanged('other');assert.deepEqual(seen,['owner',undefined]);
});
test('Food variants expose unavailable instead of invented goals and do not auto-generate recipes',()=>{
 for(const suffix of ['', '.ios','.android']){const s=fs.readFileSync(`app/(tabs)/(home)/index${suffix}.tsx`,'utf8');assert.match(s,/readActiveGoal\(user.id\)/);assert.doesNotMatch(s,/setGoal\(\{ daily_calories: 2000|goal\?\.\w+ \|\| (2000|150|200|65|30)/);assert.match(s,/owner === goalOwner.current/);assert.match(s,/revision !== goalLoadRevision.current/);assert.doesNotMatch(s,/await loadDailySuggestions\(goals\)/);}
});
test('Swift availability gate rejects legacy caches and leaves valid views behind explicit true',()=>{
 const swift=fs.readFileSync('targets/macro-widget/MacroWidget.swift','utf8'),js=fs.readFileSync('contexts/WidgetContext.tsx','utf8');assert.match(swift,/var available: Bool\? = nil/);assert.match(swift,/entry.data.available != true/);assert.match(swift,/Goals unavailable/);assert.match(js,/available: false/);assert.doesNotMatch(js,/goalData\?\.\w+ \?\? \d/);assert.match(js,/ticket !== revision.current/);assert.match(js,/currentUserIdRef.current === userId\) return/);
});
function widgetFetch(scope) {
 const ts=require('typescript'),file='contexts/WidgetContext.tsx',ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
 const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText()==='fetchAndSync')fn=n.initializer.arguments[0];ts.forEachChild(n,visit)};visit(ast);assert.ok(fn);
 vm.runInNewContext(ts.transpileModule('globalThis.run='+fn.getText(),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope.run;
}
function widgetScope(read) {
 const writes=[];const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{current_streak:0}}),then:resolve=>Promise.resolve({data:[]}).then(resolve)};
 return {writes,readActiveGoal:read,revision:{current:0},currentUserIdRef:{current:'owner'},unavailable:()=>writes.push({available:false}),writeToWidget:x=>writes.push(x),console:{log(){},warn(){}},supabase:{from:()=>q,auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})}}};
}
test('actual widget fetch writes verified explicit zero goals, and rejects missing goal',async()=>{
 const valid=widgetScope(async()=>row());await widgetFetch(valid)('owner');assert.equal(valid.writes.length,1);assert.equal(valid.writes[0].available,true);assert.equal(valid.writes[0].proteinGoal,0);
 const invalid=widgetScope(async()=>{throw Error('unavailable')});await widgetFetch(invalid)('owner');assert.deepEqual(invalid.writes,[{available:false}]);
});
test('actual late widget response cannot publish after actor or goal epoch changes',async()=>{
 for(const change of ['actor','goal']){let release;const scope=widgetScope(()=>new Promise(resolve=>release=resolve));const run=widgetFetch(scope)('owner');if(change==='actor')scope.currentUserIdRef.current='other';else scope.revision.current++;release(row());await run;assert.equal(scope.writes.length,0);}
});
