import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNutritionLabelRead,labelBasisDiagnostics,runTwoReadGate} from '../supabase/functions/vision-nutrition-extract/nutritionReadGate.mjs';
// Manually transcribed from the user-provided physical-label pixels, not a model response.
const header='Amount per serving / Cantidad por ración';
function fixture(){
 const row=(value,label,unit='g')=>({value,unit,row_label:label,column_header:header,printed_text:label+' '+value+(unit==='g'?'g':'')});
 return {readability:'clear',ambiguous:false,confidence:'high',match:true,product_name:'Coconut Snacks',brand:'Dulzura',selected_column_header:header,selected_basis:'per_serving',detected_columns:[header],serving_size_g:16,serving_quantity:'1 unit/unidad (16g)',serving_size_evidence:'Serving size/ Tamaño servicio 1 unit/unidad (16g)',serving_mass_basis:'label_grams',nutrients:{calories:row(60,'Calories / Calorías','kcal'),fat:row(2.5,'Total Fat / Grasas Totales'),carbs:row(13,'Total Carb./Carbohidrato Total'),protein:row(0,'Protein/Proteína'),fiber:row(0,'Dietary Fiber/Fibra Dietaria')}};
}
test('literal full printed bilingual heading and calorie row pass without altering printed amounts',()=>{
 const raw=fixture();assert.equal(validateNutritionLabelRead(raw,{requireProduct:true}).ok,true);
 assert.deepEqual(labelBasisDiagnostics(raw),{basis:'per_serving',mass_basis:'label_grams',column_count:1,has_mass:true,mass_from_declared_line:false,mass_value_type:'number',package_proof_valid:false,selected_header_present:true,serving_header_association:true});
});
test('same bilingual label with one-language calorie evidence passes all nutrition checks',()=>{
 const raw=fixture();raw.nutrients.calories.printed_text='Calories 60';const result=validateNutritionLabelRead(raw,{requireProduct:true});assert.equal(result.ok,true);assert.equal(result.reading.servingSize,16);assert.equal(result.reading.nutrients.fat.value,2.5);
});
test('missing or non-serving heading reproduces exact live reason with same safe diagnostics',()=>{
 for(const selected_column_header of ['', 'Amount']){const raw={...fixture(),selected_column_header};assert.deepEqual(validateNutritionLabelRead(raw,{requireProduct:true}).issues,[{field:'serving',reason:'basis_unclear'}]);assert.equal(labelBasisDiagnostics(raw).has_mass,true);}
});

test('bilingual counted headers require exact declaration, count, quantity and grams',()=>{
 for(const header of ['1 unit/unidad (16g)','Per 1 unit/unidad (16g)']){
  const raw=fixture();raw.selected_column_header=header;raw.detected_columns=[header];for(const row of Object.values(raw.nutrients))row.column_header=header;
  assert.equal(validateNutritionLabelRead(raw,{requireProduct:true}).ok,true);
  for(const patch of [{serving_size_g:18},{serving_quantity:'2 unit/unidad (16g)'},{serving_size_evidence:'Serving size/ Tamaño servicio 2 unit/unidad (16g)'},{serving_quantity:'1 cup (16ml)'},{serving_size_evidence:'Serving size/ Tamaño servicio 1 unit/unidad (18g)'},{selected_column_header:'Per 2 unit/unidad (16g)'},{selected_column_header:'Per 1 unit/unidad (18g)'},{selected_column_header:''}])assert.equal(validateNutritionLabelRead({...raw,...patch},{requireProduct:true}).ok,false);
 }
 for(const patch of [{serving_quantity:'2 unit/unidad (16g)'},{serving_size_g:18}])assert.equal(validateNutritionLabelRead({...fixture(),...patch},{requireProduct:true}).ok,false);
});
test('bilingual calories reject competing values, qualifiers, wrong nutrients, ranges and wrong amount',()=>{
 for(const text of ['Calories / Calorías 60 120','Calories / Calorías <60','Calories / Calorías 60-120','Calories / Calorías about 60','Calories / Grasa 60','Calories / Calorías 61','Calories / Calorías 60 / 120','Calories / Calorías 60g']){
  const raw=fixture();raw.nutrients.calories.printed_text=text;assert.equal(validateNutritionLabelRead(raw,{requireProduct:true}).ok,false,text);
 }
});
test('two independent reads remain required and disagreement never confirms',async()=>{
 const raw=fixture();let calls=0;const result=await runTwoReadGate(async()=>{calls++;return {result:raw,finishReason:'stop'}},async()=>{calls++;return {result:structuredClone(raw),finishReason:'stop'}});assert.equal(result.ok,true);assert.equal(calls,2);assert.equal(result.servingSize,16);assert.equal(result.nutrition.calories,60);assert.equal(result.nutrition.fat,2.5);
 const other=structuredClone(raw);other.nutrients.calories.value=61;other.nutrients.calories.printed_text='Calories / Calorías 61';const fail=await runTwoReadGate(async()=>({result:raw,finishReason:'stop'}),async()=>({result:other,finishReason:'stop'}));assert.equal(fail.ok,false);assert.equal(fail.issues[0].reason,'reads_disagree');
});

test('new grammar does not infer grams, accept volume, cross-column evidence or different read counts',async()=>{
 for(const patch of [{serving_size_g:null},{serving_size_g:undefined},{serving_quantity:'1 unit/unidad (16ml)'},{selected_column_header:'Per 100g',selected_basis:'per_serving'},{selected_column_header:'Per 1 unit/unidad (16ml)'}])assert.equal(validateNutritionLabelRead({...fixture(),...patch},{requireProduct:true}).ok,false);
 const crossed=fixture();crossed.detected_columns.push('Per 2 units');crossed.nutrients.carbs.column_header='Per 2 units';assert.equal(validateNutritionLabelRead(crossed,{requireProduct:true}).ok,false);
 const a=fixture(),b=fixture();b.serving_quantity='2 unit/unidad (16g)';b.serving_size_evidence='Serving size/ Tamaño servicio 2 unit/unidad (16g)';const result=await runTwoReadGate(async()=>({result:a,finishReason:'stop'}),async()=>({result:b,finishReason:'stop'}));assert.equal(result.ok,false);
 const reverse=fixture();reverse.nutrients.calories.printed_text='Calorías / Calories 60';assert.equal(validateNutritionLabelRead(reverse,{requireProduct:true}).ok,true);
});
test('header diagnostics distinguish absence from mismatch and sanitize downstream',async()=>{
 const {sourceLabelDiagnostics}=await import('../supabase/functions/vision-nutrition-extract/recovery-discovery.ts');
 for(const [header,present,association] of [['',false,false],['Amount',true,false],['Amount per serving / Cantidad por ración',true,true]]){
  const raw={...fixture(),selected_column_header:header};const d=labelBasisDiagnostics(raw);assert.equal(d.selected_header_present,present);assert.equal(d.serving_header_association,header?association:null);
  const safe=sourceLabelDiagnostics({basis_diagnostics:{primary:d}}).basis_diagnostics.primary;assert.equal(safe.selected_header_present,present);assert.equal(safe.serving_header_association,header?association:null);
 }
 const unsafe=sourceLabelDiagnostics({basis_diagnostics:{primary:{selected_header_present:'raw text',serving_header_association:'raw header'}}}).basis_diagnostics.primary;assert.equal(unsafe.selected_header_present,null);assert.equal(unsafe.serving_header_association,null);
});
