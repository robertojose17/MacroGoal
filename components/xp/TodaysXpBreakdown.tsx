/**
 * TodaysXpBreakdown
 *
 * Compact card showing XP earned today by category.
 * Reads from the xp_ledger via the XpStatus.today field.
 *
 * Note: The get-xp-status endpoint returns xp_today as a number.
 * We derive the breakdown from the missions and known event types.
 * The ledger breakdown is not directly exposed by the current API,
 * so we show the total and mission progress as a proxy.
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
import type { XpStatus } from '@/types/xp';

const DAILY_CAP = 500;

interface TodaysXpBreakdownProps {
  status: XpStatus | null;
  isDark: boolean;
  onScrollToMissions?: () => void;
}

// Derive a breakdown from what we know about the user's state
function deriveBreakdown(status: XpStatus): { label: string; xp: number }[] {
  const items: { label: string; xp: number }[] = [];

  // Missions completed today contribute XP
  const completedMissions = (status.missions ?? []).filter((m) => m.completed);
  const missionXp = completedMissions.reduce((sum, m) => sum + m.xp_reward, 0);
  if (missionXp > 0) {
    items.push({ label: 'Missions', xp: missionXp });
  }

  // If all missions done, bonus was awarded
  const allMissionsDone = status.missions?.length > 0 && completedMissions.length === status.missions.length;
  if (allMissionsDone) {
    items.push({ label: 'Mission Bonus', xp: 100 });
  }

  // Remaining XP attributed to general activity
  const accountedFor = items.reduce((s, i) => s + i.xp, 0);
  const remaining = status.xp_today - accountedFor;
  if (remaining > 0) {
    items.push({ label: 'Activity', xp: remaining });
  }

  return items;
}

interface BreakdownRowProps {
  label: string;
  xp: number;
  isDark: boolean;
}

function BreakdownRow({ label, xp, isDark }: BreakdownRowProps) {
  const xpDisplay = '+' + xp.toLocaleString();
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
        {label}
      </Text>
      <Text style={[styles.breakdownXp, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
        {xpDisplay}
      </Text>
    </View>
  );
}

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

  const breakdown = status ? deriveBreakdown(status) : [];
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
          {breakdown.map((item) => (
            <BreakdownRow key={item.label} label={item.label} xp={item.xp} isDark={isDark} />
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
