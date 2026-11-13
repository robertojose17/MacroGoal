const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');const path=require('node:path');const repo=process.env.BARCODE_TEST_REPO_ROOT || path.resolve(__dirname,'..');const ts=require(require.resolve('typescript',{paths:[repo]}));const module_={exports:{}};const code=ts.transpileModule(fs.readFileSync(repo+'/utils/barcodeSourcePreview.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports:module_.exports});const {barcodeSourcePreview,sourceNutrientRows}=module_.exports;const product={code:'0044000060114',nutrition_data_per:'100g',nutriments:{fat_100g:0,'iron_100g':.004,iron_unit:'mg',carbohydrates_100g:17,carbohydrates_modifier:'~'}};const result={found:true,source:'openfoodfacts_unverified',requires_label_confirmation:true,provider_product:product};
test('UPC alias readonly result accepted',()=>assert.deepEqual(JSON.parse(JSON.stringify(barcodeSourcePreview(result,'044000060114'))),product));
test('mismatched identity refused',()=>assert.equal(barcodeSourcePreview(result,'0078742307305'),null));
test('malformed flag refused',()=>assert.equal(barcodeSourcePreview({...result,requires_label_confirmation:'true'},product.code),null));
test('old endpoint contract fallback',()=>assert.equal(barcodeSourcePreview({...result,provider_product:undefined},product.code),null));
test('canonical result not intercepted',()=>assert.equal(barcodeSourcePreview({...result,source:'supabase'},product.code),null));
test('real zero retained, missing calories null',()=>{let {rows}=sourceNutrientRows(product);assert.equal(rows.find(x=>x.key==='fat').amount,0);assert.equal(rows.find(x=>x.key==='energy-kcal').amount,null)});
test('standard units not provider original input units',()=>{const row=sourceNutrientRows(product).rows.find(x=>x.key==='iron');assert.equal(row.amount,.004);assert.equal(row.unit,'g')});
test('source modifier preserved',()=>assert.equal(sourceNutrientRows(product).rows.find(x=>x.key==='carbohydrates').modifier,'~'));
test('serving source never silently scales',()=>{const r=sourceNutrientRows({...product,nutrition_data_per:'serving',nutriments:{fat_serving:2,fat_100g:10}});assert.equal(r.suffix,'_serving');assert.equal(r.rows.find(x=>x.key==='fat').amount,2)});
test('nonfinite or string values not treated as known',()=>{const r=sourceNutrientRows({...product,nutriments:{fat_100g:Infinity,proteins_100g:'4'}});assert.equal(r.rows.find(x=>x.key==='fat').amount,null);assert.equal(r.rows.find(x=>x.key==='proteins').amount,null)});

const {sourceReadonly,sourceRouteReadonly,sourceDisplayValue,sourceBasis}=module_.exports;
test('null renders absent not zero',()=>assert.equal(sourceDisplayValue(product,'energy-kcal'),'—'));
test('explicit zero renders zero',()=>assert.equal(sourceDisplayValue(product,'fat'),'0 g'));
test('volume not converted into mass',()=>assert.match(sourceBasis({...product,serving_size:'1 tbsp (15 ml)',serving_quantity_unit:'ml'},false),/100 g \/ 100 ml/));
test('declared serving basis stays serving',()=>assert.match(sourceBasis({...product,nutrition_data_per:'serving',serving_size:'1 cup'},false),/Per serving: 1 cup/));
test('marker survives route',()=>assert.equal(sourceRouteReadonly(JSON.stringify({...product,_off_source_readonly:true})),true));
test('normal products remain writable',()=>assert.equal(sourceReadonly(product),false));
test('all write entrypoints guard source marker',()=>{const s=fs.readFileSync(repo+'/components/FoodDetailsLayout.tsx','utf8');for(const name of ['handleSave','handleToggleFavorite','upsertFoodItem'])assert.match(s,new RegExp('const '+name+' = async[^\\{]+\\{\\s*if \\(sourceRouteReadonly'));assert.ok(s.indexOf('if (sourceReadonly(parsedProduct))')<s.indexOf('void captureSelectedNutrition(parsedProduct'));assert.match(s,/disabled=\{providerOnly\}/);});

test('display converts normalized grams to mg not original unit',()=>assert.equal(sourceDisplayValue({...product,nutriments:{iron_100g:0.004,iron_unit:'mg'}},'iron'),'4 mg'));
test('display converts normalized grams to mcg once',()=>assert.equal(sourceDisplayValue({...product,nutriments:{'vitamin-d_100g':0.0000025,'vitamin-d_unit':'mcg'}},'vitamin-d'),'2.5 mcg'));
test('display suppresses floating precision tails',()=>assert.equal(sourceDisplayValue({...product,nutriments:{fat_100g:0.1+0.2}},'fat'),'0.3 g'));
test('qualifiers preserved through unit conversion',()=>assert.equal(sourceDisplayValue({...product,nutriments:{iron_100g:0.004,iron_modifier:'<'}},'iron'),'<4 mg'));
test('unsupported qualifiers are unknown not equality',()=>assert.equal(sourceDisplayValue({...product,nutriments:{fat_100g:2,fat_modifier:'trace'}},'fat'),'—'));
test('coherent numeric grams allow explicit mass label',()=>assert.match(sourceBasis({...product,serving_size:'1 tbsp (21 g)',serving_quantity:21,serving_quantity_unit:'g'},false),/^Per 100 g ·/));
test('contradictory numeric grams remain ambiguous',()=>assert.match(sourceBasis({...product,serving_size:'1 tbsp (21 g)',serving_quantity:15,serving_quantity_unit:'g'},false),/100 g \/ 100 ml/));
test('g token without numeric mass remains ambiguous',()=>assert.match(sourceBasis({...product,serving_size:'g per serving',serving_quantity:15,serving_quantity_unit:'g'},false),/100 g \/ 100 ml/));
test('mixed volume and mass evidence remains ambiguous',()=>assert.match(sourceBasis({...product,serving_size:'15 ml (15 g)',serving_quantity:15,serving_quantity_unit:'g'},false),/100 g \/ 100 ml/));
test('prepared-only nutrition never substituted for as sold',()=>assert.equal(sourceDisplayValue({...product,nutriments:{'energy-kcal_prepared_100g':100}},'energy-kcal'),'—'));
test('incomplete backend record still readonly without invented core',()=>{const raw={...result,provider_product:{code:product.code,nutriments:{'nova-group':4}}};const preview=barcodeSourcePreview(raw,product.code);assert.ok(preview);assert.equal(sourceDisplayValue(preview,'fat'),'—');assert.equal(sourceDisplayValue(preview,'energy-kcal'),'—');});

test('unknown source payloads guarded',()=>{assert.equal(sourceNutrientRows(null).rows.find(row=>row.key==='fat').amount,null);assert.equal(module_.exports.sourceIngredients(null),'');assert.equal(module_.exports.sourceIngredients({ingredients_text:7}),'');assert.equal(module_.exports.sourceIngredients({ingredients_text:'Milk'}),'Milk');});
