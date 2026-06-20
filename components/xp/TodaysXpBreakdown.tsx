/**
 * TodaysXpBreakdown
 *
 * Horizontal grid of XP source tiles showing today's XP by category.
 * Prefers the server-supplied today_breakdown field; falls back gracefully.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { XpStatus, XpBreakdownEntry } from '@/types/xp';



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

// Fixed tile categories always shown
const FIXED_TILES: { label: string; icon: IoniconsName }[] = [
  { label: 'Meals', icon: 'restaurant' },
  { label: 'Protein', icon: 'fitness' },
  { label: 'Calories', icon: 'pie-chart' },
  { label: 'Steps', icon: 'walk' },
  { label: 'Workout', icon: 'barbell' },
];

function iconForLabel(label: string): IoniconsName {
  return LABEL_ICONS[label] ?? 'flash';
}

// ─── Breakdown derivation ─────────────────────────────────────────────────────

function getBreakdownItems(status: XpStatus): XpBreakdownEntry[] {
  if (status.today_breakdown && status.today_breakdown.length > 0) {
    return status.today_breakdown;
  }
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

// ─── XP Tile ──────────────────────────────────────────────────────────────────

interface XpTileProps {
  label: string;
  icon: IoniconsName;
  xp: number;
  isDark: boolean;
}

function XpTile({ label, icon, xp, isDark }: XpTileProps) {
  const hasXp = xp > 0;
  const xpDisplay = '+' + xp;
  const iconColor = hasXp ? colors.primary : (isDark ? '#3A3C52' : '#D4D6DA');
  const iconBg = hasXp
    ? (isDark ? colors.primary + '22' : colors.primary + '15')
    : (isDark ? '#252740' : '#F3F4F6');
  const labelColor = hasXp ? (isDark ? '#A0A2B8' : '#6B7280') : (isDark ? '#3A3C52' : '#CBD5E1');
  const xpColor = hasXp ? colors.primary : (isDark ? '#3A3C52' : '#D4D6DA');

  return (
    <View style={[styles.tile, { backgroundColor: isDark ? '#1E2035' : '#F9FAFB' }]}>
      <View style={[styles.tileIconBg, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.tileLabel, { color: labelColor }]}>
        {label}
      </Text>
      <Text style={[styles.tileXp, { color: xpColor }]}>
        {xpDisplay}
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TodaysXpBreakdown({ status, isDark, onScrollToMissions }: TodaysXpBreakdownProps) {
  const xpToday = status?.xp_today ?? 0;
  const xpTodayDisplay = '+' + xpToday.toLocaleString();
  const isEmpty = xpToday === 0;

  const breakdown = status ? getBreakdownItems(status) : [];

  // Build a lookup map from breakdown
  const xpByLabel: Record<string, number> = {};
  breakdown.forEach((entry) => {
    xpByLabel[entry.label] = (xpByLabel[entry.label] ?? 0) + entry.xp;
  });

  // CTA banner
  const dailyCap = status?.daily_cap ?? 500;
  const xpRemaining = Math.max(0, dailyCap - xpToday);
  const capReached = xpToday >= dailyCap;
  const bannerText = capReached
    ? 'Daily cap reached!'
    : 'Earn ' + xpRemaining + ' XP more today to reach your daily goal';

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

      {/* Tile grid — always shown, greyed out when empty */}
      <View style={styles.tileRow}>
        {FIXED_TILES.map((tile) => {
          const tileXp = xpByLabel[tile.label] ?? 0;
          return (
            <XpTile
              key={tile.label}
              label={tile.label}
              icon={tile.icon}
              xp={tileXp}
              isDark={isDark}
            />
          );
        })}
      </View>

      {/* Empty state CTA */}
      {isEmpty && onScrollToMissions && (
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            console.log('[TodaysXpBreakdown] View Missions pressed');
            onScrollToMissions();
          }}
        >
          <Text style={styles.ctaText}>
            View Missions
          </Text>
        </TouchableOpacity>
      )}

      {/* CTA banner replacing daily cap bar */}
      <View
        style={[
          styles.banner,
          {
            backgroundColor: capReached
              ? (isDark ? '#34D39922' : '#34D39915')
              : (isDark ? colors.primary + '22' : colors.primary + '15'),
          },
        ]}
      >
        {capReached && (
          <Ionicons name="flame" size={14} color="#34D399" style={styles.bannerIcon} />
        )}
        <Text
          style={[
            styles.bannerText,
            { color: capReached ? '#34D399' : colors.primary },
          ]}
        >
          {bannerText}
        </Text>
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
  tileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  tileIconBg: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  tileXp: {
    fontSize: 13,
    fontWeight: '800',
  },
  ctaButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  bannerIcon: {
    marginRight: 2,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
