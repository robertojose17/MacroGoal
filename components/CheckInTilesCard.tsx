/**
 * CheckInTilesCard
 *
 * Combines the visual design of TodaysChallengesCard (compact tiles, icon circle,
 * big %) with the functional logic of TrackerQuickCard (inline weight input,
 * steps HealthKit refresh, gym one-tap log, calories/protein → food log,
 * tap title → tracker history).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { borderRadius, colors, spacing } from '@/styles/commonStyles';
import { toLocalDateString } from '@/utils/dateUtils';
import { emitXpRefresh } from '@/utils/xpEvents';
import { logEntry, listTrackers } from '@/utils/trackersApi';
import { tryAwardWorkout, tryAwardWeightCheckin } from '@/utils/xpAwarder';
import { promptForProgressPhoto } from '@/utils/checkInPhotoUpload';
import { supabase } from '@/lib/supabase/client';
import { useSteps } from '@/hooks/useSteps';

// ─── Types ────────────────────────────────────────────────────────────────────

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export interface CheckInTilesCardProps {
  isDark: boolean;
  userId: string;
  goal: any; // has daily_calories, protein_g, today_calories, today_protein
  onXpRefresh: () => void;
}

type TileType = 'weight' | 'steps' | 'gym' | 'calories' | 'protein';

interface TileConfig {
  type: TileType;
  icon: IoniconsName;
  labelKey: string;
}

interface TodayEntry {
  id: string;
  value: number;
}


const TILE_CONFIGS: TileConfig[] = [
  { type: 'weight',   icon: 'scale-outline',     labelKey: 'common.weight'   },
  { type: 'steps',    icon: 'walk-outline',       labelKey: 'common.steps'    },
  { type: 'gym',      icon: 'barbell-outline',    labelKey: 'common.gym'      },
  { type: 'calories', icon: 'pie-chart-outline',  labelKey: 'common.calories' },
  { type: 'protein',  icon: 'fitness-outline',    labelKey: 'common.protein'  },
];

// ─── Animated percentage number ───────────────────────────────────────────────

function AnimatedPercent({
  value,
  isDark,
  isComplete,
}: {
  value: number;
  isDark: boolean;
  isComplete: boolean;
}) {
  const animVal = useRef(new Animated.Value(value)).current;
  const [displayed, setDisplayed] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (Math.abs(value - prevValue.current) < 1) {
      setDisplayed(value);
      return;
    }
    prevValue.current = value;
    Animated.spring(animVal, {
      toValue: value,
      useNativeDriver: false,
      tension: 80,
      friction: 10,
    }).start();
    const id = animVal.addListener(({ value: v }) => setDisplayed(Math.round(v)));
    return () => animVal.removeListener(id);
  }, [value, animVal]);

  const percentText = String(Math.round(displayed)) + '%';
  const textColor = isComplete
    ? colors.success
    : isDark
    ? colors.textDark
    : colors.primaryText;

  return (
    <Text style={[styles.percentText, { color: textColor }]}>{percentText}</Text>
  );
}

// ─── Single compact tile ──────────────────────────────────────────────────────

function CompactTile({
  config,
  percent,
  isDark,
  onPress,
  quickAction,
}: {
  config: TileConfig;
  percent: number;
  isDark: boolean;
  onPress: () => void;
  quickAction: React.ReactNode;
}) {
  const { t } = useTranslation();
  const isComplete = percent >= 100;
  const hasProgress = percent > 0;

  const bgColor = isComplete
    ? isDark ? 'rgba(92,185,123,0.15)' : 'rgba(92,185,123,0.08)'
    : hasProgress
    ? isDark ? 'rgba(91,154,168,0.12)' : 'rgba(91,154,168,0.06)'
    : isDark ? colors.cardDark : colors.card;

  const borderColor = isComplete
    ? isDark ? 'rgba(92,185,123,0.4)' : 'rgba(92,185,123,0.3)'
    : isDark ? colors.cardBorderDark : colors.cardBorder;

  const iconBg = isComplete
    ? isDark ? 'rgba(92,185,123,0.25)' : 'rgba(92,185,123,0.15)'
    : hasProgress
    ? isDark ? 'rgba(91,154,168,0.2)' : 'rgba(91,154,168,0.12)'
    : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  const iconColor = isComplete
    ? colors.success
    : hasProgress
    ? colors.primary
    : isDark ? colors.textSecondaryDark : colors.textSecondary;

  const clampedPercent = Math.min(100, Math.max(0, percent));
  const labelText = t(config.labelKey);

  return (
    <TouchableOpacity
      onPress={() => {
        console.log('[CheckInTilesCard] tile pressed:', config.type, 'percent:', clampedPercent + '%');
        onPress();
      }}
      activeOpacity={0.75}
      style={[styles.tile, { backgroundColor: bgColor, borderColor }]}
    >
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={config.icon} size={18} color={iconColor} />
        {isComplete && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={9} color="#fff" />
          </View>
        )}
      </View>

      <Text
        style={[styles.tileLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
        numberOfLines={1}
      >
        {labelText}
      </Text>

      <AnimatedPercent value={clampedPercent} isDark={isDark} isComplete={isComplete} />

      {quickAction}
    </TouchableOpacity>
  );
}

// ─── Tiny quick-action button ─────────────────────────────────────────────────

function QuickBtn({
  label,
  onPress,
  isDone,
}: {
  label: string;
  onPress: (e: any) => void;
  isDone?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.quickBtn,
        isDone && styles.quickBtnDone,
      ]}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <Text style={[styles.quickBtnText, isDone && styles.quickBtnTextDone]}>{label}</Text>
    </TouchableOpacity>
  );
}



// ─── Main card ────────────────────────────────────────────────────────────────

export default function CheckInTilesCard({ isDark, userId, goal, onXpRefresh }: CheckInTilesCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const stepsHook = useSteps();

  const [trackers, setTrackers] = useState<any[]>([]);
  const [todayEntries, setTodayEntries] = useState<Record<string, TodayEntry | null>>({});
  const [loading, setLoading] = useState(true);
  const [stepsRefreshing, setStepsRefreshing] = useState(false);

  // Inline weight input
  const [inlineWeightVisible, setInlineWeightVisible] = useState(false);
  const [inlineWeightInput, setInlineWeightInput] = useState('');
  const [inlineWeightSaving, setInlineWeightSaving] = useState(false);

  // Gym quick-log
  const [gymQuickLogging, setGymQuickLogging] = useState(false);

  // ── Load trackers + today entries ──────────────────────────────────────────
  const loadTrackers = useCallback(async () => {
    console.log('[CheckInTilesCard] loading trackers for userId:', userId);
    try {
      const rawTrackers = await listTrackers();
      const list = Array.isArray(rawTrackers) ? rawTrackers : [];
      setTrackers(list);

      const today = toLocalDateString(new Date());
      const entryResults = await Promise.all(
        list.map(async (tr: any) => {
          try {
            const entries = await listEntries(tr.id, 5);
            return entries.find((e: any) => e.date === today) ?? null;
          } catch {
            return null;
          }
        })
      );

      const map: Record<string, TodayEntry | null> = {};
      list.forEach((tr: any, i: number) => {
        const e = entryResults[i];
        map[tr.id] = e ? { id: e.id, value: Number(e.value) } : null;
      });
      setTodayEntries(map);
      console.log('[CheckInTilesCard] loaded', list.length, 'trackers, today entries:', Object.keys(map).length);
    } catch (err) {
      console.warn('[CheckInTilesCard] failed to load trackers:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTrackers();
  }, [loadTrackers]);

  // ── Derived tracker refs ───────────────────────────────────────────────────
  const weightTracker = trackers.find((tr) => tr.is_default && tr.name.toLowerCase() === 'weight') ?? null;
  const stepsTracker  = trackers.find((tr) => tr.is_default && tr.name.toLowerCase() === 'steps')  ?? null;
  const gymTracker    = trackers.find((tr) => tr.is_default && tr.name.toLowerCase() === 'gym')    ?? null;

  const weightEntry = weightTracker ? (todayEntries[weightTracker.id] ?? null) : null;
  const gymEntry    = gymTracker    ? (todayEntries[gymTracker.id]    ?? null) : null;

  // ── Percentages ────────────────────────────────────────────────────────────
  const dailyCals    = Number(goal?.daily_calories ?? 0);
  const dailyProtein = Number(goal?.protein_g ?? goal?.daily_protein ?? 0);
  const todayCals    = Number(goal?.today_calories ?? 0);
  const todayProtein = Number(goal?.today_protein ?? 0);

  const stepsGoal  = stepsTracker?.goal_value ?? 0;
  const stepsCount = stepsHook.steps ?? 0;

  const weightPct   = weightEntry ? 100 : 0;
  const stepsPct    = stepsGoal > 0 ? Math.min(100, (stepsCount / stepsGoal) * 100) : 0;
  const gymPct      = gymEntry ? 100 : 0;
  const calsPct     = dailyCals > 0 ? Math.min(100, (todayCals / dailyCals) * 100) : 0;
  const proteinPct  = dailyProtein > 0 ? Math.min(100, (todayProtein / dailyProtein) * 100) : 0;

  const percents: Record<TileType, number> = {
    weight:   weightPct,
    steps:    stepsPct,
    gym:      gymPct,
    calories: calsPct,
    protein:  proteinPct,
  };

  const doneCount = Object.values(percents).filter((p) => p >= 100).length;

  // ── Shared weight logging logic ────────────────────────────────────────────
  const logWeightValue = useCallback(async (parsed: number) => {
    if (!weightTracker) return;
    console.log('[CheckInTilesCard] logWeightValue — tracker:', weightTracker.id, 'value:', parsed);
    const today = toLocalDateString(new Date());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const entry = await logEntry(weightTracker.id, today, parsed);
    setTodayEntries((prev) => ({ ...prev, [weightTracker.id]: { id: entry.id, value: Number(entry.value) } }));
    onXpRefresh();

    const weightInKg = parsed / 2.20462;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: existingCheckIn } = await supabase
        .from('check_ins')
        .select('id')
        .eq('user_id', authUser.id)
        .eq('date', today)
        .maybeSingle();

      let checkInId: string | null = null;
      if (existingCheckIn) {
        console.log('[CheckInTilesCard] updating existing check_in weight — id:', existingCheckIn.id);
        await supabase
          .from('check_ins')
          .update({ weight: weightInKg, updated_at: new Date().toISOString() })
          .eq('id', existingCheckIn.id);
        checkInId = existingCheckIn.id;
      } else {
        console.log('[CheckInTilesCard] inserting new check_in with weight');
        const { data: newCheckIn } = await supabase
          .from('check_ins')
          .insert({ user_id: authUser.id, date: today, weight: weightInKg })
          .select('id')
          .single();
        checkInId = newCheckIn?.id ?? null;
      }

      if (checkInId) {
        console.log('[CheckInTilesCard] awarding weight check-in XP — check_in_id:', checkInId);
        await tryAwardWeightCheckin(checkInId, weightInKg);
        emitXpRefresh();
      }
    }

    setTimeout(() => {
      console.log('[CheckInTilesCard] prompting for progress photo after weight log');
      promptForProgressPhoto(parsed, today).catch((e) =>
        console.warn('[CheckInTilesCard] Progress photo prompt failed:', e)
      );
    }, 600);
  }, [weightTracker, onXpRefresh]);

  // ── Shared gym logging logic ───────────────────────────────────────────────
  const logGymWorkout = useCallback(async () => {
    if (!gymTracker) return;
    console.log('[CheckInTilesCard] logGymWorkout — tracker:', gymTracker.id);
    const today = toLocalDateString(new Date());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const entry = await logEntry(gymTracker.id, today, 1);
    setTodayEntries((prev) => ({ ...prev, [gymTracker.id]: { id: entry.id, value: Number(entry.value) } }));
    onXpRefresh();

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: existingCheckIn } = await supabase
        .from('check_ins')
        .select('id')
        .eq('user_id', authUser.id)
        .eq('date', today)
        .maybeSingle();

      if (existingCheckIn) {
        await supabase
          .from('check_ins')
          .update({ went_to_gym: true, updated_at: new Date().toISOString() })
          .eq('id', existingCheckIn.id);
      } else {
        await supabase
          .from('check_ins')
          .insert({ user_id: authUser.id, date: today, went_to_gym: true });
      }
      console.log('[CheckInTilesCard] synced went_to_gym=true to check_ins for date:', today);
    }

    await tryAwardWorkout(entry.id);
    emitXpRefresh();
  }, [gymTracker, onXpRefresh]);

  // ── Steps refresh ──────────────────────────────────────────────────────────
  const handleStepsRefresh = async () => {
    if (stepsRefreshing || !stepsTracker) return;
    console.log('[CheckInTilesCard] steps refresh triggered');
    setStepsRefreshing(true);
    try {
      await stepsHook.refresh();
      const currentSteps = stepsHook.steps;
      if (currentSteps !== null && currentSteps > 0) {
        const today = toLocalDateString(new Date());
        console.log('[CheckInTilesCard] logging steps entry:', currentSteps);
        const entry = await logEntry(stepsTracker.id, today, currentSteps);
        setTodayEntries((prev) => ({ ...prev, [stepsTracker.id]: { id: entry.id, value: Number(entry.value) } }));
      }
    } catch (err) {
      console.warn('[CheckInTilesCard] steps refresh failed:', err);
    } finally {
      setStepsRefreshing(false);
    }
  };

  // ── Inline weight confirm ──────────────────────────────────────────────────
  const handleInlineWeightConfirm = async () => {
    console.log('[CheckInTilesCard] inline weight confirm pressed — input:', inlineWeightInput);
    const parsed = parseFloat(inlineWeightInput);
    if (isNaN(parsed) || parsed <= 0 || parsed >= 1000) {
      Alert.alert(t('checkIns.invalidWeight'), t('checkIns.enterValidWeight'));
      return;
    }
    if (inlineWeightSaving) return;
    setInlineWeightSaving(true);
    try {
      await logWeightValue(parsed);
      setInlineWeightVisible(false);
      setInlineWeightInput('');
    } catch (err) {
      console.error('[CheckInTilesCard] inline weight log failed:', err);
      Alert.alert(t('checkIns.logFailed'), err instanceof Error ? err.message : String(err));
    } finally {
      setInlineWeightSaving(false);
    }
  };

  // ── Gym quick-log ──────────────────────────────────────────────────────────
  const handleGymQuickLog = async () => {
    if (gymQuickLogging || gymEntry) return;
    console.log('[CheckInTilesCard] gym quick-log button pressed');
    setGymQuickLogging(true);
    try {
      await logGymWorkout();
    } catch (err) {
      console.error('[CheckInTilesCard] gym quick-log failed:', err);
      Alert.alert(t('checkIns.logFailed'), err instanceof Error ? err.message : String(err));
    } finally {
      setGymQuickLogging(false);
    }
  };

  // ── Tile press handlers ────────────────────────────────────────────────────
  const handleTilePress = (type: TileType) => {
    console.log('[CheckInTilesCard] tile press handler for type:', type);
    if (type === 'weight') {
      if (weightTracker) {
        console.log('[CheckInTilesCard] weight tile tapped — navigating to tracker history:', weightTracker.id);
        router.push({ pathname: '/tracker/[id]', params: { id: weightTracker.id } });
      }
    } else if (type === 'steps') {
      if (stepsTracker) {
        console.log('[CheckInTilesCard] steps tile tapped — navigating to tracker history:', stepsTracker.id);
        router.push({ pathname: '/tracker/[id]', params: { id: stepsTracker.id } });
      }
    } else if (type === 'gym') {
      if (gymTracker) {
        console.log('[CheckInTilesCard] gym tile tapped — navigating to tracker history:', gymTracker.id);
        router.push({ pathname: '/tracker/[id]', params: { id: gymTracker.id } });
      }
    } else if (type === 'calories') {
      console.log('[CheckInTilesCard] calories tile tapped — navigating to food log');
      router.push('/(home)');
    } else if (type === 'protein') {
      console.log('[CheckInTilesCard] protein tile tapped — navigating to food log');
      router.push('/(home)');
    }
  };

  const bgColor    = isDark ? colors.cardDark : '#fff';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor  = isDark ? colors.textDark : colors.primaryText;
  const subColor   = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const doneText = t('xp.doneCount', { count: doneCount });

  // ── Quick action nodes per tile ────────────────────────────────────────────
  const weightQuickAction = (
    <QuickBtn
      label={t('checkIns.quickLog')}
      onPress={(e) => {
        e.stopPropagation();
        console.log('[CheckInTilesCard] weight quick-log button pressed');
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setInlineWeightVisible((v) => !v);
        setInlineWeightInput(weightEntry ? String(Number(weightEntry.value).toFixed(1)) : '');
      }}
    />
  );

  const stepsQuickAction = (
    <QuickBtn
      label={stepsRefreshing ? '…' : t('checkIns.quickSync')}
      onPress={(e) => {
        e.stopPropagation();
        console.log('[CheckInTilesCard] steps quick-sync button pressed');
        handleStepsRefresh();
      }}
    />
  );

  const gymQuickAction = gymEntry ? (
    <QuickBtn
      label="✓"
      onPress={(e) => { e.stopPropagation(); }}
      isDone
    />
  ) : (
    <QuickBtn
      label={gymQuickLogging ? '…' : t('checkIns.quickLog')}
      onPress={(e) => {
        e.stopPropagation();
        handleGymQuickLog();
      }}
    />
  );

  const caloriesQuickAction = (
    <QuickBtn
      label={t('checkIns.quickAdd')}
      onPress={(e) => {
        e.stopPropagation();
        console.log('[CheckInTilesCard] calories quick-add button pressed — navigating to add-food');
        router.push('/add-food');
      }}
    />
  );

  const proteinQuickAction = (
    <QuickBtn
      label={t('checkIns.quickAdd')}
      onPress={(e) => {
        e.stopPropagation();
        console.log('[CheckInTilesCard] protein quick-add button pressed — navigating to add-food');
        router.push('/add-food');
      }}
    />
  );

  const quickActions: Record<TileType, React.ReactNode> = {
    weight:   weightQuickAction,
    steps:    stepsQuickAction,
    gym:      gymQuickAction,
    calories: caloriesQuickAction,
    protein:  proteinQuickAction,
  };

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: bgColor, borderColor }]}>
        <ActivityIndicator size="small" color={colors.primary} style={{ margin: spacing.md }} />
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: bgColor, borderColor }]}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: textColor }]}>{t('dashboard.todayCheckinsTitle')}</Text>
        <View style={[styles.doneBadge, { backgroundColor: doneCount > 0 ? 'rgba(91,154,168,0.12)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
          <Text style={[styles.doneText, { color: doneCount > 0 ? colors.primary : subColor }]}>
            {doneText}
          </Text>
        </View>
      </View>

      {/* 5-column tile row */}
      <View style={styles.tileRow}>
        {TILE_CONFIGS.map((config) => (
          <CompactTile
            key={config.type}
            config={config}
            percent={percents[config.type]}
            isDark={isDark}
            onPress={() => handleTilePress(config.type)}
            quickAction={quickActions[config.type]}
          />
        ))}
      </View>

      {/* Inline weight input row */}
      {inlineWeightVisible && (
        <View style={[styles.inlineWeightRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
          <TextInput
            style={[
              styles.inlineWeightInput,
              {
                backgroundColor: isDark ? '#1A1C2E' : '#F5F5F7',
                color: isDark ? colors.textDark : colors.primaryText,
                borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
              },
            ]}
            value={inlineWeightInput}
            onChangeText={(text) => {
              console.log('[CheckInTilesCard] inline weight input changed:', text);
              setInlineWeightInput(text);
            }}
            keyboardType="decimal-pad"
            placeholder={t('checkIns.lbsPlaceholder')}
            placeholderTextColor={subColor}
            returnKeyType="done"
            onSubmitEditing={handleInlineWeightConfirm}
            editable={!inlineWeightSaving}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.inlineConfirmBtn, { backgroundColor: colors.primary, opacity: inlineWeightSaving ? 0.6 : 1 }]}
            onPress={handleInlineWeightConfirm}
            disabled={inlineWeightSaving}
            activeOpacity={0.8}
          >
            {inlineWeightSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.inlineConfirmBtnText}>{t('checkIns.confirmLog')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inlineCancelBtn, { borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}
            onPress={() => {
              console.log('[CheckInTilesCard] inline weight input cancelled');
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setInlineWeightVisible(false);
              setInlineWeightInput('');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.inlineCancelBtnText, { color: subColor }]}>{t('checkIns.cancelLog')}</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  doneBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  doneText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tileRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 4,
  },

  // ── Compact tile ──
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 4,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  percentText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Quick action button ──
  quickBtn: {
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(91,154,168,0.15)',
  },
  quickBtnDone: {
    backgroundColor: 'rgba(92,185,123,0.15)',
  },
  quickBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  quickBtnTextDone: {
    color: colors.success,
  },

  // ── Inline weight input ──
  inlineWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  inlineWeightInput: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  inlineConfirmBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  inlineConfirmBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  inlineCancelBtn: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  inlineCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Bottom sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sheetIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginBottom: spacing.sm,
  },

  // ── Weight sheet ──
  loggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  loggedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loggedValue: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 4,
  },
  loggedUnit: {
    fontSize: 12,
    fontWeight: '500',
  },
  weightInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  weightInlineInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  weightInlineButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  weightInlineButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  weightHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  weightHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weightHintText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Steps sheet ──
  stepsCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  stepsCountBig: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  stepsGoalText: {
    fontSize: 16,
    fontWeight: '400',
  },
  progressTrack: {
    marginHorizontal: spacing.sm,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },

  // ── Gym sheet ──
  gymDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  gymDoneText: {
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Shared action button ──
  sheetActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  sheetActionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── History list ──
  historyScroll: {
    maxHeight: 180,
    marginTop: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 8,
  },
  historyDate: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  historyValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyUnit: {
    fontSize: 12,
    fontWeight: '400',
    minWidth: 24,
  },
  historyLoadingRow: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  historyEmpty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
