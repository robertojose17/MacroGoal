const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS}),f);
const {coachMealQuickReplies}=require('../utils/coachMealQuickReplies');
test('only missing meal information gets contextual replies in the UI language',()=>{
 assert.equal(coachMealQuickReplies({status:'clarify',question:{key:'mode'}},false)[0],'I want to cook');
 assert.equal(coachMealQuickReplies({status:'clarify',question:{key:'mode'}},true)[0],'Quiero cocinar');
 assert.equal(coachMealQuickReplies({status:'clarify',question:{key:'food_query'}},false).length,2);
 assert.deepEqual(coachMealQuickReplies({status:'clarify',question:{key:'public_area'}},false),[]);
 assert.deepEqual(coachMealQuickReplies({status:'ready',question:null},false),[]);
 assert.deepEqual(coachMealQuickReplies(undefined,true),[]);
});
test('quick replies use explicit guarded send callback, not automatic discovery',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../components/CoachConversationActions.tsx'),'utf8');
 assert(source.includes("action(reply,()=>props.onPrompt?.(reply),gate!=='ready'||pending||busy)"));
});
