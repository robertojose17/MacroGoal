import {MEAL_HANDOFF_MARKER,validateMealConversation} from './meal-conversation.ts';
import {savedMealConstraints,type SavedFoodPreferences} from './saved-food-preferences.ts';
import {constrainMeals,dietaryConstraints} from './dietary-constraints.ts';
import {validateComponents,componentTotals,type MealComponent} from './meal-components.ts';
import type {MealOption} from './gallery-meals.ts';
import {lookupIntent} from './coach-lookup-intent.ts';
import type {PrivateNutritionSnapshot} from './coach-meal-personalization.ts';
export const RECOMMENDATION_MARKER='MEAL_RECOMMENDATION:';
export const RECOMMENDATION_UNAVAILABLE_MARKER='MEAL_RECOMMENDATION_UNAVAILABLE:';
export type MealRecommendationDiagnostic=(stage:string,code:string)=>void;
export const STRUCTURED_MEAL_OUTPUT_INSTRUCTIONS=`This structured format overrides the marker-format requirements above for this actionable food workflow request. Return exactly one JSON object and no text outside it, with exactly two keys: {"outcome":"recommendation"|"unavailable"|"search_intake","payload":{...}}. For a specific restaurant or public recipe search request, use search_intake rather than inventing an official menu or source-based recommendation. For outcome recommendation, payload must be the complete meal object using the exact fields and component/nutrition rules specified above. For outcome unavailable, payload must be exactly {"reason":"needs_clarification"|"restriction_cannot_be_screened"|"cannot_estimate"}. For outcome search_intake, use only when the user requests restaurant or public recipe search; payload must be the existing meal_conversation_v1 input fields (mode,food_query,public_area,restaurant,preference,exclusions,allergens,dietary_preferences), grounded in the user's words and saved restrictions. The server validates the intake and returns the existing explicit-consent flow; it does not perform the search. Do not emit marker strings, Markdown, extra keys, or unvalidated food advice. The server validates recommendation payloads and builds review cards; it ignores prose or totals not present in a validated meal object.`;
export function shouldBufferMealResponse(messages:any[]){
 // This endpoint can turn any conversational answer into a validated meal card.
 // Intent cannot be reliably classified from a keyword list before generation,
 // so hold all non-empty user turns until the final response has been screened.
 return messages.some((m:any)=>m?.role==='user'&&typeof m.content==='string'&&m.content.trim().length>0);
}
export const RECOMMENDATION_INSTRUCTIONS=`ACTIONABLE MEAL RECOMMENDATIONS: When the user asks what to eat, requests a meal/food suggestion, asks for an estimate, asks to add a meal, or refines a meal's ingredients, provide one useful reviewable meal card when it can be screened safely; do not start an onboarding questionnaire. Use saved food preferences, explicit restrictions and today's remaining calorie/macronutrient context. State numbers and tradeoffs; never claim a perfect fit without checking them. Do not ask permission to show a card. If portions are unspecified, give explicit estimated portions the user can edit. Never claim restaurant availability, official ingredients or nutrition without verified sources. Do not search or log anything automatically.
For every meal suggestion, estimate, or add-meal request, end with exactly one structured outcome. For a valid recommendation, use MEAL_RECOMMENDATION: followed by one JSON object with exactly name,portion_label,components,assumptions,exclusions,allergens,dietary_preferences. name is a concise food title (80 characters); portion_label is a concise serving description (160 characters). components is 1-6 objects with exactly name,quantity,unit,grams,nutrition. Each component name is at most 80 characters, unit at most 24, quantity positive; grams is total ESTIMATED physical mass for that component quantity, or null if unknown. nutrition contains calories,protein,carbs,fats,fiber: finite nonnegative estimated TOTALS for that component quantity, not per100g. Estimate fiber; do not substitute zero for missing data. Include all ingredients, oils and sauces used in the estimate. assumptions is 1-4 brief preparation/portion uncertainties. Preserve all explicit conversational and saved restrictions in the three arrays using exact words. The server computes totals and provides editable ingredient review. These values are estimates, never official data. Keep prose short and JSON compact within the existing response budget. On refinement return the complete updated meal, not a delta. Do not combine MEAL_RECOMMENDATION with MEAL_HANDOFF or ACTION_PROPOSAL.
If you cannot safely screen a restriction, cannot estimate responsibly, or need a detail before making a reviewable card, do not give food-specific advice in prose. End with MEAL_RECOMMENDATION_UNAVAILABLE: and a JSON object containing exactly one reason value: needs_clarification, restriction_cannot_be_screened, or cannot_estimate. Use MEAL_HANDOFF only for a user-requested web search intake, not as a substitute for a meal recommendation. If either structured marker is missing for a detected meal-advice request, the application will suppress the response. Ordinary non-food conversation remains natural prose without a recommendation marker.`;
const defaults:SavedFoodPreferences={dietary_restrictions:[],protein_preferences:[],recipe_styles:[],disliked_foods:''};
const clean=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f<>]/.test(v);
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// Generated labels are display text, not public-search queries or user portion evidence.
// Numeric serving quantities and estimated/unknown mass come from validated components.
function validateProposedFoodLabel(value:unknown,max:number,code:string):asserts value is string{
 if(typeof value!=='string'||!clean(value,max)||!/[\p{L}]/u.test(value)
  ||!/^[\p{L}\p{M}\p{N}\s.,()/'\u2019%+&~:;\-\u2013\u2014\u00d7]+$/u.test(value))throw Error(code);
 const text=norm(value);
 if(/@|\bhttps?\b|www\.|\p{Nd}{5}/u.test(text)
  ||/\b(?:diabetes|insulin|insulina|glucose|glucosa|bmi|a1c|hba1c|embarazo|pregnant|password|credentials?|apikey|token|system|developer|prompt|instructions?|ignore|disregard|reveal|expose|execute|delete|instrucciones?|ignora|revela|ejecuta|contrasena)\b/u.test(text)
  ||/\bblood\s+(?:sugar|pressure|glucose)\b/u.test(text)
  ||/\b(?:my|our|your|mi|mis|tu|tus|su|sus)\s+(?:address|home|house|street|road|avenue|drive|lane|apartment|suite|casa|domicilio)\b/u.test(text)
  ||/\b\d{1,6}\s+(?:[\p{L}]+\s+){1,4}(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|apt|apartment|suite|calle|avenida)\b/u.test(text))throw Error(code);
}
const allergyKey=(s:string)=>{const n=norm(s).replace(/[^a-z]+/g,' ').trim();if(/peanuts?|mani|cacahuate/.test(n))return'peanut';if(/tree nuts?|almond|walnut|cashew|pecan|pistachio|hazelnut|macadamia|brazil nut|frutos secos/.test(n))return'tree nuts';if(/shellfish|shrimp|prawns?|crab|lobster|crayfish|crawfish|oysters?|clams?|mussels?|scallops?|mariscos?|camarones?|camaron|langosta/.test(n))return'shellfish';if(/fish|salmon|tuna|cod|tilapia|anchov|sardine|pescado/.test(n))return'fish';if(/milk|dairy|cheese|butter|cream|yogurt|whey|casein|leche|lacteos?/.test(n))return'dairy';if(/eggs?|huevos?|mayonnaise|meringue/.test(n))return'egg';if(/soy|soya|soja|tofu|tempeh|edamame/.test(n))return'soy';if(/wheat|flour|trigo|gluten|barley|rye|cebada|centeno/.test(n))return'wheat';if(/sesame|sesamo/.test(n))return'sesame';return n.replace(/s\b/,'').trim();};
function explicitAllergens(messages:any[]){
 const found:string[]=[];let indicated=false;
 const allergySignal=/\b(?:allerg\w*|alerg\w*|intoler\w*)\b/iu;
 const polarityChange=/\b(?:no\s+longer|not\s+(?:(?:currently|any\s+longer|anymore)\s+)?allergic|not\s+anymore|used\s+to\s+be\s+allergic|formerly\s+allergic|previously\s+allergic|never\s+been\s+allergic|ya\s+no\s+soy\s+al[eé]rgic[oa]|ya\s+no\s+tengo\s+alergia|antes\s+(?:era|ten[ií]a)\s+alergia|dejé\s+de\s+ser\s+al[eé]rgic[oa])\b/iu;
 const correction=/\b(?:but|however|although|except|rather\s+than|instead|pero|sin\s+embargo|aunque|en\s+cambio)\b/iu;
 const direct=/\b(?:(?:i(?:'m| am)?|soy|estoy)\s+)?(?:allergic\s+to|allergy\s+to|allergies\s+to|al[e\u00e9]rgic[oa]\s+a|alergia\s+a|alergias\s+a|intolerant\s+to|intolerance\s+to|intolerante\s+a|intolerancia\s+a)\s*([^.!?;\n]+)/giu;
 const suffix=/([\p{L}\p{M}][\p{L}\p{M}'-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}'-]*){0,3})\s+allerg(?:y|ies)\b/giu;
 const split=(clause:string)=>{
  const items=clause.split(/\s*(?:,|\band\b|\bor\b|\by\b|\bo\b)\s*/i).map(x=>x.trim());
  for(const item of items){
   const words=item.split(/\s+/);while(words.length&&/^(?:i|we|am|are|have|has|got|a|an|the|my|and|or|severe|mild|known|food|to)$/i.test(words[0]))words.shift();
   const term=words.join(' ').trim();if(!term)continue;
   if(/^(?:food|foods|something|multiple|several|various|unknown|unspecified|severe|mild)$/i.test(term))throw Error('ambiguous_allergy');
   found.push(term);
  }
 };
 for(const m of messages.filter(x=>x?.role==='user'&&typeof x.content==='string')){
  const text=m.content;
  const allergyMentions=(text.match(/\b(?:allerg\w*|alerg\w*|intoler\w*)\b/giu)??[]).length;
  // A correction or negation changes which restrictions are current. Do not
  // guess at polarity or let a meal card through on a partial interpretation.
  if(allergySignal.test(text)&&(polarityChange.test(text)||(allergyMentions>1&&correction.test(text))))throw Error('ambiguous_allergy');
  for(const match of text.matchAll(direct)){indicated=true;split(match[1].split(/\b(?:but|however|pero|aunque)\b/i)[0]);}
  for(const match of text.matchAll(suffix)){indicated=true;split(match[1]);}
 }
 if(indicated&&!found.length)throw Error('ambiguous_allergy');
 return [...new Set(found)];
}function allergyConflicts(ingredient:string,allergen:string){
 const value=norm(ingredient),key=allergyKey(allergen),patterns:Record<string,RegExp>={peanut:/\bpeanuts?\b|peanut butter|mani|cacahuate/,'tree nuts':/\b(?:almond|walnut|cashew|pecan|pistachio|hazelnut|macadamia|brazil nut)s?\b|frutos secos/,shellfish:/\b(?:shellfish|shrimp|prawns?|crab|lobster|crayfish|crawfish|oysters?|clams?|mussels?|scallops?)\b|camarones?|camaron|langosta|mariscos?/,fish:/\b(?:fish|salmon|tuna|cod|tilapia|anchov(?:y|ies)|sardine)s?\b|pescado/,dairy:/\b(?:milk|cheese|butter|cream|yogurt|yoghurt|whey|casein|dairy)s?\b|leche|queso|mantequilla|crema|lacteos?/,egg:/\b(?:eggs?|mayonnaise|meringue)\b|huevos?/,soy:/\b(?:soy|soya|tofu|tempeh|edamame)\b/,wheat:/\b(?:wheat|flour|bread|pasta|barley|rye|gluten)\b|trigo|cebada|centeno/,sesame:/\bsesame\b|sesamo/};
 return (patterns[key]??new RegExp('\\b'+key.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')+'\\b','i')).test(value);
}
/** Restrictions remain evidence-bound. Known dietary statements cannot disappear from metadata. */
function constraintsFor(raw:any,messages:any[],saved:SavedFoodPreferences){
 const checked=validateMealConversation({mode:'quick',food_query:'meal',public_area:null,restaurant:null,preference:'preferred_food',exclusions:raw.exclusions,allergens:raw.allergens,dietary_preferences:raw.dietary_preferences},messages,saved);
 if(!checked)throw Error('invalid_recommendation_constraints');
 const c=dietaryConstraints(checked.fields),known=/\b(vegetarian[oa]?|vegetariano|vegetariana|vegan[oa]?|gluten[- ]free|dairy[- ]free)\b/giu;
 for(const m of messages.filter(x=>x?.role==='user'&&typeof x.content==='string')){
  for(const match of m.content.matchAll(known))if(!c.dietary_preferences.some(x=>norm(x)===norm(match[0])))c.dietary_preferences.push(match[0]);
  // A restriction-bearing user turn must be represented, not silently ignored.
  if(/\b(?:allerg\w*|al[e\u00e9]rg\w*|intoler\w*)\b/iu.test(m.content)&&!explicitAllergens([m]).length)throw Error('ambiguous_allergy');
  if(/\b(?:allerg\w*|al[e\u00e9]rg\w*|intoler\w*)\b/iu.test(m.content)&&!c.allergens.length)throw Error('unrepresented_allergy');
  if(/\b(?:avoid|evita\w*|no como|cannot eat|can't eat|do not eat|don't eat)\b/iu.test(m.content)&&![...c.exclusions,...c.allergens,...c.dietary_preferences].some(t=>norm(m.content).includes(norm(t))))throw Error('unrepresented_restriction');
 }
 const supplied=new Set(c.allergens.map(allergyKey));if(explicitAllergens(messages).some(t=>!supplied.has(allergyKey(t))))throw Error('unrepresented_allergy');
 return dietaryConstraints(c);
}
function searchHandoffFromModel(raw:any,messages:any[],saved:SavedFoodPreferences=defaults){
 const handoff=validateMealConversation(raw,messages,saved);if(!handoff)return null;
 // Search must carry the same complete restrictions as a recommendation card.
 const constraints=constraintsFor(handoff.fields,messages,saved);
 return {...handoff,fields:{...handoff.fields,...constraints}};
}
const macroKeys=['calories','protein','carbs','fats'] as const;
const macroLabels:Record<typeof macroKeys[number],string>={calories:'calories',protein:'protein',carbs:'carbs',fats:'fat'};
const formatAmount=(value:number)=>String(Math.round((value+Number.EPSILON)*10)/10);
export function requestsRemainingMacroBudget(messages:any[]){
 const latest=[...messages].reverse().find((m:any)=>m?.role==='user'&&typeof m.content==='string')?.content;
 if(typeof latest!=='string')return false;
 const value=norm(latest);
 return /\b(?:remaining|left|restantes?|restante|saldo|balance|budget|presupuesto)\b/.test(value)
  &&/\b(?:macros?|calories?|calorias?|protein|proteina|carbs?|carbohydrates?|carbohidratos?|fats?|grasas?|nutrients?|nutrientes?)\b/.test(value)
  &&/\b(?:meal|food|dish|recipe|eat|dinner|lunch|breakfast|restaurant|comida|plato|receta|comer|cena|almuerzo|desayuno|restaurante|recomiend\w*|suggest\w*|recommend\w*|sugier\w*)\b/.test(value);
}
function isSpanishMealRequest(messages:any[]){
 const latest=[...messages].reverse().find((m:any)=>m?.role==='user'&&typeof m.content==='string')?.content;
 return typeof latest==='string'&&(/\b(?:quiero|quisiera|comida|pollo|arroz|dame|agregar|guardar|porcion|recomienda|ingredientes|comer|cena|desayuno|almuerzo|receta)\b/i.test(norm(latest))||/[áéíóúñ]/i.test(latest));
}
function macroBudgetAssessment(components:MealComponent[],snapshot:PrivateNutritionSnapshot|undefined,requested:boolean,spanish=false){
 if(!requested)return {components,adjusted:false,summary:null as string|null,assumption:null as string|null};
 const balances=snapshot?.remaining;
 const known=balances?macroKeys.filter(k=>typeof balances[k]==='number'&&Number.isFinite(balances[k])):[];
 const unknown=macroKeys.filter(k=>!known.includes(k));
 const before=componentTotals(components);
 const violated=known.filter(k=>before[k]>Math.max(0,balances![k]!)+1e-6);
 let selected=components,adjusted=false;
 if(violated.length){
  const scale=Math.min(...violated.map(k=>balances![k]!>0?balances![k]!/before[k]:0));
  const mass=components.every(c=>c.grams!==null)?components.reduce((sum,c)=>sum+c.grams!,0):null;
  // Do not turn a normal meal into a trace portion or a physically implausible
  // mass. In that case keep it reviewable and state the exact tradeoff below.
  if(scale>=0.25&&scale<1&&!(mass!==null&&mass*scale*0.999<20)){
   const safeScale=scale*0.999;
   const scaled=validateComponents(components.map(c=>({...c,quantity:c.quantity*safeScale,grams:c.grams===null?null:c.grams*safeScale,nutrition:Object.fromEntries(Object.entries(c.nutrition).map(([key,value])=>[key,value*safeScale])) as MealComponent['nutrition']})));
   const after=componentTotals(scaled);
   if(known.every(k=>after[k]<=Math.max(0,balances![k]!)+0.01)){selected=scaled;adjusted=true;}
  }
 }
 const totals=componentTotals(selected);
 const labels=spanish?{calories:'calorías',protein:'proteína',carbs:'carbohidratos',fats:'grasa'}:macroLabels;
 const unknownNote=known.length&&unknown.length
  ?(spanish?` No puedo confirmar ${unknown.map(k=>labels[k]).join(', ')} porque esos saldos no están disponibles.`:` I cannot confirm ${unknown.map(k=>labels[k]).join(', ')} because those balances are unavailable.`)
  :'';
 const fitNote=!known.length
  ?(spanish?`No puedo confirmar si esta porción cabe porque no están disponibles los saldos diarios de calorías y macronutrientes.`:`I cannot confirm whether this portion fits because today's remaining calorie and macro balances are unavailable.`)
  :adjusted
   ?(spanish?`Ajusté proporcionalmente las cantidades estimadas para que la porción quede dentro de los saldos registrados de ${known.map(k=>labels[k]).join(', ')}.`:`I proportionally adjusted the estimated ingredient amounts to fit the recorded remaining balances for ${known.map(k=>labels[k]).join(', ')}.`)
   :violated.length
    ?(spanish?`Compensación, no dentro del saldo registrado: ${violated.map(k=>balances![k]!<0?`la meta de ${labels[k]} ya se supera por ${formatAmount(-balances![k]!)} ${k==='calories'?'kcal':'g'} y esta porción añadiría ${formatAmount(totals[k])} ${k==='calories'?'kcal':'g'}`:`esta porción excede ${labels[k]} por ${formatAmount(totals[k]-balances![k]!)} ${k==='calories'?'kcal':'g'}`).join('; ')}.`:`Tradeoff, not within the recorded balance: ${violated.map(k=>balances![k]!<0?`${macroLabels[k]} is already ${formatAmount(-balances![k]!)} ${k==='calories'?'kcal':'g'} over target and this portion adds ${formatAmount(totals[k])} ${k==='calories'?'kcal':'g'}`:`this portion exceeds ${macroLabels[k]} by ${formatAmount(totals[k]-balances![k]!)} ${k==='calories'?'kcal':'g'}`).join('; ')}.`)
    :(spanish?`La porción queda dentro de los saldos diarios registrados de ${known.map(k=>labels[k]).join(', ')}.`:`This portion is within the recorded remaining balances for ${known.map(k=>macroLabels[k]).join(', ')}.`);
 const fitStatus=fitNote+unknownNote;
 const fiberNote=snapshot&&snapshot.logged.fiber!==null&&snapshot.targets.fiber!==null
  ?(spanish?` Progreso de fibra: ${formatAmount(snapshot.logged.fiber)} g registrados + ${formatAmount(totals.fiber)} g en esta porción hacia una meta diaria de ${formatAmount(snapshot.targets.fiber)} g; la fibra es progreso, no un límite máximo.`:` Fiber progress is ${formatAmount(snapshot.logged.fiber)} g logged plus ${formatAmount(totals.fiber)} g in this portion toward a ${formatAmount(snapshot.targets.fiber)} g daily goal; fiber is progress, not a maximum.`)
  :(spanish?` La fibra se registra como progreso, no como límite máximo; el progreso diario no está disponible.`:` Fiber is tracked as progress, not a maximum; today's fiber progress is unavailable.`);
 const summary=fitStatus+fiberNote;
 const assumption=adjusted
  ?(spanish?`Las cantidades estimadas de los ingredientes se ajustaron proporcionalmente a los saldos diarios registrados.`:`Estimated component amounts were scaled proportionally to the recorded remaining calorie and macro balances.`)
  :violated.length
   ?(spanish?`Esta estimación supone una compensación frente a los saldos registrados; no se redujo a una porción muy pequeña.`:`This estimate is a tradeoff against the recorded remaining calorie and macro balances; it was not scaled to a very small portion.`)
   :unknown.length||!known.length?(spanish?`No se puede confirmar el ajuste total porque faltan algunos saldos diarios.`:`Overall macro fit cannot be confirmed because some daily balances are unavailable.`):null;
 return {components:selected,adjusted,summary,assumption};
}
function explicitLookupHandoff(messages:any[],saved:SavedFoodPreferences,payload:any){
 const latest=[...messages].reverse().find((m:any)=>m?.role==='user'&&typeof m.content==='string')?.content;
 if(typeof latest!=='string'||latest.startsWith('public_lookup_confirmation:'))return null;
 const intent=lookupIntent(latest);
 if(intent.kind==='skip'||!['restaurant','product','recipe'].includes(intent.mode??''))return null;
 const context=intent.context;
 const mode=intent.mode==='restaurant'?'eat_out':intent.mode==='recipe'?'cook':'quick';
 const preference=context?.preference??intent.proposal?.preference;
 const mappedPreference=preference==='healthy'?'balanced':preference==='high_protein'||preference==='lower_calorie'||preference==='balanced'?preference:null;
 const list=(key:'exclusions'|'allergens'|'dietary_preferences')=>{
  const value=payload?.[key];if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>24||value.some((item:any)=>typeof item!=='string'||item.length>160))throw Error('invalid_search_intake');
  return value;
 };
 const raw={
  mode,
  food_query:context?.food??intent.food??null,
  public_area:context?.area??intent.area??intent.proposal?.locality??null,
  restaurant:context?.restaurant??intent.restaurant??intent.proposal?.restaurant??null,
  preference:mappedPreference,
  exclusions:list('exclusions'),allergens:list('allergens'),dietary_preferences:list('dietary_preferences'),
 };
 return searchHandoffFromModel(raw,messages,saved);
}
export function recommendationFromModel(raw:any,messages:any[],saved:SavedFoodPreferences=defaults,snapshot?:PrivateNutritionSnapshot){
 if(!raw||Array.isArray(raw)||Object.keys(raw).some(k=>!['name','portion_label','components','assumptions','exclusions','allergens','dietary_preferences'].includes(k))||!clean(raw.name,80)||!clean(raw.portion_label,160)||!Array.isArray(raw.components)||!raw.components.length||raw.components.length>6||!Array.isArray(raw.assumptions)||!raw.assumptions.length||raw.assumptions.length>4||raw.assumptions.some((x:any)=>!clean(x,240)))throw Error('invalid_recommendation');
 validateProposedFoodLabel(raw.portion_label,160,'invalid_recommendation_portion');
 validateProposedFoodLabel(raw.name,80,'invalid_recommendation_name');
 const constraints=constraintsFor(raw,messages,saved);
 const parsedComponents=validateComponents(raw.components.map((c:any,i:number)=>{
  if(!c||Object.keys(c).some(k=>!['name','quantity','unit','grams','nutrition'].includes(k))||!clean(c.name,80)||!clean(c.unit,24))throw Error('invalid_recommendation_component');
  validateProposedFoodLabel(c.name,80,'invalid_recommendation_component');
  validateProposedFoodLabel(c.unit,24,'invalid_recommendation_component');
  return {...c,id:'component-'+(i+1),authority:'estimated'};
 }));
 const initialTotals=componentTotals(parsedComponents),energy=initialTotals.protein*4+initialTotals.carbs*4+initialTotals.fats*9;
 if(Math.abs(energy-initialTotals.calories)>Math.max(100,initialTotals.calories*.35))throw Error('inconsistent_recommendation_energy');
 const initialGrams=parsedComponents.every(c=>c.grams!==null)?parsedComponents.reduce((sum,c)=>sum+c.grams!,0):null;
 if(initialGrams!==null&&(initialGrams<20||initialGrams>2000))throw Error('invalid_recommendation_mass');
 const budget=macroBudgetAssessment(parsedComponents,snapshot,requestsRemainingMacroBudget(messages),isSpanishMealRequest(messages));
 const components=budget.components,totals=componentTotals(components);
 const grams=components.every(c=>c.grams!==null)?components.reduce((s,c)=>s+c.grams!,0):null;
 if(grams!==null&&(grams<20||grams>2000))throw Error('invalid_recommendation_mass');
 const ingredientEvidence=[raw.name,...components.map(c=>c.name),...raw.assumptions].join(' ');
 if(explicitAllergens(messages).some(a=>allergyConflicts(ingredientEvidence,a)))throw Error('meal_conflicts_with_allergy');
 const portionLabel=budget.adjusted?'1 adjusted serving':'1 proposed serving';
 const option:MealOption={id:'conversation-meal',name:raw.name.trim(),identity:{kind:'general_meal',portion_label:portionLabel},components,ingredients:components.map(c=>c.name),instructions:[],prep_minutes:null,provenance:{kind:'estimate'},...(grams!==null?{physical_portion:{grams,authority:'estimated' as const}}:{}),nutrition:{authority:'estimated',basis:{amount:1,unit:'serving',label:portionLabel},values:totals,confidence:'low',assumptions:['AI-proposed ingredient quantities, weight and nutrition are estimates for one serving; not a measured portion, official restaurant data or verified availability.',...(budget.assumption?[budget.assumption]:[]),...raw.assumptions]},allergy_status:'requires_review',review_required:true};
 const screened=constrainMeals([option],constraints);if(!screened.length)throw Error('meal_conflicts_with_constraints');
 return {schema:'meal_recommendation_v1' as const,option:screened[0],macro_fit_summary:budget.summary??undefined,next_action:'import_recommendation' as const,server_auto_logging:false as const};
}
function explicitMealAdviceRequest(messages:any[]){
 const recent=messages.filter(x=>x?.role==='user'&&typeof x.content==='string').slice(-1).map((x:any)=>norm(x.content));
 const direct=/\b(?:recommend\w*|suggest\w*|what\s+(?:should|can|do)\s+i\s+(?:eat|have)|what\s+to\s+eat|what\s+do\s+you\s+recommend|meal\s+idea|food\s+idea|high\s+protein\s+option|help\s+me\s+choose|give\s+me\s+(?:a\s+)?(?:meal|food|snack|option)|estimate\s+(?:the\s+)?(?:meal|nutrition|ingredients)|add\s+(?:it|this|that|your\s+suggestion)\s+to\s+(?:my\s+)?meals?|quiero\s+comer|que\s+(?:debo|puedo)\s+comer|que\s+me\s+recomiendas|recomienda\w*|sugiere\w*|dame\s+(?:una\s+)?(?:comida|opcion|idea)|agrega\s+(?:esto|eso)\s+a\s+mis\s+comidas?)\b/;
 const foodContext=/\b(?:foods?|meals?|dish|recipes?|ingredients?|eat|dinner|lunch|breakfast|brunch|snacks?|restaurants?|menus?|nutrition|calories?|macros?|protein|carbs?|fiber|fat|hungry|comidas?|platos?|recetas?|ingredientes?|comer|desayuno|almuerzo|cena|merienda|restaurantes?|nutricion|calorias?|proteina|pollo|arroz|verduras?)\b/;
 return recent.some(text=>direct.test(text)&&foodContext.test(text));
}
export function publicFoodSearchRequest(messages:any[]){
 const latest=[...messages].reverse().find((m:any)=>m?.role==='user'&&typeof m.content==='string')?.content;
 if(typeof latest!=='string')return false;
 const intent=lookupIntent(latest);
 if(intent.kind==='search'||!!intent.proposal)return true;
 // lookupIntent deliberately returns a clarification for a bounded public
 // lookup whose locality or menu fields still need resolution. Keep that
 // consent-gated path structured without treating educational nutrition
 // questions as searches.
 return intent.kind==='clarify'&&['restaurant','product','recipe'].includes(intent.mode??'')
  &&(!!intent.context||['area','food','mode','fields','public_locality_only','confirmation_required'].includes(intent.reason??''));
}
export function shouldUseStructuredMealOutput(messages:any[]){return explicitMealAdviceRequest(messages)||publicFoodSearchRequest(messages);}
function responseLooksLikeMealAdvice(text:string){
 const action=/\b(?:try|have|eat|enjoy|make|cook|prepare|order|choose|serve|add|recommend|suggest|prueba|come|prepara|cocina|pide|elige|agrega)\b/i.test(text);
 if(!action)return false;
 const mealContext=/\b(?:for\s+(?:breakfast|brunch|lunch|dinner|snack)|as\s+(?:a\s+)?(?:meal|dish|snack)|on\s+toast|meal|dish|recipe|food|breakfast|brunch|lunch|dinner|snack|desayuno|almuerzo|cena|merienda|comida|plato|receta)\b/i;
 const foodWords=/\b(?:satay|cheddar|toast|sandwich|bowl|salad|soup|chicken|turkey|beef|pork|salmon|tuna|shrimp|prawns?|tofu|eggs?|rice|pasta|oats?|bread|cheese|yogurt|yoghurt|peanut|lentil|beans?|fruit|vegetables?|broccoli|pollo|arroz|queso|tostada|ensalada|sopa|frijoles|lentejas)\b/i;
 return mealContext.test(text)||foodWords.test(text);
}
function safeMealFallback(messages:any[],saved?:SavedFoodPreferences,reason?:string){
 let unsupported=false;try{savedMealConstraints(saved??defaults);}catch{unsupported=true;}
 const userText=messages.filter(x=>x?.role==='user'&&typeof x.content==='string').slice(-4).map((x:any)=>x.content).join(' ');
 const spanish=/\b(?:quiero|comida|pollo|arroz|dame|agregar|guardar|porcion|recomienda|ingredientes|comer|cena|desayuno)\b/i.test(norm(userText));
 if(unsupported||reason==='restriction_cannot_be_screened')return spanish?'No puedo verificar con fiabilidad una de tus restricciones alimentarias guardadas para esta comida, así que no mostraré una recomendación sin revisar. Puedo ayudarte con otras preguntas.':'I cannot reliably screen one of your saved dietary restrictions for this meal, so I will not show an unreviewed recommendation. I can still help with other questions.';
 if(reason==='needs_clarification')return spanish?'Necesito un dato más para preparar una tarjeta de comida revisable: ¿qué plato o porción quieres estimar?':'I need one detail to prepare a reviewable meal card: what dish or portion would you like me to estimate?';
 if(reason==='cannot_estimate')return spanish?'No puedo estimar esta comida con suficiente fiabilidad, así que no mostraré consejos de comida sin revisar.':'I cannot estimate this meal reliably enough, so I will not show unreviewed food advice.';
 return spanish?'No pude convertir esa respuesta en una tarjeta de comida validada, así que no mostraré consejos de comida sin revisar. Puedes pedirme otra estimación cuando quieras.':'I could not turn that response into a validated meal card, so I will not show unreviewed food advice. You can ask me for another estimate whenever you like.';
}
function structuredUnavailableReason(text:string){
 const at=text.indexOf(RECOMMENDATION_UNAVAILABLE_MARKER);if(at<0)return null;
 try{const value=JSON.parse(text.slice(at+RECOMMENDATION_UNAVAILABLE_MARKER.length).trim());if(!value||Array.isArray(value)||Object.keys(value).length!==1||!['needs_clarification','restriction_cannot_be_screened','cannot_estimate'].includes(value.reason))return 'invalid';return value.reason;}catch{return 'invalid';}
}
function validatedHandoff(text:string,messages:any[],saved?:SavedFoodPreferences){
 const at=text.indexOf(MEAL_HANDOFF_MARKER);if(at<0)return {attempted:false,text,handoff:null};
 const prose=text.slice(0,at).trimEnd(),metadata=text.slice(at+MEAL_HANDOFF_MARKER.length).trim();let handoff=null;
 if(metadata.length<=2048){try{handoff=searchHandoffFromModel(JSON.parse(metadata),messages,saved);}catch{/* Invalid handoffs cannot authorize a workflow. */}}
 return {attempted:true,text:prose,handoff};
}
function safeHandoffAcknowledgement(messages:any[]){
 const userText=messages.filter(x=>x?.role==='user'&&typeof x.content==='string').slice(-4).map((x:any)=>norm(x.content)).join(' ');
 return /\b(?:quiero|comida|pollo|arroz|dame|agregar|guardar|porcion|recomienda|receta|ingredientes|comer|cena|desayuno)\b/.test(userText)
  ?'Puedo preparar esa búsqueda para que la revises.'
  :'I can prepare that search for your review.';
}
const recommendationErrorCodes=new Set(['invalid_recommendation','invalid_recommendation_name','invalid_recommendation_portion','invalid_recommendation_component','invalid_recommendation_constraints','invalid_dietary_constraints','ambiguous_allergy','unrepresented_allergy','unrepresented_restriction','ambiguous_saved_restriction','unsupported_saved_restriction','invalid_components','invalid_component_nutrition','invalid_component_source','component_source_required','invalid_component_total','empty_meal','invalid_recommendation_mass','portion_clarification_required','general_food_clarification_required','meal_conflicts_with_allergy','meal_conflicts_with_constraints','inconsistent_recommendation_energy']);
const safeRecommendationErrorCode=(error:unknown)=>error instanceof Error&&recommendationErrorCodes.has(error.message)?error.message:'validation_rejected';
const reportRecommendationFailure=(report:MealRecommendationDiagnostic|undefined,stage:string,code:string)=>{try{report?.(stage,code);}catch{}};
export function extractMealRecommendation(text:string,messages:any[],saved?:SavedFoodPreferences,report?:MealRecommendationDiagnostic,structuredOutputExpected=false,snapshot?:PrivateNutritionSnapshot){
 if(structuredOutputExpected){
  const latestUserMessage=[...messages].reverse().find((m:any)=>m?.role==='user'&&typeof m.content==='string')?.content;
  if(publicFoodSearchRequest(messages)&&!(typeof latestUserMessage==='string'&&latestUserMessage.startsWith('public_lookup_confirmation:'))){
   let candidate:any=null;
   if(text.length<=12000){try{const envelope=JSON.parse(text.trim());if(envelope&&typeof envelope==='object'&&!Array.isArray(envelope))candidate=envelope.payload;}catch{}}
   let handoff=null,lookupError:unknown=null;
   try{handoff=explicitLookupHandoff(messages,saved??defaults,candidate);}catch(error){lookupError=error;}
   if(handoff)return {text:safeHandoffAcknowledgement(messages),recommendation:null,handoff,handled:true,rejected:false};
   const code=lookupError?safeRecommendationErrorCode(lookupError):'invalid_search_intake';
   reportRecommendationFailure(report,'explicit_lookup_validation',code);
   const restrictionFailure=['ambiguous_allergy','unrepresented_allergy','ambiguous_saved_restriction','unsupported_saved_restriction','invalid_dietary_constraints','unrepresented_restriction'].includes(code);
   return {text:safeMealFallback(messages,saved,restrictionFailure?'restriction_cannot_be_screened':'needs_clarification'),recommendation:null,handoff:null,handled:true,rejected:true};
  }
  if(text.length>12000){reportRecommendationFailure(report,'json_envelope','response_too_large');return {text:safeMealFallback(messages,saved),recommendation:null,handoff:null,handled:true,rejected:true};}
  let envelope:any;try{envelope=JSON.parse(text.trim());}catch{reportRecommendationFailure(report,'json_envelope','invalid_json');return {text:safeMealFallback(messages,saved),recommendation:null,handoff:null,handled:true,rejected:true};}
   if(!envelope||Array.isArray(envelope)||Object.keys(envelope).length!==2||!Object.prototype.hasOwnProperty.call(envelope,'outcome')||!Object.prototype.hasOwnProperty.call(envelope,'payload')||!['recommendation','unavailable','search_intake'].includes(envelope.outcome)){reportRecommendationFailure(report,'json_envelope','invalid_envelope');return {text:safeMealFallback(messages,saved),recommendation:null,handoff:null,handled:true,rejected:true};}
  if(envelope.outcome==='unavailable'){
   const p=envelope.payload;if(!p||Array.isArray(p)||Object.keys(p).length!==1||!['needs_clarification','restriction_cannot_be_screened','cannot_estimate'].includes(p.reason)){reportRecommendationFailure(report,'json_envelope','invalid_unavailable_payload');return {text:safeMealFallback(messages,saved),recommendation:null,handoff:null,handled:true,rejected:true};}
   return {text:safeMealFallback(messages,saved,p.reason),recommendation:null,handoff:null,handled:true,rejected:false};
  }
   if(envelope.outcome==='search_intake'){
    let handoff=null,intakeError:unknown=null;
    try{
     handoff=searchHandoffFromModel(envelope.payload,messages,saved??defaults);
    }catch(error){intakeError=error;handoff=null;}
    if(!handoff){
     const code=intakeError?safeRecommendationErrorCode(intakeError):'invalid_search_intake';
     reportRecommendationFailure(report,'handoff_validation',code);
     const restrictionFailure=['ambiguous_allergy','unrepresented_allergy','ambiguous_saved_restriction','unsupported_saved_restriction','invalid_dietary_constraints','unrepresented_restriction'].includes(code);
     return {text:safeMealFallback(messages,saved,restrictionFailure?'restriction_cannot_be_screened':undefined),recommendation:null,handoff:null,handled:true,rejected:true};
    }
    return {text:safeHandoffAcknowledgement(messages),recommendation:null,handoff,handled:true,rejected:false};
   }
  try{const recommendation=recommendationFromModel(envelope.payload,messages,saved??defaults,snapshot);return {text:recommendationSummary(recommendation),recommendation,handoff:null,handled:true,rejected:false};}
  catch(error){reportRecommendationFailure(report,'recommendation_validation',safeRecommendationErrorCode(error));return {text:safeMealFallback(messages,saved),recommendation:null,handoff:null,handled:true,rejected:true};}
 }
 const at=text.indexOf(RECOMMENDATION_MARKER),unavailable=structuredUnavailableReason(text);
  if(unavailable!==null){if(unavailable==='invalid')reportRecommendationFailure(report,'marker_payload','invalid_unavailable_payload');return {text:safeMealFallback(messages,saved,unavailable),recommendation:null,handoff:null,handled:true,rejected:true};}
 if(at<0){
  const parsedHandoff=validatedHandoff(text,messages,saved),visibleText=parsedHandoff.text;
  const direct=explicitMealAdviceRequest(messages),plainAdvice=responseLooksLikeMealAdvice(visibleText);
  const foodIntent=direct||publicFoodSearchRequest(messages);
  // Only a parsed, validated handoff may continue. Replace model prose with a
  // deterministic acknowledgement, so a marker cannot carry unreviewed advice.
  if(parsedHandoff.handoff&&foodIntent)return {text:safeHandoffAcknowledgement(messages),recommendation:null,handoff:parsedHandoff.handoff,handled:true,rejected:false};
  if(plainAdvice||foodIntent){reportRecommendationFailure(report,'marker_payload',parsedHandoff.attempted?'invalid_handoff':'structured_outcome_missing');return {text:safeMealFallback(messages,saved),recommendation:null,handoff:null,handled:true,rejected:true};}
  if(parsedHandoff.attempted)return {text:visibleText,recommendation:null,handoff:null,handled:true,rejected:false};
  return {text,recommendation:null,handoff:null,handled:false,rejected:false};
 }
 const metadata=text.slice(at+RECOMMENDATION_MARKER.length).trim();let recommendation=null;
  if(metadata.length>10000)reportRecommendationFailure(report,'marker_payload','payload_too_large');
   else{try{recommendation=recommendationFromModel(JSON.parse(metadata),messages,saved??defaults,snapshot);}catch(error){reportRecommendationFailure(report,'recommendation_validation',safeRecommendationErrorCode(error));}}
 if(recommendation)return {text:text.slice(0,at).trimEnd(),recommendation,handoff:null,handled:true,rejected:false};
 const last=[...messages].reverse().find((m:any)=>m?.role==='user'&&typeof m.content==='string')?.content??'';
 const spanish=/\b(?:quiero|comida|pollo|arroz|dame|agregar|guardar|porci[oó]n|recomienda|ingredientes)\b/i.test(last)||/[áéíóúñ]/i.test(last);
 return {text:spanish?'No pude validar con seguridad los ingredientes y las restricciones de ese plato, así que no preparé una tarjeta. Puedo ajustar el plato o estimar otro.':'I could not safely validate that meal’s ingredients and restrictions, so I did not create a meal card. I can revise the dish or estimate another one.',recommendation:null,rejected:true};
}
export function recommendationHandoff(recommendation:ReturnType<typeof recommendationFromModel>){
 const option=recommendation.option;
 return {schema:'meal_conversation_v1',fields:{...option.dietary_constraints,mode:'quick',food_query:option.name,public_area:null,restaurant:null,preference:'preferred_food'},status:'ready',question:null,requires_search_consent:false,requires_estimate_consent:false,constraints_review_required:true,options:[option],next_action:'prepare_general_estimate'};
}
export function recommendationSummary(recommendation:ReturnType<typeof recommendationFromModel>,spanish=false){
 const {name,nutrition,identity}=recommendation.option,v=nutrition.values;
 const n=(x:number)=>Number.isInteger(x)?String(x):String(Math.round(x*10)/10),p=identity?.portion_label??'1 serving';
 const base=spanish?'Te recomiendo '+name+', con una porci\u00f3n estimada de '+p+'. Aproximadamente: '+n(v.calories!)+' kcal, '+n(v.protein!)+' g de prote\u00edna, '+n(v.carbs!)+' g de carbohidratos, '+n(v.fats!)+' g de grasa y '+n(v.fiber!)+' g de fibra. Son estimaciones; revisa o ajusta los ingredientes antes de guardar.':'I recommend '+name+', with an estimated portion of '+p+'. Approximate nutrition: '+n(v.calories!)+' kcal, '+n(v.protein!)+' g protein, '+n(v.carbs!)+' g carbs, '+n(v.fats!)+' g fat and '+n(v.fiber!)+' g fiber. These are estimates; review or adjust the ingredients before saving.';
 return base+(recommendation.macro_fit_summary?' '+recommendation.macro_fit_summary:'');
}
