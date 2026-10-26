import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoveryDiscoveryOnce,recoveryRefine} from '../utils/recoveryDiscoveryOnce.ts';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='@/utils/stringUtils'?new URL('../utils/stringUtils.ts',import.meta.url).href:specifier,context);}});
const {buildSyntheticOffData}=await import('../utils/servingParser.ts');
test('remounts share one discovery and uncertain failures are not automatically retried',async()=>{
 let calls=0;const start=async()=>{calls++;return {candidates:[]};};
 const a=recoveryDiscoveryOnce('owner:barcode',start),b=recoveryDiscoveryOnce('owner:barcode',start);
 assert.equal(a,b);await Promise.all([a,b]);assert.equal(calls,1);
 const failed=()=>{calls++;throw Error('uncertain');};
 await assert.rejects(recoveryDiscoveryOnce('owner:failed',failed));
 await assert.rejects(recoveryDiscoveryOnce('owner:failed',failed));assert.equal(calls,2);
 await recoveryDiscoveryOnce('another:barcode',start);assert.equal(calls,3);
});
test('cached absent fiber stays absent while explicit zero and four macros retain scaling',()=>{
 const item={name:'Offline fixture',calories:60,protein:0,carbs:4,fat:4.5,fiber:null,serving_size:20,macros_per:'serving',nutriments:{fiber_100g:99}};
 const p=buildSyntheticOffData(item);assert.equal(p.nutriments.fiber_100g,undefined);
 assert.equal(p.nutriments['energy-kcal_100g'],300);assert.equal(p.nutriments.carbohydrates_100g,20);assert.equal(p.nutriments.fat_100g,22.5);
 assert.equal(buildSyntheticOffData({...item,fiber:0}).nutriments.fiber_100g,0);
 assert.equal(buildSyntheticOffData({...item,fiber:2}).nutriments.fiber_100g,10);
});

test('expired successful review requires explicit retry; retry buttons coalesce',async()=>{
 let calls=0;const start=async()=>{calls++;return {expires_at:Date.now()+10000,candidates:[]};};
 const original=await recoveryDiscoveryOnce('expiry',start);
 await assert.rejects(recoveryDiscoveryOnce('expiry',start,false,original.expires_at+1),/expired_proposal/);assert.equal(calls,1);
 const a=recoveryDiscoveryOnce('expiry',start,true,original.expires_at+1),b=recoveryDiscoveryOnce('expiry',start,true,original.expires_at+1);
 assert.equal(a,b);await a;assert.equal(calls,2);
});
test('latest photo refinement survives Back/remount and failed sessions need explicit retry',async()=>{
 let discovery=0,photos=0;const start=async()=>{discovery++;return {session:'original',expires_at:Date.now()+10000};};
 await recoveryDiscoveryOnce('refinement',start);
 const refined=await recoveryRefine('refinement',async()=>{photos++;return {session:'latest',photo:{nutrition:{fiber:null}},expires_at:Date.now()+10000};});
 assert.deepEqual(await recoveryDiscoveryOnce('refinement',start),refined);assert.equal(discovery,1);assert.equal(photos,1);
 await assert.rejects(recoveryRefine('refinement',async()=>{throw Error('uncertain photo response');}));
 await assert.rejects(recoveryDiscoveryOnce('refinement',start));assert.equal(discovery,1);
 await recoveryDiscoveryOnce('refinement',start,true);assert.equal(discovery,2);
});
test('actual catalog upsert preserves unknown fiber after defaulting nutrition extractor',async()=>{
 const {optionalFiber}=await import('../utils/optionalFiber.ts');
 const {readFileSync}=await import('node:fs');
 assert.equal(optionalFiber({}),null);assert.equal(optionalFiber({fiber_100g:null}),null);assert.equal(optionalFiber({fiber_100g:0}),0);
 assert.equal(optionalFiber({fiber_100g:2.5}),2.5);assert.equal(optionalFiber({fiber_100g:'<1'}),null);
 const source=readFileSync(new URL('../components/FoodDetailsLayout.tsx',import.meta.url),'utf8');
 const upsert=source.slice(source.indexOf('const upsertFoodItem ='),source.indexOf('// 1. Try to find by barcode'));
 assert.match(upsert,/fiber: optionalFiber\(prod.nutriments\)/);assert.doesNotMatch(upsert,/fiber: safeNum/);
 assert.match(source,/update\(payload\)/);
});

test('selection saves once and navigates with returned data only after approved persistence',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../components/BarcodeRecoveryScreen.tsx',import.meta.url),'utf8');
 const select=source.slice(source.indexOf('async function select('),source.indexOf('const button='));
 assert.match(select,/inFlight.current/);assert.match(select,/selected.proposal!==candidate.proposal/);
 assert.match(select,/await request/);assert.match(select,/data.status!=='approved'/);assert.match(select,/finish\(data.food_item\)/);
 assert.match(select,/router.dismissTo\(destination\)/);assert.match(select,/buildSyntheticOffData\(saved\)/);
 assert.doesNotMatch(select,/beginPhotos|router.back|setStage\('done'\)/);
 assert.doesNotMatch(source,/stage==='confirm'|stage==='done'/);assert.match(source,/shared barcode catalog/);assert.match(source,/Saving product data/);
});

test('corrected per-serving and existing per-100g rows scale once for any selected weight',async()=>{
 const {calcMacros}=await import('../utils/macros.ts');const {readFileSync}=await import('node:fs');
 const corrected={name:'Mature Cheddar',calories:60,protein:0,carbs:4,fat:4.5,fiber:null,serving_size:20,macros_per:'serving'};
 const normalized={...corrected,calories:300,carbs:20,fat:22.5,macros_per:'100g'};
 for(const item of [corrected,normalized])for(const grams of [10,20,40,100]){
  const n=buildSyntheticOffData(item).nutriments;
  const result=calcMacros({calories:n['energy-kcal_100g'],protein:n.proteins_100g,carbs:n.carbohydrates_100g,fat:n.fat_100g,serving_size:100,macros_per:'100g'},grams);
  assert.equal(result.calories,60*grams/20);assert.equal(result.carbs,4*grams/20);assert.equal(result.fat,4.5*grams/20);assert.equal(n.fiber_100g,undefined);
 }
 const source=readFileSync(new URL('../components/FoodDetailsLayout.tsx',import.meta.url),'utf8');
 const calc=source.slice(source.indexOf('const calculateMacros ='),source.indexOf('const upsertFoodItem ='));
 assert.match(calc,/macros_per: '100g'/);assert.doesNotMatch(calc,/foodItemRef.macros_per/);
});

test('user-bound cache keeps honest verification flags and barcode lookup returns it before providers',async()=>{
 const {readFileSync}=await import('node:fs');const sql=readFileSync(new URL('../supabase/proposed/barcode-recovery.sql',import.meta.url),'utf8');
 assert.match(sql,/verified=not user_bound/);assert.match(sql,/ai_verified=not user_bound/);assert.match(sql,/when user_bound then 'medium' else 'high'/);assert.match(sql,/invalid_user_binding/);
 const lookup=readFileSync(new URL('../supabase/functions/lookup-barcode/index.ts',import.meta.url),'utf8');
 const hit=lookup.slice(lookup.indexOf('// If found in DB'),lookup.indexOf('// Step 2: Call OpenFoodFacts'));
 assert.match(hit,/if \(dbRow\)/);assert.match(hit,/return jsonResponse\(\{ found: true, item: dbRow, source: 'supabase' \}\)/);assert.doesNotMatch(hit,/verified|ai_verified|confidence/);
});

test('recovery return preserves edit, meal-plan and barcode context without stale product data',async()=>{
 const {recoveryRouteContext}=await import('../utils/recoveryRouteContext.ts');
 for(const original of [
  {mode:'edit',itemId:'meal-item',itemTable:'saved_meal_items',date:'2026-10-26',meal:'lunch'},
  {mode:'meal-plan',planId:'plan',mealId:'planned-meal',returnTo:'/meal-plan',context:'plan'},
  {mode:'view',meal:'dinner',date:'2026-10-26'},
  {meal:'breakfast'},
 ])assert.deepEqual(recoveryRouteContext({...original,offData:'stale',food_item_id:'stale-id',barcode:'stale'}),original);
 const {readFileSync}=await import('node:fs');
 const native=readFileSync(new URL('../components/BarcodeRecoveryScreen.tsx',import.meta.url),'utf8');
 assert.match(native,/recoveryRouteContext\(params\)/);assert.match(native,/food_item_id:saved.id/);
 const details=readFileSync(new URL('../components/FoodDetailsLayout.tsx',import.meta.url),'utf8');
 assert.match(details,/recoveryRouteContext\(routeContext\)/);assert.match(details,/itemId: itemId/);assert.match(details,/planId: planId/);
});

test('stale focus responses are discarded and fractional macros are display-only',async()=>{
 const {macroDisplayGrams}=await import('../utils/recoveryRouteContext.ts');
 assert.equal(macroDisplayGrams(4.5),4.5);assert.equal(macroDisplayGrams(2.25),2.3);assert.equal(macroDisplayGrams(4),4);
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../components/FoodDetailsLayout.tsx',import.meta.url),'utf8');
 const focus=source.slice(source.indexOf('// Re-fetch food item data'),source.indexOf('const checkFavoriteStatus'));
 assert.match(focus,/if \(!active \|\| latestOffData.current !== requestedOffData\) return/);
 assert.match(focus,/return \(\) => \{ active = false; \}/);assert.match(focus,/\[food_item_id, mode, offData\]/);
 assert.ok(focus.indexOf('!active')<focus.indexOf('setProduct(refreshedProduct)'));
 assert.match(source,/const calculateMacros = \(forDisplay = false\)/);assert.match(source,/const macros = calculateMacros\(true\)/);
 assert.match(source,/forDisplay \? macroDisplayGrams\(result.fat\) : Math.round\(result.fat\)/);
});

test('approved edit nutrition wins for a legacy meal without catalog link while retaining its portion',async()=>{
 const {recoveryProduct,preferRecoveryProduct}=await import('../utils/recoveryRouteContext.ts');
 const meal={id:'legacy-meal',food_item_id:null,grams:40,quantity:2};const before=structuredClone(meal);
 const old={product_name:'Old values',nutriments:{'energy-kcal_100g':999}};
 const saved=buildSyntheticOffData({name:'Mature Cheddar',calories:60,protein:0,carbs:4,fat:4.5,fiber:null,serving_size:20,macros_per:'serving'});
 const approved=recoveryProduct(JSON.stringify(saved),true);
 const displayed=preferRecoveryProduct(old,approved);
 assert.equal(displayed.nutriments['energy-kcal_100g']*meal.grams/100,120);
 assert.equal(displayed.nutriments.fat_100g*meal.grams/100,9);assert.deepEqual(meal,before);
 assert.equal(preferRecoveryProduct(old,recoveryProduct(JSON.stringify(saved),false)),old);
});

test('late edit responses cannot overwrite newer approved route or update after unmount',async()=>{
 const {createLoadGeneration}=await import('../utils/recoveryRouteContext.ts');const gate=createLoadGeneration();let displayed='initial';let release;
 const oldCurrent=gate.begin();const oldRequest=new Promise(r=>release=r).then(()=>{if(oldCurrent())displayed='stale';});
 const newCurrent=gate.begin();if(newCurrent())displayed='approved';release();await oldRequest;assert.equal(displayed,'approved');
 const unmounted=gate.begin();gate.invalidate();assert.equal(unmounted(),false);
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../components/FoodDetailsLayout.tsx',import.meta.url),'utf8');
 const loader=source.slice(source.indexOf('const loadEditItem ='),source.indexOf('  useEffect(() => {',source.indexOf('const loadEditItem =')));
 assert.match(loader,/preferRecoveryProduct\(mockProduct, approvedProduct\)/);assert.match(loader,/if \(!isCurrent\(\)\) return/);
 assert.match(loader,/offData, editRouteKey, routeContext.recoverySaved/);assert.match(source,/editGeneration.current.invalidate\(\)/);
});
