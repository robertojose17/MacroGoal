
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  LayoutAnimation,
} from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { listTrackers, getStats, listEntries, logEntry, Tracker, TrackerStats } from '@/utils/trackersApi';
import { tryAwardWorkout, tryAwardWeightCheckin } from '@/utils/xpAwarder';
import { toLocalDateString } from '@/utils/dateUtils';
import { fetchLeaderboard, type LeaderboardStats } from '@/utils/leaderboardApi';
import { CommunityLeaderboard } from '@/components/CommunityLeaderboard';
import {
  Flame,
  Trophy,
  Plus,
  ChevronRight,
  CheckCircle2,
  RotateCw,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSteps } from '@/hooks/useSteps';

// ─── Cache helpers ────────────────────────────────────────────────────────────
const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = 'check-ins-cache-v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CheckInsCache {
  trackers: Tracker[];
  statsMap: Record<string, TrackerStats>;
  todayEntries: Record<string, { id: string; value: number } | null>;
  cachedAt: number;
  cachedDate: string;
}

async function readCache(): Promise<CheckInsCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckInsCache;
    const today = toLocalDateString(new Date());
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    if (parsed.cachedDate !== today) return null;
    return parsed;
  } catch (err) {
    console.warn('[CheckIns] cache read failed:', err);
    return null;
  }
}

async function writeCache(data: Omit<CheckInsCache, 'cachedAt' | 'cachedDate'>): Promise<void> {
  try {
    const payload: CheckInsCache = {
      ...data,
      cachedAt: Date.now(),
      cachedDate: toLocalDateString(new Date()),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[CheckIns] cache write failed:', err);
  }
}

// ─── AnimatedPressable ────────────────────────────────────────────────────────
function AnimatedPressable({
  onPress,
  style,
  children,
  scaleValue = 0.97,
  disabled,
}: {
  onPress?: () => void;
  style?: object | object[];
  children: React.ReactNode;
  scaleValue?: number;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animIn = () =>
    Animated.spring(scale, { toValue: scaleValue, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const animOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>
      <Pressable onPressIn={animIn} onPressOut={animOut} onPress={onPress} style={style} disabled={disabled}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── AnimatedListItem ─────────────────────────────────────────────────────────
function AnimatedListItem({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay: index * 80, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay: index * 80, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────
function SkeletonCard({ isDark }: { isDark: boolean }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bg = isDark ? colors.cardDark : colors.card;
  const shimmer = isDark ? '#3A3C52' : '#D4D6DA';
  return (
    <Animated.View style={[styles.card, { backgroundColor: bg, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder, opacity }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.emojiCircle, { backgroundColor: shimmer }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.skeletonLine, { width: '50%', backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: '30%', height: 11, backgroundColor: shimmer }]} />
        </View>
        <View style={[styles.skeletonPill, { backgroundColor: shimmer }]} />
      </View>
      <View style={[styles.divider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
      <View style={{ gap: 8 }}>
        <View style={[styles.skeletonLine, { width: '60%', height: 36, backgroundColor: shimmer, borderRadius: 8 }]} />
        <View style={[styles.skeletonLine, { width: '40%', backgroundColor: shimmer }]} />
      </View>
      <View style={[styles.communityDivider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
      <View style={[styles.skeletonLine, { width: '70%', height: 11, backgroundColor: shimmer }]} />
    </Animated.View>
  );
}

// ─── CommunityFooterSkeleton ──────────────────────────────────────────────────
function CommunityFooterSkeleton({ isDark }: { isDark: boolean }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shimmer = isDark ? '#3A3C52' : '#D4D6DA';
  return (
    <Animated.View style={[styles.communityFooter, { opacity }]}>
      <View style={[styles.skeletonLine, { width: 60, height: 20, borderRadius: 10, backgroundColor: shimmer }]} />
      <View style={[styles.skeletonLine, { width: 140, height: 11, backgroundColor: shimmer }]} />
    </Animated.View>
  );
}

// ─── CommunityFooter ──────────────────────────────────────────────────────────
function CommunityFooter({
  stats,
  loading,
  isDark,
  trackerType,
}: {
  stats: LeaderboardStats | null;
  loading: boolean;
  isDark: boolean;
  trackerType: 'steps' | 'gym' | 'weight' | null;
}) {
  // Weight: no community footer
  if (trackerType === 'weight') return null;

  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  if (loading) {
    return (
      <>
        <View style={[styles.communityDivider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
        <CommunityFooterSkeleton isDark={isDark} />
      </>
    );
  }

  if (!stats || stats.totalUsers === 0) return null;

  const pct = Math.round(stats.percentile);
  const avg = Math.round(stats.communityAvg).toLocaleString('en-US');
  const unit = trackerType === 'steps' ? 'steps' : 'sessions';

  // Badge color: green top 25%, neutral middle, warm nudge bottom
  let badgeBg: string;
  let badgeText: string;
  if (pct >= 75) {
    badgeBg = colors.success + '22';
    badgeText = colors.success;
  } else if (pct >= 40) {
    badgeBg = colors.primary + '22';
    badgeText = colors.primary;
  } else {
    badgeBg = colors.warning + '22';
    badgeText = colors.warning;
  }

  const topLabel = `Top ${100 - pct}%`;
  const avgLabel = trackerType === 'steps'
    ? `Community avg ${avg} today`
    : `Community avg ${avg} ${unit} this month`;

  return (
    <>
      <View style={[styles.communityDivider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
      <View style={styles.communityFooter}>
        <View style={[styles.percentileBadge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.percentileText, { color: badgeText }]}>{topLabel}</Text>
        </View>
        <Text style={[styles.communityAvgText, { color: subColor }]}>{avgLabel}</Text>
      </View>
    </>
  );
}

// ─── Default tracker type mapping ────────────────────────────────────────────
function getCheckInType(name: string): 'weight' | 'steps' | 'gym' | null {
  const lower = name.toLowerCase();
  if (lower === 'weight') return 'weight';
  if (lower === 'steps') return 'steps';
  if (lower === 'gym') return 'gym';
  return null;
}

// ─── StepsActionArea ──────────────────────────────────────────────────────────
function StepsActionArea({
  steps,
  permission,
  loading,
  goalValue,
  isRefreshing,
  isDark,
  onRefresh,
  onRequestPermission,
}: {
  steps: number | null;
  permission: string;
  loading: boolean;
  goalValue: number | null;
  isRefreshing: boolean;
  isDark: boolean;
  onRefresh: () => void;
  onRequestPermission: () => void;
}) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinRef = useRef<Animated.CompositeAnimation | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRefreshing) {
      spinRef.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 700, useNativeDriver: true })
      );
      spinRef.current.start();
    } else {
      spinRef.current?.stop();
      spinAnim.setValue(0);
    }
  }, [isRefreshing, spinAnim]);

  const goal = goalValue && goalValue > 0 ? goalValue : 0;
  const count = steps ?? 0;
  const pct = goal > 0 ? Math.min(100, (count / goal) * 100) : 0;

  useEffect(() => {
    Animated.timing(progressAnim, { toValue: pct, duration: 600, useNativeDriver: false }).start();
  }, [pct, progressAnim]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const trackColor = isDark ? '#2A2C40' : '#E5E7EB';
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const textColor = isDark ? colors.textDark : colors.text;

  if (permission !== 'granted') {
    return (
      <AnimatedPressable
        onPress={() => {
          console.log('[CheckIns] Steps Connect Apple Health tapped');
          onRequestPermission();
        }}
        style={[styles.logButton, { backgroundColor: colors.primary }]}
        scaleValue={0.94}
      >
        <Text style={styles.logButtonText}>Connect</Text>
      </AnimatedPressable>
    );
  }

  if (loading && steps === null) {
    return <ActivityIndicator size="small" color={colors.primary} />;
  }

  const countFormatted = count.toLocaleString('en-US');
  const goalFormatted = goal > 0 ? goal.toLocaleString('en-US') : null;

  return (
    <View style={styles.stepsActionRow}>
      <View style={styles.stepsInfoCol}>
        {goal > 0 ? (
          <View style={styles.stepsCountRow}>
            <Text style={[styles.stepsCount, { color: textColor }]}>{countFormatted}</Text>
            <Text style={[styles.stepsUnit, { color: subColor }]}>{' / '}{goalFormatted}</Text>
          </View>
        ) : (
          <View style={styles.stepsCountRow}>
            <Text style={[styles.stepsCount, { color: textColor }]}>{countFormatted}</Text>
            <Text style={[styles.stepsUnit, { color: subColor }]}>{' steps'}</Text>
          </View>
        )}
        {goal > 0 ? (
          <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                },
              ]}
            />
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={() => {
          console.log('[CheckIns] Steps refresh button tapped');
          onRefresh();
        }}
        style={[styles.refreshButton, { backgroundColor: colors.primary }]}
      >
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <RotateCw size={15} color="#fff" strokeWidth={2.5} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ─── WeightTrend ──────────────────────────────────────────────────────────────
function WeightTrend({ trackerId, isDark }: { trackerId: string; isDark: boolean }) {
  const [delta, setDelta] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await listEntries(trackerId, 14);
        if (cancelled) return;
        const today = toLocalDateString(new Date());
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = toLocalDateString(sevenDaysAgo);

        const recent = entries.find((e) => e.date === today || e.date <= today);
        const older = entries.find((e) => e.date <= sevenDaysAgoStr);

        if (recent && older && recent.id !== older.id) {
          setDelta(Number(recent.value) - Number(older.value));
        }
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerId]);

  if (!loaded || delta === null) return null;

  const isDown = delta < 0;
  const isUp = delta > 0;
  const absDelta = Math.abs(delta).toFixed(1);
  const trendColor = isDown ? colors.success : isUp ? colors.warning : (isDark ? colors.textSecondaryDark : colors.textSecondary);
  const TrendIcon = isDown ? TrendingDown : isUp ? TrendingUp : Minus;
  const label = isDown
    ? `↓ ${absDelta} lb this week`
    : isUp
    ? `↑ ${absDelta} lb this week`
    : 'No change this week';

  return (
    <View style={styles.trendRow}>
      <TrendIcon size={13} color={trendColor} strokeWidth={2} />
      <Text style={[styles.trendText, { color: trendColor }]}>{label}</Text>
    </View>
  );
}

// ─── TrackerCard ──────────────────────────────────────────────────────────────
function TrackerCard({
  tracker,
  stats,
  isDark,
  onPress,
  onLog,
  todayEntry,
  onQuickLog,
  stepsHook,
  onStepsRefresh,
  communityStats,
  communityLoading,
}: {
  tracker: Tracker;
  stats: TrackerStats | null;
  isDark: boolean;
  onPress: () => void;
  onLog: () => void;
  todayEntry: { id: string; value: number } | null;
  onQuickLog?: (value: number) => Promise<void> | void;
  stepsHook?: ReturnType<typeof useSteps>;
  onStepsRefresh?: () => Promise<void>;
  communityStats: LeaderboardStats | null;
  communityLoading: boolean;
}) {
  const [weightInput, setWeightInput] = useState('');
  const [weightEditing, setWeightEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [stepsRefreshing, setStepsRefreshing] = useState(false);

  const streak = stats ? Number(stats.current_streak) : 0;
  const completionPct = stats ? Math.round(Number(stats.completion_rate) * 100) : 0;
  const statusColor =
    stats?.status === 'on_track' ? colors.success :
    stats?.status === 'improving' ? colors.primary :
    colors.warning;

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#1A1C2E' : '#FFFFFF';

  const isWeight = tracker.is_default && tracker.name.toLowerCase() === 'weight';
  const isGym = tracker.is_default && tracker.name.toLowerCase() === 'gym';
  const isSteps = tracker.is_default && tracker.name.toLowerCase() === 'steps';
  const trackerType = getCheckInType(tracker.name);
  const loggedToday = todayEntry !== null;

  const handleGymLog = async () => {
    if (logging) return;
    console.log('[CheckIns] Gym quick-log tapped, tracker:', tracker.id);
    setLogging(true);
    try {
      await onQuickLog?.(1);
    } finally {
      setLogging(false);
    }
  };

  const handleWeightLog = async () => {
    const parsed = parseFloat(weightInput);
    console.log('[CheckIns] Weight quick-log tapped, value:', weightInput, 'parsed:', parsed);
    if (isNaN(parsed) || parsed <= 0 || parsed >= 1000) {
      Alert.alert('Invalid weight', 'Please enter a weight between 0 and 1000 lbs.');
      return;
    }
    if (logging) return;
    setLogging(true);
    try {
      await onQuickLog?.(parsed);
      setWeightInput('');
    } finally {
      setLogging(false);
    }
  };

  const handleWeightSave = async () => {
    const parsed = parseFloat(weightInput);
    console.log('[CheckIns] Weight save tapped, value:', weightInput, 'parsed:', parsed);
    if (isNaN(parsed) || parsed <= 0 || parsed >= 1000) {
      Alert.alert('Invalid weight', 'Please enter a weight between 0 and 1000 lbs.');
      return;
    }
    if (logging) return;
    setLogging(true);
    try {
      await onQuickLog?.(parsed);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setWeightEditing(false);
      setWeightInput('');
    } finally {
      setLogging(false);
    }
  };

  const handleWeightPillPress = () => {
    console.log('[CheckIns] Weight value pill tapped — entering edit mode');
    const currentVal = todayEntry ? todayEntry.value.toFixed(1) : '';
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setWeightInput(currentVal);
    setWeightEditing(true);
  };

  const handleStepsRefreshPress = async () => {
    if (stepsRefreshing) return;
    setStepsRefreshing(true);
    try {
      await onStepsRefresh?.();
    } finally {
      setStepsRefreshing(false);
    }
  };

  // ── Zone A: right-side action ───────────────────────────────────────────────
  let actionArea: React.ReactNode;

  if (isSteps) {
    actionArea = (
      <StepsActionArea
        steps={stepsHook?.steps ?? null}
        permission={stepsHook?.permission ?? 'unknown'}
        loading={stepsHook?.loading ?? false}
        goalValue={tracker.goal_value}
        isRefreshing={stepsRefreshing}
        isDark={isDark}
        onRefresh={handleStepsRefreshPress}
        onRequestPermission={() => {
          console.log('[CheckIns] Steps requestPermission called from card');
          stepsHook?.requestPermission();
        }}
      />
    );
  } else if (isGym) {
    if (loggedToday) {
      actionArea = (
        <View style={styles.donePill}>
          <CheckCircle2 size={14} color={colors.success} strokeWidth={2.5} />
          <Text style={[styles.donePillText, { color: colors.success }]}>Done</Text>
        </View>
      );
    } else {
      actionArea = (
        <AnimatedPressable
          onPress={handleGymLog}
          style={[styles.logButton, { backgroundColor: colors.primary, opacity: logging ? 0.6 : 1 }]}
          scaleValue={0.94}
        >
          <Plus size={14} color="#fff" strokeWidth={2.5} />
          <Text style={styles.logButtonText}>Log</Text>
        </AnimatedPressable>
      );
    }
  } else if (isWeight) {
    if (loggedToday && !weightEditing) {
      const displayValue = todayEntry ? Number(todayEntry.value).toFixed(1) : '';
      actionArea = (
        <Pressable onPress={handleWeightPillPress} style={styles.donePill}>
          <CheckCircle2 size={14} color={colors.success} strokeWidth={2.5} />
          <Text style={[styles.donePillText, { color: colors.success }]}>{displayValue}</Text>
          <Text style={[styles.donePillUnit, { color: colors.success }]}>lb</Text>
        </Pressable>
      );
    } else if (weightEditing) {
      actionArea = (
        <View style={styles.weightRow}>
          <TextInput
            style={[styles.weightInput, { backgroundColor: inputBg, color: textColor, borderColor: cardBorder }]}
            value={weightInput}
            onChangeText={setWeightInput}
            keyboardType="decimal-pad"
            placeholder="lbs"
            placeholderTextColor={subColor}
            returnKeyType="done"
            onSubmitEditing={handleWeightSave}
            autoFocus
          />
          <AnimatedPressable
            onPress={handleWeightSave}
            style={[styles.logButton, { backgroundColor: colors.primary, opacity: logging ? 0.6 : 1 }]}
            scaleValue={0.94}
          >
            <Text style={styles.logButtonText}>Save</Text>
          </AnimatedPressable>
        </View>
      );
    } else {
      actionArea = (
        <View style={styles.weightRow}>
          <TextInput
            style={[styles.weightInput, { backgroundColor: inputBg, color: textColor, borderColor: cardBorder }]}
            value={weightInput}
            onChangeText={setWeightInput}
            keyboardType="decimal-pad"
            placeholder="lbs"
            placeholderTextColor={subColor}
            returnKeyType="done"
            onSubmitEditing={handleWeightLog}
          />
          <AnimatedPressable
            onPress={handleWeightLog}
            style={[styles.logButton, { backgroundColor: colors.primary, opacity: logging ? 0.6 : 1 }]}
            scaleValue={0.94}
          >
            <Text style={styles.logButtonText}>Log</Text>
          </AnimatedPressable>
        </View>
      );
    }
  } else {
    actionArea = (
      <AnimatedPressable onPress={onLog} style={[styles.logButton, { backgroundColor: colors.primary }]} scaleValue={0.94}>
        <Plus size={14} color="#fff" strokeWidth={2.5} />
        <Text style={styles.logButtonText}>Log</Text>
      </AnimatedPressable>
    );
  }

  // ── Zone B: hero metric ─────────────────────────────────────────────────────
  let heroMetric: React.ReactNode = null;

  if (isGym) {
    // Gym: streak is the hero
    heroMetric = (
      <View style={styles.heroRow}>
        <Text style={[styles.heroNumber, { color: textColor }]}>{streak}</Text>
        <View style={styles.heroLabelCol}>
          <Text style={[styles.heroUnit, { color: subColor }]}>day</Text>
          <Text style={[styles.heroUnit, { color: subColor }]}>streak</Text>
        </View>
        {streak > 0 && <Text style={styles.heroFlame}>🔥</Text>}
      </View>
    );
  } else if (isWeight) {
    const currentVal = todayEntry ? Number(todayEntry.value).toFixed(1) : null;
    heroMetric = (
      <View>
        {currentVal ? (
          <View style={styles.heroRow}>
            <Text style={[styles.heroNumber, { color: textColor }]}>{currentVal}</Text>
            <View style={styles.heroLabelCol}>
              <Text style={[styles.heroUnit, { color: subColor }]}>lb</Text>
              <Text style={[styles.heroUnit, { color: subColor }]}>today</Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.heroPlaceholder, { color: subColor }]}>Log your weight</Text>
        )}
        <WeightTrend trackerId={tracker.id} isDark={isDark} />
      </View>
    );
  } else if (isSteps) {
    // Steps hero is handled by StepsActionArea in the header row
    heroMetric = null;
  } else {
    // Generic tracker: show streak + completion
    heroMetric = (
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Flame size={13} color="#FF8A5B" strokeWidth={2} />
          <Text style={[styles.statChipText, { color: textColor }]}>
            {streak}
            <Text style={[styles.statChipLabel, { color: subColor }]}> day streak</Text>
          </Text>
        </View>
        <View style={styles.statChip}>
          <CheckCircle2 size={13} color={colors.success} strokeWidth={2} />
          <Text style={[styles.statChipText, { color: textColor }]}>
            {completionPct}
            <Text style={[styles.statChipLabel, { color: subColor }]}>% rate</Text>
          </Text>
        </View>
      </View>
    );
  }

  // ── Status badge ────────────────────────────────────────────────────────────
  const statusLabel = stats?.status === 'on_track' ? 'on track' : stats?.status === 'improving' ? 'improving' : stats?.status === 'behind' || stats?.status === 'off_track' ? 'behind' : null;

  return (
    <AnimatedPressable onPress={onPress} style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Zone A — Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.emojiCircle, { backgroundColor: isDark ? '#2A2C40' : '#EEF2FF' }]}>
          <Text style={styles.emojiText}>{tracker.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.trackerName, { color: textColor }]} numberOfLines={1}>
            {tracker.name}
          </Text>
          {tracker.unit && !tracker.is_default ? (
            <Text style={[styles.trackerUnit, { color: subColor }]}>{tracker.unit}</Text>
          ) : null}
        </View>
        {/* Status badge */}
        {statusLabel ? (
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        ) : null}
        {/* Steps: action in header row */}
        {isSteps ? (
          <View style={{ marginLeft: 8 }}>
            {actionArea}
          </View>
        ) : (
          <View style={{ marginLeft: 8 }}>
            {actionArea}
          </View>
        )}
        <ChevronRight size={16} color={subColor} strokeWidth={2} style={{ marginLeft: 4 }} />
      </View>

      {/* Zone B — Main metric */}
      {heroMetric ? (
        <>
          <View style={[styles.divider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
          <View style={styles.heroSection}>
            {heroMetric}
            {/* For gym: also show completion rate below streak */}
            {isGym ? (
              <View style={styles.gymSubRow}>
                <CheckCircle2 size={12} color={colors.success} strokeWidth={2} />
                <Text style={[styles.gymSubText, { color: subColor }]}>
                  {completionPct}% completion rate
                </Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      {/* Zone C — Community insight footer */}
      <CommunityFooter
        stats={communityStats}
        loading={communityLoading}
        isDark={isDark}
        trackerType={trackerType}
      />
    </AnimatedPressable>
  );
}

// ─── Today Summary Header ─────────────────────────────────────────────────────
function TodaySummaryHeader({
  trackers,
  todayEntries,
  isDark,
}: {
  trackers: Tracker[];
  todayEntries: Record<string, { id: string; value: number } | null>;
  isDark: boolean;
}) {
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;

  const total = trackers.length;

  const isTrackerDone = (t: Tracker): boolean => {
    const entry = todayEntries[t.id];
    if (!entry) return false;
    // Numeric trackers with a positive goal_value require the goal to be met
    if (typeof t.goal_value === 'number' && t.goal_value > 0) {
      return entry.value >= t.goal_value;
    }
    // No goal — any logged entry counts as done
    return true;
  };

  const done = trackers.filter(isTrackerDone).length;

  // Friendly date
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const dateLabel = `${dayName} · ${monthDay}`;

  const completionFraction = total > 0 ? `${done} of ${total} done today` : 'No trackers yet';

  return (
    <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <Text style={[styles.summaryDate, { color: subColor }]}>{dateLabel}</Text>
      <Text style={[styles.summaryCompletion, { color: textColor }]}>{completionFraction}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CheckInsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, TrackerStats>>({});
  const [todayEntries, setTodayEntries] = useState<Record<string, { id: string; value: number } | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Community stats per tracker (keyed by tracker name)
  const [communityStatsMap, setCommunityStatsMap] = useState<Record<string, LeaderboardStats | null>>({});
  const [communityLoadingMap, setCommunityLoadingMap] = useState<Record<string, boolean>>({});
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);

  const loadingRef = useRef(false);
  const hasHydratedFromCacheRef = useRef(false);
  const lastLoadedAtRef = useRef<number>(0);
  const stepsHook = useSteps();

  // ── Load community stats for steps + gym ────────────────────────────────────
  const loadCommunityStats = useCallback(async (trackerList: Tracker[]) => {
    console.log('[CheckIns] Loading community stats for trackers');
    const relevantTrackers = trackerList.filter((t) => {
      const type = getCheckInType(t.name);
      return type === 'steps' || type === 'gym';
    });

    // Mark all as loading
    const loadingInit: Record<string, boolean> = {};
    relevantTrackers.forEach((t) => { loadingInit[t.name.toLowerCase()] = true; });
    setCommunityLoadingMap(loadingInit);

    // Fetch in parallel
    await Promise.all(
      relevantTrackers.map(async (t) => {
        const type = getCheckInType(t.name);
        const period = type === 'steps' ? 'today' : 'month';
        try {
          const result = await fetchLeaderboard(t.name.toLowerCase(), period);
          setCommunityStatsMap((prev) => ({ ...prev, [t.name.toLowerCase()]: result.stats }));
        } catch {
          setCommunityStatsMap((prev) => ({ ...prev, [t.name.toLowerCase()]: null }));
        } finally {
          setCommunityLoadingMap((prev) => ({ ...prev, [t.name.toLowerCase()]: false }));
        }
      })
    );
  }, []);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    // First call: try cache hydration
    if (!hasHydratedFromCacheRef.current && !opts?.silent) {
      hasHydratedFromCacheRef.current = true;
      const cached = await readCache();
      if (cached) {
        console.log('[CheckIns] hydrated from cache');
        setTrackers(cached.trackers);
        setStatsMap(cached.statsMap);
        setTodayEntries(cached.todayEntries);
        setLoading(false); // skip skeleton
        // Fall through to silent background refresh
        opts = { silent: true };
      }
    }

    console.log('[CheckIns] Loading trackers and stats', opts?.silent ? '(silent)' : '');
    try {
      setError(null);
      const rawTrackers = await listTrackers();
      const list = Array.isArray(rawTrackers) ? rawTrackers : [];
      console.log('[CheckIns] Loaded', list.length, 'trackers');
      setTrackers(list);

      const today = toLocalDateString(new Date());

      const [statsResults, todayEntriesResults] = await Promise.all([
        Promise.all(list.map((t) => getStats(t.id).catch(() => null))),
        Promise.all(
          list.map(async (t) => {
            try {
              const entries = await listEntries(t.id, 5);
              return entries.find((e) => e.date === today) ?? null;
            } catch (err) {
              console.warn('[CheckIns] today entry lookup failed for', t.name, err);
              return null;
            }
          })
        ),
      ]);

      const map: Record<string, TrackerStats> = {};
      list.forEach((t, i) => { if (statsResults[i]) map[t.id] = statsResults[i]!; });
      setStatsMap(map);

      const todayMap: Record<string, { id: string; value: number } | null> = {};
      list.forEach((t, i) => {
        const entry = todayEntriesResults[i];
        todayMap[t.id] = entry ? { id: entry.id, value: Number(entry.value) } : null;
      });
      setTodayEntries(todayMap);

      // Persist to cache for next open
      writeCache({ trackers: list, statsMap: map, todayEntries: todayMap });

      // Load community stats async — does NOT block main UI
      loadCommunityStats(list);
      setLeaderboardRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load trackers';
      console.error('[CheckIns] Error loading data:', msg);
      if (opts?.silent) {
        console.warn('[CheckIns] silent refresh failed, keeping cached UI:', msg);
      } else if (msg.includes('404')) {
        setTrackers([]);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      loadingRef.current = false;
      if (!opts?.silent) setLoading(false);
      setRefreshing(false);
    }
  }, [loadCommunityStats]);

  const handleQuickLog = useCallback(async (tracker: Tracker, value: number) => {
    const today = toLocalDateString(new Date());
    console.log('[CheckIns] Quick log:', tracker.name, value);

    // Snapshot prior state for rollback
    const prevEntry = todayEntries[tracker.id] ?? null;
    const optimisticEntry = { id: `optimistic-${Date.now()}`, value };

    // 1) Update UI INSTANTLY (before await)
    setTodayEntries((prev) => ({ ...prev, [tracker.id]: optimisticEntry }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    try {
      // 2) Server call in background
      const entry = await logEntry(tracker.id, today, value);

      // 3) Replace optimistic with real entry
      setTodayEntries((prev) => ({ ...prev, [tracker.id]: { id: entry.id, value: Number(entry.value) } }));

      const lowerName = tracker.name.toLowerCase();
      if (tracker.is_default && lowerName === 'gym') {
        console.log('[CheckIns] Awarding workout XP for entry:', entry.id);
        tryAwardWorkout(entry.id);
      } else if (tracker.is_default && lowerName === 'weight') {
        console.log('[CheckIns] Awarding weight_checkin XP for entry:', entry.id, 'value:', value);
        tryAwardWeightCheckin(entry.id, value);
      }

      // Refresh stats in background (non-blocking)
      getStats(tracker.id).then((newStats) => {
        setStatsMap((prev) => ({ ...prev, [tracker.id]: newStats }));
      }).catch(() => {});
    } catch (err) {
      // 4) Rollback optimistic state
      console.error('[CheckIns] Quick log failed, rolling back:', err);
      setTodayEntries((prev) => ({ ...prev, [tracker.id]: prevEntry }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const msg = err instanceof Error ? err.message : 'Failed to log';
      Alert.alert('Log failed', msg);
    }
  }, [todayEntries]);

  const handleStepsRefresh = useCallback(async (tracker: Tracker) => {
    console.log('[CheckIns] handleStepsRefresh called for tracker:', tracker.id);
    try {
      await stepsHook.refresh();
      const currentSteps = stepsHook.steps;
      if (currentSteps !== null && currentSteps > 0) {
        const today = toLocalDateString(new Date());
        console.log('[CheckIns] Upserting steps entry:', currentSteps, 'for date:', today);

        // Snapshot prior state for rollback
        const prevEntry = todayEntries[tracker.id] ?? null;
        const optimisticEntry = { id: `optimistic-steps-${Date.now()}`, value: currentSteps };

        // Update UI instantly
        setTodayEntries((prev) => ({ ...prev, [tracker.id]: optimisticEntry }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

        try {
          const entry = await logEntry(tracker.id, today, currentSteps);
          setTodayEntries((prev) => ({ ...prev, [tracker.id]: { id: entry.id, value: Number(entry.value) } }));
          // Refresh stats in background (non-blocking)
          getStats(tracker.id).then((newStats) => {
            setStatsMap((prev) => ({ ...prev, [tracker.id]: newStats }));
          }).catch(() => {});
        } catch (err) {
          console.error('[CheckIns] Steps log failed, rolling back:', err);
          setTodayEntries((prev) => ({ ...prev, [tracker.id]: prevEntry }));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          const msg = err instanceof Error ? err.message : 'Failed to log steps';
          Alert.alert('Steps log failed', msg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh steps';
      console.error('[CheckIns] Steps refresh failed:', msg);
    }
  }, [stepsHook, todayEntries]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const isFirstLoad = lastLoadedAtRef.current === 0;
      const isStale = now - lastLoadedAtRef.current > STALE_AFTER_MS;

      if (isFirstLoad) {
        console.log('[CheckIns] first focus — loading');
        setLoading(true);
        loadData().then(() => {
          lastLoadedAtRef.current = Date.now();
        });
      } else if (isStale) {
        console.log('[CheckIns] stale — silent refresh');
        loadData({ silent: true }).then(() => {
          lastLoadedAtRef.current = Date.now();
        });
      } else {
        console.log('[CheckIns] focus — data fresh, skipping reload');
      }
    }, [loadData])
  );

  const onRefresh = () => {
    console.log('[CheckIns] Pull-to-refresh triggered');
    setRefreshing(true);
    loadData().then(() => {
      lastLoadedAtRef.current = Date.now();
    });
  };

  const handleCardPress = (tracker: Tracker) => {
    console.log('[CheckIns] Tracker card tapped:', tracker.name, tracker.id);
    router.push({ pathname: '/tracker/[id]', params: { id: tracker.id } });
  };

  const handleLog = (tracker: Tracker) => {
    console.log('[CheckIns] Log button tapped (form nav):', tracker.name, tracker.id);
    router.push({ pathname: '/tracker/log', params: { trackerId: tracker.id } });
  };

  const handleCreateTracker = () => {
    console.log('[CheckIns] Create tracker button tapped');
    router.push('/tracker/create');
  };

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Check-Ins',
          headerLargeTitle: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          headerLargeStyle: { backgroundColor: 'transparent' },
          headerRight: () => (
            <AnimatedPressable onPress={handleCreateTracker} style={styles.headerButton} scaleValue={0.9}>
              <Plus size={22} color={colors.primary} strokeWidth={2.5} />
            </AnimatedPressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Error state */}
        {error && !loading ? (
          <View style={[styles.errorCard, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
            <Text style={[styles.errorTitle, { color: textColor }]}>Couldn't load trackers</Text>
            <Text style={[styles.errorSub, { color: subColor }]}>Check your connection and try again</Text>
            <AnimatedPressable onPress={() => { setLoading(true); loadData(); }} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </AnimatedPressable>
          </View>
        ) : loading ? (
          /* Skeleton */
          <View style={styles.list}>
            <View style={[styles.summaryCardSkeleton, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
              {[0, 1, 2].map((i) => {
                const shimmer = isDark ? '#3A3C52' : '#D4D6DA';
                const opacity = 0.5;
                return (
                  <View key={i} style={[styles.skeletonLine, { width: i === 0 ? '40%' : i === 1 ? '60%' : '50%', backgroundColor: shimmer, opacity, marginBottom: 8 }]} />
                );
              })}
            </View>
            {[0, 1, 2].map((i) => <SkeletonCard key={i} isDark={isDark} />)}
          </View>
        ) : trackers.length === 0 ? (
          /* Empty state */
          <View style={[styles.emptyCard, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + '18' }]}>
              <Trophy size={32} color={colors.primary} strokeWidth={1.5} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No trackers yet</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              Create your first tracker to start building healthy habits
            </Text>
            <AnimatedPressable onPress={handleCreateTracker} style={[styles.emptyButton, { backgroundColor: colors.primary }]}>
              <Plus size={16} color="#fff" strokeWidth={2.5} />
              <Text style={styles.emptyButtonText}>Create tracker</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <View style={styles.list}>
            {/* Today summary header */}
            <AnimatedListItem index={0}>
              <TodaySummaryHeader
                trackers={trackers}
                todayEntries={todayEntries}
                isDark={isDark}
              />
            </AnimatedListItem>

            {/* Tracker cards */}
            {trackers.map((tracker, index) => {
              const trackerType = getCheckInType(tracker.name);
              const communityKey = tracker.name.toLowerCase();
              const cStats = (trackerType === 'steps' || trackerType === 'gym')
                ? (communityStatsMap[communityKey] ?? null)
                : null;
              const cLoading = (trackerType === 'steps' || trackerType === 'gym')
                ? (communityLoadingMap[communityKey] ?? false)
                : false;

              return (
                <AnimatedListItem key={tracker.id} index={index + 1}>
                  <TrackerCard
                    tracker={tracker}
                    stats={statsMap[tracker.id] ?? null}
                    todayEntry={todayEntries[tracker.id] ?? null}
                    isDark={isDark}
                    onPress={() => handleCardPress(tracker)}
                    onLog={() => handleLog(tracker)}
                    onQuickLog={(value) => handleQuickLog(tracker, value)}
                    stepsHook={stepsHook}
                    onStepsRefresh={() => handleStepsRefresh(tracker)}
                    communityStats={cStats}
                    communityLoading={cLoading}
                  />
                </AnimatedListItem>
              );
            })}

            {/* Community leaderboard section */}
            <AnimatedListItem index={trackers.length + 1}>
              <View style={styles.leaderboardSection}>
                <CommunityLeaderboard isDark={isDark} refreshKey={leaderboardRefreshKey} />
              </View>
            </AnimatedListItem>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  list: {
    gap: spacing.sm,
  },

  // ── Today Summary ────────────────────────────────────────────────────────────
  summaryCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 4,
  },
  summaryCardSkeleton: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: 4,
  },
  summaryDate: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginBottom: 4,
  },
  summaryCompletion: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  // ── Card ─────────────────────────────────────────────────────────────────────
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emojiCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 20,
  },
  trackerName: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  trackerUnit: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },

  // ── Zone B: Hero metric ──────────────────────────────────────────────────────
  heroSection: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  heroNumber: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 46,
  },
  heroLabelCol: {
    paddingBottom: 6,
    gap: 0,
  },
  heroUnit: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 16,
  },
  heroFlame: {
    fontSize: 24,
    paddingBottom: 4,
  },
  heroPlaceholder: {
    fontSize: 15,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  gymSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  gymSubText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Zone C: Community footer ─────────────────────────────────────────────────
  communityDivider: {
    height: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    opacity: 0.5,
  },
  communityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  percentileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  percentileText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  communityAvgText: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },

  // ── Divider ──────────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    marginVertical: spacing.sm,
    opacity: 0.5,
  },

  // ── Stats row (generic trackers) ─────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statChipLabel: {
    fontSize: 12,
    fontWeight: '400',
  },

  // ── Status badge ─────────────────────────────────────────────────────────────
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Action buttons ───────────────────────────────────────────────────────────
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  logButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.success + '22',
  },
  donePillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  donePillUnit: {
    fontSize: 11,
    fontWeight: '500',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weightInput: {
    width: 60,
    height: 32,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    borderWidth: 1,
  },

  // ── Steps ────────────────────────────────────────────────────────────────────
  stepsActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepsInfoCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
  stepsCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  stepsCount: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  stepsUnit: {
    fontSize: 12,
    fontWeight: '400',
  },
  progressTrack: {
    width: 80,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Skeleton ─────────────────────────────────────────────────────────────────
  skeletonLine: {
    height: 13,
    borderRadius: 6,
  },
  skeletonPill: {
    width: 56,
    height: 28,
    borderRadius: borderRadius.sm,
  },

  // ── Error ────────────────────────────────────────────────────────────────────
  errorCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  errorSub: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },

  // ── Empty ────────────────────────────────────────────────────────────────────
  emptyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: spacing.lg,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },

  // ── Leaderboard section ──────────────────────────────────────────────────────
  leaderboardSection: {
    marginTop: spacing.sm,
  },
});
