/**
 * ShareProgressBonus
 *
 * Embeds at the bottom of TodaysMissionsCard.
 * 3 states:
 *   1. Default — not claimed, not all-done
 *   2. Claimed  — already earned today
 *   3. Hero     — all missions done + not yet claimed (pulse animation)
 *
 * Handles the confirmation prompt on dashboard focus return via AsyncStorage flag.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Camera, CheckCircle2, Flame } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { fetchShareStats } from '@/utils/shareXpApi';
import { awardXp } from '@/utils/xpApi';
import { toLocalDateString } from '@/utils/dateUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const PENDING_FLAG_PREFIX = 'share_progress_pending_';
const PENDING_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Props ────────────────────────────────────────────────────────────────────

interface ShareProgressBonusProps {
  allDone: boolean;
  isDark: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShareProgressBonus({ allDone, isDark }: ShareProgressBonusProps) {
  const router = useRouter();

  const [todayCount, setTodayCount] = useState(0);
  const [userClaimedToday, setUserClaimedToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justEarned, setJustEarned] = useState(false);

  // Pulse animation for hero state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ─── Load share stats on mount ──────────────────────────────────────────
  useEffect(() => {
    console.log('[ShareProgressBonus] mounting, fetching share stats');
    fetchShareStats().then((stats) => {
      console.log('[ShareProgressBonus] share stats loaded:', stats);
      setTodayCount(stats.todayCount);
      setUserClaimedToday(stats.userClaimedToday);
      setLoading(false);
    });
  }, []);

  // ─── Pulse animation for hero state ─────────────────────────────────────
  useEffect(() => {
    const isHero = allDone && !userClaimedToday;

    if (isHero) {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseAnim.setValue(1);
    }

    return () => {
      pulseLoopRef.current?.stop();
    };
  }, [allDone, userClaimedToday, pulseAnim]);

  // ─── Check pending flag on focus return ─────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const today = toLocalDateString();
      const flagKey = PENDING_FLAG_PREFIX + today;

      async function checkPendingFlag() {
        try {
          const raw = await AsyncStorage.getItem(flagKey);
          if (!raw) return;

          const { timestamp } = JSON.parse(raw) as { timestamp: number };
          const age = Date.now() - timestamp;

          if (age > PENDING_TTL_MS) {
            console.log('[ShareProgressBonus] pending flag expired, clearing');
            await AsyncStorage.removeItem(flagKey);
            return;
          }

          // Re-check claimed status (might have changed)
          if (userClaimedToday) {
            console.log('[ShareProgressBonus] already claimed, clearing stale flag');
            await AsyncStorage.removeItem(flagKey);
            return;
          }

          console.log('[ShareProgressBonus] pending flag found, showing confirmation alert');

          Alert.alert(
            'Did you share your progress?',
            'Confirm to claim your +100 XP bonus.',
            [
              {
                text: 'Not yet',
                style: 'cancel',
                onPress: () => {
                  console.log('[ShareProgressBonus] user tapped "Not yet", keeping flag');
                },
              },
              {
                text: 'Yes, I shared it!',
                style: 'default',
                onPress: async () => {
                  console.log('[ShareProgressBonus] user confirmed share, awarding XP');
                  try {
                    await awardXp({ event_type: 'share_progress', source_id: today });
                    console.log('[ShareProgressBonus] awardXp success');

                    // Optimistic update
                    setUserClaimedToday(true);
                    setTodayCount((prev) => prev + 1);
                    setJustEarned(true);

                    await AsyncStorage.removeItem(flagKey);
                    console.log('[ShareProgressBonus] cleared pending flag');

                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

                    // Reset justEarned badge after 3s
                    setTimeout(() => setJustEarned(false), 3000);
                  } catch (err) {
                    console.warn('[ShareProgressBonus] awardXp failed:', err);
                    Alert.alert('Error', 'Could not claim XP. Please try again.');
                  }
                },
              },
            ]
          );
        } catch (err) {
          console.warn('[ShareProgressBonus] checkPendingFlag error:', err);
        }
      }

      checkPendingFlag();
    }, [userClaimedToday])
  );

  // ─── Press handler ───────────────────────────────────────────────────────
  async function handlePress() {
    console.log('[ShareProgressBonus] share button pressed, allDone:', allDone, 'claimed:', userClaimedToday);

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const today = toLocalDateString();
    const flagKey = PENDING_FLAG_PREFIX + today;

    try {
      await AsyncStorage.setItem(flagKey, JSON.stringify({ timestamp: Date.now() }));
      console.log('[ShareProgressBonus] pending flag saved:', flagKey);
    } catch (err) {
      console.warn('[ShareProgressBonus] failed to save pending flag:', err);
    }

    console.log('[ShareProgressBonus] navigating to /share-progress?source=missions_bonus');
    router.push('/share-progress?source=missions_bonus' as never);
  }

  // ─── Derived display values ──────────────────────────────────────────────
  const isHero = allDone && !userClaimedToday;
  const isClaimed = userClaimedToday;

  let containerStyle: object;
  let titleText: string;
  let titleColor: string;
  let IconComponent: typeof Camera;
  let iconColor: string;
  let isDisabled: boolean;

  if (isClaimed) {
    containerStyle = styles.claimedContainer;
    titleText = justEarned ? '✓ +100 XP earned!' : '+100 XP Earned · Come back tomorrow';
    titleColor = colors.success;
    IconComponent = CheckCircle2;
    iconColor = colors.success;
    isDisabled = true;
  } else if (isHero) {
    containerStyle = styles.heroContainer;
    titleText = 'All done! Share & Earn +100 XP';
    titleColor = colors.primary;
    IconComponent = Flame;
    iconColor = colors.primary;
    isDisabled = false;
  } else {
    containerStyle = styles.defaultContainer;
    titleText = 'Share Progress · Earn +100 XP today';
    titleColor = colors.warning;
    IconComponent = Camera;
    iconColor = colors.warning;
    isDisabled = false;
  }

  if (loading) return null;

  return (
    <Animated.View style={[{ transform: [{ scale: isHero ? pulseAnim : 1 }] }]}>
      <Pressable
        style={({ pressed }) => [
          styles.base,
          containerStyle,
          isDisabled && styles.disabledOpacity,
          pressed && !isDisabled && styles.pressedOpacity,
        ]}
        onPress={isDisabled ? undefined : handlePress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={titleText}
      >
        <View style={styles.row}>
          <IconComponent
            size={isHero ? 20 : 18}
            color={iconColor}
            strokeWidth={2}
          />
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: titleColor }, isHero && styles.heroTitle]}>
              {titleText}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  defaultContainer: {
    backgroundColor: colors.warning + '15',
    borderColor: colors.warning + '60',
  },
  claimedContainer: {
    backgroundColor: colors.success + '15',
    borderColor: colors.success + '60',
  },
  heroContainer: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  disabledOpacity: {
    opacity: 0.85,
  },
  pressedOpacity: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
});
