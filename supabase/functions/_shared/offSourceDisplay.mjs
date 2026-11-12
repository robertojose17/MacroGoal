// Read-only source projection. Never grants canonical food or logging authority.
import {MASS_NUTRIENTS} from './offMass.mjs';
const text=(v,max)=>typeof v==='string'?v.slice(0,max):null;
export function offSourceDisplay(product){
 const nutriments={};
 for(const base of [...MASS_NUTRIENTS,'energy-kcal','energy-kj','energy']){
  for(const suffix of ['_100g','_serving']){const key=base+suffix,value=product?.nutriments?.[key];if(value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e9))nutriments[key]=value;}
  for(const suffix of ['_unit','_modifier']){const key=base+suffix,value=product?.nutriments?.[key];if(typeof value==='string'&&value.length<=24)nutriments[key]=value;}
 }
 return {code:text(product?.code,32),product_name:text(product?.product_name,160),brands:text(product?.brands,160),serving_size:text(product?.serving_size,160),serving_quantity:typeof product?.serving_quantity==='number'&&Number.isFinite(product.serving_quantity)?product.serving_quantity:text(product?.serving_quantity,32),serving_quantity_unit:text(product?.serving_quantity_unit,24),nutrition_data_per:text(product?.nutrition_data_per,24),nutriments};
}
