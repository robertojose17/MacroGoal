const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);
const {mealFailureMessage}=require('../utils/coachMealCopy.ts');
test('portion clarification explains format neutrally in both app languages',()=>{
 assert.equal(mealFailureMessage('portion_clarification_required',false),'Please describe the food and portion more simply. Nothing was estimated.');
 assert.equal(mealFailureMessage('portion_clarification_required',true),'Describe la comida y la porción de forma más sencilla. No se estimó nada.');
 for(const es of [false,true])assert.doesNotMatch(mealFailureMessage('portion_clarification_required',es),/personal|medical|médic|address|direcci/i);
});
