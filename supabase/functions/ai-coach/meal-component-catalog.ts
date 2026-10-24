import {validateComponents,type MealComponent} from './meal-components.ts';
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function validateComponentAdditions(input:unknown):Array<{food_item_id:string;grams:number}>{
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>12)throw Error('invalid_component_additions');
 const ids=new Set();
 for(const x of input){if(!x||Object.keys(x).some(k=>!['food_item_id','grams'].includes(k))||!uuid(x.food_item_id)||ids.has(x.food_item_id)||typeof x.grams!=='number'||!Number.isFinite(x.grams)||x.grams<=0||x.grams>5000)throw Error('invalid_component_additions');ids.add(x.food_item_id);}
 return input;
}
/** db must be a fresh caller-JWT client, never the service-role client. */
export async function resolveComponentAdditions(db:any,owner:string,input:unknown):Promise<MealComponent[]>{
 const additions=validateComponentAdditions(input);if(!additions.length)return [];
 const auth=await db.auth.getUser();if(auth.error||auth.data?.user?.id!==owner)throw Error('catalog_authorization_changed');
 const result=await db.from('food_items').select('id,name,calories,protein,carbs,fat,fiber,macros_per,serving_size').in('id',additions.map(a=>a.food_item_id)).limit(12);
 if(result.error||!Array.isArray(result.data))throw Error('catalog_unavailable');
 const components=additions.map(a=>{
  const matches=result.data.filter((r:any)=>r.id===a.food_item_id);if(matches.length!==1)throw Error('catalog_food_unavailable');const row=matches[0];
  const basis=row.macros_per==='100g'?100:row.macros_per==='serving'&&typeof row.serving_size==='number'&&Number.isFinite(row.serving_size)&&row.serving_size>0?row.serving_size:null;
  if(basis===null)throw Error('catalog_basis_unavailable');
  const nutrition:any={};for(const [key,column] of [['calories','calories'],['protein','protein'],['carbs','carbs'],['fats','fat'],['fiber','fiber']]){
   if(typeof row[column]!=='number'||!Number.isFinite(row[column])||row[column]<0)throw Error('catalog_nutrition_incomplete');nutrition[key]=row[column]*a.grams/basis;
  }
  return {id:'catalog-'+a.food_item_id,name:row.name,quantity:a.grams,unit:'g',grams:a.grams,nutrition,authority:'estimated' as const};
 });
 // Catalog nutrition is not promoted to official/source-verified nutrition.
 return validateComponents(components);
}
