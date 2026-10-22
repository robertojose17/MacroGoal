const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}),f);
test('actual existing Recipe Detail opens without writes/provider/image calls and explicit Add uses the guarded adapter',async()=>{
  const {holdRecipeReview}=require('../utils/coachRecipeReview.ts');
  const value={owner:'A',date:'2026-10-22',meal:'dinner',option:{id:'source-one',name:'Chicken rice bowl',source:'recipe',source_label:'allrecipes.com',source_url:'https://www.allrecipes.com/recipe/123/bowl/',source_servings:1.5,nutrition:{calories:600,protein:45,carbs:60,fats:18,fiber:6},recipe:{source_servings:4,ingredients:['400g chicken','200g rice'],instructions:['Cook and divide into four portions.']}}};
  const token=holdRecipeReview(value),calls=[],effects=[],rows=new Map();let state=0;
  const React=require('react'),realLoad=Module._load,root=path.resolve(__dirname,'..');
  const fakeReact={...React,useState(initial){const i=state++;return [i===0?true:typeof initial==='function'?initial():initial,()=>{}]},useCallback:f=>f,useEffect:f=>effects.push(f),useRef:initial=>({current:initial})};
  const client={auth:{getUser:async()=>({data:{user:{id:'A'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},functions:{invoke:async()=>{calls.push('function')}},from:()=>{throw Error('unexpected table write/read')},rpc:async(name,body)=>{calls.push({name,body});return {error:null}}};
  Module._load=function(name,parent,isMain){
    if(name==='react'&&parent?.filename.endsWith('recipe-finder-detail.tsx'))return fakeReact;
    if(name==='react-native')return new Proxy({Platform:{OS:'ios'}},{get:(o,k)=>k==='StyleSheet'?{create:x=>x}:o[k]??String(k)});
    if(name==='expo-router')return {Stack:{Screen:'Screen'},useLocalSearchParams:()=>({coachReviewKey:token}),useRouter:()=>({back(){}})};
    if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({bottom:0})};
    if(name==='react-i18next')return {useTranslation:()=>({t:k=>k})};
    if(name==='lucide-react-native'||name==='@expo/vector-icons')return new Proxy({},{get:(_,k)=>String(k)});
    if(name==='@react-native-async-storage/async-storage')return {getItem:async k=>rows.get(k)??null,setItem:async(k,v)=>rows.set(k,v),removeItem:async k=>rows.delete(k)};
    if(name==='@/lib/localization')return {getAppLocale:()=> 'en'};
    if(name==='@/lib/supabase/client')return {supabase:client};
    if(name==='@/utils/dateUtils')return {toLocalDateString:()=> '2026-10-22'};
    if(name==='@/hooks/useColorScheme')return {useColorScheme:()=> 'light'};
    if(name==='@/hooks/useRecipeFinder')return {useRecipeFinder:()=>({saveRecipe:()=>calls.push('save'),unsaveRecipe:()=>calls.push('unsave')})};
    if(name==='@/hooks/useChatbot')return {useChatbot:()=>({sendMessage:()=>calls.push('provider'),loading:false})};
    if(name==='@/components/RecipeImage')return {RecipeImage:'RecipeImage'};
    if(name==='@/styles/commonStyles')return {colors:new Proxy({},{get:()=> '#333333'}),spacing:{md:16,sm:8},borderRadius:{md:12},typography:{}};
    if(name.startsWith('@/'))return realLoad.call(this,path.join(root,name.slice(2)),parent,isMain);
    return realLoad.call(this,name,parent,isMain);
  };
  let tree;
  try {const Screen=require('../app/recipe-finder-detail.tsx').default;tree=Screen();for(const effect of effects)effect();} finally {Module._load=realLoad;}
  const nodes=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);walk(n.props?.children)}walk(tree);
  assert.equal(nodes.some(n=>n.type==='RecipeImage'),false);
  assert.equal(nodes.some(n=>n.props?.onPress?.name==='handleMacroFit'),false);
  assert.deepEqual(calls,[]);
  const texts=n=>typeof n==='string'?n:Array.isArray(n)?n.map(texts).join(''):n?.props?texts(n.props.children):'';
  const add=nodes.find(n=>typeof n.props?.onPress==='function'&&texts(n).includes('localization.screens.recipe18'));
  assert.ok(add,'existing confirmation button must bind the guarded real handler');
  await add.props.onPress();
  assert.equal(calls.length,1);assert.equal(calls[0].name,'log_food');assert.equal(calls[0].body.p_meal_type,'dinner');assert.equal(calls[0].body.p_food_name,'Chicken rice bowl');
  // The sheet initializes at one serving; opening it normally sets the displayed portion.
  assert.equal(calls[0].body.p_calories,400);
  await add.props.onPress();assert.equal(calls.length,1);
});
