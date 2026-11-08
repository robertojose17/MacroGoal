/** Server-owned source snapshots. No client nutrients, inference, or default zeros. */
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^\d{1,20}$/.test(v);
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const offMass=new Set(['fat','proteins','carbohydrates','fiber','sugars','salt','sodium','saturated-fat','trans-fat','polyunsaturated-fat','monounsaturated-fat','added-sugars','soluble-fiber','insoluble-fiber','starch','water','cholesterol','calcium','iron','magnesium','phosphorus','potassium','zinc','copper','manganese','selenium','vitamin-c','vitamin-b1','vitamin-b2','vitamin-pp','vitamin-b6','vitamin-b9','vitamin-b12','vitamin-e','vitamin-d','vitamin-k']);
/** Byte count for JSON-compatible values rendered as PostgreSQL jsonb::text.
 * Includes separator spaces and numeric exponent expansion (JSON.stringify does not).
 * Call on the serialized/parsed payload so undefined/toJSON behave exactly as sent.
 */
export function postgresJsonbBytes(value) {
 const utf8=s=>new TextEncoder().encode(s).length;
 if(value===null)return 4;
 if(typeof value==='string')return utf8(JSON.stringify(value));
 if(typeof value==='boolean')return value?4:5;
 if(typeof value==='number') {
  if(!Number.isFinite(value))throw Error('invalid_json_number');
  const text=JSON.stringify(value),match=/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
  if(!match)return text.length;
  const digits=match[2].length+(match[3]?.length??0),point=match[2].length+Number(match[4]);
  return match[1].length+(point<=0?2-point+digits:point>=digits?point:digits+1);
 }
 if(Array.isArray(value))return 2+Math.max(0,value.length-1)*2+value.reduce((n,v)=>n+postgresJsonbBytes(v),0);
 if(object(value)) {const entries=Object.entries(value);return 2+Math.max(0,entries.length-1)*2+entries.reduce((n,[k,v])=>n+utf8(JSON.stringify(k))+2+postgresJsonbBytes(v),0);}
 throw Error('invalid_json_value');
}
export function selectedSourceEnvelope(provider,sourceId,raw,capturedAt=new Date().toISOString(),captureScope='detail_response') {
 if(!['detail_response','search_response'].includes(captureScope))throw Error('invalid_capture_scope');
 if(!id(sourceId)||!object(raw)||!Number.isFinite(Date.parse(capturedAt)))throw Error('invalid_source');
 if(!['usda','openfoodfacts'].includes(provider))throw Error('invalid_provider');
 if(String(provider==='usda'?raw.fdcId:(raw.code??raw._id))!==sourceId)throw Error('source_identity_mismatch');
 if(provider==='openfoodfacts'&&raw.code!=null&&raw._id!=null&&String(raw.code)!==String(raw._id))throw Error('source_identity_mismatch');
 const largeUsdaDetail=provider==='usda'&&captureScope==='detail_response';
 const encoded=JSON.stringify(raw);
 if(postgresJsonbBytes(JSON.parse(encoded))>(largeUsdaDetail?1048576:262144))throw Error('source_payload_too_large');
 const nutrients=[];
 if(provider==='usda') {
  if(!Array.isArray(raw.foodNutrients)||raw.foodNutrients.length>512)throw Error('unsupported_nutrient_collection');
  for(const row of raw.foodNutrients) {
   const n=row?.nutrient??row;const key=n?.id??row?.nutrientId;
   const value=row?.amount??row?.value;
   nutrients.push({provider_key:String(key??''),name:typeof n?.name==='string'?n.name:typeof row?.nutrientName==='string'?row.nutrientName:null,
    amount:amount(value),unit:typeof n?.unitName==='string'?n.unitName:typeof row?.unitName==='string'?row.unitName:null,
    status:value==null?'missing':amount(value)===null?'invalid':'valid',basis:'per_100g'});
  }
 } else {
  if(!object(raw.nutriments))throw Error('unsupported_nutrient_collection');
  for(const [key,value] of Object.entries(raw.nutriments)) {
   if(/_(unit|label|modifier)$/.test(key))continue;
   if(nutrients.length>=512)throw Error('unsupported_nutrient_collection');
   const base=key.replace(/_(100g|serving|value)$/,'');
   const normalized=/_(100g|serving)$/.test(key);
   const sourceUnit=normalized?(offMass.has(base)?'g':base==='energy-kcal'?'kcal':['energy','energy-kj'].includes(base)?'kJ':null):(typeof raw.nutriments[base+'_unit']==='string'?raw.nutriments[base+'_unit']:null);
   nutrients.push({provider_key:key,name:base,amount:amount(value),unit:sourceUnit,
    status:value==null?'missing':amount(value)===null?'invalid':'valid',basis:key.endsWith('_100g')?'provider_100':key.endsWith('_serving')?'serving':'provider_declared'});
  }
 }
 // OFF unit labels describe original values, not necessarily normalized amounts.
 // These rows are evidence, not a canonical conversion authority.
 const evidence={version:4,provider,source_id:sourceId,captured_at:new Date(capturedAt).toISOString(),
  source_url:provider==='usda'?'https://fdc.nal.usda.gov/food-details/'+sourceId:'https://world.openfoodfacts.org/product/'+sourceId,
  raw_payload:JSON.parse(encoded),nutrition:{basis:provider==='usda'?'per_100g':'provider_declared',nutrients},capture_scope:captureScope,complete:captureScope==='detail_response'};
 if(postgresJsonbBytes(evidence)>(largeUsdaDetail?2097152:524288))throw Error('evidence_payload_too_large');
 return evidence;
}

