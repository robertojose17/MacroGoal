const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const source=fs.readFileSync('app/(tabs)/check-ins.tsx','utf8');
const ast=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['parseSavedRecipe','parseProgressStats','parseDayFlags'];
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const context=vm.createContext({});
vm.runInContext(ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
test('saved recipes validate JSON and preserve explicit zero/null',()=>{
 const valid=context.parseSavedRecipe({id:'r',name:'Meal',calories_per_serving:0,protein_per_serving:null,ingredients:['a']});
 assert.equal(valid.calories_per_serving,0); assert.equal(valid.protein_per_serving,null);
 for(const invalid of [null,[],{id:3,name:'x'},{id:'r',name:'x',ingredients:[3]},{id:'r',name:'x',calories_per_serving:'20'}]) assert.equal(context.parseSavedRecipe(invalid),null);
});
test('progress objects and flags reject malformed JSON without fabricating facts',()=>{
 assert.equal(context.parseProgressStats([]),null);
 assert.equal(context.parseProgressStats({steps_today:0}).steps_today,0);
 assert.equal(context.parseDayFlags([true,0]),null);
 assert.deepEqual(Array.from(context.parseDayFlags([false,true])),[false,true]);
});
test('missing production table and invented goal defaults are absent',()=>{
 assert.doesNotMatch(source,/\.from\('health_metrics'\)/);
 assert.doesNotMatch(source,/daily_calories \?\? 2000|protein_g \?\? 150/);
 assert.match(source,/mealsRes.error \|\| goalsRes.error/);
 assert.match(source,/scores.filter\(entry => entry !== null\)/);
});
test('check-in ownership, date validation and post-upload completion have real contracts',()=>{
 const form=fs.readFileSync('app/check-in-form.tsx','utf8');
 const details=fs.readFileSync('app/check-in-details.tsx','utf8');
 assert.match(form,/\.eq\('user_id', userWithPrefs.id\)/);
 assert.match(form,/\.eq\('user_id', authUser.id\)/);
 assert.match(form,/authUser.id !== user.id/);
 assert.match(form,/\.select\('id'\).single\(\)/);
 assert.match(form,/localDate.getMonth\(\) !== month - 1/);
 assert.doesNotMatch(form,/tryAwardProgressPhoto|emitXpRefresh/);
 assert.match(details,/checkInResult.data.user_id !== authUser.id/);
 assert.match(details,/went_to_gym: boolean \| null/);
});
