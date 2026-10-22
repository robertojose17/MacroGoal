const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}),f);
test('actual hook with native AbortSignal presents one inline notice and explicit same-ID check, no automatic retry',async()=>{
 const original=Module._load,abort=global.AbortController,states=[],refs=[],rows=new Map(),requests=[];let cursor=0,ref=0,mode='lost';
 global.AbortController=require('abort-controller/dist/abort-controller').AbortController;
 const fake={useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect(){},useCallback:f=>f,useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})}};
 Module._load=function(n,parent,isMain){
  if(n==='react')return fake;
  if(n==='@react-native-async-storage/async-storage')return {getItem:async k=>rows.get(k)??null,setItem:async(k,v)=>rows.set(k,v),removeItem:async k=>rows.delete(k)};
  if(n==='@/lib/supabase/client')return {SUPABASE_PROJECT_URL:'https://offline.invalid',supabase:{auth:{getSession:async()=>({data:{session:{access_token:'offline',user:{id:'A'}}}}),getUser:async()=>({data:{user:{id:'A'}}})},from:()=>{throw Error('unexpected write')}}};
  if(n==='expo/fetch')return {fetch:async(_url,init)=>{const body=JSON.parse(init.body);requests.push(body);assert.ok(init.signal);if(mode==='lost')throw Error('network lost');return new Response(JSON.stringify({error:'conversation_permit_closed',request_id:body.request_id,...(mode==='bound'?{admission_state:'not_admitted'}:{})}),{status:403});}};
  if(n==='@/lib/i18n')return {__esModule:true,default:{language:'en',t:k=>k}};
  if(n.startsWith('@/'))return original.call(this,path.resolve(__dirname,'..',n.slice(2)),parent,isMain);
  return original.call(this,n,parent,isMain);
 };
 try{const file=require.resolve('../hooks/useAICoach.ts');delete require.cache[file];const use=require(file).useAICoach,render=()=>{cursor=ref=0;return use({mealConversation:true})};let hook=render();assert.equal(requests.length,0);await hook.sendMessage([{role:'user',content:'Help me choose something to eat.',timestamp:Date.now()}]);hook=render();assert.equal(requests.length,1);assert.equal(hook.loading,false);assert.equal(hook.conversationPending,true);assert.equal(hook.messages.length,1);assert.equal(hook.messages[0].isCoachNotice,true);assert.match(hook.messages[0].content,/could not confirm/);
 mode='closed';await hook.recoverConversation();hook=render();assert.equal(requests.length,2);assert.deepEqual(requests[1],requests[0]);assert.equal(hook.messages.length,1);assert.match(hook.messages[0].content,/temporarily paused/);assert.equal(hook.conversationPending,true);
 mode='bound';await hook.recoverConversation();hook=render();assert.equal(requests.length,3);assert.deepEqual(requests[2],requests[0]);assert.equal(hook.messages.length,1);assert.equal(hook.conversationPending,false);assert.equal(rows.size,0);assert.match(hook.messages[0].content,/not sent to AI/);await hook.recoverConversation();assert.equal(requests.length,3);
 }finally{Module._load=original;global.AbortController=abort;}
});
test('actual screen keeps reply check in transcript and suppresses duplicate alert in conversation path',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/(tabs)/coach.tsx'),'utf8');
 assert.doesNotMatch(source,/Recover pending response|Recuperar la respuesta pendiente/);
 assert.ok(source.indexOf("'Retry message'")<source.indexOf('</ScrollView>',source.indexOf("'Retry message'")));
 assert.match(source,/if \(!COACH_CONVERSATION_READY && !e\?\.isSubscriptionError\)/);
 assert.match(source,/if \(!trimmed[^\n]+COACH_CONVERSATION_READY && conversationPending/);
});
