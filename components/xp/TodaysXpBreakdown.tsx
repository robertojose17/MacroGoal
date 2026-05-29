/**
 * TodaysXpBreakdown
 *
 * Compact card showing XP earned today by category.
 * Prefers the server-supplied today_breakdown field; falls back gracefully
 * if the backend hasn't deployed that field yet.
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
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { XpStatus, XpBreakdownEntry } from '@/types/xp';

const DAILY_CAP = 500;

// ─── Icon map ─────────────────────────────────────────────────────────────────

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const LABEL_ICONS: Record<string, IoniconsName> = {
  Meals: 'restaurant',
  Protein: 'fitness',
  Calories: 'pie-chart',
  Workout: 'barbell',
  Steps: 'walk',
  'Weight Check-in': 'scale',
  'Progress Photo': 'camera',
  Missions: 'flag',
  'Mission Bonus': 'star',
  Activity: 'flash',
};

function iconForLabel(label: string): IoniconsName {
  return LABEL_ICONS[label] ?? 'flash';
}

// ─── Breakdown derivation ─────────────────────────────────────────────────────

function getBreakdownItems(status: XpStatus): XpBreakdownEntry[] {
  // Prefer the server-supplied breakdown
  if (status.today_breakdown && status.today_breakdown.length > 0) {
    return status.today_breakdown;
  }
  // Fallback: if backend hasn't deployed yet, show a single "Activity" row
  if (status.xp_today > 0) {
    return [{ event_type: 'unknown', label: 'Activity', xp: status.xp_today }];
  }
  return [];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TodaysXpBreakdownProps {
  status: XpStatus | null;
  isDark: boolean;
  onScrollToMissions?: () => void;
}

// ─── Row component ────────────────────────────────────────────────────────────

interface BreakdownRowProps {
  entry: XpBreakdownEntry;
  isDark: boolean;
}

function BreakdownRow({ entry, isDark }: BreakdownRowProps) {
  const xpDisplay = '+' + entry.xp.toLocaleString();
  const iconName = iconForLabel(entry.label);
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownLeft}>
        <Ionicons
          name={iconName}
          size={16}
          color={isDark ? '#A0A2B8' : '#6B7280'}
          style={styles.rowIcon}
        />
        <Text style={[styles.breakdownLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
          {entry.label}
        </Text>
      </View>
      <Text style={[styles.breakdownXp, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
        {xpDisplay}
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TodaysXpBreakdown({ status, isDark, onScrollToMissions }: TodaysXpBreakdownProps) {
  const barAnim = useRef(new Animated.Value(0)).current;

  const xpToday = status?.xp_today ?? 0;
  const capProgress = Math.min(xpToday / DAILY_CAP, 1);
  const xpTodayDisplay = '+' + xpToday.toLocaleString();
  const xpTodayRaw = xpToday.toLocaleString();
  const capDisplay = DAILY_CAP.toLocaleString();

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: capProgress,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [capProgress, barAnim]);

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const breakdown = status ? getBreakdownItems(status) : [];
  const isEmpty = xpToday === 0;

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
          Today's XP
        </Text>
        <Text style={[styles.xpBig, { color: colors.primary }]}>
          {xpTodayDisplay}
        </Text>
      </View>

      {isEmpty ? (
        /* Empty state */
        <View style={styles.emptyState}>
          <Ionicons name="flash-outline" size={32} color={isDark ? '#3A3C52' : '#D4D6DA'} />
          <Text style={[styles.emptyTitle, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            No XP yet today
          </Text>
          <Text style={[styles.emptySubtitle, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
            Complete a mission to start earning
          </Text>
          {onScrollToMissions && (
            <TouchableOpacity
              style={[styles.ctaButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[TodaysXpBreakdown] CTA pressed — scrolling to missions');
                onScrollToMissions();
              }}
            >
              <Text style={styles.ctaText}>
                View Missions
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* Breakdown list */
        <View style={styles.breakdownList}>
          {breakdown.map((item, idx) => (
            <BreakdownRow key={item.event_type + '_' + idx} entry={item} isDark={isDark} />
          ))}
        </View>
      )}

      {/* Daily cap bar */}
      <View style={styles.capSection}>
        <View style={styles.capHeader}>
          <Text style={[styles.capLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            Daily cap
          </Text>
          <Text style={[styles.capValue, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            {xpTodayRaw}
            {' / '}
            {capDisplay}
            {' XP'}
          </Text>
        </View>
        <View style={[styles.capBarBg, { backgroundColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
          <Animated.View
            style={[
              styles.capBarFill,
              {
                width: barWidth,
                backgroundColor: capProgress >= 1 ? '#34D399' : colors.primary,
              },
            ]}
          />
        </View>
      </View>
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
  xpBig: {
    fontSize: 22,
    fontWeight: '800',
  },
  breakdownList: {
    marginBottom: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowIcon: {
    width: 20,
  },
  breakdownLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  breakdownXp: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '400',
  },
  ctaButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  capSection: {
    marginTop: spacing.xs,
  },
  capHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  capLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  capValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  capBarBg: {
    height: 5,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  capBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
});
