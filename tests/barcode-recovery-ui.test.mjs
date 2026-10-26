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

test('selecting a usable option opens confirmation without camera and keeps one explicit shared-save action',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../components/BarcodeRecoveryScreen.tsx',import.meta.url),'utf8');
 const select=source.slice(source.indexOf('function select('),source.indexOf('async function confirm('));
 assert.match(select,/setStage\('confirm'\)/);assert.doesNotMatch(select,/beginPhotos|requestPermission|setStage\('front'\)/);
 assert.match(source,/None of these.*take package photos/);assert.match(source,/Confirm data and update product/);
 assert.match(source,/approve updating the shared barcode catalog/);assert.doesNotMatch(source,/accessibilityRole="checkbox"/);
});

test('user-bound cache keeps honest verification flags and barcode lookup returns it before providers',async()=>{
 const {readFileSync}=await import('node:fs');const sql=readFileSync(new URL('../supabase/proposed/barcode-recovery.sql',import.meta.url),'utf8');
 assert.match(sql,/verified=not user_bound/);assert.match(sql,/ai_verified=not user_bound/);assert.match(sql,/when user_bound then 'medium' else 'high'/);assert.match(sql,/invalid_user_binding/);
 const lookup=readFileSync(new URL('../supabase/functions/lookup-barcode/index.ts',import.meta.url),'utf8');
 const hit=lookup.slice(lookup.indexOf('// If found in DB'),lookup.indexOf('// Step 2: Call OpenFoodFacts'));
 assert.match(hit,/if \(dbRow\)/);assert.match(hit,/return jsonResponse\(\{ found: true, item: dbRow, source: 'supabase' \}\)/);assert.doesNotMatch(hit,/verified|ai_verified|confidence/);
});
