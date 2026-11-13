const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports, require:n => { if (n in imports) return imports[n]; throw Error('Unexpected import ' + n); }, process, AbortController, fetch, Date, console, setTimeout, clearTimeout});
  return exports;
}
const api = load('utils/dynamicTdeeObservation.ts');
const parseProgramWithClock = api.parseObservationProgram;
api.parseObservationProgram = value => parseProgramWithClock(value, Date.parse('2026-11-12T12:00:00Z'));
const progress = load('hooks/useProgressIntelligence.ts', {'./useObservationResource':{},'@/utils/dynamicTdeeObservation':api,'@/utils/goalChangeEvents':{}});
const program = () => ({version:'dynamic-program-v1', observationOnly:true,observationVersion:'observation-v1',premium:true,enabled:true,reviewDay:0,today:'2026-11-12',nextReviewDate:'2026-11-15',reviewDue:false,proposal:null,reviewPeriod:null,reason:'observation_only',estimate:null});
const estimate = () => ({version:'observed-v1',observationOnly:true,observationVersion:'observation-v1',status:'estimated',reason:'ready',kcalPerDay:2100,asOf:'2026-11-11',windowStart:'2026-10-14',windowDays:28,loggedDays:28,weightDays:29,sensitivityKcal:{low:1650,high:2550},weightTrendKgPerWeek:0,confidence:'low',loggingCompleteness:'unverified'});
const state = () => ({observationOnly:true,observationVersion:'observed-progress-v1',interpretationAvailable:false,proposal:null,safety:{enabled:false,eligibility:'unverified'},tdee:{value:null,source:'none',confidence:null},projection:{projectedGoalDate:null,projectedGoalDateRange:null,projectionConfidence:null,projectionBasis:'none'},currentWeightLbs:180,trendWeightLbs:null,weightPace:{lbsPerWeek:0,confidence:null},progressStatus:'INSUFFICIENT_DATA',loggingReliability:'insufficient',adherence:{score:null,calorieAdherenceFraction:null,proteinAdherenceFraction:null,coverageFraction:0,adherenceDaysEvaluated:0},journeyProgress:{startWeightLbs:180,goalWeightLbs:170,currentWeightLbs:180,progressFraction:0},dataQualityFlags:[],loggedDaysLast7:0,loggedDaysLast14:0});
const input = () => ({kind:'program',endpoint:'https://example.invalid/functions/v1/progress-intelligence',apiKey:'public',session:{user:{id:'owner'},access_token:'token'},expectedOwner:'owner',signal:new AbortController().signal,isCurrent:()=>true,enabled:true});
const reply = (body, marker='observation-v1') => new Response(JSON.stringify(body),{headers:{'X-Macrogoal-Observation':marker}});
test('rollout OFF performs no network request', async () => {let calls=0; await assert.rejects(api.requestObservation({...input(),enabled:false,fetcher:()=>{calls++;}}),/observation_unavailable/);assert.equal(calls,0);});
test('program read and settings use exact observed protocol, never review', async () => {
  for(const settings of [undefined,{enabled:false,reviewDay:6}]) {
    let call; await api.requestObservation({...input(),settings,fetcher:async (...args)=>{call=args;return reply(program());}});
    assert.match(call[0],/\?mode=observed-program-v1$/); assert.equal(call[1].method,settings?'POST':'GET');
    assert.equal(call[1].headers.Authorization,'Bearer token');
    if(settings) assert.deepEqual(JSON.parse(call[1].body),{action:'dynamic_settings',enabled:false,reviewDay:6}); else assert.equal(call[1].body,undefined);
  }
});
test('progress binds actor in request and requires its marker',async()=>{let call;await api.requestObservation({...input(),kind:'progress',fetcher:async(...args)=>{call=args;return reply({...state(),userId:'owner'},'observed-progress-v1');}}); assert.deepEqual(JSON.parse(call[1].body),{userId:'owner'});assert.equal(call[1].method,'POST');});
test('wrong observation marker never falls back to legacy',async()=>{let calls=0;await assert.rejects(api.requestObservation({...input(),fetcher:async()=>{calls++;return reply(program(),'legacy');}}),/invalid_observation/);assert.equal(calls,1);});
test('actor mismatch before fetch blocks request',async()=>{let calls=0;await assert.rejects(api.requestObservation({...input(),expectedOwner:'other',fetcher:async()=>{calls++;}}),/account_changed/);assert.equal(calls,0);});
test('late response after actor revision is discarded',async()=>{let current=true;await assert.rejects(api.requestObservation({...input(),isCurrent:()=>current,fetcher:async()=>{current=false;return reply(program());}}),/account_changed/);});
test('abort and wrong owner payload are rejected',async()=>{const c=new AbortController();c.abort();await assert.rejects(api.requestObservation({...input(),signal:c.signal}),/account_changed/);await assert.rejects(api.requestObservation({...input(),fetcher:async()=>reply({userId:'other'})}),/account_changed/);});
test('late JSON after invalidation is discarded',async()=>{let current=true;await assert.rejects(api.requestObservation({...input(),isCurrent:()=>current,fetcher:async()=>({ok:true,headers:new Headers({'X-Macrogoal-Observation':'observation-v1'}),json:async()=>{current=false;return program();}})}),/account_changed/);});
test('unknown calories remain null; zero not a fabricated estimate',()=>{assert.equal(api.parseObservationProgram(program()).estimate,null);assert.throws(()=>api.parseObservationProgram({...program(),estimate:{...estimate(),kcalPerDay:0}}));});
test('estimate is fresh, premium, enabled, observational and low confidence only',()=>{assert.equal(api.parseObservationProgram({...program(),estimate:estimate()}).estimate.kcalPerDay,2100);for(const patch of [{asOf:'2026-11-08'},{asOf:'2026-11-13'},{observationOnly:false},{loggingCompleteness:'verified'},{confidence:'high'},{status:'paused'}])assert.throws(()=>api.parseObservationProgram({...program(),estimate:{...estimate(),...patch}}));for(const patch of [{premium:false},{enabled:false},{proposal:{}},{reviewDue:true}])assert.throws(()=>api.parseObservationProgram({...program(),estimate:estimate(),...patch}));});
test('observed progress preserves legitimate zero and unavailable values',()=>{const parsed=progress.parseObservedProgress(state());assert.equal(parsed.weightPace.lbsPerWeek,0);assert.equal(parsed.journeyProgress.progressFraction,0);assert.equal(parsed.trendWeightLbs,null);assert.equal(parsed.tdee.value,null);});
test('progress rejects projection, recommendation, invented/invalid weights',()=>{for(const patch of [{interpretationAvailable:true},{proposal:{}},{currentWeightLbs:0},{currentWeightLbs:-1},{progressStatus:'ON_TRACK'},{tdee:{value:2000,source:'formula',confidence:'high'}}])assert.throws(()=>progress.parseObservedProgress({...state(),...patch}));});
test('native cards only consume observation and do not reintroduce legacy predictions',()=>{for(const file of ['components/ProgressCard.tsx','components/GoalWeightCard.tsx']){const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');assert.match(src,/useProgressIntelligence\(userId\)/);assert.doesNotMatch(src,/supabase|2000|3500|ahead|behind|daily_calories/);}});
function harness(fetcher) {
  const states=[], refs=[], effects=[];let stateIndex=0,refIndex=0,authListener,goalListener,focus,session={user:{id:'owner'},access_token:'token'};
  const React={useState(initial){const i=stateIndex++;states[i]=initial;return [initial,v=>{states[i]=v;}];},useRef(initial){const ref={current:initial};refs[refIndex++]=ref;return ref;},useCallback(fn){return fn;},useEffect(fn){effects.push(fn);}};
  const client={supabase:{auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange(fn){authListener=fn;return {data:{subscription:{unsubscribe(){}}}};}}},SUPABASE_PROJECT_URL:'https://example.invalid',supabasePublicKey:'public'};
  const exported=load('hooks/useObservationResource.ts',{'react':React,'expo-router':{useFocusEffect(fn){focus=fn;}},'react-native':{AppState:{currentState:'active',addEventListener(){return{remove(){}};}}},'@/lib/supabase/client':client,'@/utils/goalChangeEvents':{subscribeGoalChanged(fn){goalListener=fn;return ()=>{};}},'@/utils/dynamicTdeeObservation':{...api,observationRolloutEnabled:()=>true,requestObservation:input=>api.requestObservation({...input,fetcher})}});
  const hook=exported.useObservationResource('program',api.parseObservationProgram,'owner');const cleanupEffect=effects[0](), cleanupFocus=focus();const cleanup=()=>{cleanupFocus();cleanupEffect();};
  return {hook,states,cleanup,auth(next){session=next;authListener('TOKEN_REFRESHED',next);},goal(id){goalListener(id);}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('same actor token refresh preserves observation; signout clears it',async()=>{let calls=0;const h=harness(async()=>{calls++;return reply(program());});await flush();assert.equal(h.states[0].owner,'owner');h.auth({user:{id:'owner'},access_token:'new'});await flush();assert.equal(calls,1);assert.equal(h.states[0].owner,'owner');h.auth(null);assert.equal(h.states[0],null);h.cleanup();});
test('hook discards pending request on actor change and unmount',async()=>{let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));await flush();h.auth(null);resolve(reply(program()));await flush();assert.equal(h.states[0],null);h.cleanup();});
test('goal event for another actor preserves cache; own goal invalidates before refresh',async()=>{let calls=0,resolve;const h=harness(async()=>{calls++;if(calls===1)return reply(program());return new Promise(r=>{resolve=r;});});await flush();h.goal('other');assert.equal(calls,1);assert.notEqual(h.states[0],null);h.goal('owner');assert.equal(h.states[0],null);await flush();resolve(reply(program()));await flush();assert.notEqual(h.states[0],null);h.cleanup();});
test('settings mutation is serialized; goal invalidation reconciles with one GET, never another POST',async()=>{let resolve;const methods=[];const h=harness(async(_url,options)=>{methods.push(options.method);if(methods.length===2)return new Promise(r=>{resolve=r;});return reply(methods.length===1?program():{...program(),enabled:false,reviewDay:4});});await flush();const pending=h.hook.updateSettings(false,4);await flush();await assert.rejects(h.hook.updateSettings(true,3),/observation_busy/);h.goal('owner');resolve(reply({...program(),enabled:false,reviewDay:4}));await assert.rejects(pending,/account_changed/);await flush();assert.deepEqual(methods,['GET','POST','GET']);assert.equal(h.states[0].value.enabled,false);assert.equal(h.states[0].value.reviewDay,4);assert.equal(h.states[1],false);assert.equal(h.states[2],null);h.cleanup();});
