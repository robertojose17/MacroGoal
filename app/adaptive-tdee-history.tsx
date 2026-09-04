
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { useTranslation } from 'react-i18next';

interface TdeeEstimate {
  id: string;
  user_id: string;
  week_start: string;
  avg_calories_eaten: number | null;
  avg_weight_lbs: number | null;
  prev_avg_weight_lbs: number | null;
  ema_calories: number | null;
  ema_weight: number | null;
  estimated_tdee: number | null;
  prescribed_calories: number | null;
  adjustment_amount: number | null;
  data_days_count: number | null;
  adjustment_applied: boolean | null;
  skip_reason: string | null;
  created_at: string;
}

interface GoalData {
  daily_calories: number | null;
  base_daily_calories: number | null;
  last_adaptive_update: string | null;
}

function formatWeekDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getSkipReasonLabel(skipReason: string | null, t: (key: string, opts?: any) => string): string {
  if (!skipReason) return '';
  if (skipReason.startsWith('insufficient_data')) {
    const match = skipReason.match(/insufficient_data_(\d+)_days/);
    const days = match ? match[1] : '?';
    return t('adaptiveTdee.notEnoughData', { days, total: 7 });
  }
  if (skipReason.startsWith('calibrating')) {
    const match = skipReason.match(/calibrating_week_(\d+)/);
    const week = match ? match[1] : '?';
    return t('adaptiveTdee.calibrating', { week, total: 2 });
  }
  if (skipReason === 'no_weight_data') return t('adaptiveTdee.noWeightData');
  if (skipReason === 'change_too_small') return t('adaptiveTdee.onTrack');
  if (skipReason === 'gap_reset_needed') return t('adaptiveTdee.gapReset');
  return skipReason;
}

export default function AdaptiveTdeeHistoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const [estimates, setEstimates] = useState<TdeeEstimate[]>([]);
  const [goal, setGoal] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[AdaptiveTdeeHistory] Loading data for user:', user.id);

      const [estimatesResult, goalResult] = await Promise.all([
        supabase
          .from('tdee_estimates')
          .select('*')
          .eq('user_id', user.id)
          .order('week_start', { ascending: false })
          .limit(12),
        supabase
          .from('goals')
          .select('daily_calories, base_daily_calories, last_adaptive_update')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (estimatesResult.error) {
        console.error('[AdaptiveTdeeHistory] Error loading estimates:', estimatesResult.error);
      } else {
        console.log('[AdaptiveTdeeHistory] Estimates loaded:', estimatesResult.data?.length ?? 0);
        setEstimates(estimatesResult.data ?? []);
      }

      if (goalResult.error) {
        console.error('[AdaptiveTdeeHistory] Error loading goal:', goalResult.error);
      } else {
        setGoal(goalResult.data);
      }
    } catch (err) {
      console.error('[AdaptiveTdeeHistory] Unexpected error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      console.log('[AdaptiveTdeeHistory] Screen focused');
      setLoading(true);
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  const latestEstimate = estimates[0] ?? null;
  const appliedCount = estimates.filter(e => e.adjustment_applied).length;

  const calibrationStatus = (() => {
    if (estimates.length === 0) return t('adaptiveTdee.statusCollecting');
    if (appliedCount === 0) return t('adaptiveTdee.statusCalibrating');
    return t('adaptiveTdee.statusActive');
  })();

  const statusColor = (() => {
    if (estimates.length === 0) return colors.textSecondary;
    if (appliedCount === 0) return colors.warning;
    return colors.success;
  })();

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              console.log('[AdaptiveTdeeHistory] Back button pressed');
              router.back();
            }}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={20} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>{t('adaptiveTdee.title')}</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            console.log('[AdaptiveTdeeHistory] Back button pressed');
            router.back();
          }}
          activeOpacity={0.7}
        >
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>{t('adaptiveTdee.title')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: cardBg }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: secondaryColor }]}>
                {t('adaptiveTdee.estimatedTdee')}
              </Text>
              <Text style={[styles.summaryValue, { color: textColor }]}>
                {latestEstimate?.estimated_tdee ? Math.round(Number(latestEstimate.estimated_tdee)) : '—'}
              </Text>
              <Text style={[styles.summaryUnit, { color: secondaryColor }]}>kcal</Text>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: borderColor }]} />

            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: secondaryColor }]}>
                {t('adaptiveTdee.currentGoal')}
              </Text>
              <Text style={[styles.summaryValue, { color: textColor }]}>
                {goal?.daily_calories ? Math.round(Number(goal.daily_calories)) : '—'}
              </Text>
              <Text style={[styles.summaryUnit, { color: secondaryColor }]}>kcal</Text>
            </View>
          </View>

          <View style={[styles.statusRow, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {calibrationStatus}
            </Text>
          </View>
        </View>

        {/* History Feed */}
        <Text style={[styles.sectionTitle, { color: secondaryColor }]}>
          {t('adaptiveTdee.weeklyHistory')}
        </Text>

        {estimates.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBg }]}>
            <Text style={styles.emptyIcon}>{'📊'}</Text>
            <Text style={[styles.emptyTitle, { color: textColor }]}>
              {t('adaptiveTdee.emptyTitle')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: secondaryColor }]}>
              {t('adaptiveTdee.emptySubtitle')}
            </Text>
          </View>
        ) : (
          estimates.map((estimate, index) => {
            const weekLabel = formatWeekDate(estimate.week_start);
            const isLast = index === estimates.length - 1;
            const daysCount = estimate.data_days_count ?? 0;
            const daysLabel = `${daysCount}/7 ${t('adaptiveTdee.daysLogged')}`;

            const adjustmentAmountNum = estimate.adjustment_amount ? Number(estimate.adjustment_amount) : 0;
            const adjustmentSign = adjustmentAmountNum >= 0 ? '+' : '';
            const adjustmentLabel = `${adjustmentSign}${Math.round(adjustmentAmountNum)} kcal`;

            const prescribedCalories = estimate.prescribed_calories ? Math.round(Number(estimate.prescribed_calories)) : null;
            const prevCalories = prescribedCalories && adjustmentAmountNum
              ? prescribedCalories - Math.round(adjustmentAmountNum)
              : null;

            const skipLabel = getSkipReasonLabel(estimate.skip_reason, t);

            return (
              <View
                key={estimate.id}
                style={[
                  styles.historyCard,
                  { backgroundColor: cardBg },
                  !isLast && { marginBottom: spacing.sm },
                ]}
              >
                {/* Week header */}
                <View style={styles.historyCardHeader}>
                  <View style={styles.historyWeekRow}>
                    <IconSymbol
                      ios_icon_name="calendar"
                      android_material_icon_name="calendar-today"
                      size={14}
                      color={secondaryColor}
                    />
                    <Text style={[styles.historyWeekLabel, { color: secondaryColor }]}>
                      {t('adaptiveTdee.weekOf')}
                    </Text>
                    <Text style={[styles.historyWeekDate, { color: textColor }]}>
                      {weekLabel}
                    </Text>
                  </View>
                  <View style={[styles.daysChip, { backgroundColor: daysCount >= 5 ? colors.success + '20' : colors.warning + '20' }]}>
                    <Text style={[styles.daysChipText, { color: daysCount >= 5 ? colors.success : colors.warning }]}>
                      {daysLabel}
                    </Text>
                  </View>
                </View>

                <View style={[styles.historyDivider, { backgroundColor: borderColor }]} />

                {/* Content */}
                {estimate.adjustment_applied ? (
                  <View style={styles.adjustmentRow}>
                    <View style={styles.caloriesArrowRow}>
                      {prevCalories !== null && (
                        <>
                          <Text style={[styles.caloriesOld, { color: secondaryColor }]}>
                            {prevCalories}
                          </Text>
                          <IconSymbol
                            ios_icon_name="arrow.right"
                            android_material_icon_name="arrow-forward"
                            size={14}
                            color={secondaryColor}
                          />
                        </>
                      )}
                      {prescribedCalories !== null && (
                        <Text style={[styles.caloriesNew, { color: textColor }]}>
                          {prescribedCalories}
                        </Text>
                      )}
                      <Text style={[styles.caloriesUnit, { color: secondaryColor }]}>kcal</Text>
                    </View>
                    <View style={[
                      styles.adjustmentBadge,
                      { backgroundColor: adjustmentAmountNum < 0 ? colors.success + '20' : colors.warning + '20' },
                    ]}>
                      <Text style={[
                        styles.adjustmentBadgeText,
                        { color: adjustmentAmountNum < 0 ? colors.success : colors.warning },
                      ]}>
                        {adjustmentLabel}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.skipRow}>
                    <IconSymbol
                      ios_icon_name="info.circle"
                      android_material_icon_name="info"
                      size={14}
                      color={secondaryColor}
                    />
                    <Text style={[styles.skipLabel, { color: secondaryColor }]}>
                      {skipLabel || t('adaptiveTdee.noAdjustment')}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 70,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    ...typography.bodyBold,
    fontSize: 17,
    textAlign: 'center',
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  summaryCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  summaryUnit: {
    fontSize: 12,
  },
  summaryDivider: {
    width: 1,
    height: 48,
    marginHorizontal: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  emptyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    ...typography.bodyBold,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 20,
  },
  historyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    elevation: 1,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  historyWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyWeekLabel: {
    fontSize: 12,
  },
  historyWeekDate: {
    fontSize: 13,
    fontWeight: '600',
  },
  daysChip: {
    borderRadius: borderRadius.full,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  daysChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  historyDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  adjustmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caloriesArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  caloriesOld: {
    fontSize: 15,
    textDecorationLine: 'line-through',
  },
  caloriesNew: {
    fontSize: 18,
    fontWeight: '700',
  },
  caloriesUnit: {
    fontSize: 12,
  },
  adjustmentBadge: {
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  adjustmentBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  skipLabel: {
    fontSize: 13,
    flex: 1,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
