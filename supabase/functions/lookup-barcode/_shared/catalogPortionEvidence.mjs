import {samePackage} from './offMass.mjs';
import {readUsdaPortions} from './foodPortions.mjs';
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const name=x=>typeof x==='string'?x.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '):'';
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=100000;
const label=x=>typeof x==='string'&&x.trim().length>0&&x.length<=160&&!/[\x00-\x1f<>]/.test(x);
/** Source projection only: caller must establish current UUID/revision/protection
 * from the service-only batch RPC. This never derives density or a household unit. */
export function readCatalogPortionSource(row,source){
 if(!plain(row)||!plain(source)||row.macros_per!=='100g'||!['g','gram','grams'].includes(String(row.serving_unit).toLowerCase()))return null;
 const expectedName=name(row.product_name||row.name||row.generic_name);
 if(!expectedName)return null;
 if(source.provider==='usda'){
  const envelope=source.portion_evidence;
  if(row.source!=='usda'||String(row.usda_fdc_id)!==source.source_id||expectedName!==name(envelope?.foodDescription)||!readUsdaPortions(envelope,source.source_id).length)return null;
  return {_usda_fdc_id:source.source_id,_portion_evidence:envelope};
 }
 if(source.provider!=='openfoodfacts'||row.source!=='openfoodfacts'||!samePackage(String(row.barcode),source.source_id))return null;
 const raw=source.serving_source;
 if(!plain(raw)||!samePackage(raw.code,source.source_id)||expectedName!==name(raw.product_name)||!label(raw.serving_size)||(raw.serving_quantity_unit!=null&&raw.serving_quantity_unit!=='g')||raw.preparation!=null||raw.nutrition_data_prepared_per!=null)return null;
 if(typeof raw.serving_quantity!=='number'&&typeof raw.serving_quantity!=='string')return null;
 if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(raw.serving_quantity)))return null;
 const grams=Number(raw.serving_quantity);
 if(!positive(grams)||!Number.isFinite(Date.parse(source.retrieved_at)))return null;
 // Deliberately require an explicit count, household description and matching
 // gram mass. '28g' cannot become 'one slice'; cup/ml alone is never a mass.
 const match=raw.serving_size.trim().match(/^(\d+(?:\.\d+)?(?:\/\d+)?|\.\d+)\s*([a-z][^()]*?)\s*\(\s*(\d+(?:\.\d+)?)\s*g\s*\)$/i);
 if(!match||Number(match[3])!==grams)return null;
 const count=match[1].split('/').map(Number),amount=count.length===2?count[0]/count[1]:count[0];
 if(!positive(amount))return null;
 const description=match[2].trim();
 if(!label(description)||/\b(?:ml|milliliters?|litres?|liters?|fl\s*oz|fluid\s+ounces?|grams?|g)\b/i.test(description))return null;
 return {_practical_portion_evidence:{version:1,provider:'openfoodfacts',source_id:source.source_id,food_item_id:row.id,food_description:raw.product_name,retrieved_at:source.retrieved_at,portions:[{key:'label',description,amount,grams}]}};
}
