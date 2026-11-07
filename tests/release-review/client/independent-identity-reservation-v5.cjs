// V5 independent local-only status/route validation. No runtime source edits.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./client-harness.cjs');
const {load,text}=require('./independent-off-search-harness.cjs');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function reservation(flag,found=true){
  const result={found,capture_status:'identity_reserved',source:'supabase',...(flag==='absent'?{}:{requires_label_confirmation:flag})};
  for(const key of ['item','food_item_id','proposal','nutrition','off_data'])Object.defineProperty(result,key,{get(){throw Error('Reserved identity field read: '+key);},enumerable:true});
  return result;
}
function page(params,language){
  const routes=[],module=load('app/search-food-confirmation.tsx',{
    'expo-router':{useLocalSearchParams:()=>params,useRouter:()=>({replace:r=>routes.push(r),back:()=>routes.push('back')})},
    'react-i18next':{useTranslation:()=>({i18n:{language}})},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@/styles/commonStyles':{colors:{}}
  });
  const tree=module.default();
  function buttons(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(buttons);return [...(typeof n.props?.onPress==='function'?[n]:[]),...buttons(n.props?.children)];}
  return {tree,routes,buttons:buttons(tree)};
}
for(const kind of ['scanner','lookup'])for(const platform of ['web','ios'])test('V5 actual '+kind+' '+platform+' reserved identity overrides flags/found without touching nutrition or IDs',async()=>{
  for(const flag of [false,true,'absent',null])for(const found of [true,false]){
    const h=harness(kind,platform);h.responseQueue.push(reservation(flag,found));await h.submit();await h.flush();
    assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].body,{barcode:'012345678905',review_capability:'label_confirmation_v1'});
    assert.equal(h.routes.length,1);assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);
    const route=h.routes[0];assert.equal(route.pathname,'/search-food-confirmation');assert.equal(route.params.reason,'catalog_ambiguous');
    for(const key of ['barcode','food_item_id','offData','proposal','session','item','nutrition','off_data','name','source','photo_front_url'])assert.equal(Object.hasOwn(route.params,key),false,key);
    for(const key of ['mode','planId','meal','date','mealId','context','returnTo','itemId','itemTable'])assert.equal(route.params[key],h.c.params[key],key);
    for(const language of ['en','es']){
      const ui=page(route.params,language);assert.equal(ui.routes.length,0);assert.equal(ui.buttons.length,1);
      const display=text(ui.tree);assert.match(display,language==='es'?/identidad en conflicto o reservada/:/conflicting or reserved catalog identity/);
      assert.match(display,language==='es'?/Una foto o el ingreso manual no pueden resolverla/:/A photo or manual entry cannot safely resolve this/);
      assert.doesNotMatch(display,/This barcode matches more than one|Este código corresponde a más de un alimento/);
      ui.buttons[0].props.onPress();assert.deepEqual(ui.routes,['back']);
    }
  }
});
for(const kind of ['scanner','lookup'])for(const platform of ['web','ios'])test('V5 actual '+kind+' '+platform+' dismissed reserved response never navigates after decoding',async()=>{
  const json=defer(),h=harness(kind,platform,{jsonWait:json.promise});h.responseQueue.push(reservation(false));
  const pending=h.submit();await h.flush();h.cancel();json.resolve();await pending;await h.flush();
  assert.equal(h.requests.length,1);assert.equal(h.routes.length,0);assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);
});
test('V5 non-conflicting ordinary capture status still takes existing found path',async()=>{
  for(const kind of ['scanner','lookup'])for(const platform of ['web','ios']){
    const h=harness(kind,platform);h.responseQueue.push({found:true,capture_status:'existing',requires_label_confirmation:false,source:'supabase',item:{id:'canonical',name:'Existing food'}});
    await h.submit();await h.flush();assert.equal(h.requests.length,1);assert.equal(h.adapters.length,1);assert.equal(h.routes.length,1);assert.equal(h.routes[0].pathname,'/food-details');assert.equal(h.routes[0].params.food_item_id,'canonical');assert.equal(h.writes.length,0);
  }
});
