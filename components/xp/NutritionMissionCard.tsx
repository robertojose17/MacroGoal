/**
 * NutritionMissionCard
 *
 * Shows 4 macro progress circles (Calories, Protein, Carbs, Fats) with a +90 XP reward badge.
 * Animates arcs from 0 to value on mount.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';

// ─── Props ────────────────────────────────────────────────────────────────────

interface NutritionMissionCardProps {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  goalCalories: number;
  goalProtein: number;
  goalCarbs: number;
  goalFats: number;
  isDark: boolean;
}

// ─── Macro circle config ──────────────────────────────────────────────────────

const CIRCLE_SIZE = 84;
const STROKE_WIDTH = 7;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface MacroCircleProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
  isDark: boolean;
}

function MacroCircle({ label, current, goal, unit, color, isDark }: MacroCircleProps) {
  const animVal = useRef(new Animated.Value(0)).current;
  const progress = goal > 0 ? Math.min(current / goal, 1) : 0;

  useEffect(() => {
    Animated.timing(animVal, {
      toValue: progress,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [progress, animVal]);

  const currentDisplay = Math.round(current).toLocaleString();
  const goalDisplay = Math.round(goal).toLocaleString();

  // We drive the dashoffset via a JS-side interpolation (no native driver for SVG props)
  // We use a state-based approach: read the animated value and re-render via listener
  const [dashOffset, setDashOffset] = React.useState(CIRCUMFERENCE);

  useEffect(() => {
    const id = animVal.addListener(({ value }) => {
      setDashOffset(CIRCUMFERENCE * (1 - value));
    });
    return () => animVal.removeListener(id);
  }, [animVal]);

  return (
    <View style={styles.circleCell}>
      <View style={styles.circleWrapper}>
        {/* Track ring */}
        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            stroke={isDark ? '#3A3C52' : '#E5E7EB'}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
        </Svg>
        {/* Progress arc */}
        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`}
          />
        </Svg>
        {/* Inner text */}
        <View style={styles.circleInner}>
          <Text style={[styles.circleLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            {label}
          </Text>
          <Text style={[styles.circleValue, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
            {currentDisplay}
          </Text>
          <Text style={[styles.circleGoal, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
            {'/ '}
            {goalDisplay}
            {unit}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NutritionMissionCard({
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFats,
  goalCalories,
  goalProtein,
  goalCarbs,
  goalFats,
  isDark,
}: NutritionMissionCardProps) {
  const router = useRouter();

  const isEmpty = totalCalories === 0 && totalProtein === 0 && totalCarbs === 0 && totalFats === 0;

  // Compute "on track" macros: current >= 0.9 * goal AND current <= 1.1 * goal
  const onTrackCount = [
    { current: totalCalories, goal: goalCalories },
    { current: totalProtein, goal: goalProtein },
    { current: totalCarbs, goal: goalCarbs },
    { current: totalFats, goal: goalFats },
  ].filter(({ current, goal }) => goal > 0 && current >= 0.9 * goal && current <= 1.1 * goal).length;

  const avgProgress = goalCalories > 0
    ? Math.min(
        ((totalCalories / goalCalories) +
          (goalProtein > 0 ? totalProtein / goalProtein : 0) +
          (goalCarbs > 0 ? totalCarbs / goalCarbs : 0) +
          (goalFats > 0 ? totalFats / goalFats : 0)) /
          4,
        1
      )
    : 0;

  const avgProgressPct = Math.round(avgProgress * 100);
  const onTrackText = onTrackCount + ' of 4 macros on track';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? colors.cardDark : colors.card,
          borderColor: isDark ? '#3A3C52' : '#D4D6DA',
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.cardTitle, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
          Nutrition Mission
        </Text>
        <LinearGradient
          colors={[colors.primary, '#FF8E3C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.xpBadge}
        >
          <Ionicons name="trophy" size={12} color="#fff" />
          <Text style={styles.xpBadgeText}>
            +90 XP Reward
          </Text>
        </LinearGradient>
      </View>

      {isEmpty ? (
        /* Empty state */
        <View style={styles.emptyState}>
          <Ionicons name="nutrition-outline" size={36} color={isDark ? '#3A3C52' : '#D4D6DA'} />
          <Text style={[styles.emptyTitle, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            Log your meals to unlock +90 XP
          </Text>
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[NutritionMissionCard] Add Food pressed');
              router.push('/add-food');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaText}>
              Add Food
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* 2x2 macro grid */}
          <View style={styles.grid}>
            <MacroCircle
              label="CAL"
              current={totalCalories}
              goal={goalCalories}
              unit=" kcal"
              color={colors.calories}
              isDark={isDark}
            />
            <MacroCircle
              label="PROTEIN"
              current={totalProtein}
              goal={goalProtein}
              unit="g"
              color={colors.protein}
              isDark={isDark}
            />
            <MacroCircle
              label="CARBS"
              current={totalCarbs}
              goal={goalCarbs}
              unit="g"
              color={colors.carbs}
              isDark={isDark}
            />
            <MacroCircle
              label="FATS"
              current={totalFats}
              goal={goalFats}
              unit="g"
              color={colors.fats}
              isDark={isDark}
            />
          </View>

          {/* Mission progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
                Mission progress
              </Text>
              <Text style={[styles.onTrackText, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
                {onTrackText}
              </Text>
            </View>
            <View style={[styles.progressBarBg, { backgroundColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: avgProgressPct + '%',
                    backgroundColor: avgProgress >= 0.9 ? colors.success : colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
  },
  xpBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
    marginHorizontal: -spacing.xs,
  },
  circleCell: {
    width: '50%',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  circleWrapper: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  circleValue: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 19,
  },
  circleGoal: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
  },
  progressSection: {
    marginTop: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  onTrackText: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBarBg: {
    height: 5,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  ctaButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
