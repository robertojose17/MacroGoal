import { readUsdaPortions } from '../supabase/functions/_shared/foodPortions.mjs';
type PortionProduct={code?:unknown;_source?:unknown;_db_id?:unknown;_portion_source_revision?:unknown;_practical_portion_evidence?:unknown;_usda_fdc_id?:unknown;_portion_evidence?:unknown;_serving_authority?:unknown;product_name?:unknown;generic_name?:unknown};
type MeasuredOption={key:string;description:string;grams:number;amount:number};
const hasAsciiControl=(value:string)=>Array.from(value).some(c=>c.charCodeAt(0)<32);
const normalizedLabel=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
/** A display preference among already validated source measures, not a claim that
 * the source recommends a serving. No food names, densities or weight tables. */
export function chooseMeasuredPracticalPortion(portions:MeasuredOption[]){
 const ranked=portions.flatMap(p=>{
  if(!Number.isFinite(p.grams)||p.grams<=0||!Number.isFinite(p.amount)||p.amount<=0)return [];
  const gramsPerUnit=p.grams/p.amount;
  if(!Number.isFinite(gramsPerUnit)||gramsPerUnit<=0||gramsPerUnit>100000)return [];
  const description=p.description.trim(),label=normalizedLabel(description);
  // Pure mass/volume units are fallback units, not practical household choices.
  if(/^(?:\d+(?:[.,]\d+)?\s*)?(?:g|grams?|kg|kilograms?|mg|milligrams?|ml|milliliters?|liters?|oz|ounces?|lb|pounds?|fl\.?\s*oz)$/.test(label))return [];
  // Counts belong in amount; a separate count inside an unstructured label could
  // otherwise display a double quantity or attach the wrong gram denominator.
  if(/^\d/.test(label))return [];
  // Administrative reference quantities are not household units.
  if(/^(?:racc|nfs|nlea serving)(?:\b|$)/.test(label)||/^(?:(?:quantity|amount|portion|serving size)\s+)?(?:not specified|unspecified|unknown)$/.test(label))return [];
  const rank=/\b(?:medium|average)\b/.test(label)?0
   :/\b(?:slice|slices|piece|pieces|item|items|unit|units|each|whole|egg|eggs)\b/.test(label)?10
   :/^(?:small|large)(?:\b|$)/.test(label)?10
   :/^(?:extra small|extra large|jumbo)(?:\b|$)/.test(label)?20
   :/\bcups?\b/.test(label)?30
   :/\b(?:tablespoons?|tbsp)\b/.test(label)?40
   :/\b(?:teaspoons?|tsp)\b/.test(label)?50
   :/\b(?:serving|portion)\b/.test(label)?60
   :/\b(?:loaf|loaves|package|packages|pack|packs|container|containers|bottle|bottles)\b/.test(label)?80:70;
  return [{...p,description,label,rank,gramsPerUnit}];
 });
 if(!ranked.length)return null;
 const rank=Math.min(...ranked.map(p=>p.rank)),best=ranked.filter(p=>p.rank===rank),first=best[0];
 // Distinct labelled measures are legitimate choices: keep source order among
 // equal-ranked options and preserve their qualifiers. Only indistinguishable
 // duplicate labels with different normalized weights are unsafe to default.
 const weights=new Map<string,number>();
 for(const p of best){if(weights.has(p.label)&&weights.get(p.label)!==p.gramsPerUnit)return null;weights.set(p.label,p.gramsPerUnit);}
 return {key:'portion:'+first.key,gramsPerUnit:first.gramsPerUnit,description:first.description};
}
/** Read only source-bound measures. Legacy serving text is not evidence. */
export function readProductPracticalPortions(product:PortionProduct):MeasuredOption[]{
 if(product._serving_authority==='confirmed_correction')return [];
 const identity=(v:unknown)=>typeof v==='string'?normalizedLabel(v):'';
 const productName=identity(product.product_name||product.generic_name);
 const off=product._practical_portion_evidence as Record<string,unknown>|null;
 if(off){
  const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const gtin=(v:unknown)=>{if(typeof v!=='string'||! /^(?:\d{8}|\d{12,14})$/.test(v))return '';let sum=0;for(let i=v.length-2,n=0;i>=0;i--,n++)sum+=Number(v[i])*(n%2===0?3:1);return (10-sum%10)%10===Number(v[v.length-1])?v.padStart(14,'0'):'';};
  if(product._source!=='supabase'||off.version!==1||off.provider!=='openfoodfacts'||!uuid(product._db_id)||off.food_item_id!==product._db_id||!Number.isInteger(product._portion_source_revision)||Number(product._portion_source_revision)<0||off.food_revision!==product._portion_source_revision||!productName||productName!==identity(off.food_description)||!gtin(product.code)||gtin(product.code)!==gtin(off.source_id)||typeof off.retrieved_at!=='string'||!Number.isFinite(Date.parse(off.retrieved_at))||!Array.isArray(off.portions)||!off.portions.length||off.portions.length>32)return [];
  const keys=new Set<string>();const rows:MeasuredOption[]=[];
  for(const p of off.portions){
   if(!p||typeof p!=='object'||typeof p.key!=='string'||!p.key||p.key.length>80||keys.has(p.key)||typeof p.description!=='string'||!p.description.trim()||p.description.length>160||(hasAsciiControl(p.description)||/[<>]/.test(p.description))||typeof p.grams!=='number'||!Number.isFinite(p.grams)||p.grams<=0||p.grams>100000||typeof p.amount!=='number'||!Number.isFinite(p.amount)||p.amount<=0||!Number.isFinite(p.grams/p.amount)||p.grams/p.amount>100000)return [];
   keys.add(p.key);rows.push({key:p.key,description:p.description,grams:p.grams,amount:p.amount});
  }
  return rows;
 }
 const id=product._usda_fdc_id,envelope=product._portion_evidence as {foodDescription?:unknown}|null;
 if((typeof id!=='string'&&typeof id!=='number')||!/^\d+$/.test(String(id))||!productName||productName!==identity(envelope?.foodDescription))return [];
 return readUsdaPortions(envelope,id);
}
/** Initial display preference only. Historical edits and confirmed corrections
 * keep their saved serving; exact source identity remains mandatory. */
export function preferredUsdaPortion(product:PortionProduct,mode:string,itemId?:string){
 if(mode==='edit'||itemId)return null;
 return chooseMeasuredPracticalPortion(readProductPracticalPortions(product));
}
