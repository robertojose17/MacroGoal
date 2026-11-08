type Portion={key:string;description:string;grams:number;amount:number};
/** Presentation only. Keep original keys and measured grams; saved provenance
 * continues to use the original provider description, never these short labels. */
export function usdaPortionOptions(portions:Portion[],locale:string,preferredKey?:string){
 const es=locale.toLowerCase().startsWith('es');
 const labels:Record<string,[string,string,number]>={
  medium:['Medium','Mediana',0],average:['Average','Promedio',0],small:['Small','Pequeña',1],large:['Large','Grande',2],
  'extra small':['Extra small','Extrapequeña',3],'extra large':['Extra large','Extragrande',4],
  'cup, sliced':['Cup, sliced','Taza en rodajas',5],'cup, mashed':['Cup, mashed','Taza triturada',5],
  'nlea serving':['NLEA serving','Porción NLEA',5],
 };
 return portions.map((p,index)=>{
  const size=p.description.trim().match(/^(extra small|extra large|medium|average|small|large)(?:\s*\([^()]*\))?$/i)?.[1].toLowerCase();
  const known=labels[size||p.description.trim().toLowerCase()];
  const description=known?known[es?1:0]:p.description;
  const grams=p.grams/p.amount;
  return {key:'portion:'+p.key,label:description+' ('+Number(grams.toFixed(2))+' g)',gramsPerUnit:grams,rank:preferredKey==='portion:'+p.key?-1:known?.[2]??5,index};
 }).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(({rank,index,...option})=>option);
}
/** Display dedupe only: never discard the selected key or distinct qualifiers. */
export function dedupePracticalServingOptions<T extends {key:string;label:string;gramsPerUnit:number}>(options:T[],selectedKey:string){
 const label=(s:string)=>s.normalize('NFKC').trim().toLowerCase().replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*g\s*\)\s*$/,'').replace(/^1\s+/,'').replace(/\s+/g,' ');
 return options.filter((o,index)=>{
  if(!o.key.startsWith('portion:')&&!['default','natural_unit','natural_serving'].includes(o.key))return true;
  if(o.key===selectedKey)return true;
  const same=options.filter(p=>p.gramsPerUnit===o.gramsPerUnit&&label(p.label)===label(o.label));
  if(!same.some(p=>p.key.startsWith('portion:')))return true;
  const keep=same.find(p=>p.key===selectedKey)||same.find(p=>p.key.startsWith('portion:'));
  return keep===o;
 });
}
