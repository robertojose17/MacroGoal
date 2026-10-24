// Display-only recognition of existing Coach serving descriptions. Never rewrite
// persisted descriptions or change the serving basis used by diary calculations.
export function coachFoodDetailsPresentation(description:unknown,es:boolean){
 if(typeof description!=='string')return null;
 const text=description.trim();
 if(!/^(?:1\s+)?ESTIMATE\s*\|/i.test(text)&&!/^1 estimated portion\s*\(/i.test(text))return null;
 // Legacy foods-row rendering appends its per-100g basis to the Coach narrative.
 // Suppress only that display suffix; confirmed physical portion labels stay intact.
 const narrative=text.replace(/^(?:1\s+)?ESTIMATE\s*\|\s*/i,'');
 const shownDescription=/^(?:1\s+)?ESTIMATE\s*\|/i.test(text)?narrative.replace(/\s*\(100\s*g\)\s*$/i,''):narrative;
 return {label:es?'1 porción':'1 serving',description:shownDescription,note:es?'Estimación: los nutrientes y las cantidades pueden variar.':'Estimation: nutrition and quantities may vary.'};
}
export function coachDisplayServingOptions<T extends {key:string;label:string}>(options:T[],selected:string,presentation:ReturnType<typeof coachFoodDetailsPresentation>):T[]{
 if(!presentation)return options;
 const option=options.find(o=>o.key===selected)??options.find(o=>o.key==='default')??options[0];
 return option?[{...option,label:presentation.label}]:options;
}
