const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);
const {createMealTransport}=require('../utils/coachMealTransport.ts'),{createMealServices}=require('../utils/coachMealServices.ts'),{editMealNutrition}=require('../utils/coachMealReview.ts');
const input={food_query:'chicken rice',mode:'cook',exclusions:[],allergens:[],preference:'preferred_food'};
const option=(estimated=false,restaurant=false)=>({id:restaurant?'menu-dish':'gallery-one',name:'Chicken and rice',ingredients:restaurant?[]:['chicken','rice'],instructions:restaurant?[]:['Cook chicken and rice.'],prep_minutes:null,provenance:restaurant?{kind:'official',source_url:'https://example.com/menu'}:{kind:'gallery',gallery_id:'gallery-one'},nutrition:{authority:'estimated',basis:{amount:1,unit:'serving',label:estimated?'1 bowl, approximately 350 g':'1 gallery entry; physical serving size unspecified'},values:{calories:500,protein:35,carbs:50,fats:17,fiber:estimated?4:null},assumptions:['Portion size is estimated.'],confidence:'low'},allergy_status:'requires_review',review_required:true});
function fixture(){
 const state={owner:'A',day:'2026-10-22',zone:'America/Puerto_Rico',access:{isPremium:true,premiumLoading:false,gated:false,busy:false},lose:false,deny:false,capabilities:true};
 const rows=new Map(),receipts=new Map(),calls=[],writes=[];let ids=0;
 const store={getItem:async k=>rows.get(k)??null,setItem:async(k,v)=>rows.set(k,v),removeItem:async k=>rows.delete(k)};
 const json=(extra={})=>({schema:'meal_explore_v1',owner:'A',date:'2026-10-22',status:'options',options:[option()],paid_capabilities:{discovery:state.capabilities,estimate:state.capabilities,reason:state.capabilities?null:'pilot_not_enabled',budget_checked:false},...extra});
 const deps={scope:'normal',owner:async()=>state.owner,today:()=>state.day,zone:()=>state.zone,newId:()=>`11111111-1111-4111-8111-${String(++ids).padStart(12,'0')}`,store,invoke:async body=>{
  calls.push(body);if(state.deny)return Response.json({error:'pilot_not_enabled',request_id:body.request_id,admission_state:'not_admitted'},{status:403});
  if(body.intent==='recover_daily'){assert.equal(body.journey,'meal_explore_v1');return Response.json(receipts.get(body.request_id));}
  if(body.operation==='discover'){if(state.lose)throw Error('connection lost');return new Response(`data: ${JSON.stringify({done:true,request_id:body.request_id,usage_status:'completed'})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});}
  let response;
  if(body.operation==='explore')response=json(body.mode==='eat_out'?{status:'discovery_available',options:[],discovery_request:{mode:'restaurant',food:body.food_query,restaurant:body.restaurant}}:{});
  else if(body.operation==='estimate')response=json({options:[option(true,receipts.get(body.source_request_id)?.options?.[0]?.provenance.kind==='official')]});
  else if(body.operation==='import_discovery')response=json({options:[option(false,true)]});
  else if(body.operation==='review'){
   const original=receipts.get(body.source_request_id).options.find(o=>o.id===body.option_id);
   const values=Object.fromEntries(Object.entries(original.nutrition.values).map(([k,v])=>[k,body.edited_values?.[k]??(v===null?null:Math.round(v*body.servings*10)/10)]));
   response=json({status:'review',options:[],review:{option_id:original.id,name:original.name,servings:body.servings,values,authority:body.edited_values?'user_edited':original.nutrition.authority,original_source:original.provenance,original_nutrition:original.nutrition,assumptions:original.nutrition.assumptions,ready_for_explicit_confirmation:Object.values(values).every(v=>v!==null)&&body.estimate_acknowledged&&body.ingredient_review_acknowledged,logged:false}});
  }
  receipts.set(body.request_id,response);if(state.lose)throw Error('connection lost');return Response.json(response);
 }};
 const transport=createMealTransport(deps),services=createMealServices({transport,owner:deps.owner,today:deps.today,store,subscribeInvalidation:()=>()=>{},write:async body=>writes.push(body)});
 return {state,rows,receipts,calls,writes,deps,transport,services,access:()=>state.access,json};
}

test('actual backend imported recipe estimate review recovers with source duration and no new execution',async()=>{
 const path=require('path');if(!process.env.COACH_TIME_BACKEND)throw Error('COACH_TIME_BACKEND must name approved backend artifact');
 const root=path.resolve(process.env.COACH_TIME_BACKEND,'supabase/functions/ai-coach');
 const {ownedDiscoveryMeals}=require(root+'/discovery-meals.ts'),{applyEstimate}=require(root+'/meal-auto-estimate.ts'),{reviewMeal}=require(root+'/meal-estimate-review.ts');
 const url='https://www.foodnetwork.com/recipes/food-network-kitchen/ginger-scallion-chicken-and-rice-22405017',name='Ginger-Scallion Chicken and Rice',id='d-example';
 for(const mutation of ['none','foreign_source','missing_source','wrong_identity','owner','day']){
 const f=fixture(),base=f.deps.invoke;
 const imported=ownedDiscoveryMeals({discovery_options:[{id,name,kind:'recipe'}],discovery_option_bindings:{[id]:{name,kind:'recipe',source_url:url,recipe_total_minutes:20}}})[0];imported.identity.portion_label='one bowl';
 const estimated=applyEstimate(imported,{portion_grams:400,portion_label:'one bowl',values:{calories:500,protein:30,carbs:60,fats:15,fiber:3},assumptions:['Oil quantity is estimated.']});
 f.deps.invoke=async body=>{
  if(body.intent==='recover_daily')return base(body);
  f.calls.push(body);let response;
  if(body.operation==='explore')response=f.json({options:[estimated]});
  else if(body.operation==='review')response=f.json({status:'review',options:[],review:reviewMeal(estimated,body)});
  else throw Error('unexpected dispatch');
  f.receipts.set(body.request_id,response);if(f.state.lose)throw Error('lost acknowledgment');return Response.json(response);
 };
 const found=await f.services.explore(f.access,input,'dinner');assert.equal(found.kind,'ready');const session=f.services.review(found,id,f.access);
 f.state.lose=true;assert.equal(await session.prepare({...editMealNutrition(session.context.option,1,{}),estimateAcknowledged:true,ingredientAcknowledged:true}),null);f.state.lose=false;
 const pending=await f.transport.pending(f.access),review=f.receipts.get(pending.envelope.request_id).review;
 if(mutation==='foreign_source')review.original_source={...review.original_source,source_url:'https://other.com/recipe'};
 if(mutation==='missing_source')delete f.receipts.get(found.requestId).options[0].provenance.source_url;
 if(mutation==='wrong_identity')f.receipts.get(found.requestId).options[0].identity.kind='unverified';
 if(mutation==='owner')f.state.owner='B';if(mutation==='day')f.state.day='2026-10-23';
 const before=f.calls.filter(x=>x.operation).length,result=await f.services.recover(f.access);
 assert.equal(f.calls.filter(x=>x.operation).length,before);assert.equal(f.writes.length,0);
 if(mutation!=='none'){assert.notEqual(result.kind,'recovered_review');continue;}
 assert.equal(result.kind,'recovered_review');assert.equal(result.session.context.option.totalTime.minutes,20);assert.equal(result.session.context.option.nutrition.authority,'estimated');assert.equal(result.session.context.option.provenance.kind,'estimate');assert.equal(result.session.context.sourceReceiptId,found.requestId);
 assert.ok(await result.session.prepare(result.session.initialEdit));assert.equal(f.calls.filter(x=>x.operation).length,before);assert.equal(f.writes.length,0);
 }
});
