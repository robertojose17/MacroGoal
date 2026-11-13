import { PremiumCheckpointScrollView } from '@/components/PremiumCheckpointViewport';
import { PremiumCheckpointInline } from '@/components/PremiumCheckpointInline';
import { premiumEntry } from '@/utils/premiumCheckpoints';
import { BlockedAccountsSettingsEntry } from '@/features/blockedAccounts/BlockedAccountsSettingsEntry';
import { getAppLocale, translatePreference } from '@/lib/localization';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert, RefreshControl, ActivityIndicator, Modal, TextInput, Linking, LayoutAnimation, Switch, Image, ImageSourcePropType } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { useAcceptedGoalEditor, AcceptedGoalReadSuperseded, type GoalEditorSnapshot } from '@/hooks/useAcceptedGoalEditor';
import { useDynamicTdeeProgram } from '@/hooks/useDynamicTdeeProgram';
import { clearOnboardingSession } from '@/utils/onboardingAnalytics';
import { usePremium } from '@/hooks/usePremium';
import { cmToFeetInches, kgToLbs, getLossRateDisplayText, feetInchesToCm, lbsToKg, calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacrosWithPreset } from '@/utils/calculations';
import { captureJourneyDateBounds, type JourneyDateBounds } from '@/utils/journeyDateBounds';
import { toLocalDateString } from '@/utils/dateUtils';
import { Sex, ActivityLevel, GoalType } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import i18n, { supportedLanguages, setStoredLanguage } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const PROTEIN_OPTIONS = ['Chicken', 'Turkey', 'Beef', 'Pork', 'Salmon', 'Tuna', 'Shrimp', 'Cod', 'Tilapia', 'Eggs', 'Greek Yogurt', 'Cottage Cheese', 'Whey Protein', 'Tofu', 'Tempeh', 'Edamame', 'Lentils', 'Chickpeas', 'Black Beans'];

const RECIPE_STYLE_OPTIONS = [
  { label: 'Air Fryer', value: 'air-fryer' },
  { label: 'Meal Prep', value: 'meal-prep' },
  { label: 'Under 30 Minutes', value: 'under-30-minutes' },
  { label: 'One Pan Meals', value: 'one-pan-meals' },
  { label: 'Slow Cooker', value: 'slow-cooker' },
  { label: 'Instant Pot', value: 'instant-pot' },
  { label: 'Easy Recipes', value: 'easy-recipes' },
  { label: 'Freezer Friendly', value: 'freezer-friendly' },
];

type EditField = 'name' | 'height' | 'weight' | 'goalWeight' | 'age' | 'sex' | 'activity' | 'lossRate' | 'startDate' | null;
type AccordionSection = 'profile' | 'goal' | null;

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t, i18n: i18nInstance } = useTranslation();

  const { isPremium, loading: premiumLoading, refreshPremiumStatus } = usePremium();

  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [goal, setGoal] = useState<any>(null);
  const editor = useAcceptedGoalEditor(false);
  const { refresh: refreshAcceptedEditor, capture: captureAcceptedEditor } = editor;
  const observation = useDynamicTdeeProgram(editor.snapshot?.profile.id);
  const modalSnapshot = useRef<GoalEditorSnapshot | null>(null), restartSnapshot = useRef<GoalEditorSnapshot | null>(null);
  const restartBounds = useRef<JourneyDateBounds | null>(null);
  const restartTimezone = useRef<string | null>(null);
  const modalCurrent = useRef<() => boolean>(() => false), restartCurrent = useRef<() => boolean>(() => false);
  const screenActive = useRef(false), loadEpoch = useRef(0);
  useFocusEffect(useCallback(() => {
    screenActive.current = true; loadEpoch.current += 1;
    return () => { screenActive.current = false; loadEpoch.current += 1; modalCurrent.current = () => false; restartCurrent.current = () => false; };
  }, []));
  useEffect(() => { if (editor.snapshot) { setUser(editor.snapshot.profile); setGoal(editor.snapshot.goal); } else { setUser(null); setGoal(null); setIsAdmin(false); } }, [editor.snapshot]);


  // Avatar upload state
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Accordion state — collapsed by default
  const [openSection, setOpenSection] = useState<AccordionSection>(null);

  // Edit modal state
  const [editingField, setEditingField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState('');
  const [editValue2, setEditValue2] = useState(''); // For feet/inches
  const [saving, setSaving] = useState(false);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Goal weight prompt state
  const [showGoalWeightPrompt, setShowGoalWeightPrompt] = useState(false);

  // Adaptive TDEE state
  const [showAdjustmentDayModal, setShowAdjustmentDayModal] = useState(false);

  // Food preferences state
  const [showFoodPrefsModal, setShowFoodPrefsModal] = useState(false);
  const [foodPrefs, setFoodPrefs] = useState<{
    dietary_restrictions: string[];
    protein_preferences: string[];
    recipe_styles: string[];
    disliked_foods: string;
  }>({
    dietary_restrictions: [],
    protein_preferences: [],
    recipe_styles: [],
    disliked_foods: '',
  });
  const [savingFoodPrefs, setSavingFoodPrefs] = useState(false);

  const handleAvatarPress = () => {
    console.log('[Profile iOS] Avatar tapped — showing photo picker options');
    Alert.alert(
      t('localization.settings.profilePhoto'),
      t('localization.settings.choosePhoto'),
      [
        {
          text: t('localization.settings.takePhoto'),
          onPress: () => {
            console.log('[Profile iOS] Take Photo selected');
            pickImage('camera');
          },
        },
        {
          text: t('localization.settings.chooseLibrary'),
          onPress: () => {
            console.log('[Profile iOS] Choose from Library selected');
            pickImage('library');
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  const pickImage = async (source: 'camera' | 'library') => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === 'camera') {
        console.log('[Profile iOS] Requesting camera permissions');
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          console.log('[Profile iOS] Camera permission denied');
          Alert.alert(t('localization.settings.permissionRequired'), t('localization.settings.cameraPermission'));
          return;
        }
        console.log('[Profile iOS] Launching camera');
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        console.log('[Profile iOS] Requesting media library permissions');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          console.log('[Profile iOS] Media library permission denied');
          Alert.alert(t('localization.settings.permissionRequired'), t('localization.settings.photoPermission'));
          return;
        }
        console.log('[Profile iOS] Launching image library');
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (result.canceled) {
        console.log('[Profile iOS] Image picker cancelled');
        return;
      }

      const asset = result.assets[0];
      console.log('[Profile iOS] Image selected — uri:', asset.uri, 'width:', asset.width, 'height:', asset.height);
      await uploadAvatar(asset.uri);
    } catch (error: any) {
      console.error('[Profile iOS] Error picking image:', error);
      Alert.alert(t('common.error'), t('localization.settings.pickImageError'));
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!user) return;
    console.log('[Avatar iOS] Starting upload for user:', user.id);
    setAvatarUploading(true);
    try {
      // Step 1: Read file as base64 (fetch(uri).blob() produces 0 bytes in React Native)
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.log('[Avatar iOS] File size (bytes):', bytes.length);
      if (bytes.length === 0) throw new Error('Image file is empty');

      // Step 2: Upload directly to Supabase Storage
      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      console.log('[Avatar iOS] Upload successful');

      // Step 4: Get the public URL (clean, no cache-buster)
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      console.log('[Avatar iOS] Public URL:', publicUrl);

      // Step 5: Save clean URL to DB
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      // Step 6: Update local state with cache-busted URL so image refreshes immediately
      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;
      setUser((prev: any) => ({ ...prev, avatar_url: cacheBustedUrl }));
      console.log('[Avatar iOS] Done — avatar updated successfully');
    } catch (error: any) {
      console.error('[Avatar iOS] Upload failed:', error);
      Alert.alert(t('localization.settings.uploadFailed'), t('localization.settings.uploadError'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const loadUserData = useCallback(async () => {
    if (!screenActive.current) return;
    const revision = ++loadEpoch.current;
    const active = () => screenActive.current && loadEpoch.current === revision;
    setLoading(true);
    try {
      const verified = await refreshAcceptedEditor();
      const current = captureAcceptedEditor();
      if (!active() || !current()) return;
      setUser(verified.profile); setGoal(verified.goal);
      setIsAdmin(verified.profile.is_admin === true);
    } catch (error) { if (active() && !(error instanceof AcceptedGoalReadSuperseded)) { setUser(null); setGoal(null); setIsAdmin(false); } }
    finally { if (active()) { setLoading(false); setRefreshing(false); } }
  }, [refreshAcceptedEditor, captureAcceptedEditor]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Profile iOS] Screen focused, loading data');
      loadUserData();
      refreshPremiumStatus();
    }, [refreshPremiumStatus, loadUserData])
  );

  // Sync food preferences from user data whenever user changes
  useEffect(() => {
    if (user) {
      setFoodPrefs({
        dietary_restrictions: Array.isArray(user.dietary_restrictions) ? user.dietary_restrictions : [],
        protein_preferences: Array.isArray(user.protein_preferences) ? user.protein_preferences : [],
        recipe_styles: Array.isArray(user.recipe_styles) ? user.recipe_styles : [],
        disliked_foods: typeof user.disliked_foods === 'string' ? user.disliked_foods : '',
      });
    }
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadUserData(), refreshPremiumStatus()]);
  };

  const toggleSection = (section: AccordionSection) => {
    console.log('[Profile iOS] Accordion section toggled:', section);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const saveFoodPrefs = async () => {
    if (!user) return;
    console.log('[Profile iOS] Save Food Preferences button pressed', foodPrefs);
    setSavingFoodPrefs(true);
    try {
      const updateData = {
        dietary_restrictions: foodPrefs.dietary_restrictions,
        protein_preferences: foodPrefs.protein_preferences,
        recipe_styles: foodPrefs.recipe_styles,
        disliked_foods: foodPrefs.disliked_foods.trim(),
        updated_at: new Date().toISOString(),
      };
      console.log('[Profile iOS] Saving food preferences to Supabase:', updateData);
      const { error } = await supabase.from('users').update(updateData).eq('id', user.id);
      if (error) throw error;
      console.log('[Profile iOS] Food preferences saved successfully');
      setShowFoodPrefsModal(false);
      await loadUserData();
    } catch (error: any) {
      console.error('[Profile iOS] Error saving food preferences:', error);
      Alert.alert(t('common.error'), t('profile.failedToSavePreferences'));
    } finally {
      setSavingFoodPrefs(false);
    }
  };

  const toggleDietaryRestriction = (item: string) => {
    console.log('[Profile iOS] Dietary restriction toggled:', item);
    setFoodPrefs((prev) => {
      const exists = prev.dietary_restrictions.includes(item);
      return {
        ...prev,
        dietary_restrictions: exists
          ? prev.dietary_restrictions.filter((r) => r !== item)
          : [...prev.dietary_restrictions, item],
      };
    });
  };

  const toggleProteinPreference = (item: string) => {
    console.log('[Profile iOS] Protein preference toggled:', item);
    setFoodPrefs((prev) => ({
      ...prev,
      protein_preferences: prev.protein_preferences.includes(item)
        ? prev.protein_preferences.filter((i) => i !== item)
        : [...prev.protein_preferences, item],
    }));
  };

  const toggleRecipeStyle = (item: string) => {
    console.log('[Profile iOS] Recipe style toggled:', item);
    setFoodPrefs((prev) => ({
      ...prev,
      recipe_styles: prev.recipe_styles.includes(item)
        ? prev.recipe_styles.filter((i) => i !== item)
        : [...prev.recipe_styles, item],
    }));
  };

  const handleLogout = async () => {
    console.log('[Profile iOS] Log Out button pressed');
    Alert.alert(
      t('profile.logOut'),
      t('profile.logOutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.logOut'),
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile iOS] Logging out user');
            await clearOnboardingSession();
            await supabase.auth.signOut();
            router.replace('/auth/welcome');
          },
        },
      ]
    );
  };

  const handleEditGoals = () => {
    console.log('[Profile iOS] Advanced goals button pressed');
    if (!user?.onboarding_completed) {
      router.push('/onboarding/complete');
    } else {
      router.push('/edit-goals');
    }
  };

  const calculateAge = (dob: string) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatHeight = (heightCm: number, units: string) => {
    if (units === 'imperial') {
      const { feet, inches } = cmToFeetInches(heightCm);
      return `${feet}' ${inches}"`;
    }
    return `${Math.round(heightCm)} cm`;
  };

  const formatWeight = (weightKg: number, units: string) => {
    if (units === 'imperial') {
      return `${Math.round(kgToLbs(weightKg))} lbs`;
    }
    return `${Math.round(weightKg)} kg`;
  };

  const openEditModal = (field: EditField) => {
    if (field === 'lossRate') { router.push('/edit-goals'); return; }
    if (!editor.snapshot || editor.pending || editor.busy || saving) return;
    modalSnapshot.current = { profile: { ...editor.snapshot.profile }, goal: { ...editor.snapshot.goal } };
    modalCurrent.current = editor.capture();
    const user = modalSnapshot.current.profile;
    const goal = modalSnapshot.current.goal;
    const units = user.preferred_units;
    if (['height', 'weight', 'goalWeight'].includes(field ?? '') && units !== 'metric' && units !== 'imperial') { Alert.alert('Review units', 'Select verified measurement units first.'); return; }

    switch (field) {
      case 'name':
        setEditValue(user.name || '');
        break;
      case 'height':
        if (units === 'imperial') {
          const { feet, inches } = cmToFeetInches(user.height ?? NaN);
          setEditValue(feet.toString());
          setEditValue2(inches.toString());
        } else {
          setEditValue((user.height ?? NaN).toString());
        }
        break;
      case 'weight':
        if (units === 'imperial') {
          setEditValue(Math.round(kgToLbs(user.current_weight ?? NaN)).toString());
        } else {
          setEditValue((user.current_weight ?? NaN).toString());
        }
        break;
      case 'goalWeight':
        if (units === 'imperial') {
          setEditValue(user.goal_weight ? Math.round(kgToLbs(user.goal_weight)).toString() : '');
        } else {
          setEditValue(user.goal_weight ? user.goal_weight.toString() : '');
        }
        break;
      case 'age':
        const age = user.date_of_birth ? calculateAge(user.date_of_birth) : null;
        setEditValue(age ? age.toString() : '');
        break;

    }

    setEditingField(field);
  };

  const recalculateGoals = (_profile: unknown, _goal: unknown) => { Alert.alert('Review accepted targets', 'Changes require a new review and confirmation in Edit Goals.', [{ text: 'Open Edit Goals', onPress: () => router.push('/edit-goals') }, { text: 'Cancel', style: 'cancel' }]); };
  // The modal owns its original profile/goal CAS and units until dismissed.
  const closeEditModal = () => { modalCurrent.current = () => false; setEditingField(null); setEditValue(''); setEditValue2(''); };
  const saveProfilePatch = async (patch: Database['public']['Tables']['users']['Update'], snapshot: GoalEditorSnapshot, current: () => boolean) => {
    if (!current() || editor.busy || editor.pending) throw new Error('Resolve the pending goal request first.');
    const auth = await supabase.auth.getUser();
    if (auth.error || auth.data.user?.id !== snapshot.profile.id || !current()) throw new Error('Account changed');
    let query = supabase.from('users').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', snapshot.profile.id);
    query = snapshot.profile.updated_at === null ? query.is('updated_at', null) : query.eq('updated_at', snapshot.profile.updated_at);
    const result = await query.select('*').maybeSingle();
    if (result.error || !result.data || !current()) throw new Error('Profile changed or result could not be verified. Reopen and review.');
    const fresh = await editor.refresh();
    if (!current()) throw new Error('Screen changed');
    setUser(fresh.profile); setGoal(fresh.goal);
    Alert.alert('Profile saved', 'Accepted targets were not recalculated. Open Edit Goals to review any target changes.');
  };
  const saveFieldDirectly = async (field: EditField, value: string) => {
    const snapshot = editor.snapshot, current = editor.capture();
    if (!snapshot || saving || editor.busy || editor.pending) return;
    setSaving(true);
    try {
      if (field === 'activity') {
        if (!['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(value)) throw new Error('Invalid activity');
        await editor.run('save', { userId: snapshot.profile.id, expectedProfileUpdatedAt: snapshot.profile.updated_at, expectedGoal: snapshot.goal, operation: 'manual_goal', goal: { daily_calories: snapshot.goal.daily_calories }, profile: { activity_level: value }, isCurrent: current });
        await loadUserData();
      } else if (field === 'sex' && (value === 'male' || value === 'female')) await saveProfilePatch({ sex: value }, snapshot, current);
    } catch (error) { if (current()) Alert.alert('Unable to save', error instanceof Error ? error.message : 'Review your profile'); }
    finally { setSaving(false); }
  };
  const saveEditedField = async () => {
    const snapshot = modalSnapshot.current, current = modalCurrent.current;
    if (!snapshot || !editingField || saving || editor.busy || editor.pending || !current()) return;
    setSaving(true);
    try {
      const units = snapshot.profile.preferred_units;
      const parsed = editValue.trim() === '' ? NaN : Number(editValue);
      const patch: Database['public']['Tables']['users']['Update'] = {};
      if (editingField === 'name') {
        if (!editValue.trim()) throw new Error('Enter a name'); patch.name = editValue.trim();
      } else if (editingField === 'height') {
        const inches = editValue2.trim() === '' ? NaN : Number(editValue2);
        if (!Number.isFinite(parsed) || parsed <= 0 || (units === 'imperial' && (!Number.isInteger(parsed) || !Number.isFinite(inches) || inches < 0 || inches >= 12))) throw new Error('Enter the complete height');
        patch.height = units === 'imperial' ? feetInchesToCm(parsed, inches) : parsed;
      } else if (editingField === 'weight') {
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Enter a valid weight'); patch.current_weight = units === 'imperial' ? lbsToKg(parsed) : parsed;
      } else if (editingField === 'age') {
        throw new Error('Age alone cannot establish an exact date of birth. Review your birth date before saving.');
      } else if (editingField === 'goalWeight' || editingField === 'lossRate') {
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Enter a valid positive value');
        const target = units === 'imperial' ? lbsToKg(parsed) : parsed;
        const rate = units === 'metric' ? parsed / 0.453592 : parsed;
        await editor.run('save', { userId: snapshot.profile.id, expectedProfileUpdatedAt: snapshot.profile.updated_at, expectedGoal: snapshot.goal, operation: 'manual_goal', profile: {}, isCurrent: current,
          goal: editingField === 'goalWeight' ? { target_weight: target } : { loss_rate_lbs_per_week: rate },
        });
        await loadUserData(); setShowGoalWeightPrompt(false); closeEditModal(); return;
      } else throw new Error('Reopen the relevant editor');
      await saveProfilePatch(patch, snapshot, current); closeEditModal();
    } catch (error) { if (current()) Alert.alert('Unable to save', error instanceof Error ? error.message : 'Review your profile'); }
    finally { setSaving(false); }
  };
  const saveStartDate = async (date: Date) => {
    const snapshot = restartSnapshot.current, current = restartCurrent.current;
    if (!snapshot || !current() || saving || editor.pending || editor.busy) return;
    if (restartTimezone.current !== Intl.DateTimeFormat().resolvedOptions().timeZone) { Alert.alert('Review timezone', 'The device timezone changed. Close and reopen the date editor.'); return; }
    const bounds = restartBounds.current;
    if (!bounds || bounds.timezone !== snapshot.profile.timezone) { Alert.alert('Review timezone', 'Close and reopen the date editor with a verified account timezone.'); return; }
    const startDate = toLocalDateString(date), { today, created } = bounds;
    if (!Number.isFinite(date.getTime()) || !created || startDate < created || startDate > today) { Alert.alert('Review date', 'Choose a date between account creation and today.'); return; }
    setSaving(true);
    try {
      const weight = snapshot.profile.journey_start_weight, currentWeight = snapshot.profile.current_weight, activity = snapshot.profile.activity_level;
      if (weight === null || currentWeight === null || activity === null || (startDate === today && weight !== currentWeight)) throw new Error('Review the recorded initial and current weights before restarting. No weight will be invented or replaced.');
      await editor.run('restart', { userId: snapshot.profile.id, expectedProfileUpdatedAt: snapshot.profile.updated_at, expectedGoal: snapshot.goal,
        startDate, startWeightKg: weight, currentWeightKg: currentWeight, activityLevel: activity, isCurrent: current });
      await loadUserData(); setShowDatePicker(false);
      if (current()) Alert.alert('Journey date updated', 'Accepted targets and history are preserved. No check-in was added.');
    } catch (error) { if (current()) Alert.alert('Unable to restart', error instanceof Error ? error.message : 'Review the journey'); }
    finally { setSaving(false); }
  };
  const handleStartDateChange = async (event: { type: string }, date?: Date) => {
    if (event.type === 'dismissed') { restartCurrent.current = () => false; setShowDatePicker(false); return; }
    if (!date) return; setSelectedDate(date);
    if (Platform.OS !== 'ios') { setShowDatePicker(false); await saveStartDate(date); }
  };
  const openStartDatePicker = () => {
    const snapshot = editor.snapshot;
    if (!snapshot || editor.busy || editor.pending || saving) { Alert.alert('Review required', 'Verify the current profile and resolve any pending request first.'); return; }
    try { restartBounds.current = captureJourneyDateBounds(snapshot.profile); }
    catch (error) { Alert.alert('Review account dates', error instanceof Error ? error.message : 'Account timezone unavailable'); return; }
    restartSnapshot.current = { profile: { ...snapshot.profile }, goal: { ...snapshot.goal } };
    restartCurrent.current = editor.capture();
    restartTimezone.current = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!snapshot.goal.start_date) { Alert.alert('Review required', 'No verified journey start date is available.'); return; }
    setSelectedDate(new Date(snapshot.goal.start_date + 'T12:00:00')); setShowDatePicker(true);
  };

  const handleGoalWeightPromptSave = async () => {
    if (!editValue) {
      Alert.alert(t('profile.required'), t('profile.pleaseEnterGoalWeight'));
      return;
    }
    await saveEditedField();
  };

  const handleGoalWeightPromptSkip = () => {
    setShowGoalWeightPrompt(false);
    closeEditModal();
  };

  // Format the journey start date for display
  const formatJourneyStartDate = (dateStr: string | null, fallbackDateStr: string | null) => {
    const effective = dateStr || fallbackDateStr;
    if (!effective) return 'Set Date';
    try {
      const ymd = effective.slice(0, 10);
      const date = new Date(ymd + 'T00:00:00');
      return date.toLocaleDateString(getAppLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (error) {
      console.error('[Profile iOS] Error formatting date:', error);
      return 'Set Date';
    }
  };

  if (loading || premiumLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            {t('profile.loadingProfile')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            {t('profile.noUserData')}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/auth/welcome')}
          >
            <Text style={styles.buttonText}>{t('profile.goToLogin')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const units = user.preferred_units || 'metric';
  const age = user.date_of_birth ? calculateAge(user.date_of_birth) : null;

  const subscriptionStatusText = isPremium ? t('profile.premium') : t('profile.free');
  console.log('[Profile iOS] Displaying subscription status:', subscriptionStatusText, '(isPremium:', isPremium, ')');

  const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free'];

  const proteinCount = foodPrefs.protein_preferences.length;
  const recipeStyleCount = foodPrefs.recipe_styles.length;
  const hasAnyPrefs = proteinCount > 0 || recipeStyleCount > 0;
  const foodPrefsSummaryParts: string[] = [];
  if (hasAnyPrefs) {
    if (proteinCount > 0) foodPrefsSummaryParts.push(`${proteinCount} ${proteinCount !== 1 ? t('profile.proteins_other', { count: proteinCount }).replace(`${proteinCount} `, '') : t('profile.proteins_one', { count: proteinCount }).replace(`${proteinCount} `, '')}`);
    if (recipeStyleCount > 0) foodPrefsSummaryParts.push(`🍳 ${recipeStyleCount} ${recipeStyleCount !== 1 ? t('profile.styles_other', { count: recipeStyleCount }).replace(`${recipeStyleCount} `, '') : t('profile.styles_one', { count: recipeStyleCount }).replace(`${recipeStyleCount} `, '')}`);
  }
  const foodPrefsSummary = foodPrefsSummaryParts.length > 0 ? foodPrefsSummaryParts.join(' · ') : t('profile.noPreferencesSet');

  const sexDisplayValue = user.sex === 'male' ? t('profile.male') : user.sex === 'female' ? t('profile.female') : user.sex ? t('profile.other') : t('profile.tapToSet');
  const activityDisplayValue = user.activity_level === 'sedentary' ? t('profile.sedentary')
    : user.activity_level === 'light' ? t('profile.light')
    : user.activity_level === 'moderate' ? t('profile.moderate')
    : user.activity_level === 'very_active' ? t('profile.veryActive')
    : user.activity_level ? user.activity_level
    : t('profile.tapToSet');
  const unitsDisplayValue = units === 'imperial' ? t('profile.imperial') : t('profile.metric');
  const goalTypeDisplayValue = goal?.goal_type === 'lose' ? t('profile.loseWeight') : goal?.goal_type === 'gain' ? t('profile.gainWeight') : goal?.goal_type === 'maintain' ? t('profile.maintain') : t('profile.tapToSet');
  const journeyStartDisplay = goal ? formatJourneyStartDate(goal.start_date, user.created_at) : t('profile.noGoalSet');

  type MacroPreset = 'balanced' | 'high_protein' | 'low_carb' | 'lean_body' | 'custom';

  const detectMacroPreset = (g: Database['public']['Tables']['goals']['Row'] | null): MacroPreset | null => {
    const preset = g?.macro_preset;
    return preset === 'balanced' || preset === 'high_protein' || preset === 'low_carb' || preset === 'lean_body' || preset === 'custom' ? preset : null;
  };

  const currentMacroPreset = detectMacroPreset(goal);
  const macroPresetDisplayValue = currentMacroPreset === null ? '--' : currentMacroPreset === 'lean_body' ? t('profile.leanBodyFormula')
    : currentMacroPreset === 'balanced' ? t('profile.balanced')
    : currentMacroPreset === 'high_protein' ? t('profile.highProtein')
    : currentMacroPreset === 'low_carb' ? t('profile.lowCarb')
    : t('profile.custom');

  const isProfileOpen = openSection === 'profile';
  const isGoalOpen = openSection === 'goal';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[Settings iOS] Back button pressed');
            router.back();
          }}
          activeOpacity={0.7}
          style={{ padding: spacing.xs, marginRight: spacing.sm }}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={22}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
          {t('profile.title')}
        </Text>
      </View>

      <PremiumCheckpointScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >

        {/* ── Upgrade to Premium ──────────────────────────────────────────── */}
        {!isPremium && !premiumLoading && (
          <PremiumCheckpointInline source="settings_upgrade">{premiumFlow => (<TouchableOpacity
            onPress={() => {
              console.log('[Profile iOS] Upgrade to Premium button pressed');
              router.push(premiumEntry('settings_upgrade', false, premiumFlow));
            }}
            activeOpacity={0.85}
            style={{
              marginHorizontal: spacing.md,
              marginBottom: spacing.md,
              borderRadius: 16,
              backgroundColor: isDark ? '#1E2D35' : '#EBF4F6',
              borderWidth: 1.5,
              borderColor: '#5B9AA8',
              padding: spacing.lg,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={11} color="#5B9AA8" />
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#5B9AA8', textTransform: 'uppercase' }}>
                {t('profile.premium')}
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#F1F5F9' : '#2B2D42', marginBottom: 4 }}>
              {t('profile.unlockPotential')}
            </Text>
            <Text style={{ fontSize: 13, color: isDark ? '#A0A2B8' : '#6B7280', marginBottom: 14, lineHeight: 18 }}>
              {t('profile.premiumDescription')}
            </Text>
            <View style={{
              alignSelf: 'flex-start',
              backgroundColor: '#5B9AA8',
              borderRadius: 10,
              paddingHorizontal: 18,
              paddingVertical: 9,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>
                {t('profile.upgradeNow')}
              </Text>
            </View>
          </TouchableOpacity>)}</PremiumCheckpointInline>
        )}

        {/* ── Accordion Card ──────────────────────────────────────────────── */}
        <View style={[styles.accordionCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>

          {/* ── Section A: My Profile ──────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.accordionHeader}
            onPress={() => toggleSection('profile')}
            activeOpacity={0.7}
          >
            <View style={styles.accordionHeaderLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol ios_icon_name="person" android_material_icon_name="person" size={18} color={isDark ? '#aaa' : '#666'} />
                <Text style={[styles.accordionHeaderTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('profile.myProfile')}
                </Text>
              </View>
            </View>
            <IconSymbol
              ios_icon_name={isProfileOpen ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={isProfileOpen ? 'expand-less' : 'expand-more'}
              size={18}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>

          {isProfileOpen && (
            <View>
              <View style={[styles.accordionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '30' }]} />
              <View style={styles.accordionContent}>
                <EditableSettingItem
                  label={t('profile.email') || 'Email'}
                  value={user.email || ''}
                  onPress={() => {}}
                  isDark={isDark}
                />
                <EditableSettingItem
                  label={t('profile.name')}
                  value={user.name || t('profile.tapToSetName')}
                  onPress={() => openEditModal('name')}
                  isDark={isDark}
                  highlight={!user.name}
                />
                <EditableSettingItem
                  label={t('profile.username')}
                  value={user.username ? `@${user.username}` : t('profile.setUsernameShort')}
                  onPress={() => {
                    console.log('[Profile iOS] Username row tapped');
                    router.push('/choose-username');
                  }}
                  isDark={isDark}
                  highlight={!user.username}
                />
                <EditableSettingItem
                  label={t('profile.age')}
                  value={age ? t('profile.years', { age }) : t('profile.tapToSet')}
                  onPress={() => openEditModal('age')}
                  isDark={isDark}
                  highlight={!age}
                />
                <EditableSettingItem
                  label={t('profile.sex')}
                  value={sexDisplayValue}
                  onPress={() => {
                    console.log('[Profile iOS] Sex field tapped');
                    Alert.alert(
                      t('profile.selectSex'),
                      '',
                      [
                        {
                          text: t('profile.male'),
                          onPress: () => {
                            console.log('[Profile iOS] Sex changed to male');
                            saveFieldDirectly('sex', 'male');
                          },
                        },
                        {
                          text: t('profile.female'),
                          onPress: () => {
                            console.log('[Profile iOS] Sex changed to female');
                            saveFieldDirectly('sex', 'female');
                          },
                        },
                        { text: t('common.cancel'), style: 'cancel' },
                      ]
                    );
                  }}
                  isDark={isDark}
                  highlight={!user.sex}
                />
                <EditableSettingItem
                  label={t('profile.height')}
                  value={user.height ? formatHeight(user.height, units) : t('profile.tapToSet')}
                  onPress={() => openEditModal('height')}
                  isDark={isDark}
                  highlight={!user.height}
                />
                <EditableSettingItem
                  label={t('profile.weight')}
                  value={user.current_weight ? formatWeight(user.current_weight, units) : t('profile.tapToSet')}
                  onPress={() => openEditModal('weight')}
                  isDark={isDark}
                  highlight={!user.current_weight}
                />
                <EditableSettingItem
                  label={t('profile.goalWeight')}
                  value={user.goal_weight ? formatWeight(user.goal_weight, units) : t('profile.tapToSetGoalWeight')}
                  onPress={() => openEditModal('goalWeight')}
                  isDark={isDark}
                  highlight={!user.goal_weight}
                />
                <EditableSettingItem
                  label={t('profile.units')}
                  value={unitsDisplayValue}
                  onPress={() => {
                    console.log('[Profile iOS] Units field tapped');
                    Alert.alert(
                      t('profile.selectUnits'),
                      '',
                      [
                        {
                          text: t('profile.metricLabel'),
                          onPress: async () => {
                            console.log('[Profile iOS] Units changed to metric');
                            try {
                              const { error } = await supabase
                                .from('users')
                                .update({ preferred_units: 'metric', updated_at: new Date().toISOString() })
                                .eq('id', user.id);
                              if (error) throw error;
                              await loadUserData();
                            } catch (err: any) {
                              console.error('[Profile iOS] Error saving units:', err);
                              Alert.alert(t('common.error'), t('profile.failedToSaveUnits'));
                            }
                          },
                        },
                        {
                          text: t('profile.imperialLabel'),
                          onPress: async () => {
                            console.log('[Profile iOS] Units changed to imperial');
                            try {
                              const { error } = await supabase
                                .from('users')
                                .update({ preferred_units: 'imperial', updated_at: new Date().toISOString() })
                                .eq('id', user.id);
                              if (error) throw error;
                              await loadUserData();
                            } catch (err: any) {
                              console.error('[Profile iOS] Error saving units:', err);
                              Alert.alert(t('common.error'), t('profile.failedToSaveUnits'));
                            }
                          },
                        },
                        { text: t('common.cancel'), style: 'cancel' },
                      ]
                    );
                  }}
                  isDark={isDark}
                />
                <EditableSettingItem
                  label={t('profile.activityLevel')}
                  value={activityDisplayValue}
                  onPress={() => {
                    console.log('[Profile iOS] Activity level field tapped');
                    Alert.alert(
                      t('profile.selectActivityLevel'),
                      '',
                      [
                        {
                          text: t('profile.sedentary'),
                          onPress: () => {
                            console.log('[Profile iOS] Activity level changed to sedentary');
                            saveFieldDirectly('activity', 'sedentary');
                          },
                        },
                        {
                          text: t('profile.light'),
                          onPress: () => {
                            console.log('[Profile iOS] Activity level changed to light');
                            saveFieldDirectly('activity', 'light');
                          },
                        },
                        {
                          text: t('profile.moderate'),
                          onPress: () => {
                            console.log('[Profile iOS] Activity level changed to moderate');
                            saveFieldDirectly('activity', 'moderate');
                          },
                        },
                        {
                          text: t('profile.veryActive'),
                          onPress: () => {
                            console.log('[Profile iOS] Activity level changed to very_active');
                            saveFieldDirectly('activity', 'very_active');
                          },
                        },
                        { text: t('common.cancel'), style: 'cancel' },
                      ]
                    );
                  }}
                  isDark={isDark}
                  highlight={!user.activity_level}
                />
              </View>
            </View>
          )}

          {/* Divider between sections */}
          <View style={[styles.sectionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' }]} />

          {/* ── Section B: My Goal ────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.accordionHeader}
            onPress={() => toggleSection('goal')}
            activeOpacity={0.7}
          >
            <View style={styles.accordionHeaderLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol ios_icon_name="target" android_material_icon_name="flag" size={18} color={isDark ? '#aaa' : '#666'} />
                <Text style={[styles.accordionHeaderTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('profile.myGoal')}
                </Text>
              </View>
            </View>
            <IconSymbol
              ios_icon_name={isGoalOpen ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={isGoalOpen ? 'expand-less' : 'expand-more'}
              size={18}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>

          {isGoalOpen && (
            <View>
              <View style={[styles.accordionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '30' }]} />
              <View style={styles.accordionContent}>
                {user.onboarding_completed ? (
                  <>
                    {/* Goal Type */}
                    <EditableSettingItem
                      label={t('profile.goal')}
                      value={goalTypeDisplayValue}
                      onPress={() => {
                        console.log('[Profile iOS] Goal type field tapped');
                        Alert.alert(
                          t('profile.selectGoal'),
                          '',
                          [
                            {
                              text: t('profile.loseWeight'),
                              onPress: () => {
                                console.log('[Profile iOS] Goal type changed to lose');
                                if (goal) {
                                  recalculateGoals(user, { ...goal, goal_type: 'lose', loss_rate_lbs_per_week: goal?.loss_rate_lbs_per_week ?? NaN });
                                }
                              },
                            },
                            {
                              text: t('profile.maintain'),
                              onPress: () => {
                                console.log('[Profile iOS] Goal type changed to maintain');
                                if (goal) {
                                  recalculateGoals(user, { ...goal, goal_type: 'maintain' });
                                }
                              },
                            },
                            {
                              text: t('profile.gainWeight'),
                              onPress: () => {
                                console.log('[Profile iOS] Goal type changed to gain');
                                if (goal) {
                                  recalculateGoals(user, { ...goal, goal_type: 'gain' });
                                }
                              },
                            },
                            { text: t('common.cancel'), style: 'cancel' },
                          ]
                        );
                      }}
                      isDark={isDark}
                      highlight={!goal?.goal_type}
                    />

                    {/* Loss Rate — only if goal_type === 'lose' */}
                    {goal?.goal_type === 'lose' && (
                      <EditableSettingItem
                        label={t('profile.lossRate')}
                        value={goal?.loss_rate_lbs_per_week ? getLossRateDisplayText(goal.loss_rate_lbs_per_week, units) : t('profile.tapToSet')}
                        onPress={() => openEditModal('lossRate')}
                        isDark={isDark}
                      />
                    )}

                    {/* Journey Start */}
                    <EditableSettingItem
                      label={t('profile.journeyStart')}
                      value={journeyStartDisplay}
                      onPress={() => {
                        console.log('[Profile iOS] Journey Start Date row tapped');
                        openStartDatePicker();
                      }}
                      isDark={isDark}
                    />

                    {/* Macro Split */}
                    <EditableSettingItem
                      label={t('profile.macroSplit')}
                      value={macroPresetDisplayValue}
                      onPress={() => {
                        console.log('[Profile iOS] Macro Split row tapped, current preset:', currentMacroPreset);
                        Alert.alert(
                          t('profile.selectMacroSplit'),
                          '',
                          [
                            {
                              text: t('profile.leanBodyFormula'),
                              onPress: () => {
                                console.log('[Profile iOS] Macro preset changed to lean_body');
                                if (goal) recalculateGoals(user, { ...goal, macro_preset: 'lean_body' });
                              },
                            },
                            {
                              text: t('profile.balanced'),
                              onPress: () => {
                                console.log('[Profile iOS] Macro preset changed to balanced');
                                if (goal) recalculateGoals(user, { ...goal, macro_preset: 'balanced' });
                              },
                            },
                            {
                              text: t('profile.highProtein'),
                              onPress: () => {
                                console.log('[Profile iOS] Macro preset changed to high_protein');
                                if (goal) recalculateGoals(user, { ...goal, macro_preset: 'high_protein' });
                              },
                            },
                            {
                              text: t('profile.lowCarb'),
                              onPress: () => {
                                console.log('[Profile iOS] Macro preset changed to low_carb');
                                if (goal) recalculateGoals(user, { ...goal, macro_preset: 'low_carb' });
                              },
                            },
                            {
                              text: t('profile.custom'),
                              onPress: () => {
                                console.log('[Profile iOS] Macro preset: navigating to custom-macros screen');
                                router.push('/custom-macros');
                              },
                            },
                            { text: t('common.cancel'), style: 'cancel' },
                          ]
                        );
                      }}
                      isDark={isDark}
                    />

                    {/* Daily Targets */}
                    {goal && (
                      <View style={styles.dailyTargetsSection}>
                        <Text style={[styles.dailyTargetsTitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          {t('profile.dailyTargets')}
                        </Text>
                        <View style={styles.goalsRow}>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              {t('common.calories')}
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.daily_calories}
                            </Text>
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              {t('common.protein')}
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.protein_g}
                              {'g'}
                            </Text>
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              {t('common.carbs')}
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.carbs_g}
                              {'g'}
                            </Text>
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              {t('common.fats')}
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.fats_g}
                              {'g'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Recalculate Goals button */}
                    <TouchableOpacity
                      style={[styles.recalculateButton, { borderColor: colors.primary }]}
                      onPress={async () => {
                        console.log('[Profile iOS] Recalculate Goals button pressed');
                        if (!user || !goal) return;
                        setSaving(true);
                        try {
                          await recalculateGoals(user, goal);
                          Alert.alert(t('profile.goalsUpdated'), t('profile.goalsRecalculated'));
                        } catch (e: any) {
                          Alert.alert(t('common.error'), t('errors.failedToSave'));
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <IconSymbol
                        ios_icon_name="arrow.clockwise"
                        android_material_icon_name="refresh"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={[styles.recalculateButtonText, { color: colors.primary }]}>
                        {t('profile.recalculateGoals')}
                      </Text>
                    </TouchableOpacity>

                    {!!editor.error && <Text accessibilityRole="alert">{editor.error}</Text>}
                    {editor.canRetrySave && <TouchableOpacity disabled={editor.busy || saving} onPress={() => { void editor.run('save').catch(() => {}); }}><Text>Retry the same goal save</Text></TouchableOpacity>}
                    {editor.canRetryRestart && <TouchableOpacity disabled={editor.busy || saving} onPress={() => { void editor.run('restart').catch(() => {}); }}><Text>Retry the same journey restart</Text></TouchableOpacity>}
                    <TouchableOpacity disabled={editor.busy || saving} onPress={() => { closeEditModal(); setShowDatePicker(false); restartCurrent.current = () => false; void editor.review().catch(() => {}); }}><Text>Review current profile and targets</Text></TouchableOpacity>
                    {/* ── Adaptive TDEE Divider ── */}
                    <View style={[styles.adaptiveDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '30' }]} />

                    {/* ── A. Smart Calorie Adjustment Toggle ── */}
                    <View style={styles.adaptiveRow}>
                      <View style={styles.adaptiveRowLeft}>
                        <View style={[styles.adaptiveIconCircle, { backgroundColor: isDark ? '#1E2D35' : '#EBF4F6' }]}>
                          <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={16} color={colors.primary} />
                        </View>
                        <View style={styles.adaptiveTextStack}>
                          <Text style={[styles.adaptiveLabel, { color: isDark ? colors.textDark : colors.text }]}>
                            {'TDEE observation'}
                          </Text>
                          <Text style={[styles.adaptiveSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                            {'Observes data only. It does not change accepted targets or enable recommendations.'}
                          </Text>
                        </View>
                      </View>
                      <Switch
                        value={observation.program?.enabled === true}
                        disabled={observation.loading || !observation.program}
                        onValueChange={async (val) => {
                          if (!observation.program) return;
                          try { await observation.updateSettings(val, observation.program.reviewDay); }
                          catch (error) { Alert.alert('Observation unavailable', error instanceof Error ? error.message : 'Unable to verify settings'); }
                        }}
                        trackColor={{ false: isDark ? colors.borderDark : colors.border, true: colors.primary + '80' }}
                        thumbColor={observation.program?.enabled === true ? colors.primary : (isDark ? colors.textSecondaryDark : colors.disabled)}
                      />
                    </View>

                    {/* ── B. Adjustment Day Selector (only when enabled) ── */}
                    {observation.program?.enabled === true && (
                      <TouchableOpacity
                        style={styles.adaptiveRow}
                        onPress={() => {
                          console.log('[Profile iOS] Adjustment Day row pressed');
                          setShowAdjustmentDayModal(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.adaptiveRowLeft}>
                          <View style={[styles.adaptiveIconCircle, { backgroundColor: isDark ? '#1E2D35' : '#EBF4F6' }]}>
                            <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar-today" size={16} color={colors.primary} />
                          </View>
                          <Text style={[styles.adaptiveLabel, { color: isDark ? colors.textDark : colors.text }]}>
                            {(i18n.language.startsWith('es') ? 'Día de revisión de datos' : 'Data review day')}
                          </Text>
                        </View>
                        <View style={styles.adaptiveRowRight}>
                          <Text style={[styles.adaptiveValue, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                            {[
                              t('adaptiveTdee.sunday'),
                              t('adaptiveTdee.monday'),
                              t('adaptiveTdee.tuesday'),
                              t('adaptiveTdee.wednesday'),
                              t('adaptiveTdee.thursday'),
                              t('adaptiveTdee.friday'),
                              t('adaptiveTdee.saturday'),
                            ][observation.program?.reviewDay ?? 0]}
                          </Text>
                          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="arrow-forward" size={16} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* ── C. View Adjustment History ── */}
                    <TouchableOpacity
                      style={styles.adaptiveRow}
                      onPress={() => {
                        console.log('[Profile iOS] Calorie Adjustment History row pressed');
                        router.push('/adaptive-tdee-history');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.adaptiveRowLeft}>
                        <View style={[styles.adaptiveIconCircle, { backgroundColor: isDark ? '#1E2D35' : '#EBF4F6' }]}>
                          <IconSymbol ios_icon_name="chart.line.uptrend.xyaxis" android_material_icon_name="trending-up" size={16} color={colors.primary} />
                        </View>
                        <Text style={[styles.adaptiveLabel, { color: isDark ? colors.textDark : colors.text }]}>
                          {t('adaptiveTdee.viewHistory')}
                        </Text>
                      </View>
                      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="arrow-forward" size={16} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.noGoalContainer}>
                    <Text style={[styles.noGoalText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {t('profile.completeOnboarding')}
                    </Text>
                    <TouchableOpacity
                      style={[styles.editButton, { backgroundColor: colors.primary }]}
                      onPress={handleEditGoals}
                    >
                      <Text style={styles.editButtonText}>{t('profile.setUpGoals')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Divider between sections */}
          <View style={[styles.sectionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' }]} />

          {/* ── Section C: Food Preferences (non-accordion row) ───────────── */}
          <TouchableOpacity
            style={styles.accordionHeader}
            onPress={() => {
              console.log('[Profile iOS] Food Preferences row pressed');
              setShowFoodPrefsModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.accordionHeaderLeft}>
              <IconSymbol ios_icon_name="fork.knife" android_material_icon_name="restaurant" size={18} color={isDark ? '#aaa' : '#666'} />
              <View style={styles.accordionHeaderTextStack}>
                <Text style={[styles.accordionHeaderTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('profile.foodPreferences')}
                </Text>
                <Text style={[styles.accordionHeaderSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {foodPrefsSummary}
                </Text>
              </View>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={18}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Divider between sections */}
          <View style={[styles.sectionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' }]} />

          {/* ── Section D: Earn Money · Refer Friends 💸 (non-accordion row) ──── */}
          <TouchableOpacity
            style={styles.accordionHeader}
            onPress={() => {
              console.log('[Profile iOS] Invite Friends & Earn XP pressed');
              if (isAdmin) {
                router.push('/affiliate-admin');
              } else {
                router.push('/affiliate-welcome');
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.accordionHeaderLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol ios_icon_name="person.2" android_material_icon_name="group" size={18} color={isDark ? '#aaa' : '#666'} />
                <Text style={[styles.accordionHeaderTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('profile.earnMoney')}
                </Text>
              </View>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={18}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>

        </View>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <View style={[styles.actionsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <BlockedAccountsSettingsEntry />
          {/* Send Feedback */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              console.log('[Profile iOS] Send Feedback button pressed');
              const mailtoUrl = 'mailto:macrogoalapp@gmail.com?subject=MacroGoal%20App%20Feedback&body=Hi%2C%20I%27d%20like%20to%20share%20the%20following%20feedback%3A%0A%0A';
              Linking.openURL(mailtoUrl).catch((err) => {
                console.error('[Profile iOS] Failed to open mail app:', err);
                Alert.alert(t('common.error'), t('errors.couldNotOpenMail'));
              });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.actionRowLeft}>
              <IconSymbol
                ios_icon_name="envelope.fill"
                android_material_icon_name="email"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.actionRowLabel, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.sendFeedback')}
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={16}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Language */}
          <View style={[styles.sectionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' }]} />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              console.log('[Profile iOS] Language selector pressed');
              const options = supportedLanguages.map(lang => ({
                text: lang.nativeLabel,
                onPress: async () => {
                  console.log('[Profile iOS] Language changed to:', lang.code);
                  await i18nInstance.changeLanguage(lang.code);
                  const stored = await setStoredLanguage(lang.code);
                  if (!stored) Alert.alert(i18n.t('common.error'), i18n.t('localization.settings.languageSaveError'));
                },
              }));
              Alert.alert(t('profile.selectLanguage'), '', [...options, { text: t('common.cancel'), style: 'cancel' as const }]);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.actionRowLeft}>
              <IconSymbol
                ios_icon_name="globe"
                android_material_icon_name="language"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.actionRowLabel, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.language')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                {i18nInstance.language?.startsWith('es') ? t('profile.spanish') : t('profile.english')}
              </Text>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="arrow-forward"
                size={16}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Log Out */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: colors.error }]}
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>
            {t('profile.logOut')}
          </Text>
        </TouchableOpacity>

        {/* Footer Links */}
        <View style={styles.footerLinksContainer}>
          <View style={styles.footerLinksRow}>
            <TouchableOpacity onPress={() => {
              console.log('[Profile iOS] Privacy Policy link pressed');
              router.push('/privacy-policy');
            }}>
              <Text style={[styles.footerLink, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('profile.privacyPolicy')}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.footerSeparator, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {' · '}
            </Text>
            <TouchableOpacity onPress={() => {
              console.log('[Profile iOS] Terms of Service link pressed');
              router.push('/terms-of-service');
            }}>
              <Text style={[styles.footerLink, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('profile.termsOfService')}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.footerSeparator, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {' · '}
            </Text>
            <TouchableOpacity onPress={() => {
              console.log('[Profile iOS] Terms of Use (EULA) link pressed');
              router.push('/terms-of-use-eula');
            }}>
              <Text style={[styles.footerLink, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('profile.termsOfUse')}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.footerSeparator, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {' · '}
            </Text>
            <TouchableOpacity onPress={() => {
              console.log('[Profile iOS] Delete Account link pressed');
              router.push('/delete-account');
            }}>
              <Text style={[styles.footerLink, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('profile.deleteAccount')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </PremiumCheckpointScrollView>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      <Modal
        visible={editingField !== null && editingField !== 'sex' && editingField !== 'activity'}
        transparent
        animationType="fade"
        onRequestClose={closeEditModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeEditModal}
        >
          <TouchableOpacity
            style={[styles.modalContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
            activeOpacity={1}
          >
            <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {editingField === 'name' && t('profile.editName')}
              {editingField === 'height' && t('profile.editHeight')}
              {editingField === 'weight' && t('profile.editWeight')}
              {editingField === 'goalWeight' && t('profile.editGoalWeight')}
              {editingField === 'age' && t('profile.editAge')}
              {editingField === 'lossRate' && t('profile.editLossRate')}
            </Text>

            {editingField === 'height' && units === 'imperial' ? (
              <View style={styles.dualInputRow}>
                <View style={styles.dualInputContainer}>
                  <Text style={[styles.inputLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {t('profile.feet')}
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, color: isDark ? colors.textDark : colors.text }]}
                    value={editValue}
                    onChangeText={setEditValue}
                    keyboardType="number-pad"
                    autoFocus
                  />
                </View>
                <View style={styles.dualInputContainer}>
                  <Text style={[styles.inputLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {t('profile.inches')}
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, color: isDark ? colors.textDark : colors.text }]}
                    value={editValue2}
                    onChangeText={setEditValue2}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            ) : (
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, color: isDark ? colors.textDark : colors.text }]}
                value={editValue}
                onChangeText={setEditValue}
                keyboardType={editingField === 'name' ? 'default' : 'decimal-pad'}
                placeholder={
                  editingField === 'name' ? t('profile.yourFirstName') :
                  editingField === 'height' ? (units === 'imperial' ? t('profile.inches') : 'cm') :
                  editingField === 'weight' || editingField === 'goalWeight' ? (units === 'imperial' ? 'lbs' : 'kg') :
                  editingField === 'age' ? t('profile.years', { age: '' }).trim() :
                  editingField === 'lossRate' ? (units === 'metric' ? t('profile.kgPerWeek') : t('profile.lbsPerWeek')) : ''
                }
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                autoFocus
                autoCapitalize={editingField === 'name' ? 'words' : 'none'}
              />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                onPress={closeEditModal}
              >
                <Text style={[styles.modalButtonText, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={saveEditedField}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>
                    {t('common.save')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Goal Weight Prompt Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showGoalWeightPrompt}
        transparent
        animationType="fade"
        onRequestClose={handleGoalWeightPromptSkip}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleGoalWeightPromptSkip}
        >
          <TouchableOpacity
            style={[styles.modalContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
            activeOpacity={1}
          >
            <View style={styles.promptHeader}>
              <IconSymbol
                ios_icon_name="target"
                android_material_icon_name="flag"
                size={48}
                color={colors.primary}
              />
              <Text style={[styles.promptTitle, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.whatIsGoalWeight')}
              </Text>
              <Text style={[styles.promptSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('profile.goalWeightHelp')}
              </Text>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, color: isDark ? colors.textDark : colors.text }]}
              value={editValue}
              onChangeText={setEditValue}
              keyboardType="decimal-pad"
              placeholder={units === 'imperial' ? 'lbs' : 'kg'}
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                onPress={handleGoalWeightPromptSkip}
              >
                <Text style={[styles.modalButtonText, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('profile.skipForNow')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleGoalWeightPromptSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>
                    {t('common.save')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Food Preferences Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showFoodPrefsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFoodPrefsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFoodPrefsModal(false)}
        >
          <TouchableOpacity
            style={[styles.foodPrefsModal, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
            activeOpacity={1}
          >
            {/* Header */}
            <View style={styles.foodPrefsHeader}>
              <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.foodPreferences')}
              </Text>
              <TouchableOpacity onPress={() => setShowFoodPrefsModal(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={24}
                  color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <PremiumCheckpointScrollView showsVerticalScrollIndicator={false} style={styles.foodPrefsScroll}>
              {/* Dietary Restrictions */}
              <Text style={[styles.foodPrefsSectionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.dietaryRestrictions')}
              </Text>
              <View style={styles.chipsRow}>
                {DIETARY_OPTIONS.map((item) => {
                  const isSelected = foodPrefs.dietary_restrictions.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.chip,
                        isSelected
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: 'transparent', borderColor: isDark ? colors.textSecondaryDark : colors.border },
                      ]}
                      onPress={() => toggleDietaryRestriction(item)}
                    >
                      <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) }]}>
                        {translatePreference(item)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Protein Preferences */}
              <Text style={[styles.foodPrefsSectionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.proteinPreferences')}
              </Text>
              <View style={styles.chipsRow}>
                {PROTEIN_OPTIONS.map((item) => {
                  const isSelected = foodPrefs.protein_preferences.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.chip,
                        isSelected
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: 'transparent', borderColor: isDark ? colors.textSecondaryDark : colors.border },
                      ]}
                      onPress={() => toggleProteinPreference(item)}
                    >
                      <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) }]}>
                        {translatePreference(item)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Disliked Foods */}
              <Text style={[styles.foodPrefsSectionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.dislikedFoods')}
              </Text>
              <TextInput
                style={[
                  styles.foodPrefsTextInput,
                  {
                    backgroundColor: isDark ? colors.backgroundDark : colors.background,
                    color: isDark ? colors.textDark : colors.text,
                    borderColor: isDark ? colors.textSecondaryDark + '40' : colors.border,
                  },
                ]}
                value={foodPrefs.disliked_foods}
                onChangeText={(text) => {
                  console.log('[Profile iOS] Disliked foods text changed');
                  setFoodPrefs((prev) => ({ ...prev, disliked_foods: text }));
                }}
                placeholder={t('profile.dislikedFoodsPlaceholder')}
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                multiline
              />

              {/* Recipe Style */}
              <Text style={[styles.foodPrefsSectionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.recipeStyle')}
              </Text>
              <View style={styles.chipsRow}>
                {RECIPE_STYLE_OPTIONS.map((opt) => {
                  const isSelected = foodPrefs.recipe_styles.includes(opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.chip,
                        isSelected
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: 'transparent', borderColor: isDark ? colors.textSecondaryDark : colors.border },
                      ]}
                      onPress={() => toggleRecipeStyle(opt.value)}
                    >
                      <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : (isDark ? colors.textDark : colors.text) }]}>
                        {translatePreference(opt.label)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </PremiumCheckpointScrollView>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.foodPrefsSaveButton, { backgroundColor: colors.primary }]}
              onPress={saveFoodPrefs}
              disabled={savingFoodPrefs}
            >
              {savingFoodPrefs ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.foodPrefsSaveButtonText}>{t('profile.savePreferences')}</Text>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Adjustment Day Picker Modal ─────────────────────────────────────── */}
      <Modal
        visible={showAdjustmentDayModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdjustmentDayModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAdjustmentDayModal(false)}
        >
          <TouchableOpacity
            style={[styles.adjustmentDayModal, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
            activeOpacity={1}
          >
            <View style={styles.adjustmentDayHeader}>
              <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
                {(i18n.language.startsWith('es') ? 'Día de revisión de datos' : 'Data review day')}
              </Text>
              <TouchableOpacity onPress={() => setShowAdjustmentDayModal(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={24}
                  color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {[
              t('adaptiveTdee.sunday'),
              t('adaptiveTdee.monday'),
              t('adaptiveTdee.tuesday'),
              t('adaptiveTdee.wednesday'),
              t('adaptiveTdee.thursday'),
              t('adaptiveTdee.friday'),
              t('adaptiveTdee.saturday'),
            ].map((dayName, index) => {
              const isSelected = (observation.program?.reviewDay ?? 0) === index;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.adjustmentDayOption,
                    { borderBottomColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' },
                    isSelected && { backgroundColor: colors.primary + '15' },
                  ]}
                  onPress={async () => {                    if (!observation.program) return;
                    try { await observation.updateSettings(observation.program.enabled, index); setShowAdjustmentDayModal(false); }
                    catch (error) { Alert.alert('Observation unavailable', error instanceof Error ? error.message : 'Unable to verify settings'); }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.adjustmentDayOptionText,
                    { color: isSelected ? colors.primary : (isDark ? colors.textDark : colors.text) },
                    isSelected && { fontWeight: '700' },
                  ]}>
                    {dayName}
                  </Text>
                  {isSelected && (
                    <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Date Picker ─────────────────────────────────────────────────────── */}
      {showDatePicker && (
        Platform.OS === 'ios' ? (
          <Modal
            visible={showDatePicker}
            transparent
            animationType="slide"
            onRequestClose={() => { restartCurrent.current = () => false; setShowDatePicker(false); }}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => { restartCurrent.current = () => false; setShowDatePicker(false); }}
            >
              <TouchableOpacity
                style={[styles.datePickerModal, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
                activeOpacity={1}
              >
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => { restartCurrent.current = () => false; setShowDatePicker(false); }}>
                    <Text style={[styles.datePickerButton, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {t('common.cancel')}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.datePickerTitle, { color: isDark ? colors.textDark : colors.text }]}>
                    {t('profile.selectStartDate')}
                  </Text>
                  <TouchableOpacity onPress={() => saveStartDate(selectedDate)} disabled={saving}>
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.datePickerButton, { color: colors.primary }]}>
                        {t('common.done')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  locale={Platform.OS === 'ios' ? getAppLocale() : undefined}
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  onChange={handleStartDateChange}
                  textColor={isDark ? colors.textDark : colors.text}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        ) : (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={handleStartDateChange}
          />
        )
      )}
    </SafeAreaView>
  );
}

function EditableSettingItem({ label, value, onPress, isDark, highlight }: any) {
  return (
    <TouchableOpacity
      style={[
        styles.settingItem,
        highlight && { backgroundColor: colors.primary + '10', borderLeftWidth: 3, borderLeftColor: colors.primary }
      ]}
      onPress={onPress}
    >
      <View style={styles.settingItemContent}>
        <Text style={[styles.settingItemLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          {label}
        </Text>
        <View style={styles.settingItemValueRow}>
          <Text style={[
            styles.settingItemValue,
            { color: highlight ? colors.primary : (isDark ? colors.textDark : colors.text) },
            highlight && { fontWeight: '600' }
          ]}>
            {value}
          </Text>
          <IconSymbol
            ios_icon_name="pencil"
            android_material_icon_name="edit"
            size={16}
            color={colors.primary}
          />
        </View>
      </View>
    </TouchableOpacity>
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
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h2,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  // ── Avatar Card ──────────────────────────────────────────────────────────
  profileCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  avatarWrapper: {
    width: 80,
    height: 80,
    marginBottom: spacing.md,
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  userName: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  subscriptionStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  email: {
    ...typography.body,
  },
  usernameText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 4,
  },
  setUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    marginBottom: 4,
    opacity: 0.85,
  },
  setUsernameText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  // ── Subscription Card ────────────────────────────────────────────────────
  subscriptionCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 4,
  },
  subscriptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionText: {
    flex: 1,
  },
  subscriptionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subscriptionSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
  // ── Accordion Card ───────────────────────────────────────────────────────
  accordionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  accordionHeaderEmoji: {
    fontSize: 18,
  },
  accordionHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  accordionHeaderTextStack: {
    flex: 1,
  },
  accordionHeaderSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  accordionDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  accordionContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
  },
  sectionDivider: {
    height: 1,
    marginHorizontal: 0,
  },
  // ── Setting Items ────────────────────────────────────────────────────────
  settingItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '20',
  },
  settingItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingItemLabel: {
    ...typography.body,
    flex: 1,
  },
  settingItemValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  settingItemValue: {
    ...typography.bodyBold,
  },
  // ── Daily Targets ────────────────────────────────────────────────────────
  dailyTargetsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border + '20',
    marginBottom: spacing.sm,
  },
  dailyTargetsTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  goalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  goalItemCompact: {
    flex: 1,
    alignItems: 'center',
  },
  goalLabelCompact: {
    ...typography.caption,
    fontSize: 11,
    marginBottom: 2,
  },
  goalValueCompact: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  // ── Recalculate Button ───────────────────────────────────────────────────
  recalculateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  recalculateButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // ── No Goal ──────────────────────────────────────────────────────────────
  noGoalContainer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  noGoalText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  editButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // ── Actions Card ─────────────────────────────────────────────────────────
  actionsCard: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionRowLabel: {
    ...typography.body,
    fontSize: 15,
  },
  actionDivider: {
    height: 1,
    marginHorizontal: spacing.lg,
  },
  // ── Log Out ──────────────────────────────────────────────────────────────
  logoutButton: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: spacing.md,
  },
  logoutText: {
    fontWeight: '600',
    fontSize: 16,
  },
  // ── Footer Links ─────────────────────────────────────────────────────────
  footerLinksContainer: {
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  footerLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  footerLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  footerSeparator: {
    fontSize: 12,
  },
  // ── Modals ───────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  promptHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  promptTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  promptSubtitle: {
    ...typography.body,
    textAlign: 'center',
    fontSize: 14,
  },
  input: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    textAlign: 'center',
  },
  inputLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  dualInputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dualInputContainer: {
    flex: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  datePickerModal: {
    width: '90%',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: 100,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  datePickerTitle: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  datePickerButton: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  foodPrefsModal: {
    width: '92%',
    maxHeight: '80%',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  foodPrefsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  foodPrefsScroll: {
    flexGrow: 0,
  },
  foodPrefsSectionLabel: {
    ...typography.bodyBold,
    fontSize: 14,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  foodPrefsTextInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: spacing.xs,
  },
  foodPrefsSaveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  foodPrefsSaveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  // ── Adaptive TDEE ────────────────────────────────────────────────────────
  adaptiveDivider: {
    height: 1,
    marginVertical: spacing.sm,
  },
  adaptiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  adaptiveRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  adaptiveRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  adaptiveIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adaptiveTextStack: {
    flex: 1,
  },
  adaptiveLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  adaptiveSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  adaptiveValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  // ── Adjustment Day Modal ──────────────────────────────────────────────────
  adjustmentDayModal: {
    width: '85%',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  adjustmentDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  adjustmentDayOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
  },
  adjustmentDayOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  // ── Challenger Badge ──────────────────────────────────────────────────────
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  challengerBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#FFB547',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  badgeIcon: {
    fontSize: 16,
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
