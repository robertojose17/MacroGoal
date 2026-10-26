import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import {validateNutritionLabelRead,runTwoReadGate,readableLabelEvidence} from '../supabase/functions/vision-nutrition-extract/nutritionReadGate.mjs';
import {smartLabelProduct,smartLabelNutrition} from '../supabase/functions/vision-nutrition-extract/smartlabel-source.mjs';
import {discoverProducts,parseProductPage,productPageURL} from '../supabase/functions/vision-nutrition-extract/recovery-discovery.ts';
import {candidateEligible,confirmationPayload} from '../supabase/functions/vision-nutrition-extract/recovery-contract.mjs';
registerHooks({resolve(specifier,context,next){return next(specifier==='@/utils/stringUtils'?new URL('../utils/stringUtils.ts',import.meta.url).href:specifier,context);}});
const {buildSyntheticOffData}=await import('../utils/servingParser.ts');
const barcode='0028400002912',url='https://smartlabel.pepsico.info/028400002912-0014-en-US/index.html';
const page=fs.readFileSync(new URL('./fixtures/pepsico-smartlabel-product.html',import.meta.url),'utf8');
const fragment=fs.readFileSync(new URL('./fixtures/pepsico-smartlabel-nutrition.html',import.meta.url),'utf8');
const macros={calories:230,protein:3,carbs:23,fat:15,fiber:2};
function packageRead(){
 const labels={calories:'Calories',protein:'Protein',carbs:'Total Carbohydrate',fat:'Total Fat',fiber:'Dietary Fiber'};
 return {readability:'clear',ambiguous:false,product_name:'Ruffles Cheddar & Sour Cream',brand:'Ruffles',confidence:'high',match:true,
 selected_basis:'per_serving',selected_column_header:'Amount per serving',detected_columns:['Amount per serving'],serving_quantity:'1 package',serving_size_g:42.5,serving_size_evidence:'Serving size 1 package',serving_mass_basis:'single_package_net_weight',
 package_evidence:{serving_size_text:'Serving size 1 package',servings_per_container_text:'1 serving per container',net_weight_text:'NET WT 1½ OZ (42.5 g)',net_weight_g:42.5,front_product_name:'Cheddar & Sour Cream',front_brand:'Ruffles',same_package:true,identity_confidence:'high',same_package_evidence:'Same Ruffles variant and package design on both photos',multipack:false,preparation:'not_applicable'},
 nutrients:Object.fromEntries(Object.entries(macros).map(([k,value])=>[k,{value,unit:k==='calories'?'kcal':'g',row_label:labels[k],column_header:'Amount per serving',printed_text:labels[k]+' '+value+(k==='calories'?'':' g')}]))};
}
test('two independent photos establish explicit one-package 42.5g with actual Amount per serving wording',async()=>{
 let calls=0;const read=async()=>{calls++;return {finishReason:'stop',result:packageRead()};};
 const result=await runTwoReadGate(read,read);assert.equal(result.ok,true);assert.equal(calls,2);assert.equal(result.servingSize,42.5);assert.deepEqual(result.nutrition,macros);assert.equal(result.servingMassBasis,'single_package_net_weight');
 assert.equal(result.basis_diagnostics.independent.package_proof_valid,true);
 assert.deepEqual(readableLabelEvidence(packageRead()).nutrition,macros);
});
test('front mass never authorizes multiple servings, multipacks, approximate counts or uncertain identity',()=>{
 for(const change of [{servings_per_container_text:'2 servings per container'},{servings_per_container_text:'About 1 serving per container'},{multipack:true},{multipack:null},{same_package:false},{identity_confidence:'low'},{front_brand:''},{net_weight_g:85},{net_weight_text:'NET WT 2 x 42.5 g'},{serving_size_text:'1 oz'},{preparation:'unclear'}]){
  const read=packageRead();Object.assign(read.package_evidence,change);assert.equal(validateNutritionLabelRead(read).ok,false,JSON.stringify(change));assert.equal(readableLabelEvidence(read),null);
 }
 const dual=packageRead();dual.detected_columns.push('Per 100 g');assert.equal(validateNutritionLabelRead(dual).ok,false);
});
test('independent package proof must agree, without replacing missing/contradictory values',async()=>{
 for(const change of [{front_product_name:'Original'},{net_weight_g:85},{servings_per_container_text:'2 servings per container'}]){
  const second=packageRead();Object.assign(second.package_evidence,change);
  const result=await runTwoReadGate(async()=>({finishReason:'stop',result:packageRead()}),async()=>({finishReason:'stop',result:second}));assert.equal(result.ok,false);assert.equal(result.calls,2);
 }
 const read=packageRead();read.serving_size_g=null;assert.equal(validateNutritionLabelRead(read).issues[0].field,'serving_g');
 const basis=packageRead();basis.selected_column_header='Per 100 g';assert.equal(validateNutritionLabelRead(basis).issues[0].field,'serving');
 const prepared=packageRead();prepared.package_evidence.preparation='unclear';assert.equal(validateNutritionLabelRead(prepared).issues[0].field,'preparation');
});
test('both recovery and legacy independent calls receive front and label; no first-read values are supplied',()=>{
 const source=fs.readFileSync(new URL('../supabase/functions/vision-nutrition-extract/index.ts',import.meta.url),'utf8');
 assert.match(source,/callIndependentLabelRead\(labelData,frontData,signal/);assert.match(source,/callIndependentLabelRead\(labelDataUri, frontDataUri, signal/);
 const body=source.slice(source.indexOf('async function callIndependentLabelRead'),source.indexOf('async function requestVision'));
 assert.match(body,/url: frontDataUri/);assert.match(body,/url: labelDataUri/);assert.doesNotMatch(body,/first\.result|primaryResult/);
});
test('official SmartLabel binds printed UPC, one package mass and one nutrition panel without inferring GTIN',()=>{
 const product=smartLabelProduct(page,url),nutrition=smartLabelNutrition(fragment,product);
 assert.equal(product.row.gtin,'028400002912');assert.equal(nutrition.servingSize,'1 Package (42.5 g)');
 const [row]=parseProductPage(page,url,barcode,true,{...product.row,nutrition,_smartlabel:true});
 assert.deepEqual(row.nutrition,macros);assert.equal(candidateEligible(row,barcode),true);assert.equal(row.provenance.basis,'single_product_smartlabel_panel');
 const [other]=parseProductPage(page,url,'0810934030123',true,{...product.row,nutrition,_smartlabel:true});assert.equal(other.barcode_evidence,'conflicting');assert.equal(candidateEligible(other,'0810934030123'),false);
 assert.equal(smartLabelProduct(page.replace('028400002912</div>','028400689373</div>'),url),null);
 assert.equal(smartLabelNutrition(fragment.replace('1 Serving Per Container','2 Servings Per Container'),product),null);
 assert.equal(smartLabelNutrition(fragment.replace('</select>','<option>Per 100 g</option></select>'),product),null);
 assert.equal(smartLabelNutrition(fragment.replace('23 g','23 g 55 g'),product),null);
});
test('discovery fetches only cited page and bound same-directory fragment; host diagnostics omit path/query',async()=>{
 const product=smartLabelProduct(page,url),calls=[];
 const result=await discoverProducts({barcode,name:'Ruffles',brand:'Ruffles'},{apiKey:'offline',fetch:async(input)=>{
  calls.push(String(input));if(String(input).includes('openrouter.ai'))return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({urls:[url]}),annotations:[{url_citation:{url}}]}}]}));
  assert.ok(input===url||input===product.fragmentURL);return new Response(input===url?page:fragment,{headers:{'content-type':'text/html'}});
 }});
 assert.equal(calls.length,3);assert.equal(result.candidates.length,1);assert.equal(candidateEligible(result.candidates[0],barcode),true);
 assert.ok(result.diagnostics.every(d=>d.host==='smartlabel.pepsico.info'));assert.ok(!JSON.stringify(result.diagnostics).includes('/028400'));
 assert.equal(productPageURL('https://smartlabel.pepsico.info.evil.example/'),null);assert.equal(productPageURL('https://127.0.0.1/'),null);
});
test('cached serving and genuine 100g lookups both render correct 42.5g package, including repeat scan',()=>{
 const source=fs.readFileSync(new URL('../app/barcode-scanner.tsx',import.meta.url),'utf8');assert.match(source,/macros_per: result\.item\?\.macros_per \?\? '100g'/);assert.doesNotMatch(source,/macros_per: '100g'/);
 for(const basis of ['serving','100g']){
  const scale=basis==='serving'?1:100/42.5;
  const item={name:'Ruffles',serving_size:42.5,macros_per:basis,...Object.fromEntries(Object.entries(macros).map(([k,v])=>[k,v*scale]))};
  for(let scan=0;scan<2;scan++){
   const off=buildSyntheticOffData({...item,macros_per:item.macros_per??'100g'});
   assert.ok(Math.abs(off.nutriments['energy-kcal_100g']*0.425-230)<1e-8);assert.ok(Math.abs(off.nutriments.fat_100g*0.425-15)<1e-8);assert.equal(off.serving_quantity,42.5);
  }
 }
});

test('validated package proof survives signed-confirmation payload and existing per-serving cache representation',async()=>{
 const result=await runTwoReadGate(async()=>({finishReason:'stop',result:packageRead()}),async()=>({finishReason:'stop',result:packageRead()}));
 const candidate={name:result.productName,brand:result.brand,variant:result.productName,barcode,validated:true,serving_g:result.servingSize,serving:result.servingQuantity,nutrition:result.nutrition,provenance:{kind:'physical_label',serving_mass_basis:result.servingMassBasis}};
 const payload=confirmationPayload(candidate,{barcode},{identity:true,serving:true,nutrition:true,shared:true});
 assert.equal(payload.serving_size,42.5);assert.equal(payload.calories,230);assert.equal(payload.provenance.serving_mass_basis,'single_package_net_weight');
 const cached=buildSyntheticOffData({...payload,macros_per:'serving'});
 assert.ok(Math.abs(cached.nutriments['energy-kcal_100g']*cached.serving_quantity/100-230)<1e-8);
 // The production RPC already persists this same per-serving contract; no migration is needed.
});

test('SmartLabel rejects multipack identity/header even when the panel says one package',()=>{
 for(const name of ['Multipack (2 bags)','Ruffles 2 bags','Ruffles 2-pack','Ruffles Variety Pack']){
  const modified=page.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i,'$1'+name+'$2').replace('42.5 g','85 g');
  const product=smartLabelProduct(modified,url);assert.ok(product);assert.equal(smartLabelNutrition(fragment,product),null,name);
 }
 const headerOnly='<header><div>Multipack (2 bags)</div>'+page+'</header>';
 assert.equal(smartLabelNutrition(fragment,smartLabelProduct(headerOnly,url)),null);
});
test('SmartLabel rejects conflicting, repeated or approximate servings-per-container evidence',()=>{
 const product=smartLabelProduct(page,url);
 for(const extra of ['<p>2 Servings Per Container</p>','<div>2 Servings Per Container</div>','<p>1 Serving Per Container</p>','<p>About 2 Servings Per Container</p>']){
  assert.equal(smartLabelNutrition(fragment+extra,product),null,extra);
 }
 assert.equal(smartLabelNutrition(fragment.replace('1 Serving Per Container','About 1 Serving Per Container'),product),null);
 assert.equal(smartLabelNutrition(fragment,product).servingSize,'1 Package (42.5 g)');
});
