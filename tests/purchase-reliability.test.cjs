// Run with the existing TypeScript dev dependency: node --test tests/purchase-reliability.test.cjs
// Isolated SDK/auth doubles only; no network, receipts, accounts or production events.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
function load(path, imports) {
  const result = ts.transpileModule(read(path), { reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, { module, exports: module.exports,
    require: name => { if (!(name in imports)) throw new Error('Unexpected dependency: ' + name); return imports[name]; },
    console, setTimeout, clearTimeout }, { filename: path });
  return module.exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let session = null, callback, sdkUser = null;
  const calls = [];
  const sdk = {
    configure: ({appUserID}) => { calls.push(['configure',appUserID]); sdkUser=appUserID; },
    getAppUserID: async () => sdkUser,
    logIn: async id => { calls.push(['login',id]); sdkUser=id; return {customerInfo:{}}; },
    logOut: async () => { calls.push(['logout']); sdkUser='$RCAnonymousID:test'; },
    isAnonymous: async () => sdkUser?.startsWith('$RCAnonymousID:'),
    setEmail: async () => {}, enableAdServicesAttributionTokenCollection: async () => {},
  };
  const auth = { getSession: async () => ({ data:{session},error:null }),
    onAuthStateChange: fn => {callback=fn;return {data:{subscription:{unsubscribe(){}}}};} };
  const api=load('utils/purchases.native.ts', {
    'react-native-purchases': {__esModule:true,default:sdk,LOG_LEVEL:{}},
    'react-native': {Platform:{OS:'ios',select:v=>v.ios}},
    'expo-constants': {__esModule:true,default:{expoConfig:{extra:{revenueCat:{iosApiKey:'appl_fixture'}}}}},
    '@/lib/supabase/client': {supabase:{auth}},
  });
  return {api,sdk,calls,auth,emit(id,event='SIGNED_IN') { session=id?{user:{id}}:null;callback(event,session); }};
}

test('concurrent same-account callers configure once, without anonymous login', async () => {
  const f=fixture(); f.emit('A');
  await Promise.all([f.api.loginRevenueCat('A','appl_fixture'),f.api.loginRevenueCat('A','appl_fixture')]);
  assert.deepEqual(f.calls,[['configure','A']]);
});
test('a held purchase rejects its stale result and delays the next identity mutation', async () => {
  const f=fixture();f.emit('A');const held=deferred();let started=false;
  const first=f.api.withRevenueCatUser('A',async()=>{started=true;return held.promise;});
  const rejection=assert.rejects(first,/RC_ACCOUNT_CHANGED/);
  await tick();assert.equal(started,true);
  f.emit(null,'SIGNED_OUT');f.emit('B');
  const second=f.api.withRevenueCatUser('B',async()=> 'B-result');
  await tick();assert.equal(f.calls.some(c=>c[0]==='login'),false);
  held.resolve('A-paid');await rejection;assert.equal(await second,'B-result');
  assert.deepEqual(f.calls,[['configure','A'],['login','B']]);
});
test('free A late response cannot overwrite newly identified paid B', async () => {
  const f=fixture();f.emit('A');const held=deferred();
  const old=f.api.withRevenueCatUser('A',()=>held.promise);const rejected=assert.rejects(old,/RC_ACCOUNT_CHANGED/);
  await tick();f.emit('B');const next=f.api.withRevenueCatUser('B',async()=>({premium:true}));
  held.resolve({premium:false});await rejected;assert.equal((await next).premium,true);
});
test('same-account token refresh preserves the in-flight lease', async () => {
  const f=fixture();f.emit('A');const held=deferred();
  const result=f.api.withRevenueCatUser('A',()=>held.promise);await tick();
  f.emit('A','TOKEN_REFRESHED');held.resolve('paid');assert.equal(await result,'paid');
});
test('sign-out and sign-in to the same account invalidates old work', async () => {
  const f=fixture();f.emit('A');const held=deferred();
  const result=f.api.withRevenueCatUser('A',()=>held.promise);const rejected=assert.rejects(result,/RC_ACCOUNT_CHANGED/);
  await tick();f.emit(null,'SIGNED_OUT');f.emit('A');held.resolve('old');await rejected;
});
test('a stale user cannot re-identify the SDK', async () => {
  const f=fixture();f.emit('B');await assert.rejects(f.api.loginRevenueCat('A','appl_fixture'),/RC_AUTH_REQUIRED/);
  assert.deepEqual(f.calls,[]);
});
test('failed identity reconciliation propagates and does not poison the queue', async () => {
  const f=fixture();f.emit('A');await f.api.loginRevenueCat('A','appl_fixture');f.emit('B');
  const login=f.sdk.logIn;f.sdk.logIn=async()=>{throw new Error('offline');};
  await assert.rejects(f.api.withRevenueCatUser('B',async()=>true),/offline/);
  f.sdk.logIn=login;assert.equal(await f.api.withRevenueCatUser('B',async()=>true),true);
});
test('a delayed logout does not log out the next authenticated account', async () => {
  const f=fixture();f.emit('A');await f.api.loginRevenueCat('A','appl_fixture');
  const held=deferred();const result=f.api.withRevenueCatUser('A',()=>held.promise);const rejected=assert.rejects(result,/RC_ACCOUNT_CHANGED/);
  await tick();f.emit(null,'SIGNED_OUT');const logout=f.api.logoutRevenueCat();await tick();f.emit('B');
  held.resolve();await rejected;await logout;assert.equal(f.calls.some(c=>c[0]==='logout'),false);
  await f.api.loginRevenueCat('B','appl_fixture');
});
test('an SDK identity mismatch is rejected before consumer work', async () => {
  const f=fixture();f.emit('A');await f.api.loginRevenueCat('A','appl_fixture');f.emit('B');
  f.sdk.logIn=async()=>({customerInfo:{}});let consumed=false;
  await assert.rejects(f.api.withRevenueCatUser('B',async()=>{consumed=true;}),/RC_IDENTITY_MISMATCH/);
  assert.equal(consumed,false);
});
test('every deployed legacy alias remains active after cancellation until SDK expiry', () => {
  const {premiumEntitlement}=load('utils/premiumEntitlement.ts',{});
  for(const key of ['pro','Macrogoal Pro','macrogoal_pro','premium']) {
    const value={isActive:true,willRenew:false,expirationDate:'2030-01-01'};
    assert.equal(premiumEntitlement({entitlements:{active:{[key]:value}}}),value);
  }
  assert.equal(premiumEntitlement({entitlements:{active:{premium:{isActive:false}}}}),null);
});
test('hook callbacks are hints, removed on cleanup; transient errors do not force free', () => {
  const source=read('hooks/usePremium.ts');
  for(const expected of ['removeCustomerInfoUpdateListener(onInfo)', 'fallbackPremium || previous', 'request.current === ticket', 'setExpirationDate(entitlement?.expirationDate ?? null)']) assert.ok(source.includes(expected),expected);
  for(const forbidden of ['Purchases.logIn', 'originalAppUserId']) assert.ok(!source.includes(forbidden),forbidden);
});
test('paywall has no identity mutation or arbitrary offering fallback; auto-start is retained', () => {
  const source=read('app/subscription.tsx');
  for(const forbidden of ['Purchases.configure(', 'Purchases.logIn(', 'Purchases.logOut(', 'offeringsResponse.current', 'firstOfferingKey']) assert.ok(!source.includes(forbidden),forbidden);
  for(const expected of ['response.all[identifier]', "handlePurchase(resolvedYearlyPkg, 'auto_start')", "outcome === 'pending'", "outcome === 'already_owned'"]) assert.ok(source.includes(expected),expected);
});
