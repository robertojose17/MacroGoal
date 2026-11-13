'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports,process,Date});
  return exports;
}
const enginePath = 'tests/release-review/fixtures/observed-engine-v14.ts';
const engine = load(enginePath), client = load('utils/dynamicTdeeObservation.ts');
const today = '2026-11-13', day = 86400000, end = Date.parse(today);
const civil = n => new Date(end + n * day).toISOString().slice(0, 10);
function data(slope = 0, calories = 2400) {
  return {today, weights:Array.from({length:29},(_,i)=>({date:civil(i-29),kg:80+slope*i})),
    intake:Array.from({length:28},(_,i)=>({date:civil(i-29),calories,mealTypes:3}))};
}
function envelope(estimate) {
  return {version:'dynamic-program-v1',observationOnly:true,observationVersion:'observation-v1',premium:true,enabled:true,reviewDay:0,today,nextReviewDate:'2026-11-15',reviewDue:false,proposal:null,reviewPeriod:null,reason:'observation_only',
    estimate:{...estimate,observationOnly:true,observationVersion:'observation-v1'}};
}
const read = estimate => client.parseObservationProgram(envelope(estimate),end+12*60*60*1000);
const ready = () => engine.estimateDynamicTdee(data());
test('fixture is the exact Progress v14 downloaded engine, not a replacement algorithm',()=>{
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,enginePath))).digest('hex'),'3f09d090f8ab426ae10e5b7b4d6c07567b9345334490efcf1ee5f50910b8d659');
});
test('stable, loss and gain outputs of actual engine satisfy client contract',()=>{
  for(const [slope,kcal] of [[0,2400],[-0.05,2800],[0.05,2000]]) {
    const raw=engine.estimateDynamicTdee(data(slope));const result=read(raw).estimate;
    assert.equal(result.status,'estimated');assert.equal(result.kcalPerDay,kcal);
    assert.equal(result.confidence,'low');assert.equal(result.coverage.days,28);
    assert.equal(result.coverage.loggedDays,28);assert.equal(result.coverage.weightDays,29);
    assert.equal(result.coverage.start,civil(-29));assert.equal(result.coverage.end,civil(-1));
    assert.ok(result.coverage.sensitivityKcal.low<kcal&&result.coverage.sensitivityKcal.high>kcal);
  }
});
test('explicit source uncertainty and sparse history do not fabricate expenditure',()=>{
  const cases=[{...data(),weights:[]},{...data(),weights:data().weights.slice(15)}, {...data(),intake:data().intake.slice(1)}, {...data(),weights:data().weights.slice(0,-4)},data(0,700),data(0,7000),data(-0.3),data(0,900)];
  for(const input of cases){const result=read(engine.estimateDynamicTdee(input)).estimate;assert.notEqual(result.status,'estimated');assert.equal(result.kcalPerDay,null);assert.equal(result.coverage,null);}
});
test('invalid or duplicate weight/intake values never become an estimate',()=>{
  for(const mutate of [x=>x.weights.push({...x.weights[0]}),x=>x.intake.push({...x.intake[0]}),x=>{x.weights[0].kg=NaN;},x=>{x.intake[2].calories=null;},x=>{x.intake[3].mealTypes=1;}]){
    const input=data();mutate(input);assert.equal(read(engine.estimateDynamicTdee(input)).estimate.kcalPerDay,null);
  }
});
test('closed-day parser rejects today, future, stale and invalid dates',()=>{
  for(const asOf of [today,civil(1),civil(-4),'2026-02-30',null]) assert.throws(()=>read({...ready(),asOf}),/invalid_observation/);
});
test('response must carry the deployed range, granularity, reason and low confidence',()=>{
  for(const patch of [{kcalPerDay:0},{kcalPerDay:999},{kcalPerDay:5001},{kcalPerDay:2401},{kcalPerDay:NaN},{confidence:null},{confidence:'high'},{reason:'clinically_validated'}]) assert.throws(()=>read({...ready(),...patch}),/invalid_observation/);
});
test('coverage must describe the exact closed interval with no imputed missing days',()=>{
  for(const patch of [{windowStart:null},{windowStart:civil(-40)},{windowDays:27},{loggedDays:27},{weightDays:9},{weightDays:30},{weightDays:10.5},{weightTrendKgPerWeek:Infinity}]) assert.throws(()=>read({...ready(),...patch}),/invalid_observation/);
});
test('sensitivity is finite, ordered and enclosing, never assumed to be confidence',()=>{
  for(const sensitivityKcal of [null,{low:null,high:3000},{low:-50,high:3000},{low:2500,high:3000},{low:2000,high:2300},{low:2400,high:2400},{low:2001,high:3000},{low:2000,high:Infinity}]) assert.throws(()=>read({...ready(),sensitivityKcal}),/invalid_observation/);
});
test('opt-in does not authorize recommendations, review or loss of premium scoping',()=>{
  for(const patch of [{proposal:{}},{reviewDue:true},{reviewPeriod:{}},{premium:false},{enabled:false},{observationOnly:false}]) assert.throws(()=>client.parseObservationProgram({...envelope(ready()),...patch},end),/invalid_observation/);
});
test('future production build explicitly selects observation, without a QA mode or auto-apply flag',()=>{
  const eas=JSON.parse(fs.readFileSync(path.join(root,'eas.json'),'utf8'));
  assert.equal(eas.build.production.env.EXPO_PUBLIC_TDEE_MODE,'observation-v1');
  assert.deepEqual(Object.keys(eas.build.production.env),['EXPO_PUBLIC_TDEE_MODE']);
  assert.equal(eas.build.production.distribution,'store');
  const before=process.env.EXPO_PUBLIC_TDEE_MODE;
  try {for(const [value,expected] of [['observation-v1',true],['private-qa',false],['true',false],['',false]]){process.env.EXPO_PUBLIC_TDEE_MODE=value;assert.equal(client.observationRolloutEnabled(),expected);}}
  finally{if(before===undefined)delete process.env.EXPO_PUBLIC_TDEE_MODE;else process.env.EXPO_PUBLIC_TDEE_MODE=before;}
});
test('existing cards disclose coverage and uncertainty without claiming clinical verification',()=>{
  const source=fs.readFileSync(path.join(root,'components/GoalWeightCard.tsx'),'utf8');
  for(const field of ['coverage.start','coverage.end','coverage.loggedDays','coverage.weightDays','coverage.sensitivityKcal.low','coverage.sensitivityKcal.high']) assert.ok(source.includes(field));
  assert.match(source,/Not a confidence interval or metabolic measurement/);
  assert.doesNotMatch(source,/Verified estimate unavailable/);
  for(const file of ['app/settings.tsx','app/settings.ios.tsx','app/settings.android.tsx']){
    const settings=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(settings,/Data review day/);assert.doesNotMatch(settings,/t\('adaptiveTdee\.(selectAdjustmentDay|adjustmentDay)'\)/);
  }
});

test('internally coherent stale payload cannot masquerade as a current observation',()=>{
  const old={...envelope(ready()),today:'2020-11-13',nextReviewDate:'2020-11-15',estimate:{...envelope(ready()).estimate,asOf:'2020-11-12',windowStart:'2020-10-15'}};
  assert.throws(()=>client.parseObservationProgram(old,end),/invalid_observation/);
  assert.throws(()=>client.parseObservationProgram(envelope(ready()),NaN),/invalid_observation/);
  for(const offset of [-1,0,1]) assert.equal(client.parseObservationProgram(envelope(ready()),end+offset*day).estimate.status,'estimated');
  for(const offset of [-2,2]) assert.throws(()=>client.parseObservationProgram(envelope(ready()),end+offset*day),/invalid_observation/);
});
test('observation requests bypass client caches without enabling a mutation',async()=>{
  let sent;
  await client.requestObservation({kind:'program',endpoint:'https://example.invalid',apiKey:'public',session:{user:{id:'actor'},access_token:'token'},expectedOwner:'actor',signal:new AbortController().signal,isCurrent:()=>true,enabled:true,
    fetcher:async(_url,init)=>{sent=init;return {ok:true,headers:{get:()=> 'observation-v1'},json:async()=>envelope(ready())};}});
  assert.equal(sent.cache,'no-store');assert.equal(sent.method,'GET');assert.equal(sent.body,undefined);
});
