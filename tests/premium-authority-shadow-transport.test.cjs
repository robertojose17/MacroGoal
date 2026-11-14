const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const root='utils/premiumAuthority/';
function load(name){const e={};new Function('exports','require',ts.transpileModule(fs.readFileSync(root+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,()=>load('authorityClient'));return e;}
const {readShadowAuthority}=load('shadowTransport'),owner='00000000-0000-4000-8000-000000000001';
function fixture(){let actor=owner,current=true;const calls=[];let raw={version:'premium-authority-v1',ownerId:owner,policyContext:'production',evaluatedEnvironments:['PRODUCTION'],checkedAt:10000,validUntil:20000,access:'premium',reason:'verified',mode:'shadow',enforced:false};const abort=new AbortController();return {calls,raw,abort,switch(){actor='other';},stale(){current=false;},d:{endpoint:'https://example.supabase.co/functions/v1/common-premium-authority',apiKey:'public',expectedOwner:owner,signal:abort.signal,isCurrent:()=>current,now:()=>10000,getSession:async()=>({data:{session:{user:{id:actor},access_token:'synthetic-token'}}}),request:async(...args)=>{calls.push(args);return {ok:true,json:async()=>raw};}}};}
test('authenticated GET sends no caller-selected identity/context and consumes actual envelope',async()=>{const h=fixture(),result=await readShadowAuthority(h.d);assert.equal(result.access,'premium');assert.equal(h.calls[0][1].method,'GET');assert.equal(h.calls[0][1].redirect,'error');assert.equal(h.calls[0][1].body,undefined);assert.deepEqual(Object.keys(h.calls[0][1].headers).sort(),['Authorization','apikey']);});
for(const change of [h=>h.raw.enforced=true,h=>h.raw.mode='live',h=>h.raw.ownerId='other',h=>h.raw.evaluatedEnvironments=['SANDBOX']])test('invalid contract cannot become observation '+change.toString(),async()=>{const h=fixture();change(h);await assert.rejects(()=>readShadowAuthority(h.d));});
test('account switch during response suppresses stale observation',async()=>{const h=fixture();h.d.request=async()=>({ok:true,json:async()=>{h.switch();return h.raw;}});await assert.rejects(()=>readShadowAuthority(h.d),/stale/);});
test('abort before request prevents network and after response suppresses delivery',async()=>{let h=fixture();h.abort.abort();await assert.rejects(()=>readShadowAuthority(h.d));assert.equal(h.calls.length,0);h=fixture();h.d.request=async()=>({ok:true,json:async()=>{h.abort.abort();return h.raw;}});await assert.rejects(()=>readShadowAuthority(h.d));});
test('unknown remains unknown, never a free decision',async()=>{const h=fixture();h.raw.access='unknown';delete h.raw.checkedAt;delete h.raw.validUntil;assert.equal((await readShadowAuthority(h.d)).access,'unknown');});
function hookFixture(enabled){
 const states=[],effects=[];let cursor=0,auth,calls=0,finish,actor=owner;const writes=[];
 const modules=new Map();const React={useState(v){const i=cursor++;states[i]=v;return [v,n=>{states[i]=n;writes.push([i,n]);}];},useEffect(fn){effects.push(fn);}};
 function moduleAt(file){if(modules.has(file))return modules.get(file);const e={};modules.set(file,e);new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,name=>{
  if(name==='react')return React;
  if(name==='@/lib/supabase/client')return {SUPABASE_PROJECT_URL:'https://example.supabase.co',supabasePublicKey:'public',supabase:{auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'synthetic'}}}),onAuthStateChange(fn){auth=fn;return {data:{subscription:{unsubscribe(){auth=null;}}}};}}}};
  if(name==='@/utils/premiumAuthority/shadowTransport')return {readShadowAuthority:async d=>{calls++;await new Promise(r=>finish=r);if(d.signal.aborted||!d.isCurrent())throw Error('stale');return {access:'premium',validUntil:Date.now()+10000};}};
  if(name.startsWith('@/'))return moduleAt(name.slice(2)+'.ts');throw Error(name);
 });return e;}
 moduleAt('hooks/usePremiumAuthorityShadow.ts').usePremiumAuthorityShadow(owner,enabled);const cleanup=effects.map(f=>f());
 return {writes,states,get calls(){return calls;},finish(){finish?.();},signout(){actor='';auth?.('SIGNED_OUT',null);},unmount(){cleanup.forEach(f=>f?.());}};
}
const flushHook=()=>new Promise(r=>setImmediate(r));
test('real hook disabled performs no transport calls; native integration remains disabled',async()=>{const h=hookFixture(false);await flushHook();assert.equal(h.calls,0);h.unmount();assert.match(fs.readFileSync('hooks/usePremium.ts','utf8'),/usePremiumAuthorityShadow\(owner.current \?\? null, Platform.OS === 'web'\)/);});
test('real hook ignores pending result after signout',async()=>{const h=hookFixture(true);await flushHook();assert.equal(h.calls,1);h.signout();h.finish();await flushHook();assert.equal(h.states[0],null);h.unmount();});
test('real hook unmount suppresses all later state delivery',async()=>{const h=hookFixture(true);await flushHook();h.unmount();const count=h.writes.length;h.finish();await flushHook();assert.equal(h.writes.length,count);});
