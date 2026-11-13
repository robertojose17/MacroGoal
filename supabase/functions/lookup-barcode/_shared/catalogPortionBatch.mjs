import {SEARCH_SNAPSHOT_FIELDS} from './searchHydration.mjs';
import {readCatalogPortionSource} from './catalogPortionEvidence.mjs';
import {applyUsdaPortion} from './foodPortions.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const numeric=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))&&Number(x)>=0;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function valid(row){
 return plain(row)&&SEARCH_SNAPSHOT_FIELDS.every(k=>Object.hasOwn(row,k))&&uuid(row.id)&&['100g','serving'].includes(row.macros_per)&&['calories','protein','carbs','fat'].every(k=>numeric(row[k]))&&(row.fiber===null||numeric(row.fiber))&&numeric(row.serving_size)&&Number(row.serving_size)>0&&(row.serving_count===null||numeric(row.serving_count)&&Number(row.serving_count)>0)&&(row.nutriments===null||plain(row.nutriments))&&['name','product_name','generic_name'].some(k=>typeof row[k]==='string'&&row[k].trim());
}
/** One read-only atomic batch binds current catalog/protection and cached source.
 * No provider fetch, claims, mutation, retry or client-supplied nutrition. Failure
 * returns the original products so existing uncertain authority remains intact. */
export async function attachCatalogPortionSources(products,admin,mapCurrent,milliseconds=300){
 const ids=[...new Set(products.map(p=>p._db_id).filter(uuid))].slice(0,100);
 if(!ids.length)return products;
 const controller=new AbortController();let timer;let rows=[];
 try{
  rows=await Promise.race([(async()=>{const {data,error}=await admin.rpc('read_catalog_portion_sources_v1',{p_food_ids:ids}).abortSignal(controller.signal);return !error&&Array.isArray(data)&&data.length<=100?data:[];})(),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve([]);},Math.min(400,Math.max(1,milliseconds)));})]);
 }catch{}finally{clearTimeout(timer);controller.abort();}
 const byId=new Map(),duplicates=new Set();
 for(const entry of rows){if(!plain(entry)||!ids.includes(entry.id))continue;if(byId.has(entry.id))duplicates.add(entry.id);byId.set(entry.id,entry);}
 return products.map(product=>{
  const entry=byId.get(product._db_id);
  if(!entry||duplicates.has(product._db_id)||typeof entry.protected!=='boolean'||!valid(entry.snapshot)||entry.snapshot.id!==product._db_id||!Number.isInteger(entry.food_revision)||entry.food_revision<0)return product;
  if(!entry.protected&&!/^(g|gram|grams)$/i.test(String(entry.snapshot.serving_unit).trim()))return product;
  const current=mapCurrent(entry.snapshot,entry.protected);
  if(!current||current._db_id!==product._db_id)return product;
  if(entry.protected||current.requires_label_confirmation===true)return current;
  const evidence=readCatalogPortionSource(entry.snapshot,entry.portion_source);
  if(entry.snapshot.source==='usda')return applyUsdaPortion(current,evidence?._portion_evidence);
  return evidence?{...current,...evidence,_portion_source_revision:entry.food_revision,_practical_portion_evidence:{...evidence._practical_portion_evidence,food_revision:entry.food_revision}}:current;
 });
}
/** Scan keeps its existing full food payload (including micros). Attach evidence
 * only if the current atomic snapshot still agrees with that payload's nutrition
 * and identity; a concurrent change never splices new portions into old macros. */
export async function decorateCatalogScanItem(item,admin,milliseconds=300){
 if(!uuid(item?.id))return item;
 const sameFields=['id','barcode','source','usda_fdc_id','name','product_name','generic_name','calories','protein','carbs','fat','fiber','macros_per','serving_size','serving_unit','serving_quantity','serving_description','serving_count'];
 const [result]=await attachCatalogPortionSources([{_db_id:item.id}],admin,(row,protectedRow)=>{
  if(!sameFields.every(k=>(row[k]??null)===(item[k]??null)))return null;
  return {_db_id:row.id,_usda_fdc_id:row.usda_fdc_id,product_name:row.product_name||row.name||row.generic_name,nutriments:{},...(protectedRow?{_serving_authority:'confirmed_correction'}:{})};
 },milliseconds);
 return {...item,...(result?._serving_authority?{_serving_authority:result._serving_authority}:{}),
  _portion_evidence:result?._portion_evidence??null,
  ...(result?._practical_portion_evidence?{_practical_portion_evidence:result._practical_portion_evidence,_portion_source_revision:result._portion_source_revision}:{})};
}
