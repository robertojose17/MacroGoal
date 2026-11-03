// Public provider food facts only. Never pass receipts, account IDs, URLs or photos.
const validNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const text=(s,max=160)=>typeof s==='string'&&s.trim().length<=max&&!/[\u0000-\u001f<>]/.test(s)?s.trim():'';
export function captureUsdaNutrition(food,expectedId,retrievedAt){
 const id=String(expectedId??'');
 if(!/^\d{1,20}$/.test(id)||String(food?.fdcId)!==id||!text(food.description)||!Number.isFinite(Date.parse(retrievedAt)))return null;
 const facts={};
 for(const row of (Array.isArray(food.foodNutrients)?food.foodNutrients:[]).slice(0,512)){
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
  facts[key]={value,unit:'provider_field',basis:key.endsWith('_serving')?'serving':'provider_100',...(key.endsWith('_serving')&&servingGrams?{grams:servingGrams}:{})};
 }
 if(!Object.keys(facts).length)return null;
 return {version:1,provider:'openfoodfacts',identity:code,description:text(product.product_name),formulation:text(product.last_modified_t==null?'':String(product.last_modified_t),64),retrievedAt:new Date(retrievedAt).toISOString(),facts};
}
export function resolveNutritionRefresh(current,candidate,expectedRevision){
 if(!candidate||!candidate.facts)return {status:'invalid',record:current};
 if(!current)return {status:'insert',record:structuredClone(candidate)};
 if(current.revision!==expectedRevision)return {status:'conflict',record:current};
 if(current.provider!==candidate.provider||current.identity!==candidate.identity||current.description!==candidate.description||current.formulation!==candidate.formulation)return {status:'identity_conflict',record:current};
 if(current.confirmed===true)return {status:'protected',record:current};
 const facts=structuredClone(current.facts??{}),conflicts=[];
 for(const [key,value] of Object.entries(candidate.facts)){
  if(!Object.hasOwn(facts,key)||facts[key]===null)facts[key]=structuredClone(value);
  else if(JSON.stringify(facts[key])!==JSON.stringify(value))conflicts.push(key);
 }
 // Preserve an entire existing record when a provider contradicts any known fact.
 if(conflicts.length)return {status:'nutrient_conflict',record:current,conflicts};
 return {status:'fill_missing',record:{...current,facts,retrievedAt:candidate.retrievedAt}};
}
export function shouldRefreshNutrition(record,now,ttlMs=30*86400000){
 if(record?.confirmed===true)return false;
 const time=Date.parse(record?.retrievedAt??'');
 return !Number.isFinite(time)||now-time>=ttlMs;
}
