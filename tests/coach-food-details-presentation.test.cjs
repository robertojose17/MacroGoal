const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS}),f);
const {coachFoodDetailsPresentation:p,coachDisplayServingOptions:options}=require('../utils/coachFoodDetailsPresentation');
test('Coach estimate moves narrative to details without changing original serving arithmetic or source object',()=>{
 const raw='ESTIMATE | 1 x chicken, rice, salad | source | assumptions';const source=[{key:'default',label:raw,gramsPerUnit:400},{key:'g',label:'1 g',gramsPerUnit:1}];
 const before=JSON.stringify(source),shown=options(source,'default',p(raw,false));assert.equal(shown.length,1);assert.equal(shown[0].label,'1 serving');assert.equal(shown[0].gramsPerUnit,400);assert.equal(JSON.stringify(source),before);assert.equal(p(raw,false).description,'1 x chicken, rice, salad | source | assumptions');assert.equal(p('1 estimated portion (400 g)',true).label,'1 porción');
});
test('ordinary foods and source-reported serving choices are unchanged',()=>{const source=[{key:'g',label:'1 g'}];for(const desc of ['1 cup (240 g)','SOURCE-REPORTED | rice','Estimated homemade soup',undefined]){assert.equal(p(desc,false),null);assert.equal(options(source,'g',p(desc,false)),source);}});

 test('legacy Coach narrative hides only appended generic 100g basis, preserving actual portions and calculation inputs',()=>{
  const raw='1 ESTIMATE | 6 oz chicken + 1 cup rice + 1 cup salad | estimated ingredients (100g)';
  for(const es of [false,true])assert.equal(p(raw,es).description,'6 oz chicken + 1 cup rice + 1 cup salad | estimated ingredients');
  assert.equal(p('ESTIMATE | 100g chicken with rice (100 g)',false).description,'100g chicken with rice');
  assert.equal(p('1 estimated portion (100 g)',false).description,'1 estimated portion (100 g)');
  assert.equal(p('ESTIMATE | one plate (400 g)',false).description,'one plate (400 g)');
  assert.equal(p('1 chicken serving (100g)',false),null);
  const source=[{key:'default',label:raw,gramsPerUnit:100}],before=JSON.stringify(source);
  assert.equal(options(source,'default',p(raw,false))[0].gramsPerUnit,100);assert.equal(JSON.stringify(source),before);
 });

 test('actual Coach save and existing Food Details builder retain estimate Details from the original saved description',()=>{
  const path=require('node:path'),{coachCatalogDiaryPayload,coachCatalogPreview}=require('../utils/coachCatalogIdentity');
  const entry={owner:'11111111-1111-4111-8111-111111111111',date:'2026-10-24',meal:'lunch',authority:'user_edited',nutrition:{calories:436.5,protein:38.6,carbs:58.1,fats:4.5,fiber:3.1}};
  const consent={name:'Chicken with rice and raw broccoli',grams:385,massAuthority:'estimated',massBasis:'Confirmed whole meal',massAcknowledged:true,publicAcknowledged:true};
  const payload=coachCatalogDiaryPayload(entry,consent,'22222222-2222-4222-8222-222222222222'),food=coachCatalogPreview(entry,consent);
  const file=path.resolve(__dirname,'../components/FoodDetailsLayout.tsx'),screen=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,screen,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let builder;
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='buildMockProductFromFoods')builder=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(builder);
  const js=ts.transpile('module.exports = '+builder,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),m={exports:{}};new Function('module',js)(m);
  const product=m.exports(food,{serving_description:payload.p_serving_description,quantity:1,gramsPerUnit:385});assert.equal(product.serving_size,'1 1 estimated portion (385 g) (385g)');assert.equal(p(product.serving_size,false),null);
  const details=p(payload.p_serving_description,false)??p(product.serving_size,false);assert.equal(details.label,'1 serving');assert.equal(details.description,'1 estimated portion (385 g)');assert.match(details.note,/Estimation/);
  assert.equal(payload.p_calories,436.5);assert.equal(payload.p_grams,385);assert.equal(payload.p_quantity,1);assert.equal(product.serving_quantity,385);assert.equal(product.nutriments['energy-kcal_100g']*385/100,436.5);
  assert.match(screen,/mode==='edit'&&savedCoachServing\?\.itemId===itemId/);assert.match(screen,/setSavedCoachServing\(\{itemId:itemId!,description:typeof mealItem.serving_description==='string'\?mealItem.serving_description:null\}\)/);
  assert.ok(screen.indexOf('{coachDetails && <View')>screen.indexOf("{t('foodDetails.nutritionFacts')}"));
  assert.equal(p('1 portion (385 g)',false),null);assert.equal(p(null,false),null);
 });
