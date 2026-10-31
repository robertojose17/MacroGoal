const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../utils/communityRelativeTime.ts'), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
function load(intl) {
  const context = { exports: {}, Intl: intl };
  vm.runInNewContext(compiled, context);
  return context.exports.formatCommunityRelativeTime;
}
const now = Date.parse('2026-10-30T22:08:30Z');
const ago = seconds => new Date(now - seconds * 1000).toISOString();
test('compact timestamps have exact second, minute, hour and day boundaries', () => {
  for (const intl of [{}, undefined, Intl, { RelativeTimeFormat: class { constructor() { throw new TypeError('unsupported'); } } }]) {
    const format = load(intl);
    for (const locale of ['en-US', 'es-ES']) {
      for (const [seconds, expected] of [[0,'0S'],[59,'59S'],[60,'1M'],[3599,'59M'],[3600,'1H'],[14400,'4H'],[86399,'23H'],[86400,'1D'],[172800,'2D']]) {
        assert.equal(format(ago(seconds), locale, now), expected);
      }
    }
  }
});
test('invalid timestamps and device clock skew never crash rendering', () => {
  const format = load(undefined);
  assert.equal(format('invalid','es-ES',now),'');
  assert.equal(format(ago(0),'en-US',NaN),'');
  assert.equal(format(ago(0),'en-US',Infinity),'');
  assert.equal(format(ago(-60),'en-US',now),'0S');
  assert.equal(format('2026-10-30T18:08:30Z','en-US',now),'4H');
  assert.equal(format('2026-10-30T14:08:30-04:00','es-ES',now),'4H');
});
test('community posts, comments and shared profile cards use the same safe formatter', () => {
  const screen = fs.readFileSync(path.join(__dirname,'../app/(tabs)/check-ins.tsx'),'utf8');
  const card = fs.readFileSync(path.join(__dirname,'../components/social/FeedPostCard.tsx'),'utf8');
  for (const consumer of [screen, card]) {
    assert.match(consumer,/formatCommunityRelativeTime\(dateStr, getAppLocale\(\)\)/);
    assert.doesNotMatch(consumer,/new Intl.RelativeTimeFormat/);
  }
  assert.match(screen,/getRelativeTime\(post.created_at\)/);
  assert.match(screen,/getRelativeTime\(item.created_at\)/);
  assert.doesNotMatch(source,/new Intl.RelativeTimeFormat/);
});
