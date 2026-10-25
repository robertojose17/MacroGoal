import { generatedFoodEvidenceQuestion } from './coach-food-fallback.ts';
import { lookupOptionPortion, validatedSuggestedServings, type LookupOption } from './_shared/coach-recommendation-contract.ts';

export type Nutrients={calories:number|null;protein:number|null;carbs:number|null;fats:number|null;fiber:number|null};
export type PrivateNutritionSnapshot={localDate:string;timeZone:string;goalsStatus:'available'|'missing'|'failed';diaryStatus:'available'|'missing'|'failed';targets:Nutrients;logged:Nutrients;remaining:Nutrients};
const keys=['calories','protein','carbs','fats','fiber'] as const;
// Fiber goals are tracked as progress; they are not a known upper-limit cap.
const cappedKeys=['calories','protein','carbs','fats'] as const;
const empty=():Nutrients=>({calories:null,protein:null,carbs:null,fats:null,fiber:null});
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000;
const round=(n:number)=>Math.round((n+Number.EPSILON)*10000)/10000;
/** Authenticated reads only. An empty successful diary is known zero; a failed/malformed read is unknown. */
export function buildPrivateNutritionSnapshot(input:{localDate:string;timeZone:string;goalsResult:any;mealsResult:any}):PrivateNutritionSnapshot{
 const g=input.goalsResult,m=input.mealsResult,row=Array.isArray(g?.data)?g.data[0]:g?.data;
 const goalsStatus=g?.error?'failed':row&&typeof row==='object'?'available':'missing';
 const diaryStatus=m?.error?'failed':Array.isArray(m?.data)?m.data.every((meal:any)=>meal&&typeof meal.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(meal.date))?'available':'failed':'missing';
 const targets=empty(),logged=empty(),remaining=empty();
 const columns={calories:'daily_calories',protein:'protein_g',carbs:'carbs_g',fats:'fats_g',fiber:'fiber_g'};
 for(const k of keys){const v=row?.[columns[k]];if(goalsStatus==='available'&&finite(v)&&(k!=='calories'||v>0))targets[k]=v;}
 if(diaryStatus==='available'){
  const today=m.data.filter((meal:any)=>meal?.date===input.localDate);
  for(const k of keys){let sum=0,valid=true;for(const meal of today){if(!Array.isArray(meal.meal_items)){valid=false;break;}for(const item of meal.meal_items){if(!finite(item?.[k])){valid=false;break;}sum+=item[k];}if(!valid||!finite(sum)){valid=false;break;}}if(valid)logged[k]=round(sum);}
 }
 for(const k of keys)if(targets[k]!==null&&logged[k]!==null)remaining[k]=round(targets[k]!-logged[k]!);
 return {localDate:input.localDate,timeZone:input.timeZone,goalsStatus,diaryStatus,targets,logged,remaining};
}

/** One unambiguous affirmative current request, never a historical/negated amount or unit conversion. */
export function requestedSourceServings(text:string):number|undefined{
 const fold=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 // No suffix matches inside decimals, signs, fractions or malformed numeric tokens.
 const matches=[...fold.matchAll(/(?<![\p{L}\p{N}.,+\/-])(\d+(?:[.,]\d{1,2})?|one|two|three|uno|una|dos|tres)\s+(?:source\s+)?(?:servings?|portions?|slices?|porci(?:on|ones)|raci(?:on|ones)|rebanadas?)\b/gu)];
 if(matches.length!==1||/slices?|rebanadas?/.test(matches[0][0]))return;
 const match=matches[0],start=match.index!,end=start+match[0].length;
 // A decimal separator is not a sentence boundary. Keep clause-local negation and tense.
 const boundaries=[...fold.matchAll(/[!?;\n]|\.(?!\d)/g)].map(m=>m.index!);
 const left=boundaries.filter(i=>i<start).at(-1)??-1,right=boundaries.find(i=>i>=end)??fold.length;
 const clause=fold.slice(left+1,right).trim(),prefix=fold.slice(left+1,start).trim(),suffix=fold.slice(end,right).trim();
 if(/\b(?:no|not|never|without|sin|ni|don't|dont|cannot|can't|avoid|evita\w*|menos|except|unless|if|si|maybe|perhaps|quiza\w*|tal vez|or|o)\b/.test(clause)||/[?]/.test(fold.slice(left+1,right+1)))return;
 if(/\b(?:yesterday|ago|earlier|previous\w*|last|before|tomorrow|ate|eaten|had|logged|ayer|anteayer|anoche|antes|pasad[oa]s?|manana|comi|comido|consumi|registre|habia)\b/.test(clause))return;
 if(/\b(?:he|she|they|his|her|their|friends?|partner|wife|husband|daughter|son|amig[oa]s?|pareja|esposa|esposo|hij[oa]s?|ella|ellos|ellas)\b/.test(clause)||/\bpara el$/.test(clause))return;
 if(/\b(?:no|not|never|cancel\w*|forget|olvida\w*|dejalo)\b/.test(fold.slice(right)))return;
 const affirmative=/^(?:(?:today|now|hoy|ahora)\s*[, :]?\s*)?(?:i\s+(?:want|would like)|i['’]d like|please\s+(?:give|serve)\s+me|give me|serve me|quiero|quisiera|me gustaria|dame|sirveme)(?:\s+(?:to\s+(?:eat|order|have)|comer|pedir|tomar))?$/;
 const directSelection=prefix===''&&/^(?:please|por favor)?$/.test(suffix);
 if(!affirmative.test(prefix)&&!directSelection)return;
 const token=match[1],n=({one:1,two:2,three:3,uno:1,una:1,dos:2,tres:3} as Record<string,number>)[token]??Number(token.replace(',','.'));
 return Number.isFinite(n)&&n>0&&n<=10?n:undefined;
}

/** Preserve an active serving request across a neutral location answer, never across another topic/food. */
export function currentRequestedSourceServings(messages:Array<{role:string;content:string}>,context:{food:string;mode:string;area?:string}|null|undefined):number|undefined{
 if(!context||context.mode!=='restaurant')return;
 const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ').replace(/[.!]+$/,'');
 const locations=(context.area?[context.area,...context.area.split(',')]:[]).map(fold);
 for(let i=messages.length-1;i>=0;i--){
  const m=messages[i];if(m.role!=='user')continue;
  const value=fold(m.content);
  if(value.startsWith('public_lookup_confirmation:')||/^(?:yes|sure|okay|ok|si|vale|adelante|yes, search public options|si, buscar opciones publicas)$/.test(value))continue;
  if(locations.includes(value)||locations.some(place=>value==='in '+place||value==="i'm in "+place||value==='i am in '+place||value==='en '+place||value==='estoy en '+place))continue;
  const count=requestedSourceServings(m.content);if(count===undefined)return;
  // A positive request for another named food cannot supply this food's quantity.
  const food=fold(context.food),literal=food.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const namesCurrent=food==='meal'||new RegExp('(?<![\\p{L}\\p{N}])'+literal+'(?![\\p{L}\\p{N}])','u').test(value);
  const quantityOnly=/\b(?:servings?|portions?|porci(?:on|ones)|raci(?:on|ones))(?:\s+(?:please|por favor))?$/.test(value);
  return namesCurrent||quantityOnly?count:undefined;
 }
}

export function requestsRemainingMacroFit(messages:Array<{role?:string;content?:unknown}>):boolean{
 const users=messages.filter(m=>m?.role==='user'&&typeof m.content==='string').map(m=>(m.content as string).trim());
 const last=users.at(-1);if(!last)return false;
 const consent=/^(?:public_lookup_confirmation:|yes|sure|okay|ok|search|find|go ahead|si|s[ií]|vale|adelante|buscar|yes, search public options|si, buscar opciones publicas)[.!]?$/i.test(last);
 const request=consent?(users.at(-2)??''):last;
 const value=request.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const fit=/\b(?:fit\w*|within|stay\s+within|encaj\w*|caber|ajust\w*|quepa|quepan)\b/.test(value);
 const remaining=/\b(?:remaining|left|restantes?|restante|saldo|balance|diario|daily|today|hoy|quedan?|budget|presupuesto)\b/.test(value);
 const nutrition=/\b(?:macros?|calories?|calorias?|protein|proteina|carbs?|carbohydrates?|carbohidratos?|fats?|grasas?|fiber|fibra|nutrients?|nutrientes?)\b/.test(value);
 return fit&&remaining&&nutrition;
}

function fitsCompleteRemainingBalance(n:Nutrients,snapshot:PrivateNutritionSnapshot):boolean{
 return cappedKeys.every(k=>snapshot.remaining[k]!==null&&n[k]<=snapshot.remaining[k]!+1e-6);
}

export function personalizeVerifiedOptions(options:LookupOption[],snapshot:PrivateNutritionSnapshot,servings?:number,preference?:string,requireMacroFit=false):LookupOption[]{
 const count=validatedSuggestedServings(servings);
 const out=options.filter(o=>validatedSuggestedServings(o.suggested_servings)!==null&&o.loggable===true&&o.complete_item_verified===true&&o.nutrition_status==='complete_verified'&&keys.every(k=>finite(o.nutrition?.[k]))).map(o=>o.kind==='restaurant'&&servings!==undefined&&count!==null?{...o,suggested_servings:count}:o);
 const balance=snapshot.remaining;
 const knownFitOptions=requireMacroFit&&cappedKeys.every(k=>balance[k]!==null)?out.filter(o=>{const portion=lookupOptionPortion(o,validatedSuggestedServings(o.suggested_servings)??1);return !!portion&&fitsCompleteRemainingBalance(portion.nutrition,snapshot);}):[];
 const candidates=knownFitOptions.length?knownFitOptions:out;
 const score=(o:LookupOption)=>{
  if(o.loggable!==true||!o.complete_item_verified||o.nutrition_status!=='complete_verified')return Infinity;
  const portion=lookupOptionPortion(o,validatedSuggestedServings(o.suggested_servings)??1);if(!portion)return Infinity;const n=portion.nutrition;
  let s=0;for(const k of cappedKeys){const left=balance[k];if(left!==null)s+=Math.max(0,n[k]-left)/Math.max(1,Math.abs(left))*(k==='calories'?10:1);}
  // Preserve room for later meals when several portions fit; do not maximize daily-balance consumption.
  if(balance.calories!==null&&balance.calories>0)s+=n.calories/balance.calories*.01;
  if(!requireMacroFit&&preference==='high_protein')s-=n.protein/Math.max(1,n.calories);
  else if(!requireMacroFit&&preference==='lower_calorie')s+=n.calories/100000;
  return s;
 };
 return candidates.map((o,i)=>({o,i,score:score(o)})).sort((a,b)=>a.score-b.score||a.i-b.i).map(x=>x.o);
}

function macroFitFact(name:string,n:Nutrients,snapshot:PrivateNutritionSnapshot,language:string):string{
 const es=language.startsWith('es'),r=snapshot.remaining;
 const label:Record<keyof Nutrients,string>=es?{calories:'calor\u00edas',protein:'prote\u00edna',carbs:'carbohidratos',fats:'grasas',fiber:'fibra'}:{calories:'calories',protein:'protein',carbs:'carbs',fats:'fat',fiber:'fiber'};
 const amount=(value:number)=>String(round(value));
 const known=cappedKeys.filter(k=>r[k]!==null),unknown=cappedKeys.filter(k=>r[k]===null);
 const fiberProgress=snapshot.logged.fiber===null||snapshot.targets.fiber===null
  ?(es?`Esta porci\u00f3n aporta ${amount(n.fiber)} g de fibra; el progreso diario de fibra no est\u00e1 disponible.`:`This portion provides ${amount(n.fiber)} g of fiber; daily fiber progress is unavailable.`)
  :(es?`Progreso de fibra: ${amount(snapshot.logged.fiber)} g registrados + ${amount(n.fiber)} g en esta porci\u00f3n; meta diaria ${amount(snapshot.targets.fiber)} g.`:`Fiber progress: ${amount(snapshot.logged.fiber)} g logged + ${amount(n.fiber)} g in this portion; daily goal ${amount(snapshot.targets.fiber)} g.`);
 if(!known.length)return (es?`No puedo confirmar si ${name} encaja con tus macros porque no hay saldos diarios disponibles.`:`I cannot confirm whether ${name} fits your macros because today's remaining macro values are unavailable.`)+' '+fiberProgress;
 const exceeded=known.filter(k=>n[k]>(r[k]??0)+1e-6);
 if(exceeded.length){
  const details=exceeded.map(k=>{const unit=k==='calories'?'kcal':'g';return r[k]!<0?(es?`${label[k]} ya supera la meta por ${amount(-r[k]!)} ${unit} y esta porci\u00f3n a\u00f1ade ${amount(n[k])} ${unit}`:`${label[k]} is already ${amount(-r[k]!)} ${unit} over target and this portion adds ${amount(n[k])} ${unit}`):(es?`${label[k]} por ${amount(n[k]-r[k]!)} ${unit}`:`${label[k]} by ${amount(n[k]-r[k]!)} ${unit}`);}).join('; ');
  const base=es?`Alternativa con compensaci\u00f3n, no ajustada al saldo: ${name} supera el saldo registrado de ${details}.`:`Tradeoff, not within the recorded balance: ${name} exceeds the remaining amount for ${details}.`;
  return (unknown.length?base+' '+(es?`No puedo confirmar ${unknown.map(k=>label[k]).join(', ')} porque esos saldos no est\u00e1n disponibles.`:`I cannot confirm ${unknown.map(k=>label[k]).join(', ')} because those remaining values are unavailable.`):base)+' '+fiberProgress;
 }
 if(unknown.length)return (es?`${name} queda dentro de los saldos registrados para ${known.map(k=>label[k]).join(', ')}, pero no puedo confirmar ${unknown.map(k=>label[k]).join(', ')} porque esos datos no est\u00e1n disponibles.`:`${name} is within the recorded remaining amounts for ${known.map(k=>label[k]).join(', ')}, but I cannot confirm ${unknown.map(k=>label[k]).join(', ')} because those values are unavailable.`)+' '+fiberProgress;
 return (es?`${name} queda dentro de los saldos diarios registrados de calor\u00edas y macronutrientes.`:`${name} is within today's recorded remaining calories and macros.`)+' '+fiberProgress;
}

/** Typed arithmetic is rendered by the server; no model-provided amount becomes evidence. */
export function trustedMealFacts(options:LookupOption[],snapshot:PrivateNutritionSnapshot,language:string,requireMacroFit=false):string[]{
 if(!options.some(o=>o.loggable&&o.complete_item_verified&&o.nutrition_status==='complete_verified'))return [];
 const es=language.startsWith('es'),lines:string[]=[],{targets:t,logged:l,remaining:r}=snapshot;
 if(r.calories!==null)lines.push(es?`Tu meta diaria es ${t.calories} kcal; llevas registradas ${l.calories} kcal; el saldo diario es ${r.calories} kcal.`:`Your daily target is ${t.calories} kcal; you have logged ${l.calories} kcal; the daily balance is ${r.calories} kcal.`);
 else lines.push(es?'No tengo una meta y un registro de hoy completos para calcular tu saldo diario.':'I do not have a complete target and today’s log to calculate your daily balance.');
 for(const o of options.filter(o=>o.loggable&&o.complete_item_verified&&o.nutrition_status==='complete_verified').slice(0,3)){
  const m=validatedSuggestedServings(o.suggested_servings);if(m===null)continue;const portion=lookupOptionPortion(o,m);if(!portion)continue;const n=portion.nutrition;
  lines.push(es?`${[o.item_name,o.variant].filter(Boolean).join(', ')} (${m} × ${o.serving.label}): ${n.calories} kcal; proteína ${n.protein} g, carbohidratos ${n.carbs} g, grasas ${n.fats} g y fibra ${n.fiber} g.`:`${[o.item_name,o.variant].filter(Boolean).join(', ')} (${m} × ${o.serving.label}): ${n.calories} kcal; protein ${n.protein} g, carbs ${n.carbs} g, fats ${n.fats} g and fiber ${n.fiber} g.`);
 }
  if(requireMacroFit)for(const o of options.filter(o=>o.loggable&&o.complete_item_verified&&o.nutrition_status==='complete_verified').slice(0,3)){const count=validatedSuggestedServings(o.suggested_servings);if(count===null)continue;const portion=lookupOptionPortion(o,count);if(portion)lines.push(macroFitFact([o.item_name,o.variant].filter(Boolean).join(', '),portion.nutrition,snapshot,language));}
  const first=options[0],firstPortion=first?lookupOptionPortion(first,validatedSuggestedServings(first.suggested_servings)??1):null;
 if(first&&firstPortion&&r.calories!==null&&first.loggable&&first.complete_item_verified){
  const after=round(r.calories-firstPortion.nutrition.calories);
  lines.push(es?`Con la porción mostrada de ${[first.item_name,first.variant].filter(Boolean).join(', ')}, ${r.calories} − ${firstPortion.nutrition.calories} = ${after} kcal de saldo diario.`:`With the displayed portion of ${[first.item_name,first.variant].filter(Boolean).join(', ')}, ${r.calories} − ${firstPortion.nutrition.calories} = ${after} kcal of daily balance.`);
  if(r.calories<0||after<0)lines.push(es?'La porción supera el saldo diario registrado; no puedo prometer que encaje.':'This portion exceeds the recorded daily balance; I cannot promise it fits.');
 }
 return lines;
}

/** Preserve natural coaching, rejecting unsupported quantitative/composition/compensation sentences. */
export function guardPersonalizedMealText(text:string,facts:string[],negativeBalance:boolean):string{
 const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const exact=new Set(facts.map(f=>fold(f.trim())));
 return text.split(/(?<=[.!?])\s+|\n+/).filter(line=>{
  const s=fold(line.trim());if(exact.has(s))return true;
  if(generatedFoodEvidenceQuestion(line,line,'en'))return false;
  if(/\d|\b(?:one|two|three|four|five|ten|hundred|thousand|uno|dos|tres|cuatro|cinco|cien|mil)\b/.test(s))return false;
  if(/\b(?:skip|skipping|salt\w*|omit\w*)\b.{0,35}\b(?:meals?|dinner|lunch|breakfast|comidas?|cena|desayuno|almuerzo)\b|\b(?:lower|reduce|reduc\w*|baj\w*)\b.{0,25}\b(?:target|goal|meta|objetivo)/.test(s))return false;
  if(/\b(?:high|low|rich|alto|alta|bajo|baja|rico|rica)\b.{0,30}\b(?:protein|proteina|calories|calorias|fiber|fibra)\b/.test(s))return false;
  const quality='(?:high|low|rich|much|little|few|fewer|more|less|lots of|plenty of|alt[oa]s?|baj[oa]s?|ric[oa]s?|much[oa]s?|poc[oa]s?|mas|menos|abundantes?|escas[oa]s?)';
  const nutrient='(?:proteins?|proteinas?|calories?|calorias?|carbs?|carbohydrates?|carbohidratos?|fats?|grasas?|fiber|fibra|sugar|azucar|sodium|sodio|energy|energia)';
  if(new RegExp('\\b'+quality+'\\b.{0,70}\\b'+nutrient+'\\b|\\b'+nutrient+'\\b.{0,70}\\b'+quality+'\\b').test(s)||/\b(?:proteic[oa]s?|protein[- ]packed)\b/.test(s))return false;
  // A recorded target is not measured expenditure; even positive remaining calories cannot prove a deficit.
  if(/\b(?:deficit|weight loss|lose weight|perder peso|bajar de peso|quemar grasa)\b/.test(s))return false;
  if(/\b(?:fits?|encaja\w*)\b/.test(s))return false;
  if(negativeBalance&&/\b(?:fits?|encaja\w*|deficit|within|dentro)\b/.test(s))return false;
  return true;
 }).join(' ').trim();
}
