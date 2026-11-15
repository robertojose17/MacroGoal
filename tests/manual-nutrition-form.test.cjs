const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'hooks/useManualNutritionEvidence.ts'),'utf8');
const values={calories:100,protein:0,carbs:0,fats:0,fiber:0};
const input={authenticatedOwnerId:'owner',confirmedItemId:'item',loggedIntent:{values,portion:{}}};
function harness({enabled=true,scope=true,begin={status:'receipt_found'},recover={status:'receipt_found'}}={}){
 const refs=[],effects=[],alerts=[],captures=[],calls=[],states=[];let index=0,focusCleanup,focusHandler,appChange,authChange,closed=0;
 const react={useRef:v=>refs[index++]??(refs[index-1]={current:v}),useCallback:f=>f,useEffect:f=>effects.push(f),useState:v=>[v,next=>states.push(next)]};
 let factory;
 const mods={react,'react-native':{Alert:{alert:(...args)=>alerts.push(args)},AppState:{currentState:'active',addEventListener:(_,f)=>{appChange=f;return{remove(){}}}}},
 'expo-router':{useFocusEffect:f=>{focusHandler=f;focusCleanup=f();}},'@/lib/supabase/client':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}},error:null}),onAuthStateChange:f=>{authChange=f;return{data:{subscription:{unsubscribe(){}}}}}}}},
 '@/utils/manualNutritionDeclaration':{captureManualNutrition:(edited,saved)=>{captures.push({edited,saved});return Object.keys(edited).length?{ok:true,declaration:{values:saved,declaredFields:Object.keys(edited)}}:{ok:false,reason:'no_explicit_fields'};}},
 '@/utils/manualNutritionEvidenceServices':{MANUAL_NUTRITION_EVIDENCE_ENABLED:enabled,makeManualNutritionEvidenceServices:isCurrent=>{
  calls.push('factory'); factory={isCurrent,beginConfirmedLog:async arg=>{calls.push(['begin',arg]);return typeof begin==='function'?await begin():begin;},recover:async(...args)=>{calls.push(['recover',...args]);return recover;},pending:async()=>['same-id'],listPending:async actor=>{calls.push(['list',actor]);return[{itemId:'item',requestId:'same-id'}];},discardPending:async(...args)=>{calls.push(['discard',...args]);return true;},dispose:()=>calls.push('dispose')};return factory;
 }}};
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in mods))throw Error(n);return mods[n];}});
 const api=exports.useManualNutritionEvidence(scope,'context',false,()=>closed++);effects.forEach(f=>f());
 return{api,calls,alerts,captures,states,focus:()=>{focusCleanup=focusHandler();},blur:()=>focusCleanup(),background:()=>appChange('background'),changeAccount:()=>authChange('SIGNED_OUT',null),auth:(event,id)=>authChange(event,{user:{id}}),factory:()=>factory,closed:()=>closed};
}
test('enabled invalid capture still suppresses stale navigation',async()=>{
 const h=harness();const snapshot=h.api.snapshot(values);h.blur();assert.equal(await h.api.finish(snapshot,input),true);assert.equal(h.calls.length,0);
});
test('same-owner sign in invalidates active session but token refresh does not',async()=>{
 let resolve;const h=harness({begin:()=>new Promise(r=>resolve=r)});h.api.edited('calories','100');const work=h.api.finish(h.api.snapshot(values),input);
 h.auth('TOKEN_REFRESHED','owner');assert.equal(h.factory().isCurrent('owner'),true);
 h.auth('SIGNED_IN','owner');assert.equal(h.factory().isCurrent('owner'),false);resolve({status:'uncertain',requestId:'same-id'});await work;assert.equal(h.alerts.length,0);
});
test('OFF captures no declarations and performs no metadata service I/O',async()=>{
 const h=harness({enabled:false});h.api.edited('calories','100');assert.equal(await h.api.finish(h.api.snapshot(values),input),false);assert.equal(h.calls.length,0);assert.equal(h.captures.length,0);
});
test('library/recovery excluded by scope',async()=>{
 const h=harness({scope:false});h.api.edited('calories','100');await h.api.finish(h.api.snapshot(values),input);assert.equal(h.calls.length,0);
});
test('nonempty saved values alone do not declare AI-prefilled fields',async()=>{
 const h=harness();assert.equal(await h.api.finish(h.api.snapshot(values),input),false);assert.equal(h.calls.length,0);
});
test('only real edited fields enter captured snapshot, later edits do not mutate it',async()=>{
 const h=harness();h.api.edited('protein','0');const s=h.api.snapshot(values);h.api.edited('calories','999');await h.api.finish(s,input);
 assert.deepEqual(Object.keys(h.captures[0].edited),['protein']);assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==='begin').length,1);
});
test('uncertain shows food-saved wording and explicit same-ID metadata-only recovery',async()=>{
 const h=harness({begin:{status:'uncertain',requestId:'same-id'}});h.api.edited('calories','100');const snapshot=h.api.snapshot(values);assert.equal(await h.api.finish(snapshot,input),true);h.api.releaseSave(snapshot);
 assert.match(h.alerts[0][1],/food is in your diary/);assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==='recover').length,0);
 h.alerts[0][2][1].onPress();await new Promise(setImmediate);
 assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='recover'),['recover','owner','item','same-id']);assert.equal(h.closed(),1);
});
test('blur during response suppresses UI and disposes service',async()=>{
 let resolve;const h=harness({begin:()=>new Promise(r=>resolve=r)});h.api.edited('calories','100');const work=h.api.finish(h.api.snapshot(values),input);h.blur();resolve({status:'uncertain',requestId:'same-id'});await work;assert.equal(h.alerts.length,0);assert.equal(h.factory().isCurrent('owner'),false);
});
test('account change suppresses delayed metadata result and all callbacks',async()=>{
 let resolve;const h=harness({begin:()=>new Promise(r=>resolve=r)});h.api.edited('calories','100');const work=h.api.finish(h.api.snapshot(values),input);h.changeAccount();resolve({status:'uncertain',requestId:'same-id'});await work;assert.equal(h.alerts.length,0);assert.equal(h.factory().isCurrent('owner'),false);
});
test('background invalidates prior captured submission without creating service',async()=>{
 const h=harness();h.api.edited('calories','100');const s=h.api.snapshot(values);h.background();assert.equal(await h.api.finish(s,input),true);assert.equal(h.calls.length,0);
});
test('food form has one log_food call, optional separate metadata catch, one timestamp',()=>{
 const app=fs.readFileSync(path.join(root,'app/my-foods-create.tsx'),'utf8');
 assert.equal((app.match(/supabase\.rpc\('log_food'/g)||[]).length,1);
 assert.match(app,/effectiveMode === 'diary' && !recoveryManual/);
 assert.match(app,/p_logged_at: loggedAt/);assert.match(app,/logged_at: loggedAt/);
 assert.ok(app.indexOf('evidence.snapshot(savedValues)')<app.indexOf('await supabase.auth.getUser()'));
 assert.match(app,/catch \{ \/\* Keep the saved food/);
 for(const n of Object.keys(values))assert.ok(app.includes(`evidence.edited('${n}', text)`));
 assert.ok(!source.includes("rpc('log_food'"));
});
test('both changed TSX/TS files transpile without syntax diagnostics',()=>{
 for(const name of ['app/my-foods-create.tsx','hooks/useManualNutritionEvidence.ts']){
  const result=ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'),{fileName:name,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
  assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,name);
 }
});

test('pending review explicit own actor and exact recovery, no food save',async()=>{
 const h=harness();assert.equal(h.calls.length,0);await h.api.reviewPending();assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='list'),['list','owner']);
 h.api.selectPending({itemId:'item',requestId:'same-id'});h.alerts.at(-1)[2][1].onPress();await new Promise(setImmediate);
 assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='recover'),['recover','owner','item','same-id']);assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==='begin').length,0);
});
test('discard explicit exact local request, stale callback suppressed',async()=>{
 const h=harness();await h.api.reviewPending();h.api.selectPending({itemId:'item',requestId:'same-id'});assert.match(h.alerts.at(-1)[1],/does not delete the food or revoke/);
 h.alerts.at(-1)[2][2].onPress();await new Promise(setImmediate);assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='discard'),['discard','owner','item','same-id']);
 h.api.selectPending({itemId:'item',requestId:'other'});const cb=h.alerts.at(-1)[2][1].onPress;h.blur();cb();await new Promise(setImmediate);assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==='recover').length,0);
});
test('OFF pending review performs no service work',async()=>{const h=harness({enabled:false});await h.api.reviewPending();assert.equal(h.calls.length,0);});
test('refocus clears displayed pending descriptors without automatic work',async()=>{
 const h=harness();await h.api.reviewPending();h.blur();const calls=h.calls.length;h.focus();assert.equal(h.calls.length,calls);assert.equal(h.states.at(-1),false);assert.equal(h.states.at(-2).length,0);
});
test('save reservation blocks recovery until matching finally releases it',async()=>{
 const h=harness();const s=h.api.snapshot(values);assert.equal(h.api.isBusy(),true);await h.api.reviewPending();assert.equal(h.calls.length,0);h.api.releaseSave({...s,epoch:s.epoch+1});assert.equal(h.api.isBusy(),true);h.api.releaseSave(s);assert.equal(h.api.isBusy(),false);await h.api.reviewPending();assert.ok(h.calls.find(c=>Array.isArray(c)&&c[0]==='list'));
});
test('corrupt descriptor only allows local discard and retains list service',async()=>{
 const h=harness();await h.api.reviewPending();h.api.selectPending({itemId:null,requestId:'bad-id',invalid:true});const buttons=h.alerts.at(-1)[2];assert.equal(buttons.length,2);assert.match(buttons[1].text,/Discard/);buttons[1].onPress();await new Promise(setImmediate);assert.deepEqual(h.calls.find(c=>Array.isArray(c)&&c[0]==='discard'),['discard','owner',null,'bad-id']);assert.equal(h.calls.filter(c=>c==='factory').length,1);assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==='recover').length,0);
});
