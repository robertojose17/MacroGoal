const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../utils/communityLikeState.ts'), 'utf8');
const screen = fs.readFileSync(path.join(__dirname, '../app/(tabs)/check-ins.tsx'), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
const { createCommunityLikeCoordinator, requireCommunityLikedIds } = context.exports;

test('stale reads cannot overwrite a successful like in either section', () => {
  for (const section of ['feed', 'club']) {
    const guard = createCommunityLikeCoordinator();
    guard.setScope('actor-a');
    const stale = guard.beginRead(section);
    const mutation = guard.beginLike(section, 'post');
    assert.equal(stale.current(), false);
    assert.equal(guard.beginRead(section), null);
    mutation.finish();
    assert.equal(stale.current(), false);
    assert.equal(mutation.current(), true);
    assert.equal(guard.beginRead(section).current(), true);
  }
});
test('repeat taps are suppressed, sections and other pending posts stay independent', () => {
  const guard = createCommunityLikeCoordinator();
  const feedRead = guard.beginRead('feed');
  const first = guard.beginLike('club', 'one');
  assert.equal(guard.beginLike('club', 'one'), null);
  assert.equal(feedRead.current(), true);
  const second = guard.beginLike('club', 'two');
  first.finish();
  assert.equal(guard.beginRead('club'), null);
  second.finish();
  const next = guard.beginLike('club', 'one');
  assert.equal(first.current(), false);
  assert.equal(next.current(), true);
  first.finish();
  assert.equal(guard.beginLike('club', 'one'), null);
});
test('actor or eligibility scope changes invalidate reads and mutations', () => {
  const guard = createCommunityLikeCoordinator();
  guard.setScope('actor-a:premium');
  const read = guard.beginRead('feed');
  const old = guard.beginLike('club', 'post');
  guard.setScope('actor-b:premium');
  assert.equal(read.current(), false);
  assert.equal(old.current(), false);
  const next = guard.beginLike('club', 'post');
  old.finish();
  assert.equal(guard.beginLike('club', 'post'), null);
  guard.setScope('actor-b:free');
  assert.equal(next.current(), false);
  guard.invalidate();
  assert.equal(guard.beginRead('feed').current(), true);
});
test('failed liked-ID reads never become an empty unliked set', () => {
  assert.throws(() => requireCommunityLikedIds({ data: null, error: null }));
  assert.throws(() => requireCommunityLikedIds({ data: [], error: new Error('denied') }));
  assert.equal(requireCommunityLikedIds({ data: [], error: null }).size, 0);
  assert.equal(requireCommunityLikedIds({ data: [{post_id:'post'}], error: null }).has('post'), true);
});
test('a newer read supersedes an older read', () => {
  const guard = createCommunityLikeCoordinator();
  const old = guard.beginRead('club');
  const latest = guard.beginRead('club');
  assert.equal(old.current(), false);
  assert.equal(latest.current(), true);
});
test('screen wiring guards both readers and uses captured rollback and actor', () => {
  for (const section of ['feed', 'club']) {
    assert.ok(screen.includes("likeCoordinator.beginRead('" + section + "')"));
  }
  assert.equal((screen.match(/!read.current\(\)/g) || []).length, 2);
  assert.equal((screen.match(/set(?:Feed|Club)Posts\(prev => read.current\(\)/g) || []).length, 4);
  assert.ok(screen.includes('update(before.liked_by_me, before.likes_count)'));
  assert.ok(screen.includes('toggleLike(postId, before.liked_by_me, currentUserId)'));
  assert.ok(screen.includes('before.section !== section'));
  assert.ok(screen.includes('subscription.unsubscribe(); likeCoordinator.invalidate()'));
});

function makeHandler(section, toggleLike, guard = createCommunityLikeCoordinator()) {
  const state = { feed: [{ id:'post', section:'feed', liked_by_me:false, likes_count:3 }],
    club: [{ id:'post', section:'club', liked_by_me:false, likes_count:3 }] };
  const bindings = { activeTab: section, currentUserId: 'actor-a', likeCoordinator: guard,
    likePostsRef: { current: state }, toggleLike, useCallback: fn => fn, console: { warn() {} },
    setFeedPosts: fn => { state.feed = fn(state.feed); },
    setClubPosts: fn => { state.club = fn(state.club); } };
  const start = screen.indexOf('  const handleLike = useCallback(async (postId: string, _liked: boolean)');
  const end = screen.indexOf('  // ── Save toggle', start);
  assert.ok(start >= 0 && end > start);
  const compiled = ts.transpile(screen.slice(start, end) + '\nexports.handleLike = handleLike;',
    { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const runtime = { ...bindings, exports: {} };
  vm.runInNewContext(compiled, runtime);
  return { state, guard, handle: runtime.exports.handleLike, switchTab: next => { runtime.activeTab = next; } };
}

test('actual handler restores exact snapshot on failure and ignores repeated taps', async () => {
  let reject;
  let calls = 0;
  const h = makeHandler('club', () => { calls++; return new Promise((_resolve, fail) => { reject = fail; }); });
  const pending = h.handle('post', false);
  assert.equal(h.state.club[0].liked_by_me, true);
  assert.equal(h.state.club[0].likes_count, 4);
  await h.handle('post', true);
  assert.equal(calls, 1);
  reject(new Error('server failure'));
  await pending;
  assert.equal(h.state.club[0].liked_by_me, false);
  assert.equal(h.state.club[0].likes_count, 3);
  assert.equal(h.state.feed[0].likes_count, 3);
});
test('actual handler keeps server counts and section, ignores obsolete actor response', async () => {
  for (const section of ['feed','club']) {
    let resolve;
    let actor;
    const h = makeHandler(section, (_id, _liked, expectedActor) => { actor = expectedActor; return new Promise(done => { resolve = done; }); });
    const stale = h.guard.beginRead(section);
    const pending = h.handle('post', false);
    h.switchTab(section === 'feed' ? 'club' : 'feed');
    resolve({ liked:true, likes_count:7 });
    await pending;
    assert.equal(actor, 'actor-a');
    assert.equal(h.state[section][0].likes_count, 7);
    assert.equal(h.state[section][0].liked_by_me, true);
    assert.equal(stale.current(), false);
    const other = section === 'feed' ? 'club' : 'feed';
    assert.equal(h.state[other][0].likes_count, 3);
  }
  let resolve;
  const h = makeHandler('club', () => new Promise(done => { resolve = done; }));
  const pending = h.handle('post', false);
  h.guard.setScope('actor-b');
  h.state.club = [{ id:'post', section:'club', liked_by_me:false, likes_count:2 }];
  resolve({ liked:true, likes_count:9 });
  await pending;
  assert.equal(h.state.club[0].likes_count, 2);
  assert.equal(h.state.club[0].liked_by_me, false);
});

test('protected state commits remain eligible after request cleanup', () => {
  assert.equal((screen.match(/read.current\(\) && ticket.alive\(\)/g) || []).length, 2);
  assert.equal(screen.includes('read.current() && ticket.current()'), false);
});

test('compact time has localized expanded accessibility labels without Intl', () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/communityRelativeTime.ts'), 'utf8');
  const runtime = { exports: {}, Intl: undefined };
  vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), runtime);
  const format = runtime.exports.communityRelativeTimeAccessibilityLabel;
  const now = Date.parse('2026-10-30T22:08:30Z');
  const date = seconds => new Date(now - seconds * 1000).toISOString();
  for (const [seconds, en, es] of [[0,'0 seconds ago','hace 0 segundos'],[1,'1 second ago','hace 1 segundo'],[60,'1 minute ago','hace 1 minuto'],[120,'2 minutes ago','hace 2 minutos'],[3600,'1 hour ago','hace 1 hora'],[14400,'4 hours ago','hace 4 horas'],[86400,'1 day ago','hace 1 día'],[172800,'2 days ago','hace 2 días']]) {
    assert.equal(format(date(seconds),'en-US',now),en);
    assert.equal(format(date(seconds),'es-ES',now),es);
  }
  assert.equal(format('invalid','en-US',now),'');
});

function premiumLifecycle() {
  const guard = createCommunityLikeCoordinator();
  const previous = { current: false };
  const state = { feed: [], club: [], feedLoading: false, clubLoading: false };
  const requests = [];
  let actor = '';
  let premium = false;
  function read(section) {
    const ticket = guard.beginRead(section);
    if (!ticket) return Promise.resolve();
    const requestedActor = actor;
    return new Promise(resolve => {
      requests.push({ section, actor: requestedActor, complete() {
        if (ticket.current()) state[section] = [requestedActor + ':' + section];
        resolve();
      } });
    });
  }
  const start = screen.indexOf('  // Replace reads invalidated when asynchronous Premium eligibility resolves.');
  const end = screen.indexOf('  // ── Founder check', start);
  assert.ok(start >= 0 && end > start);
  const effect = screen.slice(start, end);
  function render(nextActor, nextPremium) {
    actor = nextActor; premium = nextPremium;
    guard.setScope(JSON.stringify([actor, 'view', premium]));
    const bindings = { isPremium: premium, currentUserId: actor, useRef: () => previous,
      useEffect: fn => fn(),
      fetchFeedPosts: () => read('feed'), fetchClubPosts: () => read('club'),
      setFeedLoading: value => { state.feedLoading = value; },
      setClubLoading: value => { state.clubLoading = value; },
      setClubPosts: value => { state.club = value; } };
    vm.runInNewContext(effect, bindings);
  }
  return { state, requests, read, render };
}
test('delayed Premium resolution replaces initial invalidated feed and Club reads', async () => {
  const h = premiumLifecycle();
  h.render('actor-a', false);
  const initialFeed = h.read('feed');
  const initialClub = h.read('club');
  h.render('actor-a', true);
  assert.equal(h.requests.length, 4);
  h.requests[0].complete(); h.requests[1].complete();
  await Promise.all([initialFeed, initialClub]);
  assert.equal(h.state.feed.length, 0);
  assert.equal(h.state.club.length, 0);
  h.requests[2].complete(); h.requests[3].complete();
  await Promise.resolve();
  assert.equal(h.state.feed[0], 'actor-a:feed');
  assert.equal(h.state.club[0], 'actor-a:club');
  assert.equal(h.state.feedLoading, false);
  assert.equal(h.state.clubLoading, false);
});
test('Premium revocation clears Club and only reloads feed; old actor reads cannot return', async () => {
  const h = premiumLifecycle();
  h.render('actor-a', true);
  h.state.club = ['old-content'];
  h.render('actor-a', false);
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].section, 'feed');
  assert.equal(h.state.club.length, 0);
  h.requests[0].complete(); h.requests[1].complete();
  await Promise.resolve();
  assert.equal(h.state.feed.length, 0);
  assert.equal(h.state.club.length, 0);
  h.render('actor-b', false);
  // The existing currentUserId load starts reads for the new actor.
  const newActor = h.read('feed');
  h.requests[2].complete();
  assert.equal(h.state.feed.length, 0);
  h.requests[3].complete(); await newActor;
  assert.equal(h.state.feed[0], 'actor-b:feed');
  assert.equal(h.state.club.length, 0);
});
test('Premium resolving before identity waits for existing initial user load', () => {
  const h = premiumLifecycle();
  h.render('', true);
  assert.equal(h.requests.length, 0);
  h.render('actor-a', true);
  assert.equal(h.requests.length, 0);
  h.read('feed'); h.read('club');
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests.every(request => request.actor === 'actor-a'), true);
});
