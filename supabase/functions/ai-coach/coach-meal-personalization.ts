import { generatedFoodEvidenceQuestion } from './coach-food-fallback.ts';
import { lookupOptionPortion, validatedSuggestedServings, type LookupOption } from './_shared/coach-recommendation-contract.ts';

export type Nutrients={calories:number|null;protein:number|null;carbs:number|null;fats:number|null;fiber:number|null};
export type PrivateNutritionSnapshot={localDate:string;timeZone:string;goalsStatus:'available'|'missing'|'failed';diaryStatus:'available'|'missing'|'failed';targets:Nutrients;logged:Nutrients;remaining:Nutrients};
const keys=['calories','protein','carbs','fats','fiber'] as const;
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

export function personalizeVerifiedOptions(options:LookupOption[],snapshot:PrivateNutritionSnapshot,servings?:number,preference?:string):LookupOption[]{
 const count=validatedSuggestedServings(servings);
 const out=options.filter(o=>validatedSuggestedServings(o.suggested_servings)!==null&&o.loggable===true&&o.complete_item_verified===true&&o.nutrition_status==='complete_verified'&&keys.every(k=>finite(o.nutrition?.[k]))).map(o=>o.kind==='restaurant'&&servings!==undefined&&count!==null?{...o,suggested_servings:count}:o);
 const balance=snapshot.remaining;
 const score=(o:LookupOption)=>{
  if(o.loggable!==true||!o.complete_item_verified||o.nutrition_status!=='complete_verified')return Infinity;
  const portion=lookupOptionPortion(o,validatedSuggestedServings(o.suggested_servings)??1);if(!portion)return Infinity;const n=portion.nutrition;
  let s=0;for(const k of keys){const left=balance[k];if(left!==null&&left>=0)s+=Math.max(0,n[k]-left)/Math.max(1,left)*(k==='calories'?10:1);}
  // Preserve room for later meals when several portions fit; do not maximize daily-balance consumption.
  if(balance.calories!==null&&balance.calories>0)s+=n.calories/balance.calories*.01;
  if(preference==='high_protein')s-=n.protein/Math.max(1,n.calories);
  else if(preference==='lower_calorie')s+=n.calories/100000;
  return s;
 };
 return out.map((o,i)=>({o,i,score:score(o)})).sort((a,b)=>a.score-b.score||a.i-b.i).map(x=>x.o);
}

/** Typed arithmetic is rendered by the server; no model-provided amount becomes evidence. */
export function trustedMealFacts(options:LookupOption[],snapshot:PrivateNutritionSnapshot,language:string):string[]{
 if(!options.some(o=>o.loggable&&o.complete_item_verified&&o.nutrition_status==='complete_verified'))return [];
 const es=language.startsWith('es'),lines:string[]=[],{targets:t,logged:l,remaining:r}=snapshot;
 if(r.calories!==null)lines.push(es?`Tu meta diaria es ${t.calories} kcal; llevas registradas ${l.calories} kcal; el saldo diario es ${r.calories} kcal.`:`Your daily target is ${t.calories} kcal; you have logged ${l.calories} kcal; the daily balance is ${r.calories} kcal.`);
 else lines.push(es?'No tengo una meta y un registro de hoy completos para calcular tu saldo diario.':'I do not have a complete target and today’s log to calculate your daily balance.');
 for(const o of options.filter(o=>o.loggable&&o.complete_item_verified&&o.nutrition_status==='complete_verified').slice(0,3)){
  const m=validatedSuggestedServings(o.suggested_servings);if(m===null)continue;const portion=lookupOptionPortion(o,m);if(!portion)continue;const n=portion.nutrition;
  lines.push(es?`${[o.item_name,o.variant].filter(Boolean).join(', ')} (${m} × ${o.serving.label}): ${n.calories} kcal; proteína ${n.protein} g, carbohidratos ${n.carbs} g, grasas ${n.fats} g y fibra ${n.fiber} g.`:`${[o.item_name,o.variant].filter(Boolean).join(', ')} (${m} × ${o.serving.label}): ${n.calories} kcal; protein ${n.protein} g, carbs ${n.carbs} g, fats ${n.fats} g and fiber ${n.fiber} g.`);
 }
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
