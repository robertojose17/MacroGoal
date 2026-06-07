
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  Pressable,
  Alert,
  ActionSheetIOS,
  Platform,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  Tracker,
  TrackerEntry,
  TrackerStats,
  getStats,
  listEntries,
  deleteEntry,
  deleteTracker,
  listTrackers,
  backfillWeightFromCheckIns,
  updateTrackerGoal,
  updateEntry,
} from '@/utils/trackersApi';
import {
  Flame,
  Trophy,
  Target,
  TrendingUp,
  Calendar,
  MoreHorizontal,
  Plus,
  Trash2,
  CheckCircle2,
  BarChart3,
  Pencil,
  RotateCw,
  Camera,
} from 'lucide-react-native';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import * as Haptics from 'expo-haptics';
import { useSteps } from '@/hooks/useSteps';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';

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

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon,
  iconColor,
  isDark,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconColor: string;
  isDark: boolean;
}) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  return (
    <View style={[styles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <View style={[styles.statIconCircle, { backgroundColor: iconColor + '18' }]}>
        {icon}
      </View>
      <Text style={[styles.statValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: subColor }]}>{label}</Text>
      {sub ? <Text style={[styles.statSub, { color: subColor }]}>{sub}</Text> : null}
    </View>
  );
}

// ─── SkeletonStatCard ─────────────────────────────────────────────────────────
function SkeletonStatCard({ isDark }: { isDark: boolean }) {
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
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  return (
    <Animated.View style={[styles.statCard, { backgroundColor: cardBg, borderColor: cardBorder, opacity }]}>
      <View style={[styles.skeletonCircle, { backgroundColor: shimmer }]} />
      <View style={[styles.skeletonLine, { width: 48, backgroundColor: shimmer, marginTop: 8 }]} />
      <View style={[styles.skeletonLine, { width: 64, height: 11, backgroundColor: shimmer, marginTop: 6 }]} />
    </Animated.View>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatValue(value: number, trackerType: string, unit: string | null): string {
  if (trackerType === 'binary') return value === 1 ? 'Done ✓' : 'Skipped';
  const num = Number(value);
  const unitStr = unit ? ` ${unit}` : '';
  if (trackerType === 'duration') {
    if (num >= 60) {
      const h = Math.floor(num / 60);
      const min = num % 60;
      return min > 0 ? `${h}h ${min}m` : `${h}h`;
    }
    return `${num}m`;
  }
  return `${num % 1 === 0 ? num : num.toFixed(1)}${unitStr}`;
}

// ─── Goal preset chips ────────────────────────────────────────────────────────
const STEP_PRESETS = [5000, 7500, 10000, 12500, 15000];

// ─── DailyGoalSection ─────────────────────────────────────────────────────────
function DailyGoalSection({
  trackerId,
  currentGoal,
  isDark,
  onGoalSaved,
}: {
  trackerId: string;
  currentGoal: number | null;
  isDark: boolean;
  onGoalSaved: (newGoal: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [saving, setSaving] = useState(false);

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#2A2C40' : '#F1F3F8';

  const goalDisplay = currentGoal ? currentGoal.toLocaleString('en-US') + ' steps' : 'Not set';

  const saveGoal = async (value: number) => {
    console.log('[TrackerDetail] saveGoal called with value:', value, 'for tracker:', trackerId);
    if (value < 1000 || value > 50000) {
      Alert.alert('Invalid goal', 'Please enter a goal between 1,000 and 50,000 steps.');
      return;
    }
    setSaving(true);
    try {
      await updateTrackerGoal(trackerId, value);
      console.log('[TrackerDetail] Goal saved successfully:', value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onGoalSaved(value);
      setEditing(false);
      setCustomMode(false);
      setCustomInput('');
      setSelectedPreset(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save goal';
      console.error('[TrackerDetail] saveGoal error:', msg);
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePresetTap = async (preset: number) => {
    console.log('[TrackerDetail] Goal preset tapped:', preset);
    setSelectedPreset(preset);
    await saveGoal(preset);
  };

  const handleCustomSave = async () => {
    const parsed = parseInt(customInput.replace(/,/g, ''), 10);
    console.log('[TrackerDetail] Custom goal save tapped, input:', customInput, 'parsed:', parsed);
    if (isNaN(parsed)) {
      Alert.alert('Invalid goal', 'Please enter a valid number.');
      return;
    }
    await saveGoal(parsed);
  };

  return (
    <View style={[styles.goalCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header row */}
      <View style={styles.goalHeaderRow}>
        <Text style={[styles.goalSectionTitle, { color: textColor }]}>Daily Goal</Text>
        {!editing ? (
          <AnimatedPressable
            onPress={() => {
              console.log('[TrackerDetail] Edit goal button tapped');
              setEditing(true);
            }}
            style={styles.editGoalBtn}
            scaleValue={0.92}
          >
            <Pencil size={13} color={colors.primary} strokeWidth={2.5} />
            <Text style={[styles.editGoalBtnText, { color: colors.primary }]}>Edit</Text>
          </AnimatedPressable>
        ) : (
          <Pressable
            onPress={() => {
              console.log('[TrackerDetail] Cancel goal edit tapped');
              setEditing(false);
              setCustomMode(false);
              setCustomInput('');
              setSelectedPreset(null);
            }}
          >
            <Text style={[styles.cancelGoalText, { color: subColor }]}>Cancel</Text>
          </Pressable>
        )}
      </View>

      {/* Current goal display */}
      {!editing ? (
        <Text style={[styles.goalValueText, { color: colors.primary }]}>{goalDisplay}</Text>
      ) : null}

      {/* Edit mode: presets + custom */}
      {editing ? (
        <View style={styles.goalEditArea}>
          {/* Preset chips */}
          <View style={styles.presetsRow}>
            {STEP_PRESETS.map((preset) => {
              const isSelected = selectedPreset === preset || currentGoal === preset;
              const chipBg = isSelected ? colors.primary : (isDark ? '#2A2C40' : '#F1F3F8');
              const chipText = isSelected ? '#fff' : textColor;
              const presetLabel = preset.toLocaleString('en-US');
              return (
                <AnimatedPressable
                  key={preset}
                  onPress={() => handlePresetTap(preset)}
                  style={[styles.presetChip, { backgroundColor: chipBg }]}
                  scaleValue={0.93}
                  disabled={saving}
                >
                  <Text style={[styles.presetChipText, { color: chipText }]}>{presetLabel}</Text>
                </AnimatedPressable>
              );
            })}
          </View>

          {/* Custom input */}
          {!customMode ? (
            <AnimatedPressable
              onPress={() => {
                console.log('[TrackerDetail] Custom goal chip tapped');
                setCustomMode(true);
              }}
              style={[styles.presetChip, { backgroundColor: isDark ? '#2A2C40' : '#F1F3F8' }]}
              scaleValue={0.93}
            >
              <Text style={[styles.presetChipText, { color: textColor }]}>Custom</Text>
            </AnimatedPressable>
          ) : (
            <View style={styles.customInputRow}>
              <TextInput
                style={[styles.customInput, { backgroundColor: inputBg, color: textColor }]}
                value={customInput}
                onChangeText={setCustomInput}
                keyboardType="number-pad"
                placeholder="e.g. 8000"
                placeholderTextColor={subColor}
                returnKeyType="done"
                onSubmitEditing={handleCustomSave}
                autoFocus
              />
              <AnimatedPressable
                onPress={handleCustomSave}
                style={[styles.customSaveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                scaleValue={0.94}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.customSaveBtnText}>Save</Text>
                )}
              </AnimatedPressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

// ─── GymEntryActions ─────────────────────────────────────────────────────────
// Per-row action buttons for the Gym tracker only (Camera + Calendar, no Pencil).
function GymEntryActions({
  entry,
  trackerId,
  isDark,
  onReload,
}: {
  entry: TrackerEntry;
  trackerId: string;
  isDark: boolean;
  onReload: () => Promise<void>;
}) {
  const btnBg = isDark ? '#2A2C40' : '#F1F3F8';
  const iconColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date>(() => {
    const [y, m, d] = entry.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  });
  const [savingDate, setSavingDate] = useState(false);

  // ── Upload photo helper (mirrors WeightEntryActions) ──────────────────────
  const uploadPhoto = async (checkInId: string, imageUri: string): Promise<void> => {
    console.log('[TrackerDetail][Gym] uploadPhoto — checkInId:', checkInId, 'uri:', imageUri);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session available for photo upload');

    const baseUrl = `${SUPABASE_PROJECT_URL}/functions/v1/check-in-photos`;

    console.log('[TrackerDetail][Gym] Requesting upload URL from edge function');
    const urlResponse = await fetch(`${baseUrl}/upload-url`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_name: 'photo.jpg', content_type: 'image/jpeg' }),
    });
    if (!urlResponse.ok) {
      const text = await urlResponse.text();
      throw new Error(`Failed to get upload URL: ${urlResponse.status} ${text}`);
    }
    const { upload_url, storage_path, public_url } = await urlResponse.json();
    console.log('[TrackerDetail][Gym] Got upload URL, storage_path:', storage_path);

    console.log('[TrackerDetail][Gym] Uploading image binary to storage');
    const imageResponse = await fetch(imageUri);
    const blob = await imageResponse.blob();
    const putResponse = await fetch(upload_url, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    if (!putResponse.ok) {
      const text = await putResponse.text();
      throw new Error(`Failed to upload image: ${putResponse.status} ${text}`);
    }
    console.log('[TrackerDetail][Gym] Image uploaded successfully');

    console.log('[TrackerDetail][Gym] Saving photo record to database');
    const saveResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ check_in_id: checkInId, photo_url: public_url, storage_path }),
    });
    if (!saveResponse.ok) {
      const text = await saveResponse.text();
      throw new Error(`Failed to save photo record: ${saveResponse.status} ${text}`);
    }
    console.log('[TrackerDetail][Gym] Photo record saved successfully');
  };

  // ── Ensure a check_in row exists for this gym entry's date ────────────────
  const ensureGymCheckIn = async (userId: string): Promise<string> => {
    console.log('[TrackerDetail][Gym] ensureGymCheckIn — date:', entry.date);
    const { data: existing } = await supabase
      .from('check_ins')
      .select('id')
      .eq('user_id', userId)
      .eq('date', entry.date)
      .maybeSingle();

    if (existing?.id) {
      console.log('[TrackerDetail][Gym] Found existing check_in:', existing.id);
      // Ensure went_to_gym is true on the existing row
      await supabase.from('check_ins').update({ went_to_gym: true }).eq('id', existing.id);
      return existing.id;
    }

    console.log('[TrackerDetail][Gym] Inserting new check_in with went_to_gym: true');
    const { data: inserted, error } = await supabase
      .from('check_ins')
      .insert({ user_id: userId, date: entry.date, went_to_gym: true })
      .select('id')
      .single();

    if (error || !inserted) {
      throw new Error(error?.message ?? 'Failed to create check_in for photo');
    }
    console.log('[TrackerDetail][Gym] Created new check_in:', inserted.id);
    return inserted.id;
  };

  // ── Camera button handler ─────────────────────────────────────────────────
  const handleCamera = () => {
    console.log('[TrackerDetail][Gym] Camera button tapped — entry date:', entry.date);
    const dateLabel = formatDate(entry.date);
    Alert.alert(`Add a photo for ${dateLabel}`, undefined, [
      { text: 'Take Photo', onPress: () => pickAndUpload('camera') },
      { text: 'Choose from Library', onPress: () => pickAndUpload('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickAndUpload = async (source: 'camera' | 'library') => {
    console.log('[TrackerDetail][Gym] pickAndUpload — source:', source, 'entry:', entry.id);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library access is needed to select a photo.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
        });
      }

      if (result.canceled || result.assets.length === 0) {
        console.log('[TrackerDetail][Gym] Photo picker cancelled');
        return;
      }

      const uri = result.assets[0].uri;
      console.log('[TrackerDetail][Gym] Photo selected, starting upload — uri:', uri);
      setUploadingPhoto(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const checkInId = await ensureGymCheckIn(user.id);
      await uploadPhoto(checkInId, uri);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      console.log('[TrackerDetail][Gym] Photo upload complete for entry:', entry.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload photo';
      console.error('[TrackerDetail][Gym] pickAndUpload error:', msg);
      Alert.alert('Error', msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Calendar (edit date) handler ──────────────────────────────────────────
  const handleCalendarPress = () => {
    console.log('[TrackerDetail][Gym] Calendar tapped — entry:', entry.id, 'date:', entry.date);
    const [y, m, d] = entry.date.split('-').map(Number);
    setPickedDate(new Date(y, m - 1, d));
    setShowDateModal(true);
  };

  const handleSaveDate = async () => {
    const newDateStr = toLocalDateString(pickedDate);
    console.log('[TrackerDetail][Gym] Save date — old:', entry.date, 'new:', newDateStr);

    if (newDateStr === entry.date) {
      setShowDateModal(false);
      return;
    }

    setSavingDate(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for duplicate date in tracker_entries
      const { data: conflict } = await supabase
        .from('tracker_entries')
        .select('id')
        .eq('tracker_id', trackerId)
        .eq('user_id', user.id)
        .eq('date', newDateStr)
        .maybeSingle();

      if (conflict) {
        Alert.alert('Date conflict', 'An entry already exists for that date.');
        setSavingDate(false);
        return;
      }

      // Update tracker_entries date
      const { error: teError } = await supabase
        .from('tracker_entries')
        .update({ date: newDateStr })
        .eq('id', entry.id)
        .eq('user_id', user.id);

      if (teError) throw new Error(teError.message);
      console.log('[TrackerDetail][Gym] tracker_entries date updated to:', newDateStr);

      // Sync check_ins: find old row by (user_id, old_date) with went_to_gym = true
      const { data: oldCheckIn } = await supabase
        .from('check_ins')
        .select('id, weight, steps, notes')
        .eq('user_id', user.id)
        .eq('date', entry.date)
        .eq('went_to_gym', true)
        .maybeSingle();

      if (oldCheckIn) {
        const hasOtherData =
          oldCheckIn.weight != null ||
          oldCheckIn.steps != null ||
          oldCheckIn.notes != null;

        if (!hasOtherData) {
          // Safe to move the row's date
          console.log('[TrackerDetail][Gym] Moving check_in date — id:', oldCheckIn.id, 'to:', newDateStr);
          await supabase.from('check_ins').update({ date: newDateStr }).eq('id', oldCheckIn.id);
        } else {
          // Row has other data — set went_to_gym false on old row, upsert new row at new date
          console.log('[TrackerDetail][Gym] check_in has other data — clearing gym on old row, upserting new');
          await supabase.from('check_ins').update({ went_to_gym: false }).eq('id', oldCheckIn.id);
          await supabase.from('check_ins').upsert(
            { user_id: user.id, date: newDateStr, went_to_gym: true },
            { onConflict: 'user_id,date' }
          );
        }
      }

      setShowDateModal(false);
      await onReload();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      console.log('[TrackerDetail][Gym] Date change saved and entries reloaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update date';
      console.error('[TrackerDetail][Gym] handleSaveDate error:', msg);
      Alert.alert('Error', msg);
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <>
      {/* Two inline action buttons: Camera + Calendar */}
      <View style={styles.weightActionBtns}>
        {/* Camera */}
        <AnimatedPressable
          onPress={handleCamera}
          style={[styles.weightActionBtn, { backgroundColor: btnBg }]}
          scaleValue={0.88}
          disabled={uploadingPhoto}
        >
          {uploadingPhoto ? (
            <ActivityIndicator size="small" color={iconColor} />
          ) : (
            <Camera size={16} color={iconColor} strokeWidth={2} />
          )}
        </AnimatedPressable>

        {/* Calendar */}
        <AnimatedPressable
          onPress={handleCalendarPress}
          style={[styles.weightActionBtn, { backgroundColor: btnBg }]}
          scaleValue={0.88}
        >
          <Calendar size={16} color={iconColor} strokeWidth={2} />
        </AnimatedPressable>
      </View>

      {/* Edit date modal */}
      <Modal
        visible={showDateModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowDateModal(false)}
      >
        <WeightDateModal
          isDark={isDark}
          pickedDate={pickedDate}
          setPickedDate={setPickedDate}
          saving={savingDate}
          onCancel={() => {
            console.log('[TrackerDetail][Gym] Edit date modal cancelled');
            setShowDateModal(false);
          }}
          onSave={handleSaveDate}
        />
      </Modal>
    </>
  );
}

// ─── WeightEntryActions ───────────────────────────────────────────────────────
// Per-row action buttons for the Weight tracker only.
function WeightEntryActions({
  entry,
  trackerId,
  isDark,
  onReload,
}: {
  entry: TrackerEntry;
  trackerId: string;
  isDark: boolean;
  onReload: () => Promise<void>;
}) {
  const btnBg = isDark ? '#2A2C40' : '#F1F3F8';
  const iconColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  // ── Camera state ──────────────────────────────────────────────────────────
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Edit value modal state ────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Edit date modal state ─────────────────────────────────────────────────
  const [showDateModal, setShowDateModal] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date>(() => {
    const [y, m, d] = entry.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  });
  const [savingDate, setSavingDate] = useState(false);

  // ── Upload photo helper (mirrors check-in-form.tsx uploadPhoto) ───────────
  const uploadPhoto = async (checkInId: string, imageUri: string): Promise<void> => {
    console.log('[TrackerDetail] uploadPhoto — checkInId:', checkInId, 'uri:', imageUri);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session available for photo upload');

    const baseUrl = `${SUPABASE_PROJECT_URL}/functions/v1/check-in-photos`;

    // Step 1: Get signed upload URL
    console.log('[TrackerDetail] Requesting upload URL from edge function');
    const urlResponse = await fetch(`${baseUrl}/upload-url`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_name: 'photo.jpg', content_type: 'image/jpeg' }),
    });
    if (!urlResponse.ok) {
      const text = await urlResponse.text();
      throw new Error(`Failed to get upload URL: ${urlResponse.status} ${text}`);
    }
    const { upload_url, storage_path, public_url } = await urlResponse.json();
    console.log('[TrackerDetail] Got upload URL, storage_path:', storage_path);

    // Step 2: Upload image binary
    console.log('[TrackerDetail] Uploading image binary to storage');
    const imageResponse = await fetch(imageUri);
    const blob = await imageResponse.blob();
    const putResponse = await fetch(upload_url, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    if (!putResponse.ok) {
      const text = await putResponse.text();
      throw new Error(`Failed to upload image: ${putResponse.status} ${text}`);
    }
    console.log('[TrackerDetail] Image uploaded successfully');

    // Step 3: Save photo record
    console.log('[TrackerDetail] Saving photo record to database');
    const saveResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ check_in_id: checkInId, photo_url: public_url, storage_path }),
    });
    if (!saveResponse.ok) {
      const text = await saveResponse.text();
      throw new Error(`Failed to save photo record: ${saveResponse.status} ${text}`);
    }
    console.log('[TrackerDetail] Photo record saved successfully');
  };

  // ── Ensure a check_in row exists for this entry's date, return its id ─────
  const ensureCheckIn = async (userId: string): Promise<string> => {
    console.log('[TrackerDetail] ensureCheckIn — date:', entry.date);
    const { data: existing } = await supabase
      .from('check_ins')
      .select('id')
      .eq('user_id', userId)
      .eq('date', entry.date)
      .maybeSingle();

    if (existing?.id) {
      console.log('[TrackerDetail] Found existing check_in:', existing.id);
      return existing.id;
    }

    // Insert a new check_in with the weight value converted back to kg
    const weightKg = Number(entry.value) / 2.20462;
    console.log('[TrackerDetail] Inserting new check_in — weight kg:', weightKg);
    const { data: inserted, error } = await supabase
      .from('check_ins')
      .insert({ user_id: userId, date: entry.date, weight: weightKg })
      .select('id')
      .single();

    if (error || !inserted) {
      throw new Error(error?.message ?? 'Failed to create check_in for photo');
    }
    console.log('[TrackerDetail] Created new check_in:', inserted.id);
    return inserted.id;
  };

  // ── Camera button handler ─────────────────────────────────────────────────
  const handleCamera = () => {
    console.log('[TrackerDetail] Camera button tapped — entry date:', entry.date);
    const dateLabel = formatDate(entry.date);
    Alert.alert(`Add a photo for ${dateLabel}`, undefined, [
      {
        text: 'Take Photo',
        onPress: () => pickAndUpload('camera'),
      },
      {
        text: 'Choose from Library',
        onPress: () => pickAndUpload('library'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickAndUpload = async (source: 'camera' | 'library') => {
    console.log('[TrackerDetail] pickAndUpload — source:', source, 'entry:', entry.id);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library access is needed to select a photo.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
        });
      }

      if (result.canceled || result.assets.length === 0) {
        console.log('[TrackerDetail] Photo picker cancelled');
        return;
      }

      const uri = result.assets[0].uri;
      console.log('[TrackerDetail] Photo selected, starting upload — uri:', uri);
      setUploadingPhoto(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const checkInId = await ensureCheckIn(user.id);
      await uploadPhoto(checkInId, uri);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      console.log('[TrackerDetail] Photo upload complete for entry:', entry.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload photo';
      console.error('[TrackerDetail] pickAndUpload error:', msg);
      Alert.alert('Error', msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Pencil (edit value) handler ───────────────────────────────────────────
  const handlePencilPress = () => {
    const currentLbs = Number(entry.value);
    const display = currentLbs % 1 === 0 ? String(currentLbs) : currentLbs.toFixed(1);
    console.log('[TrackerDetail] Pencil tapped — entry:', entry.id, 'current value:', display);
    setEditValue(display);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    const parsed = parseFloat(editValue);
    console.log('[TrackerDetail] Save edit value — raw:', editValue, 'parsed:', parsed);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid value', 'Please enter a valid weight greater than 0.');
      return;
    }
    setSavingEdit(true);
    try {
      // Update tracker_entries
      await updateEntry(trackerId, entry.id, { value: parsed });
      console.log('[TrackerDetail] tracker_entries updated — new lbs:', parsed);

      // Sync check_ins: convert lbs → kg
      const weightKg = parsed / 2.20462;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: existing } = await supabase
          .from('check_ins')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', entry.date)
          .maybeSingle();

        if (existing?.id) {
          console.log('[TrackerDetail] Updating check_ins weight — id:', existing.id, 'kg:', weightKg);
          await supabase.from('check_ins').update({ weight: weightKg }).eq('id', existing.id);
        } else {
          console.log('[TrackerDetail] Inserting new check_in for edited weight — kg:', weightKg);
          await supabase.from('check_ins').insert({ user_id: user.id, date: entry.date, weight: weightKg });
        }
      }

      setShowEditModal(false);
      await onReload();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      console.log('[TrackerDetail] Edit value saved and entries reloaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update entry';
      console.error('[TrackerDetail] handleSaveEdit error:', msg);
      Alert.alert('Error', msg);
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Calendar (edit date) handler ──────────────────────────────────────────
  const handleCalendarPress = () => {
    console.log('[TrackerDetail] Calendar tapped — entry:', entry.id, 'date:', entry.date);
    const [y, m, d] = entry.date.split('-').map(Number);
    setPickedDate(new Date(y, m - 1, d));
    setShowDateModal(true);
  };

  const handleSaveDate = async () => {
    const newDateStr = toLocalDateString(pickedDate);
    console.log('[TrackerDetail] Save date — old:', entry.date, 'new:', newDateStr);

    if (newDateStr === entry.date) {
      setShowDateModal(false);
      return;
    }

    setSavingDate(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for duplicate date in tracker_entries
      const { data: conflict } = await supabase
        .from('tracker_entries')
        .select('id')
        .eq('tracker_id', trackerId)
        .eq('user_id', user.id)
        .eq('date', newDateStr)
        .maybeSingle();

      if (conflict) {
        Alert.alert('Date conflict', 'An entry already exists for that date.');
        setSavingDate(false);
        return;
      }

      // Update tracker_entries date
      const { error: teError } = await supabase
        .from('tracker_entries')
        .update({ date: newDateStr })
        .eq('id', entry.id)
        .eq('user_id', user.id);

      if (teError) throw new Error(teError.message);
      console.log('[TrackerDetail] tracker_entries date updated to:', newDateStr);

      // Sync check_ins: find old row by (user_id, old_date) with weight not null
      const { data: oldCheckIn } = await supabase
        .from('check_ins')
        .select('id, weight, steps, went_to_gym, notes')
        .eq('user_id', user.id)
        .eq('date', entry.date)
        .not('weight', 'is', null)
        .maybeSingle();

      if (oldCheckIn) {
        const hasOtherData =
          oldCheckIn.steps != null ||
          oldCheckIn.went_to_gym != null ||
          oldCheckIn.notes != null;

        if (!hasOtherData) {
          // Safe to move the row's date
          console.log('[TrackerDetail] Moving check_in date — id:', oldCheckIn.id, 'to:', newDateStr);
          await supabase.from('check_ins').update({ date: newDateStr }).eq('id', oldCheckIn.id);
        } else {
          // Row has other data — null the weight on old row, upsert new row at new date
          console.log('[TrackerDetail] check_in has other data — nulling weight on old row, upserting new');
          await supabase.from('check_ins').update({ weight: null }).eq('id', oldCheckIn.id);
          const weightKg = Number(entry.value) / 2.20462;
          await supabase.from('check_ins').upsert(
            { user_id: user.id, date: newDateStr, weight: weightKg },
            { onConflict: 'user_id,date' }
          );
        }
      }

      setShowDateModal(false);
      await onReload();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      console.log('[TrackerDetail] Date change saved and entries reloaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update date';
      console.error('[TrackerDetail] handleSaveDate error:', msg);
      Alert.alert('Error', msg);
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <>
      {/* Three inline action buttons */}
      <View style={styles.weightActionBtns}>
        {/* Camera */}
        <AnimatedPressable
          onPress={handleCamera}
          style={[styles.weightActionBtn, { backgroundColor: btnBg }]}
          scaleValue={0.88}
          disabled={uploadingPhoto}
        >
          {uploadingPhoto ? (
            <ActivityIndicator size="small" color={iconColor} />
          ) : (
            <Camera size={16} color={iconColor} strokeWidth={2} />
          )}
        </AnimatedPressable>

        {/* Pencil */}
        <AnimatedPressable
          onPress={handlePencilPress}
          style={[styles.weightActionBtn, { backgroundColor: btnBg }]}
          scaleValue={0.88}
        >
          <Pencil size={16} color={iconColor} strokeWidth={2} />
        </AnimatedPressable>

        {/* Calendar */}
        <AnimatedPressable
          onPress={handleCalendarPress}
          style={[styles.weightActionBtn, { backgroundColor: btnBg }]}
          scaleValue={0.88}
        >
          <Calendar size={16} color={iconColor} strokeWidth={2} />
        </AnimatedPressable>
      </View>

      {/* Edit value modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowEditModal(false)}
      >
        <WeightEditModal
          isDark={isDark}
          editValue={editValue}
          setEditValue={setEditValue}
          saving={savingEdit}
          onCancel={() => {
            console.log('[TrackerDetail] Edit value modal cancelled');
            setShowEditModal(false);
          }}
          onSave={handleSaveEdit}
        />
      </Modal>

      {/* Edit date modal */}
      <Modal
        visible={showDateModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowDateModal(false)}
      >
        <WeightDateModal
          isDark={isDark}
          pickedDate={pickedDate}
          setPickedDate={setPickedDate}
          saving={savingDate}
          onCancel={() => {
            console.log('[TrackerDetail] Edit date modal cancelled');
            setShowDateModal(false);
          }}
          onSave={handleSaveDate}
        />
      </Modal>
    </>
  );
}

// ─── WeightEditModal ──────────────────────────────────────────────────────────
function WeightEditModal({
  isDark,
  editValue,
  setEditValue,
  saving,
  onCancel,
  onSave,
}: {
  isDark: boolean;
  editValue: string;
  setEditValue: (v: string) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#2A2C40' : '#F1F3F8';

  return (
    <View style={styles.modalBackdrop}>
      <View style={[styles.modalCard, { backgroundColor: cardBg }]}>
        <Text style={[styles.modalTitle, { color: textColor }]}>Edit weight</Text>
        <TextInput
          style={[styles.modalInput, { backgroundColor: inputBg, color: textColor }]}
          value={editValue}
          onChangeText={setEditValue}
          keyboardType="decimal-pad"
          placeholder="Weight in lbs"
          placeholderTextColor={subColor}
          autoFocus
          selectTextOnFocus
        />
        <View style={styles.modalBtnRow}>
          <Pressable
            onPress={onCancel}
            style={[styles.modalBtn, { backgroundColor: isDark ? '#2A2C40' : '#F1F3F8' }]}
          >
            <Text style={[styles.modalBtnText, { color: subColor }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── WeightDateModal ──────────────────────────────────────────────────────────
function WeightDateModal({
  isDark,
  pickedDate,
  setPickedDate,
  saving,
  onCancel,
  onSave,
}: {
  isDark: boolean;
  pickedDate: Date;
  setPickedDate: (d: Date) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  return (
    <View style={styles.modalBackdrop}>
      <View style={[styles.modalCard, { backgroundColor: cardBg }]}>
        <Text style={[styles.modalTitle, { color: textColor }]}>Edit date</Text>
        <DateTimePicker
          value={pickedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={(_event, date) => {
            if (date) {
              console.log('[TrackerDetail] DateTimePicker changed:', toLocalDateString(date));
              setPickedDate(date);
            }
          }}
          style={{ alignSelf: 'center' }}
          textColor={textColor}
        />
        <View style={styles.modalBtnRow}>
          <Pressable
            onPress={onCancel}
            style={[styles.modalBtn, { backgroundColor: isDark ? '#2A2C40' : '#F1F3F8' }]}
          >
            <Text style={[styles.modalBtnText, { color: subColor }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Confirm</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TrackerDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepsRefreshing, setStepsRefreshing] = useState(false);

  const stepsHook = useSteps();

  const loadData = useCallback(async () => {
    if (!id) return;
    console.log('[TrackerDetail] Loading data for tracker:', id);
    try {
      setError(null);
      const [allTrackers, statsData] = await Promise.all([
        listTrackers(),
        getStats(id),
      ]);
      const found = allTrackers.find(t => t.id === id) ?? null;
      setTracker(found);
      setStats(statsData);

      // Backfill check_ins → tracker_entries for the weight tracker before listing entries
      if (found && found.name.toLowerCase() === 'weight') {
        console.log('[TrackerDetail] Weight tracker detected — running check_ins backfill');
        await backfillWeightFromCheckIns(id);
      }

      const entriesData = await listEntries(id, 500);
      setEntries(entriesData);
      console.log('[TrackerDetail] Loaded tracker:', found?.name, 'entries:', entriesData.length);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load tracker';
      console.error('[TrackerDetail] Error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  // Lightweight reload (no skeleton flash) used by WeightEntryActions after edits
  const reloadEntries = useCallback(async () => {
    if (!id || !tracker) return;
    console.log('[TrackerDetail] reloadEntries — tracker:', id);
    try {
      const [newStats, newEntries] = await Promise.all([
        getStats(id),
        listEntries(id, 500),
      ]);
      setStats(newStats);
      setEntries(newEntries);
    } catch (e) {
      console.error('[TrackerDetail] reloadEntries error:', e);
    }
  }, [id, tracker]);

  useFocusEffect(
    useCallback(() => {
      console.log('[TrackerDetail] Screen focused');
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    console.log('[TrackerDetail] Pull-to-refresh');
    setRefreshing(true);
    loadData();
  };

  const handleMore = () => {
    console.log('[TrackerDetail] More button tapped');
    if (!tracker || tracker.is_default) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Delete tracker'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          title: tracker.name,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) confirmDelete();
        }
      );
    } else {
      Alert.alert(tracker.name, 'What would you like to do?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete tracker', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const confirmDelete = () => {
    console.log('[TrackerDetail] Confirm delete tracker:', id);
    Alert.alert('Delete tracker?', 'This will permanently delete this tracker and all its entries.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete tracker',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTracker(id!);
            console.log('[TrackerDetail] Tracker deleted, navigating back');
            router.back();
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to delete';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleDeleteEntry = async (entry: TrackerEntry) => {
    const isWeightTracker = tracker?.name.toLowerCase() === 'weight';
    console.log('[TrackerDetail] Delete entry:', entry.id, 'date:', entry.date, 'syncCheckIns:', isWeightTracker);
    try {
      await deleteEntry(id!, entry.id, isWeightTracker ? { syncCheckIns: true, date: entry.date } : undefined);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete entry';
      Alert.alert('Error', msg);
    }
  };

  const handleLogEntry = () => {
    console.log('[TrackerDetail] Log entry button tapped');
    router.push({ pathname: '/tracker/log', params: { trackerId: id } });
  };

  const handleStepsRefresh = async () => {
    console.log('[TrackerDetail] Steps refresh from Health tapped');
    if (stepsRefreshing || !tracker) return;
    setStepsRefreshing(true);
    try {
      await stepsHook.refresh();
      const currentSteps = stepsHook.steps;
      if (currentSteps !== null && currentSteps > 0) {
        const { logEntry } = await import('@/utils/trackersApi');
        const today = toLocalDateString(new Date());
        console.log('[TrackerDetail] Upserting steps entry from Health:', currentSteps);
        await logEntry(tracker.id, today, currentSteps);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Reload entries and stats
        const [newStats, newEntries] = await Promise.all([
          getStats(tracker.id),
          listEntries(tracker.id, 500),
        ]);
        setStats(newStats);
        setEntries(newEntries);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh steps';
      console.error('[TrackerDetail] Steps refresh error:', msg);
    } finally {
      setStepsRefreshing(false);
    }
  };

  const handleGoalSaved = (newGoal: number) => {
    console.log('[TrackerDetail] Goal updated in local state:', newGoal);
    setTracker(prev => prev ? { ...prev, goal_value: newGoal } : prev);
  };

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;

  const isStepsTracker = tracker?.is_default && tracker.name.toLowerCase() === 'steps';
  const isWeightTracker = tracker?.name.toLowerCase() === 'weight';
  const isGymTracker = tracker?.name.toLowerCase() === 'gym';

  const trackerTitle = tracker ? `${tracker.emoji} ${tracker.name}` : '';
  const completionPct = stats ? Math.round(Number(stats.completion_rate)) : 0;
  const avgDisplay = stats && tracker
    ? formatValue(Number(stats.avg_value), tracker.tracker_type, tracker.unit)
    : '—';
  const statusLabel =
    stats?.status === 'on_track' ? 'On Track 🟢' :
    stats?.status === 'improving' ? 'Improving 📈' :
    'Behind 🔴';
  const statusColor =
    stats?.status === 'on_track' ? colors.success :
    stats?.status === 'improving' ? colors.primary :
    colors.warning;

  return (
    <>
      <Stack.Screen
        options={{
          title: trackerTitle,
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            tracker && !tracker.is_default ? (
              <AnimatedPressable onPress={handleMore} style={styles.headerIconBtn} scaleValue={0.9}>
                <MoreHorizontal size={20} color={subColor} strokeWidth={2} />
              </AnimatedPressable>
            ) : null
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
        {loading ? (
          /* Skeleton */
          <>
            <View style={styles.statsGrid}>
              {[0, 1, 2, 3, 4, 5].map(i => <SkeletonStatCard key={i} isDark={isDark} />)}
            </View>
          </>
        ) : error ? (
          <View style={[styles.errorCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.errorTitle, { color: textColor }]}>Couldn't load tracker</Text>
            <Text style={[styles.errorSub, { color: subColor }]}>{error}</Text>
            <AnimatedPressable onPress={() => { setLoading(true); loadData(); }} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <>
            {/* Row 1: Streak + Best Streak */}
            <View style={styles.statsGrid}>
              <StatCard
                label="day streak"
                value={String(stats?.current_streak ?? 0)}
                sub="current"
                icon={<Flame size={20} color="#FF8A5B" strokeWidth={2} />}
                iconColor="#FF8A5B"
                isDark={isDark}
              />
              <StatCard
                label="best ever"
                value={String(stats?.best_streak ?? 0)}
                sub="all time"
                icon={<Trophy size={20} color="#F59E0B" strokeWidth={2} />}
                iconColor="#F59E0B"
                isDark={isDark}
              />
            </View>

            {/* Row 2: Completion + Days Tracked */}
            <View style={styles.statsGrid}>
              <StatCard
                label="of days logged"
                value={`${completionPct}%`}
                icon={<CheckCircle2 size={20} color={colors.success} strokeWidth={2} />}
                iconColor={colors.success}
                isDark={isDark}
              />
              <StatCard
                label="total entries"
                value={String(stats?.days_tracked ?? 0)}
                icon={<Calendar size={20} color={colors.primary} strokeWidth={2} />}
                iconColor={colors.primary}
                isDark={isDark}
              />
            </View>

            {/* Row 3: This Week + Last Week */}
            <View style={styles.statsGrid}>
              <StatCard
                label="this week"
                value={String(stats?.this_week_count ?? 0)}
                icon={<TrendingUp size={20} color="#8B5CF6" strokeWidth={2} />}
                iconColor="#8B5CF6"
                isDark={isDark}
              />
              <StatCard
                label="last week"
                value={String(stats?.last_week_count ?? 0)}
                icon={<BarChart3 size={20} color="#6B7280" strokeWidth={2} />}
                iconColor="#6B7280"
                isDark={isDark}
              />
            </View>

            {/* Row 4: Status card */}
            <View style={[styles.statusCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.statusCardRow}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                  <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
                {tracker?.goal_value && stats ? (
                  <Text style={[styles.statusMeta, { color: subColor }]}>
                    {stats.days_goal_met} / {stats.days_tracked} days hit goal
                  </Text>
                ) : null}
              </View>
              {tracker && tracker.tracker_type !== 'binary' && stats && Number(stats.avg_value) > 0 ? (
                <View style={styles.avgRow}>
                  <Target size={14} color={subColor} strokeWidth={2} />
                  <Text style={[styles.avgText, { color: subColor }]}>
                    Avg: {avgDisplay}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Daily Goal section — steps tracker only */}
            {isStepsTracker && tracker ? (
              <DailyGoalSection
                trackerId={tracker.id}
                currentGoal={tracker.goal_value}
                isDark={isDark}
                onGoalSaved={handleGoalSaved}
              />
            ) : null}

            {/* Row 5: Recent Entries */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Recent Entries</Text>
              {isStepsTracker ? (
                /* Steps: Refresh from Health instead of manual log */
                <AnimatedPressable
                  onPress={handleStepsRefresh}
                  style={[styles.logEntryBtn, { backgroundColor: colors.primary, opacity: stepsRefreshing ? 0.6 : 1 }]}
                  scaleValue={0.94}
                  disabled={stepsRefreshing}
                >
                  {stepsRefreshing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <RotateCw size={14} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.logEntryBtnText}>Refresh</Text>
                    </>
                  )}
                </AnimatedPressable>
              ) : isWeightTracker ? (
                /* Weight: no button — user logs from check-ins tab */
                null
              ) : isGymTracker ? (
                /* Gym: no button — user logs from check-ins tab */
                null
              ) : (
                <AnimatedPressable onPress={handleLogEntry} style={[styles.logEntryBtn, { backgroundColor: colors.primary }]} scaleValue={0.94}>
                  <Plus size={14} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.logEntryBtnText}>Log entry</Text>
                </AnimatedPressable>
              )}
            </View>

            {entries.length === 0 ? (
              <View style={[styles.emptyEntries, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.emptyEntriesTitle, { color: textColor }]}>No entries yet</Text>
                <Text style={[styles.emptyEntriesSub, { color: subColor }]}>
                  {isStepsTracker
                    ? 'Tap Refresh to sync your steps from Apple Health'
                    : isWeightTracker
                    ? 'Log your weight from the Check-ins tab'
                    : isGymTracker
                    ? 'Log your gym sessions from the Check-ins tab'
                    : 'Log your first entry to start tracking progress'}
                </Text>
              </View>
            ) : (
              <View style={[styles.entriesList, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                {entries.map((entry, index) => {
                  const valueDisplay = tracker
                    ? formatValue(Number(entry.value), tracker.tracker_type, tracker.unit)
                    : String(entry.value);
                  const dateDisplay = formatDate(entry.date);
                  const isLast = index === entries.length - 1;
                  return (
                    <SwipeToDeleteRow key={entry.id} onDelete={() => handleDeleteEntry(entry)}>
                      <View style={[styles.entryRow, !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.entryDate, { color: textColor }]}>{dateDisplay}</Text>
                          {entry.notes ? (
                            <Text style={[styles.entryNotes, { color: subColor }]} numberOfLines={1}>
                              {entry.notes}
                            </Text>
                          ) : null}
                        </View>
                        {isWeightTracker && tracker ? (
                          <WeightEntryActions
                            entry={entry}
                            trackerId={tracker.id}
                            isDark={isDark}
                            onReload={reloadEntries}
                          />
                        ) : isGymTracker && tracker ? (
                          <GymEntryActions
                            entry={entry}
                            trackerId={tracker.id}
                            isDark={isDark}
                            onReload={reloadEntries}
                          />
                        ) : null}
                        <Text style={[styles.entryValue, { color: colors.primary }]}>{valueDisplay}</Text>
                        <View style={[styles.deleteHint, { backgroundColor: colors.error + '18' }]}>
                          <Trash2 size={12} color={colors.error} strokeWidth={2} />
                        </View>
                      </View>
                    </SwipeToDeleteRow>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
    paddingTop: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    alignItems: 'center',
    boxShadow: '0px 1px 3px rgba(0,0,0,0.04), 0px 4px 12px rgba(0,0,0,0.03)',
    elevation: 2,
  },
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  statSub: {
    fontSize: 11,
    marginTop: 1,
    textAlign: 'center',
  },
  statusCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0,0,0,0.04), 0px 4px 12px rgba(0,0,0,0.03)',
    elevation: 2,
  },
  statusCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusMeta: {
    fontSize: 13,
    fontWeight: '500',
  },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  avgText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Daily Goal card
  goalCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
    boxShadow: '0px 1px 3px rgba(0,0,0,0.04), 0px 4px 12px rgba(0,0,0,0.03)',
    elevation: 2,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  goalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  editGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary + '18',
  },
  editGoalBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cancelGoalText: {
    fontSize: 13,
    fontWeight: '500',
  },
  goalValueText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  goalEditArea: {
    gap: 10,
    marginTop: 4,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  customInput: {
    flex: 1,
    height: 38,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  customSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: borderRadius.sm,
    minWidth: 60,
    alignItems: 'center',
  },
  customSaveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  logEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.sm,
    minWidth: 80,
    justifyContent: 'center',
  },
  logEntryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  entriesList: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    boxShadow: '0px 1px 3px rgba(0,0,0,0.04), 0px 4px 12px rgba(0,0,0,0.03)',
    elevation: 2,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  entryDate: {
    fontSize: 15,
    fontWeight: '500',
  },
  entryNotes: {
    fontSize: 12,
    marginTop: 2,
  },
  entryValue: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  deleteHint: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEntries: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyEntriesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyEntriesSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  // Weight entry action buttons
  weightActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weightActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    boxShadow: '0px 8px 24px rgba(0,0,0,0.2)',
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalInput: {
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
