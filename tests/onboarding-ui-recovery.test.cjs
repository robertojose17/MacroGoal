const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ absent = false, completed = false, slowSave = false } = {}) {
  const states = [], refs = [], effects = [];
  let si = 0, ri = 0, ei = 0, focus, cleanFocus, authEvent, actor = absent ? null : 'owner', profileReads = 0, resolveSave;
  let profile = { id: 'owner', updated_at: '2026-11-12T01:02:03.123456+00:00', onboarding_completed: completed };
  const calls = [], controllers = []; const sessions = new Map();
  const React = {
    useState(v) { const i = si++; if (!(i in states)) states[i] = typeof v === 'function' ? v() : v; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
    useRef(v) { const i = ri++; return refs[i] ??= { current: v }; },
    useCallback(f) { return f; },
    useEffect(f) { const i = ei++; if (!(i in effects)) effects[i] = f(); },
  };
  const client = { auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null }, error: null }), onAuthStateChange(f) { authEvent = f; return { data: { subscription: { unsubscribe() {} } } }; } }, from(table) { const q = { select: () => q, eq: () => q, maybeSingle: async () => { if (table === 'users') profileReads++; return { data: table === 'users' ? { ...profile } : null, error: null }; } }; return q; } };
  const makeController = () => {
    let pending = null, busy = false, definitive = false;
    async function execute(guard) { busy = true; try { if (slowSave && calls.length === 1) await new Promise(resolve => { resolveSave = resolve; }); if (!guard()) throw new Error('request_cancelled'); const result = { id: 'new' }; pending = null; return result; } finally { busy = false; } }
    const c = { save: async input => { if (pending || busy) throw Error('pending'); pending = input; calls.push(input); return execute(input.isCurrent); }, retry: async guard => { if (!pending || definitive) throw Error('review'); calls.push(pending); return execute(guard); }, recover: async () => pending ? (definitive ? 'review' : 'pending') : 'empty', ownsPending: () => !!pending, pendingScope: () => pending?.operation ?? null, pendingData:()=>pending, hasPending: () => !!pending, isBusy: () => busy, canRetry: () => !!pending && !busy && !definitive, discard() { if (busy || (pending && !definitive)) return false; pending = null; return true; }, async discardAsync() { return c.discard(); }, rejectDefinitively() { definitive = true; } };
    controllers.push(c); return c;
  };
  const exports = {};
  const src = fs.readFileSync('hooks/useInitialOnboarding.ts', 'utf8');
  new Function('require', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => ({ react: React, 'expo-router': { useFocusEffect(f) { focus = f; } }, '@/lib/supabase/client': { supabase: client }, '@/utils/saveNutritionGoal': { createNutritionGoalSaveController: makeController }, '@/utils/nutritionGoalRequest': { validGoal: () => true }, '@/utils/acceptedGoalSession': { acceptedGoalSessionFor(id) { if (!sessions.has(id)) { const save=makeController(); const restart={isBusy:()=>false,ownsPending:()=>false}; sessions.set(id,{save,restart,recover:async()=>{}}); } return sessions.get(id); } } })[name], exports);
  const render = () => { si = 0; ri = 0; ei = 0; return exports.useInitialOnboarding(); };
  let hook = render(); cleanFocus = focus();
  return { render, calls, controllers, profileReads: () => profileReads, setProfile: next => { profile = { ...profile, ...next }; }, changeActor(next) { actor = next; authEvent('SIGNED_OUT', next ? { user: { id: next } } : null); }, blur() { cleanFocus(); }, focus() { cleanFocus = focus(); }, resolve() { resolveSave(); }, hook };
}
test('initial load is read-only and no automatic goal write occurs', async () => { const h = harness(); await flush(); const s = h.render(); assert.equal(s.loading, false); assert.equal(s.snapshot.profile.id, 'owner'); assert.equal(h.calls.length, 0); });
test('missing owner never leaves saving spinner or sends a request', async () => { const h = harness({ absent: true }); await flush(); assert.equal(await h.render().run({ goal: {}, profile: {} }), false); const s = h.render(); assert.equal(s.saving, false); assert.match(s.error, /account/i); assert.equal(h.calls.length, 0); });
test('focus refresh keeps original microsecond CAS for the open form', async () => { const h = harness(); await flush(); const original = h.render().snapshot.profile.updated_at; h.blur(); h.setProfile({ updated_at: '2026-11-12T02:00:00Z' }); h.focus(); await flush(); assert.equal(h.profileReads(), 1); await h.render().run({ goal: { daily_calories: 2000 }, profile: {} }); assert.equal(h.calls[0].expectedProfileUpdatedAt, original); assert.equal(h.calls[0].operation, 'initial_onboarding'); });
test('completed account is blocked, never reset to initial onboarding', async () => { const h = harness({ completed: true }); await flush(); const s = h.render(); assert.equal(s.blocked, true); assert.match(s.error, /already complete/); assert.equal(h.calls.length, 0); });
test('signout clears snapshot and blocks a stale submit callback', async () => { const h = harness(); await flush(); const old = h.render(); h.changeActor(null); assert.equal(await old.run({ goal: {}, profile: {} }), false); const s = h.render(); assert.equal(s.snapshot, null); assert.equal(s.blocked, true); assert.equal(s.saving, false); assert.equal(h.calls.length, 0); });
test('blurred submitted request remains pending; focus never retries, explicit retry uses same payload', async () => { const h = harness({ slowSave: true }); await flush(); const saving = h.render().run({ goal: { daily_calories: 2000 }, profile: { current_weight: 80 } }); await flush(); h.blur(); h.focus(); await flush(); h.resolve(); assert.equal(await saving, false); let s = h.render(); assert.equal(s.saving, false); assert.equal(s.pending, true); assert.equal(h.calls.length, 1); assert.equal(await s.run(), true); assert.strictEqual(h.calls[0], h.calls[1]); assert.equal(h.render().saved, true); });
test('UI contains no legacy writes/backfill and requires explicit acceptance', () => { const src = fs.readFileSync('app/onboarding/complete.tsx', 'utf8'); assert.doesNotMatch(src, /backfill-tdee-estimates|is_active:\s*false|from\('goals'\)\.insert|birthYear|\$\{.*\}-01-01/); assert.match(src, /onNext=\{acceptPreparedGoal\}/); assert.match(src, /dateOfBirth=\{dateOfBirth\}/); assert.match(src, /disabled=\{onboarding.saving \|\| onboarding.pending \|\| onboarding.saved\}/); assert.match(src, /Retry original request/); });
test('paywall Step10 implementation is unchanged from production source base', () => {
  // SHA-256 of Step10 through EOF in source base 5a10c5e. Works in shallow CI checkouts.
  const crypto = require('node:crypto');
  const now = fs.readFileSync('app/onboarding/complete.tsx', 'utf8');
  assert.equal(crypto.createHash('sha256').update(now.slice(now.indexOf('function Step10('))).digest('hex'), '6186c2d461fd3f74999337f1f75a5052365febedc3943e2e8e42903c68838edc');
});
