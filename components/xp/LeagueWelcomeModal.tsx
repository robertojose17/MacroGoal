/**
 * LeagueWelcomeModal
 *
 * Celebratory modal shown exactly once (tracked via AsyncStorage) when a user
 * is auto-assigned to their first league (status.is_first_assignment === true).
 *
 * Offers two actions:
 * - "View my league" → opens LeagueLeaderboard
 * - "Got it" → dismisses
 *
 * After either action, sets AsyncStorage key `league_welcome_seen_v1` so the
 * modal never appears again for this user.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useLeague } from '@/hooks/useLeague';
import { TIER_METADATA } from '@/types/leagues';
import LeagueLeaderboard from './LeagueLeaderboard';

const WELCOME_SEEN_KEY = 'league_welcome_seen_v1';

export default function LeagueWelcomeModal() {
  const isDark = useColorScheme() === 'dark';
  const { status } = useLeague();
  const [visible, setVisible] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Check if we should show the welcome modal
  useEffect(() => {
    if (!status?.is_first_assignment) return;

    AsyncStorage.getItem(WELCOME_SEEN_KEY)
      .then((val) => {
        if (val === null) {
          console.log('[LeagueWelcomeModal] first assignment detected — showing welcome modal');
          setVisible(true);
        } else {
          console.log('[LeagueWelcomeModal] welcome already seen — skipping');
        }
      })
      .catch((err) => {
        console.warn('[LeagueWelcomeModal] AsyncStorage read error:', err?.message ?? err);
      });
  }, [status?.is_first_assignment]);

  const dismiss = async () => {
    console.log('[LeagueWelcomeModal] dismissed');
    try {
      await AsyncStorage.setItem(WELCOME_SEEN_KEY, '1');
    } catch (err) {
      console.warn('[LeagueWelcomeModal] AsyncStorage write error:', err?.message ?? err);
    }
    setVisible(false);
  };

  const handleViewLeague = async () => {
    console.log('[LeagueWelcomeModal] "View my league" pressed');
    await dismiss();
    setShowLeaderboard(true);
  };

  const handleGotIt = async () => {
    console.log('[LeagueWelcomeModal] "Got it" pressed');
    await dismiss();
  };

  if (!status) return null;

  const meta = TIER_METADATA[status.tier];
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textPrimary = isDark ? colors.textDark : colors.text;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const modalBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)';

  const nextTierLabel = (() => {
    const nextMeta = TIER_METADATA['silver'];
    return nextMeta ? nextMeta.label : 'the next league';
  })();

  const bodyText = `Compete this week — top ${status.promotion_zone_size} players advance to ${nextTierLabel}. Earn XP by logging meals, workouts, and hitting your goals.`;

  return (
    <>
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={handleGotIt}
      >
        <View style={[styles.overlay, { backgroundColor: modalBg }]}>
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            {/* Tier gradient banner */}
            <LinearGradient
              colors={meta.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientBanner}
            >
              <Text style={styles.bannerEmoji}>{meta.emoji}</Text>
            </LinearGradient>

            {/* Content */}
            <View style={styles.content}>
              <Text style={[styles.title, { color: textPrimary }]}>
                {'You entered '}
                {meta.label}
                {'!'}
              </Text>
              <Text style={[styles.body, { color: textSecondary }]}>
                {bodyText}
              </Text>

              {/* Actions */}
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: meta.accent }]}
                onPress={handleViewLeague}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>
                  View my league
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: isDark ? colors.borderDark : colors.border }]}
                onPress={handleGotIt}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryButtonText, { color: textSecondary }]}>
                  Got it
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Leaderboard opened from welcome modal */}
      <LeagueLeaderboard
        visible={showLeaderboard}
        onClose={() => {
          console.log('[LeagueWelcomeModal] leaderboard closed');
          setShowLeaderboard(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
    }),
  },
  gradientBanner: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerEmoji: {
    fontSize: 48,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  primaryButton: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
