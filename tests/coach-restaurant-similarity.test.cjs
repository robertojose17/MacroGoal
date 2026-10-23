const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);
const root=process.env.COACH_SOURCE||path.join(__dirname,'../supabase/functions/ai-coach');
const {validateDishEvidence}=require(path.join(root,'coach-dish-evidence.ts')),{discoveryRowsFromEvidence,projectDiscoveryOptions}=require(path.join(root,'coach-model-led-contract.ts')),{ownedDiscoveryMeals}=require(path.join(root,'discovery-meals.ts')),{allowedEvidenceURL,attachPageEvidence}=require(path.join(root,'coach-source-pages.ts')),{safeCitationURL}=require(path.join(root,'coach-sources.ts')),{constrainMeals,dietaryConstraints}=require(path.join(root,'dietary-constraints.ts'));
const url='https://www.public-bistro.com/menu/chicken',food='grilled chicken, rice and vegetables',date='2026-10-23T00:00:00Z';
function message(name='Chicken Plate',content='Chicken Plate: fried chicken with potatoes'){return {content:JSON.stringify({dishes:[{name,url}]}),annotations:[{type:'url_citation',url_citation:{url,title:name,content}}]};}
function project(e){const {rows,trustedIds}=discoveryRowsFromEvidence(e,[]),bindings={};const options=projectDiscoveryOptions(rows,'22222222-2222-4222-8222-222222222222',trustedIds,bindings);return ownedDiscoveryMeals({discovery_options:options,discovery_option_bindings:bindings});}
test('actual evidence to private binding to import retains similar dish differences and unknown nutrition',()=>{
 const e=validateDishEvidence(message(),date,{sourceKind:'menu',food,allowSimilar:true});a.equal(e.candidates.length,1);a.equal(e.candidates[0].nutrition,null);a.equal(e.dishes.length,0);const meals=project(e);a.equal(meals.length,1);a.equal(meals[0].match.kind,'similar');a.ok(meals[0].match.differences.some(x=>x.includes('grilled chicken')));a.ok(meals[0].match.differences.some(x=>x.includes('rice')));a.equal(meals[0].nutrition.authority,'unknown');a.ok(Object.values(meals[0].nutrition.values).every(x=>x===null));a.equal(meals[0].venue,undefined);
 a.equal(constrainMeals(meals,dietaryConstraints({exclusions:['chicken']})).length,0);
});
test('relatedness does not invent identity or borrow neighboring components',()=>{
 a.equal(validateDishEvidence(message('Chocolate Cake','Chocolate Cake: chocolate cake'),date,{sourceKind:'menu',food,allowSimilar:true}).candidates.length,0);
 a.equal(validateDishEvidence(message('Invented Chicken','Unrelated item'),date,{sourceKind:'menu',food,allowSimilar:true}).candidates.length,0);
 const e=validateDishEvidence(message('Chicken Plate','Chicken Plate: chicken; Other bowl: grilled chicken rice vegetables'),date,{sourceKind:'menu',food,allowSimilar:true});a.equal(e.candidates.length,1);a.ok(e.candidates[0].match.differences.some(x=>x.includes('rice')));
 a.equal(validateDishEvidence(message(),date,{sourceKind:'menu',food}).candidates.length,0);
});
test('new-host citation makes zero backend fetches and never promotes snippet macros',async()=>{
 let calls=0;const m=await attachPageEvidence(message('Chicken Plate','Chicken Plate: chicken. 123 calories 50g protein'),async()=>{calls++;throw Error('unexpected fetch');},{});a.equal(calls,0);a.equal(allowedEvidenceURL(url),null);a.equal(safeCitationURL(url),url);const e=validateDishEvidence(m,date,{sourceKind:'menu',food,allowSimilar:true});a.equal(e.candidates[0].nutrition,null);
 for(const u of ['http://public-bistro.com/menu','https://127.0.0.1/menu','https://[::1]/menu','https://169.254.169.254/latest','https://localhost/menu','https://service.internal/menu','https://user:pass@public-bistro.com/menu','https://public-bistro.com:8443/menu'])a.equal(safeCitationURL(u),null,u);
});
test('actual search request drops fixed five-chain filter, retains provider/cost bounds',async()=>{
 const {searchFoodSources}=require(path.join(root,'coach-web-search.ts'));let calls=0,wire;
 const result=await searchFoodSources('public request','22222222-2222-4222-8222-222222222222',{enabled:true,apiKey:'fixture',reserveBudget:async()=>true,intent:{kind:'search',food:'chicken',mode:'restaurant',area:'Orlando, Florida',query:'chicken restaurant Orlando'},fetch:async(u,init)=>{calls++;a.equal(u,'https://openrouter.ai/api/v1/chat/completions');wire=JSON.parse(init.body);return Response.json({id:'gen-fixture',usage:{cost:0.01},choices:[{finish_reason:'stop',message:message()}]});}});
 a.equal(calls,1);a.equal(wire.plugins[0].include_domains,undefined);a.equal(wire.plugins[0].max_results,6);a.equal(wire.provider.allow_fallbacks,false);a.equal(wire.model,'google/gemini-2.5-pro');a.equal(result.reportedCost,0.01);a.equal(result.evidence.candidates.length,1);
});
test('verified lookup projection, personalization, client projection, import and review preserve differences and official nutrition',()=>{
 const {projectLookupOptions,projectCoachResponseForClient}=require(path.join(root,'_shared/coach-recommendation-contract.ts')),{personalizeVerifiedOptions}=require(path.join(root,'coach-meal-personalization.ts')),{reviewMeal}=require(path.join(root,'meal-estimate-review.ts'));
 const match={kind:'similar',requested_food:food,differences:['Requested rice is not established by this item description.']};
 const published='https://www.dairyqueen.com/menu/fixture-chicken',values={calories:400,protein:30,carbs:35,fat:15,fiber:4},basis={amount:250,unit:'g',label:'1 published plate (250 g)'};
 const dish={name:'Chicken Plate',url:published,portion:basis.label,sourceKind:'menu',restaurantName:'Fixture restaurant',nutritionStatus:'verified',itemCompleteness:'complete_menu_item',match,nutrition:{identity:'Chicken Plate',basis,itemIntegrity:'complete',itemAssociation:'menu_item',missing:[],fields:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,unit:k==='calories'?'kcal':'g',source:{url:published}}]))}};
 const options=projectLookupOptions({dishes:[dish]});a.equal(options.length,1);a.deepEqual(options[0].match,match);
 const personalized=personalizeVerifiedOptions(options,{remaining:{calories:800,protein:60,carbs:100,fats:30,fiber:10}},1.5);a.deepEqual(personalized[0].match,match);a.equal(personalized[0].nutrition.calories,400);
 const publicReply=projectCoachResponseForClient({lookup_options:options});a.deepEqual(publicReply.lookup_options[0].match,match);
 const meals=ownedDiscoveryMeals({lookup_options:options});a.equal(meals.length,1);a.deepEqual(meals[0].match,match);a.equal(meals[0].nutrition.authority,'official');a.equal(meals[0].nutrition.values.calories,400);a.equal(meals[0].nutrition.values.fiber,4);
 const review=reviewMeal(meals[0],{servings:1.5,estimate_acknowledged:false,ingredient_review_acknowledged:true});a.deepEqual(review.match,match);a.equal(review.values.calories,600);a.equal(review.original_nutrition.values.calories,400);a.equal(review.physical_portion.total_grams,375);
});
test('composed citation and verified lookup paths retain peanut evidence for dietary exclusion',()=>{
 const e=validateDishEvidence(message('Chicken Plate','Chicken Plate: fried chicken with peanut sauce'),date,{sourceKind:'menu',food,allowSimilar:true});const meals=project(e);a.equal(meals.length,1);a.match(meals[0].dietary_evidence,/peanut sauce/);a.equal(constrainMeals(meals,dietaryConstraints({allergens:['peanuts']})).length,0);
 const {projectLookupOptions}=require(path.join(root,'_shared/coach-recommendation-contract.ts'));const dish={...e.candidates[0],url:'https://www.dairyqueen.com/menu/fixture',portion:'1 plate',nutritionStatus:'verified',itemCompleteness:'complete_menu_item',nutrition:{identity:'Chicken Plate',basis:{amount:1,unit:'serving',label:'1 plate'},itemIntegrity:'complete',itemAssociation:'menu_item',missing:[],fields:Object.fromEntries(Object.entries({calories:400,protein:30,carbs:35,fat:15,fiber:4}).map(([k,value])=>[k,{value}]))}};
 const verified=ownedDiscoveryMeals({lookup_options:projectLookupOptions({dishes:[dish]})});a.equal(verified.length,1);a.match(verified[0].dietary_evidence,/peanut sauce/);a.equal(constrainMeals(verified,dietaryConstraints({allergens:['peanuts']})).length,0);
});
