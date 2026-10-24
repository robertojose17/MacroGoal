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
