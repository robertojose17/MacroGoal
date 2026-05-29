/**
 * SocialComparisonCard
 *
 * Shows the user's standing relative to other users.
 * Hides meaningless percentiles for small sample sizes.
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { rankColors } from '@/constants/Colors';
import type { UserRanking } from '@/types/xp';

interface SocialComparisonCardProps {
  ranking: UserRanking | null;
  currentRank: string;
  isDark: boolean;
}

export default function SocialComparisonCard({ ranking, currentRank, isDark }: SocialComparisonCardProps) {
  const rankColor = rankColors[currentRank] ?? rankColors['Rookie'];
  const [gradStart, gradEnd] = rankColor.gradient;

  const hasEnoughData = ranking !== null && ranking.total_users >= 5 && ranking.percentile !== null;

  // Pre-compute display values
  const topPercent = hasEnoughData ? Math.max(1, Math.round(100 - (ranking!.percentile ?? 0))) : 0;
  const topPercentDisplay = String(topPercent);
  const betterThanDisplay = hasEnoughData ? (ranking!.percentile ?? 0).toFixed(0) : '0';
  const rankPositionDisplay = hasEnoughData && ranking!.rank_position !== null
    ? '#' + ranking!.rank_position
    : '';
  const totalUsersDisplay = hasEnoughData ? ranking!.total_users.toLocaleString() : '';

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
          Your Standing
        </Text>
        <Text style={styles.globeEmoji}>🌍</Text>
      </View>

      {hasEnoughData ? (
        <>
          {/* Gradient stat block */}
          <LinearGradient
            colors={[gradStart + '22', gradEnd + '11']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.statBlock, { borderColor: rankColor.text + '33' }]}
          >
            <View style={styles.topRow}>
              <Text style={styles.topLabel}>TOP</Text>
              <Text style={[styles.topPercent, { color: rankColor.text }]}>
                {topPercentDisplay}
                <Text style={styles.topPercentSign}>%</Text>
              </Text>
            </View>
            <Text style={[styles.subtitle, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
              {'More consistent than '}
              {betterThanDisplay}
              {'% of users'}
            </Text>
            {rankPositionDisplay !== '' && (
              <Text style={[styles.rankPosition, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
                {rankPositionDisplay}
                {' of '}
                {totalUsersDisplay}
              </Text>
            )}
          </LinearGradient>

          {/* Beta note */}
          <Text style={[styles.betaNote, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
            Beta — friend rankings coming soon
          </Text>
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🌱</Text>
          <Text style={[styles.emptyText, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            Building your community...
          </Text>
          <Text style={[styles.emptySubtext, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
            Keep earning XP to unlock your ranking!
          </Text>
          <Text style={[styles.betaNote, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
            Beta — friend rankings coming soon
          </Text>
        </View>
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
  globeEmoji: {
    fontSize: 18,
  },
  statBlock: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 4,
  },
  topLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)',
  },
  topPercent: {
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 58,
    letterSpacing: -2,
  },
  topPercentSign: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  rankPosition: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  betaNote: {
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
});
