import {validNutrition,type CatalogMeal,type Nutrition} from './daily.ts';
import type {Dependencies} from './handler.ts';
export type Db={auth:{getUser:(jwt:string)=>Promise<any>};from:(table:string)=>any};
export type Admission={run:Dependencies['withExistingGates'];checkSavedMeal:(ownerId:string,mealId:string)=>Promise<boolean>;resolveAccess?:Dependencies['resolveAccess']};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):NaN;
const nutrition=(v:any,fat='fats'):Nutrition=>({calories:number(v?.calories),protein:number(v?.protein),carbs:number(v?.carbs),fats:number(v?.[fat]),fiber:number(v?.fiber)});
async function read(query:any){const {data,error}=await query;if(error)throw Error('data_unavailable');return data;}
// Actual main has no server usage/budget lifecycle or suitability policy. Until a
// reviewed binding is supplied, fail closed before reading any diary/catalog.
export function sourceDependencies(db:Db,admission?:Admission,now=Date.now):Dependencies{return {
 now,
 resolveAccess:admission?.resolveAccess,
 authenticate:async authorization=>{const {data,error}=await db.auth.getUser(authorization.slice(7));return error?null:data?.user?.id??null;},
 subscriptions:ownerId=>read(db.from('subscriptions').select('entitlement_ids,status,expiration_at,purchased_at,billing_issues_detected_at').eq('user_id',ownerId)),
 withExistingGates:async(input,work)=>{
  if(!admission)return json({error:'admission_not_integrated'},503);
  const p=await read(db.from('coach_permissions').select('permission_level,can_add_food').eq('user_id',input.ownerId).maybeSingle());
  if(![2,3,4].includes(p?.permission_level)||p?.can_add_food!==true)return json({error:'permission_required',admission_state:'not_admitted'},403);
  return admission.run(input,work);
 },
  loadDaily:async(ownerId,date)=>{
   const [meals,goal]=await Promise.all([
    read(db.from('meals').select('user_id,date,meal_items(calories,protein,carbs,fats,fiber)').eq('user_id',ownerId).eq('date',date)),
    read(db.from('goals').select('user_id,daily_calories,protein_g').eq('user_id',ownerId).eq('is_active',true).order('created_at',{ascending:false}).limit(1).maybeSingle())
   ]);
   if(!Array.isArray(meals)||goal&&goal.user_id!==ownerId||meals.some(m=>m.user_id!==ownerId||m.date!==date||!Array.isArray(m.meal_items)))throw Error('context_scope_mismatch');
   return {ownerId,date,status:'available',target:goal?{calories:number(goal.daily_calories),protein:number(goal.protein_g)}:null,entries:meals.flatMap(m=>m.meal_items.map((i:any)=>{const n:Partial<Nutrition>=nutrition(i);if(i.fiber===null||i.fiber===undefined)delete n.fiber;return {ownerId,date,nutrition:n as Omit<Nutrition,'fiber'>&{fiber?:number}};})),preferencesChecked:true};
   // preferencesChecked refers to the required preceding server policy decision;
   // every offered saved meal additionally passes checkSavedMeal below.
  },
  loadCatalog:async ownerId=>{
   const meals=await read(db.from('saved_meals').select('id,user_id,name,updated_at,saved_meal_items(id,calories,protein,carbs,fat,fiber)').eq('user_id',ownerId).order('updated_at',{ascending:false}).limit(50));
   if(!Array.isArray(meals)||meals.some(m=>m.user_id!==ownerId))throw Error('catalog_scope_mismatch');
   const out:CatalogMeal[]=[];
   for(const m of meals){
    if(!Array.isArray(m.saved_meal_items)||!m.saved_meal_items.length||!await admission!.checkSavedMeal(ownerId,m.id))continue;
    const values=m.saved_meal_items.map((i:any)=>nutrition(i,'fat'));if(values.some((v:Nutrition)=>!validNutrition(v)))continue;
    const total: Nutrition={calories:0,protein:0,carbs:0,fats:0,fiber:0};for(const value of values)for(const key of Object.keys(total) as Array<keyof Nutrition>)total[key]+=value[key];
    if(!validNutrition(total))continue;
    out.push({id:m.id,version:await hash(JSON.stringify({id:m.id,name:m.name,updated_at:m.updated_at,items:m.saved_meal_items})),name:m.name,servingLabel:'meal',source:'catalog',savedMealOwnerId:ownerId,eligible:true,macrosPer:'meal',servingSize:1,nutrition:total});
   }return out;
  },
};}

