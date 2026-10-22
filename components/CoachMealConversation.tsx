import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { dailyAccess, DAILY_MEAL_SLOTS, type DailyAccess, type DailyMealSlot, type DailySnapshot } from '@/utils/coachDailyAction';
import type { DailyActionServices } from '@/utils/coachManualHandoff';
import type { MealExperienceServices, MealChoiceOutcome, MealChoices } from '@/utils/coachMealServices';
import { estimatePublicDetails } from '@/utils/coachMealServices';
import type { MealExploreInput, MealPending } from '@/utils/coachMealTransport';
import type { MealComposer, MealChatTurn } from '@/utils/coachMealComposer';
import { mealSearchDisclosure, mealFailureMessage } from '@/utils/coachMealCopy';
import { clearMealReview, holdMealReview } from '@/utils/coachMealReview';

type Stage='home'|'mode'|'restaurant'|'area'|'food'|'meal'|'preferences'|'results'|'consent'|'estimate_consent'|'day';
type Draft=MealExploreInput&{meal:DailyMealSlot;exclusionsText?:string;allergensText?:string};
const initial=():Draft=>({food_query:'',mode:'cook',exclusions:[],allergens:[],preference:'preferred_food',meal:'lunch'});
// Same-day navigation continuity only. No result/profile persistence outside the
// existing owner/day-scoped request journal; logout invalidates this memory.
let memory:{owner:string;date:string;stage:Stage;draft:Draft;result:MealChoiceOutcome|null;turns:MealChatTurn[]}|undefined;
type Props=DailyAccess&{experience:MealExperienceServices;summaryServices:DailyActionServices;mealRequest?:number;hasConversation?:boolean;onConversation?:()=>void;onJourneyActive?:(active:boolean)=>void;onComposer?:(composer:MealComposer|null)=>void};
export default function CoachMealConversation(props:Props){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),router=useRouter();const say=(en:string,sp:string)=>es?sp:en;
 const [stage,setStage]=useState<Stage>('home'),[draft,setDraft]=useState<Draft>(initial),[result,setResult]=useState<MealChoiceOutcome|null>(null);
 const [owner,setOwner]=useState<string>(),[pending,setPending]=useState<MealPending|null>(null),[working,setWorking]=useState(false);
 const [alternatives,setAlternatives]=useState(false),[details,setDetails]=useState<string|null>(null),[preferences,setPreferences]=useState(false);
 const [summary,setSummary]=useState<DailySnapshot|null>(null),[returning,setReturning]=useState(false);
 const [estimateId,setEstimateId]=useState<string|null>(null),[portionLabel,setPortionLabel]=useState('');
 const [turns,setTurns]=useState<MealChatTurn[]>([]);
 const [preferenceInput,setPreferenceInput]=useState<'avoid'|'allergy'>('avoid');
 const lastSearch=useRef<MealChoices|null>(null);
 const access=useRef(props);access.current=props;const revision=useRef(0),lock=useRef(false),identity=useRef<string|undefined>(undefined);
 const service=props.experience,gate=dailyAccess(props),busy=working||props.busy||props.premiumLoading,free=!props.isPremium&&!props.premiumLoading&&!props.premiumError;
 const invalidate=()=>{revision.current++;identity.current=undefined;lastSearch.current=null;memory=undefined;clearMealReview();setOwner(undefined);setPending(null);setResult(null);setSummary(null);setDraft(initial());setTurns([]);setStage('home');};
 useFocusEffect(useCallback(()=>{
  const id=++revision.current;let unsubscribe=()=>{};const date=service.today();
  void(async()=>{const account=await service.owner();if(revision.current!==id)return;
   if(!account){invalidate();return;}identity.current=account;setOwner(account);
   if(memory?.owner===account&&memory.date===date&&gate==='ready'){setReturning(true);setDraft(memory.draft);setStage(memory.stage);setResult(memory.result);setTurns(memory.turns??[]);}else{memory=undefined;clearMealReview();setDraft(initial());setResult(null);setSummary(null);setTurns([]);setStage('home');}
   unsubscribe=service.subscribeInvalidation(account,invalidate);
   const request=await service.pending(()=>access.current);if(revision.current===id&&service.today()===date)setPending(request);
  })().catch(()=>{if(revision.current===id)invalidate();});
  const timer=setInterval(()=>{if(service.today()!==date)invalidate();},15000);
  return()=>{revision.current++;unsubscribe();clearInterval(timer);};
 },[service,gate]));
 useEffect(()=>{if(owner)memory={owner,date:service.today(),stage,draft,result,turns};},[owner,stage,draft,result,turns,service]);
 useEffect(()=>{if(props.mealRequest){setStage('mode');setResult(null);}},[props.mealRequest]);
 useEffect(()=>{props.onJourneyActive?.(stage!=='home');return()=>props.onJourneyActive?.(false);},[stage,props.onJourneyActive]);
 const change=(value:Partial<Draft>)=>{setDraft(d=>({...d,...value}));setResult(null);};
 const cancel=()=>{revision.current++;setStage('home');setResult(null);};
 const current=async(id:number,account:string,date:string)=>{try{return revision.current===id&&await service.owner()===account&&revision.current===id&&service.today()===date&&dailyAccess(access.current)==='ready';}catch{return false;}};
 async function run(kind:'explore'|'discover'|'recover'|'estimate',override?:Draft){
  if(lock.current||gate!=='ready'||!owner)return;
  lock.current=true;setWorking(true);const id=revision.current,account=owner,date=service.today();
  try{
   let next;
   if(kind==='recover')next=await service.recover(()=>access.current);
   else if(kind==='estimate'){if(result?.kind!=='ready'||!estimateId)return;next=await service.estimate(()=>access.current,result,estimateId,portionLabel.trim()||undefined);}
   else if(kind==='discover'){if(result?.kind!=='ready'||!result.publicRequest)return;lastSearch.current=result;next=await service.discover(()=>access.current,result);}
   else{const {meal,exclusionsText,allergensText,...input}=override??draft;next=await service.explore(()=>access.current,input,meal);}
   if(!await current(id,account,date))return;
   setPending(await service.pending(()=>access.current));
   if(!await current(id,account,date))return;
   if(next.kind==='recovered_review'){const key=holdMealReview(next.session);router.push({pathname:'/recipe-finder-detail',params:{coachMealReviewKey:key}});return;}
   if(next.kind==='ready'&&next.question==='portion_label'&&kind==='estimate'){setStage('estimate_consent');return;}
   setResult(next);setAlternatives(false);setStage('results');
   if(next.kind==='ready'&&next.question){setStage(next.question==='restaurant'?'restaurant':next.question==='mode'?'mode':'food');}
  }catch{if(await current(id,account,date)){setResult({kind:'unavailable',reason:'request_unavailable'});setStage('results');}}
  finally{lock.current=false;setWorking(false);}
 }
 async function review(source:MealChoices,id:string){
  if(lock.current||gate!=='ready'||!owner)return;lock.current=true;const version=revision.current,date=service.today(),account=owner;
  try{if(source.owner!==account||source.date!==date||!await current(version,account,date))return;const session=service.review(source,id,()=>access.current);const key=holdMealReview(session);router.push({pathname:'/recipe-finder-detail',params:{coachMealReviewKey:key}});}finally{lock.current=false;}
 }
 async function day(){
  setStage('day');if(gate!=='ready'||!owner||lock.current)return;
  lock.current=true;setWorking(true);const id=revision.current,account=owner,date=service.today();
  try{const value=await props.summaryServices.load(access.current,date);if(await current(id,account,date))setSummary(value);}catch{if(await current(id,account,date))setSummary({kind:'unavailable'});}finally{lock.current=false;setWorking(false);}
 }
 const question=()=>stage==='restaurant'?say('Which restaurant do you have in mind?','¿Qué restaurante tienes en mente?'):stage==='food'?say('What would you like to eat?','¿Qué te gustaría comer?'):stage==='area'?say('Which city should I use for the menu?','¿En qué ciudad busco el menú?'):stage==='mode'?say('Cooking, something quick, or eating out?','¿Cocinar, algo rápido o comer fuera?'):stage==='meal'?say('Which meal is this for?','¿Para qué comida es?'):'';
 const remember=(answer:string)=>setTurns(items=>[...items,...(question()?[{role:'assistant' as const,text:question()}]:[]),{role:'user' as const,text:answer}]);
 useEffect(()=>{
  if(!props.onComposer)return;
  props.onComposer({placeholder:stage==='restaurant'?say('Restaurant name','Nombre del restaurante'):stage==='area'?say('City or public area','Ciudad o zona pública'):stage==='food'?say('What sounds good?','¿Qué te apetece?'):stage==='preferences'&&preferences?say('Tell me what to consider','Dime qué debo tener en cuenta'):say('Message Coach','Escribe al Coach'),disabled:busy,submit:(raw)=>{
   const text=raw.trim();if(!text||busy)return true;
   if(stage==='home'){if(!/restaurant|restaurante|comer fuera|eat out|meal|comida|recipe|receta|cook|cocinar/i.test(text))return false;remember(text);if(/restaurant|restaurante|comer fuera|eat out/i.test(text)){change({mode:'eat_out'});setStage('restaurant');}else{change({food_query:text});setStage('mode');}return true;}
   if(stage==='restaurant'){remember(text);change({restaurant:text});setStage('food');return true;}
   if(stage==='food'){remember(text);change({food_query:text});setStage('meal');return true;}
   if(stage==='area'){remember(text);const next={...draft,public_area:text};setDraft(next);void run('explore',next);return true;}
   if(stage==='preferences'&&preferences){remember(text);const values=text.split(',').map(x=>x.trim()).filter(Boolean);change(preferenceInput==='allergy'?{allergens:values,allergensText:text}:{exclusions:values,exclusionsText:text});setPreferences(false);return true;}
   if(stage==='meal'){const slot=/breakfast|desayuno/i.test(text)?'breakfast':/lunch|almuerzo/i.test(text)?'lunch':/dinner|cena/i.test(text)?'dinner':/snack|merienda/i.test(text)?'snack':null;if(slot){remember(text);change({meal:slot});setStage('preferences');return true;}}
   if(stage==='results'){remember(text);change({food_query:text});setStage('meal');return true;}
   if(stage==='estimate_consent'){remember(text);setPortionLabel(text);return true;}
   if(stage==='mode'){const mode=/restaurant|restaurante|fuera|out/i.test(text)?'eat_out':/quick|rápid/i.test(text)?'quick':/cook|cocin/i.test(text)?'cook':null;if(mode){remember(text);change({mode});setStage(mode==='eat_out'?'restaurant':draft.food_query?'meal':'food');return true;}}
   remember(text);setTurns(items=>[...items,{role:'assistant',text:say('Use the choices below to continue, or cancel to ask a different question. I will not search or log anything from this message.','Usa las opciones de abajo para continuar, o cancela para preguntar otra cosa. Este mensaje no inicia búsquedas ni registra comidas.')}]);return true;
  }});
  return()=>props.onComposer?.(null);
 },[stage,draft,preferences,preferenceInput,busy,result,owner,props.onComposer]);
 const action=(label:string,onPress:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={()=>{if(props.onComposer&&['mode','meal'].includes(stage))remember(label);onPress();}} style={[s.action,disabled&&{opacity:.45}]}><Text style={s.actionText}>{label}</Text></Pressable>;
 const input=(label:string,value:string,update:(s:string)=>void,max=160)=>props.onComposer?null:<TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor="#68746E" value={value} maxLength={max} onChangeText={update} editable={!busy} style={s.input}/>;
 const mealName=(meal:DailyMealSlot)=>(es?['Desayuno','Almuerzo','Cena','Snack']:['Breakfast','Lunch','Dinner','Snack'])[DAILY_MEAL_SLOTS.indexOf(meal)];
 const back=()=>{revision.current++;setStage(stage==='restaurant'?'mode':stage==='food'?(draft.mode==='eat_out'?'restaurant':'mode'):stage==='meal'?'food':stage==='preferences'?'meal':stage==='consent'||stage==='estimate_consent'?'results':'home');};
 const choose=()=>{setStage('mode');setResult(null);};
 const ready=result?.kind==='ready'?result:null;
 const estimateOption=ready?.options.find(o=>o.id===estimateId);
 const estimateDetails=estimateOption?estimatePublicDetails(estimateOption,portionLabel.trim()||undefined):null;
 const unavailable=(reason:string|null)=>reason==='pilot_not_enabled'?say('Web search and automatic estimates are not enabled for this account yet.','La búsqueda web y las estimaciones automáticas aún no están habilitadas para esta cuenta.'):reason==='opt_in_unavailable'?say('The existing search permission could not be verified.','No se pudo verificar el permiso existente de búsqueda.'):reason==='estimator_not_configured'?say('Automatic estimates are not available right now.','Las estimaciones automáticas no están disponibles ahora.'):say('This search or estimate is not currently available.','Esta búsqueda o estimación no está disponible ahora.');
 return <View style={s.container}>
  {pending&&action(say('Resume unfinished search or review','Retomar búsqueda o revisión pendiente'),()=>{void run('recover');},busy||gate!=='ready')}
  {stage!=='home'&&<View style={s.nav}><Pressable accessibilityRole="button" disabled={busy} onPress={back} style={s.navLink}><Text style={s.actionText}>{say('Back','Atrás')}</Text></Pressable><Pressable accessibilityRole="button" onPress={cancel} style={s.navLink}><Text style={s.actionText}>{say('Cancel','Cancelar')}</Text></Pressable></View>}
  {!!props.onComposer&&turns.map((turn,i)=><View key={i} style={turn.role==='user'?s.answer:undefined}><Text style={s.body}>{turn.text}</Text></View>)}
  {!props.onComposer&&!['home','mode','day'].includes(stage)&&<View accessibilityLabel={say('Your meal choices','Tus elecciones')} style={s.history}>{stage!=='restaurant'&&draft.mode==='eat_out'&&draft.restaurant&&<View style={s.answer}><Text style={s.body}>{draft.restaurant}</Text></View>}{!['restaurant','food'].includes(stage)&&draft.food_query&&<View style={s.answer}><Text style={s.body}>{draft.food_query}</Text></View>}{draft.public_area&&stage!=='area'&&<View style={s.answer}><Text style={s.body}>{draft.public_area}</Text></View>}</View>}
  {stage==='home'?<>
   <Text style={s.body}>{returning||props.hasConversation?say('Welcome back. What would help right now?','Qué bueno verte de nuevo. ¿Qué necesitas ahora?'):say('Hi, I’m your Coach. Let’s make choosing what to eat easier.','Hola, soy tu Coach. Hagamos más fácil elegir qué comer.')}</Text>
   {props.premiumLoading?<Text style={s.muted}>{say('Checking your access…','Verificando tu acceso…')}</Text>:props.premiumError?<Text accessibilityRole="alert" style={s.body}>{say('I couldn’t verify access. Reconnect and try again.','No pude verificar tu acceso. Reconecta e inténtalo de nuevo.')}</Text>:<View style={s.row}>{action(say('Choose food','Elegir comida'),choose,busy)}{action(say('Review my day','Revisar mi día'),()=>{void day();},busy)}{action(say('Ask a question','Hacer una pregunta'),()=>props.onConversation?.(),busy)}</View>}
  </>:stage==='day'?<>
   <Text style={s.body}>{summary?.kind==='ready'&&summary.summary.kind==='logged'?say(`Your diary shows ${Math.round(summary.summary.totals.calories)} kcal and ${Math.round(summary.summary.totals.protein)} g protein today.`, `Tu diario muestra ${Math.round(summary.summary.totals.calories)} kcal y ${Math.round(summary.summary.totals.protein)} g de proteína hoy.`):say('I don’t have a complete picture of your day. Missing entries don’t mean you haven’t eaten.','No tengo una imagen completa de tu día. Que falten registros no significa que no hayas comido.')}</Text>
   <View style={s.row}>{action(say('Choose food','Elegir comida'),choose,busy)}{action(say('Open diary','Abrir diario'),()=>router.push('/(tabs)/(home)'))}</View>
  </>:stage==='mode'?<>
   <Text style={s.body}>{say('Are you cooking, keeping it quick, or eating out?','¿Vas a cocinar, quieres algo rápido o vas a comer fuera?')}</Text>
   <View style={s.row}>{([['cook','Cook','Cocinar'],['quick','Quick','Rápido'],['eat_out','Eat out','Comer fuera']]as const).map(([mode,en,sp])=><React.Fragment key={mode}>{action(say(en,sp),()=>{change({mode});setStage(mode==='eat_out'?'restaurant':draft.food_query?'meal':'food');},busy)}</React.Fragment>)}{action(say('My saved meals','Mis comidas guardadas'),()=>free?router.push('/subscription'):router.push('/my-meals'),busy)}</View>
  </>:stage==='area'?<>   <Text style={s.body}>{say('Which city should I use for this restaurant menu?', '¿En qué ciudad busco el menú de ese restaurante?')}</Text>   {input(say('City or public area','Ciudad o zona pública'),draft.public_area??'',value=>setDraft(d=>({...d,public_area:value})))}   {action(say('Use this city','Usar esta ciudad'),()=>{void run('explore');},busy||!draft.public_area?.trim())}  </>:stage==='restaurant'?<>
   <Text style={s.body}>{say('Which restaurant do you have in mind?','¿Qué restaurante tienes en mente?')}</Text>
   {input(say('Restaurant name','Nombre del restaurante'),draft.restaurant??'',restaurant=>change({restaurant}))}
   {!props.onComposer&&action(say('Continue','Continuar'),()=>setStage('food'),busy||!draft.restaurant?.trim())}
  </>:stage==='food'?<>
   <Text style={s.body}>{draft.mode==='eat_out'?say('What would you like to order?','¿Qué te gustaría pedir?'):say('What would you like to eat? I’ll start with our recipe gallery.','¿Qué te gustaría comer? Empezaré por nuestra galería de recetas.')}</Text>
   {input(say('Food or dish','Comida o plato'),draft.food_query,food_query=>change({food_query}))}
   <View style={s.row}>{!props.onComposer&&action(say('Continue','Continuar'),()=>setStage('meal'),busy||!draft.food_query.trim())}{draft.mode==='eat_out'&&action(say('Help me choose from the menu','Ayúdame a elegir del menú'),()=>{change({food_query:es?'opciones del menú':'menu options'});setStage('meal');},busy)}</View>
  </>:stage==='meal'?<>
   {!props.onComposer&&<View style={s.answer}><Text style={s.body}>{draft.food_query}{draft.restaurant?` · ${draft.restaurant}`:''}</Text></View>}
   <Text style={s.body}>{say('Which meal is this for?','¿Para qué comida es?')}</Text>
   <View style={s.row}>{DAILY_MEAL_SLOTS.map(meal=><React.Fragment key={meal}>{action(mealName(meal),()=>{change({meal});setStage('preferences');},busy)}</React.Fragment>)}</View>
  </>:stage==='preferences'?<>
   <Text style={s.body}>{say('Anything you want me to consider?','¿Algo que quieras que tenga en cuenta?')}</Text>
   {preferences?<>
    {!!props.onComposer&&<View style={s.row}>{action(say('Ingredients to avoid','Ingredientes que evitas'),()=>setPreferenceInput('avoid'))}{action(say('Allergies','Alergias'),()=>setPreferenceInput('allergy'))}<Text style={s.muted}>{preferenceInput==='allergy'?say('Tell me your allergies in the message below.','Dime tus alergias en el mensaje de abajo.'):say('Tell me which ingredients to avoid in the message below.','Dime qué ingredientes evitar en el mensaje de abajo.')}</Text></View>}
    {input(say('Ingredients to avoid, separated by commas','Ingredientes que evitas, separados por comas'),draft.exclusionsText??draft.exclusions.join(', '),s=>change({exclusionsText:s,exclusions:s.split(',').map(v=>v.trim()).filter(Boolean)}),300)}
    {input(say('Allergies, separated by commas','Alergias, separadas por comas'),draft.allergensText??draft.allergens.join(', '),s=>change({allergensText:s,allergens:s.split(',').map(v=>v.trim()).filter(Boolean)}),300)}
    <Text style={s.muted}>{say('Ingredients and cross-contact still need review with the source.','Los ingredientes y el contacto cruzado aún deben revisarse con la fuente.')}</Text>
   </>:action(say('Add preferences or allergies','Añadir preferencias o alergias'),()=>setPreferences(true),busy)}
   {free?<View style={s.card}><Text style={s.body}>{say('Preview: compare a meal, change its portion, then confirm before logging. Premium can search your gallery and help you review sources and estimates.','Ejemplo: compara una comida, cambia la porción y confirma antes de registrarla. Premium puede buscar en tu galería y ayudarte a revisar fuentes y estimaciones.')}</Text>{action(say('See Premium','Ver Premium'),()=>router.push('/subscription'))}</View>:action(say('Find options','Buscar opciones'),()=>{void run('explore');},busy||gate!=='ready'||!!pending)}
  </>:stage==='estimate_consent'&&estimateOption?<>
   <Text style={s.body}>{say('Estimate nutrition for this dish and a practical portion?','¿Estimar la nutrición de este plato y una porción práctica?')}</Text>
   {estimateOption.kind==='restaurant'&&!estimateOption.identity?.variant&&!estimateOption.identity?.portion_label&&input(say('Which size or portion? e.g. one regular bowl','¿Qué tamaño o porción? Ej. un bowl regular'),portionLabel,setPortionLabel)}
   <View style={s.card}><Text style={s.name}>{estimateDetails?.name}</Text>{estimateDetails?.ingredients.map((item,i)=><Text key={i} style={s.body}>{item}</Text>)}{estimateDetails?.identity&&<Text style={s.muted}>{[estimateDetails.identity.entity,estimateDetails.identity.variant,estimateDetails.identity.portion_label].filter(Boolean).join(' / ')}</Text>}{estimateDetails?.physical_portion&&<Text style={s.muted}>{estimateDetails.physical_portion.grams} g ({estimateDetails.physical_portion.authority})</Text>}<Text style={s.muted}>{estimateDetails?.source.url ?? say('Gallery source','Fuente de la galeria')} / {estimateDetails?.source.nutrition.basis.label} / {estimateDetails?.source.nutrition.authority}</Text>{Object.entries(estimateDetails?.source.nutrition.values??{}).map(([key,value])=><Text key={key} style={s.muted}>{key}: {value??say('Unknown','Desconocido')}</Text>)}</View>
   <Text style={s.muted}>{say('These displayed dish, ingredient, restaurant, portion and source nutrition details go to OpenRouter / Gemini. The estimator does not add your diary, goals, allergies or location. Results are estimates with assumptions, not official nutrition or an allergy guarantee. Existing AI usage limits apply.','Estos datos mostrados del plato, ingredientes, restaurante, porción y nutrición de la fuente se envían a OpenRouter / Gemini. El estimador no añade tu diario, objetivos, alergias ni ubicación. El resultado es una estimación con supuestos, no nutrición oficial ni garantía ante alergias. Se aplican los límites de uso de IA existentes.')}</Text>
   {action(say('Estimate this dish','Estimar este plato'),()=>{void run('estimate');},busy||gate!=='ready'||!ready?.capabilities.estimate||(estimateOption.kind==='restaurant'&&!estimateOption.identity?.variant&&!estimateOption.identity?.portion_label&&!portionLabel.trim()))}
  </>:stage==='consent'&&ready?.publicRequest?<>
   <Text style={s.body}>{say('Search public sources for this request?','¿Buscar fuentes públicas para esta solicitud?')}</Text>
   <View style={s.card}>{mealSearchDisclosure(ready.publicRequest,es).map((line,i)=><Text key={i} style={s.body}>{line}</Text>)}</View>
   <Text style={s.muted}>{say('Search with OpenRouter / Gemini using these public food, restaurant and area details? Coach planning may also use your nutrition context. Existing usage limits apply; nothing is logged without your confirmation.','¿Buscar con OpenRouter / Gemini usando estos datos públicos de comida, restaurante y zona? El Coach también puede usar tu contexto nutricional para planificar. Se aplican los límites existentes; no se registra nada sin tu confirmación.')}</Text>
   {action(say('Search these public details','Buscar estos datos públicos'),()=>{void run('discover');},busy||gate!=='ready'||!ready.capabilities.discovery)}
  </>:stage==='results'?<>
   {working?<Text style={s.body}>{say('Looking for options…','Buscando opciones…')}</Text>:ready?.options.length?<>
    <Text style={s.body}>{say('Here’s a place to start. You can adjust the portion or choose an alternative.','Aquí tienes una opción para empezar. Puedes ajustar la porción o elegir una alternativa.')}</Text>
    {(alternatives?ready.options:ready.options.slice(0,1)).map(option=><View style={s.card} key={option.id}>
     <Text style={s.name}>{option.name}</Text><Text style={s.muted}>{option.nutrition.basis.label}</Text>
     <Text style={s.body}>{option.nutrition.values.calories===null?say('Calories not yet known','Calorías aún desconocidas'):`${Math.round(option.nutrition.values.calories)} kcal`} · {['official','publisher_reported'].includes(option.nutrition.authority)?say('Source-reported','Según la fuente'):say('Estimate / review needed','Estimación / requiere revisión')}</Text>
     <Text style={s.muted}>{['protein','carbs','fats'].map((k,i)=>`${(es?['P','C','G']:['P','C','F'])[i]} ${option.nutrition.values[k as 'protein'|'carbs'|'fats']===null?'—':Math.round(option.nutrition.values[k as 'protein'|'carbs'|'fats']!)} g`).join(' · ')}</Text>
     {action(say('Source & assumptions','Fuente y supuestos'),()=>setDetails(details===option.id?null:option.id))}
     {details===option.id&&<><Text style={s.muted}>{option.provenance.label}</Text>{option.nutrition.assumptions.map((x,i)=><Text key={i} style={s.muted}>{x}</Text>)}</>}
     {Object.values(option.nutrition.values).some(v=>v===null)&&<>{ready.capabilities.estimate?action(say('Estimate a practical portion','Estimar una porción práctica'),()=>{setEstimateId(option.id);setPortionLabel('');setStage('estimate_consent');},busy):<Text style={s.muted}>{unavailable(ready.capabilities.reason)}</Text>}</>}
     {action(say('Add to meal','Añadir a comida'),()=>{void review(ready,option.id);},busy||gate!=='ready')}
    </View>)}
    <View style={s.row}>{ready.options.length>1&&action(alternatives?say('First option','Primera opción'):say('Alternatives','Alternativas'),()=>setAlternatives(v=>!v))}{action(say('Something else','Otra cosa'),()=>setStage('food'))}</View>
   </>:ready?.publicRequest?<>
    <Text style={s.body}>{draft.mode==='eat_out'?say('I can look for the restaurant’s public menu next.','Puedo buscar el menú público del restaurante.'):say('I didn’t find a match in the available gallery. Would you like to look beyond it?','No encontré una opción en la galería disponible. ¿Quieres buscar fuera de ella?')}</Text>
    {!ready.capabilities.discovery&&<Text style={s.muted}>{unavailable(ready.capabilities.reason)}</Text>}
    <View style={s.row}>{ready.capabilities.discovery&&action(say('Review public search','Revisar búsqueda pública'),()=>setStage(ready.mode==='eat_out'&&!ready.publicRequest?.area?'area':'consent'))}{action(say('Change food','Cambiar comida'),()=>setStage('food'))}</View>
   </>:<>
    <Text accessibilityRole="alert" style={s.body}>{result?.kind==='blocked'?mealFailureMessage(result.reason,es):say('The search did not finish with usable options. Your choices are kept.','La búsqueda no terminó con opciones utilizables. Tus opciones se conservan.')}</Text>
    <View style={s.row}>{!pending&&lastSearch.current&&action(say('Review search again','Revisar búsqueda de nuevo'),()=>{setResult(lastSearch.current);setStage('consent');},busy||gate!=='ready')}{action(say('Back to conversation','Volver a conversar'),()=>{cancel();props.onConversation?.();})}{pending&&action(say('Recover request','Recuperar solicitud'),()=>{void run('recover');},busy||gate!=='ready')}{action(say('Change food','Cambiar comida'),()=>setStage('food'))}</View>
   </>}
  </>:null}
  {working&&<ActivityIndicator accessibilityLabel={say('Working','Procesando')} />}
 </View>;
}
const s=StyleSheet.create({container:{gap:12,marginBottom:16},body:{fontSize:16,lineHeight:23,color:'#263F34'},muted:{fontSize:13,lineHeight:20,color:'#586A5E'},row:{flexDirection:'row',flexWrap:'wrap',gap:8},nav:{flexDirection:'row',justifyContent:'space-between'},navLink:{minHeight:44,minWidth:44,justifyContent:'center',paddingHorizontal:4},history:{gap:6},action:{minHeight:44,paddingVertical:8,paddingHorizontal:12,borderWidth:1,borderColor:'#DAE2DC',borderRadius:16,alignSelf:'flex-start',justifyContent:'center',backgroundColor:'#FFF'},actionText:{fontSize:14,lineHeight:20,fontWeight:'500',color:'#27614D'},input:{minHeight:48,fontSize:16,borderWidth:1,borderColor:'#CCD9D0',borderRadius:12,padding:12,color:'#263F34'},card:{padding:14,borderWidth:1,borderColor:'#DCE5D8',borderRadius:14,gap:10,backgroundColor:'#FFF'},name:{fontSize:18,lineHeight:24,fontWeight:'600',color:'#173A2B'},answer:{alignSelf:'flex-end',backgroundColor:'#EDF3EF',padding:10,borderRadius:14}});
