export type Nutrition={calories:number;protein:number;carbs:number;fats:number;fiber:number};
export type DailyTarget=Pick<Nutrition,'calories'|'protein'>&Partial<Nutrition>;
export type DailyData={ownerId:string;date:string;status:'available'|'unavailable';target:DailyTarget|null;entries:Array<{ownerId:string;date:string;nutrition:Omit<Nutrition,'fiber'>&{fiber?:number}}>;preferencesChecked:boolean};
export type CatalogMeal={id:string;version:string;name:string;servingLabel:string;grams?:number;source:'catalog';savedMealOwnerId?:string;eligible:boolean;macrosPer:'100g'|'serving'|'meal';servingSize:number;nutrition:Nutrition};
export type MealType='breakfast'|'lunch'|'dinner'|'snack';
const keys=['calories','protein','carbs','fats','fiber'] as const;
export const validNutrition=(n:unknown):n is Nutrition=>!!n&&typeof n==='object'&&keys.every(k=>typeof (n as Nutrition)[k]==='number'&&Number.isFinite((n as Nutrition)[k])&&(n as Nutrition)[k]>=0);
const round=(n:Nutrition):Nutrition=>Object.fromEntries(keys.map(k=>[k,Number(n[k].toFixed(k==='calories'?0:1))])) as Nutrition;
const zero=():Nutrition=>({calories:0,protein:0,carbs:0,fats:0,fiber:0});
export function dailyContext(data:DailyData,ownerId:string,date:string){
 if(data.ownerId!==ownerId||data.date!==date||data.entries.some(e=>e.ownerId!==ownerId||e.date!==date))throw Error('context_scope_mismatch');
 if(data.status!=='available'||data.entries.some(e=>keys.some(k=>k==='fiber'&&e.nutrition[k]===undefined?false:typeof e.nutrition[k]!=='number'||!Number.isFinite(e.nutrition[k])||e.nutrition[k]!<0)))return {status:'data_unavailable',date,next_action:'retry_context',message_key:'coach.daily.unavailable'} as const;
 const fiberKnown=data.entries.every(e=>e.nutrition.fiber!==undefined);
 const logged=zero();for(const entry of data.entries)for(const k of keys)if(entry.nutrition[k]!==undefined)logged[k]+=entry.nutrition[k]!;
 if(!validNutrition(logged))return {status:'data_unavailable',date,next_action:'retry_context',message_key:'coach.daily.unavailable'} as const;
 const target=data.target&&typeof data.target.calories==='number'&&Number.isFinite(data.target.calories)&&data.target.calories>0&&typeof data.target.protein==='number'&&Number.isFinite(data.target.protein)&&data.target.protein>0&&keys.every(k=>data.target![k]===undefined||typeof data.target![k]==='number'&&Number.isFinite(data.target![k])&&data.target![k]!>=0)?data.target:null;
 const remaining=target?Object.fromEntries(keys.filter(k=>target[k]!==undefined&&(k!=='fiber'||fiberKnown)).map(k=>[k,Number(Math.max(0,target[k]!-logged[k]).toFixed(k==='calories'?0:1))])):null;
 const totals:Partial<Nutrition>=round(logged);if(!fiberKnown)delete totals.fiber;
 return {status:'ready',date,logged:totals,target,remaining,entry_count:data.entries.length,coverage:'logged_only',
  next_action:!data.entries.length?'log_meal':!target?'review_target':'choose_meal',message_key:!data.entries.length?'coach.daily.no_logs':!target?'coach.daily.target_missing':'coach.daily.summary'} as const;
}
export function catalogOptions(rows:CatalogMeal[]){
 const counts=new Map<string,number>();for(const row of rows)counts.set(row.id,(counts.get(row.id)??0)+1);
 return rows.filter(r=>r.source==='catalog'&&r.eligible===true&&typeof r.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id)&&counts.get(r.id)===1&&typeof r.version==='string'&&r.version.length>0&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=300&&r.macrosPer==='meal'&&r.servingSize===1&&r.grams===undefined&&validNutrition(r.nutrition)&&r.nutrition.calories>0).slice(0,50).map(r=>({id:r.id,version:r.version,name:r.name,nutrition:round(r.nutrition)}));
}
export function localDay(now:number,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return part('year')+'-'+part('month')+'-'+part('day');
}
