const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const src=fs.readFileSync('app/(tabs)/coach.tsx','utf8');
const file=ts.createSourceFile('coach.tsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;function walk(node){if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='handleConfirmInline')callback=node.initializer.arguments[0];ts.forEachChild(node,walk);}walk(file);assert.ok(callback);
const code=ts.transpileModule('const callback='+callback.getText(file)+'; exports.callback=callback;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
for(const actionType of ['update_goal','adjust_calories'])test(actionType+' never writes or accepts AI targets and opens manual editor without proposal payload',async()=>{
 let messages=[{id:'msg',actionProposal:{action_id:'ai',confirmation_token:'unused',action_type:actionType,proposal:{daily_calories:100,proposed_value:100,proposed_calories:100}},actionStatus:'pending'}];const alerts=[],routes=[],exports={};
 new Function('exports','isPremium','premiumLoading','messages','setMessages','t','Alert','router','supabase','console',code)(exports,true,false,messages,fn=>{messages=fn(messages);},(key,options)=>options?.defaultValue??key,{alert(...args){alerts.push(args);}},{push(value){routes.push(value);}},new Proxy({},{get(){throw Error('unexpected database use');}}),{log(){}});
 await exports.callback('msg');assert.equal(messages[0].actionStatus,'pending');assert.equal(alerts.length,1);assert.match(alerts[0][1],/No nutrition targets were changed/);alerts[0][2][1].onPress();assert.deepEqual(routes,['/edit-goals']);
});
test('Coach goal mutators are absent, not merely hidden behind UI',()=>{assert.doesNotMatch(src,/from\('goals'\)\s*\.update/);assert.doesNotMatch(src,/from\('goals'\)\.insert/);const guard=src.indexOf("if (actionType === 'update_goal' || actionType === 'adjust_calories')");assert.ok(guard>0&&guard<src.indexOf('// Mark as confirming while async work runs'));});
