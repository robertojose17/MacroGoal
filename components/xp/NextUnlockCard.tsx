/**
 * NextUnlockCard
 *
 * Shows what cosmetic rewards unlock at the next level milestone.
 * Uses the static LEVEL_REWARDS table from constants/xpRewards.ts.
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { rankColors } from '@/constants/Colors';
import { findNextUnlock } from '@/constants/xpRewards';
import type { XpReward } from '@/constants/xpRewards';

interface NextUnlockCardProps {
  currentLevel: number;
  currentRank: string;
  isDark: boolean;
}

interface RewardRowProps {
  reward: XpReward;
  isDark: boolean;
}

function RewardRow({ reward, isDark }: RewardRowProps) {
  return (
    <View style={styles.rewardRow}>
      <Text style={styles.rewardIcon}>{reward.icon}</Text>
      <View style={styles.rewardText}>
        <Text style={[styles.rewardName, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
          {reward.name}
        </Text>
        <Text style={[styles.rewardDesc, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
          {reward.description}
        </Text>
      </View>
    </View>
  );
}

export default function NextUnlockCard({ currentLevel, currentRank, isDark }: NextUnlockCardProps) {
  const nextUnlock = findNextUnlock(currentLevel);
  const rankColor = rankColors[currentRank] ?? rankColors['Rookie'];

  const levelDisplay = nextUnlock ? 'Level ' + nextUnlock.level : null;

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
          Next Unlock
        </Text>
        <Text style={styles.lockEmoji}>🔓</Text>
      </View>

      {nextUnlock ? (
        <>
          {/* Level milestone */}
          <View style={[styles.levelBadge, { borderColor: rankColor.text }]}>
            <Text style={[styles.levelBadgeText, { color: rankColor.text }]}>
              {levelDisplay}
            </Text>
          </View>

          {/* Rewards list */}
          <View style={styles.rewardsList}>
            {nextUnlock.rewards.map((reward, idx) => (
              <RewardRow key={idx} reward={reward} isDark={isDark} />
            ))}
          </View>
        </>
      ) : (
        <View style={styles.maxLevelContainer}>
          <Text style={styles.maxLevelEmoji}>🏆</Text>
          <Text style={[styles.maxLevelText, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
            You've unlocked everything!
          </Text>
          <Text style={[styles.maxLevelSub, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            You've reached the highest milestone
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
  lockEmoji: {
    fontSize: 18,
  },
  levelBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  levelBadgeText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rewardsList: {
    gap: spacing.sm,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  rewardIcon: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  rewardText: {
    flex: 1,
  },
  rewardName: {
    fontSize: 14,
    fontWeight: '600',
  },
  rewardDesc: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  maxLevelContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  maxLevelEmoji: {
    fontSize: 36,
    marginBottom: spacing.xs,
  },
  maxLevelText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  maxLevelSub: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
});
