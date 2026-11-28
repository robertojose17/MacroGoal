const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

const calculations = fs.readFileSync('utils/calculations.ts', 'utf8');
function load(source, deps = {}) {
  const exports = {};
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 });
  vm.runInNewContext(js, { exports, require: name => deps[name] || {} });
  return exports;
}
const helper = load(fs.readFileSync('utils/profileJourneyWeights.ts', 'utf8'), { './calculations': load(calculations) });
const { resolveGoalWeight, journeyWeightInput, parseJourneyWeight } = helper;

test('accepted outcome is authoritative; only use a valid legacy target when necessary', () => {
  assert.equal(resolveGoalWeight(77, 80), 77);
  assert.equal(resolveGoalWeight(null, 80), 80);
  assert.equal(resolveGoalWeight(NaN, 80), 80);
  assert.equal(resolveGoalWeight(null, null), null);
});

test('unset start weight stays unset; unit changes and unchanged inputs preserve exact kg', () => {
  assert.equal(journeyWeightInput(null, 'imperial'), '');
  for (const kg of [20, 70.034567, 80, 75, 500]) {
    for (const u of ['imperial','metric']) {
      assert.equal(parseJourneyWeight(journeyWeightInput(kg, u), u, kg), kg);
    }
  }
  assert.equal(parseJourneyWeight('82,5', 'metric', 80), 82.5);
  assert.equal(parseJourneyWeight('180', 'imperial', 80), 180 * 0.453592);
  for (const v of ['', 'NaN', '-80', '0', '1e3', 'Infinity', '30..2']) assert.equal(parseJourneyWeight(v, 'metric', null), null);
});

for (const f of ['app/settings.tsx','app/settings.ios.tsx','app/settings.android.tsx']) test(f + ' uses starting and target weight without changing current or initial date', () => {
  const s = fs.readFileSync(f, 'utf8');
  const weightRegion = s.slice(s.indexOf("case 'weight':"), s.indexOf("case 'age':"));
  const startWeightSave = s.slice(s.indexOf("} else if (editingField === 'weight')"), s.indexOf("} else if (editingField === 'age')"));
  const targetWeightSave = s.slice(s.indexOf("} else if (editingField === 'goalWeight')"), s.indexOf("} else if (editingField === 'lossRate')"));
  assert.match(weightRegion, /journey_start_weight/);
  assert.doesNotMatch(weightRegion, /current_weight/);
  assert.match(startWeightSave, /patch\.journey_start_weight = initial/);
  assert.doesNotMatch(startWeightSave, /patch\.(journey_start_date|current_weight)|check_ins|editor\.run/);
  assert.match(targetWeightSave, /save_profile_goal_weight_v1/);
  assert.doesNotMatch(targetWeightSave, /check_ins|editor\.run/);
  assert.match(s, /label=\{t\('profile\.startingWeight'\)\}/);
});

test('Edit Goals validates and safely mirrors the same existing target without altering maintain targets', () => {
  const s = fs.readFileSync('app/edit-goals.tsx', 'utf8');
  assert.match(s, /const target = resolveGoalWeight\(snapshot\.goal\.target_weight, snapshot\.profile\.goal_weight\)/);
  assert.match(s, /goalType !== 'maintain' && target !== null .*\{ target_weight: target \}/);
});

for (const f of ['app/settings.tsx','app/settings.ios.tsx','app/settings.android.tsx']) {
  function fixture(editingField, editValue, override = {}) {
    const source = ts.createSourceFile(f, fs.readFileSync(f,'utf8'), ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let handler;
    function scan(n) {
      if (ts.isVariableDeclaration(n) && n.name.getText(source)==='saveEditedField') handler=n.initializer.getText(source);
      ts.forEachChild(n,scan);
    }
    scan(source);
    const requests=[], alerts=[];
    const snapshot={profile:{id:'test',preferred_units:'metric',updated_at:'profile-revision',current_weight:80,goal_weight:72,journey_start_date:'2026-06-01',journey_start_weight:96.54321},goal:{id:'active',updated_at:'goal-revision',target_weight:70}};
    const context={...helper,editValue,editingField,saving:false,modalSnapshot:{current:snapshot},modalCurrent:{current:()=>true},editor:{pending:false,busy:false},
      setSaving(){},t:x=>x,Alert:{alert:(...xs)=>alerts.push(xs)},closeEditModal:()=>requests.push(['close']),setShowGoalWeightPrompt(){},
      saveProfilePatch:async patch=>requests.push(['profile',JSON.stringify(patch)]),loadUserData:async()=>requests.push(['refresh']),emitGoalChanged:id=>requests.push(['event',id]),
      supabase:{auth:{getUser:async()=>({data:{user:{id:'test'}}})},rpc:async(name,args)=>{requests.push([name,JSON.stringify(args)]);return {data:true};}},
      ...override};
    return {requests,alerts,snapshot,run:vm.runInNewContext(ts.transpile(`(${handler})`,{target:ts.ScriptTarget.ES2022}),context)};
  }
  test(f + ' real edit handler writes only baseline and skips an unchanged edit',async()=>{
    const fresh=fixture('weight','95,25'); await fresh.run();
    assert.deepEqual(fresh.requests,[['profile','{"journey_start_weight":95.25}'],['close']]);
    const unchanged=fixture('weight','96.5432'); await unchanged.run();
    assert.deepEqual(unchanged.requests,[['close']]);
    const missingDate=fixture('weight','95'); missingDate.snapshot.profile.journey_start_date=null; await missingDate.run();
    assert.equal(missingDate.requests.length,0);
    assert.equal(missingDate.alerts[0][1],'profile.missingJourneyDate');
  });
  test(f + ' real target handler routes only to the two-field transaction',async()=>{
    const fresh=fixture('goalWeight','68'); await fresh.run();
    assert.equal(fresh.requests[0][0],'save_profile_goal_weight_v1');
    assert.deepEqual(JSON.parse(fresh.requests[0][1]),{p_expected_user_id:'test',p_expected_profile_updated_at:'profile-revision',p_expected_goal_id:'active',p_expected_goal_updated_at:'goal-revision',p_target_weight:68});
    assert.deepEqual(fresh.requests.slice(1),[['refresh'],['event','test'],['close']]);
    const same=fixture('goalWeight','70'); same.snapshot.profile.goal_weight=70; await same.run();
    assert.deepEqual(same.requests,[['close']]);
  });
}
