import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNutritionLabelRead,labelBasisDiagnostics,runTwoReadGate} from '../supabase/functions/vision-nutrition-extract/nutritionReadGate.mjs';
// Manually transcribed from the user-provided physical-label pixels, not a model response.
const header='Amount per serving / Cantidad por ración';
function fixture(){
 const row=(value,label,unit='g')=>({value,unit,row_label:label,column_header:header,printed_text:label+' '+value+(unit==='g'?'g':'')});
 return {readability:'clear',ambiguous:false,confidence:'high',match:true,product_name:'Coconut Snacks',brand:'Dulzura',selected_column_header:header,selected_basis:'per_serving',detected_columns:[header],serving_size_g:16,serving_quantity:'1 unit/unidad (16g)',serving_size_evidence:'Serving size/ Tamaño servicio 1 unit/unidad (16g)',serving_mass_basis:'label_grams',nutrients:{calories:row(60,'Calories / Calorías','kcal'),fat:row(2.5,'Total Fat / Grasas Totales'),carbs:row(13,'Total Carb./Carbohidrato Total'),protein:row(0,'Protein/Proteína'),fiber:row(0,'Dietary Fiber/Fibra Dietaria')}};
}
const quantityVariants=['1 unit (16g)','1 unit','1 unidad (16g)','1 unit/unidad'];
test('four pre-v48 valid quantity forms regain acceptance with explicit authoritative16g',()=>{
 for(const serving_quantity of quantityVariants){const raw={...fixture(),serving_quantity};raw.nutrients.calories.printed_text='Calories 60';
  assert.equal(validateNutritionLabelRead(raw,{requireProduct:true}).ok,true,serving_quantity+' repaired');
 }
});
test('equivalent quantity language/suffix forms agree across independent reads without mass inference',async()=>{
 for(const serving_quantity of quantityVariants)for(const reverse of [false,true]){let a=fixture(),b={...fixture(),serving_quantity};if(reverse)[a,b]=[b,a];let calls=0;
  const r=await runTwoReadGate(async()=>{calls++;return {result:a,finishReason:'stop'}},async()=>{calls++;return {result:b,finishReason:'stop'}});
  assert.equal(r.ok,true,serving_quantity);assert.equal(calls,2);assert.equal(r.servingSize,16);assert.equal(r.nutrition.fat,2.5);
 }
});
test('quantity shorthand requires full declaration grams and rejects conflicting mass, count, volume or units',()=>{
 for(const serving_quantity of ['2 units','2 unit','2 unidad (16g)','2 unit/unidad','1 unit (18g)','1 unidad (144g)','1 unit (16ml)','1 cup','1 unit/unidad (18g)'])assert.equal(validateNutritionLabelRead({...fixture(),serving_quantity},{requireProduct:true}).ok,false,serving_quantity);
 for(const serving_quantity of quantityVariants)for(const patch of [{serving_size_g:null},{serving_size_g:undefined},{serving_size_g:18},{serving_size_g:144},{serving_size_evidence:'Serving size/ Tamaño servicio 1 unit/unidad'},{serving_size_evidence:'Serving size/ Tamaño servicio 2 unit/unidad (16g)'},{serving_size_evidence:'Serving size/ Tamaño servicio 1 unit/unidad (16ml)'}])assert.equal(validateNutritionLabelRead({...fixture(),serving_quantity,...patch},{requireProduct:true}).ok,false);
});
test('counted bilingual header keeps the same declaration binding with shorthand quantity',()=>{
 for(const serving_quantity of quantityVariants){const raw={...fixture(),serving_quantity,selected_column_header:'Per 1 unit/unidad (16g)',detected_columns:['Per 1 unit/unidad (16g)']};for(const n of Object.values(raw.nutrients))n.column_header=raw.selected_column_header;assert.equal(validateNutritionLabelRead(raw,{requireProduct:true}).ok,true);assert.equal(validateNutritionLabelRead({...raw,selected_column_header:'Per 2 unit/unidad (16g)'},{requireProduct:true}).ok,false);}
});
test('every equivalent bare unit language pair agrees and input evidence remains untouched',async()=>{
 const variants=[...quantityVariants,'1 unit/unidad (16g)'];
 for(const left of variants)for(const right of variants){const a={...fixture(),serving_quantity:left},b={...fixture(),serving_quantity:right};const before=JSON.stringify([a,b]);const r=await runTwoReadGate(async()=>({result:a,finishReason:'stop'}),async()=>({result:b,finishReason:'stop'}));assert.equal(r.ok,true,left+' vs '+right);assert.equal(r.servingSize,16);assert.equal(JSON.stringify([a,b]),before);}
 for(const serving_quantity of ['1 unit prepared','1 unidad cooked (16g)','1 unit (16 g) as sold','1 piece (16g)','1 unidad (1 oz)','1 unit or 2 units'])assert.equal(validateNutritionLabelRead({...fixture(),serving_quantity},{requireProduct:true}).ok,false);
});
