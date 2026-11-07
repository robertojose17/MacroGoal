const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const module = {exports: {}};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText,
    {module, exports: module.exports, require(id) {
      if (id.endsWith('.mjs')) return require(path.resolve(root,path.dirname(file),id));
      const local = id.startsWith('@/') ? id.slice(2) : id.startsWith('.') ? path.join(path.dirname(file),id) : null;
      if (local) return load(local.endsWith('.ts') ? local : local + '.ts');
      throw Error('Unexpected runtime dependency: ' + id);
    }});
  return module.exports;
}
const {foodJsonSnapshot, savedMealForFoodDetails, savedMealFoodUpdate, foodLogIds, savedMealPortionForDetails} = load('utils/foodPersistence.ts');
const plain = value => JSON.parse(JSON.stringify(value));
function row(extra = {}) {
  return {id:'saved-item', saved_meal_id:'saved-meal', food_id:'private-food', food_item_id:null, food_name:'Rice', food_brand:null, serving_amount:158, servings_count:0.5, serving_unit:'half cup (79 g)', calories:102.7, protein:2, carbs:22, fat:0.3, fiber:null, created_at:null, foods:null, ...extra};
}

test('saved-meal reads map exact nullable schema without altering the source', () => {
  const source = row(), before = structuredClone(source), result = savedMealForFoodDetails(source);
  assert.equal(result.fats,0.3); assert.equal(result.grams,79); assert.equal(result.quantity,0.5);
  assert.equal(result.serving_description,null); assert.equal(result.off_data,null);
  assert.equal(result.fiber,null); assert.deepEqual(source,before);
});
test('saved-meal missing nutrition remains missing rather than claiming zero', () => {
  const result = savedMealForFoodDetails(row({fat:null, calories:null}));
  assert.equal(result.fats,null); assert.equal(result.calories,null);
});
test('saved-meal adapter preserves joined private-food identity and nullable joins', () => {
  const foods = {id:'private-food', name:'My rice'};
  assert.equal(savedMealForFoodDetails(row({foods})).foods,foods);
  assert.equal(savedMealForFoodDetails(row()).foods,null);
});
test('saved edits use fat and real mass/count without diary-only columns', () => {
  for (const [quantity, grams] of [[0.5,79],[1,158],[3,100]]) {
    const values = {quantity,grams,servingDescription:`${quantity} cup (${grams} g)`,calories:130,protein:3,carbs:28,fats:0.3,fiber:0};
    const update = savedMealFoodUpdate(values);
    assert.deepEqual(Object.keys(update).sort(),['calories','carbs','fat','fiber','protein','serving_amount','serving_unit','servings_count'].sort());
    assert.equal(update.fat,0.3); assert.equal(update.serving_amount*update.servings_count,grams);
    const loaded = savedMealForFoodDetails(row(update));
    assert.equal(loaded.grams,grams); assert.equal(loaded.quantity,quantity); assert.equal(loaded.serving_unit,values.servingDescription); assert.equal(loaded.serving_description,null);
  }
});
test('saved edit never invents grams from ml or cup text', () => {
  const update = savedMealFoodUpdate({quantity:2,grams:73,servingDescription:'2 cup (73 g)',calories:10,protein:1,carbs:1,fats:0,fiber:0});
  assert.equal(update.serving_amount,36.5); assert.equal(update.serving_unit,'2 cup (73 g)');
});
test('invalid saved quantities and unknown mass cannot create a write payload', () => {
  for (const quantity of [0,-1,NaN,Infinity]) assert.throws(()=>savedMealFoodUpdate({quantity,grams:79}),/invalid_saved_meal_portion/);
  for (const grams of [0,-1,NaN,Infinity]) assert.throws(()=>savedMealFoodUpdate({quantity:1,grams}),/invalid_saved_meal_portion/);
});
test('food JSON retains confirmed macros, provider evidence and exact selected portion', () => {
  const product = {code:'012345678905',_serving_authority:'confirmed_correction',nutriments:{'energy-kcal_100g':300,fiber_100g:undefined},_portion_evidence:{version:1,fdc_id:'123',portions:[{grams:158}]},_macrogoal_selected_portion_v1:{version:1,description:'cup',quantity:0.5,grams:79}};
  const saved = foodJsonSnapshot(product);
  assert.deepEqual(plain(saved),plain(product)); assert.notEqual(saved,product);
  assert.equal(saved._macrogoal_selected_portion_v1.grams,79); assert.equal(saved.nutriments['energy-kcal_100g'],300);
});
test('JSON snapshot supports nullable values and arrays without undefined properties', () => {
  assert.deepEqual(plain(foodJsonSnapshot({a:null,b:undefined,c:[undefined,null,0,false]})),{a:null,c:[null,null,0,false]});
});
test('JSON snapshot rejects non-finite values and cyclic/non-JSON provider evidence', () => {
  const cycle = {}; cycle.self = cycle;
  for (const value of [NaN,Infinity,undefined,()=>{},Symbol('invalid'),1n,cycle,{evidence:{bad:Infinity}}]) assert.throws(()=>foodJsonSnapshot(value),/invalid_food_snapshot/);
});
test('JSON snapshot safely preserves keys without prototype mutation', () => {
  const source = JSON.parse('{"__proto__":{"polluted":true},"constructor":"fixture"}');
  const result = foodJsonSnapshot(source);
  assert.equal(Object.hasOwn(result,'__proto__'),true); assert.equal(result.polluted,undefined);
  assert.deepEqual(plain(result),source);
});
test('RPC diagnostic IDs are read only from the expected JSON object fields', () => {
  assert.deepEqual(plain(foodLogIds({meal_id:'meal',meal_item_id:'item',extra:true})),{meal_id:'meal',meal_item_id:'item'});
  for (const value of [null,undefined,true,1,'meal',[],[{meal_id:'meal'}],{meal_id:123,meal_item_id:false}]) assert.deepEqual(plain(foodLogIds(value)),{});
});
test('detail reads and writes use concrete schema relations, keeping diary snapshots', () => {
  const source = fs.readFileSync(path.join(root,'components/FoodDetailsLayout.tsx'),'utf8');
  assert.match(source,/from\('saved_meal_items'\)\.select\('\*, foods!left\(\*\)'\)/);
  assert.match(source,/from\('meal_items'\)\.select\('\*, foods!left\(\*\)'\)/);
  assert.match(source,/from\('saved_meal_items'\)\.update\(savedMealFoodUpdate\(/);
  assert.match(source,/from\('meal_items'\)\.update\(/);
  assert.match(source,/off_data:saveOffData/);
  assert.doesNotMatch(source,/\.from\(itemTable \?\? 'meal_items'\)/);
});

const {buildSyntheticOffData} = load('utils/servingParser.ts');
test('canonical catalog adapter accepts real nullable rows and allergen arrays', () => {
  const row = {name:'Bread', brand:null, barcode:'00123456', source:null, usda_fdc_id:null, allergens:['en:wheat'], serving_size:20, macros_per:'serving', calories:60, protein:2, carbs:6, fat:3, fiber:null, ai_verified:true, ai_verified_source:'barcode_recovery:source_label'};
  const product = buildSyntheticOffData(row);
  assert.equal(product.code,'00123456'); assert.equal(product.brands,'');
  assert.deepEqual(plain(product.allergens_tags),['en:wheat']);
  assert.equal(product._serving_authority,'confirmed_correction'); assert.equal(product.serving_quantity,20);
  assert.equal(product.nutriments['energy-kcal_100g'],300); assert.equal(product.nutriments.fiber_100g,undefined);
});
test('nullable catalog identifiers do not fabricate a package barcode or USDA identity', () => {
  for (const usda_fdc_id of [null,undefined,'bad-id',Infinity,123.5]) {
    const product = buildSyntheticOffData({name:'Rice',brand:null,barcode:null,allergens:null,usda_fdc_id});
    assert.equal(product.code,''); assert.equal(product._usda_fdc_id,undefined); assert.equal(product.allergens_tags,undefined);
  }
});

test('saved plain labels retain exact grams per unit and fractional saved count', () => {
  for (const [label, amount, count, description] of [['1 cup',158,1,'cup'],['0.5 cup',158,0.5,'cup'],['1 tbsp',13.5,1,'tbsp'],['2 ml',0.9,2,'ml'],['serving',158,0.5,'serving']]) {
    const portion = savedMealPortionForDetails({serving_unit:label,serving_amount:amount,servings_count:count});
    assert.equal(portion.gramsPerUnit,amount); assert.equal(portion.description,description);
    assert.equal(portion.gramsPerUnit*count,amount*count);
  }
});
test('saved label numbers cannot override exact numeric mass or count', () => {
  const portion = savedMealPortionForDetails({serving_unit:'1 cup (999 g)',serving_amount:158,servings_count:1});
  assert.equal(portion.gramsPerUnit,158); assert.equal(portion.description,'cup');
});
test('invalid saved mass and counts never fall back to diary density defaults', () => {
  for (const invalid of [0,-1,NaN,Infinity,null,undefined,true,'',' ']) {
    assert.throws(()=>savedMealPortionForDetails({serving_unit:'1 cup',serving_amount:invalid,servings_count:1}),/invalid_saved_meal_portion/);
    assert.throws(()=>savedMealPortionForDetails({serving_unit:'1 cup',serving_amount:158,servings_count:invalid}),/invalid_saved_meal_portion/);
  }
});
