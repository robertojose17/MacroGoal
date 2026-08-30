
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Animated,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { createTracker, updateTracker, Tracker } from '@/utils/trackersApi';
import { supabase } from '@/lib/supabase/client';
import { useTranslation } from 'react-i18next';

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
      <Pressable onPressIn={animIn} onPressOut={animOut} onPress={onPress} disabled={disabled} style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESET_EMOJIS = [
  '💪', '🏃', '😴', '💧', '🧘', '📚', '🎯', '⚖️', '🥗', '🚶',
  '🏋️', '🎵', '🌅', '🧹', '📱', '❤️', '🌿', '✍️', '🍎', '🛌',
  '🔥', '⭐', '🏆', '🎉', '🧠', '🌙', '☀️', '🍵', '🚴', '🤸',
];

type TrackerType = 'binary' | 'count' | 'numeric' | 'duration';
type Frequency = 'daily' | 'weekly';

export default function CreateTrackerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { trackerId } = useLocalSearchParams<{ trackerId?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const isEditing = !!trackerId;

  const TYPE_OPTIONS: { value: TrackerType; label: string; desc: string }[] = [
    { value: 'binary', label: t('tracker.binary'), desc: t('tracker.binaryDesc') },
    { value: 'count', label: t('tracker.count'), desc: t('tracker.countDesc') },
    { value: 'numeric', label: t('tracker.numeric'), desc: t('tracker.numericDesc') },
    { value: 'duration', label: t('tracker.duration'), desc: t('tracker.durationDesc') },
  ];

  const [emoji, setEmoji] = useState('🎯');
  const [name, setName] = useState('');
  const [trackerType, setTrackerType] = useState<TrackerType>('binary');
  const [unit, setUnit] = useState('');
  const [goalValue, setGoalValue] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) loadExisting();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerId]);

  const loadExisting = async () => {
    console.log('[CreateTracker] Loading existing tracker:', trackerId);
    try {
      const { data, error } = await supabase
        .from('trackers')
        .select('*')
        .eq('id', trackerId)
        .single();

      if (error || !data) {
        console.error('[CreateTracker] Tracker not found:', error);
        router.back();
        return;
      }

      setEmoji(data.emoji ?? '🎯');
      setName(data.name ?? '');
      setTrackerType(data.tracker_type ?? 'numeric');
      setUnit(data.unit ?? '');
      setGoalValue(data.goal_value != null ? String(data.goal_value) : '');
      setFrequency(data.frequency ?? 'daily');
    } catch (e) {
      console.error('[CreateTracker] Error loading tracker:', e);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('tracker.enterTrackerName'));
      return;
    }

    const goalNum = goalValue.trim() ? parseFloat(goalValue) : null;
    if (goalValue.trim() && isNaN(goalNum!)) {
      setError(t('tracker.goalMustBeNumber'));
      return;
    }

    const payload: Partial<Tracker> = {
      emoji,
      name: name.trim(),
      tracker_type: trackerType,
      unit: trackerType !== 'binary' && unit.trim() ? unit.trim() : null,
      goal_value: goalNum,
      frequency,
    };

    console.log('[CreateTracker] Save tapped —', isEditing ? 'update' : 'create', payload);
    setSaving(true);
    setError(null);
    try {
      if (isEditing) {
        await updateTracker(trackerId!, payload);
        console.log('[CreateTracker] Tracker updated successfully');
      } else {
        const newTracker = await createTracker(payload);
        console.log('[CreateTracker] Tracker created successfully:', newTracker.id);
        // Fire-and-forget: translate the new tracker name
        supabase.functions.invoke('translate-record', {
          body: {
            table: 'trackers',
            id: newTracker.id,
            fields: { name: newTracker.name },
            target_languages: ['es'],
          },
        }).catch(() => {});
      }
      router.back();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('tracker.failedToSave');
      console.error('[CreateTracker] Save error:', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const inputBg = isDark ? '#2A2C40' : '#F0F2F7';
  const focusBorder = colors.primary;

  const screenTitle = isEditing ? t('tracker.editTracker') : t('tracker.newTracker');
  const saveButtonText = isEditing ? t('tracker.saveChanges') : t('tracker.createTracker');

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: screenTitle }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Emoji picker */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: textColor }]}>{t('tracker.icon')}</Text>
            <View style={[styles.emojiPreview, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={styles.emojiPreviewText}>{emoji}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.emojiRow}
            >
              {PRESET_EMOJIS.map(e => (
                <AnimatedPressable
                  key={e}
                  onPress={() => {
                    console.log('[CreateTracker] Emoji selected:', e);
                    setEmoji(e);
                  }}
                  style={[
                    styles.emojiOption,
                    {
                      backgroundColor: emoji === e ? colors.primary + '22' : inputBg,
                      borderColor: emoji === e ? colors.primary : 'transparent',
                    },
                  ]}
                  scaleValue={0.9}
                >
                  <Text style={styles.emojiOptionText}>{e}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </View>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: textColor }]}>{t('tracker.nameRequired')}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: inputBg,
                  borderColor: focusedField === 'name' ? focusBorder : cardBorder,
                  color: textColor,
                },
              ]}
              value={name}
              onChangeText={setName}
              placeholder={t('tracker.placeholderName')}
              placeholderTextColor={subColor}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              autoFocus={!isEditing}
              returnKeyType="next"
            />
          </View>

          {/* Tracker type */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: textColor }]}>{t('tracker.trackerType')}</Text>
            <View style={styles.pillRow}>
              {TYPE_OPTIONS.map(opt => {
                const isSelected = trackerType === opt.value;
                return (
                  <AnimatedPressable
                    key={opt.value}
                    onPress={() => {
                      console.log('[CreateTracker] Type selected:', opt.value);
                      setTrackerType(opt.value);
                    }}
                    style={[
                      styles.typePill,
                      {
                        backgroundColor: isSelected ? colors.primary : inputBg,
                        borderColor: isSelected ? colors.primary : cardBorder,
                        flex: 1,
                      },
                    ]}
                    scaleValue={0.95}
                  >
                    <Text style={[styles.typePillLabel, { color: isSelected ? '#fff' : textColor }]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.typePillDesc, { color: isSelected ? 'rgba(255,255,255,0.75)' : subColor }]}>
                      {opt.desc}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          {/* Unit (hidden for binary) */}
          {trackerType !== 'binary' ? (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>{t('tracker.unitOptional')}</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: inputBg,
                    borderColor: focusedField === 'unit' ? focusBorder : cardBorder,
                    color: textColor,
                  },
                ]}
                value={unit}
                onChangeText={setUnit}
                placeholder={
                  trackerType === 'count' ? t('tracker.placeholderUnit_count') :
                  trackerType === 'numeric' ? t('tracker.placeholderUnit_numeric') :
                  t('tracker.placeholderUnit_duration')
                }
                placeholderTextColor={subColor}
                onFocus={() => setFocusedField('unit')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
              />
            </View>
          ) : null}

          {/* Goal value */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: textColor }]}>{t('tracker.dailyGoalOptional')}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: inputBg,
                  borderColor: focusedField === 'goal' ? focusBorder : cardBorder,
                  color: textColor,
                },
              ]}
              value={goalValue}
              onChangeText={setGoalValue}
              placeholder={trackerType === 'binary' ? '1' : 'e.g. 10000'}
              placeholderTextColor={subColor}
              keyboardType="decimal-pad"
              onFocus={() => setFocusedField('goal')}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Frequency */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: textColor }]}>{t('tracker.frequency')}</Text>
            <View style={styles.freqRow}>
              {(['daily', 'weekly'] as Frequency[]).map(f => {
                const isSelected = frequency === f;
                return (
                  <AnimatedPressable
                    key={f}
                    onPress={() => {
                      console.log('[CreateTracker] Frequency selected:', f);
                      setFrequency(f);
                    }}
                    style={[
                      styles.freqPill,
                      {
                        backgroundColor: isSelected ? colors.primary : inputBg,
                        borderColor: isSelected ? colors.primary : cardBorder,
                      },
                    ]}
                    scaleValue={0.95}
                  >
                    <Text style={[styles.freqPillText, { color: isSelected ? '#fff' : textColor }]}>
                      {f === 'daily' ? t('tracker.daily') : t('tracker.weekly')}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          {/* Error */}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          {/* Save button */}
          <AnimatedPressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveButton, { backgroundColor: colors.primary }]}
            scaleValue={0.97}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>
                {saveButtonText}
              </Text>
            )}
          </AnimatedPressable>

          {/* Cancel */}
          <AnimatedPressable
            onPress={() => { console.log('[CreateTracker] Cancel tapped'); router.back(); }}
            style={styles.cancelButton}
          >
            <Text style={[styles.cancelButtonText, { color: subColor }]}>{t('common.cancel')}</Text>
          </AnimatedPressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 60,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  emojiPreview: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  emojiPreviewText: {
    fontSize: 28,
  },
  emojiRow: {
    gap: 8,
    paddingVertical: 4,
  },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  emojiOptionText: {
    fontSize: 22,
  },
  input: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 16,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  typePill: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  typePillLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  typePillDesc: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  freqRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  freqPill: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    paddingVertical: 13,
    alignItems: 'center',
  },
  freqPillText: {
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 50,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
