/**
 * ShareProgressBonus
 *
 * Embeds at the bottom of TodaysMissionsCard.
 * 3 states:
 *   1. Default — not claimed, not all-done
 *   2. Claimed  — already earned today
 *   3. Hero     — all missions done + not yet claimed (pulse animation)
 *
 * On press: captures an off-screen XpShareCard and opens the native share sheet
 * directly — no intermediate /share-progress screen.
 *
 * Confirmation prompt fires only when the app returns from background (AppState
 * background→active), NOT on internal navigation focus changes.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Alert,
  AppState,
  AppStateStatus,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { Camera, CheckCircle2, Flame } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { fetchShareStats } from '@/utils/shareXpApi';
import { awardXp } from '@/utils/xpApi';
import { toLocalDateString } from '@/utils/dateUtils';
import { useXpStatus } from '@/hooks/useXpStatus';
import { supabase } from '@/lib/supabase/client';
import XpShareCard, { XpShareCardHandle, XP_CARD_WIDTH, XP_CARD_HEIGHT } from '@/components/xp/XpShareCard';

// ─── Constants ────────────────────────────────────────────────────────────────

const PENDING_FLAG_PREFIX = 'share_progress_pending_';
const PENDING_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Props ────────────────────────────────────────────────────────────────────

interface ShareProgressBonusProps {
  allDone: boolean;
  isDark: boolean;
}

// ─── Minimal card data needed for XpShareCard ─────────────────────────────────

interface XpCardData {
  consistencyScore: number;
  calorieDeficit: number;
  username: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShareProgressBonus({ allDone, isDark }: ShareProgressBonusProps) {
  const router = useRouter();

  const [todayCount, setTodayCount] = useState(0);
  const [userClaimedToday, setUserClaimedToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justEarned, setJustEarned] = useState(false);
  const [sharing, setSharing] = useState(false);

  // XP status for the card
  const { status: xpStatus } = useXpStatus();

  // Minimal card data (consistency, deficit, username)
  const [cardData, setCardData] = useState<XpCardData>({
    consistencyScore: 0,
    calorieDeficit: 0,
    username: null,
  });

  // Off-screen XpShareCard ref
  const xpCardRef = useRef<XpShareCardHandle>(null);

  // Pulse animation for hero state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Track previous AppState to detect background→active transition only
  const prevAppState = useRef<AppStateStatus>(AppState.currentState);

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

  // ─── Load minimal card data for XpShareCard ─────────────────────────────
  useEffect(() => {
    async function loadMinimalCardData() {
      try {
        console.log('[ShareProgressBonus] loading minimal card data for XpShareCard');
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;

        const [{ data: userData }, { data: goalData }, { data: meals }] = await Promise.all([
          supabase.from('users').select('username').eq('id', authUser.id).maybeSingle(),
          supabase.from('goals').select('daily_calories').eq('user_id', authUser.id).eq('is_active', true).maybeSingle(),
          supabase
            .from('meals')
            .select('date, meal_items(calories)')
            .eq('user_id', authUser.id)
            .gte('date', (() => {
              const d = new Date();
              d.setDate(d.getDate() - 6);
              return toLocalDateString(d);
            })()),
        ]);

        // 7-day calorie deficit
        let calorieDeficit = 0;
        if (goalData?.daily_calories && meals) {
          const dailyTotals: Record<string, number> = {};
          for (const m of meals) {
            const items = (m as any).meal_items ?? [];
            const dayCals = items.reduce((s: number, i: any) => s + (Number(i.calories) || 0), 0);
            dailyTotals[m.date] = (dailyTotals[m.date] ?? 0) + dayCals;
          }
          for (const cals of Object.values(dailyTotals)) {
            const diff = goalData.daily_calories - cals;
            if (diff > 0) calorieDeficit += diff;
          }
          calorieDeficit = Math.round(calorieDeficit);
        }

        console.log('[ShareProgressBonus] card data loaded — username:', userData?.username, 'deficit:', calorieDeficit);

        setCardData({
          consistencyScore: 0, // lightweight — skip heavy consistency calc here
          calorieDeficit,
          username: userData?.username ?? null,
        });
      } catch (err) {
        console.warn('[ShareProgressBonus] loadMinimalCardData error:', err);
      }
    }

    loadMinimalCardData();
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

  // ─── AppState listener — only fires on background→active transition ──────
  const checkPendingFlag = useCallback(async () => {
    const today = toLocalDateString();
    const flagKey = PENDING_FLAG_PREFIX + today;

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

      console.log('[ShareProgressBonus] pending flag found after app foreground, showing confirmation alert');

      Alert.alert(
        'Did you share your progress?',
        'Confirm to claim your +100 XP bonus.',
        [
          {
            text: 'Not yet',
            style: 'cancel',
            onPress: async () => {
              console.log('[ShareProgressBonus] user tapped "Not yet", clearing flag');
              // Clear flag so we don't re-prompt indefinitely
              try {
                await AsyncStorage.removeItem(flagKey);
                console.log('[ShareProgressBonus] pending flag cleared after "Not yet"');
              } catch (e) {
                console.warn('[ShareProgressBonus] failed to clear flag on "Not yet":', e);
              }
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
                console.log('[ShareProgressBonus] cleared pending flag after XP award');

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
  }, [userClaimedToday]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      console.log('[ShareProgressBonus] AppState change:', prevAppState.current, '→', nextState);

      const wasBackground =
        prevAppState.current === 'background' || prevAppState.current === 'inactive';
      const isNowActive = nextState === 'active';

      if (wasBackground && isNowActive) {
        console.log('[ShareProgressBonus] app returned from background — checking pending flag');
        checkPendingFlag();
      }

      prevAppState.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [checkPendingFlag]);

  // ─── Press handler — direct capture + share ──────────────────────────────
  async function handlePress() {
    console.log('[ShareProgressBonus] share button pressed, allDone:', allDone, 'claimed:', userClaimedToday);

    if (sharing) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Check if sharing is available (web / Expo Go may not support it)
    let sharingAvailable = false;
    try {
      sharingAvailable = await Sharing.isAvailableAsync();
    } catch {
      sharingAvailable = false;
    }

    if (!sharingAvailable || Platform.OS === 'web') {
      console.log('[ShareProgressBonus] sharing not available, falling back to /share-progress screen');
      router.push('/share-progress?source=missions_bonus' as never);
      return;
    }

    // Attempt direct capture
    if (!xpCardRef.current) {
      console.log('[ShareProgressBonus] XpShareCard ref not ready, falling back to /share-progress screen');
      router.push('/share-progress?source=missions_bonus' as never);
      return;
    }

    setSharing(true);

    const today = toLocalDateString();
    const flagKey = PENDING_FLAG_PREFIX + today;
    let flagSaved = false;

    try {
      console.log('[ShareProgressBonus] starting card capture');
      const uri = await xpCardRef.current.captureWhenReady();
      console.log('[ShareProgressBonus] card captured:', uri);

      // Save pending flag BEFORE opening share sheet
      try {
        await AsyncStorage.setItem(flagKey, JSON.stringify({ timestamp: Date.now() }));
        flagSaved = true;
        console.log('[ShareProgressBonus] pending flag saved:', flagKey);
      } catch (err) {
        console.warn('[ShareProgressBonus] failed to save pending flag:', err);
      }

      console.log('[ShareProgressBonus] opening native share sheet');
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your progress',
      });
      console.log('[ShareProgressBonus] share sheet dismissed');
    } catch (err) {
      console.warn('[ShareProgressBonus] capture/share failed:', err);

      // Remove pending flag if we saved it but share failed
      if (flagSaved) {
        try {
          await AsyncStorage.removeItem(flagKey);
          console.log('[ShareProgressBonus] removed pending flag after share failure');
        } catch {}
      }

      // Fall back to the full screen
      console.log('[ShareProgressBonus] falling back to /share-progress screen after error');
      router.push('/share-progress?source=missions_bonus' as never);
    } finally {
      setSharing(false);
    }
  }

  // ─── Derived display values ──────────────────────────────────────────────
  const isHero = allDone && !userClaimedToday;
  const isClaimed = userClaimedToday;

  let titleText: string;
  let subtitleText: string;
  let titleColor: string;
  let IconComponent: typeof Camera;
  let iconColor: string;
  let isDisabled: boolean;

  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const primaryTextColor = isDark ? colors.textDark : colors.text;

  if (isClaimed) {
    titleText = justEarned ? '✓ +100 XP earned!' : '+100 XP Earned';
    subtitleText = 'Come back tomorrow to share again';
    titleColor = colors.success;
    IconComponent = CheckCircle2;
    iconColor = colors.success;
    isDisabled = true;
  } else if (isHero) {
    titleText = 'Share & Earn +100 XP';
    subtitleText = 'All missions complete — claim your bonus';
    titleColor = primaryTextColor;
    IconComponent = Flame;
    iconColor = colors.primary;
    isDisabled = false;
  } else {
    titleText = 'Share Progress';
    subtitleText = 'Earn +100 XP today';
    titleColor = primaryTextColor;
    IconComponent = Camera;
    iconColor = colors.primary;
    isDisabled = false;
  }

  const surfaceStyle = {
    backgroundColor: isDark ? colors.cardDark : colors.card,
    borderColor: isHero ? colors.primary : (isDark ? colors.cardBorderDark : colors.cardBorder),
    borderWidth: isHero ? 1.5 : 1,
    ...(isDark ? {} : { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)', elevation: 4 }),
  };

  if (loading) return null;

  // XP card props — use safe defaults when xpStatus not yet loaded
  const cardLevel = xpStatus?.current_level ?? 1;
  const cardRank = xpStatus?.current_rank ?? 'Rookie';
  const cardTotalXp = xpStatus?.total_xp ?? 0;
  const cardStreak = xpStatus?.current_streak ?? 0;
  const cardPercentile = xpStatus?.ranking?.percentile ?? 50;

  return (
    <>
      {/* Off-screen XpShareCard — always mounted so ref is ready on press */}
      <View
        style={styles.offScreenCapture}
        pointerEvents="none"
      >
        <XpShareCard
          ref={xpCardRef}
          level={cardLevel}
          rank={cardRank}
          totalXp={cardTotalXp}
          currentStreak={cardStreak}
          consistencyScore={cardData.consistencyScore}
          percentile={cardPercentile}
          calorieDeficit={cardData.calorieDeficit}
          username={cardData.username}
        />
      </View>

      <Animated.View style={[{ transform: [{ scale: isHero ? pulseAnim : 1 }] }]}>
        <Pressable
          style={({ pressed }) => [
            styles.base,
            surfaceStyle,
            isDisabled && styles.disabledOpacity,
            (pressed && !isDisabled) || sharing ? styles.pressedOpacity : undefined,
          ]}
          onPress={isDisabled ? undefined : handlePress}
          disabled={isDisabled || sharing}
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
              {sharing ? (
                <Text style={[styles.title, { color: titleColor, fontWeight: '700' }]}>
                  Preparing share…
                </Text>
              ) : (
                <>
                  <Text style={[styles.title, { color: titleColor, fontWeight: '700' }]}>
                    {titleText}
                  </Text>
                  <Text style={[styles.subtitle, { color: mutedColor }]}>
                    {subtitleText}
                  </Text>
                </>
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  offScreenCapture: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: XP_CARD_WIDTH,
    height: XP_CARD_HEIGHT,
  },
  base: {
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
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
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});
