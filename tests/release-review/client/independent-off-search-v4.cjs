// Independent V4 offline regression: real merge/build, actual action and render callbacks.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,bind,closure,text,jsx}=require('./independent-off-search-harness.cjs');
const safety=load('utils/searchSelectionSafety.ts'),adapter=load('utils/openFoodFacts.ts'),selection=load('utils/catalogSelection.ts');
const search=load('utils/foodSearchUtils.ts',{'@/lib/supabase/client':{supabase:{}}});
const id='11111111-1111-4111-8111-111111111111';
const nutrients={'energy-kcal_100g':345,proteins_100g:12,carbohydrates_100g:23,fat_100g:4,fiber_100g:5};
const off=(extra={})=>({code:'012345678905',product_name:'Independent cereal',brands:'Review Brand',_source:'openfoodfacts',serving_size:'1 bowl (30 g)',serving_quantity:30,nutriments:{...nutrients},...extra});
const canonical=(extra={})=>off({_source:'supabase',_db_id:id,...extra});
const usda=(extra={})=>off({_source:'usda',_usda_fdc_id:'123456',code:'123456',...extra});
const poison=(extra={})=>{const p=off(extra);Object.defineProperty(p,'nutriments',{get(){throw Error('unverified nutrition accessed');},enumerable:true});return p;};
const cases=[['OFF',{}],['absent source',{_source:undefined}],['null source',{_source:null}],['malformed source',{_source:{kind:'supabase'}}],['spoofed OFF authority',{_db_id:id,_usda_fdc_id:'123',_serving_authority:'confirmed_correction',ai_verified:true,_nutrition_provenance:{kind:'verified'},requires_label_confirmation:false}],['supabase without exact row ID',{_source:'supabase',_db_id:'bogus'}],['supabase conflicting off identity',{_source:'supabase',_db_id:id,_off_id:'provider'}],['supabase mismatching row',{_source:'supabase',_db_id:id,_db_row:{id:'wrong'}}],['USDA mismatching code',{_source:'usda',_usda_fdc_id:'123'}],['USDA conflicting off identity',{_source:'usda',_usda_fdc_id:'012345678905',_off_id:'provider'}]];
const actions=[['app/food-search.tsx','handleSelectProduct'],['app/add-food.tsx','handleOpenSearchResultDetails'],['app/add-food.tsx','handleQuickAddSearchResult'],['app/add-food.tsx','handleQuickAddSearchResultToMealPlan']];
const routeContext={mode:'meal-plan',planId:'plan-1',meal:'lunch',date:'2026-11-06',mealId:'meal-1',context:'my_meals_builder',returnTo:'/my-meals-edit',itemId:'editing',itemTable:'saved_meal_items',offData:'stale',food_item_id:'forged',session:'unsigned',proposal:'unsigned',photo_front_url:'stale'};
for(const [name,extra] of cases)test('real result builder neutralizes '+name+' before reading nutrients',()=>{for(const source of ['off','local','supabase']){const p=poison(extra),result=search.buildResultItem(p,source);assert.equal(result.product,p);assert.equal(result.requiresConfirmation,true);assert.equal(result.hasNutrition,false);for(const key of ['displayCalories','displayProtein','displayCarbs','displayFats','displayFiber'])assert.equal(Number.isNaN(result[key]),true);assert.equal(result.servingText,'');}});
for(const [file,action] of actions)test('actual '+action+' blocks every external/spoofed variant before side effects',async()=>{for(const [name,extra] of cases){const h=closure({...safety,params:routeContext});bind(h.c,file,action);await h.c[action]({product:poison(extra),source:'supabase',requiresConfirmation:false,hasNutrition:true});assert.equal(h.effects.routes.length,1,name);const route=h.effects.routes[0];assert.equal(route.pathname,'/search-food-confirmation');for(const k of ['offData','food_item_id','session','proposal','photo_front_url','_db_id','nutriments'])assert.equal(Object.hasOwn(route.params,k),false,k);for(const k of ['mode','planId','meal','date','mealId','context','returnTo','itemId','itemTable'])assert.equal(route.params[k],routeContext[k],k);for(const k of ['writes','calculations','provider','logged','alerts'])assert.equal(h.effects[k].length,0,k);}});
test('real merge preserves all named external results across cache and server, with canonical ordering',()=>{const products=[canonical(),usda(),off({code:'22345678'}),off({code:'32345678',nutriments:{}}),off({code:'42345678',serving_size:'250 ml',serving_quantity:250}),off({code:'',product_name:'',generic_name:'Generic cereal',brands:'Other Brand'})];const map=new Map();const cached=search.mergeProducts(map,products,'local','cereal');assert.equal(cached.length,6);const result=search.mergeProducts(map,products,'supabase','cereal');assert.equal(result.length,6);assert.deepEqual(Array.from(result,r=>r.product.code),products.map(p=>p.code));assert.equal(result.filter(r=>r.requiresConfirmation).length,4);assert.equal(map.size,6);});
test('real merge retains the existing 80-result cap and no-nutrition OFF names',()=>{const products=Array.from({length:100},(_,i)=>off({code:String(10000000+i),product_name:'Cereal '+i,nutriments:{}}));assert.equal(search.mergeProducts(new Map(),products,'supabase','cereal').length,80);});
test('canonical DB and USDA maintain real numeric result behavior',()=>{for(const p of [canonical(),usda()]){const expected=adapter.normalizeUsdaProduct(p),serving=adapter.extractServingSize(expected),n=adapter.extractNutritionPerServing(expected,serving.grams),r=search.buildResultItem(p,'supabase');assert.equal(r.requiresConfirmation,undefined);assert.equal(r.hasNutrition,true);assert.equal(r.displayCalories,n.calories);assert.equal(r.displayProtein,n.protein);}});
for (const [file, action] of actions) test('actual '+action+' still permits canonical DB and USDA through existing path', async () => {
  for (const p of [canonical(), usda()]) {
    const plan = [], draft = [], provider = [], rows = [];
    const h = closure({
      ...safety, ...adapter, ...selection, params: routeContext,
      persistUsdaSelection: async x => { provider.push(x); return null; },
      addMealPlanItem: async (...x) => plan.push(x),
      addToDraft: async x => draft.push(x), invalidatePIECache() {},
      supabase: {
        auth: { getSession: async () => ({ data: { session: null } }) },
        from() {
          return {
            select() { return this; }, eq() { return this; },
            maybeSingle: async () => ({ data: { id: 'existing' } }),
            insert(payload) {
              rows.push(payload);
              return { select() { return this; }, single: async () => ({ data: { id: 'created' }, error: null }) };
            }
          };
        }
      }
    });
    bind(h.c, file, action);
    await h.c[action](search.buildResultItem(p, 'supabase'));
    assert.equal(h.effects.alerts.length, 0);
    assert.equal(h.effects.routes.filter(r => r.pathname === '/search-food-confirmation').length, 0);
    if (action === 'handleQuickAddSearchResultToMealPlan') assert.equal(plan.length, 1);
    else if (action === 'handleQuickAddSearchResult') assert.equal(draft.length, 1);
    else assert.equal(h.effects.routes[0].pathname, '/food-details');
  }
});
for(const [file,name] of [['app/food-search.tsx','ResultRow'],['app/add-food.tsx','renderSearchResultItem']])test('actual '+name+' displays name/brand but no guessed numeric nutrition or verification',()=>{const h=closure({...safety,handleOpenSearchResultDetails(){},handleQuickAddSearchResult(){},handleQuickAddSearchResultToMealPlan(){}});bind(h.c,file,name);for(const source of ['supabase','local','off']){const item=search.buildResultItem(poison(),source),tree=name==='ResultRow'?h.c[name]({item,isDark:false,onPress(){}}):h.c[name](item,0),s=text(tree);assert.match(s,/Independent cereal/);assert.match(s,/Review Brand/);assert.match(s,/Confirm nutrition label/);assert.doesNotMatch(s,/NaN|345|kcal|P 0g|✓/);}});
function allNodes(tree,pred){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(x=>allNodes(x,pred));return [...(pred(tree)?[tree]:[]),...allNodes(tree.props?.children,pred)];}
function confirmation(params,lang='en'){const routes=[],effects=[],page=load('app/search-food-confirmation.tsx',{'expo-router':{useLocalSearchParams:()=>params,useRouter:()=>({replace:r=>routes.push(r),back:()=>effects.push('back')})},'react-i18next':{useTranslation:()=>({i18n:{language:lang}})},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@/hooks/useColorScheme':{useColorScheme:()=> 'light'},'@/styles/commonStyles':{colors:{}}});const tree=page.default();return {tree,routes,effects,buttons:allNodes(tree,n=>typeof n.props?.onPress==='function')};}
test('actual confirmation page is inert until explicit photo/manual action, strips stale payload',()=>{const h=confirmation({...routeContext,barcode:'012345678905',reason:'mass_unverified'});assert.equal(h.routes.length,0);assert.equal(h.buttons.length,3);h.buttons[0].props.onPress();assert.equal(h.routes[0].pathname,'/food-photo-capture');assert.equal(h.routes[0].params.type,'new_product');h.buttons[1].props.onPress();assert.equal(h.routes[1].pathname,'/my-foods-create');assert.equal(h.routes[1].params.recoveryManual,'1');assert.equal(h.routes[1].params.barcode,undefined);for(const r of h.routes)for(const key of ['offData','food_item_id','session','proposal','photo_front_url','reason'])assert.equal(r.params[key],undefined);h.buttons[2].props.onPress();assert.deepEqual(h.effects,['back']);});
test('volume-only and malformed direct reasons permit only Back, with no density or completion action',()=>{for(const reason of ['volume_only',undefined,null,'',true,'MASS_UNVERIFIED',['mass_unverified'],{},'unsupported']){const h=confirmation({reason,barcode:'012345678905'});assert.equal(h.buttons.length,1);assert.match(text(h.tree),/Do not assume 1 ml equals 1 g/);h.buttons[0].props.onPress();assert.equal(h.routes.length,0);assert.deepEqual(h.effects,['back']);}});
test('invalid/missing package codes offer manual review only, no provider/photo route',()=>{for(const barcode of [undefined,'123','usda_123',id,{},['012345678905']]){const h=confirmation({reason:'mass_unverified',barcode});assert.equal(h.buttons.length,2);h.buttons[0].props.onPress();assert.equal(h.routes[0].pathname,'/my-foods-create');}});
test('volume classification uses explicit units; no automatic ml->grams in action paths',async()=>{for(const p of [off({serving_size:'250 ml',serving_quantity:250}),off({serving_size:'1 cup',serving_quantity:240}),off({serving_size:'1 serving',serving_quantity:250,serving_quantity_unit:'ml'}),off({serving_size:'8 fl oz'})]){assert.equal(safety.searchConfirmationReason(p),'volume_only');for(const [file,action] of actions){const h=closure({...safety,params:routeContext});bind(h.c,file,action);await h.c[action]({product:p,source:'supabase'});assert.equal(h.effects.routes[0].params.reason,'volume_only');assert.equal(h.effects.writes.length,0);assert.equal(h.effects.provider.length,0);assert.equal(h.effects.calculations.length,0);}}});
test('manual adapter refuses ml-only mass and empty nutrients',()=>{const manual=load('utils/manualRecoveryProduct.ts');assert.equal(manual.manualRecoveryProduct({name:'Liquid',brand:'',servingAmount:'250',servingUnit:'ml',calories:'100',protein:'1',carbs:'20',fats:'2',fiber:'0'}),null);});
test('guarded FDC-shaped codes never become package barcodes in confirmation route',()=>{const p=off({_source:'usda',_usda_fdc_id:'12345678',code:'12345678',_off_id:'malformed'});assert.equal(safety.searchSelectionNeedsConfirmation(p),true);assert.equal(safety.searchConfirmationRoute(p,{}).params.barcode,undefined);});
test('generic-only external names remain visible in both real render paths',()=>{for(const [file,name] of [['app/food-search.tsx','ResultRow'],['app/add-food.tsx','renderSearchResultItem']]){const h=closure({...safety,handleOpenSearchResultDetails(){},handleQuickAddSearchResult(){},handleQuickAddSearchResultToMealPlan(){}});bind(h.c,file,name);const item=search.buildResultItem(off({product_name:undefined,generic_name:'Generic oats'}),'supabase');const tree=name==='ResultRow'?h.c[name]({item,isDark:false,onPress(){}}):h.c[name](item,0);assert.match(text(tree),/Generic oats/);}});

test('malformed zero and padded USDA identifiers cannot bypass confirmation',()=>{for(const id of ['0','000','000123']){const p=usda({_usda_fdc_id:id,code:id});assert.equal(safety.searchSelectionNeedsConfirmation(p),true,id);}});
test('nonpositive or malformed displayed grams do not establish mass for volume-only results',()=>{for(const label of ['250 ml (0 g)','250 ml (-1 g)','250 ml (0.0 grams)'])assert.equal(safety.searchConfirmationReason(off({serving_size:label})),'volume_only',label);});

for (const make of [canonical, usda]) test('explicit/malformed confirmation flag precedes '+make.name+' wire trust in actual build and all four callbacks', async () => {
  for (const flag of [true, null, 'true', 'false', 1, 0, [], {}, undefined]) {
    const p=make({requires_label_confirmation:flag});
    Object.defineProperty(p,'nutriments',{get(){throw Error('flagged canonical nutrition accessed');},enumerable:true});
    const item=search.buildResultItem(p,'supabase');
    assert.equal(item.requiresConfirmation,true,JSON.stringify(flag));
    assert.equal(item.hasNutrition,false);
    const rows=search.mergeProducts(new Map(),[p],'supabase','cereal');
    assert.equal(rows.length,1);
    for (const [file,action] of actions) {
      const h=closure({...safety,params:routeContext});
      bind(h.c,file,action);
      await h.c[action]({...item,requiresConfirmation:false});
      assert.equal(h.effects.routes.length,1);
      assert.equal(h.effects.routes[0].pathname,'/search-food-confirmation');
      for(const key of ['writes','provider','calculations','logged','alerts'])assert.equal(h.effects[key].length,0,key);
    }
  }
});
test('absent or explicit false confirmation flag preserves canonical DB and USDA result math',()=>{
  for(const make of [canonical,usda])for(const present of [false,true]) {
    const p=make(present?{requires_label_confirmation:false}:{});
    const r=search.buildResultItem(p,'supabase');
    assert.equal(r.requiresConfirmation,undefined);
    assert.equal(r.hasNutrition,true);
    assert.equal(safety.searchSelectionNeedsConfirmation(p),false);
  }
});

test('sanitized canonical volume reason stays visible and all four actions lead to Back-only guidance',async()=>{
  const p={code:'012345678905',product_name:'Sanitized volume food',brands:'Review Brand',_source:'supabase',_db_id:id,requires_label_confirmation:true,nutrition_issue:'volume_basis_requires_confirmation'};
  const item=search.buildResultItem(p,'supabase');
  assert.equal(item.requiresConfirmation,true);assert.equal(item.hasNutrition,false);
  assert.equal(search.mergeProducts(new Map(),[p],'supabase','volume').length,1);
  for(const [file,action] of actions){
    const h=closure({...safety,params:routeContext});bind(h.c,file,action);await h.c[action](item);
    assert.equal(h.effects.routes[0].params.reason,'volume_only');
    const ui=confirmation(h.effects.routes[0].params);assert.equal(ui.buttons.length,1);
    assert.match(text(ui.tree),/Do not assume 1 ml equals 1 g/);ui.buttons[0].props.onPress();
    assert.equal(ui.routes.length,0);assert.deepEqual(ui.effects,['back']);
    for(const key of ['writes','provider','calculations','logged','alerts'])assert.equal(h.effects[key].length,0,key);
  }
});
