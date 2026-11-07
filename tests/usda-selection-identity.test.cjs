// Actual coordinator, draft storage and UI callback bodies. External I/O is mocked.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require(process.env.TYPESCRIPT_MODULE || 'typescript');
const root = path.resolve(__dirname, '..');
const plain = x => JSON.parse(JSON.stringify(x));
const quiet = { log() {}, warn() {}, error() {} };
const id = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const sid2 = '33333333-3333-4333-8333-333333333333';
const session = (user = 'owner', s = sid) => ({ user: { id: user }, access_token: 'header.' + Buffer.from(JSON.stringify({ session_id: s })).toString('base64url') + '.signature' });
const product = (extra = {}) => ({ code: '123', _source: 'usda', _usda_fdc_id: '123', product_name: 'Rice, cooked', serving_size: '100 g', serving_quantity: 100, nutriments: { 'energy-kcal_100g': 130, proteins_100g: 3, carbohydrates_100g: 28, fat_100g: 0.3, fiber_100g: 1 }, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function loader(mocks, globals = {}) {
  const cache = new Map();
  return function load(file) {
    if (cache.has(file)) return cache.get(file);
    const m = { exports: {} }; cache.set(file, m.exports);
    vm.runInNewContext(compile(fs.readFileSync(path.join(root, file), 'utf8')), { module: m, exports: m.exports, console: quiet, ...globals, require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      const target = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      if (target.endsWith('.mjs')) return require(path.join(root, target));
      return load(/\.tsx?$/.test(target) ? target : target + '.ts');
    } }, { filename: file });
    return m.exports;
  };
}
function harness() {
  let current = session(), listener, clock = 0, timerId = 0, foodSequence = 0;
  const timers = new Map(), requests = [], reads = [], writes = [], storageWrites = [], store = new Map();
  let readResult = { data: null, error: null };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: current }, error: null }), onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; } },
    functions: { invoke(name, options) { const call = { name, options, ...deferred() }; requests.push(call); return call.promise; } },
    from(table) {
      const filters = []; let payload;
      const query = { select() { return this; }, eq(...args) { filters.push(args); return this; },
        async maybeSingle() { reads.push({ table, filters }); return table === 'food_items' ? readResult : { data: null }; },
        insert(value) { payload = value; writes.push({ table, value }); return this; },
        async single() { return { data: { ...payload, id: 'legacy-' + (++foodSequence) }, error: null }; },
      }; return query;
    },
  };
  const storage = { getItem: async k => store.get(k) || null, setItem: async (k, v) => { storageWrites.push([k, v]); store.set(k, v); }, removeItem: async k => { store.delete(k); } };
  const globals = { setTimeout(fn, ms) { const key = ++timerId; timers.set(key, { at: clock + ms, fn }); return key; }, clearTimeout(key) { timers.delete(key); } };
  const load = loader({ '@/lib/supabase/client': { supabase }, '@react-native-async-storage/async-storage': storage }, globals);
  const api = load('utils/usdaSelectionPersistence.ts'), draft = load('utils/myMealsDraft.ts');
  return { api, draft, load, supabase, requests, reads, writes, storageWrites, storage,
    switchSession(next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') { current = next; if (listener) listener(event, next); },
    setRead(value) { readResult = value; },
    async tick(ms) { clock += ms; for (const [key, timer] of [...timers]) if (timer.at <= clock) { timers.delete(key); timer.fn(); } await flush(); },
    success(call = requests[0], fdcId = '123', foodItemId = id) { call.resolve({ data: { fdc_id: fdcId, food_item_id: foodItemId, portion_evidence: { fixture: true } }, error: null }); },
  };
}
function bind(file, name, context) {
  const source = fs.readFileSync(path.join(root, file), 'utf8'), ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let found;
  function walk(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer; ts.forEachChild(node, walk); }
  walk(ast); assert.ok(found, name);
  if (ts.isCallExpression(found) && found.expression.getText(ast) === 'useCallback') found = found.arguments[0];
  vm.runInContext(compile('globalThis.' + name + ' = ' + found.getText(ast)), context);
}
function callback(h) {
  const banners = [], alerts = [], plans = [];
  const c = vm.createContext({ console: quiet, ...h.load('utils/catalogSelection.ts'), ...h.load('utils/searchSelectionSafety.ts'), ...h.load('utils/openFoodFacts.ts'), ...h.api, ...h.draft,
    supabase: h.supabase, quickAddNavigationRef: { current: { active: true, id: 'navigation-A' } }, quickAddPendingRef: { current: new Set() },
    context: 'my_meals_builder', mode: '', planId: '', mealType: 'lunch', date: '2026-11-07', params: {}, returnTo: '/my-meals-create',
    safeNum: x => Number.isFinite(Number(x)) ? Number(x) : 0, t: x => x, showSuccessBanner: x => banners.push(x), Alert: { alert: (...x) => alerts.push(x) }, invalidatePIECache() {}, router: { push() { throw Error('Unexpected navigation'); } },
    addMealPlanItem: async (...x) => plans.push(x),
  });
  bind('app/add-food.tsx', 'handleQuickAddSearchResult', c);
  bind('app/add-food.tsx', 'handleQuickAddSearchResultToMealPlan', c);
  return { c, banners, alerts, plans, add: p => c.handleQuickAddSearchResult({ product: p || product(), source: 'supabase' }) };
}
async function timedOut(h, p = product()) { const result = h.api.persistUsdaSelection(p); await flush(); await h.tick(1800); return result; }
async function addedPending(h) { const ui = callback(h), adding = ui.add(); await flush(); await h.tick(1800); await adding; return ui; }

test('exact FDC success is explicit, preserves input, and never uses name as identity', async () => {
  const h = harness(), input = product(), before = plain(input), p = h.api.persistUsdaSelection(input);
  await flush(); h.success(); const result = await p;
  assert.equal(result.status, 'persisted'); assert.equal(result.foodItemId, id); assert.deepEqual(input, before);
  assert.deepEqual(plain(h.requests[0].options), { body: { operation: 'usda_portions_v1', fdc_id: '123' } });
  const second = h.api.persistUsdaSelection(product({ _usda_fdc_id: '124', code: '124' })); await flush();
  assert.equal(h.requests.length, 2); h.success(h.requests[1], '124'); await second;
});
test('not-applicable covers missing/invalid FDC and confirmed correction, without auth or provider work', async () => {
  const h = harness(); for (const p of [product({ _usda_fdc_id: undefined }), product({ _usda_fdc_id: '123.0' }), product({ _serving_authority: 'confirmed_correction' })]) assert.equal((await h.api.persistUsdaSelection(p)).status, 'not_applicable');
  assert.equal(h.requests.length, 0); assert.equal(h.reads.length, 0);
});
test('unchanged 1800 ms deadline returns unknown, retains original request and dedupes repeated clicks', async () => {
  const h = harness(), first = h.api.persistUsdaSelection(product()), second = h.api.persistUsdaSelection(product()); await flush();
  let done = false; first.then(() => { done = true; }); await h.tick(1799); assert.equal(done, false); await h.tick(1);
  const a = await first, b = await second; assert.equal(a.status, 'unknown'); assert.deepEqual(plain(a.identity), plain(b.identity));
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].options.signal, undefined);
  assert.equal((await h.api.persistUsdaSelection(product())).status, 'unknown'); assert.equal(h.requests.length, 1);
  const late = h.api.continueUsdaSelection(a.identity); h.success(); assert.equal((await late).foodItemId, id);
  const refresh=h.api.persistUsdaSelection(product());await flush();assert.equal(h.requests.length,2);h.success(h.requests[1]);assert.equal((await refresh).foodItemId,id);
});
test('transport rejection is unknown; exact readback can verify identity, never resends write', async () => {
  const h = harness(), p = h.api.persistUsdaSelection(product()); await flush(); h.requests[0].reject(Error('lost response')); const outcome = await p;
  assert.equal(outcome.status, 'unknown'); h.setRead({ data: { id, usda_fdc_id: 123 }, error: null });
  const late = await h.api.continueUsdaSelection(outcome.identity); assert.equal(late.status, 'persisted');
  assert.deepEqual(plain(h.reads), [{ table: 'food_items', filters: [['usda_fdc_id', '123']] }]);
  await h.api.persistUsdaSelection(product()); assert.equal(h.requests.length, 1);
});
test('empty/failed/mismatching readback never proves rollback or permits a second write', async () => {
  for (const value of [{ data: null, error: null }, { data: null, error: { message: 'abort' } }, { data: { id, usda_fdc_id: '124' }, error: null }, { data: { id: '123', usda_fdc_id: '123' }, error: null }]) {
    const h = harness(), p = h.api.persistUsdaSelection(product()); await flush(); h.requests[0].reject(Error('unknown')); const outcome = await p;
    h.setRead(value); assert.equal((await h.api.continueUsdaSelection(outcome.identity)).status, 'unknown');
    await h.api.persistUsdaSelection(product()); assert.equal(h.requests.length, 1);
  }
});
test('mismatched FDC, malformed UUID and provider error responses are never persisted', async () => {
  for (const response of [{ data: { fdc_id: '124', food_item_id: id } }, { data: { fdc_id: '123', food_item_id: '123' } }, { data: { fdc_id: '123', food_item_id: id }, error: { message: 'failed' } }]) {
    const h = harness(), p = h.api.persistUsdaSelection(product()); await flush(); h.requests[0].resolve(response); assert.equal((await p).status, 'unknown');
  }
});
test('auth token refresh retains exact session operation; different session and user cannot adopt old identity', async () => {
  const h = harness(), first = await timedOut(h); h.switchSession({ ...session(), access_token: session().access_token + 'refreshed' });
  await h.api.persistUsdaSelection(product()); assert.equal(h.requests.length, 1);
  for (const next of [session('owner', sid2), session('other', sid)]) {
    h.switchSession(next); assert.equal(await h.api.usdaIdentityIsCurrent(first.identity), false);
    const call = h.api.persistUsdaSelection(product()); await flush(); h.success(h.requests.at(-1)); assert.equal((await call).status, 'persisted');
  }
  h.success(h.requests[0]); assert.equal((await h.api.continueUsdaSelection(first.identity)).status, 'unknown'); assert.equal(h.requests.length, 3);
});
test('sign-out during request ignores its late result and never reads under a different owner', async () => {
  const h = harness(), p = h.api.persistUsdaSelection(product()); await flush(); h.switchSession(null); h.success();
  const result = await p; assert.equal(result.status, 'unknown'); assert.equal((await h.api.continueUsdaSelection(result.identity)).status, 'unknown'); assert.equal(h.reads.length, 0);
});
test('missing or unparseable auth session cannot trigger persistence', async () => {
  for (const next of [null, { user: { id: 'owner' }, access_token: 'malformed' }]) { const h = harness(); h.switchSession(next); assert.equal((await h.api.persistUsdaSelection(product())).status, 'unknown'); assert.equal(h.requests.length, 0); }
});
test('actual quick-add preserves valid nutrition and declares pending identity; late result changes only UUID', async () => {
  const h = harness(), ui = await addedPending(h); let items = await h.draft.loadDraft();
  assert.equal(ui.alerts.length, 0); assert.equal(ui.banners.length, 1); assert.equal(items.length, 1); assert.equal(items[0].calories, 130);
  assert.equal(items[0].pending_usda_identity.fdcId, '123'); assert.equal(items[0].food_item_id, undefined);
  items[0].calories = 234; items[0].serving_amount = 79; items[0].servings_count = 0.5; items[0].food_name = 'User-edited name'; await h.draft.saveDraft(items);
  const expected = plain(items[0]); expected.resolved_usda_identity = expected.pending_usda_identity; delete expected.pending_usda_identity; expected.food_item_id = id;
  h.success(); await flush(); items = await h.draft.loadDraft(); assert.deepEqual(plain(items[0]), expected); assert.equal(h.requests.length, 1);
});
test('actual quick-add coalesces concurrent identical FDC gestures but permits a later intentional serving', async () => {
  const h = harness(), ui = callback(h), p = product(), a = ui.add(p), b = ui.add({ ...p }); await flush(); assert.equal(h.requests.length, 1); h.success(); await Promise.all([a, b]);
  assert.equal((await h.draft.loadDraft()).length, 1); assert.equal(h.writes.length, 1);
  const later=ui.add(product());await flush();assert.equal(h.requests.length,2);h.success(h.requests[1]);await later;assert.equal((await h.draft.loadDraft()).length,2);
});
test('provider failure and empty readback do not block adding the valid nutrition snapshot', async () => {
  const h = harness(), ui = callback(h), a = ui.add(); await flush(); h.requests[0].reject(Error('unknown')); await a; await flush();
  const items = await h.draft.loadDraft(); assert.equal(items.length, 1); assert.equal(items[0].calories, 130); assert.ok(items[0].pending_usda_identity); assert.equal(ui.alerts.length, 0); assert.equal(ui.banners.length, 1);
  assert.equal(h.requests.length, 1); assert.equal(h.reads.filter(r => r.table === 'food_items').length, 1);
});
for (const scenario of ['unmount', 'new-navigation', 'user-switch', 'same-user-new-session']) test('pending draft ignores late response after ' + scenario, async () => {
  const h = harness(), ui = await addedPending(h), before = plain(await h.draft.loadDraft());
  if (scenario === 'unmount') ui.c.quickAddNavigationRef.current.active = false;
  if (scenario === 'new-navigation') ui.c.quickAddNavigationRef.current = { active: true, id: 'navigation-B' };
  if (scenario === 'user-switch') h.switchSession(session('other'));
  if (scenario === 'same-user-new-session') h.switchSession(session('owner', sid2));
  h.success(); await flush(); assert.deepEqual(plain(await h.draft.loadDraft()), before);
});
for (const scenario of ['clear', 'remove', 'replace-food', 'replace-operation', 'replace-navigation', 'already-linked']) test('dedicated reconcile cannot mutate stale entry: ' + scenario, async () => {
  const h = harness(); await addedPending(h); let items = await h.draft.loadDraft();
  if (scenario === 'clear') await h.draft.clearDraft();
  if (scenario === 'remove') await h.draft.saveDraft([]);
  if (scenario === 'replace-food') { items[0].food_id = 'other-food'; await h.draft.saveDraft(items); }
  if (scenario === 'replace-operation') { items[0].pending_usda_identity.operationId = 'other-operation'; await h.draft.saveDraft(items); }
  if (scenario === 'replace-navigation') { items[0].pending_usda_identity.navigationId = 'other-route'; await h.draft.saveDraft(items); }
  if (scenario === 'already-linked') { items[0].food_item_id = sid2; await h.draft.saveDraft(items); }
  const before = plain(await h.draft.loadDraft()); h.success(); await flush(); assert.deepEqual(plain(await h.draft.loadDraft()), before);
});
test('unmount while initial deadline is pending cannot create legacy food or draft later', async () => {
  const h = harness(), ui = callback(h), adding = ui.add(); await flush(); ui.c.quickAddNavigationRef.current.active = false; h.success(); await adding;
  assert.equal(h.writes.length, 0); assert.equal((await h.draft.loadDraft()).length, 0); assert.equal(ui.banners.length, 0);
});
test('meal-plan preserves its valid snapshot and USDA capture; repeated captures use the same operation', async () => {
  const h = harness(), ui = callback(h); ui.c.mode = 'meal-plan'; ui.c.planId = 'plan';
  await ui.c.handleQuickAddSearchResultToMealPlan({ product: product() }); await flush();
  assert.equal(ui.plans.length, 1); assert.equal(ui.plans[0][1].calories, 130); assert.equal(h.requests.length, 1);
  await ui.c.handleQuickAddSearchResultToMealPlan({ product: product() }); await flush(); assert.equal(ui.plans.length, 2); assert.equal(h.requests.length, 1); h.success(); await flush();
});
test('FoodDetails uses same exact-FDC coordinator as quick-add, with no late portion or nutrient overwrite', async () => {
  const h = harness(), pending = await timedOut(h), raw = JSON.stringify(product()), state = { product: null, serving: null, macros: null };
  const c = vm.createContext({ console: quiet, ...h.load('utils/openFoodFacts.ts'), ...h.load('utils/catalogSelection.ts'), ...h.api,
    offData: raw, routeContext: {}, latestOffData: { current: raw }, usdaHydrationActive: { current: true }, viewGeneration:{current:h.load('utils/recoveryRouteContext.ts').createLoadGeneration()},viewLoadComplete:{current:false},viewSelectionRequest:{current:null},latestViewRoute:{current:'fixture'},viewRouteKey:'fixture',readUsdaPortions: () => [],
    setProduct: p => { state.product = p; }, setPer100Macros: p => { state.macros = p; }, setServingAmount: p => { state.serving = p; },
    setFoodItemRef() {}, setServingUnit() {}, setNumberOfServings() {}, setSelectedServingOptionKey() {}, setLoading() {}, checkFavoriteStatus: async () => {},
    resolveProductGrams: p => Number(p.serving_quantity), extractUnitFromString: () => ({ unitName: null, unitCount: 1 }), safeNum: Number, t: x => x, Alert: { alert() { throw Error('Unexpected alert'); } },
  });
  bind('components/FoodDetailsLayout.tsx', 'loadViewData', c); await c.loadViewData();
  assert.equal(h.requests.length, 1); assert.equal(state.product._db_id, undefined); state.macros.calories = 777; state.serving = 79;
  const before = plain(state); h.success(); assert.equal((await h.api.continueUsdaSelection(pending.identity)).foodItemId, id); await flush(); assert.deepEqual(plain(state), before);
});
test('draft writer serialization preserves concurrent append, edit and clear ordering', async () => {
  const h = harness(), item = { food_id: 'a', food_name: 'A', serving_amount: 20, serving_unit: 'g', servings_count: 1, calories: 60, protein: 2, carbs: 10, fats: 1, fiber: 0 };
  const [a, b] = await Promise.all([h.draft.addToDraft(item), h.draft.addToDraft({ ...item, food_id: 'b' })]); assert.notEqual(a, b); assert.equal((await h.draft.loadDraft()).length, 2);
  await Promise.all([h.draft.clearDraft(), h.draft.addToDraft({ ...item, food_id: 'c' })]); assert.deepEqual(plain((await h.draft.loadDraft()).map(x => x.food_id)), ['c']);
});
test('same-user sign-out and sign-in retires the local epoch even if SDK session claim is reused', async () => {
  const h = harness(), first = await timedOut(h); h.switchSession(null); h.switchSession(session());
  assert.equal(h.api.usdaIdentityIsCurrent(first.identity), false);
  const next = h.api.persistUsdaSelection(product()); await flush(); assert.equal(h.requests.length, 2); h.success(h.requests[1]);
  const result = await next; assert.notEqual(result.identity.sessionEpoch, first.identity.sessionEpoch);
  h.success(h.requests[0]); assert.equal((await h.api.continueUsdaSelection(first.identity)).status, 'unknown');
});
test('pending metadata contains only public identity fields and a local epoch, never tokens or JWT session claim', async () => {
  const h = harness(); await addedPending(h); const pending = (await h.draft.loadDraft())[0].pending_usda_identity;
  assert.deepEqual(Object.keys(pending).sort(), ['fdcId','navigationId','operationId','sessionEpoch','userId']);
  assert.doesNotMatch(JSON.stringify(pending), /access_token|refresh_token|signature/); assert.equal(JSON.stringify(pending).includes(sid), false);
});
test('auth delay is included in original 1800ms budget and cannot dispatch after deadline', async () => {
  const h = harness(), auth = deferred(); h.supabase.auth.getSession = () => auth.promise;
  const p = h.api.persistUsdaSelection(product()); await flush(); await h.tick(1800); assert.equal((await p).status, 'unknown'); assert.equal(h.requests.length, 0);
  auth.resolve({ data: { session: session() }, error: null }); await flush(); assert.equal(h.requests.length, 0);
});
test('readback timeout stays unknown and cannot trigger another provider write', async () => {
  const h = harness(), pending = await timedOut(h), read = deferred();
  h.supabase.from = table => { assert.equal(table, 'food_items'); return { select() { return this; }, eq(key,value) { assert.equal(key,'usda_fdc_id'); assert.equal(value,'123'); return this; }, maybeSingle() { return read.promise; } }; };
  const reconcile = h.api.reconcileUsdaSelection(pending.identity); await flush(); await h.tick(1800); assert.equal((await reconcile).status,'unknown');
  await h.api.persistUsdaSelection(product()); assert.equal(h.requests.length,1);
  read.resolve({ data:{id,usda_fdc_id:'123'},error:null }); await flush(); assert.equal((await h.api.reconcileUsdaSelection(pending.identity)).status,'persisted');
  h.requests[0].reject(Error('original response lost')); await flush(); assert.equal((await h.api.persistUsdaSelection(product())).status,'persisted');
});
test('transient auth read failure does not retire a session or allow replay of an unknown write', async () => {
  const h = harness(), pending = await timedOut(h), getSession = h.supabase.auth.getSession;
  h.supabase.auth.getSession = async () => ({ data:{session:null},error:{message:'temporary local read failure'} });
  assert.equal((await h.api.persistUsdaSelection(product())).status,'unknown'); assert.equal(h.api.usdaIdentityIsCurrent(pending.identity),true); // A read error is not a sign-out.
  h.supabase.auth.getSession = getSession; const resumed = await h.api.persistUsdaSelection(product());
  assert.equal(resumed.status,'unknown'); assert.equal(resumed.identity.sessionEpoch,pending.identity.sessionEpoch); assert.equal(h.requests.length,1);
  h.success(); await flush(); assert.equal((await h.api.continueUsdaSelection(pending.identity)).status,'persisted');
});
test('a new process cannot adopt old pending metadata or infer a destination', async () => {
  const old = harness(), pending = await timedOut(old), fresh = harness();
  assert.equal(fresh.api.usdaIdentityIsCurrent(pending.identity),false);
  assert.equal((await fresh.api.continueUsdaSelection(pending.identity)).status,'unknown'); assert.equal(fresh.requests.length,0); assert.equal(fresh.reads.length,0);
  old.success(); await flush();
});

// Independent-review adversarial cases retained as release regressions.
test('review: queued quick add must not append under a retired navigation or auth session', async () => {
  const h = harness(), ui = callback(h), gate = deferred(), originalSet = h.storage.setItem;
  let blocked = false;
  h.storage.setItem = async (key, value) => { if (!blocked) { blocked = true; await gate.promise; } return originalSet(key,value); };
  const blocker = h.draft.saveDraft([]); await flush();
  const adding = ui.add(); await flush(); await h.tick(1800);
  assert.equal(h.writes.length, 1);
  ui.c.quickAddNavigationRef.current.active = false;
  h.switchSession(session('other', sid2));
  gate.resolve(); await blocker; await adding;
  assert.equal((await h.draft.loadDraft()).length, 0, 'must not append an old-owner food after navigation/session is retired while queued');
});
test('review: late auth result must not admit an old gesture into a new user session', async () => {
  const h = harness();
  const warm = h.api.persistUsdaSelection(product()); await flush(); h.success(); await warm;
  const ui = callback(h), auth = deferred(); let authCalls=0; h.supabase.auth.getSession = () => ++authCalls===1 ? auth.promise : Promise.resolve({data:{session:session('other', sid2)},error:null});
  const adding = ui.add(product({_usda_fdc_id:'124',code:'124'})); await flush();
  h.switchSession(session('other', sid2));
  auth.resolve({data:{session:session()},error:null}); await flush();
  if (h.requests[1]) h.success(h.requests[1], '124');
  await adding;
  assert.equal(h.requests.length, 1, 'must not issue a new-user persistence write for an old-user gesture');
  assert.equal((await h.draft.loadDraft()).length, 0);
});
test('review: caller snapshot cannot discard a later verified identity', async () => {
  const h = harness(); await addedPending(h);
  const stale = await h.draft.loadDraft();
  h.success(); await flush(); assert.equal((await h.draft.loadDraft())[0].food_item_id,id);
  stale[0].calories = 456;
  await h.draft.saveDraft(stale);
  const now = (await h.draft.loadDraft())[0];
  assert.equal(now.calories,456);
  assert.equal(now.food_item_id,id,'concurrent local edit must retain identity already verified for this same tempId');
});
test('review: serialization prevents clear during reconciliation from resurrecting entry', async () => {
  const h = harness(); await addedPending(h);
  const entry = (await h.draft.loadDraft())[0], guard = deferred(); let calls=0;
  const linked = h.draft.reconcileDraftIdentity({tempId:entry.tempId, foodId:entry.food_id, pending:entry.pending_usda_identity},id,async()=>{calls++; if(calls===2)await guard.promise;return true;});
  await flush();
  const clear=h.draft.clearDraft(); guard.resolve(); await Promise.all([linked,clear]);
  assert.deepEqual(plain(await h.draft.loadDraft()),[]);
});
test('review: stale consumer snapshot must not resurrect draft consumed by clear', async () => {
  const h = harness(); await addedPending(h);
  const stale = await h.draft.loadDraft();
  await h.draft.clearDraft();
  stale[0].calories=456;
  await h.draft.saveDraft(stale);
  assert.deepEqual(plain(await h.draft.loadDraft()),[],'consumed entries must not be restored by stale whole-array save');
});
test('review: token refresh during admission must retain same-session capture', async () => {
  const h=harness();
  const warm=h.api.persistUsdaSelection(product()); await flush(); h.success(); await warm;
  const auth=deferred(); let authCalls=0;
  h.supabase.auth.getSession=()=> ++authCalls===2 ? auth.promise : Promise.resolve({data:{session:session()},error:null});
  const capture=h.api.persistUsdaSelection(product({_usda_fdc_id:'124',code:'124'})); await flush();
  h.switchSession({...session(),access_token:session().access_token+'refreshed'});
  auth.resolve({data:{session:session()},error:null}); await flush();
  if(h.requests[1])h.success(h.requests[1],'124');
  const outcome=await capture;
  assert.equal(h.requests.length,2,'same-session refresh must not poison an admitted FDC operation before its one allowed write');
  assert.equal(outcome.status,'persisted');
});

test('review: transient auth read failure after capture must not discard valid quick-add nutrition', async () => {
  const h=harness(), ui=callback(h); let authCalls=0;
  h.supabase.auth.getSession=async()=> ++authCalls===3 ? {data:{session:null},error:{message:'transient local read'}} : {data:{session:session()},error:null};
  const adding=ui.add(); await flush(); assert.equal(h.requests.length,1); h.success(); await adding; await flush();
  assert.equal((await h.draft.loadDraft()).length,1,'optional identity uncertainty must not silently cancel valid nutrition snapshot when auth identity did not change');
  assert.equal((await h.draft.loadDraft())[0].calories,130);
  assert.equal(ui.banners.length,1);
  assert.equal(h.requests.length,1);
});
function detailCallback(h, p = product(), shared = {}) {
  const raw = JSON.stringify(p), route = JSON.stringify(['view', undefined, raw, undefined]);
  const refs = { usdaHydrationActive:{current:true},viewGeneration:{current:h.load('utils/recoveryRouteContext.ts').createLoadGeneration()},viewLoadComplete:{current:false},viewSelectionRequest:{current:null},latestViewRoute:{current:route},...shared };
  const applied = [], c = vm.createContext({ console:quiet,...h.load('utils/openFoodFacts.ts'),...h.load('utils/catalogSelection.ts'),...h.api,...refs,
    offData:raw,routeContext:{},viewRouteKey:route,latestOffData:{current:raw},readUsdaPortions:()=>[],setProduct:p=>applied.push(p),setPer100Macros(){},setServingAmount(){},setFoodItemRef(){},setServingUnit(){},setNumberOfServings(){},setSelectedServingOptionKey(){},setLoading(){},checkFavoriteStatus:async()=>{},
    resolveProductGrams:p=>Number(p.serving_quantity),extractUnitFromString:()=>({unitName:null,unitCount:1}),safeNum:Number,t:x=>x,Alert:{alert(){throw Error('Unexpected alert');}},
  });
  bind('components/FoodDetailsLayout.tsx','loadViewData',c); return {c,refs,applied};
}
test('actual hydration generation rejects stale A→B→A callbacks even with identical final input',async()=>{
  const h=harness(),a=detailCallback(h),first=a.c.loadViewData();await flush();
  const b=detailCallback(h,product({_usda_fdc_id:'124',code:'124'}),a.refs);a.refs.latestViewRoute.current=b.c.viewRouteKey;const second=b.c.loadViewData();await flush();
  const newer=detailCallback(h,product(),a.refs);a.refs.latestViewRoute.current=newer.c.viewRouteKey;const third=newer.c.loadViewData();await flush();
  assert.equal(h.requests.length,2);h.success(h.requests[0]);await Promise.all([first,third]);h.success(h.requests[1],'124');await second;
  assert.equal(a.applied.length,0);assert.equal(b.applied.length,0);assert.equal(newer.applied.length,1);assert.equal(newer.applied[0]._db_id,id);
});
test('actual hydration ignores blur/unmount, then resumes the retained request without a second write',async()=>{
  const h=harness(),d=detailCallback(h),pending=d.c.loadViewData();await flush();d.refs.usdaHydrationActive.current=false;d.refs.viewGeneration.current.invalidate();h.success();await pending;
  assert.equal(d.applied.length,0);assert.equal(d.refs.viewLoadComplete.current,false);
  d.refs.usdaHydrationActive.current=true;await d.c.loadViewData();assert.equal(h.requests.length,1);assert.equal(d.applied.length,1);assert.equal(d.refs.viewLoadComplete.current,true);
});
test('actual hydration focus callback never reloads a completed user edit',()=>{
  const file='components/FoodDetailsLayout.tsx',source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  let found;function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useFocusEffect'&&n.arguments[0]?.getText(ast).includes('viewLoadComplete.current'))found=n.arguments[0].arguments[0];ts.forEachChild(n,walk);}walk(ast);assert.ok(found);
  let loads=0,invalidated=0;const c=vm.createContext({usdaHydrationActive:{current:false},viewLoadComplete:{current:true},viewSelectionRequest:{current:null},viewGeneration:{current:{invalidate(){invalidated++;}}},itemId:undefined,mode:'view',loadViewData(){loads++;}});
  vm.runInContext(compile('globalThis.focus='+found.getText(ast)),c);const cleanup=c.focus();assert.equal(loads,0);assert.equal(c.usdaHydrationActive.current,true);cleanup();assert.equal(c.usdaHydrationActive.current,false);assert.equal(invalidated,1);
  c.viewLoadComplete.current=false;c.focus();assert.equal(loads,1);
});
test('actual route invalidation includes mode, itemId and recovery authority, not just offData',()=>{
  const source=fs.readFileSync(path.join(root,'components/FoodDetailsLayout.tsx'),'utf8');
  const key=source.match(/const viewRouteKey = ([^\n]+);/)[1],start=source.indexOf('  if (latestViewRoute.current !== viewRouteKey)'),end=source.indexOf('\n  const editGeneration',start),statement=source.slice(start,end);
  let invalidations=0;const c=vm.createContext({mode:'view',itemId:undefined,offData:'same-product',routeContext:{},latestViewRoute:{current:''},viewLoadComplete:{current:true},viewSelectionRequest:{current:null},viewGeneration:{current:{invalidate(){invalidations++;}}}});
  const render=()=>vm.runInContext(compile('globalThis.viewRouteKey='+key+';\n'+statement),c);
  render();c.viewLoadComplete.current=true;c.mode='edit';c.itemId='other-entry';render();assert.equal(c.viewLoadComplete.current,false);
  c.viewLoadComplete.current=true;c.mode='view';c.itemId=undefined;render();assert.equal(c.viewLoadComplete.current,false);
  c.viewLoadComplete.current=true;c.routeContext.recoverySaved='1';render();assert.equal(c.viewLoadComplete.current,false);assert.equal(invalidations,4);
});

test('review: initial optional auth error must preserve valid quick-add with unknown identity', async () => {
 const h=harness(),ui=callback(h);let authCalls=0;
 h.supabase.auth.getSession=async()=>{if(++authCalls===1)throw Error('transient local read');return {data:{session:session()},error:null};};
 await ui.add();await flush();
 assert.equal((await h.draft.loadDraft()).length,1);assert.equal((await h.draft.loadDraft())[0].calories,130);assert.equal(ui.banners.length,1);assert.equal(h.requests.length,0);
});
test('review: initial optional auth timeout must preserve nutrition and never dispatch late capture', async () => {
 const h=harness(),ui=callback(h),auth=deferred();h.supabase.auth.getSession=()=>auth.promise;
 const adding=ui.add();await flush();await h.tick(1800);
 assert.equal((await h.draft.loadDraft()).length,1,'identity deadline must not cancel valid food');assert.equal(ui.banners.length,1);assert.equal(h.requests.length,0);
 auth.resolve({data:{session:session()},error:null});await adding;await flush();assert.equal(h.requests.length,0);
});
for(const transition of ['sign-out','other-user','same-user-sign-in'])test('unknown admission cannot append queued nutrition after '+transition,async()=>{
 const h=harness(),ui=callback(h),gate=deferred(),originalSet=h.storage.setItem;let blocked=false,calls=0;
 h.supabase.auth.getSession=async()=>{if(++calls===1)throw Error('optional read unavailable');return {data:{session:session()},error:null};};
 h.storage.setItem=async(k,v)=>{if(!blocked){blocked=true;await gate.promise;}return originalSet(k,v);};
 const blocker=h.draft.saveDraft([]);await flush();const adding=ui.add();await flush();assert.equal(h.writes.length,1);
 if(transition==='sign-out')h.switchSession(null);
 if(transition==='other-user')h.switchSession(session('other'));
 if(transition==='same-user-sign-in'){h.switchSession(null);h.switchSession(session());}
 gate.resolve();await blocker;await adding;assert.equal((await h.draft.loadDraft()).length,0);assert.equal(ui.banners.length,0);assert.equal(ui.alerts.length,0);assert.equal(h.requests.length,0);
});
test('first INITIAL_SESSION snapshot does not retire unchanged unknown legacy logging continuity',async()=>{
 const h=harness(),ui=callback(h),gate=deferred(),originalSet=h.storage.setItem;let blocked=false,calls=0;
 h.supabase.auth.getSession=async()=>{if(++calls===1)throw Error('optional read unavailable');return {data:{session:session()},error:null};};
 h.storage.setItem=async(k,v)=>{if(!blocked){blocked=true;await gate.promise;}return originalSet(k,v);};
 const blocker=h.draft.saveDraft([]);await flush();const adding=ui.add();await flush();h.switchSession(session(),'INITIAL_SESSION');gate.resolve();await blocker;await adding;
 assert.equal((await h.draft.loadDraft()).length,1);assert.equal(ui.banners.length,1);assert.equal(h.requests.length,0);
});
test('auth transition during initial read timeout cannot write a new-owner food or issue delayed capture',async()=>{
 const h=harness(),ui=callback(h),auth=deferred();h.supabase.auth.getSession=()=>auth.promise;
 const adding=ui.add();await flush();h.switchSession(session('other'));await h.tick(1800);await adding;
 assert.equal(h.writes.length,0);assert.equal((await h.draft.loadDraft()).length,0);assert.equal(ui.banners.length,0);
 auth.resolve({data:{session:session()},error:null});await flush();assert.equal(h.requests.length,0);
});
for(const event of ['SIGNED_IN','TOKEN_REFRESHED'])test('unknown continuity retires on '+event+' even when new session identifier is undecodable',async()=>{
 const h=harness(),ui=callback(h),gate=deferred(),originalSet=h.storage.setItem;let blocked=false,calls=0;
 h.supabase.auth.getSession=async()=>{if(++calls===1)throw Error('optional read unavailable');return {data:{session:session()},error:null};};
 h.storage.setItem=async(k,v)=>{if(!blocked){blocked=true;await gate.promise;}return originalSet(k,v);};
 const blocker=h.draft.saveDraft([]);await flush();const adding=ui.add();await flush();
 h.switchSession({user:{id:'other'},access_token:'unsupported-session'},event);gate.resolve();await blocker;await adding;
 assert.equal((await h.draft.loadDraft()).length,0);assert.equal(ui.banners.length,0);assert.equal(h.requests.length,0);
});

test('review: precise 1999ms persistence cannot alter accepted 1800ms nutrient snapshot',async()=>{
 const h=harness(),ui=callback(h),adding=ui.add();await flush();await h.tick(1800);await adding;
 const before=plain((await h.draft.loadDraft())[0]);assert.equal(before.food_item_id,undefined);assert.equal(before.calories,130);
 await h.tick(199);h.success();await flush();const after=plain((await h.draft.loadDraft())[0]);assert.equal(after.food_item_id,id);assert.equal(h.requests.length,1);
 for(const field of ['food_id','food_name','food_brand','serving_amount','serving_unit','serving_description','servings_count','calories','protein','carbs','fats','fiber','tempId'])assert.deepEqual(after[field],before[field],field);
});
test('review: unsupported new sign-in must retire unknown continuity before queued append',async()=>{
 const h=harness(),ui=callback(h),gate=deferred(),originalSet=h.storage.setItem;let block=false,reads=0;
 h.storage.setItem=async(k,v)=>{if(!block){block=true;await gate.promise;}return originalSet(k,v);};
 const queued=h.draft.saveDraft([]);await flush();
 h.supabase.auth.getSession=async()=>{if(++reads===1)throw Error('optional auth failed');return {data:{session:session('other',sid2)},error:null};};
 const adding=ui.add();await flush();assert.equal(h.writes.length,1);assert.equal(h.requests.length,0);
 h.switchSession({user:{id:'other'},access_token:'header.'+Buffer.from(JSON.stringify({sub:'other'})).toString('base64url')+'.signature'});
 gate.resolve();await queued;await adding;assert.deepEqual(plain(await h.draft.loadDraft()),[]);
});
async function fullUncertainSession(h) {
 const pending=Array.from({length:128},(_,i)=>h.api.persistUsdaSelection(product({_usda_fdc_id:String(i+1),code:String(i+1)})));
 await flush();assert.equal(h.requests.length,128);await h.tick(1800);const results=await Promise.all(pending);assert.equal(results.filter(r=>r.status==='unknown').length,128);return results;
}
test('128 uncertain FDC ceiling never forgets a write and preserves valid food/macros and search',async()=>{
 const h=harness();await fullUncertainSession(h);
 const extra=product({_usda_fdc_id:'129',code:'129'}),out=await h.api.persistUsdaSelection(extra);assert.equal(out.status,'unknown');assert.equal(out.reason,'capacity');assert.equal(h.requests.length,128);
 const repeat=await h.api.persistUsdaSelection(product({_usda_fdc_id:'1',code:'1'}));assert.equal(repeat.status,'unknown');assert.equal(h.requests.length,128);
 const ui=callback(h);await ui.add(extra);const entries=await h.draft.loadDraft();assert.equal(entries.length,1);assert.equal(entries[0].calories,130);assert.equal(entries[0].serving_amount,100);assert.equal(ui.banners.length,1);
 const search=h.load('utils/foodSearchUtils.ts'),results=search.mergeProducts(new Map(),[extra,product({_usda_fdc_id:'130',code:'130',product_name:'Other rice'})],'supabase','rice');assert.equal(results.length,2);assert.equal(results[0].displayCalories,130);assert.equal(h.requests.length,128);
});
test('positive readback cannot free capacity or permit resend of an uncertain original write',async()=>{
 const h=harness(),pending=await fullUncertainSession(h);h.setRead({data:{id,usda_fdc_id:'1'},error:null});
 assert.equal((await h.api.reconcileUsdaSelection(pending[0].identity)).status,'persisted');
 assert.equal((await h.api.persistUsdaSelection(product({_usda_fdc_id:'129',code:'129'}))).reason,'capacity');assert.equal(h.requests.length,128);
 h.requests[0].reject(Error('transport outcome still uncertain'));await flush();assert.equal((await h.api.persistUsdaSelection(product({_usda_fdc_id:'1',code:'1'}))).status,'persisted');
 assert.equal((await h.api.persistUsdaSelection(product({_usda_fdc_id:'129',code:'129'}))).reason,'capacity');assert.equal(h.requests.length,128);
});
test('original acknowledged success frees one capacity slot and a later explicit refresh retains old operation identity',async()=>{
 const h=harness(),pending=await fullUncertainSession(h);h.success(h.requests[0],'1');await flush();
 const admitted=h.api.persistUsdaSelection(product({_usda_fdc_id:'129',code:'129'}));await flush();assert.equal(h.requests.length,129);h.success(h.requests[128],'129');await admitted;
 const refreshed=h.api.persistUsdaSelection(product({_usda_fdc_id:'1',code:'1'}));await flush();assert.equal(h.requests.length,130);h.success(h.requests[129],'1',sid2);const newer=await refreshed;
 assert.equal(newer.foodItemId,sid2);assert.notEqual(newer.identity.operationId,pending[0].identity.operationId);
 assert.equal((await h.api.continueUsdaSelection(pending[0].identity)).foodItemId,id);
 assert.equal((await h.api.persistUsdaSelection(product({_usda_fdc_id:'2',code:'2'}))).status,'unknown');assert.equal(h.requests.length,130);
});
test('LRU retains at most64 acknowledged operations without evicting uncertain write reservations',async()=>{
 const h=harness(),unknown=await timedOut(h,product({_usda_fdc_id:'999',code:'999'})),known=[];
 for(let i=1;i<=65;i++){const p=h.api.persistUsdaSelection(product({_usda_fdc_id:String(i),code:String(i)}));await flush();h.success(h.requests.at(-1),String(i));known.push(await p);}
 assert.equal((await h.api.continueUsdaSelection(known[0].identity)).status,'unknown');
 assert.equal((await h.api.continueUsdaSelection(known[1].identity)).status,'persisted');
 const p=h.api.persistUsdaSelection(product({_usda_fdc_id:'66',code:'66'}));await flush();h.success(h.requests.at(-1),'66');await p;
 assert.equal((await h.api.continueUsdaSelection(known[2].identity)).status,'unknown');assert.equal((await h.api.continueUsdaSelection(known[1].identity)).status,'persisted');
 const count=h.requests.length;assert.equal((await h.api.persistUsdaSelection(product({_usda_fdc_id:'999',code:'999'}))).status,'unknown');assert.equal(h.requests.length,count);assert.equal(h.api.usdaIdentityIsCurrent(unknown.identity),true);
});
test('normal session refresh preserves full uncertain ceiling; new session permits only new-scope work',async()=>{
 const h=harness(),pending=await fullUncertainSession(h);h.switchSession({...session(),access_token:session().access_token+'refreshed'},'TOKEN_REFRESHED');
 assert.equal((await h.api.persistUsdaSelection(product({_usda_fdc_id:'129',code:'129'}))).reason,'capacity');assert.equal(h.requests.length,128);
 h.switchSession(null);h.switchSession(session('owner',sid2));assert.equal(h.api.usdaIdentityIsCurrent(pending[0].identity),false);
 const p=h.api.persistUsdaSelection(product({_usda_fdc_id:'1',code:'1'}));await flush();assert.equal(h.requests.length,129);h.success(h.requests[128],'1');assert.equal((await p).status,'persisted');
 h.success(h.requests[0],'1');assert.equal((await h.api.continueUsdaSelection(pending[0].identity)).status,'unknown');
});
test('LRU eviction cannot cancel accepted nutrition queued behind a slow draft write',async()=>{
 const h=harness(),ui=callback(h),gate=deferred(),originalSet=h.storage.setItem;let blocked=false;
 h.storage.setItem=async(k,v)=>{if(!blocked){blocked=true;await gate.promise;}return originalSet(k,v);};
 const blocker=h.draft.saveDraft([]);await flush();const adding=ui.add(product({_usda_fdc_id:'999',code:'999'}));await flush();h.success(h.requests[0],'999');await flush();assert.equal(h.writes.length,1);
 for(let i=1;i<=65;i++){const p=h.api.persistUsdaSelection(product({_usda_fdc_id:String(i),code:String(i)}));await flush();h.success(h.requests.at(-1),String(i));await p;}
 gate.resolve();await blocker;await adding;const entries=await h.draft.loadDraft();assert.equal(entries.length,1);assert.equal(entries[0].calories,130);assert.equal(entries[0].food_item_id,id);assert.equal(ui.banners.length,1);assert.equal(ui.alerts.length,0);
});
