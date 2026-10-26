export function optionalFiber(nutriments:Record<string,unknown>|null|undefined):number|null {
 const raw=nutriments?.fiber_100g ?? nutriments?.fiber;
 if(raw==null||raw==='')return null;
 const value=typeof raw==='number'?raw:typeof raw==='string'?Number(raw):NaN;
 return Number.isFinite(value)&&value>=0?value:null;
}
