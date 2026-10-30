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
test('posts and comments render time without Hermes RelativeTimeFormat, in both languages', () => {
  for (const intl of [{}, undefined]) {
    const format = load(intl);
    for (const [seconds, en, es] of [[0,'now','ahora'],[59,'now','ahora'],[60,'1 min. ago','hace 1 min'],[3599,'59 min. ago','hace 59 min'],[3600,'1 hr. ago','hace 1 h'],[86399,'23 hr. ago','hace 23 h'],[86400,'yesterday','ayer'],[172800,'2 days ago','hace 2 días']]) {
      assert.equal(format(ago(seconds),'en-US',now),en);
      assert.equal(format(ago(seconds),'es-ES',now),es);
    }
  }
});
test('partial Intl implementation cannot crash the card', () => {
  const format = load({ RelativeTimeFormat: class { constructor() { throw new TypeError('unsupported'); } } });
  assert.equal(format(ago(60),'es-ES',now),'hace 1 min');
});
test('available formatter preserves native localized output', () => {
  const format = load(Intl);
  for (const locale of ['en-US','es-ES']) {
    assert.equal(format(ago(3600),locale,now), new Intl.RelativeTimeFormat(locale,{numeric:'auto',style:'short'}).format(-1,'hour'));
  }
});
test('invalid timestamps and device clock skew never crash rendering', () => {
  for (const intl of [{}, Intl]) {
    const format = load(intl);
    assert.equal(format('invalid','es-ES',now),'');
    assert.equal(format(ago(0),'en-US',NaN),'');
    assert.equal(format(ago(-60),'en-US',now),'now');
  }
});
test('post and comment rendering both use the safe formatter', () => {
  const screen=fs.readFileSync(path.join(__dirname,'../app/(tabs)/check-ins.tsx'),'utf8');
  assert.match(screen,/formatCommunityRelativeTime\(dateStr, getAppLocale\(\)\)/);
  assert.match(screen,/getRelativeTime\(post.created_at\)/);
  assert.match(screen,/getRelativeTime\(item.created_at\)/);
  assert.doesNotMatch(screen,/new Intl.RelativeTimeFormat/);
});
