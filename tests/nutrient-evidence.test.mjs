// PREPARED ONLY. Backend test execution has not been authorized/performed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validLoggedNutritionEvidence,explicitlyDeclaredNutrient} from '../supabase/functions/observed-snapshot-release/functions/dynamic-tdee/nutrient-evidence.ts';
const owner='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000002',revision='10000000-0000-4000-8000-000000000003';
const item=()=>({id,nutrition_revision:revision,calories:100,protein:0,carbs:25,fats:0,fiber:0,nutrition_evidence:{
 version:'user-entered-v1',ownerId:owner,itemId:id,revision,status:'active',declaredFields:['protein'],
 values:{calories:100,protein:0,carbs:25,fats:0,fiber:0}}});
test('exact explicit zero applies only to declared field',()=>{const v=item();assert.equal(validLoggedNutritionEvidence(v,owner),true);assert.equal(explicitlyDeclaredNutrient(v,owner,'protein'),true);assert.equal(explicitlyDeclaredNutrient(v,owner,'fats'),false);});
test('missing evidence is valid absence but not declaration',()=>{const v=item();v.nutrition_evidence=null;v.nutrition_revision=null;assert.equal(validLoggedNutritionEvidence(v,owner),true);assert.equal(explicitlyDeclaredNutrient(v,owner,'protein'),false);});
test('unknown or stale revision never matches',()=>{for(const revision of [null,'','10000000-0000-4000-8000-000000000004']){const v=item();v.nutrition_revision=revision;assert.equal(validLoggedNutritionEvidence(v,owner),false);}});
test('another owner or item cannot supply declaration',()=>{for(const key of ['ownerId','itemId']){const v=item();v.nutrition_evidence[key]='10000000-0000-4000-8000-000000000004';assert.equal(validLoggedNutritionEvidence(v,owner),false);}});
test('changed value even undeclared invalidates exact evidence binding',()=>{const v=item();v.carbs=30;assert.equal(validLoggedNutritionEvidence(v,owner),false);});
test('revoked or malformed source never authorizes',()=>{for(const patch of [{status:'revoked'},{version:'future'},{declaredFields:[]},{declaredFields:['protein','protein']},{declaredFields:['sodium']}]){const v=item();Object.assign(v.nutrition_evidence,patch);assert.equal(validLoggedNutritionEvidence(v,owner),false);}});
test('unknown and nonfinite values cannot masquerade as zero',()=>{for(const amount of [null,undefined,NaN,Infinity,-1,'0']){const v=item();v.protein=amount;v.nutrition_evidence.values.protein=amount;assert.equal(validLoggedNutritionEvidence(v,owner),false);}});
test('validation does not mutate item or imply accuracy',()=>{const v=item(),before=structuredClone(v);explicitlyDeclaredNutrient(v,owner,'protein');assert.deepEqual(v,before);assert.equal(Object.hasOwn(v.nutrition_evidence,'reviewed'),false);});
