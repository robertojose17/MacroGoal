import { holdRecipeReview, clearRecipeReview } from '@/utils/coachRecipeReview';
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
  pendingGuidance?(access: DailyAccess, date: string): Promise<JourneyDraft | null>;
  guided?(access: DailyAccess, date: string, meal: JourneyDraft['meal'], guidance: MealGuidance): Promise<GuidedResult>;
  recoverGuided?(access: DailyAccess, date: string, meal: JourneyDraft['meal'], guidance: MealGuidance): Promise<GuidedResult>;
};
type Props = DailyAccess & { services?: GuidedServices; hasConversation?: boolean; mealRequest?: number; onConversation?: () => void };

export default function CoachDailyAction(props: Props) {
  const { i18n } = useTranslation(); const es = i18n.language.toLowerCase().startsWith('es');
  const say = (en: string, spanish: string) => es ? spanish : en;
  const router = useRouter(); const access = useRef(props); access.current = props;
  const [owner, setOwner] = useState<string>(); const [date, setDate] = useState(toLocalDateString());
  const [returning, setReturning] = useState(false); const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [step, setStep] = useState<'home' | 'mode' | 'context' | 'results'>('home');
  const [draft, setDraft] = useState<JourneyDraft>(newJourney); const [result, setResult] = useState<GuidedResult | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [working, setWorking] = useState(false); const [refresh, setRefresh] = useState(0);
  const [pendingDraft, setPendingDraft] = useState<JourneyDraft | null>(null);
  const focusedDay = useRef(date);
  const generation = useRef(0), lock = useRef(false), currentOwner = useRef<string | undefined>(undefined);
  const gate = dailyAccess(props); const preview = !props.isPremium && !props.premiumLoading && !props.premiumError; const busy = working || props.busy || props.premiumLoading;
  const scope = owner ? journeyScope(owner, date) : undefined;
  const reset = () => { setPendingDraft(null); setReturning(false); setPreferencesOpen(false); generation.current++; currentOwner.current = undefined; setOwner(undefined); setSnapshot(null); setResult(null); setDraft(newJourney()); setStep('home'); clearJourneys(); clearRecipeReview(); };

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
      if (saved) { setDraft(saved.draft); setStep(saved.step); }
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
  useEffect(() => { if (scope && (step === 'mode' || step === 'context')) rememberJourney(scope, step, draft); }, [scope, step, draft]);

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

  return <View style={s.shell}>
    <View style={s.identity}><View style={s.avatar}><Text style={s.avatarText}>M</Text></View><View><Text style={s.eyebrow}>MACRO GOAL</Text><Text style={s.coach}>Coach</Text></View><View style={s.badge}><Text style={s.badgeText}>{props.isPremium ? 'PREMIUM' : say("PREVIEW", "VISTA PREVIA")}</Text></View></View>
    {pendingDraft && button(say('Recover unfinished meal search', 'Recuperar búsqueda de comida pendiente'), () => { void search(true, pendingDraft); }, true, busy || gate !== 'ready')}
    {step === 'home' ? <>
      {working && <Text accessibilityRole="alert" style={s.muted}>{say('The previous request is finishing. No food will be added.', 'La solicitud anterior está terminando. No se añadirá comida.')}</Text>}
      <Text accessibilityRole="header" style={s.title}>{returning || props.hasConversation ? say("Good to have you back.", "Qué bueno verte de nuevo.") : say("Let’s make today a little easier.", "Hagamos tu día un poco más fácil.")}</Text>
      <Text style={s.body}>{props.hasConversation ? say("Your conversation is here. Pick up where you left off, or let’s work out what to eat.", "Tu conversación sigue aquí. Retómala o veamos qué puedes comer.") : say("I’m here to help you turn your goals into everyday choices. What would be useful right now?", "Estoy aquí para ayudarte a convertir tus objetivos en decisiones cotidianas. ¿Qué te vendría bien ahora?")}</Text>
      {gate === 'ready' && snapshot?.kind === 'ready' && <View style={s.context}><Text style={s.small}>{say("FROM TODAY’S LOG", "SEGÚN TU DIARIO DE HOY")}</Text><Text style={s.body}>{snapshot.summary.kind === 'logged' ? `${Math.round(snapshot.summary.totals.calories)} kcal · ${Math.round(snapshot.summary.totals.protein)} g ${say("protein logged", "de proteína registrados")}` : say("Today’s log is incomplete. We can still start with what you need.", "El diario de hoy está incompleto. Podemos empezar por lo que necesitas.")}</Text><Text style={s.muted}>{say("Logged food is only part of the picture. You can update it before choosing a meal.", "Lo registrado es solo parte de la información. Puedes actualizarlo antes de elegir una comida.")}</Text></View>}
      {gate === 'ready' && !snapshot && <ActivityIndicator accessibilityLabel={say("Refreshing today’s context", "Actualizando el contexto de hoy")} color="#27614D" />}
      {snapshot?.kind === 'permission' && <>{<Text style={s.muted}>{say("Your Coach permissions need a review before personalized guidance.", "Revisa los permisos del Coach antes de recibir orientación personalizada.")}</Text>}{button(say("Review permissions", "Revisar permisos"), () => router.push('/coach-permissions'), true)}</>}
      {snapshot?.kind === 'unavailable' && <Text style={s.muted}>{say("I couldn’t refresh your log. I won’t guess your remaining macros.", "No pude actualizar tu diario. No voy a inventar tus macros restantes.")}</Text>}
      {snapshot?.kind === 'unavailable' && props.services?.recovery && button(say("Recover daily context", "Recuperar contexto del día"), () => { void recoverContext(); }, true, busy || gate !== 'ready')}
      {button(say("Help me choose a meal", "Ayúdame a elegir una comida"), () => setStep('mode'), false, busy)}
      {button(props.hasConversation ? say("Continue our conversation", "Continuar la conversación") : say("Talk something through", "Hablemos de lo que necesitas"), () => props.onConversation?.(), true, busy)}
      {preview && <Text style={s.muted}>{say("Explore how meal guidance works. Personalized options and coaching require Premium.", "Explora cómo funciona la orientación. Las opciones personalizadas y el coaching requieren Premium.")}</Text>}
      {props.premiumError && <Text accessibilityRole="alert" style={s.muted}>{say("Premium access could not be verified. Try again when connected.", "No pudimos verificar Premium. Inténtalo al recuperar la conexión.")}</Text>}
    </> : <>
      <View style={s.navigation}>{button(say("Back", "Atrás"), () => { setResult(null); setStep(step === 'mode' ? 'home' : step === 'context' ? 'mode' : 'context'); generation.current++; }, true, busy)}{button(say("Close", "Cerrar"), close, true)}</View>
      <Text style={s.eyebrow}>{preview ? say("GUIDED PREVIEW", "VISTA PREVIA GUIADA") : say("LET’S FIND YOUR MEAL", "BUSQUEMOS TU COMIDA")}</Text>
      {step === 'mode' ? <>
        <Text accessibilityRole="header" style={s.title}>{say("What works for you right now?", "¿Qué te viene bien ahora?")}</Text>
        <Text style={s.body}>{say("Start with your situation. We’ll keep the next questions short.", "Empecemos por tu situación. Las siguientes preguntas serán breves.")}</Text>
        {([['cook', 'I can cook', 'Puedo cocinar', 'Review a recipe and its source portions', 'Revisa una receta y sus porciones publicadas'], ['eat_out', 'I’m eating out', 'Voy a comer fuera', 'Check what menu information is available', 'Revisa qué información del menú está disponible'], ['quick', 'Something quick, no cooking', 'Algo rápido, sin cocinar', 'A practical meal with little prep', 'Una comida práctica y fácil'], ['favorite', 'Something familiar', 'Algo conocido', 'Explore your saved meals', 'Explora tus comidas guardadas']] as const).map(([mode,en,sp,detail,detEs]) => <TouchableOpacity key={mode} accessibilityRole="button" disabled={busy} onPress={() => { change({ mode }); setStep('context'); }} style={s.mode}><Text style={s.modeTitle}>{say(en,sp)}  →</Text><Text style={s.muted}>{say(detail,detEs)}</Text></TouchableOpacity>)}
      </> : step === 'context' && (draft.mode === 'favorite' || draft.mode === 'eat_out') ? <>
        <Text accessibilityRole="header" style={s.title}>{draft.mode === 'favorite' ? say('Start with something familiar.', 'Empieza por algo conocido.') : say('A good order starts with the menu.', 'Un buen pedido empieza por el menú.')}</Text>
        <Text style={s.body}>{draft.mode === 'favorite' ? say('Your saved meals are available to review. They are not automatically ranked as complete meals or checked against restrictions.', 'Puedes revisar tus comidas guardadas. No se clasifican automáticamente como comidas completas ni se verifican sus restricciones.') : say('Restaurant options need a verified published menu and portions. This guide cannot search a restaurant yet, so I cannot promise a macro-matched order.', 'Las opciones necesitan un menú publicado y porciones verificadas. Esta guía aún no busca restaurantes; no puedo prometer un pedido ajustado a tus macros.')}</Text>
        {preview ? button(say('Explore Premium', 'Ver Premium'), () => router.push('/subscription')) : draft.mode === 'favorite' && button(say('Review my saved meals', 'Revisar mis comidas guardadas'), () => router.push('/my-meals'), false, busy || gate !== 'ready')}
        {button(say('Try a recipe or no-cook meal', 'Probar una receta o comida sin cocinar'), () => setStep('mode'), true)}
      </> : step === 'context' ? <>
        <Text accessibilityRole="header" style={s.title}>{say("A little context, a better choice.", "Un poco de contexto, una mejor elección.")}</Text>
        <Text style={s.label}>{say("Which meal?", "¿Qué comida?")}</Text><View style={s.row}>{DAILY_MEAL_SLOTS.map((meal,i) => chip((es ? ['Desayuno','Almuerzo','Cena','Snack'] : ['Breakfast','Lunch','Dinner','Snack'])[i], draft.meal === meal, () => change({ meal })))}</View>
        <Text style={s.label}>{say("Meals still planned today, including this one", "Comidas que aún planeas hoy, incluida esta")}</Text><View style={s.row}>{[1,2,3,4].map(n => chip(String(n), draft.remaining === n, () => change({ remaining: n })))}</View>
        <Text style={s.label}>{say("Does today’s diary include everything you’ve eaten?", "¿El diario de hoy incluye todo lo que has comido?")}</Text><View style={s.row}>{chip(say("Yes, up to date", "Sí, está al día"), draft.diaryComplete === true, () => change({ diaryComplete: true }))}{chip(say("Some food is missing", "Faltan alimentos"), draft.diaryComplete === false, () => change({ diaryComplete: false }))}</View>
        <Text style={s.muted}>{say("A meal budget is only an estimate. Missing logs won’t be treated as food you haven’t eaten.", "El presupuesto de una comida es una estimación. Los registros faltantes no significan que no hayas comido.")}</Text>
        {button(say('Diet, allergies or dislikes', 'Dieta, alergias o preferencias'), () => setPreferencesOpen(v => !v), true, busy)}
        {(preferencesOpen || draft.allergens || draft.avoid || draft.diet !== 'unrestricted') && <>
        <Text style={s.label}>{say("Dietary pattern", "Preferencia alimentaria")}</Text><View style={s.row}>{(['unrestricted','vegetarian','vegan'] as const).map((diet,i) => chip((es ? ['Sin restricción','Vegetariano','Vegano'] : ['No restriction','Vegetarian','Vegan'])[i], draft.diet === diet, () => change({ diet })))}</View>
        <Text style={s.label}>{say("Allergens to avoid (comma separated)", "Alérgenos que evitas (separados por comas)")}</Text><TextInput accessibilityLabel={say("Allergens to avoid", "Alérgenos que evitas")} style={s.input} value={draft.allergens} maxLength={240} onChangeText={allergens => change({ allergens })} placeholder={say("Leave blank if none", "Déjalo vacío si no hay ninguno")} placeholderTextColor="#737F7B" />
        <Text style={s.label}>{say("Ingredients you dislike (optional)", "Ingredientes que no te gustan (opcional)")}</Text><TextInput accessibilityLabel={say("Foods to avoid or preferences", "Alimentos que evitas o preferencias")} style={s.input} value={draft.avoid} maxLength={240} onChangeText={avoid => change({ avoid })} placeholder={say("Anything you want us to consider?", "¿Qué quieres que tengamos en cuenta?")} placeholderTextColor="#737F7B" />
        <Text style={s.muted}>{say("Tell us about restrictions. Source information still needs your review; this is not an allergy guarantee.", "Indica tus restricciones. Revisa siempre la información de la fuente; esto no garantiza seguridad ante alergias.")}</Text>
        </>}
        {preview ? <><Text style={s.body}>{say("Premium checks available sources, portions and your logged targets before offering options. This preview has not searched or created a meal.", "Premium revisa fuentes disponibles, porciones y objetivos registrados antes de ofrecer opciones. Esta vista previa no ha buscado ni creado una comida.")}</Text>{button(say("Explore Premium", "Ver Premium"), () => router.push('/subscription'))}</> : button(say("Find meal options", "Buscar opciones de comida"), () => { void search(); }, false, busy || gate !== 'ready' || !guidance(draft))}
      </> : <>
        <Text accessibilityRole="header" style={s.title}>{say("Options worth considering.", "Opciones para considerar.")}</Text>
        {working ? <><ActivityIndicator color="#27614D" accessibilityLabel={say("Checking meal sources", "Revisando fuentes de comidas")} /><Text style={s.body}>{say("Checking available sources and portions…", "Revisando fuentes y porciones disponibles…")}</Text></> : result?.kind === 'ready' && result.options.length ? <>
          <Text style={s.muted}>{say("Based on your logged day and the meals you still plan to eat. Review the source and portion before adding.", "Según tu diario y las comidas que aún planeas. Revisa la fuente y la porción antes de añadir.")}</Text>
          {result.options.map(option => <View key={option.id} style={s.option}><Text style={s.small}>{option.source_label}</Text><Text style={s.modeTitle}>{option.name}</Text><Text style={s.body}>{option.portion_label}</Text><Text style={s.macros}>{Math.round(option.nutrition.calories)} kcal · P {Math.round(option.nutrition.protein)} · C {Math.round(option.nutrition.carbs)} · {es ? 'G' : 'F'} {Math.round(option.nutrition.fats)} g</Text><Text style={s.muted}>{option.fit_explanation === 'recorded_budget_exhausted' ? say('Your logged intake has reached the calorie target. These are still meal options, not advice to skip a meal.', 'Lo registrado ya alcanza tu objetivo calórico. Siguen siendo opciones para comer, no una indicación de saltarte una comida.') : option.fit_explanation === 'near_planning_share' ? say('Close to your approximate share for this meal.', 'Cerca de la porción aproximada de tu presupuesto para esta comida.') : option.fit_explanation === 'different_from_planning_share' ? say('Different from your approximate meal budget; review the portion.', 'Difiere del presupuesto aproximado; revisa la porción.') : say('No reliable meal budget yet. Nutrition comes from the published source.', 'Aún no hay un presupuesto fiable. La nutrición proviene de la fuente publicada.')}</Text>{button(option.review.kind === 'source' ? say('Review published source', 'Revisar fuente publicada') : say('Review portion & meal', 'Revisar porción y comida'), () => { void review(option.id); }, false, busy)}</View>)}
          {button(say("Not what I had in mind", "No es lo que buscaba"), () => { setStep('context'); setResult(null); }, true)}
        </> : result?.kind === 'ready' && ['exclude_ingredients','clarify_ingredient_exclusions'].includes(result.reason ?? '') ? <>
          <Text style={s.body}>{say('I need to clarify an ingredient you want to avoid before choosing meals.', 'Necesito aclarar un ingrediente que quieres evitar antes de elegir comidas.')}</Text>
          <Text style={s.muted}>{say('Some terms were not recognized. Edit the ingredient names; no options have been treated as matching these restrictions.', 'No reconocí algunos términos. Edita los nombres de los ingredientes; ninguna opción se ha considerado compatible con estas restricciones.')}</Text>
          {button(say('Edit ingredients to avoid', 'Editar ingredientes que evito'), () => { setPreferencesOpen(true); setStep('context'); })}
        </> : result?.kind !== 'ready' ? <>
          <Text accessibilityRole="alert" style={s.body}>{say('I could not complete this search. Your choices are still here.', 'No pude completar la búsqueda. Tus opciones siguen aquí.')}</Text>
          <Text style={s.muted}>{say('No meal was added. Recover a pending search, or return to your choices.', 'No se añadió ninguna comida. Recupera una búsqueda pendiente o vuelve a tus opciones.')}</Text>
          {props.services?.recoverGuided && button(say('Recover pending search', 'Recuperar búsqueda pendiente'), () => { void search(true); }, true, busy || gate !== 'ready')}
          {button(say('Back to my choices', 'Volver a mis opciones'), () => setStep('context'), true)}
        </> : <>
          <Text style={s.body}>{say("I don’t have verified meal options for this choice yet. I won’t fill the gap with random foods or made-up nutrition.", "Aún no tengo opciones verificadas para esta elección. No voy a sustituirlas por alimentos al azar ni nutrición inventada.")}</Text>
          <Text style={s.muted}>{draft.mode === 'eat_out' ? say("Try a specific restaurant. Its published menu and portions are needed before comparing an order.", "Prueba un restaurante concreto. Necesitamos su menú y porciones publicados para comparar un pedido.") : say("You can review a meal you already know, or log what you ate to give Coach more context.", "Puedes revisar una comida que ya conoces o registrar lo que comiste para dar más contexto al Coach.")}</Text>
          {button(say("Browse my saved meals", "Ver mis comidas guardadas"), () => router.push('/my-meals'), true)}
          {button(say("Review today’s diary", "Revisar el diario de hoy"), () => router.push('/(tabs)/(home)'), true)}
          {button(say("Adjust my choices", "Ajustar mis opciones"), () => setStep('context'), true)}
        </>}
      </>}
    </>}
    <Text style={s.footer}>{say("You stay in control. Reviewing never adds food to your diary.", "Tú decides. Revisar nunca añade alimentos a tu diario.")}</Text>
  </View>;
}
const s = StyleSheet.create({
  shell: { backgroundColor: '#F5F7F3', borderColor: '#E2E8E0', borderWidth: 1, borderRadius: 24, padding: 20, gap: 16, marginBottom: 20 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#27614D', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontSize: 22, fontWeight: '700' }, eyebrow: { color: '#536B5C', fontSize: 10, fontWeight: '700', letterSpacing: 1.6 }, coach: { color: '#18372A', fontWeight: '700', fontSize: 17 }, badge: { marginLeft: 'auto', paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#E3EADF', borderRadius: 20 }, badgeText: { fontSize: 9, letterSpacing: 1, color: '#315640', fontWeight: '700' },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '700', color: '#173A2B', letterSpacing: -0.6 }, body: { fontSize: 15, lineHeight: 23, color: '#354D40' }, muted: { fontSize: 13, lineHeight: 20, color: '#586A5E' }, small: { fontSize: 10, lineHeight: 15, color: '#536B5C', fontWeight: '700', letterSpacing: 0.8 }, context: { backgroundColor: '#EAF0E6', padding: 14, borderRadius: 14, gap: 6 },
  button: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#27614D' }, buttonText: { fontSize: 15, fontWeight: '600', color: '#FFF', textAlign: 'center' }, secondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D9E2D6' }, secondaryText: { color: '#27614D' }, navigation: { flexDirection: 'row', justifyContent: 'space-between' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, padding: 11, borderWidth: 1, borderColor: '#D2DECE', borderRadius: 12, backgroundColor: '#FFF' }, chosen: { backgroundColor: '#27614D', borderColor: '#27614D' }, chipText: { fontSize: 13, color: '#354D40' }, chosenText: { color: '#FFF' }, label: { fontSize: 14, lineHeight: 20, color: '#354D40', fontWeight: '600' }, input: { minHeight: 48, borderWidth: 1, borderColor: '#CFDBCB', borderRadius: 12, backgroundColor: '#FFF', padding: 14, color: '#173A2B', fontSize: 15 }, mode: { minHeight: 76, borderWidth: 1, borderColor: '#DBE4D7', borderRadius: 16, backgroundColor: '#FFF', padding: 16, gap: 4 }, modeTitle: { color: '#173A2B', fontSize: 17, lineHeight: 24, fontWeight: '600' }, option: { borderRadius: 18, backgroundColor: '#FFF', padding: 16, gap: 10, borderWidth: 1, borderColor: '#DCE5D8' }, macros: { color: '#27614D', fontSize: 14, fontWeight: '600' }, footer: { fontSize: 11, lineHeight: 17, color: '#647467', textAlign: 'center' },
});
