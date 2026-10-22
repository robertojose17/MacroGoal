const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpile(fs.readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS }), file);
const { dailyAccess, summarizeDay, loadDailyAction, dailyMealRoute } = require('../utils/coachDailyAction.ts');
const access = { isPremium: true, premiumLoading: false, gated: false, busy: false };
const date = '2026-10-21';
const items = [{ meal_items: [{ calories: 450, protein: 35, carbs: 45, fats: 14 }] }];
function database(overrides = {}) {
  const calls = [];
  let authCount = 0;
  const rows = {
    coach_permissions: { data: { permission_level: 2, can_add_food: true } },
    meals: { data: items }, goals: { data: { daily_calories: 2000, protein_g: 120 } }, ...overrides,
  };
  return {
    calls,
    auth: { async getUser() { authCount++; return { data: { user: { id: overrides.switchAccount && authCount > 1 ? 'b' : 'a' } } }; } },
    from(table) {
      calls.push(['from', table]);
      const query = {};
      for (const method of ['select', 'eq', 'order', 'limit']) query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
      query.maybeSingle = () => Promise.resolve(rows[table]);
      query.then = (resolve, reject) => Promise.resolve(rows[table]).then(resolve, reject);
      return query;
    },
  };
}

test('free, loading, entitlement error, usage gate and busy do not read user tables', async () => {
  for (const patch of [{ isPremium: false }, { premiumLoading: true }, { premiumError: 'offline' }, { gated: true }, { busy: true }]) {
    const db = database();
    const result = await loadDailyAction(db, { ...access, ...patch }, date);
    assert.notEqual(result.kind, 'ready');
    assert.deepEqual(db.calls, []);
  }
  assert.equal(dailyAccess({ ...access, isPremium: false }), 'locked');
});
test('permissions are explicit and fail closed before nutrition reads', async () => {
  for (const data of [null, {}, { permission_level: 1, can_add_food: true }, { permission_level: 2, can_add_food: false }, { permission_level: '2', can_add_food: true }]) {
    const db = database({ coach_permissions: { data } });
    assert.equal((await loadDailyAction(db, access, date)).kind, 'permission');
    assert.deepEqual(db.calls.filter(call => call[0] === 'from'), [['from', 'coach_permissions']]);
  }
});
test('permission, goal and meal read errors are unavailable, never empty success', async () => {
  for (const table of ['coach_permissions', 'meals', 'goals']) {
    assert.equal((await loadDailyAction(database({ [table]: { error: { message: 'denied' }, data: null } }), access, date)).kind, 'unavailable');
  }
});
test('premium summary uses only the account and local date and existing logged totals', async () => {
  const db = database();
  const result = await loadDailyAction(db, access, date);
  assert.equal(result.kind, 'ready');
  assert.equal(result.owner, 'a');
  assert.deepEqual(result.summary.totals, { calories: 450, protein: 35, carbs: 45, fats: 14 });
  for (const table of ['coach_permissions', 'meals', 'goals']) assert.ok(db.calls.some(call => JSON.stringify(call) === JSON.stringify([table, 'eq', 'user_id', 'a'])));
  assert.ok(db.calls.some(call => JSON.stringify(call) === JSON.stringify(['meals', 'eq', 'date', date])));
});
test('account switch during read discards the result', async () => {
  assert.equal((await loadDailyAction(database({ switchAccount: true }), access, date)).kind, 'blocked');
});
test('missing, malformed and zero nutrition remain distinct', () => {
  assert.equal(summarizeDay([], null).kind, 'empty');
  assert.equal(summarizeDay([{ meal_items: [] }], null).kind, 'empty');
  for (const value of [null, undefined, '', 'oops', -1, Infinity]) {
    assert.equal(summarizeDay([{ meal_items: [{ ...items[0].meal_items[0], protein: value }] }], null).kind, 'incomplete');
  }
  assert.equal(summarizeDay(null, null).kind, 'incomplete');
  const zero = summarizeDay([{ meal_items: [{ calories: 0, protein: 0, carbs: 0, fats: 0 }] }], null);
  assert.equal(zero.kind, 'logged');
  assert.equal(zero.goal, null);
  assert.equal(summarizeDay(items, { daily_calories: 0, protein_g: 100 }).goal, null);
});
test('journey preserves meal/date and requires current premium, owner and day', async () => {
  const snapshot = await loadDailyAction(database(), access, date);
  assert.deepEqual(dailyMealRoute(snapshot, access, 'a', date, 'dinner'), {
    pathname: '/my-meals', params: { meal: 'dinner', date, returnTo: '/(tabs)/coach', coachReview: 'true' },
  });
  for (const patch of [{ isPremium: false }, { premiumLoading: true }, { premiumError: 'error' }, { gated: true }, { busy: true }]) assert.equal(dailyMealRoute(snapshot, { ...access, ...patch }, 'a', date, 'dinner'), null);
  assert.equal(dailyMealRoute(snapshot, access, 'b', date, 'dinner'), null);
  assert.equal(dailyMealRoute(snapshot, access, 'a', '2026-10-22', 'dinner'), null);
  assert.equal(dailyMealRoute({ kind: 'permission' }, access, 'a', date, 'dinner'), null);
});
test('Coach-origin plus selects existing details instead of invoking quick add', () => {
  const list = fs.readFileSync(require('node:path').join(__dirname, '../app/my-meals.tsx'), 'utf8');
  assert.match(list, /if \(params\.coachReview === 'true'\) handleSelectMeal\(meal\);\s+else handleQuickAddMeal\(meal\);/);
  assert.match(list, /pathname: '\/my-meals-details'/);
  const card = fs.readFileSync(require('node:path').join(__dirname, '../components/CoachDailyAction.tsx'), 'utf8');
  assert.doesNotMatch(card, /\.insert\(|\.update\(|sendMessage\(|functions\.invoke\(/);
});
test('deployed integration retains server admission and suppresses automatic paid welcome', () => {
  const screen = fs.readFileSync(require('node:path').join(__dirname, '../app/(tabs)/coach.tsx'), 'utf8');
  assert.match(screen, /const COACH_DAILY_ACTION_INTEGRATED = true/);
  assert.match(screen, /COACH_DAILY_ACTION_INTEGRATED && \(.*?<CoachDailyAction/);
  assert.ok(screen.includes('if (COACH_DAILY_ACTION_INTEGRATED) return;'));
  assert.match(screen, /gated=\{isGated\}/);
});
