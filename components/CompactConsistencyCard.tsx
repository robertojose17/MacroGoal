
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
import { toLocalDateString } from '@/utils/dateUtils';
import { IconSymbol } from '@/components/IconSymbol';
import ConsistencyScore from '@/components/ConsistencyScore';
import {
  calcDailyScore,
  getLabel,
  getLabelColor,
  type ScoreLabel,
} from '@/utils/consistencyMath';

interface CompactConsistencyCardProps {
  userId: string;
  isDark: boolean;
}

interface CompactData {
  score: number;
  label: ScoreLabel;
  trackedDays: number;
  totalDays: number;
}

export default function CompactConsistencyCard({ userId, isDark }: CompactConsistencyCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompactData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const barBg = isDark ? colors.borderDark : colors.border;
  const modalBg = isDark ? colors.backgroundDark : colors.background;

  const loadData = useCallback(async () => {
    try {
      console.log('[CompactConsistencyCard] Loading data for user:', userId);
      setLoading(true);

      const [{ data: userData }, { data: goalData }] = await Promise.all([
        supabase.from('users').select('created_at').eq('id', userId).maybeSingle(),
        supabase
          .from('goals')
          .select('start_date, daily_calories, protein_g')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      let startDate: string;
      if (goalData?.start_date) {
        startDate = goalData.start_date;
      } else if (userData?.created_at) {
        startDate = userData.created_at.split('T')[0];
      } else {
        startDate = toLocalDateString();
      }

      const today = toLocalDateString();
      const calorieTarget = goalData?.daily_calories || 2000;
      const proteinTarget = goalData?.protein_g || 150;

      const { data: allMeals } = await supabase
        .from('meals')
        .select('id, date, meal_items(id, calories, protein)')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', today)
        .order('date', { ascending: true });

      const dailyData: Record<string, { calories: number; protein: number; hasMeals: boolean }> = {};
      for (const meal of allMeals ?? []) {
        if (!dailyData[meal.date]) {
          dailyData[meal.date] = { calories: 0, protein: 0, hasMeals: false };
        }
        for (const item of (meal.meal_items ?? []) as { calories?: number; protein?: number }[]) {
          const cal = parseFloat(String(item.calories || '0'));
          const prot = parseFloat(String(item.protein || '0'));
          if (cal > 0 || prot > 0) dailyData[meal.date].hasMeals = true;
          dailyData[meal.date].calories += cal;
          dailyData[meal.date].protein += prot;
        }
      }

      const allDates: string[] = [];
      const cur = new Date(startDate + 'T00:00:00');
      const end = new Date(today + 'T00:00:00');
      while (cur <= end) {
        allDates.push(toLocalDateString(cur));
        cur.setDate(cur.getDate() + 1);
      }

      const totalDays = allDates.length;
      let trackedDays = 0;
      let sumDailyScore = 0;

      for (const date of allDates) {
        const day = dailyData[date];
        const hasTracking = day?.hasMeals ?? false;
        if (hasTracking) trackedDays++;
        sumDailyScore += calcDailyScore(
          hasTracking,
          day?.calories ?? 0,
          calorieTarget,
          day?.protein ?? 0,
          proteinTarget,
        );
      }

      const score = totalDays > 0 ? Math.round(sumDailyScore / totalDays) : 0;
      const label = getLabel(score);

      console.log('[CompactConsistencyCard] Score:', score, 'Label:', label, 'Tracked:', trackedDays, '/', totalDays);
      setData({ score, label, trackedDays, totalDays });
    } catch (err) {
      console.error('[CompactConsistencyCard] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

  const handleCardPress = () => {
    console.log('[CompactConsistencyCard] Card tapped — opening detail modal');
    setModalVisible(true);
  };

  const handleModalClose = () => {
    console.log('[CompactConsistencyCard] Detail modal closed');
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

  const labelColor = getLabelColor(data.label);
  const fillPct = Math.min(100, Math.max(0, data.score));
  const trackedText = `${data.trackedDays} of ${data.totalDays} days tracked`;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleCardPress}
        style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.sectionLabel, { color: mutedColor }]}>CONSISTENCY SCORE</Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={18}
            color={mutedColor}
          />
        </View>

        {/* Score + label badge */}
        <View style={styles.scoreRow}>
          <Text style={[styles.scoreNumber, { color: colors.primary }]}>{data.score}</Text>
          <View style={[styles.labelBadge, { backgroundColor: labelColor + '20' }]}>
            <View style={[styles.labelDot, { backgroundColor: labelColor }]} />
            <Text style={[styles.labelText, { color: labelColor }]}>{data.label}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.barTrack, { backgroundColor: barBg }]}>
          <View
            style={[
              styles.barFill,
              { width: `${fillPct}%` as any, backgroundColor: labelColor },
            ]}
          />
        </View>

        {/* Subtitle */}
        <Text style={[styles.subtitle, { color: mutedColor }]}>{trackedText}</Text>
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
            <Text style={[styles.modalTitle, { color: textColor }]}>Consistency Score</Text>
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
            <ConsistencyScore userId={userId} isDark={isDark} />
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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  scoreNumber: {
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 44,
  },
  labelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  labelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  barTrack: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  subtitle: {
    ...typography.small,
    marginTop: 2,
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
