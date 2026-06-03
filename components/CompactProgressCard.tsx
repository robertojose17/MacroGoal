
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { supabase } from '@/lib/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';

interface Props {
  userId: string;
  isDark: boolean;
}

interface CompactData {
  currentWeightLbs: number;
  goalWeightLbs: number;
  startWeightLbs: number;
  latestCheckInLbs: number | null;
}

function getBarColor(pct: number): string {
  if (pct >= 75) return '#22c55e';
  if (pct >= 40) return '#f59e0b';
  return colors.primary;
}

export default function CompactProgressCard({ userId, isDark }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompactData | null>(null);
  const [noGoal, setNoGoal] = useState(false);

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const barBg = isDark ? colors.borderDark : colors.border;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setNoGoal(false);

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('current_weight, goal_weight, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (userError) {
        console.error('[CompactProgressCard] Error loading user data:', userError);
        setNoGoal(true);
        return;
      }

      const rawGoalWeight = userData?.goal_weight;
      const rawStartWeight = userData?.current_weight;
      const parsedGoalWeight = parseFloat(String(rawGoalWeight || '0'));
      const parsedStartWeight = parseFloat(String(rawStartWeight || '0'));

      if (!rawGoalWeight || isNaN(parsedGoalWeight) || parsedGoalWeight <= 0) {
        console.log('[CompactProgressCard] No goal weight set');
        setNoGoal(true);
        return;
      }

      if (!rawStartWeight || isNaN(parsedStartWeight) || parsedStartWeight <= 0) {
        console.log('[CompactProgressCard] No start weight set');
        setNoGoal(true);
        return;
      }

      // DB stores kg — convert to lbs for display
      const startWeightLbs = parsedStartWeight * 2.20462;
      const goalWeightLbs = parsedGoalWeight * 2.20462;

      // Get latest check-in weight
      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('date, weight')
        .eq('user_id', userId)
        .not('weight', 'is', null)
        .order('date', { ascending: false })
        .limit(1);

      const latestCheckInLbs = checkIns && checkIns.length > 0
        ? checkIns[0].weight * 2.20462
        : null;

      setData({
        currentWeightLbs: latestCheckInLbs ?? startWeightLbs,
        goalWeightLbs,
        startWeightLbs,
        latestCheckInLbs,
      });
    } catch (err) {
      console.error('[CompactProgressCard] Error:', err);
      setNoGoal(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

  const handlePress = () => {
    console.log('[CompactProgressCard] Tapped — navigating to /progress-detail');
    router.push('/progress-detail');
  };

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: spacing.md }} />
      </View>
    );
  }

  if (noGoal || !data) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.sectionLabel, { color: mutedColor }]}>WEIGHT PROGRESS</Text>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={18} color={mutedColor} />
        </View>
        <Text style={[styles.emptyText, { color: mutedColor }]}>
          Set a weight goal to track progress
        </Text>
      </TouchableOpacity>
    );
  }

  const { currentWeightLbs, goalWeightLbs, startWeightLbs } = data;

  // How much total change is needed
  const totalChange = Math.abs(goalWeightLbs - startWeightLbs);
  // How much has been achieved
  const achieved = startWeightLbs - currentWeightLbs; // positive = lost weight
  const isLossGoal = goalWeightLbs < startWeightLbs;

  // Percent toward goal (clamped 0–100)
  let rawPct = 0;
  if (totalChange > 0.01) {
    rawPct = isLossGoal
      ? (achieved / totalChange) * 100
      : ((currentWeightLbs - startWeightLbs) / totalChange) * 100;
  }
  const fillPct = Math.min(100, Math.max(0, rawPct));
  const barColor = getBarColor(fillPct);

  const currentStr = currentWeightLbs.toFixed(1);
  const goalStr = goalWeightLbs.toFixed(1);
  const deltaAbs = Math.abs(achieved).toFixed(1);
  const pctStr = Math.round(fillPct).toString();

  const directionLabel = isLossGoal
    ? (achieved >= 0 ? `${deltaAbs} lbs lost` : `${deltaAbs} lbs gained`)
    : (achieved <= 0 ? `${deltaAbs} lbs gained` : `${deltaAbs} lbs lost`);

  const subtitleText = `${directionLabel} · ${pctStr}% there`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.sectionLabel, { color: mutedColor }]}>WEIGHT PROGRESS</Text>
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={18} color={mutedColor} />
      </View>
      <View style={styles.weightRow}>
        <Text style={[styles.weightNumber, { color: colors.primary }]} numberOfLines={1}>{currentStr}</Text>
        <Text style={[styles.weightArrow, { color: mutedColor }]} numberOfLines={1}>{' → '}</Text>
        <Text style={[styles.weightGoal, { color: isDark ? colors.textDark : colors.text }]} numberOfLines={1}>{goalStr}</Text>
        <Text style={[styles.weightUnit, { color: mutedColor }]} numberOfLines={1}>{' lbs'}</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: barBg }]}>
        <View style={[styles.barFill, { width: `${fillPct}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.subtitle, { color: mutedColor }]}>{subtitleText}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 4,
  } as any,
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  weightRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.sm, flexWrap: 'nowrap', flexShrink: 1 },
  weightNumber: { fontSize: 24, fontWeight: '700', lineHeight: 28, flexShrink: 1 },
  weightArrow: { fontSize: 14, fontWeight: '400', flexShrink: 1 },
  weightGoal: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
  weightUnit: { fontSize: 11, fontWeight: '400', marginBottom: 2, flexShrink: 1 },
  barTrack: { height: 6, borderRadius: borderRadius.full, overflow: 'hidden', marginBottom: spacing.xs },
  barFill: { height: '100%', borderRadius: borderRadius.full },
  subtitle: { ...typography.small, marginTop: 2 },
  emptyText: { ...typography.body, textAlign: 'center', paddingVertical: spacing.md },
});
