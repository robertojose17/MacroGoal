const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/sync-subscription/index.ts', 'utf8');
const future = '2099-01-01T00:00:00Z';
const past = '2000-01-01T00:00:00Z';
const body = (value = {}, subscriptions = {}) => ({ subscriber: { entitlements: value, subscriptions } });
function fixture(options = {}) {
  let handler, updatePayload, writes = 0;
  const filters = [];
  const profile = options.profile === undefined ? { updated_at: '2026-01-01T00:00:00Z', user_type: 'premium', is_premium: true } : options.profile;
  const admin = { from(table) {
    let updating = false;
    const chain = {
      select() { return chain; },
      eq(key, value) { filters.push([key, value]); return chain; },
      is(key, value) { filters.push([key, value]); return chain; },
      update(value) { updating = true; updatePayload = value; writes++; return chain; },
      async maybeSingle() {
        if (updating) return { data: options.casMissing ? null : { id: 'fixture-user' }, error: options.updateError || null };
        return table === 'users' ? { data: profile, error: options.profileError || null } : { data: options.mirror ?? null, error: options.mirrorError || null };
      },
    };
    return chain;
  } };
  const auth = { auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: 'fixture-user' } }, error: null }) } };
  const sandbox = {
    serve: value => { handler = value; },
    createClient: (_url, key) => key === 'service' ? admin : auth,
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', REVENUECAT_API_KEY: 'fixture-only' })[name] } },
    fetch: async () => { if (options.networkError) throw new Error('fixture'); return { status: options.status ?? 200, json: async () => options.provider ?? body() }; },
    Response, AbortController, setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} },
  };
  const input = source.replace(/^import .*;\n/gm, '') + '\nthis.helpers = { classifyProvider, classifyMirror };';
  vm.runInNewContext(ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
  return { helpers: sandbox.helpers, filters, get writes() { return writes; }, get payload() { return updatePayload; }, run: (method = 'POST') => handler(new Request('https://fixture.invalid', { method })) };
}
for (const alias of ['Macrogoal Pro', 'Premium', 'premium', 'macrogoal_pro', 'pro']) {
  test('recognizes active alias ' + alias, async () => {
    const f = fixture({ provider: body({ [alias]: { expires_date: future } }) });
    assert.equal((await f.run()).status, 200);
    assert.equal(f.payload.is_premium, true);
  });
}
test('provider lifetime, malformed expiry and grace classification', () => {
  const { classifyProvider: classify } = fixture().helpers;
  const now = Date.now();
  const check = e => classify(body({ 'Macrogoal Pro': e }), 200, now);
  assert.equal(check({ expires_date: null }), 'active');
  assert.equal(check({}), 'unknown');
  assert.equal(check({ expires_date: 'invalid' }), 'unknown');
  assert.equal(check({ expires_date: past, grace_period_expires_date: future }), 'active');
  assert.equal(check({ expires_date: past, grace_period_expires_date: 'invalid' }), 'unknown');
  assert.equal(classify(body({ 'Macrogoal Pro': { expires_date: past, product_identifier: 'product' } }, { product: { grace_period_expires_date: future } }), 200, now), 'active');
  assert.equal(classify(body(), 200, now), 'inactive');
  assert.equal(classify(body(), 201, now), 'unknown');
});
for (const provider of [body(), body({ 'Macrogoal Pro': { expires_date: past } })]) {
  test('positive legacy mirror survives empty or expired provider', async () => {
    const f = fixture({ provider, mirror: { status: 'active', expiration_at: future } });
    assert.equal((await f.run()).status, 200);
    assert.equal(f.payload.is_premium, true);
  });
}
test('provider outage with future mirror retains paid state', async () => {
  const f = fixture({ networkError: true, mirror: { status: 'active', expiration_at: future } });
  assert.equal((await f.run()).status, 200);
  assert.equal(f.payload.is_premium, true);
});
test('expired provider and expired mirror resolve free', async () => {
  const f = fixture({ provider: body({ 'Macrogoal Pro': { expires_date: past } }), mirror: { status: 'active', expiration_at: past } });
  assert.equal((await f.run()).status, 200);
  assert.equal(f.payload.is_premium, false);
});
for (const mirror of [null, { status: 'active' }, { status: 'inactive' }, { status: 'active', expiration_at: null, current_period_end: past }, { status: 'active', current_period_end: past }]) {
  test('uncertain legacy mirror is unchanged: ' + JSON.stringify(mirror), async () => {
    const f = fixture({ mirror });
    assert.equal((await f.run()).status, 503);
    assert.equal(f.writes, 0);
  });
}
test('HTTP 201 never revokes even with expired mirror', async () => {
  const f = fixture({ status: 201, mirror: { status: 'active', expiration_at: past } });
  assert.equal((await f.run()).status, 503);
  assert.equal(f.writes, 0);
});
for (const failure of [{ casMissing: true }, { updateError: { code: 'fixture' } }]) {
  test('failed compare-and-set never reports success: ' + JSON.stringify(failure), async () => {
    const f = fixture({ ...failure, provider: body({ pro: { expires_date: future } }) });
    assert.equal((await f.run()).status, 503);
    assert.ok(f.filters.some(([key, value]) => key === 'updated_at' && value === '2026-01-01T00:00:00Z'));
  });
}
test('null profile timestamp uses null compare-and-set', async () => {
  const f = fixture({ profile: { updated_at: null, user_type: 'premium' }, provider: body({ pro: { expires_date: future } }) });
  assert.equal((await f.run()).status, 200);
  assert.ok(f.filters.some(([key, value]) => key === 'updated_at' && value === null));
});
test('authentication, preflight and profile errors never write', async () => {
  const unauth = fixture({ unauthorized: true });
  assert.equal((await unauth.run()).status, 401);
  assert.equal(unauth.writes, 0);
  const preflight = fixture();
  assert.equal((await preflight.run('OPTIONS')).status, 200);
  assert.equal(preflight.writes, 0);
  const failed = fixture({ profileError: { code: 'fixture' } });
  assert.equal((await failed.run()).status, 503);
  assert.equal(failed.writes, 0);
});
