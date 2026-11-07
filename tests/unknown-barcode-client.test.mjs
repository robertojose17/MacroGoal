import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unknownBarcodeAttempt,runUnknownAttempt} from '../utils/unknownBarcodeAttempt.ts';
import {manualRecoveryProduct} from '../utils/manualRecoveryProduct.ts';
import {recoveryRouteContext} from '../utils/recoveryRouteContext.ts';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('same owner/barcode keeps nonce and pending attempt; different owner isolated',async()=>{
 const a=unknownBarcodeAttempt('one','123');assert.match(a.requestId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(unknownBarcodeAttempt('one','123'),a);assert.notEqual(unknownBarcodeAttempt('two','123'),a);
 let resolve,calls=0;const pending=new Promise(r=>resolve=r);
 const first=runUnknownAttempt(a,()=>{calls++;return pending;});const second=runUnknownAttempt(a,()=>{throw Error('duplicate');});assert.equal(first,second);
 resolve({session:'signed',next_step:'rear_label'});await first;assert.equal(calls,1);assert.equal(a.review.session,'signed');
});
test('uncertain attempt preserves nonce/front and never automatically replays',async()=>{
 const a=unknownBarcodeAttempt('one','uncertain');a.frontUrl='synthetic';const id=a.requestId;let calls=0;
 await assert.rejects(runUnknownAttempt(a,async()=>{calls++;throw Error('transport');}));
 assert.equal(unknownBarcodeAttempt('one','uncertain').requestId,id);assert.equal(a.frontUrl,'synthetic');assert.equal(calls,1);assert.equal(a.review,undefined);
});
test('manual product scales once, keeps explicit zero, no barcode or authority',()=>{
 const x={name:'Fixture',brand:'',servingAmount:'20',servingUnit:'g',calories:'60',protein:'0',carbs:'4',fats:'4.5',fiber:'0'};
 const p=manualRecoveryProduct(x);assert.equal(p.nutriments['energy-kcal_100g'],300);assert.equal(p.nutriments.fat_100g,22.5);assert.equal(p.nutriments.fiber_100g,0);assert.equal(p.code,'');assert.equal(p._source,undefined);
 assert.equal(manualRecoveryProduct({...x,fiber:'0'}).nutriments.fiber_100g,0);
 for(const bad of [{fiber:''},{servingAmount:'0'},{calories:'0x10'},{calories:'9'.repeat(308),servingAmount:'0.01'},{calories:'NaN'},{protein:''},{fats:'-1'},{servingUnit:'cup'}])assert.equal(manualRecoveryProduct({...x,...bad}),null);
});
test('manual preserves diary, plan, builder and library context without stale data',()=>{
 for(const context of [{mode:'diary',meal:'lunch',date:'2026-11-06'},{mode:'meal-plan',planId:'plan',meal:'dinner'},{mode:'mymeal',context:'my_meals_builder',mealId:'draft'},{mode:'library'}])assert.deepEqual(recoveryRouteContext({...context,barcode:'123',offData:'stale',food_item_id:'old'}),context);
 const source=read('app/my-foods-create.tsx');const branch=source.slice(source.indexOf('if(recoveryManual) {'),source.indexOf('// ── MODE: mymeal'));
 assert.match(branch,/recoveryRouteContext\(params\)/);assert.match(branch,/router.replace/);assert.doesNotMatch(branch,/log_food|addToDraft|verified|barcode/);
});
test('front capability gated, same candidates, unavailable session honest, manual last',()=>{
 const s=read('components/BarcodeRecoveryScreen.tsx'),r=read('app/food-photo-capture.tsx');
 assert.match(r,/enabled===true&&unknownEnabled/);assert.match(r,/params.type==='new_product'/);
 assert.match(s,/request_id:a.requestId/);assert.match(s,/session:review.session,photo_label_url:url/);
 assert.match(s,/rear photo cannot be analyzed/);assert.match(s,/kind==='front'\?'unavailable':'manual'/);
 assert.match(s,/usableCandidates.map/);assert.match(s,/confirmations:\{identity:true,serving:true,nutrition:true,shared:true\}/);
 assert.match(s,/if\(!active\(\)\)return/);assert.match(s,/setReview\(\{\}\);setSelected\(null\);setStage\('front_prompt'\)/);
 assert.match(s,/owner.current!==session.user.id/);assert.match(s,/attempt.current.selected=candidate/);
});

const {packageBarcodeInput}=await import('../utils/packageBarcodeInput.ts');
test('typed package format preserves zeros and rejects malformed codes',()=>{
 for(const value of ['12345678','012345678905','0012345678905','00012345678905'])assert.equal(packageBarcodeInput(' '+value+' '),value);
 for(const value of ['','1234567','123456789','12345678901','123456789012345','1234 5678','01234567890x','1e123456'])assert.equal(packageBarcodeInput(value),null);
});
