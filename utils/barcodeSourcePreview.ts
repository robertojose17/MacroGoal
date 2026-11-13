/** Read-only provider projection. Never returns a canonical food or a diary payload. */
export type BarcodeSourceProduct = Record<string, unknown> & { code: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function barcodeSourcePreview(result: unknown, barcode: string): BarcodeSourceProduct | null {
  if (!object(result) || result.found !== true || result.source !== 'openfoodfacts_unverified' || result.requires_label_confirmation !== true || !object(result.provider_product)) return null;
  if (result.capture_status === 'ambiguous_existing' || result.capture_status === 'identity_reserved') return null;
  const p = result.provider_product;
  if (typeof p.code !== 'string' || !(p.code === barcode || (/^\d{12,13}$/.test(p.code) && /^\d{12,13}$/.test(barcode) && p.code.padStart(13, '0') === barcode.padStart(13, '0')))) return null;
  return {...p, code:p.code};
}
export const SOURCE_NUTRIENTS = [
 ['energy-kcal','Calories','Calorías','kcal',true], ['proteins','Protein','Proteína','g',true], ['carbohydrates','Carbohydrates','Carbohidratos','g',true], ['fat','Fat','Grasa','g',true],
 ['fiber','Fiber','Fibra','g'],['sugars','Sugars','Azúcares','g'],['added-sugars','Added sugars','Azúcares añadidos','g'],['saturated-fat','Saturated fat','Grasa saturada','g'],['trans-fat','Trans fat','Grasa trans','g'],['salt','Salt','Sal','g'],['sodium','Sodium','Sodio','g'],['cholesterol','Cholesterol','Colesterol','g'],['polyunsaturated-fat','Polyunsaturated fat','Grasa poliinsaturada','g'],['monounsaturated-fat','Monounsaturated fat','Grasa monoinsaturada','g'],['soluble-fiber','Soluble fiber','Fibra soluble','g'],['insoluble-fiber','Insoluble fiber','Fibra insoluble','g'],['starch','Starch','Almidón','g'],['water','Water','Agua','g'],
 ['calcium','Calcium','Calcio','g'],['iron','Iron','Hierro','g'],['magnesium','Magnesium','Magnesio','g'],['phosphorus','Phosphorus','Fósforo','g'],['potassium','Potassium','Potasio','g'],['zinc','Zinc','Zinc','g'],['copper','Copper','Cobre','g'],['manganese','Manganese','Manganeso','g'],['selenium','Selenium','Selenio','g'],
 ['vitamin-c','Vitamin C','Vitamina C','g'],['vitamin-d','Vitamin D','Vitamina D','g'],['vitamin-e','Vitamin E','Vitamina E','g'],['vitamin-k','Vitamin K','Vitamina K','g'],['vitamin-b1','Vitamin B1','Vitamina B1','g'],['vitamin-b2','Vitamin B2','Vitamina B2','g'],['vitamin-pp','Vitamin B3','Vitamina B3','g'],['vitamin-b6','Vitamin B6','Vitamina B6','g'],['vitamin-b9','Folate','Folato','g'],['vitamin-b12','Vitamin B12','Vitamina B12','g'],['energy-kj','Energy (kJ)','Energía (kJ)','kJ'],['energy','Energy (source)','Energía (fuente)','kJ'],
] as const;
export function sourceNutrientRows(input: unknown) {
 const product = object(input) ? input : {};
 const n = object(product.nutriments) ? product.nutriments : {};
 // The provider suffix defines the presentation basis. No density/serving conversion.
 const suffix = product.nutrition_data_per === 'serving' ? '_serving' : '_100g';
 return { suffix, rows: SOURCE_NUTRIENTS.flatMap(([key,en,es,unit,...rest]) => {
  const value=n[key+suffix]; let amount=typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
  if(amount===null && !rest[0]) return [];
  const modifier=n[key+'_modifier'];
  if(typeof modifier==='string' && modifier.trim() && !['~','<','>','≤','≥','='].includes(modifier)) amount=null;
  return [{key,en,es,unit,amount,modifier:typeof modifier==='string' && ['~','<','>','≤','≥'].includes(modifier)?modifier:''}];
 }) };
}

export function sourceReadonly(value: unknown): boolean {
 return object(value) && value._off_source_readonly === true;
}
export function sourceRouteReadonly(raw?: string): boolean {
 try { return sourceReadonly(JSON.parse(raw || 'null')); } catch { return false; }
}
// OFF suffixed amounts are normalized grams; *_unit describes original input, not these amounts.
const DISPLAY_MCG = new Set(['vitamin-d','vitamin-k','vitamin-b9','vitamin-b12','selenium']);
const DISPLAY_MG = new Set(['sodium','cholesterol','calcium','iron','magnesium','phosphorus','potassium','zinc','copper','manganese','vitamin-c','vitamin-e','vitamin-b1','vitamin-b2','vitamin-pp','vitamin-b6']);
export function sourceDisplayValue(product: unknown, key: string): string {
 if (!object(product)) return '—';
 const row=sourceNutrientRows(product).rows.find(r=>r.key===key);
 if(row?.amount == null) return '—';
 const factor=DISPLAY_MCG.has(key)?1e6:DISPLAY_MG.has(key)?1e3:1;
 const unit=factor===1e6?'mcg':factor===1e3?'mg':row.unit;
 const amount=Number((row.amount*factor).toPrecision(8));
 return `${row.modifier}${amount} ${unit}`;
}
export function sourceBasis(product: unknown, spanish: boolean): string {
 if (!object(product)) return '';
 const serving=typeof product.serving_size==='string'?product.serving_size.trim():'';
 if(product.nutrition_data_per==='serving') return spanish ? `Por porción${serving?': '+serving:''} · Open Food Facts` : `Per serving${serving?': '+serving:''} · Open Food Facts`;
 // Only a coherent explicit mass label justifies the mass-only label. Never infer density.
 const rawQuantity=product.serving_quantity;
 const quantity=(typeof rawQuantity==='number'||typeof rawQuantity==='string') && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(rawQuantity)) ? Number(rawQuantity) : NaN;
 const gramLabels=Array.from(serving.matchAll(/(?:^|[^\w.,+-])(\d+(?:\.\d+)?)\s*g(?:$|[^a-z])/gi),match=>Number(match[1]));
 const mass=product.serving_quantity_unit==='g' && Number.isFinite(quantity) && quantity>0 && quantity<=10000
   && gramLabels.length>0 && gramLabels.every(grams=>grams===quantity)
   && !/\b(?:ml|cl|dl|liters?|litres?|fl\.?\s*oz)\b/i.test(serving);
 return `${spanish?'Por':'Per'} ${mass?'100 g':'100 g / 100 ml'} · Open Food Facts`;
}

export function sourceIngredients(value: unknown): string {
 return object(value) && typeof value.ingredients_text === 'string' ? value.ingredients_text : '';
}
