const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ expectedOwner, deferred = false, initialAppState = 'active' } = {}) {
  const states = [], refs = [], effects = [], calls = [];
  let si = 0, ri = 0, ei = 0, focus, focusCleanup, auth, goal, appStateListener, removedAppListener = false;
  let now = 0, nextTimer = 0; const timers = new Map();
  const setTimer = (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; };
  const clearTimer = id => timers.delete(id);
  let session = { user: { id: 'owner' }, access_token: 'first' }, expected = expectedOwner;
  const React = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = ri++; return refs[i] ??= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn) { const i = ei++; if (!(i in effects)) effects[i] = fn; },
  };
  const exported = {};
  const client = { supabase: { auth: { async getSession() { return { data: { session }, error: null }; }, onAuthStateChange(fn) { auth = fn; return { data: { subscription: { unsubscribe() {} } } }; } } }, SUPABASE_PROJECT_URL: 'https://example.invalid', supabasePublicKey: 'public' };
  const imports = {
    'react-native': { AppState: { currentState: initialAppState, addEventListener(event, fn) { assert.equal(event, 'change'); appStateListener = fn; return { remove() { removedAppListener = true; } }; } } },
    react: React, 'expo-router': { useFocusEffect(fn) { focus = fn; } }, '@/lib/supabase/client': client,
    '@/utils/goalChangeEvents': { subscribeGoalChanged(fn) { goal = fn; return () => {}; } },
    '@/utils/dynamicTdeeObservation': { observationRolloutEnabled: () => true, requestObservation(input) {
      const call = { input, resolve: null, reject: null }; calls.push(call);
      if (!deferred) return Promise.resolve({ revision: calls.length, owner: input.expectedOwner });
      return new Promise((resolve, reject) => { call.resolve = resolve; call.reject = reject; });
    } },
  };
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', ts.transpileModule(fs.readFileSync('hooks/useObservationResource.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => { assert.ok(name in imports, name); return imports[name]; }, exported, setTimer, clearTimer);
  const parse = value => value;
  const render = () => { si = ri = ei = 0; return exported.useObservationResource('program', parse, expected); };
  render(); const cleanups = effects.map(fn => fn()); focusCleanup = focus();
  return { calls, render, states,
    appState(value) { if (!removedAppListener) appStateListener(value); },
    timerCount: () => timers.size,
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
    blur() { focusCleanup(); }, focus() { focusCleanup = focus(); },
    auth(next) { session = next; auth('TOKEN_REFRESHED', next); }, goal(id) { goal(id); },
    expected(next) { expected = next; },
    resolve(index, value = { revision: index + 1 }) { calls[index].resolve(value); },
    unmount() { focusCleanup(); cleanups.forEach(fn => fn?.()); },
  };
}

test('mount issues only one read; returning from food and weight screens refreshes exactly once each', async () => {
  const h = harness(); await flush(); assert.equal(h.calls.length, 1); assert.equal(h.render().value.revision, 1);
  for (const source of ['food', 'weight']) {
    const before = h.calls.length; h.blur(); assert.equal(h.render().value, null); h.focus(); assert.equal(h.render().value, null);
    await flush(); assert.equal(h.calls.length, before + 1, source); assert.equal(h.render().value.revision, before + 1);
  }
  assert.ok(h.calls.every(call => call.input.settings === undefined)); h.unmount();
});
test('late pre-blur read cannot seed the next focus or stop its loading state', async () => {
  const h = harness({ deferred: true }); await flush(); h.blur(); assert.equal(h.calls[0].input.signal.aborted, true); h.focus(); await flush();
  h.resolve(0, { stale: true }); await flush(); assert.equal(h.render().value, null); assert.equal(h.render().loading, true);
  h.resolve(1, { fresh: true }); await flush(); assert.deepEqual(h.render().value, { fresh: true }); assert.equal(h.render().loading, false); h.unmount();
});
test('blur during POST aborts its publication, then refocus reconciles by one GET and no replay', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 4); const rejected = assert.rejects(mutation, /account_changed/); await flush();
  assert.deepEqual(h.calls[1].input.settings, { enabled: false, reviewDay: 4 }); h.blur(); h.focus(); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.render().value, null); assert.equal(h.calls[1].input.signal.aborted, true);
  h.resolve(1, { enabled: false }); await rejected; await flush();
  assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.settings, undefined); h.resolve(2, { reconciled: true }); await flush();
  assert.deepEqual(h.render().value, { reconciled: true }); assert.equal(h.calls.filter(x => x.input.settings).length, 1); h.unmount();
});
test('triple focus while POST is pending queues one reconciliation rather than duplicate reads or writes', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(true, 2), rejected = assert.rejects(mutation, /account_changed/); await flush();
  for (let i = 0; i < 3; i++) { h.blur(); h.focus(); }
  await flush(); assert.equal(h.calls.length, 2); h.resolve(1); await rejected; await flush();
  assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.settings, undefined); h.resolve(2); await flush(); assert.equal(h.render().loading, false); h.unmount();
});
test('POST settling while blurred is not replayed or reconciled until the next focus', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 1), rejected = assert.rejects(mutation, /account_changed/); await flush(); h.blur(); h.resolve(1); await rejected; await flush();
  assert.equal(h.calls.length, 2); h.focus(); await flush(); assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.settings, undefined); h.resolve(2); await flush(); h.unmount();
});
test('same-actor token refresh preserves a valid snapshot without another read', async () => {
  const h = harness(); await flush(); const value = h.render().value; h.auth({ user: { id: 'owner' }, access_token: 'renewed' }); await flush();
  assert.strictEqual(h.render().value, value); assert.equal(h.calls.length, 1); h.blur(); h.focus(); await flush(); assert.equal(h.calls[1].input.session.access_token, 'renewed'); h.unmount();
});
test('signout clears snapshot and a late POST cannot publish or trigger reconciliation for signed-out account', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 1), rejected = assert.rejects(mutation, /account_changed/); await flush(); h.blur(); h.focus(); h.auth(null);
  h.resolve(1); await rejected; await flush(); assert.equal(h.render().value, null); assert.equal(h.render().loading, false); assert.equal(h.render().error, null); assert.equal(h.calls.length, 2); h.unmount();
});
test('actor switch during blurred POST reconciles only the new actor and never reuses old response', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 1), rejected = assert.rejects(mutation, /account_changed/); await flush(); h.blur(); h.auth({ user: { id: 'other' }, access_token: 'other-token' }); h.focus();
  h.resolve(1, { owner: 'owner' }); await rejected; await flush(); assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.expectedOwner, 'other'); assert.equal(h.calls[2].input.settings, undefined);
  h.resolve(2, { owner: 'other' }); await flush(); assert.equal(h.render().value.owner, 'other'); h.unmount();
});
test('goal event while blurred neither fetches nor revives old snapshot; focus reads once', async () => {
  const h = harness(); await flush(); h.blur(); h.goal('owner'); await flush(); assert.equal(h.calls.length, 1); assert.equal(h.render().value, null);
  h.focus(); await flush(); assert.equal(h.calls.length, 2); h.unmount();
});
test('settings mutation while blurred or after unmount is rejected before network', async () => {
  const h = harness(); await flush(); const stale = h.render(); h.blur(); await assert.rejects(stale.updateSettings(true, 3), /observation_unavailable/); h.unmount();
  await assert.rejects(stale.updateSettings(true, 3), /observation_unavailable/); assert.equal(h.calls.length, 1);
});
test('triple focus discards both older GET completions and publishes only the latest', async () => {
  const h = harness({ deferred: true }); await flush(); for (let i = 0; i < 2; i++) { h.blur(); h.focus(); await flush(); }
  assert.equal(h.calls.length, 3); h.resolve(1, { stale: 2 }); h.resolve(0, { stale: 1 }); await flush(); assert.equal(h.render().value, null); assert.equal(h.render().loading, true);
  h.resolve(2, { latest: true }); await flush(); assert.deepEqual(h.render().value, { latest: true }); h.unmount();
});
test('changing expected owner during a flight prevents stale response publication', async () => {
  const h = harness({ expectedOwner: 'owner', deferred: true }); await flush(); h.expected('other'); h.render(); h.resolve(0, { wrong: true }); await flush();
  assert.equal(h.render().value, null); assert.equal(h.render().error, 'account_changed'); assert.equal(h.calls.length, 1);
  h.auth({ user: { id: 'other' }, access_token: 'other-token' }); await flush(); assert.equal(h.calls[1].input.expectedOwner, 'other'); h.resolve(1, { owner: 'other' }); await flush(); assert.equal(h.render().value.owner, 'other'); h.unmount();
});
test('own goal change during POST reconciles once without navigating or replaying settings', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 4), rejected = assert.rejects(mutation, /account_changed/); await flush();
  h.goal('owner'); assert.equal(h.render().value, null); assert.equal(h.calls[1].input.signal.aborted, true); await flush(); assert.equal(h.calls.length, 2);
  h.resolve(1, { obsolete: true }); await rejected; await flush(); assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.settings, undefined);
  assert.equal(h.render().loading, true); assert.equal(h.render().value, null); h.resolve(2, { enabled: false, reviewDay: 4 }); await flush();
  assert.deepEqual(h.render().value, { enabled: false, reviewDay: 4 }); assert.equal(h.render().loading, false); assert.equal(h.render().error, null);
  assert.equal(h.calls.filter(call => call.input.settings).length, 1); h.unmount();
});
test('multiple goal invalidations during one POST coalesce to one read', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(true, 2), rejected = assert.rejects(mutation, /account_changed/); await flush();
  h.goal('owner'); h.goal(); h.goal('owner'); await flush(); assert.equal(h.calls.length, 2); assert.equal(h.render().loading, true);
  h.resolve(1); await rejected; await flush(); assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.settings, undefined);
  h.resolve(2, { reconciled: true }); await flush(); assert.deepEqual(h.render().value, { reconciled: true }); assert.equal(h.calls.filter(call => call.input.settings).length, 1); h.unmount();
});
test('signout cancels reconciliation queued by goal invalidation during POST', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 2), rejected = assert.rejects(mutation, /account_changed/); await flush();
  h.goal('owner'); h.auth(null); h.resolve(1); await rejected; await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.render().value, null); assert.equal(h.render().loading, false); assert.equal(h.render().error, null); h.unmount();
});
test('blur cancels queued goal reconciliation until returning to the screen', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 2), rejected = assert.rejects(mutation, /account_changed/); await flush();
  h.goal('owner'); h.blur(); h.resolve(1); await rejected; await flush(); assert.equal(h.calls.length, 2); assert.equal(h.render().loading, false);
  h.focus(); await flush(); assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.settings, undefined); h.resolve(2); await flush(); h.unmount();
});
test('another actors goal event neither cancels POST nor schedules a read', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 2); await flush(); h.goal('other'); assert.equal(h.calls[1].input.signal.aborted, false);
  h.resolve(1, { enabled: false }); await mutation; await flush(); assert.equal(h.calls.length, 2); assert.deepEqual(h.render().value, { enabled: false }); h.unmount();
});
test('background hides and cancels cache timer; foreground on the same route reads once', async () => {
  const h = harness(); await flush(); assert.equal(h.timerCount(), 1); h.appState('background'); assert.equal(h.render().value, null); assert.equal(h.timerCount(), 0);
  h.advance(10 * 60 * 1000); await flush(); assert.equal(h.calls.length, 1); h.appState('active'); h.appState('active'); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.render().value.revision, 2); assert.equal(h.timerCount(), 1); h.unmount(); assert.equal(h.timerCount(), 0);
});
test('cache expires at five minutes while foreground/focused and replaces value with one GET', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0, { previous: true }); await flush();
  h.advance(299999); await flush(); assert.deepEqual(h.render().value, { previous: true }); assert.equal(h.calls.length, 1);
  h.advance(1); assert.equal(h.render().value, null); assert.equal(h.render().loading, true); await flush(); assert.equal(h.calls.length, 2); assert.equal(h.timerCount(), 0);
  h.advance(600000); await flush(); assert.equal(h.calls.length, 2); h.resolve(1, { fresh: true }); await flush(); assert.deepEqual(h.render().value, { fresh: true }); assert.equal(h.timerCount(), 1); h.unmount();
});
test('background during POST reconciles once on foreground without another mutation', async () => {
  const h = harness({ deferred: true }); await flush(); h.resolve(0); await flush();
  const mutation = h.render().updateSettings(false, 4), rejected = assert.rejects(mutation, /account_changed/); await flush(); h.appState('inactive'); h.appState('background');
  assert.equal(h.render().value, null); assert.equal(h.timerCount(), 0); assert.equal(h.calls[1].input.signal.aborted, true);
  h.appState('active'); h.appState('active'); await flush(); assert.equal(h.calls.length, 2); h.resolve(1); await rejected; await flush();
  assert.equal(h.calls.length, 3); assert.equal(h.calls[2].input.settings, undefined); h.resolve(2); await flush(); assert.equal(h.calls.filter(call => call.input.settings).length, 1); h.unmount();
});
test('late read resolving in background cannot publish or schedule expiry', async () => {
  const h = harness({ deferred: true }); await flush(); h.appState('background'); h.resolve(0, { obsolete: true }); await flush();
  assert.equal(h.render().value, null); assert.equal(h.timerCount(), 0); h.appState('active'); await flush(); assert.equal(h.calls.length, 2);
  h.resolve(1, { current: true }); await flush(); assert.deepEqual(h.render().value, { current: true }); h.unmount();
});
test('blur and unmount remove expiry timers and prevent background reads', async () => {
  const h = harness(); await flush(); h.blur(); assert.equal(h.timerCount(), 0); h.advance(300000); h.appState('background'); h.appState('active'); await flush(); assert.equal(h.calls.length, 1);
  h.focus(); await flush(); assert.equal(h.calls.length, 2); h.unmount(); assert.equal(h.timerCount(), 0); h.advance(600000); h.appState('background'); h.appState('active'); await flush(); assert.equal(h.calls.length, 2);
});
test('mount while already background waits for foreground without a stuck loading flag', async () => {
  const h = harness({ initialAppState: 'background' }); await flush(); assert.equal(h.calls.length, 0); assert.equal(h.render().loading, false); assert.equal(h.timerCount(), 0);
  h.appState('active'); await flush(); assert.equal(h.calls.length, 1); assert.equal(h.render().loading, false); h.unmount();
});
test('unknown initial AppState cannot grant foreground until native active event arrives', async () => {
  const h = harness({ initialAppState: null }); await flush(); assert.equal(h.calls.length, 0); h.appState('active'); await flush(); assert.equal(h.calls.length, 1); h.unmount();
});
test('same-actor token refresh does not extend the five-minute snapshot lifetime', async () => {
  const h = harness(); await flush(); h.advance(240000); const previous = h.render().value; h.auth({ user: { id: 'owner' }, access_token: 'renewed' });
  assert.strictEqual(h.render().value, previous); h.advance(60000); assert.equal(h.render().value, null); await flush(); assert.equal(h.calls.length, 2); assert.equal(h.calls[1].input.session.access_token, 'renewed'); h.unmount();
});
test('actor switch in background waits and foreground reads only the new actor', async () => {
  const h = harness(); await flush(); h.appState('background'); h.auth({ user: { id: 'other' }, access_token: 'other-token' }); await flush();
  assert.equal(h.calls.length, 1); assert.equal(h.render().value, null); assert.equal(h.timerCount(), 0); h.appState('active'); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].input.expectedOwner, 'other'); assert.equal(h.render().value.owner, 'other'); h.unmount();
});
