const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
function load(file, modules = {}) {
  const exported = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'exports', code)(name => { if (name in modules) return modules[name]; throw Error('Unexpected import ' + name); }, exported);
  return exported;
}
const json = load('utils/jsonValue.ts');
function query(result, calls = []) {
  const q = {};
  for (const method of ['select', 'eq', 'order', 'insert', 'upsert', 'update', 'delete', 'single', 'maybeSingle']) q[method] = (...args) => { calls.push([method, ...args]); return q; };
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
}
const imports = db => ({ '@/lib/supabase/client': { supabase: db }, './jsonValue': json, '@/utils/dateUtils': { toLocalDateString: () => '2026-11-12' } });
test('JSON validates nested values, preserves explicit zero, rejects nonfinite/undefined/cycles', () => {
  assert.deepEqual(json.toJson({ n: 0, x: [false, null, 'text'] }), { n: 0, x: [false, null, 'text'] });
  const cycle = {}; cycle.self = cycle;
  for (const value of [NaN, Infinity, { x: undefined }, cycle, new Date(), new Array(2)]) assert.throws(() => json.toJson(value));
});
test('JSON __proto__ remains own data without modifying prototype', () => {
  const value = json.toJson(JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal(Object.hasOwn(value, '__proto__'), true); assert.equal({}.polluted, undefined);
});
test('authenticated request preserves Headers and tuple inputs, bearer added through real Headers API', async () => {
  const calls = []; const savedFetch = global.fetch;
  global.fetch = async (...args) => { calls.push(args); return new Response(); };
  try {
    const api = load('utils/api.ts', { 'expo-constants': { default: { expoConfig: { extra: { backendUrl: 'https://example.invalid' } } } }, 'expo-secure-store': { getItemAsync: async () => 'token' }, 'react-native': { Platform: { OS: 'ios' } } });
    for (const headers of [new Headers({ 'X-Test': 'value' }), [['X-Test', 'value']]]) await api.apiRequest('/read', { headers });
    for (const [, request] of calls) { assert.equal(request.headers.get('X-Test'), 'value'); assert.equal(request.headers.get('Authorization'), 'Bearer token'); }
  } finally { global.fetch = savedFetch; }
});
test('meal plan item missing nutrition stops before any write; explicit zero survives', async () => {
  const calls = [], row = { id: 'item', meal_type: 'snack', food_name: 'Water', translations: null };
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => query({ data: row, error: null }, calls), functions: { invoke: async () => ({}) } };
  const api = load('utils/mealPlansApi.ts', imports(db));
  await assert.rejects(api.addMealPlanItem('plan', { date: '2026-11-12', meal_type: 'snack', food_name: 'Unknown' }), /nutrition_unavailable/);
  assert.equal(calls.length, 0);
  await api.addMealPlanItem('plan', { date: '2026-11-12', meal_type: 'snack', food_name: 'Water', calories: 0, protein: 0, carbs: 0, fats: 0 });
  const body = calls.find(x => x[0] === 'insert')[1]; assert.equal(body.calories, 0); assert.equal(body.fiber, null);
});
test('meal plan reads preserve stored low/zero macros without silently recalculating', async () => {
  const item = { id: 'item', meal_type: 'snack', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: null, translations: null };
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: table => query({ data: table === 'meal_plans' ? { id: 'plan', created_at: null } : [item], error: null }) };
  const result = await load('utils/mealPlansApi.ts', imports(db)).getMealPlan('plan');
  assert.equal(result.created_at, null); assert.equal(result.items[0].calories, 0); assert.equal(result.items[0].fiber, undefined);
});
test('tracker read keeps nullable emoji and original measurement unit without update', async () => {
  const calls = [], tracker = { id: 't', name: 'weight', emoji: null, tracker_type: 'numeric', frequency: 'daily', unit: 'kg', translations: null };
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => query({ data: [tracker], error: null }, calls) };
  const result = await load('utils/trackersApi.ts', imports(db)).listTrackers();
  assert.equal(result[0].emoji, null); assert.equal(result[0].unit, 'kg'); assert.equal(calls.some(x => x[0] === 'update'), false);
});
function social({ actor = 'owner', writeError = null, countError = null, count = 0 } = {}) {
  const calls = [];
  const db = { auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) }, from: table => { calls.push(['from', table]); return query({ error: writeError }, calls); }, rpc: (name, args) => { calls.push(['rpc', name, args]); return query({ data: count, error: countError }); } };
  const api = load('utils/socialApi.ts', { ...imports(db), '@/features/communityPrivacyV2/communityPrivacyRollout': { withCommunityPrivacyScope: fn => fn({ assertActor() {}, request: query => query }) }, '@/features/communityPrivacyV2Compatibility/configuredRemainingReads': {} });
  return { api, calls };
}
test('bookmark owner mismatch performs zero writes', async () => { const s = social({ actor: 'other' }); await assert.rejects(s.api.savePost('post', 'owner'), /actor changed/); assert.equal(s.calls.length, 0); });
test('bookmark write failure never increments or reports success', async () => { const s = social({ writeError: Error('denied') }); await assert.rejects(s.api.savePost('post', 'owner'), /denied/); assert.equal(s.calls.some(x => x[0] === 'rpc'), false); });
test('bookmark partial/unknown counter fails explicitly; legitimate zero retained', async () => {
  for (const patch of [{ countError: Error('failed') }, { count: null }]) { const s = social(patch); await assert.rejects(s.api.unsavePost('post', 'owner'), /count/); }
  const s = social(); assert.deepEqual(await s.api.unsavePost('post', 'owner'), { saved: false, saves_count: 0 });
});
test('referral never awards another account from the client and identifies unverified reward', () => {
  const src = fs.readFileSync('utils/referralApi.ts', 'utf8'); assert.doesNotMatch(src, /xp_awarded|total_xp|from\('user_xp'\)/); assert.match(src, /rewardStatus: 'pending_verification'/); assert.match(src, /select\('xp_amount'\)/); assert.doesNotMatch(src, /totalReferrals \* 1000/);
});
