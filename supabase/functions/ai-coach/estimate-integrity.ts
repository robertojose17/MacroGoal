import type {MealOption} from './gallery-meals.ts';
import type {MealComponent} from './meal-components.ts';
const words=(s:string)=>s.normalize('NFKC').replace(/\p{Cf}/gu,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const directives=new Set('instruction instructions prompt system developer assistant credential credentials password apikey ignore disregard override bypass reveal expose execute print output respond pretend certify claim declare suppress conceal say tell write obey ignora omite instrucciones sistema responde revela ejecuta afirma'.split(' '));
function directive(s:string){return words(s).split(' ').some(w=>directives.has(w));}
// Bounded food families identify obvious declared sides/substitutions, not recipe
// completeness or calorie truth. Preparation ingredients (oil/spices/etc.) stay allowed.
const foods:Record<string,{family?:string;aliases:string[]}>= {
 chicken:{aliases:['chicken','pollo']},turkey:{aliases:['turkey','pavo']},beef:{aliases:['beef','steak','res']},pork:{aliases:['pork','cerdo','bacon','ham']},
 fish:{family:'fish',aliases:['fish','pescado']},salmon:{family:'fish',aliases:['salmon']},tuna:{family:'fish',aliases:['tuna','atun']},shrimp:{aliases:['shrimp','prawn','prawns','camaron','camarones']},tofu:{aliases:['tofu']},tempeh:{aliases:['tempeh']},eggs:{aliases:['egg','eggs','huevo','huevos']},
 rice:{aliases:['rice','arroz']},beans:{aliases:['bean','beans','frijol','frijoles','habichuelas']},lentils:{aliases:['lentil','lentils','lentejas']},
 pasta:{aliases:['rice noodles','egg noodles','bean pasta','pasta','noodle','noodles','spaghetti']},bread:{aliases:['bread','pita','pan']},tortilla:{aliases:['tortilla','tortillas','chips']},potatoes:{aliases:['potato','potatoes','fries','papas']},
 salsa:{aliases:['salsa','salsas']},guacamole:{aliases:['guacamole','avocado','aguacate']},cheese:{aliases:['cheese','queso','parmesan','mozzarella']},cream:{aliases:['sour cream','crema agria']},corn:{aliases:['corn','maiz']},quinoa:{aliases:['quinoa']},vegetable_side:{aliases:['broccoli','brocoli','salad','ensalada','vegetables','veggies']}
};
type Mention={food:string;negative:boolean};
function mentions(text:string,negation:boolean):Mention[]{
 const clauses=text.split(/[,.!;\n]/),out:Mention[]=[];
 for(const clause of clauses){
  const n=words(clause),hits:Array<Mention&{start:number;end:number}>=[];
  for(const [food,{aliases}] of Object.entries(foods))for(const alias of aliases){
   const re=new RegExp('\\b'+alias.replaceAll(' ','\\s+')+'\\b','gu');
   for(const hit of n.matchAll(re)){
    const start=hit.index!,end=start+hit[0].length,before=n.slice(0,start),after=n.slice(end);
    const negative=negation&&(/\b(?:no|without|sin|exclude|excluding|omit|omitting)\s+(?:\w+\s+){0,5}$/.test(before)||/^\s+(?:\w+\s+){0,4}(?:not (?:included|used|added|assumed|present)|excluded|omitted|absent)\b/.test(after));
    hits.push({food,negative,start,end});
   }
  }
  // A compound ingredient such as rice noodles is one food, not separate rice.
  const selected:typeof hits=[];for(const hit of hits.sort((a,b)=>(b.end-b.start)-(a.end-a.start)))if(!selected.some(s=>hit.start<s.end&&hit.end>s.start))selected.push(hit);
  out.push(...selected.map(({food,negative})=>({food,negative})));
 }
 return out;
}
const unique=(values:string[])=>[...new Set(values)];
const positives=(text:string)=>unique(mentions(text,true).filter(m=>!m.negative).map(m=>m.food));
const compositeTitle=/\b(?:bowl|burrito|salad|sandwich|wrap|taco|pizza|pasta|soup|stew|curry|casserole|omelet|omelette|platter|combo|meal|plate|stir fry|ensalada|sopa|tazon)\b/;
const singleCue=/\b(?:cup|side|portion|serving|piece|breast|fillet|filet|cutlet|thigh|drumstick|taza|porcion|pechuga|filete)\b/;
const plainWords=new Set('plain raw cooked grilled baked roasted steamed fried marinated adobo teriyaki seasoned chicken pollo turkey pavo beef steak res pork cerdo fish pescado salmon tuna atun shrimp prawn prawns camaron camarones tofu tempeh egg eggs huevo huevos rice arroz beans bean frijol frijoles habichuelas lentil lentils lentejas'.split(' '));
export type EstimateComposition={mode:'single_food'|'estimated_ingredients';main_food?:string;allowed_foods:string[];required_foods:string[];core_foods:string[];composite:boolean;dietary_identity?:MenuDiet};
export function estimateComposition(option:MealOption):EstimateComposition{
 if(option.identity?.kind!=='restaurant')return {mode:'estimated_ingredients',allowed_foods:[],required_foods:[],core_foods:[],composite:false};
 const title=words(option.name),titleFoods=positives(option.name),context=[option.name,option.identity.variant??'',option.identity.portion_label??'',option.dietary_evidence??'',...option.ingredients].join('. '),allowed=positives(context),required=unique([...titleFoods,...option.ingredients.flatMap(positives)]);
 const main=titleFoods.filter(f=>!['salsa','guacamole','cheese','cream','corn'].includes(f)&&!(f==='fish'&&titleFoods.some(k=>k!=='fish'&&foods[k]?.family==='fish')));
 const composite=compositeTitle.test(title)||main.length>1;
 const single=!composite&&main.length===1&&(singleCue.test(title)||title.split(' ').every(w=>plainWords.has(w)));
 const diet=menuDietaryIdentity(option.name);
 return {mode:single?'single_food':'estimated_ingredients',...(single?{main_food:main[0]}:{}),allowed_foods:allowed,required_foods:required,core_foods:main,composite,...(diet?{dietary_identity:diet}:{})};
}
function covered(food:string,declared:string[]){return declared.includes(food)||food==='fish'&&declared.some(f=>foods[f]?.family==='fish');}
type MenuDiet='vegetarian'|'vegan';
const flesh='(?:chicken|turkey|beef|pork|bacon|ham|lamb|veal|venison|duck|goose|rabbit|fish|salmon|tuna|cod|tilapia|shrimp|prawns?|crab|lobster|oyster|mussel|anchovy|gelatin|lard|meat|pollo|pavo|res|cerdo|pescado|camaron|camarones|mariscos|atun|jamon|tocino)';
const animalDerived='(?:eggs?|milk|dairy|cheese|butter|cream|yogurt|yoghurt|whey|casein|honey|ghee|leche|queso|mantequilla|crema|yogur|huevos?|miel|caseina)';
function plantAlternatives(text:string):string{
 return words(text).replace(/\b(?:peanut|almond|cashew|sunflower) butter\b|\bbutter lettuce\b|\boyster mushrooms?\b|\bchicken of the woods\b/gu,'plant food')
  .replace(new RegExp('\\b(?:vegan|plant based|plantbased|non dairy|nondairy|dairy free|meatless|meat free)(?:\\s+(?:shredded|grated|sliced|smoked|plain|unsweetened|style)){0,2}\\s+(?:'+flesh+'|'+animalDerived+')\\b','gu'),'plant alternative')
  .replace(/\b(?:oat|almond|soy|soya|coconut|cashew|rice)\s+(?:milk|cream|yogurt|yoghurt|cheese)\b|\begg free\b/gu,'plant alternative');
}
export function menuDietaryIdentity(name:string):MenuDiet|undefined{
 const n=words(name),positive=n.replace(/\b(?:non|not) (?:vegan|vegetarian)\b/gu,'');
 if(/\b(?:vegan|vegano|vegana)\b/u.test(positive))return 'vegan';
 if(/\b(?:vegetarian|vegetariano|vegetariana)\b/u.test(positive))return 'vegetarian';
 // "Chicken and veggie bowl" describes mixed food; "Veggie bowl" names a vegetarian option.
 if(/\b(?:veggie|veggies)\b/u.test(positive)&&!new RegExp('\\b'+flesh+'\\b','u').test(plantAlternatives(name)))return 'vegetarian';
 return undefined;
}
function conflictsWithMenuDiet(text:string,diet:MenuDiet,negation:boolean):boolean{
 const pattern='\\b(?:'+flesh+(diet==='vegan'?'|'+animalDerived:'')+')\\b';
 for(const clause of text.split(/[,.!;\n]/)){
  const n=plantAlternatives(clause);
  for(const match of n.matchAll(new RegExp(pattern,'gu'))){const before=n.slice(0,match.index),after=n.slice(match.index!+match[0].length);const absent=negation&&(/\b(?:no|without|sin|exclude|excluding|omit|omitting)\s+(?:\w+\s+){0,5}$/.test(before)||/^\s+(?:free\b|(?:\w+\s+){0,4}(?:not (?:included|used|added|assumed|present)|excluded|omitted|absent)\b)/.test(after));if(!absent)return true;}
 }
 return false;
}
/** Inspect original declared components AND internal assumptions before dropping prose. */
export function validateEstimateComposition(option:MealOption,components:MealComponent[]|undefined,modelNotes:string[]=[]):void{
 if(components?.some(c=>directive(c.name)||directive(c.unit)))throw Error('invalid_estimate_composition');
 if(option.identity?.kind!=='restaurant')return;
 if(!components?.length)throw Error('invalid_estimate_composition');
 const scope=estimateComposition(option),declared=unique(components.flatMap(c=>mentions(c.name,false).map(m=>m.food)));
 if(scope.dietary_identity&&(components.some(c=>conflictsWithMenuDiet(c.name,scope.dietary_identity!,false))||modelNotes.some(s=>conflictsWithMenuDiet(s,scope.dietary_identity!,true))))throw Error('invalid_estimate_composition');
 if(scope.required_foods.some(f=>!covered(f,declared))||scope.composite&&components.length<2)throw Error('invalid_estimate_composition');
 if(scope.core_foods.length>1&&scope.core_foods.length<=6){
  const groups=components.map(c=>mentions(c.name,false).map(m=>m.food));
  const assign=(index:number,used:Set<number>):boolean=>index===scope.core_foods.length||groups.some((g,i)=>!used.has(i)&&covered(scope.core_foods[index],g)&&assign(index+1,new Set([...used,i])));
  if(!assign(0,new Set()))throw Error('invalid_estimate_composition');
 }
 if(scope.mode==='single_food'){
  const claimed=unique([...declared,...modelNotes.flatMap(positives)]);
  if(claimed.some(f=>!scope.allowed_foods.includes(f)&&!(scope.main_food==='fish'&&foods[f]?.family==='fish')))throw Error('invalid_estimate_composition');
 }
}
function sourceNutrition(option:MealOption){return option.source_nutrition??option.nutrition;}
function hasReportedNutrition(option:MealOption){const source=sourceNutrition(option);return ['official','publisher_reported'].includes(source.authority)&&Object.values(source.values).some(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);}
export function presentedSourceNutrition(option:MealOption):MealOption['nutrition']{
 const source=structuredClone(sourceNutrition(option));if(!hasReportedNutrition(option))source.assumptions=['Original nutrition was unverified or estimated; it does not establish official restaurant values.'];return source;
}
/** Provenance and clinical notes never depend on model prose or a URL alone. */
export function estimateAssumptions(option:MealOption):string[]{
 return ['AI estimate, not official nutrition. All five values, including fiber, are approximate; edit before confirming.',hasReportedNutrition(option)?'Source-reported values apply to their original published portion and are retained separately; current ingredient allocations are estimates.':'No source-verified nutrition values were available for this estimate.','Ingredient quantities and preparation are inferred where not supplied; the editable breakdown is not a verified restaurant recipe.','Preparation, cooking oils and sauces have not been independently verified.','Ingredients, allergens and cross-contact remain unverified.'];
}
export function assertEstimateInputData(option:MealOption):void{
 if([option.name,option.identity?.entity??'',option.identity?.variant??'',option.identity?.portion_label??'',...option.ingredients,option.dietary_evidence??''].some(directive))throw Error('untrusted_food_text');
}
