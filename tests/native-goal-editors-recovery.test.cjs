const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
function callback(path, name, context) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node.initializer; ts.forEachChild(node, visit); }
  visit(source); assert.ok(found, name);
  if (ts.isCallExpression(found) && found.expression.getText(source) === 'useCallback') found = found.arguments[0];
  const js = ts.transpileModule(`(${found.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return vm.runInNewContext(js, context);
}
const snapshot = () => ({ profile: { id:'owner', timezone:'UTC', updated_at:'2026-11-12T00:01:02.123456Z', preferred_units:'metric', created_at:'2020-01-01T12:00:00Z', journey_start_weight:80, current_weight:80, activity_level:'moderate' }, goal: { id:'goal', updated_at:null,daily_calories:2000,fiber_g:0,start_date:'2020-01-01' } });
function custom(overrides={}) {
 const calls=[], alerts=[];
 const editor={snapshot:snapshot(),pending:false,busy:false,isCurrent:()=>true,run:async(...args)=>{calls.push(args);},...overrides};
 const run=callback('app/custom-macros.tsx','handleSave',{editor,isValid:true,proteinNum:30,carbsNum:40,fatsNum:30,t:x=>x,Alert:{alert:(...args)=>alerts.push(args)}});
 return {run,calls,alerts,editor};
}
test('custom split preserves calories, zero fibre and exact nullable/microsecond CAS',async()=>{
 const x=custom();await x.run();assert.equal(x.calls.length,1);const input=x.calls[0][1];assert.equal(input.expectedProfileUpdatedAt,'2026-11-12T00:01:02.123456Z');assert.equal(input.expectedGoal.updated_at,null);assert.equal(input.goal.daily_calories,2000);assert.equal(input.goal.fiber_g,0);assert.deepEqual(JSON.parse(JSON.stringify(input.profile)),{});assert.equal(x.alerts.length,1);
});
for (const [name, state] of [['pending',{pending:true}],['busy',{busy:true}],['missing snapshot',{snapshot:null}]])test(`custom save blocks ${name}`,async()=>{const x=custom(state);await x.run();assert.equal(x.calls.length,0);});
test('failed post-save verification produces no success',async()=>{const x=custom({run:async()=>{throw new Error('readback_failed');}});await x.run();assert.equal(x.alerts[0][0],'common.error');});
for (const path of ['app/settings.tsx','app/settings.ios.tsx','app/settings.android.tsx']) {
 test(`${path}: no direct goal writes or legacy adaptive enable`,()=>{const text=read(path);assert.doesNotMatch(text,/\.from\('goals'\)\s*\.(insert|update|delete)/);assert.doesNotMatch(text,/\.update\(\{\s*(adaptive_tdee_enabled|adjustment_day)/);assert.match(text,/observation\.updateSettings/);assert.match(text,/modalSnapshot\.current = \{ profile: \{ \.\.\.editor.snapshot.profile \}/);});
 test(`${path}: Android dismissal ignores supplied date`,async()=>{let writes=0,closed=false;const current={current:()=>true};const fn=callback(path,'handleStartDateChange',{restartCurrent:current,setShowDatePicker:()=>{closed=true},setSelectedDate:()=>{},Platform:{OS:'android'},saveStartDate:()=>{writes++}});await fn({type:'dismissed'},new Date());assert.equal(writes,0);assert.equal(closed,true);assert.equal(current.current(),false);});
 test(`${path}: restart sends original snapshots, no weight fabrication`,async()=>{
  const snap=snapshot(), calls=[], errors=[];const date=new Date('2024-04-03T12:00:00Z');
  const fn=callback(path,'saveStartDate',{restartBounds:{current:{timezone:'UTC',today:'2026-11-12',created:'2020-01-01'}},restartTimezone:{current:Intl.DateTimeFormat().resolvedOptions().timeZone},restartSnapshot:{current:snap},restartCurrent:{current:()=>true},saving:false,editor:{pending:false,busy:false,run:async(...a)=>calls.push(a)},toLocalDateString:d=>d.toISOString().slice(0,10),setSaving:()=>{},loadUserData:async()=>{},setShowDatePicker:()=>{},Alert:{alert:(...a)=>errors.push(a)}});
  await fn(date);assert.equal(calls.length,1);assert.equal(calls[0][0],'restart');const p=calls[0][1];assert.equal(p.expectedGoal,snap.goal);assert.equal(p.expectedProfileUpdatedAt,snap.profile.updated_at);assert.equal(p.startWeightKg,80);assert.equal(p.currentWeightKg,80);
 });
}
test('percent blanks are not converted to zero; explicit zero allowed',()=>{for(const p of ['app/custom-macros.tsx','app/edit-goals.tsx']){assert.doesNotMatch(read(p),/parseFloat\([^)]*\)\s*\|\|\s*0/);assert.match(read(p),/trim\(\) === '' \? NaN/);}});
test('session is shared and durable; explicit replay never recalculates inputs',()=>{const text=read('hooks/useAcceptedGoalEditor.ts');assert.match(read('utils/acceptedGoalSession.ts'),/const sessions = new Map/);assert.match(text,/await bound.recover/);assert.match(text,/target.retry\(\(\) => isCurrent\(id, revision\)\)/);assert.match(text,/other.ownsPending\(\)/);assert.match(text,/await refresh\(\)/);});
for (const [label, current, pending] of [['blurred',false,false],['pending',true,true]]) test(`restart blocks ${label} callback`,async()=>{
 let writes=0;
 const fn=callback('app/settings.tsx','saveStartDate',{restartSnapshot:{current:snapshot()},restartCurrent:{current:()=>current},saving:false,editor:{pending,busy:false,run:async()=>writes++}});
 await fn(new Date());assert.equal(writes,0);
});
test('modal profile CAS is not rebased and blank imperial inches reject before write',async()=>{
 let writes=0,errors=[];const snap=snapshot();snap.profile.preferred_units='imperial';
 const fn=callback('app/settings.tsx','saveEditedField',{modalSnapshot:{current:snap},modalCurrent:{current:()=>true},editingField:'height',saving:false,editor:{busy:false,pending:false},editValue:'5',editValue2:' ',setSaving:()=>{},saveProfilePatch:async()=>writes++,Alert:{alert:(...a)=>errors.push(a)}});
 await fn();assert.equal(writes,0);assert.equal(errors.length,1);
});

test('restart rejects timezone change before sending',async()=>{let writes=0, errors=0;const fn=callback('app/settings.tsx','saveStartDate',{restartSnapshot:{current:snapshot()},restartCurrent:{current:()=>true},restartTimezone:{current:'not-the-current-zone'},saving:false,editor:{pending:false,busy:false,run:async()=>writes++},Alert:{alert:()=>errors++}});await fn(new Date());assert.equal(writes,0);assert.equal(errors,1);});

const boundsModule={exports:{}};
vm.runInNewContext(ts.transpileModule(read('utils/journeyDateBounds.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:boundsModule.exports,Date,Intl});
const {captureJourneyDateBounds}=boundsModule.exports;
test('account civil dates preserve midnight boundaries across device timezone',()=>{const now=new Date('2026-11-12T00:30:00Z');const profile={timezone:'America/Los_Angeles',created_at:'2020-01-01T01:00:00Z'};const b=captureJourneyDateBounds(profile,now);assert.equal(b.today,'2026-11-11');assert.equal(b.created,'2019-12-31');assert.equal(captureJourneyDateBounds({...profile,timezone:'Pacific/Kiritimati'},now).today,'2026-11-12');});
for(const timezone of [null,'','not-a-zone'])test(`invalid account timezone ${timezone} fails closed`,()=>assert.throws(()=>captureJourneyDateBounds({timezone,created_at:'2020-01-01T00:00:00Z'})));
test('date picker uses its local civil components, never UTC serialization',()=>{for(const p of ['app/settings.tsx','app/settings.ios.tsx','app/settings.android.tsx']){const s=read(p);assert.match(s,/startDate = toLocalDateString\(date\), \{ today, created \} = bounds/);assert.match(s,/captureJourneyDateBounds\(snapshot.profile\)/);}});

for(const path of ['app/settings.tsx','app/settings.ios.tsx','app/settings.android.tsx']) test(`${path}: stale loader cannot publish profile or stop successor loading`,async()=>{
 let resolve, publications=0, stopped=0;
 const screenActive={current:true}, loadEpoch={current:0};
 const editor={refresh:()=>new Promise(r=>resolve=r),capture:()=>()=>true};
 const fn=callback(path,'loadUserData',{screenActive,loadEpoch,editor,refreshAcceptedEditor:editor.refresh,captureAcceptedEditor:editor.capture,setLoading:value=>{if(!value)stopped++},setRefreshing:()=>{},setUser:()=>publications++,setGoal:()=>publications++,setIsAdmin:()=>publications++,setAutoShare:()=>publications++,setCoachActions:()=>publications++,setLastAdjustMacrosAction:()=>publications++});
 const flight=fn();screenActive.current=false;loadEpoch.current++;resolve(snapshot());await flight;assert.equal(publications,0);assert.equal(stopped,0);
});
