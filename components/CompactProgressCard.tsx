
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { supabase } from '@/lib/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import ProgressCard from '@/components/ProgressCard';

interface CompactProgressCardProps {
  userId: string;
  isDark: boolean;
}

interface CompactWeightData {
  startWeightLbs: number;
  goalWeightLbs: number;
  currentWeightLbs: number;
  hasGoal: boolean;
  hasCheckIns: boolean;
}

export default function CompactProgressCard({ userId, isDark }: CompactProgressCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompactWeightData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const barBg = isDark ? colors.borderDark : colors.border;
  const modalBg = isDark ? colors.backgroundDark : colors.background;

  const loadData = useCallback(async () => {
    try {
      console.log('[CompactProgressCard] Loading weight data for user:', userId);
      setLoading(true);

      const [{ data: userData }, { data: checkInData }] = await Promise.all([
        supabase
          .from('users')
          .select('current_weight, goal_weight')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('check_ins')
          .select('weight')
          .eq('user_id', userId)
          .not('weight', 'is', null)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const rawStart = parseFloat(String(userData?.current_weight || '0'));
      const rawGoal = parseFloat(String(userData?.goal_weight || '0'));

      if (!rawStart || isNaN(rawStart) || rawStart <= 0 || !rawGoal || isNaN(rawGoal) || rawGoal <= 0) {
        console.log('[CompactProgressCard] Missing or invalid weight data — start:', rawStart, 'goal:', rawGoal);
        setData({ startWeightLbs: 0, goalWeightLbs: 0, currentWeightLbs: 0, hasGoal: false, hasCheckIns: false });
        setLoading(false);
        return;
      }

      // DB stores weights in kg — convert to lbs for display
      const startWeightLbs = rawStart * 2.20462;
      const goalWeightLbs = rawGoal * 2.20462;

      const hasCheckIns = checkInData?.weight != null;
      const rawCurrent = hasCheckIns ? parseFloat(String(checkInData!.weight)) : rawStart;
      const currentWeightLbs = rawCurrent * 2.20462;

      console.log('[CompactProgressCard] start:', startWeightLbs.toFixed(1), 'goal:', goalWeightLbs.toFixed(1), 'current:', currentWeightLbs.toFixed(1));
      setData({ startWeightLbs, goalWeightLbs, currentWeightLbs, hasGoal: true, hasCheckIns });
    } catch (err) {
      console.error('[CompactProgressCard] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

  const handleCardPress = () => {
    if (!data?.hasGoal) return;
    console.log('[CompactProgressCard] Card tapped — opening detail modal');
    setModalVisible(true);
  };

  const handleModalClose = () => {
    console.log('[CompactProgressCard] Detail modal closed');
    setModalVisible(false);
  };

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: spacing.md }} />
      </View>
    );
  }

  if (!data) return null;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!data.hasGoal) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionLabel, { color: mutedColor }]}>WEIGHT PROGRESS</Text>
        </View>
        <Text style={[styles.emptyText, { color: mutedColor }]}>
          Set your weight goal in Profile to track progress.
        </Text>
      </View>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const { startWeightLbs, goalWeightLbs, currentWeightLbs } = data;
  const isLosingGoal = goalWeightLbs < startWeightLbs;

  let pctToGoal: number;
  let deltaLbs: number;
  let deltaLabel: string;

  if (isLosingGoal) {
    // Losing weight: progress = how much lost vs total to lose
    const totalToLose = startWeightLbs - goalWeightLbs;
    const lost = startWeightLbs - currentWeightLbs;
    deltaLbs = lost;
    pctToGoal = totalToLose > 0 ? Math.round((lost / totalToLose) * 100) : 0;
    const absDelta = Math.abs(deltaLbs).toFixed(1);
    deltaLabel = deltaLbs >= 0 ? `-${absDelta} lbs lost` : `+${absDelta} lbs gained`;
  } else {
    // Gaining weight: progress = how much gained vs total to gain
    const totalToGain = goalWeightLbs - startWeightLbs;
    const gained = currentWeightLbs - startWeightLbs;
    deltaLbs = gained;
    pctToGoal = totalToGain > 0 ? Math.round((gained / totalToGain) * 100) : 0;
    const absDelta = Math.abs(deltaLbs).toFixed(1);
    deltaLabel = deltaLbs >= 0 ? `+${absDelta} lbs gained` : `-${absDelta} lbs lost`;
  }

  const clampedPct = Math.min(100, Math.max(0, pctToGoal));
  const pctLabel = `${clampedPct}% there`;

  const currentStr = currentWeightLbs.toFixed(1);
  const goalStr = goalWeightLbs.toFixed(1);

  const barColor = clampedPct >= 75 ? colors.success : clampedPct >= 40 ? '#F59E0B' : colors.primary;

  const noCheckInsNote = !data.hasCheckIns ? ' · no check-ins yet' : '';

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleCardPress}
        style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.sectionLabel, { color: mutedColor }]}>WEIGHT PROGRESS</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={18}
            color={mutedColor}
          />
        </View>

        {/* Current → Goal */}
        <View style={styles.weightRow}>
          <Text style={[styles.weightNumber, { color: textColor }]}>{currentStr}</Text>
          <Text style={[styles.weightUnit, { color: mutedColor }]}> lbs</Text>
          <Text style={[styles.arrow, { color: mutedColor }]}> → </Text>
          <Text style={[styles.goalWeight, { color: mutedColor }]}>{goalStr} lbs goal</Text>
        </View>

        {/* Delta + pct */}
        <Text style={[styles.deltaText, { color: mutedColor }]}>
          {deltaLabel}
          <Text>  ·  </Text>
          {pctLabel}
          {noCheckInsNote}
        </Text>

        {/* Progress bar */}
        <View style={[styles.barTrack, { backgroundColor: barBg }]}>
          <View
            style={[
              styles.barFill,
              { width: `${clampedPct}%` as any, backgroundColor: barColor },
            ]}
          />
        </View>
      </TouchableOpacity>

      {/* Detail modal */}
      <Modal
        visible={modalVisible}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={handleModalClose}
      >
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: modalBg }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Weight Progress</Text>
            <TouchableOpacity onPress={handleModalClose} hitSlop={10}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={22}
                color={textColor}
              />
            </TouchableOpacity>
          </View>

          {/* Full component */}
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <ProgressCard userId={userId} isDark={isDark} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
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
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  weightNumber: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
  },
  weightUnit: {
    fontSize: 16,
    fontWeight: '500',
  },
  arrow: {
    fontSize: 18,
    fontWeight: '400',
  },
  goalWeight: {
    fontSize: 16,
    fontWeight: '500',
  },
  deltaText: {
    ...typography.small,
    marginBottom: spacing.sm,
  },
  barTrack: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  // Modal
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScrollContent: {
    padding: spacing.md,
  },
});
