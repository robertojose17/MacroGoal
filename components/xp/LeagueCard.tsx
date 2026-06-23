/**
 * LeagueCard
 *
 * Compact horizontal card showing the user's current league.
 * Sits between XpHeroCard and GoalWeightCard on the dashboard.
 * Tapping opens the LeagueLeaderboard modal.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useLeague } from '@/hooks/useLeague';
import { TIER_METADATA } from '@/types/leagues';
import LeagueLeaderboard from '@/components/xp/LeagueLeaderboard';

interface LeagueCardProps {
  isDark: boolean;
}

export default function LeagueCard({ isDark }: LeagueCardProps) {
  const { status, loading } = useLeague();
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  if (loading || !status) return null;

  const meta = TIER_METADATA[status.tier];

  // Zone state
  const isPromotion = status.is_in_promotion_zone;
  const isDemotion = status.is_in_demotion_zone;

  // Zone badge
  let zoneBadge: string | null = null;
  let zoneColor: string = meta.accent;
  if (isPromotion) { zoneBadge = '↑ Moving up'; zoneColor = '#5CB97B'; }
  else if (isDemotion) { zoneBadge = '⚠ Drop zone'; zoneColor = '#EF4444'; }

  // Position
  const positionText = `#${status.user_position} of ${status.member_count}`;

  // XP this week
  const xpText = `${status.user_xp_this_week.toLocaleString()} XP`;

  // Colors
  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#111827';
  const textSecondary = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';

  const handlePress = () => {
    console.log('[LeagueCard] tapped — opening LeagueLeaderboard', {
      tier: status.tier,
      position: status.user_position,
      memberCount: status.member_count,
    });
    setShowLeaderboard(true);
  };

  const handleClose = () => {
    console.log('[LeagueCard] LeagueLeaderboard closed');
    setShowLeaderboard(false);
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: cardBg, borderColor: isDark ? '#3A3C52' : 'rgba(0,0,0,0.07)', opacity: pressed ? 0.85 : 1 },
        ]}
      >
        {/* Main content */}
        <View style={styles.content}>
          {/* Left: emoji + league name */}
          <View style={styles.leftGroup}>
            <Text style={styles.emoji}>{meta.emoji}</Text>
            <View>
              <Text style={[styles.leagueName, { color: textPrimary }]}>{meta.label}</Text>
              <Text style={[styles.position, { color: textSecondary }]}>{positionText}</Text>
            </View>
          </View>

          {/* Right: XP + zone badge */}
          <View style={styles.rightGroup}>
            {zoneBadge && (
              <Text style={[styles.zoneBadge, { color: zoneColor }]}>{zoneBadge}</Text>
            )}
            <Text style={[styles.xpText, { color: meta.accent }]}>{xpText}</Text>
          </View>

          {/* Chevron */}
          <Text style={[styles.chevron, { color: textSecondary }]}>›</Text>
        </View>
      </Pressable>

      <LeagueLeaderboard
        visible={showLeaderboard}
        onClose={handleClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  cardLight: {
    borderColor: 'rgba(0,0,0,0.07)',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  leftGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emoji: {
    fontSize: 22,
  },
  leagueName: {
    fontSize: 14,
    fontWeight: '700',
  },
  position: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  rightGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  zoneBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  xpText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 20,
    fontWeight: '300',
    marginLeft: 2,
  },
});
