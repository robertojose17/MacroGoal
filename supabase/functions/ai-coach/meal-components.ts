import {nutrients,type Values} from './gallery-meals.ts';
export type MealComponent={id:string;name:string;quantity:number;unit:string;grams:number|null;nutrition:Record<keyof Values,number>;authority:'official'|'publisher_reported'|'estimated';source_url?:string};
const caps={calories:5000,protein:400,carbs:800,fats:400,fiber:150};
const finite=(x:unknown,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=max;
export function validateComponents(value:unknown):MealComponent[]{
 if(!Array.isArray(value)||!value.length||value.length>24)throw Error('invalid_components');
 const ids=new Set();
 for(const c of value){
  if(!c||typeof c.id!=='string'||!c.id||c.id.length>100||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>160||typeof c.unit!=='string'||!c.unit.trim()||c.unit.length>40||!finite(c.quantity,10000)||c.grams!==null&&!finite(c.grams,20000)||!['official','publisher_reported','estimated'].includes(c.authority))throw Error('invalid_components');
  ids.add(c.id);
  for(const k of nutrients)if(typeof c.nutrition?.[k]!=='number'||!Number.isFinite(c.nutrition[k])||c.nutrition[k]<0||c.nutrition[k]>caps[k])throw Error('invalid_component_nutrition');
  if(c.nutrition.fiber>c.nutrition.carbs)throw Error('invalid_component_nutrition');
  if(c.source_url!==undefined){try{const u=new URL(c.source_url);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{throw Error('invalid_component_source');}}
  if(c.authority!=='estimated'&&!c.source_url)throw Error('component_source_required');
 }
 return structuredClone(value);
}
export function componentTotals(components:MealComponent[]){
 const totals=Object.fromEntries(nutrients.map(k=>[k,components.reduce((sum,c)=>sum+c.nutrition[k],0)])) as Record<keyof Values,number>;
 for(const k of nutrients)if(!Number.isFinite(totals[k])||totals[k]>caps[k])throw Error('invalid_component_total');
 if(totals.calories<=0)throw Error('empty_meal');
 return totals;
}
export function editComponents(original:unknown,edits:unknown,additions:MealComponent[]=[],servings=1){
 const source=validateComponents(original);
 if(!finite(servings,20))throw Error('invalid_portion');
 let selected=source;
 if(edits!==undefined){
  if(!Array.isArray(edits)||edits.length>24)throw Error('invalid_component_edits');
  const seen=new Set();selected=edits.map(e=>{
   if(!e||Object.keys(e).some(k=>!['component_id','quantity'].includes(k))||seen.has(e.component_id)||!finite(e.quantity,10000))throw Error('invalid_component_edits');
   const c=source.find(v=>v.id===e.component_id);if(!c)throw Error('unknown_component');seen.add(e.component_id);
   const ratio=e.quantity/c.quantity;
   return {...c,quantity:e.quantity,grams:c.grams===null?null:c.grams*ratio,nutrition:Object.fromEntries(nutrients.map(k=>[k,c.nutrition[k]*ratio])) as MealComponent['nutrition']};
  });
 }
 selected=[...selected,...additions].map(c=>({...c,quantity:c.quantity*servings,grams:c.grams===null?null:c.grams*servings,nutrition:Object.fromEntries(nutrients.map(k=>[k,c.nutrition[k]*servings])) as MealComponent['nutrition']}));
 const components=validateComponents(selected),values=componentTotals(components);
 return {components,values,grams:components.every(c=>c.grams!==null)?components.reduce((sum,c)=>sum+c.grams!,0):null};
}
