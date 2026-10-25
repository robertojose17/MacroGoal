import {coachMealQuickReplies} from '@/utils/coachMealQuickReplies';
import {mealEvidenceFromOption,coachRecipeTimeLabel} from '@/utils/coachMealReviewAdapter';
import {emptyConstraints,parseConstraints,mergeConstraints,type DietaryConstraints} from '@/utils/coachDietaryConstraints';
import type { MealComposer } from '@/utils/coachMealComposer';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useTranslation} from 'react-i18next';
import {dailyAccess,type DailyAccess,type DailyMealSlot} from '@/utils/coachDailyAction';
import {diaryMealTypeForLocalTime} from '@/utils/diaryMealType';
import {mealConversationInput,type ScopedMealConversation} from '@/utils/coachMealConversation';
import type {MealExperienceServices,MealChoices,MealChoiceOutcome} from '@/utils/coachMealServices';
import {estimatePublicDetails,estimateNeedsPortion} from '@/utils/coachMealServices';
import {holdMealReview} from '@/utils/coachMealReview';
import {mealSearchDisclosure,mealFailureMessage} from '@/utils/coachMealCopy';
import type {MealExploreInput} from '@/utils/coachMealTransport';
type Props=DailyAccess&{initialResult?:MealChoices;flowId?:string;active?:boolean;onResume?:()=>void;service:MealExperienceServices;handoff?:ScopedMealConversation;hasConversation?:boolean;showRecovery?:boolean;onPrompt?:(text:string)=>void;onConversation?:()=>void;onComposer?:(composer:MealComposer|null)=>void};
// Actions attach to the existing model transcript. Clarifications are ordinary
// model turns; this component never classifies or answers unrestricted text.
export default function CoachConversationActions(props:Props){
 const {i18n}=useTranslation(),es=i18n.language.startsWith('es'),router=useRouter(),say=(en:string,sp:string)=>es?sp:en;
 const [result,setResult]=useState<MealChoiceOutcome|null>(null),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[consent,setConsent]=useState(false),[estimateId,setEstimateId]=useState<string|null>(null);
 const [savedOptions,setSavedOptions]=useState(false);
 const [portion,setPortion]=useState(''),[needsPortion,setNeedsPortion]=useState(false);
 const [searchDraft,setSearchDraft]=useState<MealExploreInput|null>(null),[searchEdit,setSearchEdit]=useState<'food_query'|'public_area'|'restaurant'|null>(null),[showPreferences,setShowPreferences]=useState(false);
 const [preparingGeneral,setPreparingGeneral]=useState(false),[portionError,setPortionError]=useState<string|null>(null);
 useEffect(()=>{let disposed=false;const active=props.active!==false;
  const composer:MealComposer|null=searchEdit&&searchDraft&&active?{placeholder:searchEdit==='food_query'?say('What would you like to eat?','¿Qué te gustaría comer?'):searchEdit==='public_area'?say('Which city or area?','¿Qué ciudad o zona?'):say('Which restaurant?','¿Qué restaurante?'),disabled:busy,submit:text=>{if(disposed)return true;if(!text.trim()||text.trim().length>160)return true;setSearchDraft({...searchDraft,[searchEdit]:text.trim()});setSearchEdit(null);return true;}}:needsPortion&&active?{placeholder:es?'Tamaño o porción, por ejemplo un bowl regular':'Size or portion, e.g. one regular bowl',disabled:busy,submit:text=>{if(disposed)return true;if(!text.trim()||text.length>160||/[\r\n\x00-\x1f]|https?:|@/i.test(text)){setPortionError(say('Describe only the food and portion, up to 160 characters. Leave out links and personal details.','Describe solo la comida y porción, hasta 160 caracteres. No incluyas enlaces ni datos personales.'));return true;}setPortionError(null);setPortion(text.trim());setNeedsPortion(false);return true;}}:null;
  props.onComposer?.(composer);return()=>{disposed=true;props.onComposer?.(null);};},[needsPortion,busy,props.onComposer,es,props.active,searchEdit,searchDraft]);
 const [constraints,setConstraints]=useState<DietaryConstraints|null>(()=>typeof props.service.confirmedConstraints==='function'?null:props.handoff?parseConstraints(props.handoff.value.fields):emptyConstraints());
 const [constraintsLoaded,setConstraintsLoaded]=useState(typeof props.service.confirmedConstraints!=='function');
 const version=useRef(0),lock=useRef(false),actionEpoch=useRef(0),access=useRef(props);access.current=props;const service=props.service,gate=dailyAccess(props),ready=result?.kind==='ready'?result:null;
 const resetActivity=()=>{actionEpoch.current++;lock.current=false;setBusy(false);setPreparingGeneral(false);setPortionError(null);setSearchDraft(null);setSearchEdit(null);setShowPreferences(false);};
 useEffect(()=>{const v=++version.current;resetActivity();setResult(props.initialResult??null);setSavedOptions(false);setConstraints(null);setConstraintsLoaded(false);setNeedsPortion(false);setConsent(false);setEstimateId(null);setPortion('');setNeedsPortion(false);let disposed=false,stop=()=>{};const day=service.today();void(async()=>{const owner=await service.owner();if(v!==version.current)return;if(props.handoff&&(props.handoff.owner!==owner||props.handoff.date!==day))return;const prior=await service.confirmedConstraints?.()??emptyConstraints();if(v!==version.current)return;const incoming=props.handoff?parseConstraints(props.handoff.value.fields):emptyConstraints();setConstraints(incoming?mergeConstraints(prior,incoming):null);setConstraintsLoaded(true);if(owner)stop=service.subscribeInvalidation(owner,()=>{if(disposed)return;version.current++;resetActivity();setResult({kind:'blocked',reason:'scope_changed'});setPending(false);setSavedOptions(false);setConstraints(null);setConstraintsLoaded(false);setNeedsPortion(false);});const p=await service.pending(()=>access.current);if(v===version.current)setPending(!!p&&(props.flowId===undefined||p.flowId===props.flowId));const saved=await service.saved?.(()=>access.current,props.flowId);if(v===version.current&&day===service.today())setSavedOptions(!!saved);})().catch(()=>{if(v===version.current)setResult({kind:'unavailable',reason:'constraints_unavailable'});});let watchedDay=day;const timer=setInterval(()=>{const currentDay=service.today();if(!disposed&&watchedDay!==currentDay){watchedDay=currentDay;version.current++;resetActivity();setResult({kind:'blocked',reason:'scope_changed'});setPending(false);setConstraints(null);setConstraintsLoaded(false);setNeedsPortion(false);}},15000);return()=>{disposed=true;version.current++;actionEpoch.current++;lock.current=false;stop();clearInterval(timer);};},[service,props.handoff,props.flowId,props.initialResult]);
 const action=(label:string,fn:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled:disabled||busy}} disabled={disabled||busy} onPress={fn} style={s.action}><Text style={s.actionText}>{label}</Text></Pressable>;
 async function run(kind:'explore'|'discover'|'estimate'|'recover'|'restore'|'retrySearch'|'reviseSearch'|'prepareGeneral'|'prepareSelected'){
  if(lock.current||gate!=='ready'||props.active===false)return;lock.current=true;const epoch=++actionEpoch.current;setBusy(true);const v=version.current,day=service.today();
  // Retire the displayed consent as soon as it is explicitly consumed. Keep the
  // captured offer for this call, never leave its buttons active after a failure.
  if(kind==='retrySearch')setResult({kind:'pending',reason:'request_unresolved'});
  try{const owner=await service.owner();if(v!==version.current)return;if(!owner){setResult({kind:'blocked',reason:'unauthorized'});return;}let next;
   if(kind==='explore'){const h=props.handoff;if(!h||h.owner!==owner||h.date!==day)return;if(!constraintsLoaded||!constraints)return;await service.confirmConstraints?.(constraints,owner,day);const input=mealConversationInput(h.value,constraints);if(!input)return;next=await service.explore(()=>access.current,input,diaryMealTypeForLocalTime(),props.flowId);}
   else if(kind==='prepareSelected'){if(!props.handoff)return;next=await service.prepareSelected(()=>access.current,props.handoff,props.flowId);}
   else if(kind==='reviseSearch'){if(!ready?.noResults||!searchDraft||ready.owner!==owner||ready.date!==day)return;next=await service.explore(()=>access.current,searchDraft,diaryMealTypeForLocalTime(),ready.flowId??props.flowId);}
   else if(kind==='prepareGeneral'){if(!ready?.noResults||!preparingGeneral||needsPortion||!portion.trim())return;next=await service.prepareGeneral(()=>access.current,ready,portion);}
   else if(kind==='restore')next=await service.restore(()=>access.current,props.flowId);
   else if(kind==='recover')next=await service.recover(()=>access.current,props.flowId);
   else if(kind==='retrySearch'){if(result?.kind!=='retry_available')return;next=await service.retrySearch(()=>access.current,result);}
   else if(kind==='discover'){if(!ready)return;next=await service.discover(()=>access.current,ready);}
   else{if(!ready||!estimateId)return;next=await service.estimate(()=>access.current,ready,estimateId,portion||undefined);}
   if(v!==version.current)return;
   const currentOwner=await service.owner();if(v!==version.current)return;
   if(day!==service.today()||owner!==currentOwner){setResult({kind:'blocked',reason:'scope_changed'});return;}
   if(kind==='prepareGeneral'&&next.kind!=='ready'&&next.kind!=='recovered_review'&&['portion_clarification_required','explicit_general_meal_confirmation_required','general_meal_conflicts_with_constraints','general_food_clarification_required'].includes(next.reason)){
    const unresolved=await service.pending(()=>access.current);
    if(v!==version.current||epoch!==actionEpoch.current)return;
    if(!unresolved){setPortionError(mealFailureMessage(next.reason,es));setNeedsPortion(true);setPending(false);return;}
   }
   if(next.kind==='recovered_review'){router.push({pathname:'/recipe-finder-detail',params:{coachMealReviewKey:holdMealReview(next.session)}});return;}
   if(kind==='estimate'&&next.kind==='ready'&&next.question==='portion_label'){setNeedsPortion(true);return;}
   if(kind==='estimate'&&next.kind!=='ready'&&next.kind!=='retry_available'){const unresolved=await service.pending(()=>access.current);if(v!==version.current||epoch!==actionEpoch.current)return;if(!unresolved){setPortionError(mealFailureMessage(next.reason,es));setPending(false);if(next.reason==='portion_clarification_required')setNeedsPortion(true);return;}}
   setResult(next);setSearchDraft(next.kind==='ready'&&next.noResults?next.noResults.input:null);setSearchEdit(null);setShowPreferences(false);setPreparingGeneral(false);if(kind==='restore'&&next.kind==='ready')setSavedOptions(false);setConsent(false);setEstimateId((kind==='prepareGeneral'||kind==='prepareSelected')&&next.kind==='ready'&&next.options[0]?.kind==='general'&&next.capabilities.estimate?next.options[0].id:null);
   const nextPending=await service.pending(()=>access.current);
   if(v===version.current&&epoch===actionEpoch.current)setPending(!!nextPending&&(props.flowId===undefined||nextPending.flowId===props.flowId));
  }catch{if(v===version.current)setResult({kind:'unavailable',reason:'request_unresolved'});}finally{if(epoch===actionEpoch.current){lock.current=false;if(v===version.current)setBusy(false);}}
 }
 async function review(source:MealChoices,id:string,meal:DailyMealSlot){if(lock.current||gate!=='ready')return;lock.current=true;const epoch=++actionEpoch.current,v=version.current;try{if(await service.owner()!==source.owner||service.today()!==source.date||v!==version.current)return;const session=service.review({...source,meal},id,()=>access.current);router.push({pathname:'/recipe-finder-detail',params:{coachMealReviewKey:holdMealReview(session)}});}finally{if(epoch===actionEpoch.current)lock.current=false;}}
 async function openRecommendation(id:string,meal:DailyMealSlot){
  if(lock.current||gate!=='ready'||!props.handoff)return;
  lock.current=true;const epoch=++actionEpoch.current,v=version.current,day=service.today();setBusy(true);
  try{
   const owner=await service.owner();if(v!==version.current||epoch!==actionEpoch.current)return;
   if(owner!==props.handoff.owner||day!==props.handoff.date){setResult({kind:'blocked',reason:'scope_changed'});return;}
   const next=await service.prepareSelected(()=>access.current,props.handoff,props.flowId,id);
   if(v!==version.current||epoch!==actionEpoch.current)return;
   const currentOwner=await service.owner();if(v!==version.current||epoch!==actionEpoch.current)return;
   if(currentOwner!==owner||service.today()!==day){setResult({kind:'blocked',reason:'scope_changed'});return;}
   setResult(next);
   if(next.kind==='ready'){
    const selected=next.options.find(o=>o.id===id)??(next.options.length===1?next.options[0]:null);
    if(!selected){setResult({kind:'unavailable',reason:'selected_meal_unavailable'});return;}
    const session=service.review({...next,meal},selected.id,()=>access.current);
    router.push({pathname:'/recipe-finder-detail',params:{coachMealReviewKey:holdMealReview(session)}});
   }
   const unresolved=await service.pending(()=>access.current);
   if(v===version.current&&epoch===actionEpoch.current)setPending(!!unresolved&&(props.flowId===undefined||unresolved.flowId===props.flowId));
  }catch{if(v===version.current&&epoch===actionEpoch.current)setResult({kind:'unavailable',reason:'request_unresolved'});}
  finally{if(epoch===actionEpoch.current){lock.current=false;if(v===version.current)setBusy(false);}}
 }
 const h=props.handoff,estimate=ready?.options.find(o=>o.id===estimateId),details=estimate?estimatePublicDetails(estimate,portion||undefined):null;
 const recommendations=!ready&&h?.value.options.length?h.value.options.map(row=>mealEvidenceFromOption(row,h.value.fields.mode??'quick')).filter((o):o is NonNullable<typeof o>=>o!==null):[];
 const recommendationCards=recommendations.map(o=><View key={o.id} style={s.card}>
  <Text style={s.title}>{o.name}</Text><Text style={s.body}>{o.nutrition.basis.label}</Text>
  <Text style={s.body}>{o.nutrition.values.calories??'—'} kcal · P {o.nutrition.values.protein??'—'} g · C {o.nutrition.values.carbs??'—'} g · F {o.nutrition.values.fats??'—'} g</Text>
  <Text style={s.muted}>{['estimated','user_edited'].includes(o.nutrition.authority)?say('Estimated nutrition','Nutrición estimada'):o.nutrition.authority==='unknown'?say('Nutrition needs an estimate','Falta estimar los nutrientes'):say('Source-reported nutrition','Nutrición publicada por la fuente')}</Text>
  {action(say('View Details','Ver detalles'),()=>{void openRecommendation(o.id,diaryMealTypeForLocalTime());},gate!=='ready'||pending)}
  {action(say('Add to diary','Añadir al diario'),()=>{void openRecommendation(o.id,diaryMealTypeForLocalTime());},gate!=='ready'||pending||Object.values(o.nutrition.values).some(x=>x===null))}
 </View>);
 if(props.active===false&&recommendationCards.length)return <View style={s.container}>{recommendationCards}{busy&&<ActivityIndicator/>}</View>;
 if(props.active===false)return ready?.options.length?<View style={s.container}>{ready.options.map(o=><View key={o.id} style={s.card}>
  <Text style={s.title}>{o.name}</Text><Text style={s.body}>{o.nutrition.basis.label}</Text>
  <Text style={s.body}>{o.nutrition.values.calories??'-'} kcal · {o.nutrition.values.protein??'-'} g {say('protein','proteína')}</Text>
  {action(say('View Details','Ver detalles'),()=>{void review(ready,o.id,diaryMealTypeForLocalTime());},gate!=='ready')}
   {action(say('Add to diary','Añadir al diario'),()=>{void review(ready,o.id,diaryMealTypeForLocalTime());},gate!=='ready'||Object.values(o.nutrition.values).some(x=>x===null))}
 </View>)}</View>:null;
 return <View style={s.container}>
  {recommendationCards}
  {h?.value.status==='clarify'&&props.onPrompt&&<View style={s.row}>{coachMealQuickReplies(h.value,es).map(reply=><React.Fragment key={reply}>{action(reply,()=>props.onPrompt?.(reply),gate!=='ready'||pending||busy)}</React.Fragment>)}</View>}
  {!props.hasConversation&&!h&&!result&&<><Text style={s.body}>{say('Hi, I’m your Coach. Tell me what you feel like eating, or what you’d like help with today.','Hola, soy tu Coach. Cuéntame qué te apetece comer o en qué quieres ayuda hoy.')}</Text>{props.isPremium&&!props.premiumLoading&&!props.premiumError&&<View style={s.row}>{action(say('Choose something to eat','Elegir qué comer'),()=>props.onPrompt?.(say('Help me choose something to eat.','Ayúdame a elegir qué comer.')))}{action(say('Review my day','Revisar mi día'),()=>props.onPrompt?.(say('Help me review my day.','Ayúdame a revisar mi día.')))}</View>}</>}
  {props.premiumLoading&&<Text style={s.muted}>{say('Checking access…','Verificando acceso…')}</Text>}
  {props.premiumError&&<Text style={s.muted}>{say('I couldn’t verify access. Try again when connected.','No pude verificar el acceso. Inténtalo cuando tengas conexión.')}</Text>}
  {!props.isPremium&&!props.premiumLoading&&!props.premiumError&&<><Text style={s.body}>{say('With Premium, we can talk through your choices, compare sourced meals and review portions before you log.','Con Premium podemos conversar sobre tus opciones, comparar comidas con fuentes y revisar porciones antes de registrarlas.')}</Text>{action(say('See Premium','Ver Premium'),()=>router.push('/subscription'))}</>}
  {pending&&result?.kind!=='retry_available'&&props.showRecovery!==false&&action(say('Retry search','Reintentar b\u00fasqueda'),()=>{void run('recover');},gate!=='ready')}
  {result?.kind==='retry_available'&&<View style={s.details}>
   <Text style={s.body}>{say('This search stopped. Review the same details before starting a new search.','Esta b\u00fasqueda se detuvo. Revisa los mismos datos antes de iniciar otra.')}</Text>
   {mealSearchDisclosure(result.publicRequest,es).map((line,i)=><Text key={i} style={s.body}>{line}</Text>)}
   <Text style={s.muted}>{say('A new search uses OpenRouter / Gemini and the existing search service. Coach planning may use your nutrition context. Usage limits still apply; the earlier attempt may still count. Nothing is logged.','La nueva b\u00fasqueda usa OpenRouter / Gemini y el servicio de b\u00fasqueda existente. La planificaci\u00f3n puede usar tu contexto nutricional. Siguen vigentes los l\u00edmites; el intento anterior puede seguir contando. No se registra comida.')}</Text>
   {action(say('Confirm new search','Confirmar nueva b\u00fasqueda'),()=>{void run('retrySearch');},gate!=='ready')}
   {action(say('Not now','Ahora no'),()=>setResult(null))}
  </View>}

  {!result&&!h?.value.selected_meal&&!h?.value.options.length&&h?.value.status==='ready'&&action(say('Find meal options','Buscar opciones de comida'),()=>{void run('explore');},gate!=='ready'||pending||!constraintsLoaded||!constraints)}
  {!ready&&h?.value.selected_meal&&<View style={s.card}><Text style={s.title}>{h.value.selected_meal.name}</Text><Text style={s.body}>{h.value.selected_meal.portion_label}</Text>{action(say('Review this meal','Revisar esta comida'),()=>{void run('prepareSelected');},gate!=='ready'||pending||!h.requestId)}</View>}
  {ready?.question&&<Text style={s.body}>{ready.question==='public_area'?say('Which public city or area should I use? Reply in our conversation.','¿Qué ciudad o zona pública uso? Respóndeme en la conversación.'):say('Tell me a little more about what you want in our conversation.','Cuéntame un poco más de lo que quieres en la conversación.')}</Text>}
  {ready?.noResults&&<View style={s.details}>
   {portionError&&<Text accessibilityRole="alert" style={s.body}>{portionError}</Text>}
   {preparingGeneral?<><Text style={s.body}>{say('This estimates the meal you described, not a verified restaurant item. Tell me the portion and ingredients you plan to eat.','Esto estima la comida que describiste, no un plato verificado de un restaurante. Dime la porción y los ingredientes que piensas comer.')}</Text>{!needsPortion&&<><Text style={s.body}>{portion}</Text>{action(say('Confirm this portion','Confirmar esta porción'),()=>{void run('prepareGeneral');},gate!=='ready'||!portion.trim())}</>}{action(say('Cancel','Cancelar'),()=>{setPreparingGeneral(false);setPortionError(null);setNeedsPortion(false);setPortion('');})}</>:action(say('Estimate this meal instead','Estimar esta comida'),()=>{setPreparingGeneral(true);setPortionError(null);setSearchEdit(null);setShowPreferences(false);setPortion('');setNeedsPortion(true);},gate!=='ready')}
   <Text accessibilityRole="alert" style={s.body}>{say('I couldn’t find usable meal details from this search. I kept what you asked for; you can adjust it below.','No encontré datos de comidas que pueda usar en esta búsqueda. Conservé lo que pediste; puedes ajustarlo aquí.')}</Text>
   {mealSearchDisclosure({food:(searchDraft??ready.noResults.input).food_query,area:(searchDraft??ready.noResults.input).public_area,restaurant:(searchDraft??ready.noResults.input).restaurant,preference:(searchDraft??ready.noResults.input).preference},es).map((line,i)=><Text key={i} style={s.body}>{line}</Text>)}
   {!preparingGeneral&&<><View style={s.row}>{action(say('Change food','Cambiar comida'),()=>{setSearchDraft(searchDraft??ready.noResults!.input);setSearchEdit('food_query');})}{ready.mode==='eat_out'&&<>{action(say('Change area','Cambiar zona'),()=>{setSearchDraft(searchDraft??ready.noResults!.input);setSearchEdit('public_area');})}{action(say('Choose a restaurant','Elegir restaurante'),()=>{setSearchDraft(searchDraft??ready.noResults!.input);setSearchEdit('restaurant');})}</>}{action(say('Change preference','Cambiar preferencia'),()=>setShowPreferences(v=>!v))}</View>
   {showPreferences&&<View style={s.row}>{(['balanced','high_protein','lower_calorie','preferred_food'] as const).map((preference,i)=><React.Fragment key={preference}>{action((es?['Equilibrado','Más proteína','Menos calorías','Lo que me apetece']:['Balanced','More protein','Lower calories','What I feel like'])[i],()=>{setSearchDraft({...searchDraft??ready.noResults!.input,preference});setShowPreferences(false);})}</React.Fragment>)}</View>}
   {searchEdit&&<Text style={s.muted}>{say('Reply below to update these details. This does not start a search.','Responde abajo para cambiar estos datos. Esto no inicia una búsqueda.')}</Text>}
   {searchEdit&&action(say('Cancel edit','Cancelar cambio'),()=>setSearchEdit(null))}
   {action(say('Review updated search','Revisar búsqueda ajustada'),()=>{void run('reviseSearch');},gate!=='ready'||!searchDraft||searchEdit!==null||JSON.stringify(searchDraft)===JSON.stringify(ready.noResults.input))}</>}
  </View>}
  {ready?.publicRequest&&!ready.noResults&&!ready.options.length&&<>{ready.galleryNoMatch&&<Text style={s.body}>{say('I didn’t find a match for this request in your recipes or the gallery. You can review a web search next.','No encontré coincidencias para lo que pediste en tus recetas ni en la galería. Puedes revisar una búsqueda web a continuación.')}</Text>}{consent?<><View style={s.details}>{mealSearchDisclosure(ready.publicRequest,es).map((line,i)=><Text key={i} style={s.body}>{line}</Text>)}</View><Text style={s.muted}>{say('OpenRouter / Gemini will use these public search details. Coach planning may also use your nutrition context. Existing usage limits apply. Nothing is logged without confirmation.','OpenRouter / Gemini usará estos datos públicos. El Coach también puede usar tu contexto nutricional. Se aplican los límites existentes. No se registra nada sin confirmar.')}</Text>{action(say('Search these details','Buscar estos datos'),()=>{void run('discover');},gate!=='ready'||!ready.capabilities.discovery)}{action(say('Cancel search','Cancelar búsqueda'),()=>setConsent(false))}</>:<>{ready.capabilities.discovery?action(say('Review web search','Revisar búsqueda web'),()=>setConsent(true),gate!=='ready'): <Text style={s.muted}>{mealFailureMessage(ready.capabilities.reason??'unknown',es)}</Text>}</>}</>}
  {ready?.options.map(o=><View key={o.id} style={s.card}>
   {o.kind==='general'&&<Text style={s.muted}>{say('General meal estimate — not restaurant-specific.','Estimación general de comida; no corresponde a un restaurante específico.')}</Text>}
   <Text style={s.title}>{o.venue?.name??o.name}</Text>{o.venue&&<Text style={s.body}>{o.name}</Text>}
   {o.match&&<><Text style={s.body}>{say('Related option','Opción similar')}</Text><Text style={s.muted}>{say('You asked for: ','Pediste: ')}{o.match.requestedFood}</Text>{o.match.differences.map((difference,i)=><Text key={i} style={s.muted}>{difference}</Text>)}</>}
   {o.venue?.address&&o.venue.addressSourceUrl&&<Text style={s.muted}>{o.venue.address}</Text>}
   {coachRecipeTimeLabel(o,es)&&<Text style={s.muted}>{coachRecipeTimeLabel(o,es)}</Text>}
   <Text style={s.body}>{o.nutrition.basis.label}</Text><Text style={s.body}>{o.nutrition.values.calories??'—'} kcal · {o.nutrition.values.protein??'—'} g {say('protein','proteína')}</Text>
   <Text style={s.muted}>{['official','publisher_reported'].includes(o.nutrition.authority)?say('Source-reported nutrition','Nutrición publicada por la fuente'):say('Approximate or incomplete nutrition — not official values; review the portion and ingredients before adding','Nutrición aproximada o incompleta; no son valores oficiales. Revisa la porción y los ingredientes antes de añadir')}</Text>
   {o.kind==='general'&&!ready.capabilities.estimate&&Object.values(o.nutrition.values).some(x=>x===null)&&<Text style={s.body}>{say('Nutrition estimation is unavailable right now. Your meal and portion are saved.','La estimación nutricional no está disponible ahora. Tu comida y porción están guardadas.')}</Text>}
   {o.provenance.url&&action(say('Open source','Abrir fuente'),()=>{void Linking.openURL(o.provenance.url!);})}
   {estimateId===o.id&&portionError&&<Text accessibilityRole="alert" style={s.body}>{portionError}</Text>}
   {estimateId===o.id&&needsPortion?<><Text style={s.body}>{say('What size or portion are you considering? Reply below before reviewing the estimate request.','¿Qué tamaño o porción estás considerando? Responde abajo antes de revisar la solicitud de estimación.')}</Text>{portion&&<Text style={s.muted}>{say('Current portion: ','Porción actual: ')}{portion}</Text>}{action(say('Cancel estimate','Cancelar estimación'),()=>{setEstimateId(null);setNeedsPortion(false);setPortionError(null);})}</>:estimateId===o.id&&details?<><Text style={s.muted}>{say('Estimate this dish with OpenRouter / Gemini? These dish, ingredient, source and portion details are sent; estimates are not official nutrition or allergen guarantees.','¿Estimar este plato con OpenRouter / Gemini? Se envían estos datos de plato, ingredientes, fuente y porción; no son valores oficiales ni garantías ante alergias.')}</Text><Text style={s.body}>{details.name}</Text>{details.ingredients.map((x,i)=><Text key={i} style={s.muted}>{x}</Text>)}<Text style={s.muted}>{[details.identity?.entity,details.identity?.variant,details.identity?.portion_label].filter(Boolean).join(' / ')}</Text><Text style={s.muted}>{details.physical_portion?.grams?`${details.physical_portion.grams} g`:''} · {details.source.url} · {details.source.nutrition.basis.label}</Text>{Object.entries(details.source.nutrition.values).map(([key,value])=><Text key={key} style={s.muted}>{key}: {value??say('Unknown','Desconocido')}</Text>)}{action(say('Edit portion','Editar porción'),()=>setNeedsPortion(true),gate!=='ready')}{action(say('Confirm estimate','Confirmar estimación'),()=>{void run('estimate');},gate!=='ready')}{action(say('Cancel estimate','Cancelar estimación'),()=>setEstimateId(null))}</>:(Object.values(o.nutrition.values).some(x=>x===null)||o.nutrition.authority==='estimated'&&!o.components?.length)&&ready.capabilities.estimate&&action(Object.values(o.nutrition.values).some(x=>x===null)?say('Estimate nutrition','Estimar nutrici\u00f3n'):say('Estimate ingredient breakdown','Estimar ingredientes'),()=>{setEstimateId(o.id);setPortion(o.identity?.portion_label??'');setPortionError(null);setNeedsPortion(estimateNeedsPortion(o));},gate!=='ready')}
   {action(say('View Details','Ver detalles'),()=>{void review(ready,o.id,diaryMealTypeForLocalTime());},gate!=='ready')}
   {action(say('Add to diary','Añadir al diario'),()=>{void review(ready,o.id,diaryMealTypeForLocalTime());},gate!=='ready'||o.kind==='general'&&Object.values(o.nutrition.values).some(x=>x===null))}
  </View>)}
  {!busy&&result&&result.kind!=='ready'&&result.kind!=='retry_available'&&<Text accessibilityRole="alert" style={s.body}>{mealFailureMessage(result.reason,es)}</Text>}
  {busy&&<ActivityIndicator accessibilityLabel={say('Working','Procesando')}/>}
 </View>;
}
const s=StyleSheet.create({container:{gap:12},body:{fontSize:16,lineHeight:24,color:'#263F34'},muted:{fontSize:13,lineHeight:20,color:'#586A5E'},title:{fontSize:18,lineHeight:25,fontWeight:'600',color:'#173A2B'},row:{flexDirection:'row',flexWrap:'wrap',gap:8},action:{minHeight:44,paddingVertical:10,paddingHorizontal:12,justifyContent:'center',alignSelf:'flex-start',borderRadius:14,backgroundColor:'#EDF3EF'},actionText:{fontSize:14,color:'#27614D'},card:{gap:9,paddingVertical:16,borderBottomWidth:1,borderColor:'#DCE5D8'},details:{gap:6}});
