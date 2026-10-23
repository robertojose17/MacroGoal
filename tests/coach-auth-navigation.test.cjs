const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
test('actual layout auth callback preserves same-account navigation and resets for real identity changes',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/_layout.tsx'),'utf8');
 const start=source.indexOf('supabase.auth.onAuthStateChange((event, newSession) => {'),end=source.indexOf('\n    });',start);
 const callback=source.slice(start+'supabase.auth.onAuthStateChange('.length,end)+'\n    }';
 const rs=source.indexOf('const resolve = (resolvedSession:'),re=source.indexOf('// Hard timeout',rs);
 const events=[],routes=[];const context={mounted:true,hasResolved:false,authOwner:null,hasNavigatedRef:{current:false},timeoutId:1,clearTimeout(){},setSession:s=>events.push(s?.user?.id??null),setIsReady(){},appOpenedTrackedRef:{current:true},runPostInitSideEffects(){},AsyncStorage:{getItem:async()=> '1'},console:{log(){}},Constants:{expoConfig:{extra:{}}},Platform:{select:()=>undefined},logoutRevenueCat:async()=>{},router:{replace:p=>routes.push(p)}};
 vm.createContext(context);vm.runInContext(ts.transpile(source.slice(rs,re)+'\nglobalThis.init=resolve;globalThis.handle='+callback,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),context);
 const session=id=>({user:{id}});
 context.handle('INITIAL_SESSION',session('A'));assert.equal(context.authOwner,'A');assert.equal(context.hasNavigatedRef.current,false);
 context.hasNavigatedRef.current=true;
 for(const event of ['SIGNED_IN','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED']){context.handle(event,session('A'));assert.equal(context.hasNavigatedRef.current,true,event);assert.equal(routes.length,0);}
 context.handle('SIGNED_IN',session('B'));assert.equal(context.authOwner,'B');assert.equal(context.hasNavigatedRef.current,false);context.hasNavigatedRef.current=true;
 context.handle('SIGNED_IN',session('B'));assert.equal(context.hasNavigatedRef.current,true);
 context.handle('SIGNED_OUT',null);assert.equal(context.authOwner,null);assert.equal(context.hasNavigatedRef.current,true);assert.deepEqual(routes,['/auth/signup']);
 context.handle('SIGNED_IN',session('B'));assert.equal(context.hasNavigatedRef.current,false);assert.equal(context.authOwner,'B');
 context.hasNavigatedRef.current=true;context.handle('TOKEN_REFRESHED',session('C'));assert.equal(context.hasNavigatedRef.current,false);
 assert.ok(events.length>=9);
});
