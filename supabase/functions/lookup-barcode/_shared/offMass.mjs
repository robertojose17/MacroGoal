import {captureOff100gV4} from './off100gV4.mjs';
/** LOCAL REVIEW ONLY. Original legacy OFF serving projection, never density inference. */
export function canonicalGTIN(code) {
 if(typeof code!=='string'||!/^\d{12,13}$/.test(code))return null;
 let sum=0;for(let i=code.length-2,j=0;i>=0;i--,j++)sum+=Number(code[i])*(j%2===0?3:1);
 if((10-sum%10)%10!==Number(code.at(-1)))return null;
 return code.length===12?'0'+code:code;
}
export const samePackage=(a,b)=>canonicalGTIN(a)!==null&&canonicalGTIN(a)===canonicalGTIN(b);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const number=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e9;
const text=(x,max)=>typeof x==='string'&&x.length>0&&x.length<=max&&x.trim()===x&&!/[\u0000-\u001f<>]/.test(x);
export const MASS_NUTRIENTS=Object.freeze(['fat','proteins','carbohydrates','fiber','sugars','salt','saturated-fat','trans-fat','polyunsaturated-fat','monounsaturated-fat','added-sugars','soluble-fiber','insoluble-fiber','starch','water','cholesterol','calcium','iron','magnesium','phosphorus','potassium','sodium','zinc','copper','manganese','selenium','vitamin-c','vitamin-b1','vitamin-b2','vitamin-pp','vitamin-b6','vitamin-b9','vitamin-b12','vitamin-e','vitamin-d','vitamin-k']);
const core=['energy-kcal','proteins','carbohydrates','fat'];
export function validateMassSnapshot(s) {
 if(!plain(s)||Object.keys(s).sort().join(',')!==['code','product_name','brands','ingredients_text','nutrition_data_per','nutrition_data_prepared_per','preparation','serving_quantity','serving_quantity_unit','serving_size','nutriments'].sort().join(','))throw Error('invalid_mass_snapshot_shape');
 if(!canonicalGTIN(s.code))throw Error('invalid_package_identity');
 for(const k of ['product_name','brands','ingredients_text'])if(!text(s[k],k==='ingredients_text'?4096:160))throw Error('incomplete_formulation_identity');
 if(s.nutrition_data_per!=='serving'||s.nutrition_data_prepared_per!==null||s.preparation!==null)throw Error('unsupported_preparation_or_basis');
 if(s.serving_quantity_unit!=='g'||!['string','number'].includes(typeof s.serving_quantity)||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(s.serving_quantity)))throw Error('mass_not_explicit');
 const grams=Number(s.serving_quantity),label=typeof s.serving_size==='string'&&s.serving_size.match(/^((?:0|[1-9]\d*)(?:\.\d+)?) g$/);
 if(!(grams>0&&grams<=10000)||!label||Number(label[1])!==grams)throw Error('inconsistent_mass_label');
 if(!plain(s.nutriments)||Object.keys(s.nutriments).length<4||Object.keys(s.nutriments).length>512)throw Error('invalid_nutriments');
 for(const [k,v] of Object.entries(s.nutriments)){
  if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(k)||k.includes('_prepared'))throw Error('unsupported_nutrient_namespace');
  if(/_(unit|modifier)$/.test(k)){
   if(v!==null&&(typeof v!=='string'||v.length>24||/[\u0000-\u001f<>]/.test(v)))throw Error('invalid_nutrient_metadata');
  }else if(v!==null&&!number(v))throw Error('invalid_nutrient_amount');
 }
 for(const k of core)if(!number(s.nutriments[k+'_serving'])||s.nutriments[k+'_serving']<0)throw Error('incomplete_core_serving');
 for(const k of [...MASS_NUTRIENTS,'energy-kcal','energy-kj','energy']){
  const amount=s.nutriments[k+'_serving'];if(amount===undefined)continue;
  if(amount===null||amount<0) {if(core.includes(k))throw Error('incomplete_core_serving');continue;}
  const display=s.nutriments[k+'_unit'];
  const displayUnit=typeof display==='string'?display.toLowerCase().replace(/^(ug|μg|µg)$/,'mcg'):null;
  const expected=['energy','energy-kj','energy-kcal'].includes(k)?'energy':'mass';
  if(display!=null&&!(expected==='mass'?['g','mg','mcg']:['kcal','kj']).includes(displayUnit))throw Error('unsupported_source_unit');
  if(Object.hasOwn(s.nutriments,k)&&s.nutriments[k]!==amount)throw Error('contradictory_original_amount');
  const original=s.nutriments[k+'_value'];
  if(original!==undefined&&displayUnit){
   const factor=expected==='mass'?{g:1,mg:.001,mcg:.000001}[displayUnit]:(k==='energy-kcal'?(displayUnit==='kj'?1/4.184:1):(displayUnit==='kcal'?4.184:1));
   if(!number(original)||original<0||Math.abs(original*factor-amount)>Math.max(1e-8,Math.abs(amount)*1e-6))throw Error('contradictory_original_amount');
  }
  const modifier=s.nutriments[k+'_modifier'];if(modifier!==undefined&&modifier!==null&&modifier!=='')throw Error('qualified_nutrient_value');
  const derived=amount*100/grams;if(derived>(k==='energy-kcal'?1000:['energy','energy-kj'].includes(k)?4184:100))throw Error('implausible_mass_nutrition');
  if(Object.hasOwn(s.nutriments,k+'_100g')){
   const n=s.nutriments[k+'_100g'];if(!number(n)||n<0||Math.abs(n-derived)>Math.max(1e-8,Math.abs(derived)*1e-6))throw Error('contradictory_nutrient_basis');
  }
 }
 // Energy representations are different units for the same fact, never mixed silently.
 const kcal=s.nutriments['energy-kcal_serving'];for(const k of ['energy','energy-kj']){
  const kj=s.nutriments[k+'_serving'];if(kj!==undefined&&(!number(kj)||kj<0||Math.abs(kj-kcal*4.184)>Math.max(0.1,kcal*4.184*.01)))throw Error('contradictory_energy');
 }
 if(new TextEncoder().encode(JSON.stringify(s,null,1)).length>58000)throw Error('mass_snapshot_too_large');
 return {grams,canonical_code:canonicalGTIN(s.code),preparation:'as_sold'};
}
export function captureOffMass(product,{expectedId,capturedAt=new Date().toISOString()}={}) {
 if(!plain(product)||!samePackage(product.code,expectedId))throw Error('provider_identity_mismatch');
 // A newer nutrition object needs a separately reviewed input-set implementation.
 if(product.nutrition!==undefined&&product.nutrition!==null)throw Error('unsupported_new_schema');
 const nutriments={};if(!plain(product.nutriments))throw Error('invalid_nutriments');
 for(const [k,v] of Object.entries(product.nutriments)){
  if(k.endsWith('_label'))continue;
  if(MASS_NUTRIENTS.includes(k)||['energy-kcal','energy-kj','energy'].includes(k)||/_(unit|modifier)$/.test(k)||typeof v==='number'||/_(100g|serving|value)$/.test(k))nutriments[k]=v;
 }
 const snapshot={code:product.code,product_name:product.product_name,brands:product.brands,ingredients_text:product.ingredients_text,nutrition_data_per:product.nutrition_data_per,nutrition_data_prepared_per:product.nutrition_data_prepared_per??null,preparation:product.preparation??null,serving_quantity:product.serving_quantity,serving_quantity_unit:product.serving_quantity_unit,serving_size:product.serving_size,nutriments};
 validateMassSnapshot(snapshot);
 if(typeof capturedAt!=='string'||!Number.isFinite(Date.parse(capturedAt)))throw Error('invalid_capture_time');
 return {version:3,provider:'openfoodfacts',source_id:product.code,captured_at:new Date(capturedAt).toISOString(),snapshot};
}
/** Versioned source capture: never relabel source nutrition or weaken v3 proof. */
export function captureOffMassSupported(product,options={}) {
 return product?.nutrition_data_per==='100g'?captureOff100gV4(product,options):captureOffMass(product,options);
}
/** No fallback insert after an attempted/uncertain RPC. The caller returns review UI. */
export async function createOffMass({admin,request,product,expectedId,requestId,authenticated=false,enabled=false,timeoutMs=3000,now=Date.now}) {
 if(!enabled)return {status:'disabled'};
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000)return {status:'invalid_budget'};
 let evidence;try{evidence=captureOffMassSupported(product,{expectedId,capturedAt:new Date(now()).toISOString()});}catch{return {status:'unsupported_mass_capture'};}
 const deadline=Date.now()+timeoutMs;
 const bounded=async fn=>{const controller=new AbortController();let timer;const remaining=deadline-Date.now();if(remaining<=0)throw Error('timeout');try{return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},remaining);})])}finally{clearTimeout(timer)}};
 if(!authenticated){
  const bearer=request?.headers?.get('authorization')?.match(/^Bearer ([^ ]+)$/i)?.[1];if(!bearer)return {status:'unauthenticated'};
  try{const auth=await bounded(()=>admin.auth.getUser(bearer));if(auth?.error||!auth?.data?.user)return {status:'unauthenticated'};}catch{return {status:'auth_unavailable'};}
 }
 try{
  const out=await bounded(signal=>admin.rpc('create_off_mass_food_v1',{p_request_id:requestId,p_expected_code:expectedId,p_evidence:evidence}).abortSignal(signal));
  if(!out?.error&&['ambiguous_existing','identity_reserved'].includes(out?.data?.status))return out.data;
  if(out?.error||!['created','existing'].includes(out?.data?.status)||!out.data.food_item?.id)return {status:'create_outcome_uncertain'};
  return out.data;
 }catch{return {status:'create_outcome_uncertain'};}
}
