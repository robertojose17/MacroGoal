const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),file);
const {createManualHandoffServices,savedMealReviewRoute,recheckSavedMealReview}=require('../utils/coachManualHandoff.ts');
const {addReviewedSavedMeal,prepareSavedMealDiaryItems}=require('../utils/manualSavedMealAdd.ts');
const access={isPremium:true,premiumLoading:false,gated:false,busy:false};
const date='2026-10-21', mealId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const option={meal_id:mealId,name:'Saved bowl',source:'saved_meal',portion_basis:'1_saved_meal',nutrition_authority:'advisory_snapshot',nutrition:{calories:500,protein:30,carbs:50,fats:15}};
function services(){
  const state={owner:'A',calls:[],denied:false,changed:false};
  const service=createManualHandoffServices({catalogSource:'owned_saved_meals',owner:async()=>state.owner,request:async body=>{
    state.calls.push(body);if(state.changed)state.owner='B';
    if(state.denied)return Response.json({error:'usage_gate'},{status:403});
    return Response.json(body.intent==='today'?{status:'ready',owner:'A',date,coverage:'logged_only',entry_count:1,logged:option.nutrition,target:{calories:2000,protein:120}}:{schema:'saved_meal_recommendations_v1',owner:'A',date,meal_type:body.meal_type,status:'options',next_action:'review_saved_meal',context:{date,coverage:'logged_only'},options:[option]});
  }});
  return {state,service};
}
test('admitted context and options lead to existing Details without proposal/confirm requests',async()=>{
  const {state,service}=services();assert.equal((await service.load(access,date)).kind,'ready');
  const recommendations=await service.recommend(access,date,'dinner');
  assert.deepEqual(savedMealReviewRoute(recommendations,mealId,access,'A',date,'dinner'),{pathname:'/my-meals-details',params:{mealId,meal:'dinner',date,coachReview:'true',coachOwner:'A'}});
  assert.deepEqual(state.calls.map(b=>b.intent),['today','recommend']);
});
test('free/unknown/busy and denied admission never fall back to data reads or navigation',async()=>{
  for(const patch of [{isPremium:false},{premiumLoading:true},{premiumError:'error'},{gated:true},{busy:true}]){
    const {state,service}=services();assert.notEqual((await service.recommend({...access,...patch},date,'dinner')).kind,'ready');assert.equal(state.calls.length,0);
  }
  const {state,service}=services();state.denied=true;assert.equal((await service.load(access,date)).kind,'blocked');assert.equal((await service.recommend(access,date,'dinner')).kind,'blocked');
});
test('account switch and stale owner/date/meal invalidate handoff',async()=>{
  const {state,service}=services();const r=await service.recommend(access,date,'dinner');
  for(const [owner,day,meal] of [['B',date,'dinner'],['A','2026-10-22','dinner'],['A',date,'lunch']])assert.equal(savedMealReviewRoute(r,mealId,access,owner,day,meal),null);
  state.changed=true;assert.equal((await service.recommend(access,date,'dinner')).kind,'blocked');
});
test('deferred response body account switch blocks today, options and no-options acceptance',async()=>{
  for(const kind of ['today','options','no_options']){
    let owner='A',release,started;
    const parsing=new Promise(resolve=>started=resolve);
    const body=kind==='today'?{status:'ready',owner:'A',date,coverage:'logged_only',entry_count:1,logged:option.nutrition,target:null}:{schema:'saved_meal_recommendations_v1',status:kind,owner:'A',date,meal_type:'dinner',context:{date,coverage:'logged_only'},next_action:kind==='options'?'review_saved_meal':'none',options:kind==='options'?[option]:[]};
    const service=createManualHandoffServices({catalogSource:'owned_saved_meals',owner:async()=>owner,request:async()=>({ok:true,status:200,json:async()=>{started();await new Promise(resolve=>release=resolve);return body;}})});
    const pending=kind==='today'?service.load(access,date):service.recommend(access,date,'dinner');
    await parsing;owner='B';release();assert.equal((await pending).kind,'blocked',kind);
  }
});
test('midnight during final auth wait prevents navigation using a captured prior day',async()=>{
  const {service}=services();const r=await service.recommend(access,date,'dinner');
  let today=date,release;
  const route=recheckSavedMealReview(r,mealId,'dinner','A',{owner:()=>new Promise(resolve=>release=resolve),today:()=>today,access:()=>access,isCurrent:()=>true});
  today='2026-10-22';release('A');assert.equal(await route,null);
});
test('gate changes during final auth wait prevent navigation',async()=>{
  const {service}=services();const r=await service.recommend(access,date,'dinner');
  let gated=false,release;
  const route=recheckSavedMealReview(r,mealId,'dinner','A',{owner:()=>new Promise(resolve=>release=resolve),today:()=>date,access:()=>({...access,gated}),isCurrent:()=>true});
  gated=true;release('A');assert.equal(await route,null);
});
function batch(){
  const values=new Map();const state={owner:'A',current:true,writes:[],failAt:0};
  const input={owner:'A',date,mealId,mealType:'dinner',items:[1,2],store:{getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)},currentOwner:async()=>state.owner,isCurrent:()=>state.current,write:async item=>{state.writes.push(item);if(item===state.failAt)throw Error('ack_lost');}};
  return {state,input,values};
}
test('rapid double Add sends one batch; lock is synchronous before asynchronous storage',async()=>{
  const {state,input}=batch();let release;input.write=async item=>{state.writes.push(item);if(item===1)await new Promise(resolve=>release=resolve);};
  const first=addReviewedSavedMeal(input);const second=await addReviewedSavedMeal(input);assert.equal(second.status,'busy');
  while(!release)await new Promise(resolve=>setImmediate(resolve));release();assert.equal((await first).status,'complete');assert.deepEqual(state.writes,[1,2]);
});
test('partial or uncertain write persists no-retry fence across another mounted instance',async()=>{
  const {state,input,values}=batch();state.failAt=2;
  const first=await addReviewedSavedMeal(input);assert.deepEqual(first,{status:'review',completed:1});assert.equal(values.size,1);
  state.failAt=0;const retry=await addReviewedSavedMeal({...input});assert.equal(retry.status,'review');assert.deepEqual(state.writes,[1,2]);
});
test('owner change before Add writes nothing; between items stops remaining items',async()=>{
  const a=batch();a.state.owner='B';assert.equal((await addReviewedSavedMeal(a.input)).status,'blocked');assert.deepEqual(a.state.writes,[]);
  const b=batch();b.input.write=async item=>{b.state.writes.push(item);b.state.owner='B';};
  assert.equal((await addReviewedSavedMeal(b.input)).status,'review');assert.deepEqual(b.state.writes,[1]);
});
test('storage failure before dispatch fails closed and does not claim successful save',async()=>{
  const {state,input}=batch();input.store.setItem=async()=>{throw Error('disk');};assert.equal((await addReviewedSavedMeal(input)).status,'unavailable');assert.deepEqual(state.writes,[]);
});
test('scope invalidated during awaited identity check blocks dispatch',async()=>{
  const {state,input}=batch();input.currentOwner=async()=>{state.current=false;return 'A';};
  assert.equal((await addReviewedSavedMeal(input)).status,'blocked');assert.deepEqual(state.writes,[]);
});
test('existing Details review path skips draft writes, binds ownership, and exposes explicit Add/review failure UI',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../app/my-meals-details.tsx'),'utf8');
  assert.ok(source.indexOf('if (coachReview) { await loadSavedMeal(); return; }')<source.indexOf('const draft = await loadDraft()'));
  assert.match(source,/\.eq\('user_id', user\.id\)/);
  assert.match(source,/onPress=\{handleAddToMeal\}/);
  assert.match(source,/Do not repeat it\. Review your diary/);
  assert.match(source,/manualOutcome\?\.status === 'review'/);
  assert.match(source,/addClaim\.current \|\| saveStopped\.current/);
  const card=fs.readFileSync(path.join(__dirname,'../components/CoachDailyAction.tsx'),'utf8');
  assert.doesNotMatch(card,/loadDailyAction\(|\.rpc\(|\.insert\(/);
  assert.match(card,/Review saved meal/);
});

function savedItem(patch={}){
 return {food_id:null,food_item_id:null,food_name:'Saved oats',food_brand:'Local brand',food_items:null,foods:null,serving_amount:50,servings_count:2,serving_unit:'g',calories:300,protein:10,carbs:45,fat:8,fiber:4,...patch};
}
// Execute the screen's real calculation for stored saved-item nutrients.
function detailsCalculate(){
 const source=fs.readFileSync(path.join(__dirname,'../app/my-meals-details.tsx'),'utf8');
 const ast=ts.createSourceFile('details.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='calcItemMacros');assert.ok(fn);
 return require('node:vm').runInNewContext(ts.transpile(fn.getText(ast)+';calcItemMacros',{target:ts.ScriptTarget.ES2022}));
}
test('name-only saved item sends displayed fallback name/brand with existing portion and nutrition math',async()=>{
 const items=prepareSavedMealDiaryItems([savedItem()],2,detailsCalculate());
 assert.equal(items[0].p_food_name,'Saved oats');assert.equal(items[0].p_food_brand,'Local brand');
 assert.equal(items[0].p_food_id,null);assert.equal(items[0].p_food_item_id,null);
 assert.equal(items[0].p_quantity,4);assert.equal(items[0].p_grams,200);assert.equal(items[0].p_calories,600);assert.equal(items[0].p_protein,20);
 const {state,input}=batch();input.items=items;assert.equal((await addReviewedSavedMeal(input)).status,'complete');assert.equal(state.writes[0].p_food_name,'Saved oats');
});
test('catalog-linked saved item retains IDs and displayed joined name/brand, with no extra multiplier',()=>{
 const food='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',catalog='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 for(const join of ['food_items','foods']){
  const item=savedItem({food_id:food,food_item_id:join==='food_items'?catalog:null,[join]:{name:'Catalog oats',brand:'Catalog brand'}});
  const p=prepareSavedMealDiaryItems([item],1,detailsCalculate())[0];
  assert.equal(p.p_food_id,food);assert.equal(p.p_food_item_id,item.food_item_id);assert.equal(p.p_food_name,'Catalog oats');assert.equal(p.p_food_brand,'Catalog brand');assert.equal(p.p_calories,300);
 }
});
test('whole diary batch is validated before first write; invalid names, IDs, portions or nutrition write nothing',async()=>{
 for(const patch of [{food_name:null},{food_name:'   '},{food_id:'not-a-uuid'},{serving_amount:0},{servings_count:NaN},{calories:100000},{protein:-1},{carbs:Infinity}]){
  const {state,input}=batch();
  await assert.rejects(async()=>{input.items=prepareSavedMealDiaryItems([savedItem(),savedItem(patch)],1,detailsCalculate());await addReviewedSavedMeal(input);});
  assert.deepEqual(state.writes,[]);
 }
});
test('Details wires prepared food identity to existing RPC only within explicit guarded Add',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/my-meals-details.tsx'),'utf8');
 const prepare=source.indexOf('diaryItems = prepareSavedMealDiaryItems('),dispatch=source.indexOf("supabase.rpc('log_food'");
 assert.ok(prepare>source.indexOf('const handleAddToMeal = async'));assert.ok(dispatch>prepare);
 assert.match(source,/items: diaryItems/);assert.match(source,/supabase\.rpc\('log_food', \{\s*\.\.\.item,/);
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261012215214_protect_log_food_owner_authorization.sql'),'utf8');
 assert.match(sql,/v_food_name text := p_food_name/);assert.match(sql,/p_food_name text DEFAULT/);
});
