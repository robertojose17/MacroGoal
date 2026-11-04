// Public provider food facts only. Never pass receipts, account IDs, URLs or photos.
const validNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const text=(s,max=160)=>typeof s==='string'&&s.trim().length<=max&&!/[\u0000-\u001f<>]/.test(s)?s.trim():'';
export function captureUsdaNutrition(food,expectedId,retrievedAt){
 const id=String(expectedId??'');
 if(!/^\d{1,20}$/.test(id)||String(food?.fdcId)!==id||!text(food.description)||!Number.isFinite(Date.parse(retrievedAt)))return null;
 const facts={};
 for(const row of (Array.isArray(food.foodNutrients)?food.foodNutrients:[]).slice(0,512)){
  if(!row||typeof row!=='object')continue;
  const nutrient=row.nutrient??row,id=nutrient.id??row.nutrientId;
  const value=row.amount??row.value,unit=text(nutrient.unitName??row.unitName,24).toLowerCase();
  if(!Number.isInteger(id)||id<=0||!validNumber(value)||!unit)continue;
  const key=String(id);const next={value,unit,basis:'100g'};
  if(facts[key]&&JSON.stringify(facts[key])!==JSON.stringify(next))return null;
  facts[key]=next;
 }
 if(!Object.keys(facts).length)return null;
 return {version:1,provider:'usda',identity:id,description:text(food.description),formulation:text(food.publicationDate??food.modifiedDate??'',64),retrievedAt:new Date(retrievedAt).toISOString(),facts};
}
export function captureOffNutrition(product,expectedCode,retrievedAt){
 const code=String(expectedCode??'');
 if(!/^\d{8,14}$/.test(code)||String(product?.code)!==code||!text(product.product_name)||!Number.isFinite(Date.parse(retrievedAt)))return null;
 const facts={};const grams=product.serving_quantity;
 const label=String(product.serving_size??'');const match=label.match(/(\d+(?:\.\d+)?)\s*g\b/i);
 const servingGrams=match&&validNumber(grams)&&grams>0&&Math.abs(Number(match[1])-grams)<0.01?grams:null;
 for(const [key,value] of Object.entries(product.nutriments??{}).slice(0,512)){
  if(!/^[a-z0-9_-]{1,80}_(100g|serving)$/.test(key)||!validNumber(value))continue;
  // OFF's _100g may represent 100ml for liquids. Retain provider basis; do not infer density.
  facts[key]={value,unit:text(product.nutriments[key.replace(/_(100g|serving)$/, '')+'_unit'],24)||'provider_field',basis:key.endsWith('_serving')?'serving':'provider_100',...(key.endsWith('_serving')&&servingGrams?{grams:servingGrams}:{})};
 }
 if(!Object.keys(facts).length)return null;
 return {version:1,provider:'openfoodfacts',identity:code,description:text(product.product_name),formulation:text(product.last_modified_t==null?'':String(product.last_modified_t),64),retrievedAt:new Date(retrievedAt).toISOString(),facts};
}

const plainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function validNutritionEvidence(record){
 if(!plainObject(record)||record.version!==1||!['usda','openfoodfacts'].includes(record.provider)||!/^\d{1,20}$/.test(record.identity)||!text(record.description)||!Number.isFinite(Date.parse(record.retrievedAt))||!plainObject(record.facts))return false;
 const facts=Object.entries(record.facts);
 return facts.length>0&&facts.length<=512&&facts.every(([key,fact])=>/^[a-z0-9_-]{1,100}$/.test(key)&&!['__proto__','prototype','constructor'].includes(key)&&plainObject(fact)&&validNumber(fact.value)&&!!text(fact.unit,24)&&['100g','provider_100','serving'].includes(fact.basis)&&(fact.grams===undefined||(fact.basis==='serving'&&validNumber(fact.grams)&&fact.grams>0)));
}
const sameFact=(a,b)=>a?.value===b?.value&&a?.unit===b?.unit&&a?.basis===b?.basis&&a?.grams===b?.grams;
export function resolveNutritionRefresh(current,candidate,expectedRevision){
 if(!validNutritionEvidence(candidate))return {status:'invalid',record:current};
 if(!current)return {status:'insert',record:structuredClone(candidate)};
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||current.revision!==expectedRevision)return {status:'conflict',record:current};
 if(current.provider!==candidate.provider||current.identity!==candidate.identity||current.description!==candidate.description||current.formulation!==candidate.formulation)return {status:'identity_conflict',record:current};
 if(current.confirmed===true)return {status:'protected',record:current};
 if(Date.parse(candidate.retrievedAt)<Date.parse(current.retrievedAt))return {status:'stale_evidence',record:current};
 const facts=structuredClone(current.facts??{}),conflicts=[];
 for(const [key,value] of Object.entries(candidate.facts)){
  if(!Object.hasOwn(facts,key)||facts[key]===null)facts[key]=structuredClone(value);
  else if(!sameFact(facts[key],value))conflicts.push(key);
 }
 // Preserve an entire existing record when a provider contradicts any known fact.
 if(conflicts.length)return {status:'nutrient_conflict',record:current,conflicts};
 return {status:'fill_missing',record:{...current,facts,retrievedAt:candidate.retrievedAt}};
}
export function shouldRefreshNutrition(record,now,ttlMs=30*86400000){
 if(record?.confirmed===true)return false;
 const time=Date.parse(record?.retrievedAt??'');
 return !Number.isFinite(now)||!Number.isFinite(time)||time>now||now-time>=ttlMs;
}

// Best-effort append only. The RPC never updates canonical food or diary rows.
export async function recordNutritionEvidence(admin,foodId,evidence,milliseconds=150){
 if(!foodId||!evidence)return false;
 const controller=new AbortController();let timer;
 try{
  const result=await Promise.race([
   admin.rpc('record_food_nutrition_evidence_v1',{p_food_id:foodId,p_expected_revision:null,p_payload:evidence}).abortSignal(controller.signal),
   new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},milliseconds);})
  ]);
  return Boolean(result&&!result.error&&Number.isInteger(result.data));
 }catch{return false;}finally{if(timer)clearTimeout(timer);}
}

// Search uses the same ID/unit evidence as exact-food capture. Missing is never zero.
export function usdaSearchNutriments(food){
 const id=food?.fdcId??food?.fdcid;
 const evidence=captureUsdaNutrition({...food,fdcId:id},id,new Date().toISOString());
 const result={};if(!evidence)return result;
 const choose=(ids,unit)=>{for(const id of ids){const f=evidence.facts[String(id)];if(f?.unit===unit)return f.value;}return undefined;};
 for(const [field,ids,unit,factor] of [
 ['energy-kcal_100g',[1008,2048,2047],'kcal',1],['proteins_100g',[1003],'g',1],
 ['carbohydrates_100g',[1005],'g',1],['fat_100g',[1004],'g',1],['fiber_100g',[1079],'g',1],
 ['sugars_100g',[2000,1063],'g',1],['sodium_100g',[1093],'mg',0.001]]){
  const value=choose(ids,unit);if(value!==undefined)result[field]=value*factor;
 }
 return result;
}
