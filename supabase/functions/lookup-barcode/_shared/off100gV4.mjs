/** Review-only v4 proposal. No network, writes, or v3 mutation. */
export const MASS = ['fat','proteins','carbohydrates','fiber','sugars','salt','saturated-fat','trans-fat','polyunsaturated-fat','monounsaturated-fat','added-sugars','soluble-fiber','insoluble-fiber','starch','water','cholesterol','calcium','iron','magnesium','phosphorus','potassium','sodium','zinc','copper','manganese','selenium','vitamin-c','vitamin-b1','vitamin-b2','vitamin-pp','vitamin-b6','vitamin-b9','vitamin-b12','vitamin-e','vitamin-d','vitamin-k'];
const ENERGY=['energy-kcal','energy-kj','energy'];
const CORE=['energy-kcal','proteins','carbohydrates','fat'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9;
const close=(a,b)=>Math.abs(a-b)<=Math.max(1e-8,Math.abs(a)*1e-6);
export function servingClose(expected, supplied) {
 if (close(expected,supplied)) return true;
 if (!(expected>0&&supplied>0)) return false;
 const power=10**(2-Math.floor(Math.log10(expected)));
 return supplied===Number(supplied.toPrecision(3))
  && Math.abs(expected-supplied)<=0.5/power+Math.max(1e-12,Math.abs(expected)*1e-12);
}
const fail=code=>{throw Error(code)};
export function gtin(code){
 if(typeof code!=='string'||!/^\d{12,13}$/.test(code))return null;
 let sum=0;for(let i=code.length-2,j=0;i>=0;i--,j++)sum+=Number(code[i])*(j%2===0?3:1);
 if((10-sum%10)%10!==Number(code.at(-1)))return null;
 return code.length===12?'0'+code:code;
}
export function explicitGrams(p){
 if(p.serving_quantity_unit!=='g'||!['string','number'].includes(typeof p.serving_quantity)||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(p.serving_quantity)))fail('mass_not_explicit');
 const grams=Number(p.serving_quantity);if(!(grams>0&&grams<=10000))fail('invalid_mass');
 const label=p.serving_size;
 if(typeof label!=='string'||label.length>160||/[\u0000-\u001f<>]/.test(label))fail('invalid_mass_label');
 const exact=label.match(/^((?:0|[1-9]\d*)(?:\.\d+)?) g$/);
 // Count/volume label may coexist with a final gram declaration; never convert it.
 const suffix=label.match(/^([A-Za-z0-9 ./-]+) \(((?:0|[1-9]\d*)(?:\.\d+)?) g\)$/);
 if(!exact&&!suffix)fail('ambiguous_mass_label');
 if(suffix&&/\b(?:g|kg|mg|grams?)\b/i.test(suffix[1]))fail('multiple_mass_declarations');
 if(Number(exact?.[1]??suffix?.[2])!==grams)fail('mass_label_mismatch');
 return grams;
}
export function captureOff100gV4(product,{expectedId,capturedAt=new Date().toISOString()}={}){
 if(!object(product)||!gtin(expectedId)||gtin(product.code)!==gtin(expectedId))fail('identity_mismatch');
 if(product.nutrition!=null)fail('unsupported_new_schema');
 const keys=['code','product_name','brands','ingredients_text','nutrition_data_per','nutrition_data_prepared_per','preparation','serving_quantity','serving_quantity_unit','serving_size','nutriments'];
 const snapshot=Object.fromEntries(keys.map(k=>[k,product[k]??null]));
 const evidence={version:4,provider:'openfoodfacts',source_id:product.code,captured_at:capturedAt,snapshot};
 validateOff100gV4(evidence,expectedId);
 return structuredClone(evidence);
}
export function validateOff100gV4(e,expectedId=e?.source_id){
 if(!object(e)||e.version!==4||e.provider!=='openfoodfacts'||Object.keys(e).sort().join(',')!=='captured_at,provider,snapshot,source_id,version'||!object(e.snapshot)||typeof e.captured_at!=='string'||!Number.isFinite(Date.parse(e.captured_at)))fail('invalid_envelope');
 const s=e.snapshot;
 if(Object.keys(s).sort().join(',')!=='brands,code,ingredients_text,nutriments,nutrition_data_per,nutrition_data_prepared_per,preparation,product_name,serving_quantity,serving_quantity_unit,serving_size')fail('invalid_snapshot_shape');
 if(!gtin(s.code)||s.code!==e.source_id||gtin(expectedId)!==gtin(s.code))fail('identity_mismatch');
 for(const k of ['product_name','brands','ingredients_text'])if(typeof s[k]!=='string'||s[k].trim()!==s[k]||!s[k]||s[k].length>(k==='ingredients_text'?4096:160)||/[\u0000-\u001f<>]/.test(s[k]))fail('incomplete_formulation_identity');
 if(s.nutrition_data_per!=='100g'||s.preparation!==null||![null,'100g','serving'].includes(s.nutrition_data_prepared_per))fail('unsupported_preparation_or_basis');
 const grams=explicitGrams(s),n=s.nutriments;
 if(!object(n)||Object.keys(n).length<4||Object.keys(n).length>512)fail('invalid_nutrients');
 for(const [k,v] of Object.entries(n)){
  if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(k))fail('unsupported_nutrient_namespace');
  if(/_(unit|label|modifier)$/.test(k)){
   if(v!==null&&(typeof v!=='string'||v.length>160||/[\u0000-\u001f<>]/.test(v)))fail('invalid_nutrient_metadata');
  }else if(v!==null&&!valid(v))fail('invalid_nutrient_amount');
 }
 for(const k of CORE)if(!valid(n[k+'_100g']))fail('incomplete_core_100g');
 const nutrients=[];
 for(const k of [...MASS,...ENERGY]){
  const v=n[k+'_100g'];
  if(v===undefined||v===null){nutrients.push({provider_key:k+'_100g',amount:null,status:'missing',unit:ENERGY.includes(k)?(k==='energy-kcal'?'kcal':'kJ'):'g'});continue;}
  if(!valid(v)||v>(k==='energy-kcal'?1000:ENERGY.includes(k)?4184:100))fail('implausible_nutrition');
  if(n[k+'_modifier']!=null&&n[k+'_modifier']!==''){if(CORE.includes(k))fail('qualified_core');nutrients.push({provider_key:k+'_100g',amount:null,status:'qualified',unit:ENERGY.includes(k)?(k==='energy-kcal'?'kcal':'kJ'):'g'});continue;}
  if(['energy','energy-kj'].includes(k)&&Math.abs(v-n['energy-kcal_100g']*4.184)>Math.max(.1,n['energy-kcal_100g']*4.184*.01)){nutrients.push({provider_key:k+'_100g',amount:null,status:'conflict',unit:'kJ'});continue;}
  if(Object.hasOwn(n,k)&&n[k]!==v)fail('contradictory_original_amount');
  const unit=n[k+'_unit'];let factor=1;
  if(unit!=null){
   const u=typeof unit==='string'?unit.toLowerCase().replace(/^(ug|μg|µg)$/,'mcg'):'';
   if(ENERGY.includes(k)){if(!['kj','kcal'].includes(u))fail('unsupported_source_unit');factor=k==='energy-kcal'?(u==='kj'?1/4.184:1):(u==='kcal'?4.184:1);}
   else {if(!['g','mg','mcg'].includes(u))fail('unsupported_source_unit');factor={g:1,mg:.001,mcg:.000001}[u];}
  }
  if(Object.hasOwn(n,k+'_value')){if(unit==null||!valid(n[k+'_value'])||!close(v,n[k+'_value']*factor))fail('contradictory_original_amount');}
  if(Object.hasOwn(n,k+'_serving')&&(!valid(n[k+'_serving'])||!servingClose(v*grams/100,n[k+'_serving'])))fail('contradictory_serving');
  nutrients.push({provider_key:k+'_100g',amount:v,status:'valid',unit:ENERGY.includes(k)?(k==='energy-kcal'?'kcal':'kJ'):'g'});
 }
 // Secondary energy is evidence, not a replacement for unqualified declared kcal.
 // Prepared namespaces remain in the raw snapshot and never enter the as-sold array.
 if(new TextEncoder().encode(JSON.stringify(e)).length>58000)fail('evidence_too_large');
 return {canonical_code:gtin(s.code),servingGrams:grams,basis:'per_100g',nutrients};
}
