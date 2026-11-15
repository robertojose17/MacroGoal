/** Source contract for user-entered nutrient evidence, NOT nutritional accuracy.
 * Only consume inside the authoritative same-statement own-actor snapshot.
 * Missing/malformed evidence never authorizes a legacy zero. */
export const NUTRIENT_FIELDS=['calories','protein','carbs','fats','fiber'] as const;
export type NutrientField=typeof NUTRIENT_FIELDS[number];
export type UserEnteredNutritionEvidence={
 version:'user-entered-v1';ownerId:string;itemId:string;revision:string;status:'active';
 declaredFields:NutrientField[];values:Record<NutrientField,number>;
};
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
/** Null is a valid explicit absence, not a matching NULL revision. */
export function validLoggedNutritionEvidence(item:unknown,owner:string):boolean{
 if(!rec(item)||!Object.hasOwn(item,'nutrition_revision')||!Object.hasOwn(item,'nutrition_evidence')||
 !(item.nutrition_revision===null||uuid(item.nutrition_revision)))return false;
 const e=item.nutrition_evidence;
 if(e===null)return true;
 if(!rec(e)||e.version!=='user-entered-v1'||e.ownerId!==owner||!uuid(owner)||
 e.itemId!==item.id||!uuid(item.id)||e.status!=='active'||!uuid(e.revision)||
 e.revision!==item.nutrition_revision||!Array.isArray(e.declaredFields)||
 e.declaredFields.length===0||e.declaredFields.length>5||
 new Set(e.declaredFields).size!==e.declaredFields.length||
 !e.declaredFields.every(k=>NUTRIENT_FIELDS.includes(k as NutrientField))||!rec(e.values))return false;
 return NUTRIENT_FIELDS.every(k=>typeof e.values![k]==='number'&&Number.isFinite(e.values![k])&&
 (e.values![k] as number)>=0&&e.values![k]===item[k]);
}
export function explicitlyDeclaredNutrient(item:unknown,owner:string,field:NutrientField):boolean{
 if(!validLoggedNutritionEvidence(item,owner)||!rec(item)||!rec(item.nutrition_evidence))return false;
 return (item.nutrition_evidence.declaredFields as NutrientField[]).includes(field);
}
