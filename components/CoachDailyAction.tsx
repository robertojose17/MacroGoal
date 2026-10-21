import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase/client';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors } from '@/styles/commonStyles';
import { toLocalDateString } from '@/utils/dateUtils';
import { dailyAccess, DAILY_MEAL_SLOTS, type DailyAccess, type DailyMealSlot, type DailySnapshot } from '@/utils/coachDailyAction';
import { recheckSavedMealReview, type DailyActionServices, type MealRecommendations } from '@/utils/coachManualHandoff';

export default function CoachDailyAction(access: DailyAccess & { services?: DailyActionServices }) {
  const { i18n } = useTranslation();
  const es = i18n.language.toLowerCase().startsWith('es');
  const router = useRouter();
  // Current main's hook returns a literal light theme; keep this component theme-compatible.
  const scheme: string = useColorScheme();
  const dark = scheme === 'dark';
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const [date, setDate] = useState(toLocalDateString());
  const [meal, setMeal] = useState<DailyMealSlot>('lunch');
  const [opening, setOpening] = useState(false);
  const [recommendations, setRecommendations] = useState<MealRecommendations | null>(null);
  const generation = useRef(0);
  const openingRef = useRef(false);
  const currentAccess = useRef(access);
  currentAccess.current = access;
  const gate = dailyAccess(access);
  const text = { color: dark ? colors.textDark : colors.text };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      generation.current++;
      setSnapshot(null);
      setRecommendations(null);
      setRevision(value => value + 1);
    });
    return () => subscription.unsubscribe();
  }, []);

  useFocusEffect(useCallback(() => {
    const id = ++generation.current;
    const today = toLocalDateString();
    setDate(today);
    setSnapshot(null);
    setRecommendations(null);
    void (access.services?.load(currentAccess.current, today) ?? Promise.resolve<DailySnapshot>({ kind: 'unavailable' })).then(result => {
      if (generation.current === id) setSnapshot(result);
    });
    const timer = setInterval(() => setDate(toLocalDateString()), 60000);
    return () => { generation.current++; clearInterval(timer); };
  }, [gate, revision, date, access.services]));

  async function chooseMeal(recover = false) {
    if (openingRef.current || snapshot?.kind !== 'ready' || dailyAccess(currentAccess.current) !== 'ready') return;
    openingRef.current = true;
    setOpening(true);
    const id = generation.current;
    try {
      const today = toLocalDateString();
      if (!access.services || snapshot.date !== today) { setRevision(value => value + 1); return; }
      const service = recover ? access.services.recovery : access.services;
      if (!service) return;
      const fresh = await service.recommend(currentAccess.current, today, meal);
      if (generation.current !== id) return;
      if (toLocalDateString() !== today) { setRecommendations(null); setRevision(value => value + 1); return; }
      setRecommendations(fresh.kind === 'ready' && fresh.owner !== snapshot.owner ? { kind: 'blocked' } : fresh);
    } finally { openingRef.current = false; setOpening(false); }
  }

  async function recoverSummary() {
    if (openingRef.current || !access.services?.recovery || dailyAccess(currentAccess.current) !== 'ready') return;
    openingRef.current = true; setOpening(true);
    const id = generation.current, today = toLocalDateString();
    try {
      const result = await access.services.recovery.load(currentAccess.current, today);
      if (generation.current === id && toLocalDateString() === today) setSnapshot(result);
    } finally { openingRef.current = false; setOpening(false); }
  }

  async function reviewMeal(mealId: string) {
    if (openingRef.current || !recommendations || !access.services) return;
    openingRef.current = true; setOpening(true);
    const id = generation.current;
    try {
      const today = toLocalDateString();
      if (recommendations.kind !== 'ready' || recommendations.date !== today) { setRevision(value => value + 1); return; }
      // Fresh admitted recommendation checks gates/eligibility again; it never registers a proposal.
      const fresh = await access.services.recommend(currentAccess.current, today, meal);
      const route = await recheckSavedMealReview(fresh, mealId, meal, recommendations.owner, {
        owner: async () => { const auth = await supabase.auth.getUser(); return auth.error ? undefined : auth.data.user?.id; },
        today: toLocalDateString,
        access: () => currentAccess.current,
        isCurrent: () => generation.current === id,
      });
      if (generation.current !== id) return;
      if (toLocalDateString() !== today) { setRecommendations(null); setRevision(value => value + 1); return; }
      setRecommendations(fresh);
      if (route && dailyAccess(currentAccess.current) === 'ready') router.push(route);
    } finally { openingRef.current = false; setOpening(false); }
  }

  const button = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={{ padding: 12, borderRadius: 12, backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  );

  if (gate === 'blocked') return null;
  return <View style={{ marginBottom: 16, padding: 16, gap: 12, borderRadius: 16, backgroundColor: dark ? colors.cardDark : colors.card }}>
    <Text accessibilityRole="header" style={[text, { fontSize: 19, fontWeight: '700' }]}>{es ? 'Tu siguiente comida' : 'Your next meal'}</Text>
    {gate === 'locked' ? <>
      <Text style={text}>{es ? 'Convierte tus registros de hoy en un siguiente paso con Coach Premium.' : 'Turn today’s food logs into a next step with Coach Premium.'}</Text>
      {button(es ? 'Ver Premium' : 'Explore Premium', () => router.push('/subscription'))}
    </> : !snapshot ? <ActivityIndicator accessibilityLabel={es ? 'Cargando resumen' : 'Loading summary'} /> : snapshot.kind === 'permission' ? <>
      <Text style={text}>{es ? 'Revisa los permisos del Coach para usar esta acción. Tú eliges qué permitir.' : 'Review Coach permissions to use this action. You choose what to allow.'}</Text>
      {button(es ? 'Revisar permisos' : 'Review permissions', () => router.push('/coach-permissions'))}
    </> : snapshot.kind !== 'ready' ? <>
      <Text style={text}>{es ? 'No pudimos verificar tus datos. No se ha cambiado tu diario.' : 'We couldn’t verify your data. Your diary has not changed.'}</Text>
      {button(es ? 'Reintentar' : 'Try again', () => setRevision(value => value + 1), opening)}
      {access.services?.recovery && button(es ? 'Recuperar solicitud pendiente' : 'Recover pending request', () => { void recoverSummary(); }, opening)}
    </> : <>
      <Text style={text}>{es ? 'Hoy' : 'Today'} · {snapshot.date}</Text>
      {snapshot.summary.kind === 'empty' ? <Text style={text}>{es ? 'Todavía no hay alimentos registrados hoy. Elige una comida guardada, revisa la porción y registra lo que comiste.' : 'No food logged today yet. Choose a saved meal, review the portion, and log what you ate.'}</Text>
        : snapshot.summary.kind === 'incomplete' ? <Text style={text}>{es ? 'Faltan datos de nutrición en tus registros. Revisa el diario antes de comparar con tu objetivo.' : 'Some logged nutrition is missing. Review your diary before comparing with your goal.'}</Text>
        : <>
          <Text style={[text, { fontSize: 17, fontWeight: '600' }]}>{Math.round(snapshot.summary.totals.calories)} kcal · {Math.round(snapshot.summary.totals.protein)} g {es ? 'proteína' : 'protein'}</Text>
          <Text style={text}>{Math.round(snapshot.summary.totals.carbs)} g {es ? 'carbohidratos' : 'carbs'} · {Math.round(snapshot.summary.totals.fats)} g {es ? 'grasas' : 'fat'}</Text>
          <Text style={text}>{snapshot.summary.goal
            ? `${es ? 'Objetivo' : 'Goal'}: ${Math.round(snapshot.summary.goal.calories)} kcal · ${Math.round(snapshot.summary.goal.protein)} g ${es ? 'proteína' : 'protein'}`
            : es ? 'No hay un objetivo completo para comparar. Puedes revisarlo en tus objetivos.' : 'No complete goal is available for comparison. You can review it in your goals.'}</Text>
          {snapshot.summary.goal && snapshot.summary.totals.protein < snapshot.summary.goal.protein && <Text style={text}>
            {Math.round(snapshot.summary.goal.protein - snapshot.summary.totals.protein)} g {es ? 'de proteína hasta tu objetivo, según lo registrado.' : 'protein to your goal, based on your logs.'}
          </Text>}
          {snapshot.summary.goal && <Text style={text}>{snapshot.summary.totals.protein < snapshot.summary.goal.protein
            ? (es ? 'Para tu próxima comida, compara opciones con proteína y elige una porción que se ajuste a tu apetito.' : 'For your next meal, compare protein options and choose a portion that fits your appetite.')
            : (es ? 'Ya registraste tu objetivo de proteína. Elige tu próxima comida según tu apetito y revisa la porción.' : 'You’ve logged your protein goal. Choose your next meal based on your appetite and review the portion.')}</Text>}
        </>}
      <Text style={text}>{es ? 'Solo cuenta lo registrado; no presupone que tu día esté completo.' : 'Based only on logged foods; this does not assume your day is complete.'}</Text>
      {snapshot.summary.kind === 'incomplete' && button(es ? 'Revisar diario' : 'Review diary', () => router.push('/(tabs)/(home)'))}
      {snapshot.summary.kind === 'logged' && !snapshot.summary.goal && button(es ? 'Revisar objetivos' : 'Review goals', () => router.push('/edit-goals'))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DAILY_MEAL_SLOTS.map((slot, index) => <TouchableOpacity key={slot} disabled={opening} accessibilityRole="radio" accessibilityState={{ checked: meal === slot }} onPress={() => { setMeal(slot); setRecommendations(null); }}
          style={{ padding: 10, borderRadius: 10, borderWidth: meal === slot ? 2 : 1, borderColor: colors.primary }}>
          <Text style={text}>{(es ? ['Desayuno', 'Almuerzo', 'Cena', 'Snack'] : ['Breakfast', 'Lunch', 'Dinner', 'Snack'])[index]}</Text>
        </TouchableOpacity>)}
      </View>
      {button(es ? 'Ver comidas guardadas' : 'See saved meal options', () => { void chooseMeal(); }, opening)}
      {recommendations && recommendations.kind !== 'ready' && access.services?.recovery && button(es ? 'Recuperar opciones pendientes' : 'Recover pending options', () => { void chooseMeal(true); }, opening)}
      {recommendations && (recommendations.kind !== 'ready' ? <Text style={text}>{es ? 'No pudimos verificar las opciones. No se añadió nada.' : 'We couldn’t verify meal options. Nothing was added.'}</Text>
        : recommendations.options.length === 0 ? <Text style={text}>{es ? 'No hay comidas guardadas elegibles disponibles.' : 'No eligible saved meals are available.'}</Text>
        : recommendations.options.map(option => <View key={option.id} style={{ gap: 8, paddingVertical: 8 }}>
          <Text style={[text, { fontWeight: '600' }]}>{option.name}</Text>
          <Text style={text}>{es ? '1 comida guardada' : '1 saved meal'} · {Math.round(option.calories)} kcal · P {Math.round(option.protein)} g · C {Math.round(option.carbs)} g · {es ? 'G' : 'F'} {Math.round(option.fats)} g</Text>
          <Text style={text}>{es ? 'Resumen orientativo. Al abrir, revisarás los datos actuales antes de añadir.' : 'Advisory snapshot. Opening reloads current details for your review before Add.'}</Text>
          {button(es ? 'Revisar comida guardada' : 'Review saved meal', () => { void reviewMeal(option.id); }, opening)}
        </View>))}
      <Text style={text}>{es ? 'Verás la porción y los nutrientes antes de confirmar que se añada al diario.' : 'You’ll see the portion and nutrition before confirming the diary addition.'}</Text>
    </>}
  </View>;
}
