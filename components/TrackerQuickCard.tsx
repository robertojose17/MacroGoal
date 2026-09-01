
/**
 * TrackerQuickCard
 *
 * Compact inline tracker card for the dashboard.
 * Shows weight (inline input), steps (HealthKit), gym (one-tap),
 * calories, and protein — all in a single card.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Animated,
  Alert,
  LayoutAnimation,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { listTrackers, logEntry, listEntries, Tracker } from '@/utils/trackersApi';
import { tryAwardWorkout, tryAwardWeightCheckin } from '@/utils/xpAwarder';
import { emitXpRefresh } from '@/utils/xpEvents';
import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
import { promptForProgressPhoto } from '@/utils/checkInPhotoUpload';
import { useSteps } from '@/hooks/useSteps';
import * as Haptics from 'expo-haptics';
import { CheckCircle2, RotateCw } from 'lucide-react-native';

export interface TrackerQuickCardProps {
  isDark: boolean;
  userId: string;
  goal: any;
  onXpRefresh: () => void;
}

interface TodayEntry {
  id: string;
  value: number;
}

export default function TrackerQuickCard({ isDark, userId, goal, onXpRefresh }: TrackerQuickCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const stepsHook = useSteps();

  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [todayEntries, setTodayEntries] = useState<Record<string, TodayEntry | null>>({});
  const [loading, setLoading] = useState(true);

  // Weight input state
  const [weightInput, setWeightInput] = useState('');
  const [weightEditing, setWeightEditing] = useState(false);
  const [weightLogging, setWeightLogging] = useState(false);

  // Gym logging state
  const [gymLogging, setGymLogging] = useState(false);

  // Steps refresh state
  const [stepsRefreshing, setStepsRefreshing] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinRef = useRef<Animated.CompositeAnimation | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#1A1C2E' : '#FFFFFF';

  // ── Load trackers + today entries ──────────────────────────────────────────
  const loadTrackers = useCallback(async () => {
    console.log('[TrackerQuickCard] Loading trackers for userId:', userId);
    try {
      const rawTrackers = await listTrackers();
      const list = Array.isArray(rawTrackers) ? rawTrackers : [];
      setTrackers(list);

      const today = toLocalDateString(new Date());
      const entryResults = await Promise.all(
        list.map(async (tr) => {
          try {
            const entries = await listEntries(tr.id, 5);
            return entries.find((e) => e.date === today) ?? null;
          } catch {
            return null;
          }
        })
      );

      const map: Record<string, TodayEntry | null> = {};
      list.forEach((tr, i) => {
        const e = entryResults[i];
        map[tr.id] = e ? { id: e.id, value: Number(e.value) } : null;
      });
      setTodayEntries(map);
      console.log('[TrackerQuickCard] Loaded', list.length, 'trackers, today entries:', Object.keys(map).length);
    } catch (err) {
      console.warn('[TrackerQuickCard] Failed to load trackers:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTrackers();
  }, [loadTrackers]);

  // ── Steps progress animation ───────────────────────────────────────────────
  const stepsGoal = trackers.find((tr) => tr.is_default && tr.name.toLowerCase() === 'steps')?.goal_value ?? 0;
  const stepsCount = stepsHook.steps ?? 0;
  const stepsPct = stepsGoal > 0 ? Math.min(100, (stepsCount / stepsGoal) * 100) : 0;

  useEffect(() => {
    Animated.timing(progressAnim, { toValue: stepsPct, duration: 600, useNativeDriver: false }).start();
  }, [stepsPct, progressAnim]);

  // ── Steps refresh spin animation ───────────────────────────────────────────
  useEffect(() => {
    if (stepsRefreshing) {
      spinRef.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 700, useNativeDriver: true })
      );
      spinRef.current.start();
    } else {
      spinRef.current?.stop();
      spinAnim.setValue(0);
    }
  }, [stepsRefreshing, spinAnim]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const weightTracker = trackers.find((tr) => tr.is_default && tr.name.toLowerCase() === 'weight');
  const stepsTracker = trackers.find((tr) => tr.is_default && tr.name.toLowerCase() === 'steps');
  const gymTracker = trackers.find((tr) => tr.is_default && tr.name.toLowerCase() === 'gym');

  const weightEntry = weightTracker ? (todayEntries[weightTracker.id] ?? null) : null;
  const gymEntry = gymTracker ? (todayEntries[gymTracker.id] ?? null) : null;

  const dailyCals = Number(goal?.daily_calories ?? 0);
  const dailyProtein = Number(goal?.daily_protein ?? 0);

  // ── Log weight ─────────────────────────────────────────────────────────────
  const handleWeightLog = async (isEdit: boolean) => {
    const parsed = parseFloat(weightInput);
    console.log('[TrackerQuickCard] Weight log tapped, value:', weightInput, 'parsed:', parsed, 'isEdit:', isEdit);
    if (isNaN(parsed) || parsed <= 0 || parsed >= 1000) {
      Alert.alert(t('checkIns.invalidWeight'), t('checkIns.enterValidWeight'));
      return;
    }
    if (!weightTracker || weightLogging) return;
    setWeightLogging(true);

    const prevEntry = weightEntry;
    const today = toLocalDateString(new Date());

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const entry = await logEntry(weightTracker.id, today, parsed);
      setTodayEntries((prev) => ({ ...prev, [weightTracker.id]: { id: entry.id, value: Number(entry.value) } }));

      const weightInKg = parsed / 2.20462;
      const { data: { user: weightUser } } = await supabase.auth.getUser();
      if (weightUser) {
        const { data: existingCheckIn } = await supabase
          .from('check_ins')
          .select('id')
          .eq('user_id', weightUser.id)
          .eq('date', today)
          .maybeSingle();

        let checkInId: string | null = null;
        if (existingCheckIn) {
          await supabase.from('check_ins').update({ weight: weightInKg, updated_at: new Date().toISOString() }).eq('id', existingCheckIn.id);
          checkInId = existingCheckIn.id;
        } else {
          const { data: newCheckIn } = await supabase.from('check_ins').insert({ user_id: weightUser.id, date: today, weight: weightInKg }).select('id').single();
          checkInId = newCheckIn?.id ?? null;
        }
        if (checkInId) {
          await tryAwardWeightCheckin(checkInId, weightInKg);
          emitXpRefresh();
          onXpRefresh();
        }
      }

      if (!prevEntry) {
        console.log('[TrackerQuickCard] New weight entry — prompting for progress photo');
        promptForProgressPhoto(parsed, today).catch((e) => console.warn('[TrackerQuickCard] Progress photo prompt failed:', e));
      }

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setWeightEditing(false);
      setWeightInput('');
    } catch (err) {
      console.error('[TrackerQuickCard] Weight log failed:', err);
      Alert.alert(t('checkIns.logFailed'), err instanceof Error ? err.message : String(err));
    } finally {
      setWeightLogging(false);
    }
  };

  const handleWeightPillPress = () => {
    console.log('[TrackerQuickCard] Weight pill tapped — entering edit mode');
    const currentVal = weightEntry ? weightEntry.value.toFixed(1) : '';
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setWeightInput(currentVal);
    setWeightEditing(true);
  };

  // ── Log gym ────────────────────────────────────────────────────────────────
  const handleGymLog = async () => {
    if (!gymTracker || gymLogging) return;
    console.log('[TrackerQuickCard] Gym log tapped, tracker:', gymTracker.id);
    setGymLogging(true);

    const today = toLocalDateString(new Date());
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const entry = await logEntry(gymTracker.id, today, 1);
      setTodayEntries((prev) => ({ ...prev, [gymTracker.id]: { id: entry.id, value: Number(entry.value) } }));

      const { data: { user: gymUser } } = await supabase.auth.getUser();
      if (gymUser) {
        const { data: existingCheckIn } = await supabase.from('check_ins').select('id').eq('user_id', gymUser.id).eq('date', today).maybeSingle();
        if (existingCheckIn) {
          await supabase.from('check_ins').update({ went_to_gym: true, updated_at: new Date().toISOString() }).eq('id', existingCheckIn.id);
        } else {
          await supabase.from('check_ins').insert({ user_id: gymUser.id, date: today, went_to_gym: true });
        }
        console.log('[TrackerQuickCard] Synced went_to_gym=true to check_ins for date:', today);
      }
      await tryAwardWorkout(entry.id);
      emitXpRefresh();
      onXpRefresh();
    } catch (err) {
      console.error('[TrackerQuickCard] Gym log failed:', err);
      setTodayEntries((prev) => ({ ...prev, [gymTracker.id]: null }));
      Alert.alert(t('checkIns.logFailed'), err instanceof Error ? err.message : String(err));
    } finally {
      setGymLogging(false);
    }
  };

  // ── Steps refresh ──────────────────────────────────────────────────────────
  const handleStepsRefresh = async () => {
    if (stepsRefreshing || !stepsTracker) return;
    console.log('[TrackerQuickCard] Steps refresh tapped');
    setStepsRefreshing(true);
    try {
      await stepsHook.refresh();
      const currentSteps = stepsHook.steps;
      if (currentSteps !== null && currentSteps > 0) {
        const today = toLocalDateString(new Date());
        const entry = await logEntry(stepsTracker.id, today, currentSteps);
        setTodayEntries((prev) => ({ ...prev, [stepsTracker.id]: { id: entry.id, value: Number(entry.value) } }));
        console.log('[TrackerQuickCard] Steps entry logged:', currentSteps);
      }
    } catch (err) {
      console.warn('[TrackerQuickCard] Steps refresh failed:', err);
    } finally {
      setStepsRefreshing(false);
    }
  };

  // ── Date label ─────────────────────────────────────────────────────────────
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const dateLabel = `${dayName}, ${monthDay}`;

  // ── Calorie / protein display ──────────────────────────────────────────────
  const calsDisplay = `${Math.round(Number(goal?.today_calories ?? 0))} / ${Math.round(dailyCals)}`;
  const proteinDisplay = `${Math.round(Number(goal?.today_protein ?? 0))}g / ${Math.round(dailyProtein)}g`;

  const stepsCountFormatted = stepsCount.toLocaleString('en-US');
  const stepsGoalFormatted = stepsGoal > 0 ? stepsGoal.toLocaleString('en-US') : null;
  const weightDisplayValue = weightEntry ? Number(weightEntry.value).toFixed(1) : '';

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <ActivityIndicator size="small" color={colors.primary} style={{ margin: spacing.md }} />
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Date header */}
      <Text style={[styles.dateLabel, { color: subColor }]}>
        {t('common.today').toUpperCase()}
        {' — '}
        {dateLabel}
      </Text>

      <View style={[styles.divider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

      {/* ── Weight row ── */}
      {weightTracker && (
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.labelCol}
            onPress={() => {
              console.log('[TrackerQuickCard] Weight title tapped — navigating to tracker history:', weightTracker.id);
              router.push({ pathname: '/tracker/[id]', params: { id: weightTracker.id } });
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.rowEmoji}>⚖️</Text>
            <Text style={[styles.rowLabel, { color: textColor }]}>{t('common.weight')}</Text>
          </TouchableOpacity>

          <View style={styles.actionCol}>
            {weightEntry && !weightEditing ? (
              <Pressable onPress={handleWeightPillPress} style={styles.donePill}>
                <CheckCircle2 size={13} color={colors.success} strokeWidth={2.5} />
                <Text style={[styles.donePillText, { color: colors.success }]}>{weightDisplayValue}</Text>
                <Text style={[styles.donePillUnit, { color: colors.success }]}>{t('checkIns.lbUnit')}</Text>
              </Pressable>
            ) : (
              <View style={styles.weightRow}>
                <TextInput
                  style={[styles.weightInput, { backgroundColor: inputBg, color: textColor, borderColor: cardBorder }]}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="decimal-pad"
                  placeholder={t('checkIns.lbsPlaceholder')}
                  placeholderTextColor={subColor}
                  returnKeyType="done"
                  onSubmitEditing={() => handleWeightLog(weightEditing)}
                  autoFocus={weightEditing}
                />
                <TouchableOpacity
                  style={[styles.logBtn, { backgroundColor: colors.primary, opacity: weightLogging ? 0.6 : 1 }]}
                  onPress={() => {
                    console.log('[TrackerQuickCard] Weight log button pressed');
                    handleWeightLog(weightEditing);
                  }}
                  disabled={weightLogging}
                  activeOpacity={0.8}
                >
                  {weightLogging
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.logBtnText}>{weightEditing ? t('checkIns.save') : t('checkIns.log')}</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Steps row ── */}
      {stepsTracker && (
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.labelCol}
            onPress={() => {
              console.log('[TrackerQuickCard] Steps title tapped — navigating to tracker history:', stepsTracker.id);
              router.push({ pathname: '/tracker/[id]', params: { id: stepsTracker.id } });
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.rowEmoji}>👟</Text>
            <Text style={[styles.rowLabel, { color: textColor }]}>{t('common.steps')}</Text>
          </TouchableOpacity>

          <View style={styles.actionCol}>
            {stepsHook.permission !== 'granted' ? (
              <TouchableOpacity
                style={[styles.logBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  console.log('[TrackerQuickCard] Steps connect health tapped');
                  stepsHook.requestPermission();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.logBtnText}>{t('checkIns.connect')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.stepsRow}>
                <View style={styles.stepsInfoCol}>
                  <View style={styles.stepsCountRow}>
                    <Text style={[styles.stepsCount, { color: textColor }]}>{stepsCountFormatted}</Text>
                    {stepsGoalFormatted && (
                      <Text style={[styles.stepsUnit, { color: subColor }]}>{' / '}{stepsGoalFormatted}</Text>
                    )}
                  </View>
                  {stepsGoal > 0 && (
                    <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2A2C40' : '#E5E7EB' }]}>
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
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.refreshBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    console.log('[TrackerQuickCard] Steps refresh button pressed');
                    handleStepsRefresh();
                  }}
                  disabled={stepsRefreshing}
                  activeOpacity={0.8}
                >
                  <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <RotateCw size={14} color="#fff" strokeWidth={2.5} />
                  </Animated.View>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Gym row ── */}
      {gymTracker && (
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.labelCol}
            onPress={() => {
              console.log('[TrackerQuickCard] Gym title tapped — navigating to tracker history:', gymTracker.id);
              router.push({ pathname: '/tracker/[id]', params: { id: gymTracker.id } });
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.rowEmoji}>🏋️</Text>
            <Text style={[styles.rowLabel, { color: textColor }]}>{t('common.gym')}</Text>
          </TouchableOpacity>

          <View style={styles.actionCol}>
            {gymEntry ? (
              <View style={styles.donePill}>
                <CheckCircle2 size={13} color={colors.success} strokeWidth={2.5} />
                <Text style={[styles.donePillText, { color: colors.success }]}>{t('checkIns.done')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.logBtn, { backgroundColor: colors.primary, opacity: gymLogging ? 0.6 : 1 }]}
                onPress={() => {
                  console.log('[TrackerQuickCard] Gym log button pressed');
                  handleGymLog();
                }}
                disabled={gymLogging}
                activeOpacity={0.8}
              >
                {gymLogging
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.logBtnText}>{t('checkIns.log')}</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Calories row ── */}
      {dailyCals > 0 && (
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            console.log('[TrackerQuickCard] Calories row tapped — navigating to food log');
            router.push('/(home)');
          }}
          activeOpacity={0.7}
        >
          <View style={styles.labelCol}>
            <Text style={styles.rowEmoji}>🍎</Text>
            <Text style={[styles.rowLabel, { color: textColor }]}>{t('common.calories')}</Text>
          </View>
          <View style={styles.actionCol}>
            <Text style={[styles.metricText, { color: textColor }]}>{calsDisplay}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Protein row ── */}
      {dailyProtein > 0 && (
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            console.log('[TrackerQuickCard] Protein row tapped — navigating to food log');
            router.push('/(home)');
          }}
          activeOpacity={0.7}
        >
          <View style={styles.labelCol}>
            <Text style={styles.rowEmoji}>💪</Text>
            <Text style={[styles.rowLabel, { color: textColor }]}>{t('common.protein')}</Text>
          </View>
          <View style={styles.actionCol}>
            <Text style={[styles.metricText, { color: textColor }]}>{proteinDisplay}</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    marginBottom: spacing.sm,
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: spacing.sm,
  },
  labelCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowEmoji: {
    fontSize: 16,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionCol: {
    alignItems: 'flex-end',
  },
  // Weight
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weightInput: {
    width: 64,
    height: 32,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    borderWidth: 1,
  },
  // Steps
  stepsRow: {
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
    fontSize: 14,
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
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Shared action buttons
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    minWidth: 52,
    justifyContent: 'center',
  },
  logBtnText: {
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
  // Calories / Protein
  metricText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
