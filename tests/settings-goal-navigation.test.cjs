const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const text = fs.readFileSync('app/settings.tsx', 'utf8');
const source = ts.createSourceFile('settings.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
 let found;
 function visit(node) { if (predicate(node)) found = node; ts.forEachChild(node, visit); }
 visit(source); assert.ok(found); return found;
}
const review = find(n => ts.isVariableDeclaration(n) && n.name.getText(source) === 'recalculateGoals').initializer;
const entry = marker => find(n => ts.isJsxAttribute(n) && n.name.getText(source) === 'onPress' && n.initializer?.expression?.getText(source).includes(marker)).initializer.expression;
const entries = [entry('Goal type field tapped'), entry('Macro Split row tapped'), entry('Opening review is navigation only')];
function run(node, context) { return vm.runInNewContext(ts.transpileModule(`(${node.getText(source)})`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context); }
function harness(platform) {
 const routes = [], alerts = [];
 const forbidden = new Proxy({}, { get() { throw new Error('Opening goals must not touch persistence'); } });
 const context = {Platform:{OS:platform}, router:{push:path => routes.push(path)}, Alert:{alert:(...args)=>alerts.push(args)}, console:{log(){}},t:x=>x,currentMacroPreset:'balanced',user:{},goal:{},editor:forbidden,supabase:forbidden,setSaving:()=>{throw new Error('Not a save');}};
 context.recalculateGoals = run(review, context);
 return {context,routes,alerts};
}
for (let i=0;i<entries.length;i++) test(`web entry ${i} opens editor without alert or writes`,()=>{
 const h=harness('web'); run(entries[i],h.context)(); assert.deepEqual(h.routes,['/edit-goals']); assert.equal(h.alerts.length,0);
});
test('web review helper is navigation only',()=>{ const h=harness('web');h.context.recalculateGoals({},{});assert.deepEqual(h.routes,['/edit-goals']);assert.equal(h.alerts.length,0); });
for(const platform of ['ios','android']) for(let i=0;i<entries.length;i++) test(`${platform} entry ${i} retains confirmation or chooser, no false success`,()=>{
 const h=harness(platform);run(entries[i],h.context)();assert.equal(h.routes.length,0);assert.equal(h.alerts.length,1);assert.ok(!JSON.stringify(h.alerts).includes('goalsUpdated'));assert.ok(!JSON.stringify(h.alerts).includes('goalsRecalculated'));
 const choices=h.alerts[0][2];assert.ok(choices.some(c=>c.style==='cancel'));
 if(i===2){choices[0].onPress();assert.deepEqual(h.routes,['/edit-goals']);}
});
for(const absent of ['user','goal']) test(`review entry with missing ${absent} does nothing`,()=>{const h=harness('web');h.context[absent]=null;run(entries[2],h.context)();assert.equal(h.routes.length,0);assert.equal(h.alerts.length,0);});
test('navigation handlers have no mutation calls or false success messages',()=>{
 for(const node of [review,...entries]) assert.doesNotMatch(node.getText(source), /editor\.(run|retry)|supabase|setSaving|goalsUpdated|goalsRecalculated/);
});
