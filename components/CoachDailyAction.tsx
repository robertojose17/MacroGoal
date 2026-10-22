import { holdRecipeReview, clearRecipeReview } from '@/utils/coachRecipeReview';
import { clearMealReview } from '@/utils/coachMealReview';
import CoachMealConversation from '@/components/CoachMealConversation';
import type { MealExperienceServices } from '@/utils/coachMealServices';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
import { dailyAccess, DAILY_MEAL_SLOTS, type DailyAccess, type DailySnapshot } from '@/utils/coachDailyAction';
import type { DailyActionServices } from '@/utils/coachManualHandoff';
import { clearJourneys, guidance, journeyScope, newJourney, rememberJourney, resumeJourney, type GuidedResult, type JourneyDraft, type MealGuidance } from '@/utils/coachJourney';

export type GuidedServices = DailyActionServices & {
  experience?: MealExperienceServices;
  pendingGuidance?(access: DailyAccess, date: string): Promise<JourneyDraft | null>;
  guided?(access: DailyAccess, date: string, meal: JourneyDraft['meal'], guidance: MealGuidance): Promise<GuidedResult>;
  recoverGuided?(access: DailyAccess, date: string, meal: JourneyDraft['meal'], guidance: MealGuidance): Promise<GuidedResult>;
};
type Props = DailyAccess & { services?: GuidedServices; hasConversation?: boolean; mealRequest?: number; onConversation?: () => void };

export default function CoachDailyAction(props: Props) {
  return props.services?.experience ? <CoachMealConversation {...props} experience={props.services.experience} summaryServices={props.services} /> : <CoachDailyActionContent {...props} />;
}
export function CoachDailyActionContent(props: Props) {
  const { i18n } = useTranslation(); const es = i18n.language.toLowerCase().startsWith('es');
  const say = (en: string, spanish: string) => es ? spanish : en;
  const router = useRouter(); const access = useRef(props); access.current = props;
  const [owner, setOwner] = useState<string>(); const [date, setDate] = useState(toLocalDateString());
  const [returning, setReturning] = useState(false); const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [step, setStep] = useState<'home' | 'mode' | 'context' | 'results' | 'day'>('home');
  const [draft, setDraft] = useState<JourneyDraft>(newJourney); const [result, setResult] = useState<GuidedResult | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [working, setWorking] = useState(false); const [refresh, setRefresh] = useState(0);
  const [pendingDraft, setPendingDraft] = useState<JourneyDraft | null>(null);
  const [question, setQuestion] = useState<'meal' | 'diary' | 'remaining' | 'preferences'>('meal');
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const focusedDay = useRef(date);
  const generation = useRef(0), lock = useRef(false), currentOwner = useRef<string | undefined>(undefined);
  const gate = dailyAccess(props); const preview = !props.isPremium && !props.premiumLoading && !props.premiumError; const busy = working || props.busy || props.premiumLoading;
  const scope = owner ? journeyScope(owner, date) : undefined;
  const reset = () => { setPendingDraft(null); setReturning(false); setPreferencesOpen(false); generation.current++; currentOwner.current = undefined; setOwner(undefined); setSnapshot(null); setResult(null); setDraft(newJourney()); setStep('home'); clearJourneys(); clearRecipeReview(); clearMealReview(); };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || session?.user?.id !== currentOwner.current) reset();
      setRefresh(n => n + 1);
    }); return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { if (props.mealRequest) { setResult(null); setStep('mode'); } }, [props.mealRequest]);
  useFocusEffect(useCallback(() => {
    const id = ++generation.current; const today = toLocalDateString();
    if (focusedDay.current !== today) { focusedDay.current = today; clearJourneys(); setDraft(newJourney()); setStep('home'); setReturning(false); }
    setDate(today);
    setSnapshot(null); setResult(null); setPendingDraft(null);
    void (async () => {
      const auth = await supabase.auth.getUser(); if (generation.current !== id) return;
      const account = auth.error ? undefined : auth.data.user?.id;
      if (currentOwner.current && account !== currentOwner.current) clearJourneys();
      currentOwner.current = account; setOwner(account);
      if (!account) { setSnapshot({ kind: 'blocked' }); return; }
      const key = `coach_welcome_v2:${journeyScope(account, today)}`;
      try { const seen = await AsyncStorage.getItem(key); if (generation.current !== id) return; setReturning(seen === 'seen'); await AsyncStorage.setItem(key, 'seen'); } catch { /* Welcome copy never authorizes a request. */ }
      if (generation.current !== id) return;
      const saved = resumeJourney(journeyScope(account, today));
      if (saved) { setDraft(saved.draft); setQuestion(saved.draft.question ?? 'meal'); setStep(saved.step); }
      if (dailyAccess(access.current) !== 'ready') return;
      const pending = await props.services?.pendingGuidance?.(access.current, today);
      if (generation.current !== id || toLocalDateString() !== today || dailyAccess(access.current) !== 'ready') return;
      setPendingDraft(pending ?? null);
      const loaded = await props.services?.load(access.current, today);
      if (generation.current === id && toLocalDateString() === today) setSnapshot(loaded ?? { kind: 'unavailable' });
    })();
    const timer = setInterval(() => { if (toLocalDateString() !== today) { generation.current++; clearJourneys(); setStep('home'); setSnapshot(null); setResult(null); setRefresh(n => n + 1); } }, 30000);
    return () => { generation.current++; clearInterval(timer); };
  }, [gate, refresh, props.services]));
  useEffect(() => { if (scope && (step === 'mode' || step === 'context')) rememberJourney(scope, step, { ...draft, question }); }, [scope, step, draft, question]);

  const button = (label: string, press: () => void, secondary = false, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={press} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.45 }]}><Text style={[s.buttonText, secondary && s.secondaryText]}>{label}</Text></TouchableOpacity>;
  const chip = (label: string, chosen: boolean, press: () => void) => <TouchableOpacity key={label} accessibilityRole="radio" accessibilityState={{ checked: chosen, disabled: busy }} disabled={busy} onPress={press} style={[s.chip, chosen && s.chosen]}><Text style={[s.chipText, chosen && s.chosenText]}>{label}</Text></TouchableOpacity>;
  const change = (value: Partial<JourneyDraft>) => { setDraft(d => ({ ...d, ...value })); setResult(null); };
  const close = () => { generation.current++; clearJourneys(); setStep('home'); setResult(null); };
  async function recoverContext() {
    if (lock.current || dailyAccess(access.current) !== 'ready' || !owner || !props.services?.recovery) return;
    lock.current = true; setWorking(true); const id = generation.current, account = owner, today = toLocalDateString();
    try {
      const next = await props.services.recovery.load(access.current, today);
      const auth = await supabase.auth.getUser();
      if (generation.current === id && !auth.error && auth.data.user?.id === account && toLocalDateString() === today && dailyAccess(access.current) === 'ready') setSnapshot(next);
    } finally { lock.current = false; setWorking(false); }
  }
  async function search(recover = false, restored?: JourneyDraft) {
    if (lock.current || dailyAccess(access.current) !== 'ready' || !owner) return;
    const chosen = restored ?? draft;
    const input = guidance(chosen); if (!input) return;
    if (restored) setDraft(restored);
    setPendingDraft(null);
    lock.current = true; setWorking(true); setStep('results'); setResult(null);
    const id = generation.current, account = owner, today = toLocalDateString();
    try {
      const service = recover ? props.services?.recoverGuided : props.services?.guided;
      const found = service ? await service(access.current, today, chosen.meal, input) : { kind: 'unavailable' as const };
      const auth = await supabase.auth.getUser();
      if (generation.current !== id || auth.error || auth.data.user?.id !== account || toLocalDateString() !== today || dailyAccess(access.current) !== 'ready') return;
      setResult(found.kind === 'ready' && (found.owner !== account || found.date !== today || found.meal !== chosen.meal) ? { kind: 'blocked' } : found);
    } finally { lock.current = false; setWorking(false); }
  }
  async function review(id: string) {
    if (lock.current || result?.kind !== 'ready' || dailyAccess(access.current) !== 'ready') return;
    const option = result.options.find(o => o.id === id); if (!option || !owner) return;
    lock.current = true; setWorking(true); const revision = generation.current, account = owner, today = toLocalDateString();
    try {
      const auth = await supabase.auth.getUser();
      if (generation.current !== revision || auth.error || auth.data.user?.id !== account || toLocalDateString() !== today || result.date !== today || result.owner !== account || dailyAccess(access.current) !== 'ready') return;
      if (option.review.kind === 'recipe' && option.recipe) {
        const key = holdRecipeReview({ owner: account, date: today, meal: draft.meal, option });
        router.push({ pathname: '/recipe-finder-detail', params: { coachReviewKey: key } });
      } else if (option.review.kind === 'source' && option.source_url) {
        await Linking.openURL(option.source_url);
      } else if (option.review.kind === 'saved_meal') {
        router.push({ pathname: '/my-meals-details', params: { mealId: option.review.id, meal: draft.meal, date: today, coachReview: 'true', coachOwner: account } });
      }
    } finally { lock.current = false; setWorking(false); }
  }

  const mealLabel = (meal: JourneyDraft['meal']) => (es ? ['Desayuno', 'Almuerzo', 'Cena', 'Snack'] : ['Breakfast', 'Lunch', 'Dinner', 'Snack'])[DAILY_MEAL_SLOTS.indexOf(meal)];
  const action = (label: string, press: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={press} style={[s.action, disabled && { opacity: 0.45 }]}><Text style={s.actionText}>{label}</Text></TouchableOpacity>;
  const back = () => {
    generation.current++; setResult(null);
    if (step === 'results') { setStep('context'); setQuestion('preferences'); }
    else if (step === 'context' && question !== 'meal') setQuestion(question === 'preferences' ? 'remaining' : question === 'remaining' ? 'diary' : 'meal');
    else setStep(step === 'context' ? 'mode' : 'home');
  };
  const begin = () => { setQuestion('meal'); setShowAlternatives(false); setStep('mode'); };
  const logged = snapshot?.kind === 'ready' && snapshot.summary.kind === 'logged' ? snapshot.summary : null;

  return <View style={s.shell}>
    {pendingDraft && action(say('Resume unfinished meal search', 'Retomar búsqueda pendiente'), () => { void search(true, pendingDraft); }, busy || gate !== 'ready')}
    {step !== 'home' && <View style={s.navigation}>{action(say('Back', 'Atrás'), back, busy)}{action(working ? say('Cancel', 'Cancelar') : say('Done', 'Listo'), close)}</View>}
    {step === 'home' ? <>
      <Text style={s.body}>{returning || props.hasConversation ? say('Welcome back. What would help right now?', 'Qué bueno verte de nuevo. ¿Qué necesitas ahora?') : say('Hi, I’m your Coach. Let’s make your next food choice easier.', 'Hola, soy tu Coach. Hagamos más fácil elegir qué comer.')}</Text>
      {props.premiumLoading ? <View style={s.row}><ActivityIndicator size="small" /><Text style={s.muted}>{say('Checking your access…', 'Verificando tu acceso…')}</Text></View> : props.premiumError ? <Text accessibilityRole="alert" style={s.body}>{say('I couldn’t check your access. Please reconnect and try again.', 'No pude verificar tu acceso. Reconecta e inténtalo de nuevo.')}</Text> : <View style={s.row}>
        {action(say('Choose food', 'Elegir comida'), begin, busy)}
        {action(say('Review my day', 'Revisar mi día'), () => setStep('day'), busy)}
        {action(say('Ask a question', 'Hacer una pregunta'), () => props.onConversation?.(), busy)}
      </View>}
      {preview && <Text style={s.muted}>{say('Try the guided preview. Personalized coaching is included with Premium.', 'Prueba la guía de ejemplo. El coaching personalizado está incluido en Premium.')}</Text>}
    </> : step === 'day' ? <>
      <Text style={s.body}>{logged ? say(`Your diary shows ${Math.round(logged.totals.calories)} kcal and ${Math.round(logged.totals.protein)} g protein today. What would you like to work on?`, `Tu diario muestra ${Math.round(logged.totals.calories)} kcal y ${Math.round(logged.totals.protein)} g de proteína hoy. ¿Qué quieres trabajar?`) : say('I don’t have a complete picture of your day. Missing entries don’t mean you haven’t eaten.', 'No tengo una imagen completa de tu día. Que falten registros no significa que no hayas comido.')}</Text>
      <View style={s.row}>{action(say('Choose food', 'Elegir comida'), begin, busy)}{action(say('Open diary', 'Abrir diario'), () => router.push('/(tabs)/(home)'))}</View>
      {snapshot?.kind === 'permission' && action(say('Review permissions', 'Revisar permisos'), () => router.push('/coach-permissions'))}
      {snapshot?.kind === 'unavailable' && props.services?.recovery && action(say('Recover daily context', 'Recuperar contexto del día'), () => { void recoverContext(); }, busy || gate !== 'ready')}
    </> : step === 'mode' ? <>
      <Text style={s.body}>{say('Are you cooking, keeping it quick, or eating out?', '¿Vas a cocinar, quieres algo rápido o vas a comer fuera?')}</Text>
      <View style={s.row}>{([['cook','Cook','Cocinar'],['quick','Quick / no-cook','Rápido / sin cocinar'],['eat_out','Eat out','Comer fuera'],['favorite','A saved meal','Una comida guardada']] as const).map(([mode,en,sp]) => <React.Fragment key={mode}>{action(say(en,sp), () => { change({ mode }); setQuestion('meal'); setStep('context'); }, busy)}</React.Fragment>)}</View>
    </> : step === 'context' && draft.mode === 'favorite' ? <>
      <Text style={s.body}>{say('Choose a saved meal you want to eat. You can review its portion before adding it.', 'Elige una comida guardada que quieras comer. Podrás revisar la porción antes de añadirla.')}</Text>
      {preview ? action(say('See Premium', 'Ver Premium'), () => router.push('/subscription')) : action(say('Open saved meals', 'Abrir comidas guardadas'), () => router.push('/my-meals'), busy || gate !== 'ready')}
    </> : step === 'context' ? <>
      {question !== 'meal' && <View style={s.answer}><Text style={s.answerText}>{mealLabel(draft.meal)}{question === 'preferences' ? ` · ${draft.remaining} ${say('meal(s) planned', 'comida(s) planeadas')}` : ''}</Text></View>}
      {question === 'meal' ? <>
        <Text style={s.body}>{say('Which meal are we choosing?', '¿Qué comida vamos a elegir?')}</Text>
        <View style={s.row}>{DAILY_MEAL_SLOTS.map(meal => <React.Fragment key={meal}>{action(mealLabel(meal), () => { change({ meal }); setQuestion('diary'); }, busy)}</React.Fragment>)}</View>
      </> : question === 'diary' ? <>
        <Text style={s.body}>{say('Is today’s diary up to date? This helps me use your remaining macros.', '¿Está al día tu diario? Así puedo usar tus macros restantes.')}</Text>
        <View style={s.row}>{action(say('Yes', 'Sí'), () => { change({ diaryComplete: true }); setQuestion('remaining'); }, busy)}{action(say('Not yet / not sure', 'Todavía no / no sé'), () => { change({ diaryComplete: false }); setQuestion('remaining'); }, busy)}</View>
      </> : question === 'remaining' ? <>
        <Text style={s.body}>{say('How many meals do you still plan to eat today, including this one?', '¿Cuántas comidas planeas hacer hoy, incluida esta?')}</Text>
        <View style={s.row}>{[1,2,3,4].map(n => <React.Fragment key={n}>{action(String(n), () => { change({ remaining: n }); setQuestion('preferences'); }, busy)}</React.Fragment>)}</View>
      </> : <>
        <Text style={s.body}>{say('Any allergies, diet preferences or ingredients to avoid?', '¿Alguna alergia, dieta o ingrediente que quieras evitar?')}</Text>
        {preferencesOpen ? <>
          <View style={s.row}>{(['unrestricted','vegetarian','vegan'] as const).map((diet,i) => chip((es ? ['Sin restricción','Vegetariano','Vegano'] : ['No restriction','Vegetarian','Vegan'])[i], draft.diet === diet, () => change({ diet })))}</View>
          <TextInput accessibilityLabel={say('Allergens to avoid', 'Alérgenos que evitas')} style={s.input} value={draft.allergens} maxLength={240} onChangeText={allergens => change({ allergens })} placeholder={say('Allergies, separated by commas', 'Alergias, separadas por comas')} placeholderTextColor="#737F7B" />
          <TextInput accessibilityLabel={say('Ingredients to avoid', 'Ingredientes que evitas')} style={s.input} value={draft.avoid} maxLength={240} onChangeText={avoid => change({ avoid })} placeholder={say('Ingredients you dislike', 'Ingredientes que no te gustan')} placeholderTextColor="#737F7B" />
          <Text style={s.muted}>{say('For allergies, confirm ingredients with the source or restaurant.', 'Si tienes alergias, confirma los ingredientes con la fuente o el restaurante.')}</Text>
        </> : action(say('Add preferences', 'Añadir preferencias'), () => setPreferencesOpen(true), busy)}
        {preview ? <>
          <View style={s.option}><Text style={s.small}>{say('EXAMPLE — NOT PERSONALIZED', 'EJEMPLO — NO PERSONALIZADO')}</Text><Text style={s.body}>{say('Compare a meal, adjust its portion, then confirm before logging. Premium uses your preferences and diary to help with the choice.', 'Compara una comida, ajusta la porción y confirma antes de registrarla. Premium usa tus preferencias y diario para ayudarte a elegir.')}</Text></View>
          {action(say('See Premium', 'Ver Premium'), () => router.push('/subscription'))}
        </> : button(say('Find food options', 'Buscar opciones'), () => { setShowAlternatives(false); void search(); }, false, busy || gate !== 'ready' || !guidance(draft))}
      </>}
    </> : <>
      {working ? <View accessibilityLiveRegion="polite" style={s.row}><ActivityIndicator size="small" color="#27614D" /><Text style={s.body}>{say('Looking for meal options…', 'Buscando opciones de comida…')}</Text></View> : result?.kind === 'ready' && result.options.length ? <>
        <Text style={s.body}>{say('Here’s an option to start with. You can change the portion or choose another.', 'Aquí tienes una opción para empezar. Puedes cambiar la porción o elegir otra.')}</Text>
        {(showAlternatives ? result.options : result.options.slice(0,1)).map(option => <View key={option.id} style={s.option}>
          <Text style={s.mealName}>{option.name}</Text><Text style={s.body}>{option.portion_label}</Text>
          <Text style={s.macros}>{Math.round(option.nutrition.calories)} kcal · P {Math.round(option.nutrition.protein)} · C {Math.round(option.nutrition.carbs)} · {es ? 'G' : 'F'} {Math.round(option.nutrition.fats)} g</Text>
          <Text style={s.muted}>{option.source_label}</Text>
          {action(say('Source & fit', 'Fuente y ajuste'), () => setDetailId(detailId === option.id ? null : option.id))}
          {detailId === option.id && <Text style={s.muted}>{option.fit_explanation === 'recorded_budget_exhausted' ? say('Your logged intake has reached your calorie target. This is still an option to eat, not advice to skip a meal.', 'Lo registrado ya alcanza tu objetivo calórico. Sigue siendo una opción para comer, no una indicación de saltarte una comida.') : option.fit_explanation === 'near_planning_share' ? say('Close to the approximate share of your remaining target for this meal.', 'Cerca de la parte aproximada de tu objetivo restante para esta comida.') : option.fit_explanation === 'different_from_planning_share' ? say('Different from your approximate meal budget. Adjust the portion to suit you.', 'Difiere de tu presupuesto aproximado. Ajusta la porción como prefieras.') : say('Your remaining budget is uncertain. These numbers describe the meal, not a personalized target.', 'Tu presupuesto restante es incierto. Estos números describen la comida, no un objetivo personalizado.')}</Text>}
          {button(say('Review portion', 'Revisar porción'), () => { void review(option.id); }, false, busy)}
        </View>)}
        <View style={s.row}>{result.options.length > 1 && action(showAlternatives ? say('Show first option', 'Ver primera opción') : say('See alternatives', 'Ver alternativas'), () => setShowAlternatives(v => !v))}{action(say('Something else', 'Otra cosa'), () => { setStep('mode'); setResult(null); })}</View>
      </> : result?.kind === 'ready' && ['exclude_ingredients','clarify_ingredient_exclusions'].includes(result.reason ?? '') ? <>
        <Text style={s.body}>{say('I didn’t recognize an ingredient you want to avoid. Can you reword it?', 'No reconocí un ingrediente que quieres evitar. ¿Puedes escribirlo de otra forma?')}</Text>
        {action(say('Edit ingredients', 'Editar ingredientes'), () => { setPreferencesOpen(true); setQuestion('preferences'); setStep('context'); })}
      </> : result?.kind !== 'ready' ? <>
        <Text accessibilityRole="alert" style={s.body}>{say('That search didn’t finish. Your choices are still here.', 'La búsqueda no terminó. Tus opciones siguen aquí.')}</Text>
        <View style={s.row}>{props.services?.recoverGuided && action(say('Recover search', 'Recuperar búsqueda'), () => { void search(true); }, busy || gate !== 'ready')}{action(say('Edit my choices', 'Editar mis opciones'), () => { setStep('context'); setQuestion('preferences'); })}</View>
      </> : <>
        <Text style={s.body}>{say('I didn’t find a match for those choices. Let’s try another food or adjust the preferences.', 'No encontré una opción para esa elección. Probemos otra comida o ajustemos las preferencias.')}</Text>
        <View style={s.row}>{action(say('Choose another food', 'Elegir otra comida'), () => setStep('mode'))}{action(say('Adjust preferences', 'Ajustar preferencias'), () => { setPreferencesOpen(true); setQuestion('preferences'); setStep('context'); })}</View>
      </>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  shell: { gap: 12, marginBottom: 16 },
  body: { fontSize: 16, lineHeight: 23, color: '#263F34' }, muted: { fontSize: 13, lineHeight: 19, color: '#586A5E' }, small: { fontSize: 10, lineHeight: 15, color: '#536B5C', fontWeight: '700' },
  navigation: { flexDirection: 'row', justifyContent: 'space-between' }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  action: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', borderWidth: 1, borderColor: '#DAE2DC', borderRadius: 18, backgroundColor: '#FFF', alignSelf: 'flex-start' }, actionText: { fontSize: 14, lineHeight: 20, color: '#27614D', fontWeight: '500' },
  answer: { alignSelf: 'flex-end', backgroundColor: '#EDF3EF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 }, answerText: { color: '#354D40', fontSize: 14, lineHeight: 20 },
  button: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27614D', alignSelf: 'flex-start' }, buttonText: { fontSize: 15, fontWeight: '600', color: '#FFF', textAlign: 'center' }, secondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D9E2D6' }, secondaryText: { color: '#27614D' },
  chip: { minHeight: 44, padding: 11, borderWidth: 1, borderColor: '#D2DECE', borderRadius: 12, backgroundColor: '#FFF' }, chosen: { backgroundColor: '#27614D', borderColor: '#27614D' }, chipText: { fontSize: 13, color: '#354D40' }, chosenText: { color: '#FFF' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#CFDBCB', borderRadius: 12, backgroundColor: '#FFF', padding: 12, color: '#173A2B', fontSize: 16 }, mealName: { color: '#173A2B', fontSize: 18, lineHeight: 24, fontWeight: '600' }, option: { borderRadius: 14, backgroundColor: '#FFF', padding: 14, gap: 8, borderWidth: 1, borderColor: '#DCE5D8' }, macros: { color: '#27614D', fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
