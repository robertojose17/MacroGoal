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
import { useTranslation } from 'react-i18next';
import i18n, { supportedLanguages, setStoredLanguage } from '@/lib/i18n';
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
  const { t } = useTranslation();

  const { isPremium, loading: premiumLoading, refreshPremiumStatus } = usePremium();

  const [user, setUser] = useState<any>(null);
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
  useEffect(() => { if (editor.snapshot) { setUser(editor.snapshot.profile); setGoal(editor.snapshot.goal); } else { setUser(null); setGoal(null); setIsAdmin(false); setCoachActions([]); setLastAdjustMacrosAction(null); } }, [editor.snapshot]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Coach history state
  type CoachAction = Database['public']['Tables']['coach_action_log']['Row'];
  const [coachActions, setCoachActions] = useState<CoachAction[]>([]);
  const [lastAdjustMacrosAction, setLastAdjustMacrosAction] = useState<CoachAction | null>(null);

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

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);

  // Avatar upload state
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Adaptive TDEE state
  const [showAdjustmentDayModal, setShowAdjustmentDayModal] = useState(false);

  // Community sharing toggle
  const [autoShare, setAutoShare] = useState(true);

  const handleAvatarPress = () => {
    console.log('[Profile] Avatar tapped — showing photo picker options');
    Alert.alert(
      t('localization.settings.profilePhoto'),
      t('localization.settings.choosePhoto'),
      [
        {
          text: t('localization.settings.takePhoto'),
          onPress: () => {
            console.log('[Profile] Take Photo selected');
            pickImage('camera');
          },
        },
        {
          text: t('localization.settings.chooseLibrary'),
          onPress: () => {
            console.log('[Profile] Choose from Library selected');
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
        console.log('[Profile] Requesting camera permissions');
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          console.log('[Profile] Camera permission denied');
          Alert.alert(t('localization.settings.permissionRequired'), t('localization.settings.cameraPermission'));
          return;
        }
        console.log('[Profile] Launching camera');
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        console.log('[Profile] Requesting media library permissions');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          console.log('[Profile] Media library permission denied');
          Alert.alert(t('localization.settings.permissionRequired'), t('localization.settings.photoPermission'));
          return;
        }
        console.log('[Profile] Launching image library');
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (result.canceled) {
        console.log('[Profile] Image picker cancelled');
        return;
      }

      const asset = result.assets[0];
      console.log('[Profile] Image selected — uri:', asset.uri, 'width:', asset.width, 'height:', asset.height);
      await uploadAvatar(asset.uri);
    } catch (error: any) {
      console.error('[Profile] Error picking image:', error);
      Alert.alert(t('common.error'), t('localization.settings.pickImageError'));
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!user) return;
    console.log('[Avatar] Starting upload for user:', user.id);
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
      console.log('[Avatar] File size (bytes):', bytes.length);
      if (bytes.length === 0) throw new Error('Image file is empty');

      // Step 2: Upload directly to Supabase Storage
      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      console.log('[Avatar] Upload successful');

      // Step 4: Get the public URL (clean, no cache-buster)
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      console.log('[Avatar] Public URL:', publicUrl);

      // Step 5: Save clean URL to DB
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      // Step 6: Update local state with cache-busted URL so image refreshes immediately
      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;
      setUser((prev: any) => ({ ...prev, avatar_url: cacheBustedUrl }));
      console.log('[Avatar] Done — avatar updated successfully');
    } catch (error: any) {
      console.error('[Avatar] Upload failed:', error);
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
      setAutoShare(verified.profile.auto_share_achievements !== false);
      const result = await supabase.from('coach_action_log').select('*').eq('user_id', verified.profile.id).order('proposed_at', { ascending: false }).limit(20);
      if (!active() || !current()) return;
      const actions = result.error ? [] : result.data ?? [];
      setCoachActions(actions); setLastAdjustMacrosAction(actions.find(action => action.action_type === 'adjust_macros') ?? null);
    } catch (error) { if (active() && !(error instanceof AcceptedGoalReadSuperseded)) { setUser(null); setGoal(null); setIsAdmin(false); setCoachActions([]); setLastAdjustMacrosAction(null); } }
    finally { if (active()) { setLoading(false); setRefreshing(false); } }
  }, [refreshAcceptedEditor, captureAcceptedEditor]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Profile] Screen focused, loading data');
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
    console.log('[Profile] Accordion section toggled:', section);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const saveFoodPrefs = async () => {
    if (!user) return;
    console.log('[Profile] Save Food Preferences button pressed', foodPrefs);
    setSavingFoodPrefs(true);
    try {
      const updateData = {
        dietary_restrictions: foodPrefs.dietary_restrictions,
        protein_preferences: foodPrefs.protein_preferences,
        recipe_styles: foodPrefs.recipe_styles,
        disliked_foods: foodPrefs.disliked_foods.trim(),
        updated_at: new Date().toISOString(),
      };
      console.log('[Profile] Saving food preferences to Supabase:', updateData);
      const { error } = await supabase.from('users').update(updateData).eq('id', user.id);
      if (error) throw error;
      console.log('[Profile] Food preferences saved successfully');
      setShowFoodPrefsModal(false);
      await loadUserData();
    } catch (error: any) {
      console.error('[Profile] Error saving food preferences:', error);
      Alert.alert(t('common.error'), t('profile.failedToSavePreferences'));
    } finally {
      setSavingFoodPrefs(false);
    }
  };

  const toggleDietaryRestriction = (item: string) => {
    console.log('[Profile] Dietary restriction toggled:', item);
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
    console.log('[Profile] Protein preference toggled:', item);
    setFoodPrefs((prev) => ({
      ...prev,
      protein_preferences: prev.protein_preferences.includes(item)
        ? prev.protein_preferences.filter((i) => i !== item)
        : [...prev.protein_preferences, item],
    }));
  };

  const toggleRecipeStyle = (item: string) => {
    console.log('[Profile] Recipe style toggled:', item);
    setFoodPrefs((prev) => ({
      ...prev,
      recipe_styles: prev.recipe_styles.includes(item)
        ? prev.recipe_styles.filter((i) => i !== item)
        : [...prev.recipe_styles, item],
    }));
  };

  const handleLogout = async () => {
    console.log('[Profile] Log Out button pressed');
    Alert.alert(
      t('auth.logOutConfirmTitle'),
      t('auth.logOutConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.logOut'),
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile] Logging out user');
            await clearOnboardingSession();
            await supabase.auth.signOut();
            router.replace('/auth/welcome');
          },
        },
      ]
    );
  };

  const handleEditGoals = () => {
    console.log('[Profile] Advanced goals button pressed');
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
      Alert.alert(t('common.required'), t('profile.whatIsGoalWeight'));
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
    if (!effective) return t('profile.setDate');
    try {
      const ymd = effective.slice(0, 10);
      const date = new Date(ymd + 'T00:00:00');
      return date.toLocaleDateString(getAppLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (error) {
      console.error('[Profile] Error formatting date:', error);
      return t('profile.setDate');
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
  console.log('[Profile] Displaying subscription status:', subscriptionStatusText, '(isPremium:', isPremium, ')');

  const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free'];

  const proteinCount = foodPrefs.protein_preferences.length;
  const recipeStyleCount = foodPrefs.recipe_styles.length;
  const hasAnyPrefs = proteinCount > 0 || recipeStyleCount > 0;
  const foodPrefsSummaryParts: string[] = [];
  if (hasAnyPrefs) {
    if (proteinCount > 0) foodPrefsSummaryParts.push(`${t('profile.proteins_one', { count: proteinCount }).replace('_one', '').replace('_other', '')}`);
    if (recipeStyleCount > 0) foodPrefsSummaryParts.push(`🍳 ${t('profile.styles_one', { count: recipeStyleCount }).replace('_one', '').replace('_other', '')}`);
  }
  const foodPrefsSummary = foodPrefsSummaryParts.length > 0 ? foodPrefsSummaryParts.join(' · ') : t('profile.noPreferencesSet');

  const sexDisplayValue = user.sex === 'male' ? t('profile.male') : user.sex === 'female' ? t('profile.female') : user.sex ? t('profile.other') : t('common.tapToSet');
  const activityDisplayValue = user.activity_level
    ? user.activity_level.charAt(0).toUpperCase() + user.activity_level.slice(1).replace('_', ' ')
    : t('common.tapToSet');
  const unitsDisplayValue = units === 'imperial' ? t('profile.imperial') : t('profile.metric');
  const goalTypeDisplayValue = goal?.goal_type === 'lose' ? t('profile.loseWeight') : goal?.goal_type === 'gain' ? t('profile.gainWeight') : goal?.goal_type === 'maintain' ? t('profile.maintain') : t('common.tapToSet');
  const journeyStartDisplay = goal ? formatJourneyStartDate(goal.start_date, user.created_at) : t('profile.noGoalSet');

  type MacroPreset = 'balanced' | 'high_protein' | 'low_carb' | 'lean_body' | 'custom';

  const detectMacroPreset = (g: Database['public']['Tables']['goals']['Row'] | null): MacroPreset | null => {
    const preset = g?.macro_preset;
    return preset === 'balanced' || preset === 'high_protein' || preset === 'low_carb' || preset === 'lean_body' || preset === 'custom' ? preset : null;
  };

  const currentMacroPreset = detectMacroPreset(goal);
  const macroPresetDisplayValue = currentMacroPreset === null ? '--' : currentMacroPreset === 'lean_body' ? t('profile.leanBodyFormula')
    : currentMacroPreset === 'balanced' ? t('profile.balanced').split(' ')[0]
    : currentMacroPreset === 'high_protein' ? t('profile.highProtein').split(' ').slice(0, 2).join(' ')
    : currentMacroPreset === 'low_carb' ? t('profile.lowCarb').split(' ').slice(0, 2).join(' ')
    : t('profile.custom');

  const isProfileOpen = openSection === 'profile';
  const isGoalOpen = openSection === 'goal';

  const coachValue = lastAdjustMacrosAction?.new_value;
  const coachTargets = coachValue && typeof coachValue === 'object' && !Array.isArray(coachValue) ? coachValue : null;
  // Coach badge helpers
  const isCoachModifiedCalories = lastAdjustMacrosAction && goal &&
    coachTargets?.daily_calories === goal.daily_calories;
  const isCoachModifiedProtein = lastAdjustMacrosAction && goal &&
    coachTargets?.protein_g === goal.protein_g;
  const isCoachModifiedCarbs = lastAdjustMacrosAction && goal &&
    coachTargets?.carbs_g === goal.carbs_g;
  const isCoachModifiedFats = lastAdjustMacrosAction && goal &&
    coachTargets?.fats_g === goal.fats_g;

  const formatCoachActionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t('localization.settings.today');
    if (diffDays === 1) return t('localization.settings.yesterday');
    return date.toLocaleDateString(getAppLocale(), { month: 'short', day: 'numeric' });
  };

  const getCoachActionIcon = (actionType: string): { ios: React.ComponentProps<typeof IconSymbol>['ios_icon_name']; android: React.ComponentProps<typeof IconSymbol>['android_material_icon_name'] } => {
    if (actionType === 'adjust_macros') return { ios: 'target', android: 'gps_fixed' };
    if (actionType === 'update_goal_weight') return { ios: 'scalemass.fill', android: 'monitor_weight' };
    if (actionType === 'update_step_goal') return { ios: 'figure.walk', android: 'directions_walk' };
    return { ios: 'cpu', android: 'smart_toy' };
  };

  const handleCoachBadgePress = (fieldLabel: string) => {
    if (!lastAdjustMacrosAction) return;
    console.log('[Profile] Coach badge tapped for field:', fieldLabel);
    const dateStr = new Date(lastAdjustMacrosAction.confirmed_at ?? lastAdjustMacrosAction.proposed_at).toLocaleDateString(getAppLocale(), { month: 'long', day: 'numeric', year: 'numeric' });
    Alert.alert(
      t('profile.setByCoach'),
      t('profile.setByCoachMessage', { date: dateStr })
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[Settings] Back button pressed');
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
        {/* ── Avatar Card ─────────────────────────────────────────────────── */}
        <View style={[styles.profileCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <TouchableOpacity
            onPress={handleAvatarPress}
            activeOpacity={0.8}
            style={styles.avatarWrapper}
            disabled={avatarUploading}
          >
            {user.avatar_url ? (
              <Image
                source={{ uri: user.avatar_url }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>
                  {user.name ? user.name.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            <View style={[styles.avatarCameraBadge, { backgroundColor: isDark ? colors.cardDark : '#fff' }]}>
              {avatarUploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol
                  ios_icon_name="camera.fill"
                  android_material_icon_name="camera-alt"
                  size={14}
                  color={colors.primary}
                />
              )}
            </View>
          </TouchableOpacity>

          <Text style={[styles.userName, { color: isDark ? colors.textDark : colors.text }]}>
            {user.name || t('localization.completion.user')}
          </Text>

          {user.username ? (
            <Text style={styles.usernameText}>
              {'@'}
              {user.username}
            </Text>
          ) : (
            <TouchableOpacity
              style={styles.setUsernameRow}
              onPress={() => {
                console.log('[Profile] Set username pressed from avatar card');
                router.push('/choose-username');
              }}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="plus.circle.fill"
                android_material_icon_name="add-circle"
                size={14}
                color={colors.primary}
              />
              <Text style={styles.setUsernameText}>
                {t('profile.setUsername')}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.subscriptionStatus, { color: isPremium ? colors.primary : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
            {subscriptionStatusText}
          </Text>

          <Text style={[styles.email, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {user.email || t('localization.settings.guestUser')}
          </Text>

          {user.challenger_badge && (
            <View style={styles.badgeRow}>
              <View style={styles.challengerBadgePill}>
                <IconSymbol ios_icon_name="medal.fill" android_material_icon_name="military_tech" size={20} color="#F59E0B" />
                <Text style={styles.badgeLabel}>{t('profile.challenger')}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Upgrade to Premium ──────────────────────────────────────────── */}
        {!isPremium && !premiumLoading && (
          <PremiumCheckpointInline source="settings_upgrade">{premiumFlow => (<TouchableOpacity
            onPress={() => {
              console.log('[Profile] Upgrade to Premium button pressed');
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
                    console.log('[Profile] Username row tapped');
                    router.push('/choose-username');
                  }}
                  isDark={isDark}
                  highlight={!user.username}
                />
                <EditableSettingItem
                  label={t('profile.age')}
                  value={age ? t('profile.years', { age }) : t('common.tapToSet')}
                  onPress={() => openEditModal('age')}
                  isDark={isDark}
                  highlight={!age}
                />
                <EditableSettingItem
                  label={t('profile.sex')}
                  value={sexDisplayValue}
                  onPress={() => {
                    console.log('[Profile] Sex field tapped');
                    Alert.alert(
                      t('profile.selectSex'),
                      '',
                      [
                        {
                          text: t('profile.male'),
                          onPress: () => {
                            console.log('[Profile] Sex changed to male');
                            saveFieldDirectly('sex', 'male');
                          },
                        },
                        {
                          text: t('profile.female'),
                          onPress: () => {
                            console.log('[Profile] Sex changed to female');
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
                  value={user.height ? formatHeight(user.height, units) : t('common.tapToSet')}
                  onPress={() => openEditModal('height')}
                  isDark={isDark}
                  highlight={!user.height}
                />
                <EditableSettingItem
                  label={t('profile.weight')}
                  value={user.current_weight ? formatWeight(user.current_weight, units) : t('common.tapToSet')}
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
                    console.log('[Profile] Units field tapped');
                    Alert.alert(
                      t('profile.selectUnits'),
                      '',
                      [
                        {
                          text: t('profile.metricLabel'),
                          onPress: async () => {
                            console.log('[Profile] Units changed to metric');
                            try {
                              const { error } = await supabase
                                .from('users')
                                .update({ preferred_units: 'metric', updated_at: new Date().toISOString() })
                                .eq('id', user.id);
                              if (error) throw error;
                              await loadUserData();
                            } catch (err: any) {
                              console.error('[Profile] Error saving units:', err);
                              Alert.alert(t('common.error'), t('errors.failedToSave'));
                            }
                          },
                        },
                        {
                          text: t('profile.imperialLabel'),
                          onPress: async () => {
                            console.log('[Profile] Units changed to imperial');
                            try {
                              const { error } = await supabase
                                .from('users')
                                .update({ preferred_units: 'imperial', updated_at: new Date().toISOString() })
                                .eq('id', user.id);
                              if (error) throw error;
                              await loadUserData();
                            } catch (err: any) {
                              console.error('[Profile] Error saving units:', err);
                              Alert.alert(t('common.error'), t('errors.failedToSave'));
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
                    console.log('[Profile] Activity level field tapped');
                    Alert.alert(
                      t('profile.selectActivityLevel'),
                      '',
                      [
                        {
                          text: t('profile.sedentary'),
                          onPress: () => {
                            console.log('[Profile] Activity level changed to sedentary');
                            saveFieldDirectly('activity', 'sedentary');
                          },
                        },
                        {
                          text: t('profile.light'),
                          onPress: () => {
                            console.log('[Profile] Activity level changed to light');
                            saveFieldDirectly('activity', 'light');
                          },
                        },
                        {
                          text: t('profile.moderate'),
                          onPress: () => {
                            console.log('[Profile] Activity level changed to moderate');
                            saveFieldDirectly('activity', 'moderate');
                          },
                        },
                        {
                          text: t('profile.veryActive'),
                          onPress: () => {
                            console.log('[Profile] Activity level changed to very_active');
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
                        console.log('[Profile] Goal type field tapped');
                        Alert.alert(
                          t('profile.selectGoal'),
                          '',
                          [
                            {
                              text: t('profile.loseWeight'),
                              onPress: () => {
                                console.log('[Profile] Goal type changed to lose');
                                if (goal) {
                                  recalculateGoals(user, { ...goal, goal_type: 'lose', loss_rate_lbs_per_week: goal?.loss_rate_lbs_per_week ?? NaN });
                                }
                              },
                            },
                            {
                              text: t('profile.maintain'),
                              onPress: () => {
                                console.log('[Profile] Goal type changed to maintain');
                                if (goal) {
                                  recalculateGoals(user, { ...goal, goal_type: 'maintain' });
                                }
                              },
                            },
                            {
                              text: t('profile.gainWeight'),
                              onPress: () => {
                                console.log('[Profile] Goal type changed to gain');
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
                        value={goal?.loss_rate_lbs_per_week ? getLossRateDisplayText(goal.loss_rate_lbs_per_week, units) : t('common.tapToSet')}
                        onPress={() => openEditModal('lossRate')}
                        isDark={isDark}
                      />
                    )}

                    {/* Journey Start */}
                    <EditableSettingItem
                      label={t('profile.journeyStart')}
                      value={journeyStartDisplay}
                      onPress={() => {
                        console.log('[Profile] Journey Start Date row tapped');
                        openStartDatePicker();
                      }}
                      isDark={isDark}
                    />

                    {/* Macro Split */}
                    <EditableSettingItem
                      label={t('profile.macroSplit')}
                      value={macroPresetDisplayValue}
                      onPress={() => {
                        console.log('[Profile] Macro Split row tapped, current preset:', currentMacroPreset);
                        Alert.alert(
                          t('profile.selectMacroSplit'),
                          '',
                          [
                            {
                              text: t('profile.leanBodyFormula'),
                              onPress: () => {
                                console.log('[Profile] Macro preset changed to lean_body');
                                if (goal) recalculateGoals(user, { ...goal, macro_preset: 'lean_body' });
                              },
                            },
                            {
                              text: t('profile.balanced'),
                              onPress: () => {
                                console.log('[Profile] Macro preset changed to balanced');
                                if (goal) recalculateGoals(user, { ...goal, macro_preset: 'balanced' });
                              },
                            },
                            {
                              text: t('profile.highProtein'),
                              onPress: () => {
                                console.log('[Profile] Macro preset changed to high_protein');
                                if (goal) recalculateGoals(user, { ...goal, macro_preset: 'high_protein' });
                              },
                            },
                            {
                              text: t('profile.lowCarb'),
                              onPress: () => {
                                console.log('[Profile] Macro preset changed to low_carb');
                                if (goal) recalculateGoals(user, { ...goal, macro_preset: 'low_carb' });
                              },
                            },
                            {
                              text: t('profile.custom'),
                              onPress: () => {
                                console.log('[Profile] Macro preset: navigating to custom-macros screen');
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
                            {isCoachModifiedCalories && (
                              <TouchableOpacity
                                style={styles.coachBadge}
                                onPress={() => handleCoachBadgePress('Calories')}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.coachBadgeText}>{'🤖 Coach'}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              {t('common.protein')}
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.protein_g}
                              {'g'}
                            </Text>
                            {isCoachModifiedProtein && (
                              <TouchableOpacity
                                style={styles.coachBadge}
                                onPress={() => handleCoachBadgePress('Protein')}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.coachBadgeText}>{'🤖 Coach'}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              {t('common.carbs')}
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.carbs_g}
                              {'g'}
                            </Text>
                            {isCoachModifiedCarbs && (
                              <TouchableOpacity
                                style={styles.coachBadge}
                                onPress={() => handleCoachBadgePress('Carbs')}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.coachBadgeText}>{'🤖 Coach'}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              {t('common.fats')}
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.fats_g}
                              {'g'}
                            </Text>
                            {isCoachModifiedFats && (
                              <TouchableOpacity
                                style={styles.coachBadge}
                                onPress={() => handleCoachBadgePress('Fats')}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.coachBadgeText}>{'🤖 Coach'}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Recalculate Goals button */}
                    <TouchableOpacity
                      style={[styles.recalculateButton, { borderColor: colors.primary }]}
                      onPress={async () => {
                        console.log('[Profile] Recalculate Goals button pressed');
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
                          console.log('[Profile] Adjustment Day row pressed');
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
                        console.log('[Profile] Calorie Adjustment History row pressed');
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
              console.log('[Profile] Food Preferences row pressed');
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

          {/* ── Section D: Invite Friends & Earn XP (non-accordion row) ──── */}
          <TouchableOpacity
            style={styles.accordionHeader}
            onPress={() => {
              console.log('[Profile] Refer & Earn pressed, isAdmin:', isAdmin);
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

        {/* ── Coach Changes ────────────────────────────────────────────────── */}
        {isPremium && (
          <View style={[styles.coachHistoryCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.coachHistoryHeader}>
              <Text style={styles.coachHistoryIcon}>{'🤖'}</Text>
              <Text style={[styles.coachHistoryTitle, { color: isDark ? colors.textDark : colors.text }]}>
                {t('profile.coachChanges')}
              </Text>
            </View>

            {coachActions.length === 0 ? (
              <View style={styles.coachHistoryEmpty}>
                <IconSymbol ios_icon_name="bubble.left.fill" android_material_icon_name="chat" size={40} color={colors.textSecondary} />
                <Text style={[styles.coachHistoryEmptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {t('profile.coachNoChanges')}
                </Text>
              </View>
            ) : (
              coachActions.map((action, index) => {
                const actionIcon = getCoachActionIcon(action.action_type);
                const actionDate = formatCoachActionDate(action.proposed_at);
                const isLast = index === coachActions.length - 1;
                return (
                  <View key={action.id}>
                    <View style={styles.coachActionRow}>
                      <View style={styles.coachActionIconWrap}>
                        <IconSymbol ios_icon_name={actionIcon.ios} android_material_icon_name={actionIcon.android} size={16} color={colors.primary} />
                      </View>
                      <View style={styles.coachActionContent}>
                        <Text style={[styles.coachActionSummary, { color: isDark ? colors.textDark : colors.text }]}>
                          {action.reason ?? action.action_type}
                        </Text>
                        <Text style={[styles.coachActionDate, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          {actionDate}
                        </Text>
                      </View>
                    </View>
                    {!isLast && (
                      <View style={[styles.coachActionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' }]} />
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <View style={[styles.actionsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <BlockedAccountsSettingsEntry />
          {/* Send Feedback */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              console.log('[Profile] Send Feedback button pressed');
              const mailtoUrl = 'mailto:macrogoalapp@gmail.com?subject=MacroGoal%20App%20Feedback&body=Hi%2C%20I%27d%20like%20to%20share%20the%20following%20feedback%3A%0A%0A';
              Linking.openURL(mailtoUrl).catch((err) => {
                console.error('[Profile] Failed to open mail app:', err);
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

          {/* Community Sharing */}
          <View style={[styles.sectionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' }]} />
          <View style={styles.actionRow}>
            <View style={styles.actionRowLeft}>
              <IconSymbol
                ios_icon_name="person.2.fill"
                android_material_icon_name="group"
                size={18}
                color={colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionRowLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('localization.settings.communitySharing')}
                </Text>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: 1 }}>
                  {t('localization.settings.communitySharingDescription')}
                </Text>
              </View>
            </View>
            <Switch
              value={autoShare}
              onValueChange={async (newValue) => {
                console.log('[Profile] Community Sharing toggle pressed — new value:', newValue);
                setAutoShare(newValue);
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (!authUser) return;
                const { error } = await supabase
                  .from('users')
                  .update({ auto_share_achievements: newValue })
                  .eq('id', authUser.id);
                if (error) {
                  console.error('[Profile] Failed to update auto_share_achievements:', error);
                } else {
                  console.log('[Profile] auto_share_achievements updated to:', newValue);
                }
              }}
              trackColor={{ false: isDark ? colors.borderDark : colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Language */}
          <View style={[styles.sectionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' }]} />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              console.log('[Profile] Language selector pressed');
              const options = supportedLanguages.map(lang => ({
                text: lang.nativeLabel,
                onPress: async () => {
                  console.log('[Profile] Language changed to:', lang.code);
                  await i18n.changeLanguage(lang.code);
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
                {i18n.language?.startsWith('es') ? 'Idioma' : 'Language'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                {i18n.language?.startsWith('es') ? 'Español' : 'English'}
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
            {t('auth.logOut')}
          </Text>
        </TouchableOpacity>

        {/* Footer Links */}
        <View style={styles.footerLinksContainer}>
          <View style={styles.footerLinksRow}>
            <TouchableOpacity onPress={() => {
              console.log('[Profile] Privacy Policy link pressed');
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
              console.log('[Profile] Terms of Service link pressed');
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
              console.log('[Profile] Terms of Use (EULA) link pressed');
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
              console.log('[Profile] Delete Account link pressed');
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
                  console.log('[Profile] Disliked foods text changed');
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

      {/* ── Adjustment Day Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showAdjustmentDayModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdjustmentDayModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAdjustmentDayModal(false)}
        >
          <TouchableOpacity
            style={[styles.modalContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
            activeOpacity={1}
          >
            <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {(i18n.language.startsWith('es') ? 'Día de revisión de datos' : 'Data review day')}
            </Text>
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
                    styles.dayOptionRow,
                    { borderBottomColor: (isDark ? colors.textSecondaryDark : colors.border) + '30' },
                    isSelected && { backgroundColor: colors.primary + '15' },
                  ]}
                  onPress={async () => {
                    if (!observation.program) return;
                    try { await observation.updateSettings(observation.program.enabled, index); setShowAdjustmentDayModal(false); }
                    catch (error) { Alert.alert('Observation unavailable', error instanceof Error ? error.message : 'Unable to verify settings'); }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayOptionText, { color: isSelected ? colors.primary : (isDark ? colors.textDark : colors.text) }]}>
                    {dayName}
                  </Text>
                  {isSelected && (
                    <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background, marginTop: spacing.sm }]}
              onPress={() => setShowAdjustmentDayModal(false)}
            >
              <Text style={[styles.modalButtonText, { color: isDark ? colors.textDark : colors.text }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  // ── Coach Badge (on macro values) ────────────────────────────────────────
  coachBadge: {
    marginTop: 4,
    backgroundColor: '#EDE7F6',
    borderRadius: 10,
    paddingVertical: 2,
    paddingHorizontal: 6,
    alignSelf: 'center',
  },
  coachBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A148C',
  },
  // ── Coach History Card ────────────────────────────────────────────────────
  coachHistoryCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    elevation: 2,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  coachHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  coachHistoryIcon: {
    fontSize: 18,
  },
  coachHistoryTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  coachHistoryEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 8,
  },
  coachHistoryEmptyIcon: {
    fontSize: 28,
  },
  coachHistoryEmptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  coachActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 12,
  },
  coachActionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE7F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coachActionIcon: {
    fontSize: 16,
  },
  coachActionContent: {
    flex: 1,
    gap: 2,
  },
  coachActionSummary: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  coachActionDate: {
    fontSize: 11,
    fontWeight: '400',
  },
  coachActionDivider: {
    height: 1,
    marginLeft: 48,
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
  // ── Adaptive TDEE Settings ────────────────────────────────────────────────
  adaptiveDivider: {
    height: 1,
    marginVertical: spacing.md,
    marginHorizontal: -spacing.md,
  },
  adaptiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    minHeight: 52,
  },
  adaptiveRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  adaptiveIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  adaptiveTextStack: {
    flex: 1,
    gap: 2,
  },
  adaptiveLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  adaptiveSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  adaptiveRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  adaptiveValue: {
    fontSize: 13,
  },
  // ── Day Option Rows (in modal) ────────────────────────────────────────────
  dayOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
