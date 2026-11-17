const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const text=fs.readFileSync('app/edit-goals.tsx','utf8'),source=ts.createSourceFile('edit-goals.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='handleSave')handler=n.initializer;ts.forEachChild(n,visit);}visit(source);assert.ok(handler);
const js=ts.transpileModule(`(${handler.getText(source)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup(platform='web',overrides={}){
 const events=[],alerts=[],errors=[],calls=[];
 const editor={snapshot:{profile:{id:'owner',updated_at:'original'},goal:{id:'goal',target_weight:70}},pending:false,busy:false,isCurrent:()=>true,run:async(...args)=>{calls.push(args);events.push('verified');}};
 const context={editor,Platform:{OS:platform},router:{back:()=>events.push('back')},Alert:{alert:(...a)=>alerts.push(a)},setSaveError:x=>errors.push(x),t:x=>x,console:{log(){},error(){}},validateMacros:()=>true,macroError:'invalid macros',formError:'',weightKg:80,heightCm:180,age:30,sex:'male',activityLevel:'moderate',goalType:'lose',lossRateLbsPerWeek:1,macroPreset:'balanced',calculateBMR:()=>1700,calculateTDEE:()=>2400,calculateTargetCalories:()=>2000,calculateMacrosWithPreset:()=>({protein:150,carbs:200,fats:67,fiber:28}),...overrides};
 return {context,events,alerts,errors,calls,run:vm.runInNewContext(js,context)};
}
test('web waits for verified run then navigates once, no alert or second save',async()=>{
 const h=setup();let release;h.context.editor.run=(...a)=>{h.calls.push(a);return new Promise(r=>release=()=>{h.events.push('verified');r();});};
 const p=h.run();assert.deepEqual(h.events,[]);assert.equal(h.calls.length,1);release();await p;assert.deepEqual(h.events,['verified','back']);assert.equal(h.alerts.length,0);assert.equal(h.calls.length,1);
});
test('web readback failure never navigates and renders local error',async()=>{const h=setup();h.context.editor.run=async()=>{throw Error('readback failed');};await h.run();assert.deepEqual(h.events,[]);assert.equal(h.errors.at(-1),'readback failed');assert.equal(h.alerts.length,0);});
test('direction validation visible with no RPC or navigation',async()=>{const h=setup();h.context.editor.snapshot.goal.target_weight=90;await h.run();assert.equal(h.calls.length,0);assert.deepEqual(h.events,[]);assert.match(h.errors.at(-1),/target weight/);});
test('calculation error visible with no RPC',async()=>{const h=setup('web',{calculateBMR:()=>{throw Error('invalid calculation');}});await h.run();assert.equal(h.calls.length,0);assert.equal(h.errors.at(-1),'invalid calculation');});
for(const platform of ['ios','android'])test(`${platform} keeps success acknowledgement then navigation`,async()=>{const h=setup(platform);await h.run();assert.deepEqual(h.events,['verified']);assert.equal(h.alerts.length,1);h.alerts[0][2][0].onPress();assert.deepEqual(h.events,['verified','back']);});
test('native errors retain alert and do not navigate',async()=>{const h=setup('ios',{calculateBMR:()=>{throw Error('bad');}});await h.run();assert.equal(h.alerts[0][1],'bad');assert.deepEqual(h.events,[]);});
for(const guard of ['pending','busy'])test(`${guard} prevents saving and navigation`,async()=>{const h=setup();h.context.editor[guard]=true;await h.run();assert.equal(h.calls.length,0);assert.deepEqual(h.events,[]);});
test('invalid macros keep existing inline validation and never save',async()=>{const h=setup('web',{validateMacros:()=>false});await h.run();assert.equal(h.calls.length,0);assert.deepEqual(h.events,[]);assert.match(text,/macroError/);});
test('local save error is separate from blocking profile validity and accessible',()=>{assert.match(text,/\[saveError, setSaveError\] = useState\(''\)/);assert.match(text,/!!saveError && <Text accessibilityRole="alert" accessibilityLiveRegion="polite">\{saveError\}/);assert.doesNotMatch(handler.getText(source),/setFormError/);assert.match(text,/setFormError\(''\); setSaveError\(''\)/);});
