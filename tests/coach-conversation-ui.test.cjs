const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}),f);
const React=require('react'),root=path.resolve(__dirname,'..');
function harness(file, options={}){
 const original=Module._load, states=[],refs=[],effects=[],calls=[];let cursor=0,ref=0;
 const premium={isPremium:true,loading:false,error:null,...options.premium};
 const react={...React,useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})},useEffect:f=>effects.push(f),useCallback:f=>f};
 Module._load=function(name,parent,isMain){
  if(name==='react')return react;
  if(name==='react-native')return new Proxy({Platform:{OS:'ios'},StyleSheet:{create:x=>x},useColorScheme:()=> 'light'},{get:(o,k)=>o[k]??String(k)});
  if(name==='expo-router')return {usePathname:()=>options.path??'/coach',useRouter:()=>({push:p=>calls.push(p)}),useFocusEffect(){}};
  if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({bottom:0})};
  if(name==='react-i18next')return {useTranslation:()=>({i18n:{language:options.language??'en'},t:k=>k})};
  if(name==='@/hooks/usePremium')return {usePremium:()=>premium};
  if(name==='@/utils/bannerAd')return {BannerAd:'BannerAd',BannerAdSize:{ANCHORED_ADAPTIVE_BANNER:'size'},TestIds:{ADAPTIVE_BANNER:'test'},isBannerAdAvailable:true};
  if(name==='@/components/IconSymbol')return {IconSymbol:'Icon'};
  if(name==='@/lib/supabase/client')return {supabase:{auth:{}}};
  if(name==='@react-native-async-storage/async-storage')return {};
  if(name.startsWith('@/'))return original.call(this,path.join(root,name.slice(2)),parent,isMain);
  return original.call(this,name,parent,isMain);
 };
 const full=path.join(root,file);delete require.cache[full];const mod=require(full),Component=mod.CoachDailyActionContent??mod.default??mod.AdBannerFooter;
 const props={isPremium:premium.isPremium,premiumLoading:premium.loading,premiumError:premium.error,gated:false,busy:false};
 return {states,calls,render(){cursor=ref=0;return Component(props)},restore(){Module._load=original}};
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];return [tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)]}
function text(tree){if(tree==null)return '';if(typeof tree==='string'||typeof tree==='number')return String(tree);return React.Children.toArray(tree.props?.children).map(text).join(' ')}
function press(tree,label){const n=nodes(tree).find(n=>n.props?.accessibilityRole==='button'&&text(n)===label);assert.ok(n,`Missing ${label}`);n.props.onPress();}
test('actual Coach uses one short welcome and compact accessible actions, no duplicate identity or permanent disclaimer',()=>{const h=harness('components/CoachDailyAction.tsx');try{const r=h.render(),s=text(r);assert.match(s,/Hi, I’m your Coach/);assert.doesNotMatch(s,/MACRO GOAL|PREMIUM|PREVIEW|You stay in control|General conversation/);assert.equal(r.props.style.backgroundColor,undefined);for(const n of nodes(r).filter(n=>n.props?.accessibilityRole==='button'))assert.ok(n.props.style[0].minHeight>=44);}finally{h.restore()}});
test('actual meal journey asks one context question at a time and preserves explicit diary choice',()=>{const h=harness('components/CoachDailyAction.tsx');try{press(h.render(),'Choose food');press(h.render(),'Cook');let r=h.render();assert.match(text(r),/Which meal/);assert.doesNotMatch(text(r),/diary up to date|How many meals/);press(r,'Dinner');r=h.render();assert.match(text(r),/diary up to date/);assert.doesNotMatch(text(r),/How many meals/);press(r,'Not yet / not sure');assert.equal(h.states[5].diaryComplete,false);r=h.render();assert.match(text(r),/How many meals/);press(r,'3');assert.equal(h.states[5].remaining,3);assert.match(text(h.render()),/Any allergies/);press(h.render(),'Back');assert.match(text(h.render()),/How many meals/);}finally{h.restore()}});
test('unresolved and failed entitlement never display free preview or upsell',()=>{for(const premium of [{isPremium:false,loading:true},{isPremium:false,error:'offline'}]){const h=harness('components/CoachDailyAction.tsx',{premium});try{assert.doesNotMatch(text(h.render()),/guided preview|See Premium/);}finally{h.restore()}}});
test('floating badge is absent on Coach even for free; errors and loading do not upsell elsewhere',()=>{for(const options of [{premium:{isPremium:false}},{path:'/dashboard',premium:{isPremium:false,loading:true}},{path:'/dashboard',premium:{isPremium:false,error:'offline'}},{path:'/dashboard',premium:{isPremium:true}}]){const h=harness('components/GoPremiumFloatingBadge.tsx',options);try{assert.equal(h.render(),null);}finally{h.restore()}}});
test('actual ad footer mounts only after a confirmed free result',()=>{for(const premium of [{isPremium:true},{isPremium:false,loading:true},{isPremium:false,error:'offline'}]){const h=harness('components/AdBannerFooter.tsx',{premium});try{assert.equal(h.render(),null);}finally{h.restore()}}const h=harness('components/AdBannerFooter.tsx',{premium:{isPremium:false}});try{global.__DEV__=true;assert.ok(nodes(h.render()).some(n=>n.type==='BannerAd'));}finally{h.restore();delete global.__DEV__}});
test('Spanish journey renders the same compact questions',()=>{const h=harness('components/CoachDailyAction.tsx',{language:'es'});try{press(h.render(),'Elegir comida');press(h.render(),'Cocinar');assert.match(text(h.render()),/Qué comida vamos a elegir/);}finally{h.restore()}});
