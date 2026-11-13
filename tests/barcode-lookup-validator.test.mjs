import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureOff100gV4,validateOff100gV4} from '../supabase/functions/lookup-barcode/_shared/off100gV4.mjs';
const observed=JSON.parse(readFileSync(new URL('./fixtures/barcode/public-product-fixtures.json',import.meta.url)));
const cookie=()=>structuredClone(observed.find(p=>p.code==='0044000060114'));
const capture=p=>captureOff100gV4(p,{expectedId:p.code,capturedAt:'2026-11-12T00:00:00Z'});
test('real cookies accept explicit34g and retain complete original nutrients unchanged',()=>{
 const p=cookie(),before=structuredClone(p),e=capture(p),r=validateOff100gV4(e);
 assert.deepEqual(p,before);assert.deepEqual(e.snapshot.nutriments,p.nutriments);assert.equal(e.snapshot.nutrition_data_per,'100g');assert.equal(r.servingGrams,34);
 assert.equal(r.nutrients.find(x=>x.provider_key==='energy-kcal_100g').amount,470.588235294118);
 assert.equal(r.nutrients.find(x=>x.provider_key==='energy_100g').status,'qualified');
});
test('real oats accept40g; qualified salt/added sugar retained raw but not canonical',()=>{
 const p=structuredClone(observed.find(p=>p.code==='0030000012000'));const e=capture(p),r=validateOff100gV4(e);
 assert.equal(r.servingGrams,40);assert.equal(r.nutrients.find(x=>x.provider_key==='salt_100g').status,'qualified');assert.equal(e.snapshot.nutriments['salt_modifier'],'~');
});
for(const code of ['0078742054100','4099100112184','4099100300031'])test('real incomplete or volumetric source remains review '+code,()=>assert.throws(()=>capture(observed.find(p=>p.code===code))));
test('secondary unqualified kJ conflict quarantined, kcal remains declared',()=>{const p=cookie();delete p.nutriments.energy_modifier;delete p.nutriments['energy-kj_modifier'];const r=validateOff100gV4(capture(p));assert.equal(r.nutrients.find(n=>n.provider_key==='energy_100g').status,'conflict');assert.equal(r.nutrients.find(n=>n.provider_key==='energy-kcal_100g').status,'valid');});
test('unknown remains null; no zero substitution',()=>{const p=cookie();delete p.nutriments['vitamin-d_100g'];const r=validateOff100gV4(capture(p));assert.deepEqual(r.nutrients.find(n=>n.provider_key==='vitamin-d_100g'),{provider_key:'vitamin-d_100g',amount:null,status:'missing',unit:'g'});});
test('valid zero retained',()=>{const p=cookie();for(const k of ['fat','fat_100g','fat_serving','fat_value'])p.nutriments[k]=0;assert.equal(validateOff100gV4(capture(p)).nutrients.find(n=>n.provider_key==='fat_100g').amount,0);});
test('mg display values normalized once',()=>{const p=cookie();Object.assign(p.nutriments,{iron:.003,iron_100g:.003,iron_serving:.00102,iron_unit:'mg',iron_value:3});assert.equal(validateOff100gV4(capture(p)).nutrients.find(n=>n.provider_key==='iron_100g').amount,.003);});
test('returned snapshot is detached',()=>{const p=cookie(),e=capture(p);p.nutriments.fat=99;assert.notEqual(e.snapshot.nutriments.fat,99);});
test('prepared namespace preserved but never canonical',()=>{const p=cookie();p.nutriments.fat_prepared_100g=1;const e=capture(p),r=validateOff100gV4(e);assert.equal(e.snapshot.nutriments.fat_prepared_100g,1);assert.ok(!r.nutrients.some(n=>n.provider_key.includes('prepared')));});
const rejects=[
 ['wrong barcode',p=>p.code='0044000060115'],['missing mass',p=>p.serving_quantity_unit=null],['volume',p=>p.serving_quantity_unit='ml'],['bad label',p=>p.serving_size='34 ml'],['multiple grams',p=>p.serving_size='20 g (34 g)'],['inconsistent label',p=>p.serving_size='3 cookies (35 g)'],['zero mass',p=>p.serving_quantity=0],['missing kcal',p=>delete p.nutriments['energy-kcal_100g']],['core null',p=>p.nutriments.fat_100g=null],['core string',p=>p.nutriments.fat_100g='2'],['core negative',p=>p.nutriments.fat_100g=-1],['qualified core',p=>p.nutriments.fat_modifier='~'],['original contradictory',p=>p.nutriments.fat=2],['serving contradictory',p=>p.nutriments.fat_serving=2],['unit incompatible',p=>p.nutriments.fat_unit='kcal'],['micro incompatible',p=>{p.nutriments.iron_100g=.003;p.nutriments.iron_value=100;p.nutriments.iron_unit='mg';}],['preparation unresolved',p=>p.preparation='prepared'],['new schema',p=>p.nutrition={input_sets:[]}],['wrong basis',p=>p.nutrition_data_per='serving'],['source identity missing',p=>p.ingredients_text='']
];
for(const [name,change]of rejects)test('reject '+name,()=>{const p=cookie();change(p);assert.throws(()=>capture(p));});
test('cannot pass trusted flag or altered envelope shape',()=>{const e=capture(cookie());e.trusted=true;assert.throws(()=>validateOff100gV4(e));});
test('v3 cannot pass v4 validator',()=>{const e=capture(cookie());e.version=3;assert.throws(()=>validateOff100gV4(e));});
