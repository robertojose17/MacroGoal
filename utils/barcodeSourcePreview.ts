/** Read-only provider projection. Never returns a canonical food or a diary payload. */
export type BarcodeSourceProduct = Record<string, unknown> & { code: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function barcodeSourcePreview(result: unknown, barcode: string): BarcodeSourceProduct | null {
  if (!object(result) || result.found !== true || result.source !== 'openfoodfacts_unverified' || result.requires_label_confirmation !== true || !object(result.provider_product)) return null;
  const p = result.provider_product;
  if (typeof p.code !== 'string' || !(p.code === barcode || (/^\d{12,13}$/.test(p.code) && /^\d{12,13}$/.test(barcode) && p.code.padStart(13, '0') === barcode.padStart(13, '0')))) return null;
  return p as BarcodeSourceProduct;
}
export const SOURCE_NUTRIENTS = [
 ['energy-kcal','Calories','Calorías','kcal',true], ['proteins','Protein','Proteína','g',true], ['carbohydrates','Carbohydrates','Carbohidratos','g',true], ['fat','Fat','Grasa','g',true],
 ['fiber','Fiber','Fibra','g'],['sugars','Sugars','Azúcares','g'],['added-sugars','Added sugars','Azúcares añadidos','g'],['saturated-fat','Saturated fat','Grasa saturada','g'],['trans-fat','Trans fat','Grasa trans','g'],['salt','Salt','Sal','g'],['sodium','Sodium','Sodio','g'],['cholesterol','Cholesterol','Colesterol','g'],['polyunsaturated-fat','Polyunsaturated fat','Grasa poliinsaturada','g'],['monounsaturated-fat','Monounsaturated fat','Grasa monoinsaturada','g'],['soluble-fiber','Soluble fiber','Fibra soluble','g'],['insoluble-fiber','Insoluble fiber','Fibra insoluble','g'],['starch','Starch','Almidón','g'],['water','Water','Agua','g'],
 ['calcium','Calcium','Calcio','g'],['iron','Iron','Hierro','g'],['magnesium','Magnesium','Magnesio','g'],['phosphorus','Phosphorus','Fósforo','g'],['potassium','Potassium','Potasio','g'],['zinc','Zinc','Zinc','g'],['copper','Copper','Cobre','g'],['manganese','Manganese','Manganeso','g'],['selenium','Selenium','Selenio','g'],
 ['vitamin-c','Vitamin C','Vitamina C','g'],['vitamin-d','Vitamin D','Vitamina D','g'],['vitamin-e','Vitamin E','Vitamina E','g'],['vitamin-k','Vitamin K','Vitamina K','g'],['vitamin-b1','Vitamin B1','Vitamina B1','g'],['vitamin-b2','Vitamin B2','Vitamina B2','g'],['vitamin-pp','Vitamin B3','Vitamina B3','g'],['vitamin-b6','Vitamin B6','Vitamina B6','g'],['vitamin-b9','Folate','Folato','g'],['vitamin-b12','Vitamin B12','Vitamina B12','g'],['energy-kj','Energy (kJ)','Energía (kJ)','kJ'],['energy','Energy (source)','Energía (fuente)','kJ'],
] as const;
export function sourceNutrientRows(product: BarcodeSourceProduct) {
 const n = object(product.nutriments) ? product.nutriments : {};
 // The provider suffix defines the presentation basis. No density/serving conversion.
 const suffix = product.nutrition_data_per === 'serving' ? '_serving' : '_100g';
 return { suffix, rows: SOURCE_NUTRIENTS.flatMap(([key,en,es,unit,...rest]) => {
  const value=n[key+suffix]; const amount=typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
  if(amount===null && !rest[0]) return [];
  const modifier=n[key+'_modifier'];
  return [{key,en,es,unit,amount,modifier:typeof modifier==='string' && ['~','<','>','≤','≥'].includes(modifier)?modifier:''}];
 }) };
}
