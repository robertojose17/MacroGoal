
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSteps } from '@/hooks/useSteps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import CalendarDatePicker from '@/components/CalendarDatePicker';
import { listTrackers, logEntry as logTrackerEntry } from '@/utils/trackersApi';
import { toLocalDateString } from '@/utils/dateUtils';
import * as ImagePicker from 'expo-image-picker';
import { tryAwardWorkout, tryAwardWeightCheckin, tryAwardProgressPhoto } from '@/utils/xpAwarder';

type CheckInType = 'weight' | 'steps' | 'gym';

export default function CheckInFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const checkInType = (params.type as CheckInType) || 'weight';
  const checkInId = params.checkInId as string | undefined;
  const isEditing = !!checkInId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Form fields
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Weight fields
  const [weight, setWeight] = useState('');
  
  // Steps fields
  const [steps, setSteps] = useState('');
  const [stepsGoal, setStepsGoal] = useState('');
  const { steps: liveSteps, permission: stepsPermission, loading: stepsLoading, refresh: refreshSteps, requestPermission: requestStepsPermission } = useSteps();
  
  // Gym fields
  const [wentToGym, setWentToGym] = useState(true);
  
  // Common
  const [notes, setNotes] = useState('');

  // Photo
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const loadCheckInData = useCallback(async (userWithPrefs: any) => {
    if (!checkInId) return;
    
    try {
      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .eq('id', checkInId)
        .single();

      if (error) {
        console.error('[CheckInForm] Error loading check-in:', error);
        Alert.alert('Error', 'Failed to load check-in data');
        router.back();
        return;
      }

      console.log('[CheckInForm] 📥 Loaded check-in data:', data);

      // Parse date correctly from database (stored as YYYY-MM-DD)
      const [year, month, day] = data.date.split('-').map(Number);
      const localDate = new Date(year, month - 1, day, 12, 0, 0);
      console.log('[CheckInForm] 📅 Parsed date:', data.date, '→', localDate.toLocaleDateString());
      setDate(localDate);
      
      // Weight is ALWAYS stored in kg in the database
      // Convert to lbs for display
      if (data.weight) {
        const weightInKg = parseFloat(data.weight);
        console.log('[CheckInForm] ⚖️ Weight from DB (always kg):', weightInKg);
        const lbs = weightInKg * 2.20462;
        console.log('[CheckInForm] ⚖️ Converting kg → lbs for display:', weightInKg, 'kg →', lbs, 'lbs');
        setWeight(Math.round(lbs).toString());
      }
      
      setSteps(data.steps?.toString() || '');
      setStepsGoal(data.steps_goal?.toString() || '');
      setWentToGym(data.went_to_gym || false);
      setNotes(data.notes || '');
    } catch (error) {
      console.error('[CheckInForm] Error in loadCheckInData:', error);
    }
  }, [checkInId, router]);

  const loadDefaultStepsGoal = useCallback(async (userId: string) => {
    try {
      // Try to get the most recent steps goal
      const { data } = await supabase
        .from('check_ins')
        .select('steps_goal')
        .eq('user_id', userId)
        .not('steps_goal', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.steps_goal) {
        setStepsGoal(data.steps_goal.toString());
      } else {
        // Default to 10,000 steps
        setStepsGoal('10000');
      }
    } catch (error) {
      console.error('[CheckInForm] Error loading default steps goal:', error);
    }
  }, []);

  const initializeForm = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load user data first
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('preferred_units')
        .eq('id', authUser.id)
        .maybeSingle();

      const userWithPrefs = { ...authUser, ...userData };
      setUser(userWithPrefs);

      console.log('[CheckInForm] 👤 User loaded with preferred_units:', userData?.preferred_units);

      // Then load check-in data if editing
      if (isEditing) {
        await loadCheckInData(userWithPrefs);
      } else if (checkInType === 'steps') {
        await loadDefaultStepsGoal(authUser.id);
      }
    } catch (error) {
      console.error('[CheckInForm] Error in initializeForm:', error);
    } finally {
      setLoading(false);
    }
  }, [isEditing, checkInType, loadCheckInData, loadDefaultStepsGoal]);

  useEffect(() => {
    initializeForm();
  }, [initializeForm]);

  // Auto-fill steps from HealthKit when in steps check-in mode (not editing)
  useEffect(() => {
    if (checkInType === 'steps' && !isEditing && liveSteps !== null) {
      console.log('[CheckInForm] Auto-filling steps from HealthKit:', liveSteps);
      setSteps(liveSteps.toString());
    }
  }, [liveSteps, checkInType, isEditing]);

  // When entering steps check-in, automatically request permission once.
  const hasRequestedRef = useRef(false);
  useEffect(() => {
    if (checkInType !== 'steps') return;
    if (stepsPermission !== 'not_determined') return;
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    console.log('[CheckInForm] auto-requesting HealthKit steps permission');
    requestStepsPermission();
  }, [checkInType, stepsPermission, requestStepsPermission]);

  // Sync a check-in entry to tracker_entries so the tracker detail "Recent Entries" stays in sync
  const syncToTrackerEntries = async (
    _userId: string,
    type: CheckInType,
    dateString: string,
    checkInData: any,
    entryNotes: string,
  ) => {
    try {
      console.log('[CheckInForm] Syncing to tracker_entries — type:', type, 'date:', dateString);
      const trackers = await listTrackers();
      const tracker = trackers.find(t => t.name.toLowerCase() === type);
      if (!tracker) {
        console.warn('[CheckInForm] No matching tracker found for type:', type);
        return;
      }

      let trackerValue: number | null = null;
      if (type === 'weight') {
        // check_ins always stores weight in kg; tracker unit is always 'lb'
        const weightInKg = checkInData.weight as number;
        trackerValue = Math.round(weightInKg * 2.20462 * 10) / 10; // always lbs
      } else if (type === 'steps') {
        trackerValue = checkInData.steps ?? null;
      } else if (type === 'gym') {
        trackerValue = checkInData.went_to_gym ? 1 : 0;
      }

      if (trackerValue === null) {
        console.warn('[CheckInForm] No value to sync for type:', type);
        return;
      }

      await logTrackerEntry(tracker.id, dateString, trackerValue, entryNotes || undefined);
      console.log('[CheckInForm] ✅ Synced to tracker_entries — tracker:', tracker.name, 'value:', trackerValue);
    } catch (e) {
      // Non-fatal: log but don't block the check-in save
      console.error('[CheckInForm] Failed to sync to tracker_entries:', e);
    }
  };

  const handleSave = async () => {
    console.log('[CheckInForm] Save button pressed — type:', checkInType, 'isEditing:', isEditing);
    try {
      setSaving(true);

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      // Validate based on check-in type
      if (checkInType === 'weight' && !weight) {
        Alert.alert('Missing Weight', 'Please enter your weight');
        setSaving(false);
        return;
      }
      if (checkInType === 'steps' && liveSteps === null) {
        Alert.alert(
          'Steps Not Available',
          'Could not read your steps from Apple Health. Make sure Health permissions are enabled and try again.'
        );
        setSaving(false);
        return;
      }

      // Convert date to YYYY-MM-DD format in LOCAL timezone
      const dateString = toLocalDateString(date);
      console.log('[CheckInForm] 📅 Saving date:', dateString, '(from', date.toLocaleDateString(), ')');

      // Build check-in data based on type
      const checkInData: any = {
        user_id: authUser.id,
        date: dateString,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      };

      if (checkInType === 'weight') {
        // Always convert lbs input to kg for storage
        const weightValue = parseFloat(weight);
        const weightInKg = weightValue / 2.20462;
        console.log('[CheckInForm] ⚖️ Converting weight for storage:', weightValue, 'lbs →', weightInKg, 'kg');
        checkInData.weight = weightInKg;
      } else if (checkInType === 'steps') {
        checkInData.steps = liveSteps; // already a number from the hook
        checkInData.steps_goal = stepsGoal ? parseInt(stepsGoal, 10) : null;
      } else if (checkInType === 'gym') {
        checkInData.went_to_gym = wentToGym;
      }

      console.log('[CheckInForm] 💾 Saving check-in data:', checkInData);

      let savedCheckInId: string | null = isEditing ? (checkInId ?? null) : null;

      if (isEditing) {
        // Update existing check-in
        const { error } = await supabase
          .from('check_ins')
          .update(checkInData)
          .eq('id', checkInId);

        if (error) {
          console.error('[CheckInForm] Error updating check-in:', error);
          Alert.alert('Error', 'Failed to update check-in');
          return;
        }

        console.log('[CheckInForm] ✅ Check-in updated successfully');
        await syncToTrackerEntries(authUser.id, checkInType, dateString, checkInData, notes);
      } else {
        // Create new check-in
        const { data: insertedData, error } = await supabase
          .from('check_ins')
          .insert(checkInData)
          .select('id')
          .single();

        if (error) {
          console.error('[CheckInForm] Error creating check-in:', error);
          Alert.alert('Error', 'Failed to create check-in');
          return;
        }

        savedCheckInId = insertedData?.id ?? null;
        console.log('[CheckInForm] ✅ Check-in created successfully, id:', savedCheckInId);
        await syncToTrackerEntries(authUser.id, checkInType, dateString, checkInData, notes);
      }

      // ── XP: award check-in XP (fire-and-forget) ──────────────────────────
      if (savedCheckInId) {
        if (checkInType === 'gym' && checkInData.went_to_gym === true) {
          console.log('[CheckInForm] awarding workout XP for check-in:', savedCheckInId);
          tryAwardWorkout(savedCheckInId);
        }
        if (checkInType === 'weight' && checkInData.weight != null) {
          console.log('[CheckInForm] awarding weight_checkin XP for check-in:', savedCheckInId);
          tryAwardWeightCheckin(savedCheckInId, checkInData.weight as number);
        }
      }

      // Upload photo non-blocking (only for weight check-ins with a selected photo)
      if (selectedPhotoUri && savedCheckInId && checkInType === 'weight') {
        setUploadingPhoto(true);
        console.log('[CheckInForm] Uploading progress photo for check-in:', savedCheckInId);
        uploadPhoto(savedCheckInId, selectedPhotoUri)
          .then(() => {
            console.log('[CheckInForm] ✅ Photo uploaded successfully');
            // ── XP: award progress_photo (fire-and-forget) ──────────────
            console.log('[CheckInForm] awarding progress_photo XP for check-in:', savedCheckInId);
            tryAwardProgressPhoto(savedCheckInId!);
          })
          .catch((err) => {
            console.error('[CheckInForm] Photo upload failed (non-blocking):', err);
            Alert.alert('Photo Upload Failed', 'Your check-in was saved, but the photo could not be uploaded. You can try again later.');
          })
          .finally(() => {
            setUploadingPhoto(false);
          });
      }

      Alert.alert(
        'Success',
        isEditing ? 'Check-in updated successfully' : 'Check-in saved successfully',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (error) {
      console.error('[CheckInForm] Error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handlePickPhoto = async (source: 'library' | 'camera') => {
    console.log('[CheckInForm] Photo picker opened — source:', source);
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
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library access is needed to select a photo.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        console.log('[CheckInForm] Photo selected:', uri);
        setSelectedPhotoUri(uri);
      }
    } catch (err) {
      console.error('[CheckInForm] Error picking photo:', err);
      Alert.alert('Error', 'Failed to select photo');
    }
  };

  const handleAddPhotoPress = () => {
    console.log('[CheckInForm] Add photo button pressed');
    Alert.alert('Add Progress Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => handlePickPhoto('camera') },
      { text: 'Photo Library', onPress: () => handlePickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (checkInId: string, imageUri: string): Promise<void> => {
    console.log('[CheckInForm] Starting photo upload for check-in:', checkInId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No session available for photo upload');
    }

    const baseUrl = `${SUPABASE_PROJECT_URL}/functions/v1/check-in-photos`;

    // Step 1: Get signed upload URL
    console.log('[CheckInForm] Requesting upload URL from edge function');
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
    console.log('[CheckInForm] Got upload URL, storage_path:', storage_path);

    // Step 2: Upload image binary
    console.log('[CheckInForm] Uploading image binary to storage');
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
    console.log('[CheckInForm] Image uploaded successfully');

    // Step 3: Save photo record
    console.log('[CheckInForm] Saving photo record to database');
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
    console.log('[CheckInForm] Photo record saved successfully');
  };

  const getWeightUnit = () => 'lbs';

  const handleDateSelect = (selectedDate: Date) => {
    console.log('[CheckInForm] 📅 Date selected from calendar:', selectedDate.toLocaleDateString());
    setDate(selectedDate);
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
          {isEditing ? 'Edit' : 'New'} {checkInType === 'weight' ? 'Weight' : checkInType === 'steps' ? 'Steps' : 'Gym'} Check-In
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Date - Using Calendar Date Picker */}
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Date</Text>
          <TouchableOpacity
            style={[
              styles.dateButton,
              {
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                borderColor: isDark ? colors.borderDark : colors.border,
              },
            ]}
            onPress={() => {
              console.log('[CheckInForm] Date picker opened');
              setShowDatePicker(true);
            }}
          >
            <IconSymbol
              ios_icon_name="calendar"
              android_material_icon_name="calendar_today"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.dateText, { color: isDark ? colors.textDark : colors.text }]}>
              {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Weight Fields */}
        {checkInType === 'weight' && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Weight ({getWeightUnit()})
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  borderColor: isDark ? colors.borderDark : colors.border,
                  color: isDark ? colors.textDark : colors.text,
                },
              ]}
              placeholder={`Enter weight in ${getWeightUnit()}`}
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
          </View>
        )}

        {/* Steps Fields */}
        {checkInType === 'steps' && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Steps Today</Text>
            <View
              style={[
                styles.stepsDisplayCard,
                {
                  backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  borderColor: isDark ? colors.borderDark : colors.border,
                },
              ]}
            >
              <View style={styles.stepsIconCircle}>
                <IconSymbol
                  ios_icon_name="figure.walk"
                  android_material_icon_name="directions_walk"
                  size={26}
                  color={colors.primary}
                />
              </View>
              <View style={styles.stepsTextColumn}>
                {stepsLoading && liveSteps === null ? (
                  <Text style={[styles.stepsValue, { color: isDark ? colors.textDark : colors.text }]}>
                    Loading…
                  </Text>
                ) : liveSteps !== null ? (
                  <>
                    <Text style={[styles.stepsValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {liveSteps.toLocaleString()}
                    </Text>
                    <Text style={[styles.stepsSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {Platform.OS === 'ios' ? 'From Apple Health · auto-updates' : 'From Health Connect · auto-updates'}
                    </Text>
                  </>
                ) : stepsPermission === 'denied' ? (
                  <>
                    <Text style={[styles.stepsValue, { color: isDark ? colors.textDark : colors.text }]}>
                      Health access denied
                    </Text>
                    <Text style={[styles.stepsSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Open Settings → Privacy → Health → Macro Goal to allow steps.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.stepsValue, { color: isDark ? colors.textDark : colors.text }]}>
                      Connect Apple Health
                    </Text>
                    <Text style={[styles.stepsSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Tap below to share your daily step count
                    </Text>
                    <TouchableOpacity
                      onPress={async () => {
                        console.log('[CheckInForm] Tapped connect health');
                        await requestStepsPermission();
                      }}
                      style={[styles.connectHealthButton, { backgroundColor: colors.primary }]}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.connectHealthButtonText}>Connect</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              <TouchableOpacity
                style={styles.stepsRefreshButton}
                onPress={() => {
                  console.log('[CheckInForm] Manual steps refresh tapped');
                  refreshSteps();
                }}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="arrow.clockwise"
                  android_material_icon_name="refresh"
                  size={18}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.md }]}>
              Steps Goal
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  borderColor: isDark ? colors.borderDark : colors.border,
                  color: isDark ? colors.textDark : colors.text,
                },
              ]}
              placeholder="Enter steps goal"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              value={stepsGoal}
              onChangeText={setStepsGoal}
              keyboardType="number-pad"
            />
          </View>
        )}

        {/* Gym Fields */}
        {checkInType === 'gym' && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => {
                console.log('[CheckInForm] Gym toggle pressed — new value:', !wentToGym);
                setWentToGym(!wentToGym);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.toggleLeft}>
                <IconSymbol
                  ios_icon_name="dumbbell.fill"
                  android_material_icon_name="fitness_center"
                  size={24}
                  color={wentToGym ? colors.success : (isDark ? colors.textSecondaryDark : colors.textSecondary)}
                />
                <Text style={[styles.toggleLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Went to gym today?
                </Text>
              </View>
              <View
                style={[
                  styles.toggle,
                  {
                    backgroundColor: wentToGym ? colors.success : (isDark ? colors.borderDark : colors.border),
                  },
                ]}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    {
                      transform: [{ translateX: wentToGym ? 20 : 0 }],
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Notes */}
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Notes (Optional)</Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                borderColor: isDark ? colors.borderDark : colors.border,
                color: isDark ? colors.textDark : colors.text,
              },
            ]}
            placeholder="Add any notes..."
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Progress Photo (weight check-ins only) */}
        {checkInType === 'weight' && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Progress Photo (Optional)
            </Text>

            {selectedPhotoUri ? (
              <View style={styles.photoPreviewContainer}>
                <Image
                  source={{ uri: selectedPhotoUri }}
                  style={styles.photoPreview}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={[
                    styles.removePhotoButton,
                    { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border },
                  ]}
                  onPress={() => {
                    console.log('[CheckInForm] Remove photo pressed');
                    setSelectedPhotoUri(null);
                  }}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name="xmark"
                    android_material_icon_name="close"
                    size={16}
                    color={isDark ? colors.textDark : colors.text}
                  />
                  <Text style={[styles.removePhotoText, { color: isDark ? colors.textDark : colors.text }]}>
                    Remove
                  </Text>
                </TouchableOpacity>
                {uploadingPhoto && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.uploadingText}>Uploading...</Text>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.addPhotoButton,
                  {
                    borderColor: isDark ? colors.borderDark : colors.border,
                    backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  },
                ]}
                onPress={handleAddPhotoPress}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="camera"
                  android_material_icon_name="photo_camera"
                  size={24}
                  color={colors.primary}
                />
                <Text style={[styles.addPhotoText, { color: colors.primary }]}>
                  Add Progress Photo (Optional)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditing ? 'Update Check-In' : 'Save Check-In'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Calendar Date Picker Modal */}
      <CalendarDatePicker
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onSelectDate={handleDateSelect}
        initialDate={date}
        maxDate={new Date()}
        title="Select Date"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dateText: {
    ...typography.body,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    ...typography.body,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    minHeight: 100,
  },
  saveButton: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
    elevation: 3,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 40,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  addPhotoText: {
    fontSize: 15,
    fontWeight: '600',
  },
  photoPreviewContainer: {
    position: 'relative',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
  },
  removePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  removePhotoText: {
    fontSize: 13,
    fontWeight: '500',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
  },
  uploadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  stepsDisplayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  stepsIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsTextColumn: {
    flex: 1,
    gap: 2,
  },
  stepsValue: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  stepsSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  stepsRefreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '15',
  },
  connectHealthButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
  },
  connectHealthButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
