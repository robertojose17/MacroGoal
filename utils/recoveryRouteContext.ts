// Preserve only navigation context; never forward stale nutrition or a client food ID.
export function recoveryRouteContext(params:Record<string,unknown>):Record<string,string> {
  const result:Record<string,string>={};
  for(const key of ['mode','itemId','itemTable','planId','meal','mealId','date','context','returnTo']) {
    if(typeof params[key]==='string')result[key]=params[key] as string;
  }
  return result;
}
export function macroDisplayGrams(value:number):number {return Math.round(value*10)/10;}

export function recoveryProduct(offData:string|undefined, approved:boolean):any|null {
  if(!approved||!offData)return null;
  try {const p=JSON.parse(offData),n=p.nutriments;
    if(!p.product_name||!Number.isFinite(Number(p.serving_quantity))||Number(p.serving_quantity)<=0)return null;
    if(!['energy-kcal_100g','proteins_100g','carbohydrates_100g','fat_100g'].every(k=>typeof n?.[k]==='number'&&Number.isFinite(n[k])&&n[k]>=0))return null;
    return p;
  }catch{return null;}
}
export function preferRecoveryProduct<T>(loaded:T,approved:T|null):T {return approved??loaded;}
export function createLoadGeneration() {
  let generation=0;
  return {begin(){const started=++generation;return ()=>started===generation;},invalidate(){generation++;}};
}
