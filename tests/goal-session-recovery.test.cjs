const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');
const owner = '00000000-0000-4000-8000-000000000001';
const oldId = '00000000-0000-4000-8000-000000000002';
const newId = '00000000-0000-4000-8000-000000000003';
const requestId = '00000000-0000-4000-8000-000000000004';
const flush = () => new Promise(resolve => setImmediate(resolve));
function goal() { return { id: oldId, user_id: owner, is_active: true, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00.123456+00:00', goal_type: 'lose', goal_intensity: 1, target_weight: 70, daily_calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 67, fiber_g: 0, loss_rate_lbs_per_week: 1, macro_preset: 'balanced', start_date: '2026-11-01', start_journey_date: '2026-11-01', base_daily_calories: 2000, last_adaptive_update: null }; }
function fixture({ reject = null, platform = 'ios', secureUnavailable = false } = {}) {
  const secure = new Map(), witness = new Map(), calls = [], authListeners = new Set();
  let actor = owner, row = goal(), lose = true, paused = null;
  const profile = { id: owner, updated_at: '2026-11-01T01:02:03.123456+00:00', activity_level: 'moderate', goal_weight: 70, onboarding_completed: false };
  const client = {
    auth: {
      async getUser() { return { data: { user: actor ? { id: actor } : null }, error: null }; },
      onAuthStateChange(fn) { authListeners.add(fn); return { data: { subscription: { unsubscribe() { authListeners.delete(fn); } } } }; },
    },
    from(table) { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'users' ? { ...profile } : { ...row }, error: null }) }; return q; },
    async rpc(name, payload) {
      calls.push({ name, payload: structuredClone(payload) });
      if (reject) return { data: null, error: { code: reject, message: 'review required' } };
      row = { ...goal(), ...payload.p_goal, id: newId, created_at: '2026-11-12T00:00:00Z', updated_at: '2026-11-12T00:00:00Z' };
      Object.assign(profile, payload.p_profile);
      if (lose) { lose = false; throw new Error('response lost'); }
      return { data: { ...row }, error: null };
    },
  };
  const storage = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 9, isAvailableAsync: async () => true,
    async getItemAsync(key) { if (secureUnavailable) throw Error('secure_storage_unavailable'); if (paused) await paused.promise; return secure.get(key) ?? null; },
    async setItemAsync(key, value) { secure.set(key, value); }, async deleteItemAsync(key) { secure.delete(key); },
  };
  function process() {
    const cache = new Map(); let runtime;
    const React = {
      useState(value) { const i = runtime.si++; if (!(i in runtime.states)) runtime.states[i] = typeof value === 'function' ? value() : value; const state = runtime; return [state.states[i], next => { state.states[i] = typeof next === 'function' ? next(state.states[i]) : next; }]; },
      useRef(value) { const i = runtime.ri++; return runtime.refs[i] ??= { current: value }; },
      useCallback(fn) { return fn; },
      useEffect(fn) { const i = runtime.ei++; if (!(i in runtime.effects)) runtime.effects[i] = fn(); },
    };
    function load(file) {
      if (cache.has(file)) return cache.get(file);
      const module = { exports: {} }; cache.set(file, module.exports);
      const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      new Function('require', 'module', 'exports', code)(id => {
        if (id === 'react') return React;
        if (id === 'expo-router') return { useFocusEffect(fn) { runtime.focus = fn; } };
        if (id === '@/lib/supabase/client') return { supabase: client, SUPABASE_PROJECT_URL: 'https://esgptfiofoaeguslgvcq.supabase.co' };
        if (id === 'expo-secure-store') return storage;
        if (id === '@react-native-async-storage/async-storage') return { getItem: async key => witness.get(key) ?? null, setItem: async (key, value) => { witness.set(key, value); }, removeItem: async key => { witness.delete(key); } };
        if (id === 'react-native') return { Platform: { OS: platform } };
        if (id === 'expo-crypto') return { randomUUID: () => requestId, CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digestStringAsync: async (_, value) => crypto.createHash('sha256').update(value).digest('hex') };
        if (id === './goalChangeEvents') return { emitGoalChanged() {} };
        if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
        if (id.startsWith('.')) return load(path.normalize(path.join(path.dirname(file), id)) + '.ts');
        throw new Error('unexpected module: ' + id);
      }, module, module.exports);
      return module.exports;
    }
    return {
      session: () => load('utils/acceptedGoalSession.ts').acceptedGoalSessionFor(owner),
      hook(kind) {
        const state = { states: [], refs: [], effects: [], si: 0, ri: 0, ei: 0, focus: null, cleanup: null };
        const name = kind === 'editor' ? 'useAcceptedGoalEditor' : 'useInitialOnboarding';
        const fn = load('hooks/' + name + '.ts')[name];
        const render = () => { runtime = state; state.si = state.ri = state.ei = 0; return fn(); };
        render(); state.cleanup = state.focus();
        return { render, blur() { state.cleanup(); }, focus() { state.cleanup = state.focus(); } };
      },
    };
  }
  async function seed(operation = 'manual_goal') {
    const session = process().session(); await session.recover(() => true);
    const input = { userId: owner, expectedProfileUpdatedAt: profile.updated_at, expectedGoal: goal(), operation, goal: { fiber_g: 0, daily_calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 67 }, profile: operation === 'initial_onboarding' ? { onboarding_completed: true } : { activity_level: 'moderate' }, isCurrent: () => true };
    await assert.rejects(session.save.save(input)); return structuredClone(calls[0]);
  }
  return { process, seed, calls, secure, witness, profile,
    actor(value) { actor = value; for (const fn of authListeners) fn('SIGNED_OUT', value ? { user: { id: value } } : null); },
    pause() { let resolve; const promise = new Promise(r => { resolve = r; }); paused = { promise, resolve }; },
    release() { const prior = paused; paused = null; prior.resolve(); },
  };
}

test('cold session hydration reads durable request without RPC and shares one controller pair', async () => {
  const f = fixture(); await f.seed(); const cold = f.process(), session = cold.session();
  assert.strictEqual(cold.session(), session); await session.recover(() => true);
  assert.equal(f.calls.length, 1); assert.equal(session.save.ownsPending(), true); assert.equal(session.restart.hasPending(), true); assert.equal(session.restart.ownsPending(), false);
});
test('authenticated web editor reads profile without native SecureStore and blocks all goal mutations', async () => {
  const f = fixture({platform:'web',secureUnavailable:true});
  const h = f.process().hook('editor'); await flush();
  assert.equal(h.render().snapshot.profile.id,owner); assert.equal(h.render().snapshot.goal.id,oldId);
  assert.equal(h.render().error,''); assert.equal(h.render().readOnly,true);
  assert.equal(h.render().canRetrySave,false); assert.equal(h.render().canRetryRestart,false);
  await assert.rejects(h.render().run('save'),/browser/);
  await assert.rejects(h.render().run('restart'),/browser/);
  assert.equal(await h.render().review(),false); assert.equal(f.calls.length,0);
});
test('web read still rejects missing authenticated actor and clears account switches', async () => {
  const f = fixture({platform:'web'}), h=f.process().hook('editor'); await flush();
  assert.equal(h.render().snapshot.profile.id,owner);
  f.actor(null); assert.equal(h.render().snapshot,null);
  await assert.rejects(h.render().refresh()); assert.equal(h.render().snapshot,null); assert.equal(f.calls.length,0);
});
test('native storage failure remains fail closed and is not treated as web read-only', async () => {
  const f=fixture({secureUnavailable:true}),h=f.process().hook('editor');await flush();
  assert.equal(h.render().snapshot,null);assert.match(h.render().error,/storage/);assert.equal(f.calls.length,0);
});
test('editor explicit retry ignores mirror lock, preserves exact UUID/CAS and clears both controllers', async () => {
  const f = fixture(), original = await f.seed(); const cold = f.process(), h = cold.hook('editor'); await flush();
  assert.equal(h.render().canRetrySave, true); assert.equal(h.render().pending, true); assert.equal(f.calls.length, 1);
  await h.render().run('save'); assert.deepEqual(f.calls[1], original); assert.equal(h.render().pending, false); assert.equal(cold.session().restart.hasPending(), false);
});
test('onboarding refuses a recovered manual request without presenting retry or changing it', async () => {
  const f = fixture(); await f.seed(); const h = f.process().hook('onboarding'); await flush();
  assert.equal(h.render().blocked, true); assert.equal(h.render().canRetry, false); assert.equal(await h.render().run(), false); assert.equal(f.calls.length, 1);
});
test('Settings refuses initial-onboarding replay and directs it back to onboarding', async () => {
  const f = fixture(); await f.seed('initial_onboarding'); const h = f.process().hook('editor'); await flush();
  assert.equal(h.render().snapshot, null); assert.equal(h.render().canRetrySave, false); assert.match(h.render().error, /onboarding/i);
  await assert.rejects(h.render().run('save'), /onboarding/i); assert.equal(f.calls.length, 1);
});
test('completed profile with original pending onboarding can explicitly retry exact saved request', async () => {
  const f = fixture(), original = await f.seed('initial_onboarding'); const h = f.process().hook('onboarding'); await flush();
  assert.equal(h.render().blocked, false); assert.equal(h.render().canRetry, true); assert.equal(f.calls.length, 1);
  assert.equal(await h.render().run(), true); assert.deepEqual(f.calls[1], original); assert.equal(h.render().saved, true);
});
test('definitive 40001 review clears asynchronously and rehydrates mirror without any replay', async () => {
  const f = fixture({ reject: '40001' }); await f.seed(); const cold = f.process(), h = cold.hook('editor'); await flush();
  assert.equal(h.render().pending, true); assert.equal(h.render().canRetrySave, false);
  assert.equal(await h.render().review(), true); assert.equal(f.calls.length, 1); assert.equal(h.render().pending, false); assert.equal(cold.session().restart.hasPending(), false); assert.equal(f.secure.size, 0); assert.equal(f.witness.size, 0);
});
test('uncertain request cannot be discarded by review or silently replaced', async () => {
  const f = fixture(); await f.seed(); const h = f.process().hook('editor'); await flush();
  assert.equal(await h.render().review(), false); assert.equal(h.render().pending, true); assert.equal(f.calls.length, 1); assert.ok(f.secure.size > 0);
});
test('blur during recovery cannot publish snapshot or send RPC; refocus recovers without replay', async () => {
  const f = fixture(); await f.seed(); f.pause(); const h = f.process().hook('editor'); await flush(); h.blur(); f.release(); await flush();
  assert.equal(h.render().snapshot, null); assert.equal(f.calls.length, 1); h.focus(); await flush(); assert.equal(h.render().canRetrySave, true); assert.equal(f.calls.length, 1);
});
test('actor change during recovery leaves no snapshot and stale callbacks cannot replay', async () => {
  const f = fixture(); await f.seed(); f.pause(); const h = f.process().hook('editor'); await flush(); const old = h.render(); f.actor(null); f.release(); await flush();
  assert.equal(h.render().snapshot, null); await assert.rejects(old.run('save')); assert.equal(f.calls.length, 1);
});
test('overlapping recovery callers serialize without sending or replacing pending request', async () => {
  const f = fixture(); await f.seed(); const session = f.process().session(); f.pause();
  const first = session.recover(() => true), second = session.recover(() => true), third = session.recover(() => true); f.release(); await Promise.all([first, second, third]);
  assert.equal(session.save.ownsPending(), true); assert.equal(session.restart.ownsPending(), false); assert.equal(f.calls.length, 1);
});
test('lost SecureStore head with presence witness blocks UI before it can claim no pending request', async () => {
  const f = fixture(); await f.seed(); for (const key of f.secure.keys()) if (key.endsWith('.head')) f.secure.delete(key);
  const h = f.process().hook('editor'); await flush(); assert.equal(h.render().snapshot, null); assert.match(h.render().error, /lost|storage|review/i); assert.equal(f.calls.length, 1);
});

test('onboarding signout while cold recovery is suspended does not throw or retain a usable form', async () => {
  const f = fixture(); await f.seed('initial_onboarding'); f.pause(); const h = f.process().hook('onboarding'); await flush();
  const old = h.render(); assert.doesNotThrow(() => f.actor(null)); f.release(); await flush();
  assert.equal(h.render().snapshot, null); assert.equal(h.render().blocked, true); assert.equal(await old.run(), false); assert.equal(f.calls.length, 1);
});
test('recovery does not authorize stale owner even when the request was already hydrated in memory', async () => {
  const f = fixture(); await f.seed(); const session = f.process().session(); await session.recover(() => true); f.actor(null);
  await assert.rejects(session.recover(() => true), /account_changed/); assert.equal(f.calls.length, 1);
});
test('lost-key UI failure does not silently permit another new request', async () => {
  const f = fixture(); await f.seed(); for (const key of f.secure.keys()) if (key.endsWith('.head')) f.secure.delete(key);
  const cold = f.process(), h = cold.hook('editor'); await flush();
  await assert.rejects(h.render().run('save', { userId: owner, expectedProfileUpdatedAt: f.profile.updated_at, expectedGoal: goal(), operation: 'manual_goal', goal: { fiber_g: 0 }, profile: {}, isCurrent: () => true }));
  assert.equal(f.calls.length, 1); assert.ok(f.witness.size > 0);
});
