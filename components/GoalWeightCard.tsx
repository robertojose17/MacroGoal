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
import { supabase } from '@/lib/supabase/client';
import { WeightProgressMiniChart } from '@/components/ProgressCard';

const KG_TO_LBS = 2.20462;
const CHART_HEIGHT = 120;

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
  // We still need check-ins to derive currentKg fallback, weekNum, estText, and startKg
  const [checkIns, setCheckIns] = useState<{ date: string; weight: number }[]>([]);
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
            .select('daily_calories, loss_rate_lbs_per_week, start_date, maintenance_calories')
            .eq('user_id', authUser.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1),
          supabase
            .from('users')
            .select('maintenance_calories, goal_weight, journey_start_weight, current_weight')
            .eq('id', authUser.id)
            .maybeSingle(),
        ]);

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

        // Bug 2 fix: load goal_weight directly from users table as authoritative source
        if (userData?.goal_weight != null) {
          console.log('[GoalWeightCard] goalWeightKgDirect from users table:', userData.goal_weight);
          setGoalWeightKgDirect(Number(userData.goal_weight));
        }

        // Bug 1 fix: compute start weight from check-in closest to goal.start_date
        let startWeightKg: number | null = null;
        if (goal?.start_date && points.length > 0) {
          const startDate = new Date(goal.start_date + 'T00:00:00');
          const closest = points.reduce((prev: { date: string; weight: number }, curr: { date: string; weight: number }) => {
            const prevDiff = Math.abs(new Date(prev.date).getTime() - startDate.getTime());
            const currDiff = Math.abs(new Date(curr.date).getTime() - startDate.getTime());
            return currDiff < prevDiff ? curr : prev;
          });
          startWeightKg = closest.weight;
          console.log('[GoalWeightCard] startWeightKg from closest check-in to goal.start_date:', startWeightKg, '(start_date:', goal.start_date, ')');
        } else if (points.length > 0) {
          startWeightKg = points[0].weight;
          console.log('[GoalWeightCard] startWeightKg from earliest check-in:', startWeightKg);
        }
        setStartWeightFromGoal(startWeightKg);

        if (goal) {
          const maintenanceCals = goal.maintenance_calories ?? userData?.maintenance_calories ?? 2000;
          console.log('[GoalWeightCard] loaded goal data — dailyCalories:', goal.daily_calories, 'maintenanceCalories:', maintenanceCals, 'lossRateLbsPerWeek:', goal.loss_rate_lbs_per_week);
          setGoalData({
            dailyCalories: goal.daily_calories ?? 2000,
            maintenanceCalories: maintenanceCals,
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

  const bg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = isDark ? '#F1F5F9' : '#111827';
  const textSecondary = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const trackBg = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: bg }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: textPrimary }]}>Goal Weight</Text>
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
      <View style={[styles.card, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: textPrimary }]}>Goal Weight</Text>
        <Text style={[styles.noGoal, { color: textSecondary }]}>
          Set your goal weight in Profile to track progress here.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            console.log('[GoalWeightCard] Set Goal Weight button pressed');
            router.push('/profile' as any);
          }}
          activeOpacity={0.75}
        >
          <Text style={styles.btnText}>Set Goal Weight</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Use last check-in weight as fallback for current weight
  const currentKg = propCurrent ?? (checkIns.length > 0 ? checkIns[checkIns.length - 1].weight : null);

  // ── No current weight ─────────────────────────────────────────────────────
  if (!currentKg) {
    return (
      <View style={[styles.card, { backgroundColor: bg }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: textPrimary }]}>Goal Weight</Text>
        </View>
        <View style={[styles.noDataArea, { height: CHART_HEIGHT }]}>
          <Text style={[styles.noDataText, { color: textSecondary }]}>
            Log a weight check-in to start tracking progress
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
          <Text style={styles.btnText}>Log Check-in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  // Bug 1 fix: use start weight derived from goal start_date check-in
  const startKg = startWeightFromGoal ?? propStart ?? (checkIns.length > 0 ? checkIns[0].weight : currentKg);
  // Bug 2 fix: use goal_weight loaded directly from users table as authoritative source
  const resolvedGoalKg = goalWeightKgDirect ?? propGoal;
  const currentLbs = Math.round(currentKg * KG_TO_LBS);
  const goalLbs = Math.round(resolvedGoalKg * KG_TO_LBS);

  const isLosing = resolvedGoalKg < startKg;
  const totalRange = Math.abs(startKg - resolvedGoalKg) || 1;
  const progress = Math.min(1, Math.max(0, Math.abs(startKg - currentKg) / totalRange));
  const isOnTrack = isLosing ? currentKg < startKg : currentKg > startKg;

  const badgeBg = isOnTrack ? 'rgba(92,185,123,0.12)' : 'rgba(255,138,91,0.12)';
  const badgeColor = isOnTrack ? '#5CB97B' : '#FF8A5B';
  const badgeLabel = isOnTrack ? '✓ ON TRACK' : 'BEHIND';
  const progressPct = Math.round(progress * 100);

  const startLbs = Math.round(startKg * KG_TO_LBS);
  const lastCheckInKg = checkIns.length > 0 ? checkIns[checkIns.length - 1].weight : null;
  // Bug 2 fix: both lastCheckInKg and resolvedGoalKg are in kg — multiplication is correct
  const lbsToGo = lastCheckInKg != null
    ? Math.max(0, Math.round(Math.abs(lastCheckInKg - resolvedGoalKg) * KG_TO_LBS))
    : Math.max(0, Math.round(Math.abs((currentKg ?? 0) - resolvedGoalKg) * KG_TO_LBS));
  console.log('[GoalWeightCard] lastCheckInKg:', lastCheckInKg, 'resolvedGoalKg (kg):', resolvedGoalKg, 'lbsToGo:', lbsToGo);
  const goalReached = progress >= 1;

  // Bug 3 fix: use loss_rate_lbs_per_week as primary, caloric deficit as fallback
  let estDateLabel = '';
  if (lbsToGo > 0) {
    let lbsPerWeek = 0;

    if (goalData?.lossRateLbsPerWeek && goalData.lossRateLbsPerWeek > 0) {
      lbsPerWeek = goalData.lossRateLbsPerWeek;
      console.log('[GoalWeightCard] est arrival using lossRateLbsPerWeek:', lbsPerWeek);
    } else if (goalData && goalData.maintenanceCalories > goalData.dailyCalories) {
      const dailyDeficit = goalData.maintenanceCalories - goalData.dailyCalories;
      lbsPerWeek = (dailyDeficit * 7) / 3500;
      console.log('[GoalWeightCard] est arrival using caloric deficit, lbsPerWeek:', lbsPerWeek);
    }

    if (lbsPerWeek > 0) {
      const weeksToGoal = lbsToGo / lbsPerWeek;
      const daysToGoal = Math.round(weeksToGoal * 7);
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + daysToGoal);
      // Bug 4 fix: include day in the date format
      estDateLabel = estDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      console.log('[GoalWeightCard] estDateLabel:', estDateLabel, '(daysToGoal:', daysToGoal, ')');
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: textPrimary }]}>Goal Weight</Text>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
        </View>
      </View>

      {/* Two-column body */}
      <View style={styles.bodyRow}>
        {/* Left column — premium weight progress */}
        <View style={[styles.leftColumn]}>
          {/* Start → Goal weights (horizontal) */}
          <View style={styles.weightHorizontalRow}>
            <Text style={[styles.weightInlineValue, { color: textPrimary }]}>{startLbs}</Text>
            <Text style={[styles.weightInlineUnit, { color: textPrimary }]}> lbs</Text>
            <Text style={[styles.weightArrow, { color: textSecondary }]}>  →  </Text>
            <Text style={[styles.weightInlineValue, { color: '#5B9AA8' }]}>{goalLbs}</Text>
            <Text style={[styles.weightInlineUnit, { color: '#5B9AA8' }]}> lbs</Text>
          </View>

          {/* Progress bar */}
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
              <Text style={[styles.lbsToGo, { color: '#5CB97B' }]}>Goal reached! 🎉</Text>
            ) : (
              <Text style={[styles.lbsToGo, { color: textSecondary }]}>{lbsToGo} lbs to go</Text>
            )}
          </View>

          {/* Estimated arrival */}
          <View style={styles.estSection}>
            <Text style={[styles.estLabel, { color: textSecondary }]}>EST. ARRIVAL</Text>
            {estDateLabel ? (
              <Text style={[styles.estDate, { color: textPrimary }]}>{estDateLabel}</Text>
            ) : (
              <Text style={[styles.estDate, { color: textSecondary }]}>Calculating...</Text>
            )}
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
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
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
    marginBottom: 4,
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
  // Estimated arrival
  estSection: {
    gap: 2,
  },
  estLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  estDate: {
    fontSize: 13,
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
