import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase/client';
import { WeightProgressMiniChart } from '@/components/ProgressCard';
import { colors, borderRadius as br, spacing } from '@/styles/commonStyles';

const KG_TO_LBS = 2.20462;
const CHART_HEIGHT = 120;
const PRIMARY = '#5B9AA8';

// ─── GoalWeightCard ───────────────────────────────────────────────────────────

interface GoalWeightCardProps {
  userId: string;
  isDark: boolean;
  currentWeightKg?: number | null;
  goalWeightKg?: number | null;
  startWeightKg?: number | null;
}

export default function GoalWeightCard({
  userId,
  isDark,
  currentWeightKg: propCurrent,
  goalWeightKg: propGoal,
  startWeightKg: propStart,
}: GoalWeightCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [checkIns, setCheckIns] = useState<{ date: string; weight: number }[]>([]);
  const [trackerEntries, setTrackerEntries] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalData, setGoalData] = useState<{
    dailyCalories: number;
    maintenanceCalories: number;
    lossRateLbsPerWeek: number;
  } | null>(null);
  const [startWeightFromGoal, setStartWeightFromGoal] = useState<number | null>(null);
  const [goalWeightKgDirect, setGoalWeightKgDirect] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser || cancelled) return;
        console.log('[GoalWeightCard] fetching check-ins and goals for userId:', authUser.id);

        const [checkInsResult, goalsResult, userResult] = await Promise.all([
          supabase
            .from('check_ins')
            .select('date, weight')
            .eq('user_id', authUser.id)
            .not('weight', 'is', null)
            .order('date', { ascending: true }),
          supabase
            .from('goals')
            .select('daily_calories, loss_rate_lbs_per_week, start_date')
            .eq('user_id', authUser.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1),
          supabase
            .from('users')
            .select('goal_weight, current_weight')
            .eq('id', authUser.id)
            .maybeSingle(),
        ]);

        const { data: weightTracker } = await supabase
          .from('trackers')
          .select('id')
          .eq('user_id', authUser.id)
          .eq('name', 'weight')
          .eq('is_default', true)
          .maybeSingle();

        let fetchedTrackerEntries: { date: string; value: number }[] = [];
        if (weightTracker?.id) {
          const { data: entriesData } = await supabase
            .from('tracker_entries')
            .select('date, value')
            .eq('tracker_id', weightTracker.id)
            .eq('user_id', authUser.id)
            .order('date', { ascending: true });
          if (entriesData) {
            fetchedTrackerEntries = entriesData.map((e: any) => ({ date: e.date, value: Number(e.value) }));
          }
        }
        console.log('[GoalWeightCard] loaded', fetchedTrackerEntries.length, 'tracker_entries (lbs)');
        if (!cancelled) setTrackerEntries(fetchedTrackerEntries);

        if (cancelled) return;

        const points = (() => {
          if (checkInsResult.error) {
            console.log('[GoalWeightCard] check-ins fetch error:', checkInsResult.error.message);
            return [];
          }
          return (checkInsResult.data ?? [])
            .filter((c: any) => c.weight != null)
            .map((c: any) => ({ date: c.date, weight: Number(c.weight) }));
        })();

        console.log('[GoalWeightCard] loaded', points.length, 'weight check-ins');
        setCheckIns(points);

        if (goalsResult.error) {
          console.log('[GoalWeightCard] goals fetch error:', goalsResult.error.message);
        }
        if (userResult.error) {
          console.log('[GoalWeightCard] users fetch error:', userResult.error.message);
        }

        const goal = goalsResult.data?.[0];
        const userData = userResult.data;

        if (userData?.goal_weight != null) {
          console.log('[GoalWeightCard] goalWeightKgDirect from users table:', userData.goal_weight);
          setGoalWeightKgDirect(Number(userData.goal_weight));
        }

        if (points.length > 0) {
          setStartWeightFromGoal(points[0].weight);
          console.log('[GoalWeightCard] startWeightFromGoal from earliest check-in:', points[0].weight, 'kg =', Math.round(points[0].weight * 2.20462), 'lbs');
        }

        if (userData?.current_weight != null) {
          setStartWeightFromGoal(Number(userData.current_weight));
        }

        if (goal) {
          console.log('[GoalWeightCard] loaded goal data — dailyCalories:', goal.daily_calories, 'lossRateLbsPerWeek:', goal.loss_rate_lbs_per_week);
          setGoalData({
            dailyCalories: goal.daily_calories ?? 2000,
            maintenanceCalories: 2000,
            lossRateLbsPerWeek: parseFloat(goal.loss_rate_lbs_per_week) || 0,
          });
        }
      } catch (err) {
        console.log('[GoalWeightCard] error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const bg = isDark ? colors.cardDark : '#FFFFFF';
  const cardBorderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textPrimary = isDark ? '#F1F5F9' : '#2B2D42';
  const textSecondary = isDark ? '#A0A2B8' : '#6B7280';
  const trackBg = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: bg, borderColor: cardBorderColor }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: textPrimary }]}>{t('goalWeightCard.title')}</Text>
        </View>
        <View style={[styles.skeletonChart, { backgroundColor: trackBg }]} />
        <View style={[styles.skeletonBar, { backgroundColor: trackBg }]} />
        <View style={styles.headerRow}>
          <View style={[styles.skeletonLabel, { backgroundColor: trackBg }]} />
          <View style={[styles.skeletonLabel, { backgroundColor: trackBg }]} />
        </View>
        <ActivityIndicator size="small" color={textSecondary} style={{ marginTop: 8 }} />
      </View>
    );
  }

  // ── No goal set ───────────────────────────────────────────────────────────
  if (!goalWeightKgDirect && !propGoal) {
    return (
      <View style={[styles.card, { backgroundColor: bg, borderColor: cardBorderColor }]}>
        <Text style={[styles.title, { color: textPrimary }]}>{t('goalWeightCard.title')}</Text>
        <Text style={[styles.noGoal, { color: textSecondary }]}>
          {t('goalWeightCard.setGoalPrompt')}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            console.log('[GoalWeightCard] Set Goal Weight button pressed');
            router.push('/profile' as any);
          }}
          activeOpacity={0.75}
        >
          <Text style={styles.btnText}>{t('goalWeightCard.setGoalBtn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentKg = propCurrent ?? (checkIns.length > 0 ? checkIns[checkIns.length - 1].weight : null);

  // ── No current weight ─────────────────────────────────────────────────────
  if (!currentKg) {
    return (
      <View style={[styles.card, { backgroundColor: bg, borderColor: cardBorderColor }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: textPrimary }]}>{t('goalWeightCard.title')}</Text>
        </View>
        <View style={[styles.noDataArea, { height: CHART_HEIGHT }]}>
          <Text style={[styles.noDataText, { color: textSecondary }]}>
            {t('goalWeightCard.logCheckInPrompt')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            console.log('[GoalWeightCard] Log Check-in button pressed');
            router.push('/check-in-form' as any);
          }}
          activeOpacity={0.75}
        >
          <Text style={styles.btnText}>{t('goalWeightCard.logCheckInBtn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const startKg = startWeightFromGoal ?? propStart ?? (checkIns.length > 0 ? checkIns[0].weight : currentKg);
  const resolvedGoalKg = goalWeightKgDirect ?? propGoal;
  const currentLbs = Math.round(currentKg * KG_TO_LBS);
  const goalLbs = Math.round(resolvedGoalKg * KG_TO_LBS);

  const lastCheckInKg = checkIns.length > 0 ? checkIns[checkIns.length - 1].weight : null;

  const lastTrackerEntryLbs = trackerEntries.length > 0
    ? trackerEntries[trackerEntries.length - 1].value
    : null;

  const lastTrackerEntryKg = lastTrackerEntryLbs != null ? lastTrackerEntryLbs / KG_TO_LBS : null;

  const activeWeightKg = lastTrackerEntryKg ?? lastCheckInKg ?? currentKg;

  const isLosing = resolvedGoalKg < startKg;
  const totalRange = Math.abs(startKg - resolvedGoalKg) || 1;
  const progress = Math.min(1, Math.max(0, Math.abs(startKg - activeWeightKg) / totalRange));
  const isOnTrack = isLosing ? activeWeightKg < startKg : activeWeightKg > startKg;

  const badgeBg = isOnTrack ? 'rgba(92,185,123,0.12)' : 'rgba(255,138,91,0.12)';
  const badgeColor = isOnTrack ? '#5CB97B' : '#FF8A5B';
  const badgeLabel = isOnTrack ? t('goalWeightCard.onTrack') : t('goalWeightCard.behind');
  const progressPct = Math.round(progress * 100);

  const startLbs = Math.round(startKg * KG_TO_LBS);
  const lbsToGo = lastTrackerEntryLbs != null
    ? Math.max(0, Math.round(Math.abs(lastTrackerEntryLbs - (resolvedGoalKg * KG_TO_LBS))))
    : Math.max(0, Math.round(Math.abs((currentKg ?? 0) - resolvedGoalKg) * KG_TO_LBS));
  console.log('[GoalWeightCard] lastTrackerEntryLbs:', lastTrackerEntryLbs, 'lastTrackerEntryKg:', lastTrackerEntryKg, 'resolvedGoalKg (kg):', resolvedGoalKg, 'lbsToGo:', lbsToGo);
  const goalReached = progress >= 1;

  let estDateLabel = '';
  if (lbsToGo > 0 && goalData) {
    const lossRateLbsPerWeek = goalData.lossRateLbsPerWeek;
    const dailyDeficit = goalData.maintenanceCalories - goalData.dailyCalories;
    let daysToGoal: number | null = null;

    if (lossRateLbsPerWeek > 0) {
      daysToGoal = Math.round(lbsToGo / (lossRateLbsPerWeek / 7));
    } else if (dailyDeficit > 50) {
      daysToGoal = Math.round(lbsToGo / (dailyDeficit / 3500));
    }

    if (daysToGoal != null) {
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + daysToGoal);
      estDateLabel = estDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  console.log('[GoalWeightCard] estArrival — lbsToGo:', lbsToGo, 'lossRateLbsPerWeek:', goalData?.lossRateLbsPerWeek, 'deficit:', goalData ? goalData.maintenanceCalories - goalData.dailyCalories : 'n/a', 'result:', estDateLabel);

  const lossSpeedDisplay = (() => {
    const KG_TO_LBS = 2.20462;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Primary: tracker_entries (lbs) — last 14 days
    let points: { date: Date; weightLbs: number }[] = trackerEntries
      .filter(e => new Date(e.date + 'T00:00:00') >= fourteenDaysAgo)
      .map(e => ({ date: new Date(e.date + 'T00:00:00'), weightLbs: e.value }));

    // Fallback 1: all tracker_entries if fewer than 2 in last 14 days
    if (points.length < 2 && trackerEntries.length >= 2) {
      points = trackerEntries.map(e => ({ date: new Date(e.date + 'T00:00:00'), weightLbs: e.value }));
    }

    // Fallback 2: check_ins (kg → lbs) — last 14 days
    if (points.length < 2) {
      points = checkIns
        .filter(c => new Date(c.date + 'T00:00:00') >= fourteenDaysAgo)
        .map(c => ({ date: new Date(c.date + 'T00:00:00'), weightLbs: c.weight * KG_TO_LBS }));
    }

    // Fallback 3: all check_ins
    if (points.length < 2 && checkIns.length >= 2) {
      points = checkIns.map(c => ({ date: new Date(c.date + 'T00:00:00'), weightLbs: c.weight * KG_TO_LBS }));
    }

    if (points.length < 2) return '--';

    const first = points[0];
    const last = points[points.length - 1];
    const daysDiff = (last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24);
    const weeksDiff = daysDiff / 7;
    if (weeksDiff <= 0) return '--';

    const lbsPerWeek = (first.weightLbs - last.weightLbs) / weeksDiff;
    if (!isFinite(lbsPerWeek)) return '--';
    return lbsPerWeek.toFixed(1);
  })();
  console.log('[GoalWeightCard] lossSpeed — trackerEntries:', trackerEntries.length, 'checkIns:', checkIns.length, 'result:', lossSpeedDisplay);

  const lossSpeedLabel = lossSpeedDisplay === '--' ? '--' : `${lossSpeedDisplay} lbs/week`;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: cardBorderColor }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: textPrimary }]}>{t('goalWeightCard.title')}</Text>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
        </View>
      </View>

      {/* Body row */}
      <View style={[styles.bodyRow, { marginBottom: 4 }]}>
        {/* Left column */}
        <View style={styles.leftColumn}>
          <View style={styles.weightHorizontalRow}>
            <Text style={[styles.weightInlineValue, { color: textPrimary }]}>{startLbs}</Text>
            <Text style={[styles.weightInlineUnit, { color: textPrimary }]}> lbs</Text>
            <Text style={[styles.weightArrow, { color: textSecondary }]}>  →  </Text>
            <Text style={[styles.weightInlineValue, { color: PRIMARY }]}>{goalLbs}</Text>
            <Text style={[styles.weightInlineUnit, { color: PRIMARY }]}> lbs</Text>
          </View>

          <View style={styles.progressSection}>
            <View style={styles.barRow}>
              <View style={[styles.track, { backgroundColor: trackBg, flex: 1 }]}>
                <LinearGradient
                  colors={['#5B9AA8', '#7BC8D4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.fill, { width: `${progressPct}%` as any }]}
                />
                <View style={[styles.progressDot, { left: `${progressPct}%` as any, borderColor: bg }]} />
              </View>
              <Text style={styles.pctText}>{progressPct}%</Text>
            </View>
            {goalReached ? (
              <Text style={[styles.lbsToGo, { color: '#5CB97B' }]}>{t('goalWeightCard.goalReached')}</Text>
            ) : (
              <Text style={[styles.lbsToGo, { color: textSecondary }]}>{t('goalWeightCard.lbsToGo', { lbs: lbsToGo })}</Text>
            )}
          </View>

          {/* Est. Arrival + Loss Speed side by side */}
          <View style={styles.estSection}>
            <View style={styles.estCell}>
              <Text style={[styles.estLabel, { color: textSecondary }]}>{t('goalWeightCard.estArrival')}</Text>
              {estDateLabel ? (
                <Text style={[styles.estDate, { color: textPrimary }]}>{estDateLabel}</Text>
              ) : (
                <Text style={[styles.estDate, { color: textSecondary }]}>{t('goalWeightCard.calculating')}</Text>
              )}
            </View>
            <View style={[styles.estDivider, { backgroundColor: textSecondary }]} />
            <View style={styles.estCell}>
              <Text style={[styles.estLabel, { color: textSecondary }]}>LOSS SPEED</Text>
              <Text style={[styles.estDate, { color: textPrimary }]}>{lossSpeedLabel}</Text>
            </View>
          </View>
        </View>

        {/* Right column — mini chart */}
        <View style={styles.chartColumn}>
          <WeightProgressMiniChart userId={userId} isDark={isDark} height={CHART_HEIGHT} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  // Two-column body
  bodyRow: {
    flexDirection: 'row',
    height: CHART_HEIGHT,
  },
  leftColumn: {
    flex: 1,
    paddingRight: 12,
    justifyContent: 'space-between',
  },
  chartColumn: {
    flex: 1,
    overflow: 'hidden',
  },
  // Weight row (start → goal, horizontal)
  weightHorizontalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weightInlineValue: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  weightInlineUnit: {
    fontSize: 16,
    fontWeight: '700',
  },
  weightArrow: {
    fontSize: 14,
    fontWeight: '400',
    paddingHorizontal: 2,
  },
  // Progress bar section
  progressSection: {
    gap: 3,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  track: {
    height: 6,
    borderRadius: 6,
    overflow: 'visible',
    position: 'relative',
  },
  fill: { height: '100%', borderRadius: 6 },
  progressDot: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#5B9AA8',
    borderWidth: 2,
    marginLeft: -7,
  },
  pctText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B9AA8',
    minWidth: 30,
    textAlign: 'right',
  },
  lbsToGo: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Estimated arrival + loss speed row
  estSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  estCell: {
    flex: 1,
    gap: 2,
  },
  estDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 8,
    opacity: 0.2,
  },
  estLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  estDate: {
    fontSize: 12,
    fontWeight: '700',
  },
  // No goal / no data states
  noGoal: { fontSize: 14, lineHeight: 20, marginVertical: 8 },
  noDataArea: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  noDataText: { fontSize: 12, textAlign: 'center' },
  // Buttons
  btn: {
    backgroundColor: '#5B9AA8',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  // Skeleton
  skeletonChart: {
    height: CHART_HEIGHT,
    borderRadius: 8,
    marginBottom: 12,
    opacity: 0.5,
  },
  skeletonBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 10,
    opacity: 0.5,
  },
  skeletonLabel: {
    height: 36,
    width: 70,
    borderRadius: 6,
    opacity: 0.5,
  },
});
