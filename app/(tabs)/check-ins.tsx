
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
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { listTrackers, getStats, listEntries, logEntry, Tracker, TrackerStats } from '@/utils/trackersApi';
import { toLocalDateString } from '@/utils/dateUtils';
import { Flame, Trophy, Plus, ChevronRight, CheckCircle2, RotateCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSteps } from '@/hooks/useSteps';

// ─── AnimatedPressable ────────────────────────────────────────────────────────
function AnimatedPressable({
  onPress,
  style,
  children,
  scaleValue = 0.97,
}: {
  onPress?: () => void;
  style?: object | object[];
  children: React.ReactNode;
  scaleValue?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animIn = () =>
    Animated.spring(scale, { toValue: scaleValue, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const animOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPressIn={animIn} onPressOut={animOut} onPress={onPress} style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── AnimatedListItem ─────────────────────────────────────────────────────────
function AnimatedListItem({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: true }),
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
        <View style={[styles.skeletonCircle, { backgroundColor: shimmer }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.skeletonLine, { width: '50%', backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: '30%', height: 11, backgroundColor: shimmer }]} />
        </View>
        <View style={[styles.skeletonPill, { backgroundColor: shimmer }]} />
      </View>
      <View style={[styles.divider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
      <View style={styles.statsRow}>
        <View style={[styles.skeletonLine, { width: 80, backgroundColor: shimmer }]} />
        <View style={[styles.skeletonLine, { width: 70, backgroundColor: shimmer }]} />
        <View style={[styles.skeletonLine, { width: 50, backgroundColor: shimmer }]} />
      </View>
    </Animated.View>
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

  // Spin animation while refreshing
  useEffect(() => {
    if (isRefreshing) {
      spinRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        })
      );
      spinRef.current.start();
    } else {
      spinRef.current?.stop();
      spinAnim.setValue(0);
    }
  }, [isRefreshing, spinAnim]);

  // Animate progress bar when steps change
  const goal = goalValue && goalValue > 0 ? goalValue : 0;
  const count = steps ?? 0;
  const pct = goal > 0 ? Math.min(100, (count / goal) * 100) : 0;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [pct, progressAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const trackColor = isDark ? '#2A2C40' : '#E5E7EB';
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const textColor = isDark ? colors.textDark : colors.text;

  // Not granted — show Connect button
  if (permission !== 'granted') {
    return (
      <AnimatedPressable
        onPress={() => {
          console.log('[CheckIns] Steps Connect Apple Health tapped');
          onRequestPermission();
        }}
        style={[styles.connectButton, { backgroundColor: colors.primary }]}
        scaleValue={0.94}
      >
        <Text style={styles.connectButtonText}>Connect</Text>
      </AnimatedPressable>
    );
  }

  // Granted but loading initial data
  if (loading && steps === null) {
    return (
      <View style={styles.stepsActionRow}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  const countFormatted = count.toLocaleString('en-US');
  const goalFormatted = goal > 0 ? goal.toLocaleString('en-US') : null;

  return (
    <View style={styles.stepsActionRow}>
      {/* Count + bar */}
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
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        ) : null}
      </View>

      {/* Refresh button */}
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
}) {
  const [weightInput, setWeightInput] = useState('');
  const [weightEditing, setWeightEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [stepsRefreshing, setStepsRefreshing] = useState(false);

  const completionPct = stats ? Math.round(Number(stats.completion_rate) * 100) : 0;
  const streak = stats ? Number(stats.current_streak) : 0;
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

  // ── Right-side action area ──────────────────────────────────────────────────
  let actionArea: React.ReactNode;

  if (isSteps) {
    // Steps: read-only from HealthKit — show count + progress bar + refresh
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
      // Done pill — no navigation
      actionArea = (
        <View style={styles.donePill}>
          <CheckCircle2 size={14} color={colors.success} strokeWidth={2.5} />
          <Text style={[styles.donePillText, { color: colors.success }]}>Done</Text>
        </View>
      );
    } else {
      // Log button — quick-log directly, no navigation
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
      // Value pill — tap to edit
      const displayValue = todayEntry ? Number(todayEntry.value).toFixed(1) : '';
      actionArea = (
        <Pressable onPress={handleWeightPillPress} style={styles.donePill}>
          <CheckCircle2 size={14} color={colors.success} strokeWidth={2.5} />
          <Text style={[styles.donePillText, { color: colors.success }]}>
            {displayValue}
          </Text>
          <Text style={[styles.donePillUnit, { color: colors.success }]}>lb</Text>
        </Pressable>
      );
    } else if (weightEditing) {
      // Inline edit mode
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
      // Not logged — inline input + Log button
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
    // All other trackers — navigate to form
    actionArea = (
      <AnimatedPressable onPress={onLog} style={[styles.logButton, { backgroundColor: colors.primary }]} scaleValue={0.94}>
        <Plus size={14} color="#fff" strokeWidth={2.5} />
        <Text style={styles.logButtonText}>Log</Text>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable onPress={onPress} style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header row */}
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
        {actionArea}
        <ChevronRight size={16} color={subColor} strokeWidth={2} style={{ marginLeft: 4 }} />
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

      {/* Stats row */}
      <View style={styles.statsRow}>
        {/* Streak */}
        <View style={styles.statChip}>
          <Flame size={13} color="#FF8A5B" strokeWidth={2} />
          <Text style={[styles.statChipText, { color: textColor }]}>
            {streak}
            <Text style={[styles.statChipLabel, { color: subColor }]}> day streak</Text>
          </Text>
        </View>

        {/* Completion */}
        <View style={styles.statChip}>
          <CheckCircle2 size={13} color={colors.success} strokeWidth={2} />
          <Text style={[styles.statChipText, { color: textColor }]}>
            {completionPct}
            <Text style={[styles.statChipLabel, { color: subColor }]}>% rate</Text>
          </Text>
        </View>

        {/* Status badge */}
        {stats ? (
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {stats.status === 'on_track' ? 'on track' : stats.status === 'improving' ? 'improving' : 'behind'}
            </Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, { backgroundColor: subColor + '22' }]}>
            <Text style={[styles.statusText, { color: subColor }]}>no data</Text>
          </View>
        )}
      </View>
    </AnimatedPressable>
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

  const loadingRef = useRef(false);

  // ── Steps hook ──────────────────────────────────────────────────────────────
  const stepsHook = useSteps();

  const loadData = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    console.log('[CheckIns] Loading trackers and stats');
    try {
      setError(null);
      const rawTrackers = await listTrackers();
      const list = Array.isArray(rawTrackers) ? rawTrackers : [];
      console.log('[CheckIns] Loaded', list.length, 'trackers');
      setTrackers(list);

      const today = toLocalDateString(new Date());

      const [statsResults, todayEntriesResults] = await Promise.all([
        Promise.all(list.map(t => getStats(t.id).catch(() => null))),
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
      list.forEach((t, i) => {
        if (statsResults[i]) map[t.id] = statsResults[i]!;
      });
      setStatsMap(map);

      const todayMap: Record<string, { id: string; value: number } | null> = {};
      list.forEach((t, i) => {
        const entry = todayEntriesResults[i];
        todayMap[t.id] = entry ? { id: entry.id, value: Number(entry.value) } : null;
      });
      setTodayEntries(todayMap);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load trackers';
      console.error('[CheckIns] Error loading data:', msg);
      // 404 means the feature endpoint isn't available yet — show empty state, not error
      if (msg.includes('404')) {
        setTrackers([]);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleQuickLog = useCallback(async (tracker: Tracker, value: number) => {
    const today = toLocalDateString(new Date());
    console.log('[CheckIns] Quick log:', tracker.name, value);
    try {
      const entry = await logEntry(tracker.id, today, value);
      setTodayEntries((prev) => ({ ...prev, [tracker.id]: { id: entry.id, value: Number(entry.value) } }));
      // Refresh stats so the streak updates immediately
      try {
        const newStats = await getStats(tracker.id);
        setStatsMap((prev) => ({ ...prev, [tracker.id]: newStats }));
      } catch {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to log';
      console.error('[CheckIns] Quick log failed:', msg);
      Alert.alert('Log failed', msg);
    }
  }, []);

  // ── Steps refresh handler ───────────────────────────────────────────────────
  const handleStepsRefresh = useCallback(async (tracker: Tracker) => {
    console.log('[CheckIns] handleStepsRefresh called for tracker:', tracker.id);
    try {
      await stepsHook.refresh();
      const currentSteps = stepsHook.steps;
      if (currentSteps !== null && currentSteps > 0) {
        const today = toLocalDateString(new Date());
        console.log('[CheckIns] Upserting steps entry:', currentSteps, 'for date:', today);
        const entry = await logEntry(tracker.id, today, currentSteps);
        setTodayEntries((prev) => ({ ...prev, [tracker.id]: { id: entry.id, value: Number(entry.value) } }));
        // Refresh stats
        try {
          const newStats = await getStats(tracker.id);
          setStatsMap((prev) => ({ ...prev, [tracker.id]: newStats }));
        } catch {}
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh steps';
      console.error('[CheckIns] Steps refresh failed:', msg);
    }
  }, [stepsHook]);

  useFocusEffect(
    useCallback(() => {
      console.log('[CheckIns] Screen focused');
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    console.log('[CheckIns] Pull-to-refresh triggered');
    setRefreshing(true);
    loadData();
  };

  const handleCardPress = (tracker: Tracker) => {
    console.log('[CheckIns] Tracker card tapped:', tracker.name, tracker.id);
    router.push({ pathname: '/tracker/[id]', params: { id: tracker.id } });
  };

  const handleLog = (tracker: Tracker) => {
    console.log('[CheckIns] Log button tapped (form nav):', tracker.name, tracker.id);
    // Steps uses the refresh button — no form navigation for steps
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Your Trackers</Text>
          {!loading && (
            <View style={[styles.countBadge, { backgroundColor: colors.primary + '22' }]}>
              <Text style={[styles.countBadgeText, { color: colors.primary }]}>{trackers.length}</Text>
            </View>
          )}
        </View>

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
            {[0, 1, 2].map(i => <SkeletonCard key={i} isDark={isDark} />)}
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
          /* Tracker list */
          <View style={styles.list}>
            {trackers.map((tracker, index) => (
              <AnimatedListItem key={tracker.id} index={index}>
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
                />
              </AnimatedListItem>
            ))}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  countBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    boxShadow: '0px 1px 3px rgba(0,0,0,0.04), 0px 4px 12px rgba(0,0,0,0.03)',
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
  divider: {
    height: 1,
    marginVertical: spacing.sm,
    opacity: 0.5,
  },
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginLeft: 'auto',
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
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Steps-specific styles
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
  connectButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Skeleton
  skeletonCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  skeletonLine: {
    height: 13,
    borderRadius: 6,
  },
  skeletonPill: {
    width: 56,
    height: 28,
    borderRadius: borderRadius.sm,
  },
  // Error
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
  // Empty
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
});
