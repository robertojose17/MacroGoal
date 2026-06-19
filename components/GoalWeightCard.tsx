import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';

const KG_TO_LBS = 2.20462;
const CHART_HEIGHT = 60;
const CHART_PADDING_V = 8;

interface GoalWeightCardProps {
  userId: string;
  isDark: boolean;
  currentWeightKg?: number | null;
  goalWeightKg?: number | null;
  startWeightKg?: number | null;
}

interface WeightPoint {
  date: string;
  weight: number; // kg
}

function kgToLbs(kg: number): number {
  return Math.round(kg * KG_TO_LBS);
}

function getEstimatedDate(
  checkIns: WeightPoint[],
  currentWeightKg: number,
  goalWeightKg: number
): string | null {
  if (checkIns.length < 2) return null;
  const first = checkIns[0];
  const last = checkIns[checkIns.length - 1];
  const firstDate = new Date(first.date);
  const lastDate = new Date(last.date);
  const daysDiff = Math.max(
    1,
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weightChange = first.weight - last.weight; // kg lost
  if (weightChange <= 0) return null;
  const ratePerDay = weightChange / daysDiff;
  const remaining = currentWeightKg - goalWeightKg;
  if (remaining <= 0) return null;
  const daysLeft = remaining / ratePerDay;
  const estDate = new Date();
  estDate.setDate(estDate.getDate() + daysLeft);
  return estDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function getWeekOfJourney(firstCheckInDate: string | null): number {
  if (!firstCheckInDate) return 1;
  const start = new Date(firstCheckInDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const weeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, weeks + 1);
}

export default function GoalWeightCard({
  userId,
  isDark,
  currentWeightKg: propCurrentWeightKg,
  goalWeightKg: propGoalWeightKg,
  startWeightKg: propStartWeightKg,
}: GoalWeightCardProps) {
  const router = useRouter();
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
  const [goalWeightKg, setGoalWeightKg] = useState<number | null>(null);
  const [startWeightKg, setStartWeightKg] = useState<number | null>(null);
  const [checkIns, setCheckIns] = useState<WeightPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const cardWidth = Dimensions.get('window').width - spacing.md * 2 - spacing.md * 2;
  const chartWidth = cardWidth - spacing.md * 2;

  useEffect(() => {
    async function load() {
      console.log('[GoalWeightCard] props received — currentWeightKg:', propCurrentWeightKg, 'goalWeightKg:', propGoalWeightKg, 'startWeightKg:', propStartWeightKg);

      // Use prop values directly
      setCurrentWeightKg(propCurrentWeightKg ?? null);
      setGoalWeightKg(propGoalWeightKg ?? null);
      setStartWeightKg(propStartWeightKg ?? null);

      // Only fetch check_ins from Supabase
      const checkInsRes = await supabase
        .from('check_ins')
        .select('date, weight')
        .eq('user_id', userId)
        .not('weight', 'is', null)
        .order('date', { ascending: true })
        .limit(8);

      if (checkInsRes.data && checkInsRes.data.length > 0) {
        const points = checkInsRes.data
          .filter((c: any) => c.weight != null)
          .map((c: any) => ({ date: c.date, weight: Number(c.weight) }));
        setCheckIns(points);
        console.log('[GoalWeightCard] Loaded', points.length, 'weight check-ins');
      }
      setLoading(false);
    }
    load();
  }, [userId, propCurrentWeightKg, propGoalWeightKg, propStartWeightKg]);

  const bg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textPrimary = isDark ? colors.textDark : colors.primaryText;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondary;

  if (loading) return null;

  // No goal weight set
  if (!goalWeightKg) {
    return (
      <View style={[styles.card, { backgroundColor: bg, borderColor }]}>
        <Text style={[styles.cardTitle, { color: textPrimary }]}>Goal Weight</Text>
        <Text style={[styles.noGoalText, { color: textSecondary }]}>
          Set your goal weight in Profile to track your progress here.
        </Text>
        <TouchableOpacity
          style={styles.setGoalButton}
          onPress={() => {
            console.log('[GoalWeightCard] Set goal weight button pressed — navigating to /profile');
            router.push('/profile');
          }}
          activeOpacity={0.75}
        >
          <Text style={styles.setGoalButtonText}>Set Goal Weight</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentKg = currentWeightKg ?? (checkIns.length > 0 ? checkIns[checkIns.length - 1].weight : null);
  if (!currentKg) return null;

  const currentLbs = kgToLbs(currentKg);
  const goalLbs = kgToLbs(goalWeightKg);
  const startKg = startWeightKg ?? (checkIns.length > 0 ? checkIns[0].weight : currentKg);
  const startLbs = kgToLbs(startKg);

  // Progress bar: 0 = start, 1 = goal
  const totalRange = Math.abs(startKg - goalWeightKg);
  const progressRaw = totalRange > 0 ? Math.abs(startKg - currentKg) / totalRange : 0;
  const progress = Math.min(1, Math.max(0, progressRaw));

  // On track: losing weight (or gaining if goal > start)
  const isLosing = goalWeightKg < startKg;
  const isOnTrack = isLosing ? currentKg <= startKg : currentKg >= startKg;

  // Week of journey
  const firstCheckInDate = checkIns.length > 0 ? checkIns[0].date : null;
  const weekNum = getWeekOfJourney(firstCheckInDate);

  // Estimated completion
  const estDate = getEstimatedDate(checkIns, currentKg, goalWeightKg);

  // Chart rendering
  const hasChart = checkIns.length >= 2;
  let chartPoints: { x: number; y: number }[] = [];

  if (hasChart) {
    const weights = checkIns.map((c) => c.weight);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const wRange = maxW - minW || 1;
    const usableH = CHART_HEIGHT - CHART_PADDING_V * 2;

    chartPoints = checkIns.map((c, i) => ({
      x: (i / (checkIns.length - 1)) * chartWidth,
      y:
        CHART_PADDING_V +
        (isLosing
          ? ((c.weight - minW) / wRange) * usableH
          : ((maxW - c.weight) / wRange) * usableH),
    }));
  }

  const badgeLabel = isOnTrack ? 'ON TRACK' : 'BEHIND';
  const badgeBg = isOnTrack
    ? isDark ? 'rgba(92,185,123,0.18)' : 'rgba(92,185,123,0.12)'
    : isDark ? 'rgba(255,138,91,0.18)' : 'rgba(255,138,91,0.12)';
  const badgeColor = isOnTrack ? colors.success : colors.warning;

  const footerText = estDate
    ? `Week ${weekNum} of journey · Est. ${estDate}`
    : `Week ${weekNum} of journey`;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: textPrimary }]}>Goal Weight</Text>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>
            {isOnTrack ? '✓ ' : ''}
            {badgeLabel}
          </Text>
        </View>
      </View>

      {/* Mini line chart */}
      {hasChart && (
        <View style={[styles.chartArea, { width: chartWidth, height: CHART_HEIGHT }]}>
          {/* Connecting lines */}
          {chartPoints.slice(0, -1).map((pt, i) => {
            const next = chartPoints[i + 1];
            const dx = next.x - pt.x;
            const dy = next.y - pt.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            return (
              <View
                key={`line-${i}`}
                style={{
                  position: 'absolute',
                  left: pt.x,
                  top: pt.y - 1,
                  width: length,
                  height: 2,
                  backgroundColor: colors.primary,
                  opacity: 0.7,
                  transform: [{ rotate: `${angle}deg` }],
                  transformOrigin: '0 50%',
                }}
              />
            );
          })}
          {/* Dots */}
          {chartPoints.map((pt, i) => (
            <View
              key={`dot-${i}`}
              style={{
                position: 'absolute',
                left: pt.x - 3,
                top: pt.y - 3,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  i === chartPoints.length - 1 ? colors.primary : colors.primary,
                opacity: i === chartPoints.length - 1 ? 1 : 0.5,
              }}
            />
          ))}
        </View>
      )}

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
          {/* Indicator dot */}
          <View
            style={[
              styles.progressDot,
              {
                left: `${Math.round(progress * 100)}%`,
                backgroundColor: colors.primary,
                borderColor: bg,
              },
            ]}
          />
        </View>

        {/* Labels */}
        <View style={styles.progressLabels}>
          <View style={styles.labelGroup}>
            <Text style={[styles.weightValue, { color: textPrimary }]}>{currentLbs}</Text>
            <Text style={[styles.weightUnit, { color: textSecondary }]}> lbs</Text>
          </View>
          <View style={[styles.labelGroup, { alignItems: 'flex-end' }]}>
            <Text style={[styles.weightValue, { color: textPrimary }]}>{goalLbs}</Text>
            <Text style={[styles.weightUnit, { color: textSecondary }]}> lbs</Text>
          </View>
        </View>
        <View style={styles.progressSubLabels}>
          <Text style={[styles.subLabel, { color: textSecondary }]}>Current</Text>
          <Text style={[styles.subLabel, { color: textSecondary }]}>Goal</Text>
        </View>
      </View>

      {/* Footer */}
      <Text style={[styles.footer, { color: textSecondary }]}>{footerText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  chartArea: {
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  progressSection: {
    marginTop: spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressDot: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginLeft: -7,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  weightValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  weightUnit: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  progressSubLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  footer: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  noGoalText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  setGoalButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  setGoalButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
