/**
 * SocialComparisonCard
 *
 * Compact horizontal pill/banner showing the user's standing relative to others.
 * Sits right below the Hero Card as a sub-hero strip.
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
  const consistencyPercentDisplay = hasEnoughData
    ? (ranking!.consistency_percentile ?? 0).toFixed(0)
    : '0';


  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[gradStart + '15', gradEnd + '08']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.pill,
          { borderColor: rankColor.text + '33' },
        ]}
      >
        <Ionicons name="globe-outline" size={16} color={rankColor.text} style={styles.globeIcon} />

        {hasEnoughData ? (
          <Text
            style={[styles.statsLine, { color: isDark ? '#A0A2B8' : '#6B7280' }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            <Text style={[styles.statChip, { color: rankColor.text }]}>
              {'TOP '}{topPercentDisplay}{'%'}
            </Text>
            <Text style={{ color: isDark ? '#3A3C52' : '#D4D6DA' }}>{'  ·  '}</Text>
            <Text style={styles.statText}>
              {'More consistent than '}{consistencyPercentDisplay}{'% of users'}
            </Text>
          </Text>
        ) : (
          <Text style={[styles.emptyText, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            Building your community — keep earning XP!
          </Text>
        )}
      </LinearGradient>
      <Text style={[styles.betaNote, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
        Beta — friend rankings coming soon
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  globeIcon: {
    flexShrink: 0,
  },
  statsLine: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  statChip: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  betaNote: {
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
