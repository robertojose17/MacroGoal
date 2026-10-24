// Ingredient quantities use the source unit. Unknown mass stays unknown.
// These totals are a local preview; only server-reviewed totals may be logged.
export const COMPONENT_NUTRIENTS = ['calories','protein','carbs','fats','fiber'] as const;
export type ComponentNutrition = Record<typeof COMPONENT_NUTRIENTS[number],number>;
export type MealComponent = {
  id:string; name:string; quantity:number; unit:string; grams:number|null;
  nutrition:ComponentNutrition;
  authority:'official'|'publisher_reported'|'estimated'; source_url?:string;
};
export type ComponentEdit = {component_id:string;quantity:number};
export type ComponentAddition = {food_item_id:string;grams:number};
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=99999;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v);
export function parseMealComponents(value:unknown):MealComponent[]|null {
  if(!Array.isArray(value)||!value.length||value.length>24)return null;
  const ids=new Set<string>();
  for(const c of value){
    if(!c||!text(c.id,100)||ids.has(c.id)||!text(c.name,160)||!text(c.unit,40)||!positive(c.quantity)||!(c.grams===null||positive(c.grams))||!['official','publisher_reported','estimated'].includes(c.authority)||!c.nutrition||COMPONENT_NUTRIENTS.some(k=>typeof c.nutrition[k]!=='number'||!Number.isFinite(c.nutrition[k])||c.nutrition[k]<0||c.nutrition[k]>99999))return null;
    if(c.source_url!==undefined){try{const u=new URL(c.source_url);if(u.protocol!=='https:'||u.username||u.password)return null;}catch{return null;}}
    if(c.quantity>10000||(c.grams!==null&&c.grams>20000)||c.nutrition.fiber>c.nutrition.carbs||c.authority!=='estimated'&&!c.source_url)return null;
    ids.add(c.id);
  }
  return value.map(c=>({id:c.id,name:c.name,quantity:c.quantity,unit:c.unit,grams:c.grams,nutrition:Object.fromEntries(COMPONENT_NUTRIENTS.map(k=>[k,c.nutrition[k]])) as ComponentNutrition,authority:c.authority,...(c.source_url?{source_url:c.source_url}:{})}));
}
export function previewComponentEdits(source:MealComponent[],edits:ComponentEdit[]) {
  const valid=parseMealComponents(source);
  if(!valid||!Array.isArray(edits)||!edits.length||edits.length>valid.length)return null;
  const seen=new Set<string>(),components:MealComponent[]=[];
  for(const edit of edits){
    const original=valid.find(c=>c.id===edit.component_id);
    if(!original||seen.has(edit.component_id)||!positive(edit.quantity))return null;
    seen.add(edit.component_id);const ratio=edit.quantity/original.quantity;
    const nutrition=Object.fromEntries(COMPONENT_NUTRIENTS.map(k=>[k,original.nutrition[k]*ratio])) as ComponentNutrition;
    const grams=original.grams===null?null:original.grams*ratio;
    components.push({...original,quantity:edit.quantity,grams,nutrition});
  }
  if(!parseMealComponents(components))return null;
  const nutrition=Object.fromEntries(COMPONENT_NUTRIENTS.map(k=>[k,Math.round(components.reduce((n,c)=>n+c.nutrition[k],0)*10)/10])) as ComponentNutrition;
  return {components,nutrition,grams:components.some(c=>c.grams===null)?null:components.reduce((n,c)=>n+c.grams!,0)};
}

export function validComponentChanges(edits:unknown,additions:unknown):boolean {
 const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 if(edits!==undefined&&(!Array.isArray(edits)||edits.length>24||new Set(edits.map(e=>e?.component_id)).size!==edits.length||edits.some(e=>!e||Object.keys(e).some(k=>!['component_id','quantity'].includes(k))||!text(e.component_id,100)||!positive(e.quantity)||e.quantity>10000)))return false;
 if(additions!==undefined&&(!Array.isArray(additions)||additions.length>12||new Set(additions.map(a=>a?.food_item_id)).size!==additions.length||additions.some(a=>!a||Object.keys(a).some(k=>!['food_item_id','grams'].includes(k))||!uuid(a.food_item_id)||!positive(a.grams)||a.grams>5000)))return false;
 return true;
}
// Different multiplication order may differ by a few floating-point bits.
// Fixed absolute tolerance only; null mass and provenance still match exactly.
const sameMass=(actual:number|null,expected:number|null)=>actual===null||expected===null?actual===expected:Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=1e-7;
export function validateReviewedComposition(source:MealComponent[],edits:ComponentEdit[]|undefined,additions:ComponentAddition[]|undefined,servings:number,result:unknown){
 if(!validComponentChanges(edits,additions)||!positive(servings)||servings>20)return null;
 const originals=parseMealComponents(source),received=parseMealComponents(result);if(!originals||!received)return null;
 const selected=edits??originals.map(c=>({component_id:c.id,quantity:c.quantity}));
 if(received.length!==selected.length+(additions?.length??0))return null;
 for(const e of selected){const original=originals.find(c=>c.id===e.component_id),r=received.find(c=>c.id===e.component_id);if(!original||!r)return null;const ratio=e.quantity/original.quantity*servings;
 if(r.name!==original.name||r.unit!==original.unit||r.authority!==original.authority||r.source_url!==original.source_url||Math.abs(r.quantity-e.quantity*servings)>1e-8||!sameMass(r.grams,original.grams===null?null:original.grams*ratio)||COMPONENT_NUTRIENTS.some(k=>Math.abs(r.nutrition[k]-original.nutrition[k]*ratio)>1e-7))return null;}
 for(const a of additions??[]){const r=received.find(c=>c.id==='catalog-'+a.food_item_id);if(!r||r.unit!=='g'||r.quantity!==a.grams*servings||!sameMass(r.grams,a.grams*servings)||r.authority!=='estimated'||r.source_url!==undefined)return null;}
 const nutrition=Object.fromEntries(COMPONENT_NUTRIENTS.map(k=>[k,received.reduce((sum,c)=>sum+c.nutrition[k],0)])) as ComponentNutrition;
 return {components:received,nutrition,grams:received.some(c=>c.grams===null)?null:received.reduce((n,c)=>n+c.grams!,0)};
}
