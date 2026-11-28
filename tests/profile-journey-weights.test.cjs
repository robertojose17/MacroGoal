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
    let handler, loader;
    function scan(n) {
      if (ts.isVariableDeclaration(n) && n.name.getText(source)==='saveEditedField') handler=n.initializer.getText(source);
      if (ts.isVariableDeclaration(n) && n.name.getText(source)==='loadUserData') loader=n.initializer.arguments[0].getText(source);
      ts.forEachChild(n,scan);
    }
    scan(source);
    const requests=[], alerts=[];
    const snapshot={profile:{id:'test',preferred_units:'metric',updated_at:'profile-revision',current_weight:80,goal_weight:72,journey_start_date:'2026-06-01',journey_start_weight:96.54321},goal:{user_id:'test',id:'active',updated_at:'goal-revision',target_weight:70}};
    const state={profile:snapshot.profile,goal:snapshot.goal,loading:false};
    const targetReadOwner={current:null};
    const context={...helper,editValue,editingField,saving:false,modalSnapshot:{current:snapshot},modalCurrent:{current:()=>true},editor:{pending:false,busy:false,capture:()=>()=>true},
      screenActive:{current:true},loadEpoch:{current:0},targetReadOwner,AcceptedGoalReadSuperseded:class extends Error{},
      setUser: u=>state.profile=typeof u==='function'?u(state.profile):u, setGoal:g=>state.goal=typeof g==='function'?g(state.goal):g,
      setLoading: active=>state.loading=active,setRefreshing(){},setIsAdmin(){},setAutoShare(){},setCoachActions(){},setLastAdjustMacrosAction(){},
      captureAcceptedEditor:()=>()=>true,
      refreshAcceptedEditor:async options=>{requests.push(['refresh',JSON.stringify(options)]); return {profile:{...snapshot.profile,goal_weight:68},goal:{...snapshot.goal,target_weight:68}};},
      setSaving(){},t:x=>x,Alert:{alert:(...xs)=>alerts.push(xs)},closeEditModal:()=>requests.push(['close']),setShowGoalWeightPrompt(){},
      saveProfilePatch:async patch=>requests.push(['profile',JSON.stringify(patch)]),emitGoalChanged:id=>requests.push(['event',id]),
      supabase:{auth:{getUser:async()=>({data:{user:{id:'test'}}})},rpc:async(name,args)=>{requests.push([name,JSON.stringify(args)]);return {data:true};},
        from:()=>({select:()=>({eq:()=>({order:()=>({limit:()=>new Promise(()=>{})})})})})},
      ...override};
    const box=vm.createContext(context);
    const evaluate=fn=>vm.runInContext(ts.transpile(`(${fn})`,{target:ts.ScriptTarget.ES2022}),box);
    context.loadUserData=evaluate(loader);
    return {requests,alerts,snapshot,state,targetReadOwner,context,run:evaluate(handler)};
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
    assert.deepEqual(fresh.requests.slice(1),[['event','test'],['close'],['refresh','{"preserveFor":"test"}']]);
    assert.equal(fresh.state.loading,false);
    assert.equal(fresh.state.goal.target_weight,68);
    await new Promise(setImmediate);
    assert.equal(fresh.targetReadOwner.current,null);
    const same=fixture('goalWeight','70'); same.snapshot.profile.goal_weight=70; await same.run();
    assert.deepEqual(same.requests,[['close']]);
  });
  test(f + ' acknowledged target survives failed read and retries without writing',async()=>{
    const fresh=fixture('goalWeight','68');
    let reads=0;
    fresh.context.refreshAcceptedEditor=async options=>{
      assert.equal(options.preserveFor,'test');
      if (++reads===1) throw new Error('temporary transport failure');
      return {profile:{...fresh.snapshot.profile,goal_weight:68,updated_at:'new-profile'},goal:{...fresh.snapshot.goal,target_weight:68,updated_at:'new-goal'}};
    };
    await fresh.run();
    await new Promise(setImmediate);
    assert.equal(fresh.state.profile.goal_weight,68);
    assert.equal(fresh.state.goal.target_weight,68);
    assert.equal(fresh.state.loading,false);
    assert.equal(fresh.alerts[0][0],'profile.goalWeightSaved');
    assert.equal(fresh.targetReadOwner.current,'test');
    fresh.alerts[0][2][0].onPress();
    await new Promise(setImmediate);
    assert.equal(fresh.requests.filter(([name])=>name==='save_profile_goal_weight_v1').length,1);
    assert.equal(fresh.state.goal.updated_at,'new-goal');
    assert.equal(fresh.targetReadOwner.current,null);
  });
  test(f + ' late refresh does not publish state or a retry for a changed account',async()=>{
    const fresh=fixture('goalWeight','68');
    let active=true, rejectRead;
    fresh.context.editor.capture=()=>()=>active;
    fresh.context.captureAcceptedEditor=()=>()=>active;
    fresh.context.refreshAcceptedEditor=()=>new Promise((_,reject)=>{rejectRead=reject;});
    await fresh.run();
    active=false;
    fresh.context.loadEpoch.current++;
    fresh.context.targetReadOwner.current=null;
    fresh.state.profile={id:'another'}; fresh.state.goal={user_id:'another',target_weight:55};
    rejectRead(new Error('late failure'));
    await new Promise(setImmediate);
    assert.equal(fresh.state.profile.id,'another');
    assert.equal(fresh.state.goal.target_weight,55);
    assert.equal(fresh.alerts.length,0);
  });
}

test('real accepted-goal hook preserves same-owner readback on transport failure and clears a positively changed owner', async () => {
  const states=[], focus=[], effects=[];
  let account='test', readError=false, authListener;
  const hookModule=load(fs.readFileSync('hooks/useAcceptedGoalEditor.ts','utf8'),{
    react:{useState:value=>{const i=states.push(value)-1; return [value,v=>{states[i]=v;}];},
      useRef:current=>({current}),useEffect:callback=>effects.push(callback),useCallback:callback=>callback},
    'expo-router':{useFocusEffect:callback=>focus.push(callback)},
    'react-native':{Platform:{OS:'web'}},
    '@/utils/acceptedGoalJournalCapability':{acceptedGoalJournalAvailable:()=>false},
    '@/utils/acceptedGoalSession':{acceptedGoalSessionFor:()=>({listeners:new Set(),save:{pendingScope:()=>null}})},
    '@/lib/supabase/client':{supabase:{
      auth:{getUser:async()=>({data:{user:{id:account}}}),onAuthStateChange:listener=>{
        authListener=listener;return {data:{subscription:{unsubscribe(){}}}};
      }},
      from:table=>{let id;const query={select:()=>query,eq:(key,value)=>{if(key!=='is_active') id=value;return query;},
        maybeSingle:async()=>({error:readError?new Error('network'):null,data:table==='users'?{id}:{user_id:id,is_active:true}})};return query;}
    }}
  });
  const editor=hookModule.useAcceptedGoalEditor(false);
  for(const c of focus) c();
  for(const c of effects) c();
  const initial=await editor.refresh();
  assert.equal(states[0],initial);
  readError=true;
  await assert.rejects(editor.refresh({preserveFor:'test'}),/must be verified/);
  assert.equal(states[0],initial);
  assert.equal(states[1],false);
  await assert.rejects(editor.refresh(),/must be verified/);
  assert.equal(states[0],null);
  readError=false;
  await editor.refresh();
  const wasCurrent=editor.capture();
  account='other'; // Exercise the server-verified account check before the listener fires.
  await assert.rejects(editor.refresh({preserveFor:'test'}),/superseded/);
  assert.equal(wasCurrent(),false);
  assert.equal(states[0],null);
  assert.equal(states[1],false);
  await editor.refresh();
  authListener('SIGNED_OUT',null);
  assert.equal(states[0],null);
});
