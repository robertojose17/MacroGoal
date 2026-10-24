import {parseMealComponents,type MealComponent} from './coachMealComponents';
// Read-only adapter over the existing public food_items catalog. No inserts,
// external food search or provider calls. The review server resolves IDs again.
export function catalogIngredient(row:any):MealComponent|null {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!row||typeof row.id!=='string'||!uuid.test(row.id))return null;
 const basis=row.macros_per==='100g'?100:row.macros_per==='serving'&&typeof row.serving_size==='number'&&Number.isFinite(row.serving_size)&&row.serving_size>0?row.serving_size:null;
 if(basis===null)return null;
 const nutrition:any={};for(const [key,column] of [['calories','calories'],['protein','protein'],['carbs','carbs'],['fats','fat'],['fiber','fiber']]){
  if(typeof row[column]!=='number'||!Number.isFinite(row[column])||row[column]<0)return null;nutrition[key]=row[column]*100/basis;
 }
 return parseMealComponents([{id:'catalog-'+row.id,name:row.name,quantity:100,unit:'g',grams:100,nutrition,authority:'estimated'}])?.[0]??null;
}
export function createCoachIngredientSearch(db:any,owner:()=>Promise<string|undefined>){
 return async(query:string):Promise<MealComponent[]>=>{
  const q=query.trim();if(q.length<2||q.length>80||/[\x00-\x1f]/.test(q))return [];
  const user=await owner();if(!user)throw Error('scope_changed');
  const {data,error}=await db.from('food_items').select('id,name,calories,protein,carbs,fat,fiber,macros_per,serving_size').ilike('name','%'+q.replace(/[\\%_]/g,'\\$&')+'%').limit(12);
  if(await owner()!==user)throw Error('scope_changed');if(error||!Array.isArray(data))throw Error('catalog_unavailable');
  return data.map(catalogIngredient).filter((v:MealComponent|null):v is MealComponent=>v!==null);
 };
}
