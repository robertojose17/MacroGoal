const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES ? process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript' : 'typescript');
const root=require('node:path').resolve(__dirname,'..');
const sourceFiles=process.env.BARCODE_RECOVERY_SOURCE_JSON?JSON.parse(fs.readFileSync(process.env.BARCODE_RECOVERY_SOURCE_JSON,'utf8')):null;
function harness(enabled=true,platform="ios",granted=true,type="new_product",opts={}){
 let slots=[],i=0,effects=[],cleanup=[],requests=[],responses=[],uploads=0,fileReads=0,uploaded=[],captureOptions=[],route=[],photoResolve,session={user:{id:Math.random().toString()},access_token:'fixture'};
 const react={useEffect(f,deps){focus(react.useCallback(f,deps));},useRef(v){const k=i++;return slots[k]??=( {current:v});},useState(v){const k=i++;if(!(k in slots))slots[k]=typeof v==='function'?v():v;return [slots[k],x=>slots[k]=typeof x==='function'?x(slots[k]):x];},useCallback(f,deps){const k=i++,old=slots[k];if(!old||JSON.stringify(old.deps)!==JSON.stringify(deps))slots[k]={f,deps};return slots[k].f;}};
 const focusCallbacks=new Map();
 function focus(f){const k=i++;focusCallbacks.set(k,f);if(slots[k]!==f){slots[k]=f;effects.push(f);}}
 const jsx=(type,props)=>({type,props});
 const cache={};function load(file){if(cache[file])return cache[file];const code=ts.transpileModule(sourceFiles?.[file]??fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const m={exports:{}};const req=x=>{
 if(x==='react')return react;if(x==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
 if(x==='react-native')return new Proxy({Platform:{OS:platform},StyleSheet:{create:x=>x},Linking:{openURL:async()=>{}}},{get:(o,k)=>o[k]||k});
 if(x==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};
 if(x==='expo-camera')return {CameraView:'CameraView',useCameraPermissions:()=>[{granted},async()=>({granted})]};
 if(x==='expo-file-system/legacy')return {readAsStringAsync:async()=>{fileReads++;if(platform==='web')throw Error('FileSystem forbidden on web');return ''},EncodingType:{Base64:'base64'}};
 if(x==='expo-router')return {useLocalSearchParams:()=>({type,barcode:'123',mode:'meal-plan',planId:'plan',meal:'lunch'}),useRouter:()=>({replace:x=>route.push(x),push:x=>route.push(x),back:()=>route.push('back')}),useFocusEffect:focus};
 if(x==='react-i18next')return {useTranslation:()=>({t:x=>x,i18n:{language:'en'}})};
 if(x==='@/styles/commonStyles')return {colors:{primary:'green'},spacing:{},borderRadius:{},typography:{}};
 if(x==='@/components/IconSymbol')return {IconSymbol:'IconSymbol'};
 if(x==='@/utils/dateUtils')return {toLocalDateString:()=> '2026-11-06'};
 if(x==='@/hooks/useColorScheme')return {useColorScheme:()=>false};
 if(x==='@/lib/supabase/client')return {SUPABASE_PROJECT_URL:'https://fixture.invalid',supabase:{auth:{getSession:async()=>{if(opts.authWait)await opts.authWait;return {data:{session:opts.auth===false?null:session}};}},storage:{from:()=>({upload:async(path,bytes,options)=>{uploads++;uploaded.push({path,bytes,options});return{};},getPublicUrl:()=>({data:{publicUrl:'https://fixture.invalid/front'}})})}}};
 if(x==='@/utils/servingParser')return {buildSyntheticOffData:x=>x};
 if(x.startsWith('@/'))return load(x.slice(2)+'.ts');throw Error(x);
 };vm.runInNewContext(code,{module:m,exports:m.exports,require:req,AbortController,setTimeout,clearTimeout,atob,console:{log(){},error(){}},fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));const data=await responses.shift();return {ok:true,json:async()=>data};}});return cache[file]=m.exports;}
 const Screen=load(opts.scanner?'app/barcode-scanner.tsx':'components/BarcodeRecoveryScreen.tsx').default;
 let tree;function walk(n,fn){if(!n)return;if(Array.isArray(n)){n.forEach(x=>walk(x,fn));return;}if(typeof n!=='object')return;fn(n);walk(n.props?.children,fn);}
 function render(){i=0;tree=Screen({unknownEnabled:enabled});walk(tree,n=>{if(n.type==='CameraView')n.props.ref.current={takePictureAsync:options=>{captureOptions.push(options);return new Promise(r=>{photoResolve=r;});}};});while(effects.length)cleanup.push(effects.shift()());return tree;}
 function text(n){if(typeof n==='string')return n;if(Array.isArray(n))return n.map(text).join('');return n?.props?text(n.props.children):'';}
 function click(label){let result;walk(tree,n=>{if(n.props?.onPress&&(text(n)===label||n.props.accessibilityLabel===label))result=n.props.onPress;});assert.ok(result,'button '+label);return result();}
 const flush=async()=>{for(let n=0;n<40;n++)await Promise.resolve();render();};
 return {render,flush,click,responses,requests,route,owner:id=>{session={user:{id},access_token:'fixture'};},field:(label,value)=>{let found=false;walk(tree,n=>{if(n.type==='TextInput'&&n.props.accessibilityLabel===label){n.props.onChangeText(value);found=true;}});assert(found,'input '+label);},get uploads(){return uploads;},photo:(photo={uri:'fixture'})=>photoResolve(photo),get fileReads(){return fileReads;},uploaded,captureOptions,blur:()=>cleanup.forEach(f=>f?.()),refocus:()=>{for(const f of focusCallbacks.values())cleanup.push(f());},input:value=>walk(tree,n=>{if(n.type==='TextInput')n.props.onChangeText(value);}),texts:()=>text(tree)};
}
test('actual callbacks: front first, selectable candidates, rear failure, manual review confirms barcode and preserves plan',async()=>{
 const h=harness();h.render();await h.flush();assert.match(h.texts(),/Photograph the package front/);assert.equal(h.requests.length,0);
 h.click('Take front photo');await h.flush();const p=h.click('Take photo');await h.flush();h.responses.push({session:'signed',next_step:'rear_label',candidates:[]});h.photo();await p;await h.flush();assert.equal(h.requests[0].action,'recovery_discover');assert.ok(h.requests[0].photo_front_url);assert.ok(h.requests[0].request_id);
 h.click('Take rear label photo');await h.flush();const rear=h.click('Take photo');await h.flush();h.responses.push({session:'signed',next_step:'manual'});h.photo();await rear;await h.flush();assert.equal(h.requests[1].action,'recovery_photos');assert.equal(h.requests[1].photo_front_url,undefined);
 assert.match(h.texts(),/Review or enter package values/);assert.equal(h.route.length,0);fillManual(h);await h.flush();h.responses.push({session:'signed',photo:manualCandidate});h.click('Review values before saving');await h.flush();assert.equal(h.requests[2].action,'recovery_manual_review');assert.equal(h.requests[2].session,'signed');assert.equal(h.requests[2].values.nutrition.fiber,null);assert.equal(h.requests.filter(r=>r.action==='recovery_confirm').length,0);h.responses.push({status:'approved',food_item:{id:'saved',barcode:'123'}});h.click('Confirm reviewed values and save');await h.flush();assert.equal(h.route[0].pathname,'/food-details');assert.equal(h.route[0].params.planId,'plan');
});
test('actual callback Back during camera capture prevents upload/search/navigation',async()=>{
 const h=harness();h.render();await h.flush();h.click('Take front photo');await h.flush();const p=h.click('Take photo');await h.flush();h.click('Back');h.photo();await p;await h.flush();assert.equal(h.uploads,0);assert.equal(h.requests.length,0);assert.equal(h.route.length,0);
});
test('capability disabled never uploads or fake-prompts a usable rear session',async()=>{
 const h=harness(false);h.render();await h.flush();h.click('Take front photo');await h.flush();assert.match(h.texts(),/rear photo cannot be analyzed/);assert.equal(h.uploads,0);assert.equal(h.requests.length,0);
});
const candidate={name:'Fixture food',brand:'Fixture',variant:'Original',serving:'20 g',serving_g:20,nutrition:{calories:60,protein:0,carbs:4,fat:4.5},image_url:'',exact_barcode:false,can_confirm:true,proposal:'signed-proposal',provenance:{kind:'source_data',url:'https://fixture.invalid',retrieved_at:''}};
test('actual candidate selection requires explicit tap and coalesces repeated confirmation',async()=>{
 const h=harness();h.render();await h.flush();h.click('Take front photo');await h.flush();h.click('Take photo');await h.flush();h.responses.push({session:'signed',candidates:[candidate]});h.photo();await h.flush();assert.equal(h.requests.length,1);assert.equal(h.route.length,0);
 h.responses.push({status:'approved',food_item:{id:'saved',name:'Fixture food'}});h.click('This is my product');h.click('This is my product');await h.flush();assert.equal(h.requests.filter(x=>x.action==='recovery_confirm').length,1);assert.equal(h.route[0].pathname,'/food-details');assert.equal(h.route[0].params.planId,'plan');
});
test('Back during pending front request then resume uses cached signed review without new request',async()=>{
 const h=harness();h.render();await h.flush();h.click('Take front photo');await h.flush();h.click('Take photo');await h.flush();let resolve;h.responses.push(new Promise(r=>resolve=r));h.photo();await h.flush();assert.equal(h.requests.length,1);h.click('Back');await h.flush();resolve({session:'signed',candidates:[candidate]});await h.flush();h.click('Take front photo');await h.flush();assert.match(h.texts(),/This is my product/);assert.equal(h.requests.length,1);assert.equal(h.uploads,1);
});

const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,...Array(1100).fill(0),255,217]).toString('base64');
test('web camera data URI uploads captured JPEG to own path without FileSystem',async()=>{
 const h=harness(true,'web');h.render();await h.flush();h.click('Take front photo');await h.flush();h.click('Take photo');await h.flush();h.responses.push({session:'signed',next_step:'rear_label'});h.photo({uri:jpeg,base64:jpeg});await h.flush();
 assert.equal(h.captureOptions[0].base64,true);assert.equal(h.captureOptions[0].imageType,'jpg');assert.equal(h.fileReads,0);assert.equal(h.uploaded.length,1);assert.match(h.uploaded[0].path,/^submissions\/[^/]+\/\d+_front\.jpg$/);assert.equal(h.uploaded[0].options.contentType,'image/jpeg');assert.equal(h.uploaded[0].options.upsert,false);assert.equal(h.uploaded[0].bytes[0],255);assert.equal(h.requests[0].action,'recovery_discover');
});
test('web malformed camera bytes cannot upload or trigger recovery',async()=>{
 const h=harness(true,'web');h.render();await h.flush();h.click('Take front photo');await h.flush();h.click('Take photo');await h.flush();h.photo({uri:'https://untrusted.invalid/image.jpg'});await h.flush();assert.equal(h.fileReads,0);assert.equal(h.uploaded.length,0);assert.equal(h.requests.length,0);
});
test('web Back or denied permission prevents image upload and search',async()=>{
 const h=harness(true,'web');h.render();await h.flush();h.click('Take front photo');await h.flush();h.click('Take photo');await h.flush();h.click('Back');h.photo({uri:jpeg});await h.flush();assert.equal(h.fileReads,0);assert.equal(h.uploaded.length,0);assert.equal(h.requests.length,0);
 const denied=harness(true,'web',false);denied.render();await denied.flush();denied.click('Take front photo');await denied.flush();assert.equal(denied.captureOptions.length,0);assert.equal(denied.uploaded.length,0);
});

test('web Incorrect Data still takes front then rear and uses same JPEG upload path',async()=>{
 const h=harness(true,'web',true,'correction');h.responses.push({session:'signed',candidates:[]});h.render();await h.flush();h.click('Take package photos');await h.flush();h.click('Take photo');await h.flush();h.photo({uri:jpeg,base64:jpeg});await h.flush();assert.equal(h.requests.length,1);assert.equal(h.uploaded.length,1);
 h.click('Take photo');await h.flush();h.responses.push({session:'signed',photo:null,candidates:[]});h.photo({uri:jpeg});await h.flush();assert.equal(h.fileReads,0);assert.equal(h.uploaded.length,2);assert.equal(h.requests[1].action,'recovery_photos');assert.ok(h.requests[1].photo_front_url);assert.ok(h.requests[1].photo_label_url);
});

test('web typed barcode validates, preserves leading zeros/context, uses authenticated ordinary lookup once',async()=>{
 const h=harness(true,'web',false,'new_product',{scanner:true});h.render();await h.flush();assert.match(h.texts(),/Enter the package barcode/);
 h.input('invalid');await h.flush();h.click('Look up product');await h.flush();assert.equal(h.requests.length,0);
 h.input('012345678905');await h.flush();h.responses.push({found:false});h.click('Look up product');h.click('Look up product');await h.flush();assert.equal(h.requests.length,1);assert.equal(h.requests[0].barcode,'012345678905');assert.equal(h.route[0].pathname,'/food-photo-capture');assert.equal(h.route[0].params.type,'new_product');assert.equal(h.route[0].params.planId,'plan');assert.equal(h.route[0].params.mode,'meal-plan');assert.equal(h.route[0].params.meal,'lunch');assert.equal(h.captureOptions.length,0);
});
test('web typed found product follows unchanged food-details flow',async()=>{
 const h=harness(true,'web',false,'new_product',{scanner:true});h.render();await h.flush();h.input('012345678905');await h.flush();h.responses.push({found:true,item:{id:'existing',name:'Fixture'}});h.click('Look up product');await h.flush();assert.equal(h.route[0].pathname,'/food-details');assert.equal(h.route[0].params.food_item_id,'existing');assert.equal(h.captureOptions.length,0);
});
test('web typed no-session or Back during auth makes no lookup',async()=>{
 const h=harness(true,'web',false,'new_product',{scanner:true,auth:false});h.render();await h.flush();h.input('012345678905');await h.flush();h.click('Look up product');await h.flush();assert.match(h.texts(),/Sign in/);assert.equal(h.requests.length,0);
 let release;const authWait=new Promise(r=>release=r);const b=harness(true,'web',false,'new_product',{scanner:true,authWait});b.render();await b.flush();b.input('012345678905');await b.flush();b.click('Look up product');b.click('Back');release();await b.flush();assert.equal(b.requests.length,0);assert.deepEqual(b.route,['back']);
});
test('web typed Back during lookup prevents late result navigation',async()=>{
 const h=harness(true,'web',false,'new_product',{scanner:true});h.render();await h.flush();h.input('012345678905');await h.flush();let release;h.responses.push(new Promise(r=>release=r));h.click('Look up product');await h.flush();assert.equal(h.requests.length,1);h.click('Back');release({found:false});await h.flush();assert.deepEqual(h.route,['back']);
});

const manualCandidate={...candidate,proposal:'manual-proposal',provenance:{kind:'user_entered',url:'',retrieved_at:''}};
function fillManual(h){for(const [label,value] of Object.entries({'Product name and variant':'Fixture food','Brand':'Fixture','Serving description':'1 piece','Grams per serving':'20','Calories (kcal)':'60','Protein (g)':'0','Carbohydrates (g)':'4','Fat (g)':'4.5'}))h.field(label,value);}
async function manualWithoutSession(){const h=harness(false);h.render();await h.flush();h.click('Take front photo');await h.flush();h.click('Continue to manual entry');await h.flush();return h;}
async function withCandidate(){const h=harness();h.render();await h.flush();h.click('Take front photo');await h.flush();h.click('Take photo');await h.flush();h.responses.push({session:'signed',candidates:[candidate]});h.photo();await h.flush();return h;}
test('actual manual callbacks: blanks rejected, zero preserved, optional fiber and stable scanned code',async()=>{
 const h=await manualWithoutSession();h.click('Review values before saving');await h.flush();assert.equal(h.requests.length,0);
 fillManual(h);await h.flush();h.responses.push({session:'manual-session',next_step:'manual'},{session:'manual-session',photo:manualCandidate});h.click('Review values before saving');h.click('Review values before saving');await h.flush();
 assert.equal(h.requests.length,2);assert.equal(h.requests[0].action,'recovery_manual_start');assert.equal(h.requests[0].barcode,'123');assert.equal(h.requests[1].action,'recovery_manual_review');assert.equal(h.requests[1].values.nutrition.protein,0);assert.equal(h.requests[1].values.nutrition.fiber,null);assert.equal(h.route.length,0);assert.doesNotMatch(h.texts(),/None of these — photograph rear label/);
});
test('actual editing callbacks: edits require fresh signed review before final save',async()=>{
 const h=await withCandidate();h.click('Edit before saving');await h.flush();h.field('Calories (kcal)','61');await h.flush();h.responses.push({session:'signed',photo:{...manualCandidate,nutrition:{...candidate.nutrition,calories:61}}});h.click('Review values before saving');await h.flush();
 assert.equal(h.requests[1].action,'recovery_manual_review');assert.equal(h.requests[1].values.nutrition.calories,61);assert.equal(h.requests.some(r=>r.action==='recovery_confirm'),false);
 h.responses.push({status:'approved',food_item:{id:'saved'}});h.click('Confirm reviewed values and save');h.click('Confirm reviewed values and save');await h.flush();assert.equal(h.requests.filter(r=>r.action==='recovery_confirm').length,1);assert.equal(h.requests.at(-1).proposal,'manual-proposal');
});
test('actual manual owner flip before dispatch makes no request',async()=>{
 const h=await manualWithoutSession();fillManual(h);await h.flush();h.owner('other-owner');h.click('Review values before saving');await h.flush();assert.equal(h.requests.length,0);assert.equal(h.route.length,0);assert.match(h.texts(),/sign in/i);
});
test('actual expired manual review explicitly renews session without losing draft or searching',async()=>{
 const h=await withCandidate();h.click('Edit before saving');await h.flush();h.field('Calories (kcal)','61');await h.flush();h.responses.push({status:'error',code:'expired_proposal'});h.click('Review values before saving');await h.flush();assert.match(h.texts(),/Start a new manual review/);const n=h.requests.length;
 h.click('Start a new manual review');await h.flush();assert.equal(h.requests.length,n);h.responses.push({session:'renewed',next_step:'manual'},{session:'renewed',photo:manualCandidate});h.click('Review values before saving');await h.flush();assert.equal(h.requests.at(-2).action,'recovery_manual_start');assert.equal(h.requests.at(-1).values.nutrition.calories,61);assert.equal(h.requests.filter(r=>r.action==='recovery_discover').length,1);
});
test('actual uncertain save keeps same proposal despite edit callback, then retries only confirmation',async()=>{
 const h=await withCandidate();h.click('Edit before saving');await h.flush();h.responses.push({session:'signed',photo:manualCandidate});h.click('Review values before saving');await h.flush();h.responses.push(undefined);h.click('Confirm reviewed values and save');await h.flush();const n=h.requests.length;h.click('Edit before saving');await h.flush();assert.equal(h.requests.length,n);assert.match(h.texts(),/Confirm reviewed values and save/);h.responses.push({status:'approved',food_item:{id:'saved'}});h.click('Confirm reviewed values and save');await h.flush();assert.equal(h.requests.at(-1).action,'recovery_confirm');assert.equal(h.requests.at(-1).proposal,'manual-proposal');
});
test('manual revision dispatch removes superseded AI proposal from cached attempt',async()=>{
 const h=await withCandidate();h.click('Edit before saving');await h.flush();h.field('Calories (kcal)','61');await h.flush();let resolve;h.responses.push(new Promise(r=>resolve=r));h.click('Review values before saving');await h.flush();
 assert.match(h.texts(),/Preparing your review/);h.click('Back');h.blur();await h.flush();resolve({session:'signed',photo:manualCandidate});await h.flush();h.refocus();await h.flush();
 // The pending callback cannot navigate or expose its earlier AI proposal.
 assert.equal(h.requests.filter(r=>r.action==='recovery_confirm').length,0);assert.doesNotMatch(h.texts(),/This is my product/);assert.match(h.texts(),/Confirm reviewed values and save/);
});
test('lost manual revision response cannot revive AI confirmation after refocus and preserves edited draft',async()=>{
 const h=await withCandidate();h.click('Edit before saving');await h.flush();h.field('Calories (kcal)','61');await h.flush();h.responses.push(undefined);h.click('Review values before saving');await h.flush();h.blur();h.refocus();await h.flush();assert.doesNotMatch(h.texts(),/This is my product/);assert.match(h.texts(),/Review or enter package values/);
 h.responses.push({session:'signed',photo:manualCandidate});h.click('Review values before saving');await h.flush();assert.equal(h.requests.at(-1).action,'recovery_manual_review');assert.equal(h.requests.at(-1).values.nutrition.calories,61);assert.equal(h.requests.filter(r=>r.action==='recovery_confirm').length,0);
});

