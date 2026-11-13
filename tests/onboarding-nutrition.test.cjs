const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(name) {
 const mod={exports:{}};
 const source=ts.transpileModule(fs.readFileSync(`utils/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',source)(id=>{
  if(id==='./calculations')return load('calculations');
  if(id==='./nutritionGoalRequest')return {fail:m=>{throw Error(m);},validGoal:()=>true};
  if(id==='@/utils/dateUtils')return {};
  throw Error(id);
 },mod,mod.exports);return mod.exports;
}
const {prepareOnboardingNutrition:prepare}=load('onboardingNutrition');
const now=new Date('2026-11-12T01:00:00Z');
function fixture(){return {form:{dateOfBirth:'1996-06-15',sex:'male',units:'metric',heightFeet:'',heightInches:'',heightCm:'180',weight:'80',goalWeight:'70',goalType:'lose',lossRateLbsPerWeek:1,activityLevel:'moderate',dietaryRestrictions:[],proteinPreferences:[],recipeStyles:[],dislikedFoods:''},snapshot:{profile:{id:'owner',onboarding_completed:false,updated_at:'2026-11-11T01:02:03.123456Z',timezone:'America/New_York',journey_start_date:null,journey_start_weight:null},goal:null}};}
function run(f){return prepare(f.form,f.snapshot,now);}
test('prepares exact DOB, target and CAS with timezone day, no goal_weight or adaptive flags',()=>{const f=fixture(),r=run(f);assert.equal(r.profile.date_of_birth,'1996-06-15');assert.equal(r.profile.journey_start_date,'2026-11-11');assert.equal(r.goal.target_weight,70);assert.equal(r.expectedProfileUpdatedAt,f.snapshot.profile.updated_at);assert.equal(r.goal.macro_preset,'lean_body');assert.equal('goal_weight'in r.profile,false);assert.equal('adaptive_tdee_enabled'in r.profile,false);assert.equal(r.preview.calories,2259);});
for(const dob of ['','1996-02-30','2009-01-01','1900-01-01'])test('rejects invalid/underage DOB '+dob,()=>{const f=fixture();f.form.dateOfBirth=dob;assert.throws(()=>run(f));});
for(const target of ['80','90'])test('rejects loss direction '+target,()=>{const f=fixture();f.form.goalWeight=target;assert.throws(()=>run(f),/inconsistent_goal_targets/);});
test('rejects gain direction and achieved gain',()=>{for(const target of ['70','80']){const f=fixture();Object.assign(f.form,{goalType:'gain',goalWeight:target});assert.throws(()=>run(f));}});
test('imperial blank/whitespace inches never become zero, explicit zero valid',()=>{for(const inches of ['', ' ']){const f=fixture();Object.assign(f.form,{units:'imperial',heightFeet:'6',heightInches:inches,weight:'176',goalWeight:'154'});assert.throws(()=>run(f));}const f=fixture();Object.assign(f.form,{units:'imperial',heightFeet:'6',heightInches:'0',weight:'176',goalWeight:'154'});assert.equal(run(f).profile.height,182.88);});
for(const partial of [{journey_start_date:null,journey_start_weight:100},{journey_start_date:'2026-01-01',journey_start_weight:null}])test('partial historical journey is not backfilled '+JSON.stringify(partial),()=>{const f=fixture();Object.assign(f.snapshot.profile,partial);assert.throws(()=>run(f),/profile_review_required/);});
test('existing complete history is preserved, no journey patch',()=>{const f=fixture();Object.assign(f.snapshot.profile,{journey_start_date:'2026-01-01',journey_start_weight:100});assert.equal('journey_start_date'in run(f).profile,false);});
test('completed onboarding, no timezone, null sex/activity fail closed',()=>{for(const change of [f=>f.snapshot.profile.onboarding_completed=true,f=>f.snapshot.profile.timezone='',f=>f.form.sex=null,f=>f.form.activityLevel=null]){const f=fixture();change(f);assert.throws(()=>run(f));}});
test('blank, exponent and nonnumeric weights reject without default',()=>{for(const w of [' ','80kg','8e1','NaN']){const f=fixture();f.form.weight=w;assert.throws(()=>run(f));}});
test('product floor and existing calorie reduction reject',()=>{const f=fixture();Object.assign(f.form,{heightCm:'150',weight:'50',goalWeight:'40',activityLevel:'sedentary',lossRateLbsPerWeek:2});assert.throws(()=>run(f),/below_product_reference/);const g=fixture();g.snapshot.goal={daily_calories:3000};assert.throws(()=>run(g),/goal_reduction_requires_review/);});
test('lean body nonnegative clamp cannot mask inconsistent macro calories',()=>{const f=fixture();Object.assign(f.form,{weight:'180',goalWeight:'170',activityLevel:'sedentary',lossRateLbsPerWeek:2});assert.throws(()=>run(f),/inconsistent_macro_targets/);});
test('null onboarding flag is valid initial state, undefined is not a verified profile',()=>{const f=fixture();f.snapshot.profile.onboarding_completed=null;assert.equal(run(f).profile.onboarding_completed,true);delete f.snapshot.profile.onboarding_completed;assert.throws(()=>run(f));});
test('preference limits match backend and fractional feet reject',()=>{for(const change of [f=>f.form.dietaryRestrictions=Array(51).fill('x'),f=>f.form.proteinPreferences=['x'.repeat(151)],f=>f.form.dislikedFoods='x'.repeat(2001),f=>Object.assign(f.form,{units:'imperial',heightFeet:'5.5',heightInches:'0',weight:'176',goalWeight:'154'})]){const f=fixture();change(f);assert.throws(()=>run(f));}});

const {recoveredOnboardingPresentation:presentation}=load('onboardingNutrition');
test('cold onboarding presents original accepted weights and estimate without recalculating targets',()=>{
 const f=fixture(), prepared=run(f), input={operation:'initial_onboarding',goal:prepared.goal,profile:prepared.profile}; const before=JSON.stringify(input);
 const p=presentation(input); assert.equal(p.weight,'80');assert.equal(p.goalWeight,'70');assert.equal(p.units,'metric');assert.equal(p.weeks,prepared.preview.weeks);assert.equal(JSON.stringify(input),before);
});
test('cold onboarding never invents missing weights or a loss rate',()=>{
 const f=fixture(), prepared=run(f);for(const patch of [{profile:{...prepared.profile,current_weight:null}},{goal:{...prepared.goal,target_weight:null}},{goal:{...prepared.goal,loss_rate_lbs_per_week:null}}])assert.throws(()=>presentation({operation:'initial_onboarding',goal:prepared.goal,profile:prepared.profile,...patch}));
 assert.equal(presentation(null),null);
});
test('cold onboarding uses existing recovery controls, never a fresh implicit request or blank paywall inputs',()=>{
 const s=fs.readFileSync('app/onboarding/complete.tsx','utf8');assert.match(s,/onboarding.pending && !onboarding.loading && step < 9/);assert.match(s,/goalWeight=\{recoveredPresentation.value\?\.goalWeight \?\? goalWeight\}/);assert.match(s,/currentWeight=\{recoveredPresentation.value\?\.weight \?\? weight\}/);
});
