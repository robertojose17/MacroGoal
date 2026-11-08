import { readUsdaPortions } from '../supabase/functions/_shared/foodPortions.mjs';
type PortionProduct={_usda_fdc_id?:unknown;_portion_evidence?:unknown;_serving_authority?:unknown;product_name?:unknown;generic_name?:unknown};
/** Initial display preference only, never provider evidence or a catalog write.
 * Prefer one explicitly source-labelled medium/average size, not an inferred mass.
 * Multiple equally plausible sizes remain choices rather than an invented standard.
 */
export function preferredUsdaPortion(product:PortionProduct,mode:string,itemId?:string){
 if(mode==='edit'||itemId||product._serving_authority==='confirmed_correction')return null;
 const fdcId=product._usda_fdc_id;
 if((typeof fdcId!=='string'&&typeof fdcId!=='number')||!/^\d+$/.test(String(fdcId)))return null;
 const envelope=product._portion_evidence as {foodDescription?:unknown}|null;
 const identity=(v:unknown)=>typeof v==='string'?v.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '):'';
 if(!identity(product.product_name||product.generic_name)||identity(product.product_name||product.generic_name)!==identity(envelope?.foodDescription))return null;
 const portions=readUsdaPortions(envelope,fdcId).filter((p:{description:string})=>!(/^(?:g|grams?|kg|kilograms?|mg|milligrams?|ml|milliliters?|liters?|oz|ounces?|lb|pounds?)$/i.test(p.description.trim())));
 const medium=portions.filter((p:{description:string})=>/\b(?:medium|average)\b/i.test(p.description));
 const chosen=medium.length===1?medium[0]:medium.length===0&&portions.length===1?portions[0]:null;
 if(!chosen)return null;
 return {key:'portion:'+chosen.key,gramsPerUnit:chosen.grams/chosen.amount,description:chosen.description};
}
