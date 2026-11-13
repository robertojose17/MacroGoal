import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProgressIntelligence, ProgressState } from '@/hooks/useProgressIntelligence';

interface ProgressCardProps { userId: string; isDark: boolean; layout?: 'carousel' | 'stacked' }
interface WeightProgressMiniChartProps { userId: string; isDark: boolean; height?: number }
export function ObservedWeightSummary({ state, isDark }: { state: ProgressState | null; isDark: boolean }) {
  const { i18n } = useTranslation();
  const spanish = i18n.language.startsWith('es');
  const color = isDark ? '#FFFFFF' : '#202124';
  const weights = state?.journeyProgress;
  const values = [weights?.startWeightLbs, weights?.currentWeightLbs, weights?.goalWeightLbs];
  const labels = spanish ? ['Inicial', 'Actual', 'Objetivo'] : ['Start', 'Current', 'Goal'];
  return <View style={styles.row}>{labels.map((label, index) => {
    const value = values[index];
    return <View key={label}><Text style={{ color }}>{label}</Text><Text style={[styles.value, { color }]}>{value == null ? '--' : `${value.toFixed(1)} lb`}</Text></View>;
  })}</View>;
}
export default function ProgressCard({ userId, isDark }: ProgressCardProps) {
  const { state, loading, error, refresh } = useProgressIntelligence(userId);
  const { i18n } = useTranslation();
  const spanish = i18n.language.startsWith('es');
  const color = isDark ? '#FFFFFF' : '#202124';
  return <View style={[styles.card, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
    <Text style={[styles.title, { color }]}>{spanish ? 'Progreso observado' : 'Observed progress'}</Text>
    {loading ? <ActivityIndicator /> : <ObservedWeightSummary state={state} isDark={isDark} />}
    <Text style={{ color }}>{state ? (spanish ? 'Datos registrados. Sin proyección ni recomendaciones automáticas.' : 'Recorded data. No projection or automatic recommendations.') : (spanish ? 'Datos verificados no disponibles.' : 'Verified data unavailable.')}</Text>
    {error && <TouchableOpacity onPress={() => { void refresh(); }}><Text style={styles.link}>{spanish ? 'Actualizar' : 'Refresh'}</Text></TouchableOpacity>}
  </View>;
}
/** No simulated trajectory: show only the verified observed journey weights. */
export function WeightProgressMiniChart({ userId, isDark, height = 120 }: WeightProgressMiniChartProps) {
  const { state } = useProgressIntelligence(userId);
  return <View style={{ minHeight: height, justifyContent: 'center' }}><ObservedWeightSummary state={state} isDark={isDark} /></View>;
}
const styles = StyleSheet.create({ card: { borderRadius: 16, padding: 16, gap: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, title: { fontSize: 18, fontWeight: '700' }, value: { fontSize: 18, fontWeight: '600' }, link: { color: '#357A87', paddingVertical: 8 } });
