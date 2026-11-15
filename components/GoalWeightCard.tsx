import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useDynamicTdee } from '@/hooks/useDynamicTdee';
import { useProgressIntelligence } from '@/hooks/useProgressIntelligence';
import { observationStatus, observationStatusText } from '@/utils/tdeePresentation';
import { ObservedWeightSummary } from './ProgressCard';

interface GoalWeightCardProps {
  userId: string; isDark: boolean;
  currentWeightKg?: number | null; goalWeightKg?: number | null; startWeightKg?: number | null;
}
/** Props from older screens are not substituted for an authenticated observation. */
export default function GoalWeightCard({ userId, isDark }: GoalWeightCardProps) {
  const { state, loading } = useProgressIntelligence(userId);
  const { estimate, program, loading:burnLoading, error:burnError } = useDynamicTdee(userId);
  const { i18n } = useTranslation();
  const router = useRouter();
  const spanish = i18n.language.startsWith('es');
  const color = isDark ? '#FFFFFF' : '#202124';
  const status = observationStatus(program,burnLoading,burnError);
  const burn = status === 'estimated' && estimate?.status === 'estimated' ? estimate.kcalPerDay : null;
  return <View style={[styles.card, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
    <Text style={[styles.title, { color }]}>{spanish ? 'Peso y actividad observada' : 'Weight and observed activity'}</Text>
    {loading ? <ActivityIndicator /> : <ObservedWeightSummary state={state} isDark={isDark} />}
    <View><Text style={{ color }}>Daily Burn</Text><Text style={[styles.title, { color }]}>{burn === null ? '--' : `${Math.round(burn)} kcal/${spanish ? 'día' : 'day'}`}</Text>
      <Text accessibilityRole="text" style={{ color }}>{observationStatusText(status,spanish)}</Text>
      {burn !== null && estimate?.coverage && <>
        {estimate.weightTrendKgPerWeek !== null && Number.isFinite(estimate.weightTrendKgPerWeek) && <Text style={{ color }}>{spanish ? 'Ritmo observado estimado' : 'Estimated observed rate'}: {estimate.weightTrendKgPerWeek.toFixed(2)} kg/{spanish ? 'semana' : 'week'}</Text>}
        <Text style={{ color }}>{spanish ? 'Datos hasta' : 'Data through'}: {estimate.asOf}</Text>
        <Text style={{ color }}>{spanish ? 'Período' : 'Period'}: {estimate.coverage.start} → {estimate.coverage.end} ({spanish ? 'el último día solo aporta peso' : 'last day contributes weight only'}). {estimate.coverage.loggedDays} {spanish ? 'días con ingesta registrada y' : 'logged intake days and'} {estimate.coverage.weightDays} {spanish ? 'días con peso.' : 'weight days.'}</Text>
        <Text style={{ color }}>{spanish ? 'Sensibilidad del modelo' : 'Model sensitivity'}: {estimate.coverage.sensitivityKcal.low}–{estimate.coverage.sensitivityKcal.high} kcal/{spanish ? 'día' : 'day'}. {spanish ? 'No es un intervalo de confianza ni una medición metabólica.' : 'Not a confidence interval or metabolic measurement.'}</Text>
      </>}
    </View>
    <TouchableOpacity onPress={() => router.push('/check-in-form')}><Text style={styles.link}>{spanish ? 'Registrar peso' : 'Log weight'}</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({ card: { borderRadius: 16, padding: 16, gap: 14 }, title: { fontSize: 18, fontWeight: '700' }, link: { color: '#357A87', paddingVertical: 8 } });

