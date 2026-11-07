import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNutritionLabelRead,labelBasisDiagnostics,runTwoReadGate} from '../supabase/functions/vision-nutrition-extract/nutritionReadGate.mjs';
// Manually transcribed from the user-provided physical-label pixels, not a model response.
const header='Amount per serving / Cantidad por ración';
function fixture(){
 const row=(value,label,unit='g')=>({value,unit,row_label:label,column_header:header,printed_text:label+' '+value+(unit==='g'?'g':'')});
 return {readability:'clear',ambiguous:false,confidence:'high',match:true,product_name:'Coconut Snacks',brand:'Dulzura',selected_column_header:header,selected_basis:'per_serving',detected_columns:[header],serving_size_g:16,serving_quantity:'1 unit/unidad (16g)',serving_size_evidence:'Serving size/ Tamaño servicio 1 unit/unidad (16g)',serving_mass_basis:'label_grams',nutrients:{calories:row(60,'Calories / Calorías','kcal'),fat:row(2.5,'Total Fat / Grasas Totales'),carbs:row(13,'Total Carb./Carbohidrato Total'),protein:row(0,'Protein/Proteína'),fiber:row(0,'Dietary Fiber/Fibra Dietaria')}};
}
import {servingAssociation} from '../supabase/functions/vision-nutrition-extract/serving-association.mjs';
import {sourceLabelDiagnostics} from '../supabase/functions/vision-nutrition-extract/recovery-discovery.ts';
const declarations=['Serving size:1 unit (16g)','Serving size: 1 unit (16g)','Serving size 1 unit/unidad (16g)','Tamaño de porción: 1 unidad (16g)','Tamaño servicio: 1 unidad (16g)','Serving size/Tamaño de porción: 1 unit/unidad (16g)','Tamaño de porción / Serving size: 1 unidad/unit (16g)','Serving size/ Tamaño servicio: 1 unit/unidad (16g)'];
test('complete equivalent declaration prefixes and punctuation preserve two independent reads',async()=>{
 for(const evidence of declarations){const a=fixture(),b={...fixture(),serving_size_evidence:evidence,serving_quantity:'1 unidad'};const before=JSON.stringify(b);const result=await runTwoReadGate(async()=>({result:a,finishReason:'stop'}),async()=>({result:b,finishReason:'stop'}));assert.equal(result.ok,true,evidence);assert.equal(result.servingSize,16);assert.equal(JSON.stringify(b),before);}
});
test('generic counted product portions, not a brand-specific or unit-only rule',()=>{
 for(const [description,quantity] of [['2 bars/barras (30g)','2 barras'],['3 crackers (24g)','3 crackers'],['1 slice/rebanada (28g)','1 rebanada']]){const grams=Number(description.match(/\((\d+)g/)[1]);assert.equal(servingAssociation('Amount per serving',grams,quantity,'Serving size: '+description).ok,true);}
});
test('no missing evidence recovery, preparation stripping, volume inference, contradictions or multi-serving assumptions',()=>{
 for(const patch of [{serving_size_evidence:'1 unit (16g)'},{serving_size_evidence:'Serving size: 1 unit'},{serving_size_evidence:'Serving size: about 1 unit (16g)'},{serving_size_evidence:'Serving size: 1 unit prepared (16g)'},{serving_size_evidence:'Serving size: 1 unit (16ml)'},{serving_size_evidence:'Serving size: 2 servings (16g)'},{serving_size_evidence:'Serving size: 1 unit/unidad (144g)'},{serving_quantity:'2 units'},{serving_quantity:'1 unit (18g)'},{serving_quantity:'1 cup'},{serving_size_g:null},{selected_column_header:'Per 100g'},{selected_column_header:'Per 2 units (16g)'},{selected_column_header:'Per 18g'},{serving_size_evidence:'Serving size/ Tamaño servicio: 1 unit/unidad (16g)',detected_columns:[header,header]}])assert.equal(validateNutritionLabelRead({...fixture(),...patch},{requireProduct:true}).ok,false,JSON.stringify(patch));
 const row=fixture();row.nutrients.fat.column_header='Per 100g';assert.equal(validateNutritionLabelRead(row).ok,false);
});
test('safe categorical reasons survive real recovery sanitizer with no OCR strings',()=>{
 const raw={...fixture(),serving_quantity:'2 units'};const diagnostic=labelBasisDiagnostics(raw);assert.equal(diagnostic.serving_association_reason,'quantity_count_or_unit_mismatch');
 const result=sourceLabelDiagnostics({basis_diagnostics:{primary:diagnostic},issues:[{field:'serving',reason:'basis_unclear'}]});assert.equal(result.basis_diagnostics.primary.serving_association_reason,'quantity_count_or_unit_mismatch');assert.equal(JSON.stringify(result).includes('unit/unidad'),false);
});
test('per100g is not a per-serving column even when declared serving is also100g',()=>{
 const raw=fixture();raw.serving_size_g=100;raw.serving_quantity='1 unit';raw.serving_size_evidence='Serving size: 1 unit (100g)';raw.selected_column_header='Per 100g';raw.detected_columns=['Per 100g'];for(const n of Object.values(raw.nutrients))n.column_header='Per 100g';assert.equal(validateNutritionLabelRead(raw).ok,false);
});
test('independent package proof retains preexisting single-package path',()=>{
 const raw=fixture();raw.serving_quantity='1 package';raw.serving_mass_basis='single_package_net_weight';raw.package_evidence={same_package:true,identity_confidence:'high',multipack:false,preparation:'as_sold',front_product_name:'Coconut Snacks',front_brand:'Dulzura',same_package_evidence:'same package',serving_size_text:'Serving size 1 package',servings_per_container_text:'1 serving per container',net_weight_g:16,net_weight_text:'Net weight 16g'};assert.equal(validateNutritionLabelRead(raw,{requireProduct:true}).ok,true);
});
test('existing complete quantity declarations and single-count headers remain compatible',()=>{
 for(const q of ['1 slice','Serving size 1 slice (28g)','Serving size: 1 slice (28g)'])for(const h of ['Serving','Per serving','Per 1 slice','Per 28g','Per slice'])assert.equal(servingAssociation(h,28,q,'Serving size 1 slice (28g)').ok,true,q+' / '+h);
 assert.equal(servingAssociation('Per slice',28,'2 slices','Serving size 2 slices (28g)').ok,false);
 assert.equal(servingAssociation('Per serving',28,'Serving size 1 slice (30g)','Serving size 1 slice (28g)').ok,false);
});
test('legacy shorthand pair remains comparable when only one declaration has full proof',async()=>{
 const a=fixture(),b=fixture();for(const r of [a,b]){r.serving_size_g=28;r.serving_quantity='1 slice';}a.serving_size_evidence='1 slice (28g)';b.serving_size_evidence='Serving size 1 slice (28g)';const result=await runTwoReadGate(async()=>({result:a,finishReason:'stop'}),async()=>({result:b,finishReason:'stop'}));assert.equal(result.ok,true);
});
