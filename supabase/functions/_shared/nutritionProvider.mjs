import {captureOffMassSupported} from './offMass.mjs';
/** LOCAL REVIEW CANDIDATE. Pure capture; no provider SDKs or implicit network. */
const DAY = 86400000;
const LOGICAL_UNITS = Object.freeze({calcium:'mg',iron:'mg',magnesium:'mg',phosphorus:'mg',potassium:'mg',sodium:'mg',zinc:'mg',copper:'mg',manganese:'mg',selenium:'mcg',vitamin_c:'mg',thiamin:'mg',riboflavin:'mg',niacin:'mg',vitamin_b6:'mg',folate:'mcg',vitamin_b12:'mcg',vitamin_a_rae:'mcg',vitamin_e:'mg',vitamin_d:'mcg',vitamin_k:'mcg'});
const CANONICAL = {calcium:'calcium_mg',iron:'iron_mg',magnesium:'magnesium_mg',phosphorus:'phosphorus_mg',potassium:'potassium_mg',sodium:'sodium_mg',zinc:'zinc_mg',copper:'copper_mg',manganese:'manganese_mg',selenium:'selenium_mcg',vitamin_c:'vitamin_c_mg',thiamin:'vitamin_b1_mg',riboflavin:'vitamin_b2_mg',niacin:'vitamin_b3_mg',vitamin_b6:'vitamin_b6_mg',folate:'folate_mcg',vitamin_b12:'vitamin_b12_mcg',vitamin_e:'vitamin_e_mg',vitamin_d:'vitamin_d_mcg',vitamin_k:'vitamin_k_mcg'};
const LEGACY = {thiamin:'vitamin_b1',riboflavin:'vitamin_b2',niacin:'vitamin_b3',folate:'vitamin_b9'};
const USDA = {1087:'calcium',1089:'iron',1090:'magnesium',1091:'phosphorus',1092:'potassium',1093:'sodium',1095:'zinc',1098:'copper',1101:'manganese',1103:'selenium',1162:'vitamin_c',1165:'thiamin',1166:'riboflavin',1167:'niacin',1175:'vitamin_b6',1177:'folate',1178:'vitamin_b12',1106:'vitamin_a_rae',1109:'vitamin_e',1114:'vitamin_d',1185:'vitamin_k'};
const OFF = {'calcium':'calcium','iron':'iron','magnesium':'magnesium','phosphorus':'phosphorus','potassium':'potassium','sodium':'sodium','zinc':'zinc','copper':'copper','manganese':'manganese','selenium':'selenium','vitamin-c':'vitamin_c','vitamin-b1':'thiamin','vitamin-b2':'riboflavin','vitamin-pp':'niacin','vitamin-b6':'vitamin_b6','vitamin-b9':'folate','vitamin-b12':'vitamin_b12','vitamin-e':'vitamin_e','vitamin-d':'vitamin_d','vitamin-k':'vitamin_k'};
export const NUTRIENT_MAP = Object.freeze(Object.entries(CANONICAL).map(([logical,key])=>({key,legacy:LEGACY[logical]??logical,unit:LOGICAL_UNITS[logical],usda:Object.keys(USDA).filter(k=>USDA[k]===logical),off:Object.keys(OFF).filter(k=>OFF[k]===logical),aliases:[logical,LEGACY[logical]??logical,...(logical==='folate'?['folates']:[])]})));
export const MICRO_UNITS = Object.freeze(Object.fromEntries(NUTRIENT_MAP.map(n=>[n.key,n.unit])));
const META = Object.fromEntries(NUTRIENT_MAP.map(n=>[n.key,n]));
const MASS_OFF = new Set([...Object.keys(OFF),'fat','proteins','carbohydrates','fiber','sugars','salt','saturated-fat','trans-fat','polyunsaturated-fat','monounsaturated-fat','added-sugars','soluble-fiber','insoluble-fiber','starch','water','cholesterol']);
const clean = (v,max=160) => typeof v==='string' && v.trim().length<=max && !/[\u0000-\u001f<>]/.test(v) ? v.trim() : '';
// Absence is allowed; malformed PRESENT identity must never become absence.
function identityField(value,max=160) {
 if(value===undefined||value===null)return null;
 if(typeof value!=='string'||value.length>max||/[\u0000-\u001f<>]/.test(value))throw new TypeError('Malformed provider identity');
 return value.trim()||null;
}
const finite = v => typeof v==='number' && Number.isFinite(v);
const unit = u => clean(u,24).toLowerCase().replace(/^(ug|μg|µg)$/,'mcg');
const own = (o,k) => Object.hasOwn(o ?? {},k);
const plain = o => o!==null && typeof o==='object' && !Array.isArray(o);
function timestamp(v) { const n=typeof v==='string'?Date.parse(v):NaN;if(!Number.isFinite(n))throw new TypeError('Invalid capture time');return new Date(n).toISOString(); }
function convert(v,from,to) { const scale={g:1,mg:1e-3,mcg:1e-6};return from===to?v:own(scale,from)&&own(scale,to)?v*scale[from]/scale[to]:null; }
function finish(e) {
 if(e.nutrients.length===0||e.nutrients.length>512||new TextEncoder().encode(JSON.stringify(e)).byteLength>64000||e.nutrients.some(n=>n.amount!==null&&Math.abs(n.amount)>1e9))throw new TypeError('Evidence exceeds bounded SQL contract');
 const candidates=Object.create(null), ambiguous=new Set();
 for(const n of e.nutrients){
  if(!own(MICRO_UNITS,n.key)||n.status!=='valid'||n.basis.kind!=='per_100g')continue;
  const amount=convert(n.amount,n.unit,MICRO_UNITS[n.key]);
  if(amount===null||!Number.isFinite(amount))continue;
  const c={amount,unit:MICRO_UNITS[n.key],basis:'per_100g'};
  if(own(candidates,n.key)&&candidates[n.key].amount!==amount)ambiguous.add(n.key);else candidates[n.key]=c;
 }
 for(const k of ambiguous)delete candidates[k];
 const stored={...e,conflicts:[...ambiguous].map(key=>({kind:'duplicate_nutrient',key}))};
 // Conservative pretty-serialized bound also covers PostgreSQL jsonb whitespace.
 if(new TextEncoder().encode(JSON.stringify(stored,null,1)).byteLength>65536||stored.conflicts.length>64)throw new TypeError('Evidence exceeds bounded SQL contract');
 return {...stored,canonical_candidates:candidates};
}
function row(e,key,providerKey,value,u,basis,extra={}) {
 if(providerKey.length>100||key.length>100)throw new TypeError('Invalid nutrient key');
 // Project ONLY nutrition fields. Malformed/non-number values are represented as missing, never arbitrary strings/objects.
 return {key:CANONICAL[key]??key,provider_key:providerKey,amount:finite(value)?value:null,unit:u||'unknown',basis:{kind:basis},source:{provider:e.provider,source_id:e.source_id},captured_at:e.captured_at,status:!finite(value)?'missing':value<0?'negative':'valid',...extra};
}
export function captureUSDA(food,{capturedAt,expectedId}={}) {
 const id=String(food?.fdcId??'');if(!/^\d{1,20}$/.test(id)||id!==String(expectedId)||!clean(food?.description))throw new TypeError('USDA identity mismatch');
 const description=identityField(food.description),dataType=identityField(food.dataType,64),ingredients=identityField(food.ingredients,4096);
 const brandOwner=identityField(food.brandOwner),brandName=identityField(food.brandName);
 identityField(food.preparation); // Validate even though exact description is USDA preparation identity.
 const e={version:2,provider:'usda',source_id:id,captured_at:timestamp(capturedAt),basis:{kind:'per_100g'},identity:{description,formulation:['Foundation','SR Legacy','Survey (FNDDS)'].includes(dataType)?dataType:ingredients,preparation:description,brand:brandOwner||brandName,ingredients_text:ingredients,data_type:dataType},nutrients:[]};
 if(!Array.isArray(food.foodNutrients)||food.foodNutrients.length>512)throw new TypeError('Invalid nutrient collection');
 for(const r of food.foodNutrients){const n=r?.nutrient??r;const k=n?.id??r?.nutrientId;if(!Number.isSafeInteger(k)||k<=0)continue; e.nutrients.push(row(e,USDA[k]??`usda_${k}`,String(k),r.amount??r.value,unit(n.unitName??r.unitName),'per_100g'));}
 for(const k of Object.keys(e.identity))if(e.identity[k]==='')e.identity[k]=null;
 return finish(e);
}
export function captureOFF(product,{capturedAt,expectedId,verifiedBasis}={}) {
 const id=String(product?.code??'');if(!/^\d{8,14}$/.test(id)||id!==String(expectedId)||!clean(product?.product_name))throw new TypeError('OFF identity mismatch');
 const basis=verifiedBasis==='per_100g'?'per_100g':'provider_100';
 const ingredients=identityField(product.ingredients_text,4096);
 const e={version:2,provider:'openfoodfacts',source_id:id,captured_at:timestamp(capturedAt),basis:{kind:basis},identity:{description:identityField(product.product_name),formulation:ingredients,preparation:identityField(product.preparation),brand:identityField(product.brands),ingredients_text:ingredients,data_type:null},nutrients:[]};
 if(!plain(product.nutriments)||Object.keys(product.nutriments).length>8192)throw new TypeError('Invalid nutriments');
 for(const [k,v] of Object.entries(product.nutriments)){
  if(!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(k)||/_(unit|modifier|label)$/.test(k))continue;
  const m=k.match(/^([a-z0-9][a-z0-9_-]{0,79})_(100g|serving|value)$/);
  if(!m&&!finite(v))continue;
  const base=m?.[1]??k,suffix=m?.[2],label=unit(product.nutriments[`${base}_unit`]);
  // OFF normalized mass fields are grams. Display units must NOT be applied a second time.
  const normalized=suffix==='100g'||suffix==='serving';
  const u=!normalized?(label||'unknown'):MASS_OFF.has(base)?'g':base==='energy-kcal'?'kcal':base==='energy-kj'||base==='energy'?'kj':'unknown';
  e.nutrients.push(row(e,OFF[base]??`off_${base}`,k,v,u,!normalized?'unknown':suffix==='serving'?'serving':basis,{label_unit:label||null}));
 }
 for(const k of Object.keys(e.identity))if(e.identity[k]==='')e.identity[k]=null;
 return finish(e);
}
export function resolveMissing(food,evidence) {
 const conflicts=[];
 if(!food||!evidence||food.provider!==evidence.provider||String(food.source_id)!==evidence.source_id)conflicts.push({kind:'source_identity'});
 for(const k of ['description','formulation','preparation','brand','ingredients_text','data_type'])if(!own(food?.identity,k)||food.identity[k]!==evidence?.identity?.[k])conflicts.push({kind:'identity',key:k});
 if(evidence?.conflicts?.length)conflicts.push(...evidence.conflicts);
 const identity=evidence?.identity;
 const generic=evidence?.provider==='usda'&&['Foundation','SR Legacy','Survey (FNDDS)'].includes(identity?.data_type);
 if(!identity?.description||!identity?.preparation||(!generic&&(!identity?.brand||!identity?.ingredients_text||!identity?.formulation)))conflicts.push({kind:'incomplete_identity'});
 if(conflicts.length)return {additions:{},conflicts};
 const additions={};
 if(food.macros_per!=='100g')return {additions,conflicts:[{kind:'basis'}]};
 for(const [k,v] of Object.entries(evidence.canonical_candidates??{})){
  if(!own(MICRO_UNITS,k)||!plain(v)||!finite(v.amount)||v.amount<0||v.unit!==MICRO_UNITS[k]||v.basis!=='per_100g')continue;
  // Any existing non-null value, including zero, negative, or malformed legacy data is protected.
  const canonical=k,meta=META[k];if(!meta)continue;
  const aliases=[canonical,meta.legacy,...meta.aliases,...meta.off,...meta.usda];
  const occupied=aliases.some(a=>[food,food.micronutrients].some(o=>own(o,a)&&o[a]!==null)||[food.nutriments,food.off_data?.nutriments].some(o=>[a,`${a}_100g`,`${a}_serving`].some(x=>own(o,x))));
  if(occupied)continue;
  additions[canonical]={...v};
 }
 return {additions,conflicts};
}
export function shouldRefreshNutrition(record,now,ttlMs=30*DAY) {
 if(!finite(now)||!finite(ttlMs)||ttlMs<DAY||ttlMs>90*DAY)return false;
 const captured=Date.parse(record?.captured_at??'');
 return !Number.isFinite(captured)||captured>now||now-captured>=ttlMs;
}
/** Trusted SERVER-only orchestration. RPC must independently validate eligibility,
 * identity anchor, raw evidence, canonical mappings, ownership, and CAS. Never retry
 * an uncertain RPC write; reconcile request ID first. No implicit/background work.
 */
export function createRefreshService({fetchProvider,claimRefresh,refreshEvidence,now=Date.now,networkEnabled=false,ttlMs=30*DAY,budget=10,timeoutMs=8000}={}) {
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000)throw new TypeError('Invalid timeout');
 if(!Number.isSafeInteger(budget)||budget<0||budget>1000||!finite(ttlMs)||ttlMs<DAY||ttlMs>90*DAY)throw new TypeError('Invalid bounded policy');
 const inFlight=new Map();let remaining=budget;
 return {reuse(food,{explicitReuse=false,requestId,verifiedBasis}={}) {
  if(!explicitReuse)return Promise.resolve({status:'not_explicit_reuse'});
  if(!networkEnabled)return Promise.resolve({status:'network_disabled'});
  if(!food?.id||!Number.isSafeInteger(food.revision)||food.revision<0||!['usda','openfoodfacts'].includes(food.provider)||!/^\d{1,20}$/.test(String(food.source_id))||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId??''))return Promise.resolve({status:'ineligible'});
  if(!shouldRefreshNutrition(food,now(),ttlMs))return Promise.resolve({status:'fresh'});
  const key=JSON.stringify([food.id,food.revision,food.provider,food.source_id,food.identity]);
  if(inFlight.has(key))return inFlight.get(key);
  if(remaining<=0)return Promise.resolve({status:'budget_exhausted'});
  remaining--;
  const task=(async()=>{
   // One shared wall-clock deadline bounds claim, provider, parsing and write.
   const deadline=Date.now()+timeoutMs;
   async function within(fn) {
    const remainingMs=deadline-Date.now();if(remainingMs<=0)throw Error('deadline_exceeded');
    const controller=new AbortController();let timer;
    try{return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline_exceeded'));},remainingMs);})]);}
    finally{clearTimeout(timer);}
   }
   let claim;try{claim=await within(signal=>claimRefresh({p_food_id:food.id,p_expected_revision:food.revision,p_request_id:requestId,p_provider:food.provider,p_source_id:food.source_id},{signal}));}catch{return {status:'claim_write_uncertain'};}
   if(claim?.status!=='claimed')return {status:['fresh','busy','revision_conflict','identity_conflict','already_completed'].includes(claim?.status)?claim.status:'claim_rejected'};
   let raw;
   try{raw=await within(signal=>fetchProvider({provider:food.provider,source_id:food.source_id,signal}));}catch(error){return {status:error?.message==='deadline_exceeded'?'provider_timeout':'provider_failed'};}
   let evidence;try{evidence=(food.provider==='usda'?captureUSDA:food.mass_bound===true?captureOffMassSupported:captureOFF)(raw,{capturedAt:new Date(now()).toISOString(),expectedId:food.source_id,verifiedBasis});}catch{return {status:'invalid_provider_evidence'};}
   try{
    const result=await within(signal=>refreshEvidence({p_food_id:food.id,p_expected_revision:food.revision,p_request_id:requestId,p_evidence:((({canonical_candidates,...stored})=>stored)(evidence))},{signal}));
    if(!['applied','evidence_only','conflict','duplicate'].includes(result?.status))return {status:'rpc_rejected'};
    return {status:result.status,result};
   }catch{return {status:'rpc_write_uncertain'};}
  })().finally(()=>inFlight.delete(key));
  inFlight.set(key,task);return task;
 }};
}

// USDA search values are already per100g even for branded foods. Select exact
// nutrient IDs AND units; convert sodium mg to OFF grams exactly once.
export function usdaSearchNutriments(food) {
 let evidence;try{const id=food?.fdcId??food?.fdcid;evidence=captureUSDA({...food,fdcId:id},{expectedId:String(id),capturedAt:new Date().toISOString()});}catch{return {};}
 const result={};
 for(const [key,ids,expectedUnit,factor] of [
  ['energy-kcal_100g',['1008','2048','2047'],'kcal',1],['proteins_100g',['1003'],'g',1],
  ['carbohydrates_100g',['1005'],'g',1],['fat_100g',['1004'],'g',1],['fiber_100g',['1079'],'g',1],
  ['sugars_100g',['2000','1063'],'g',1],['sodium_100g',['1093'],'mg',.001]
 ]){
  for(const id of ids){const rows=evidence.nutrients.filter(n=>n.provider_key===id&&n.unit===expectedUnit&&n.status==='valid');
   if(!rows.length)continue;if(rows.some(n=>n.amount!==rows[0].amount))break;result[key]=rows[0].amount*factor;break;}
 }
 return result;
}

