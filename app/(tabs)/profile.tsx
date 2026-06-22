
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert, RefreshControl, ActivityIndicator, Modal, TextInput, Linking, LayoutAnimation } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { usePremium } from '@/hooks/usePremium';
import { cmToFeetInches, kgToLbs, getLossRateDisplayText, feetInchesToCm, lbsToKg, calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacrosWithPreset } from '@/utils/calculations';
import { toLocalDateString } from '@/utils/dateUtils';
import { Sex, ActivityLevel, GoalType } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';

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

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { isPremium, loading: premiumLoading, refreshPremiumStatus } = usePremium();

  const [user, setUser] = useState<any>(null);
  const [goal, setGoal] = useState<any>(null);
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

  const loadUserData = async () => {
    try {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[Profile] No authenticated user found');
        setLoading(false);
        return;
      }

      console.log('[Profile] Loading profile for user:', authUser.id);

      const [userResult, goalResult] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', authUser.id).eq('is_active', true).order('start_date', { ascending: false }).limit(1),
      ]);

      if (userResult.error) {
        console.error('[Profile] Error loading user data:', userResult.error);
      } else if (userResult.data) {
        console.log('[Profile] User data loaded:', userResult.data);
        setUser({ ...authUser, ...userResult.data });
        if (userResult.data.onboarding_completed && !userResult.data.goal_weight) {
          console.log('[Profile] Goal weight is missing, showing prompt');
          setShowGoalWeightPrompt(true);
        }
      } else {
        console.log('[Profile] No user data found in database');
        setUser(authUser);
      }

      if (goalResult.error) {
        console.error('[Profile] Error loading goal:', goalResult.error);
        setGoal(null);
      } else if (goalResult.data && goalResult.data.length > 0) {
        const activeGoal = goalResult.data[0];
        console.log('[Profile] Active goal loaded:', activeGoal);
        setGoal(activeGoal);
      } else {
        console.log('[Profile] No active goal found for user');
        setGoal(null);
      }
    } catch (error) {
      console.error('[Profile] Error in loadUserData:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      console.log('[Profile] Screen focused, loading data');
      loadUserData();
      refreshPremiumStatus();
    }, [refreshPremiumStatus])
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
      Alert.alert('Error', error.message || 'Failed to save food preferences');
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
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile] Logging out user');
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
    console.log('[Profile] Opening edit modal for field:', field);
    const units = user?.preferred_units || 'metric';

    switch (field) {
      case 'name':
        setEditValue(user.name || '');
        break;
      case 'height':
        if (units === 'imperial') {
          const { feet, inches } = cmToFeetInches(user.height || 170);
          setEditValue(feet.toString());
          setEditValue2(inches.toString());
        } else {
          setEditValue((user.height || 170).toString());
        }
        break;
      case 'weight':
        if (units === 'imperial') {
          setEditValue(Math.round(kgToLbs(user.current_weight || 70)).toString());
        } else {
          setEditValue((user.current_weight || 70).toString());
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
        const age = calculateAge(user.date_of_birth);
        setEditValue(age ? age.toString() : '');
        break;
      case 'lossRate':
        setEditValue((goal?.loss_rate_lbs_per_week || 1.0).toString());
        break;
    }

    setEditingField(field);
  };

  const closeEditModal = () => {
    setEditingField(null);
    setEditValue('');
    setEditValue2('');
  };

  const recalculateGoals = async (updatedUser: any, updatedGoal: any) => {
    try {
      console.log('[Profile] Recalculating goals with updated data...');

      const age = calculateAge(updatedUser.date_of_birth);
      if (!age || !updatedUser.height || !updatedUser.current_weight || !updatedUser.sex || !updatedUser.activity_level) {
        console.log('[Profile] Missing required data for calculation');
        return;
      }

      const bmr = calculateBMR(updatedUser.current_weight, updatedUser.height, age, updatedUser.sex);
      const tdee = calculateTDEE(bmr, updatedUser.activity_level);
      const targetCalories = calculateTargetCalories(
        tdee,
        updatedGoal.goal_type,
        updatedGoal.goal_type === 'lose' ? updatedGoal.loss_rate_lbs_per_week : undefined
      );

      const macros = calculateMacrosWithPreset(targetCalories, updatedUser.current_weight, 'balanced');

      console.log('[Profile] New calculations:', { bmr, tdee, targetCalories, macros });

      await supabase
        .from('goals')
        .update({ is_active: false })
        .eq('user_id', updatedUser.id)
        .eq('is_active', true);

      const newGoalData: any = {
        user_id: updatedUser.id,
        goal_type: updatedGoal.goal_type,
        goal_intensity: updatedGoal.goal_intensity || 1,
        daily_calories: targetCalories,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fats_g: macros.fats,
        fiber_g: macros.fiber,
        is_active: true,
        start_date: updatedGoal.start_date || null,
      };

      if (updatedGoal.goal_type === 'lose') {
        newGoalData.loss_rate_lbs_per_week = updatedGoal.loss_rate_lbs_per_week;
      }

      const { error: goalError } = await supabase
        .from('goals')
        .insert(newGoalData);

      if (goalError) throw goalError;

      console.log('[Profile] Goals recalculated and updated');

      await loadUserData();
    } catch (error) {
      console.error('[Profile] Error recalculating goals:', error);
      throw error;
    }
  };

  /**
   * Save a field directly with explicit values — bypasses stale state.
   * Use this when calling from Alert callbacks where setState hasn't flushed yet.
   */
  const saveFieldDirectly = async (field: EditField, value: string) => {
    if (!user || !field) return;
    console.log('[Profile] saveFieldDirectly:', field, value);

    setSaving(true);
    try {
      let updateData: any = {};
      let needsRecalculation = false;

      switch (field) {
        case 'sex':
          updateData.sex = value as Sex;
          needsRecalculation = true;
          break;
        case 'activity':
          updateData.activity_level = value as ActivityLevel;
          needsRecalculation = true;
          break;
        default:
          return;
      }

      updateData.updated_at = new Date().toISOString();

      console.log('[Profile] Saving to Supabase:', updateData);
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      // Optimistic update — apply immediately so UI reflects the change
      const updatedUser = { ...user, ...updateData };
      setUser(updatedUser);

      console.log('[Profile] User data updated:', updateData);

      if (needsRecalculation && goal) {
        await recalculateGoals(updatedUser, goal);
      } else {
        await loadUserData();
      }
    } catch (error: any) {
      console.error('[Profile] Error in saveFieldDirectly:', error);
      Alert.alert('Error', error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const saveEditedField = async () => {
    if (!user || !editingField) return;
    console.log('[Profile] Save button pressed for field:', editingField);

    setSaving(true);
    try {
      const units = user.preferred_units || 'metric';
      let updateData: any = {};
      let needsRecalculation = false;

      switch (editingField) {
        case 'name':
          updateData.name = editValue.trim();
          break;

        case 'height':
          let heightCm: number;
          if (units === 'imperial') {
            const feet = parseInt(editValue) || 0;
            const inches = parseInt(editValue2) || 0;
            heightCm = feetInchesToCm(feet, inches);
          } else {
            heightCm = parseFloat(editValue) || 0;
          }
          updateData.height = heightCm;
          needsRecalculation = true;
          break;

        case 'weight':
          let weightKg: number;
          if (units === 'imperial') {
            weightKg = lbsToKg(parseFloat(editValue) || 0);
          } else {
            weightKg = parseFloat(editValue) || 0;
          }
          updateData.current_weight = weightKg;
          needsRecalculation = true;
          break;

        case 'goalWeight':
          let goalWeightKg: number | null = null;
          if (editValue) {
            if (units === 'imperial') {
              goalWeightKg = lbsToKg(parseFloat(editValue));
            } else {
              goalWeightKg = parseFloat(editValue);
            }
          }
          updateData.goal_weight = goalWeightKg;
          setShowGoalWeightPrompt(false);
          break;

        case 'age':
          const newAge = parseInt(editValue) || 0;
          const today = new Date();
          const birthYear = today.getFullYear() - newAge;
          const dob = `${birthYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          updateData.date_of_birth = dob;
          needsRecalculation = true;
          break;

        case 'sex':
          updateData.sex = editValue as Sex;
          needsRecalculation = true;
          break;

        case 'activity':
          updateData.activity_level = editValue as ActivityLevel;
          needsRecalculation = true;
          break;

        case 'lossRate':
          if (goal) {
            const newLossRate = parseFloat(editValue) || 1.0;
            const updatedGoal = { ...goal, loss_rate_lbs_per_week: newLossRate };
            const updatedUser = { ...user, ...updateData };
            await recalculateGoals(updatedUser, updatedGoal);
            closeEditModal();
            setSaving(false);
            return;
          }
          break;
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updated_at = new Date().toISOString();

        console.log('[Profile] Saving to Supabase:', updateData);
        const { error } = await supabase
          .from('users')
          .update(updateData)
          .eq('id', user.id);

        if (error) throw error;

        // Optimistic update — apply immediately so the first save always reflects correctly
        const updatedUser = { ...user, ...updateData };
        setUser(updatedUser);

        console.log('[Profile] User data updated:', updateData);

        if (needsRecalculation && goal) {
          await recalculateGoals(updatedUser, goal);
        } else {
          await loadUserData();
        }
      }

      closeEditModal();
    } catch (error: any) {
      console.error('[Profile] Error saving field:', error);
      Alert.alert('Error', error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleStartDateChange = async (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (date && goal) {
      setSelectedDate(date);

      if (Platform.OS === 'ios') {
        return;
      }

      await saveStartDate(date);
    }
  };

  const saveStartDate = async (date: Date) => {
    try {
      setSaving(true);
      const dateString = toLocalDateString(date);

      console.log('[Profile] Saving Journey Start Date:', dateString);

      const { error } = await supabase
        .from('goals')
        .update({ start_date: dateString, updated_at: new Date().toISOString() })
        .eq('id', goal.id);

      if (error) throw error;

      console.log('[Profile] Journey Start Date saved successfully:', dateString);

      await loadUserData();

      if (Platform.OS === 'ios') {
        setShowDatePicker(false);
      }

      Alert.alert('Success', 'Journey Start Date updated successfully');
    } catch (error: any) {
      console.error('[Profile] Error saving start date:', error);
      Alert.alert('Error', error.message || 'Failed to save start date');
    } finally {
      setSaving(false);
    }
  };

  const openStartDatePicker = () => {
    console.log('[Profile] Journey Start Date picker opened');
    if (!goal) {
      Alert.alert('No Goal', 'Please set up your goals first');
      return;
    }

    if (goal.start_date) {
      const storedDate = new Date(goal.start_date + 'T00:00:00');
      setSelectedDate(storedDate);
    } else if (user?.created_at) {
      const createdDate = new Date(user.created_at);
      createdDate.setHours(0, 0, 0, 0);
      setSelectedDate(createdDate);
    } else {
      setSelectedDate(new Date());
    }
    setShowDatePicker(true);
  };

  const handleGoalWeightPromptSave = async () => {
    if (!editValue) {
      Alert.alert('Required', 'Please enter your goal weight');
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
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (error) {
      console.error('[Profile] Error formatting date:', error);
      return 'Set Date';
    }
  };

  if (loading || premiumLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading profile...
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
            No user data available
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/auth/welcome')}
          >
            <Text style={styles.buttonText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const units = user.preferred_units || 'metric';
  const age = calculateAge(user.date_of_birth);

  const subscriptionStatusText = isPremium ? 'Premium' : 'Free';
  console.log('[Profile] Displaying subscription status:', subscriptionStatusText, '(isPremium:', isPremium, ')');

  const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free'];

  const proteinCount = foodPrefs.protein_preferences.length;
  const recipeStyleCount = foodPrefs.recipe_styles.length;
  const hasAnyPrefs = proteinCount > 0 || recipeStyleCount > 0;
  const foodPrefsSummaryParts: string[] = [];
  if (hasAnyPrefs) {
    if (proteinCount > 0) foodPrefsSummaryParts.push(`🥩 ${proteinCount} protein${proteinCount !== 1 ? 's' : ''}`);
    if (recipeStyleCount > 0) foodPrefsSummaryParts.push(`🍳 ${recipeStyleCount} style${recipeStyleCount !== 1 ? 's' : ''}`);
  }
  const foodPrefsSummary = foodPrefsSummaryParts.length > 0 ? foodPrefsSummaryParts.join(' · ') : 'No preferences set';

  const sexDisplayValue = user.sex === 'male' ? 'Male' : user.sex === 'female' ? 'Female' : user.sex ? 'Other' : 'Tap to set';
  const activityDisplayValue = user.activity_level
    ? user.activity_level.charAt(0).toUpperCase() + user.activity_level.slice(1).replace('_', ' ')
    : 'Tap to set';
  const unitsDisplayValue = units === 'imperial' ? 'Imperial' : 'Metric';
  const goalTypeDisplayValue = goal?.goal_type === 'lose' ? '📉 Lose Weight' : goal?.goal_type === 'gain' ? '📈 Gain Weight' : goal?.goal_type === 'maintain' ? '⚖️ Maintain' : 'Tap to set';
  const journeyStartDisplay = goal ? formatJourneyStartDate(goal.start_date, user.created_at) : 'No goal set';

  const isProfileOpen = openSection === 'profile';
  const isGoalOpen = openSection === 'goal';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
          Profile
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── Avatar Card ─────────────────────────────────────────────────── */}
        <View style={[styles.profileCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {user.name ? user.name.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>

          <Text style={[styles.userName, { color: isDark ? colors.textDark : colors.text }]}>
            {user.name || 'User'}
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
                Set @username
              </Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.subscriptionStatus, { color: isPremium ? colors.primary : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
            {subscriptionStatusText}
          </Text>

          <Text style={[styles.email, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {user.email || 'Guest User'}
          </Text>

          {user.challenger_badge && (
            <View style={styles.badgeRow}>
              <View style={styles.challengerBadgePill}>
                <Text style={styles.badgeIcon}>{'🏅'}</Text>
                <Text style={styles.badgeLabel}>{'Challenger'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Upgrade to Premium ──────────────────────────────────────────── */}
        {!isPremium && !premiumLoading && (
          <TouchableOpacity
            onPress={() => {
              console.log('[Profile] Upgrade to Premium button pressed');
              router.push('/subscription');
            }}
            activeOpacity={0.85}
            style={{
              marginBottom: spacing.md,
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: '#0d0d0d',
              borderWidth: 1,
              borderColor: '#c9a84c',
            }}
          >
            <View style={{ padding: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={12} color="#c9a84c" />
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#c9a84c', textTransform: 'uppercase' }}>
                  Macro Goal Premium
                </Text>
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 4 }}>
                Unlock your full potential
              </Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 16, lineHeight: 18 }}>
                AI meal planning, advanced analytics, unlimited tracking & more
              </Text>
              <View style={{
                alignSelf: 'flex-start',
                backgroundColor: '#c9a84c',
                borderRadius: 10,
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#000', letterSpacing: 0.3 }}>
                  Upgrade Now
                </Text>
              </View>
            </View>
          </TouchableOpacity>
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
                  My Profile
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
                  label="Name"
                  value={user.name || 'Tap to set your name'}
                  onPress={() => openEditModal('name')}
                  isDark={isDark}
                  highlight={!user.name}
                />
                <EditableSettingItem
                  label="Username"
                  value={user.username ? `@${user.username}` : 'Set username'}
                  onPress={() => {
                    console.log('[Profile] Username row tapped');
                    router.push('/choose-username');
                  }}
                  isDark={isDark}
                  highlight={!user.username}
                />
                <EditableSettingItem
                  label="Age"
                  value={age ? `${age} years` : 'Tap to set'}
                  onPress={() => openEditModal('age')}
                  isDark={isDark}
                  highlight={!age}
                />
                <EditableSettingItem
                  label="Sex"
                  value={sexDisplayValue}
                  onPress={() => {
                    console.log('[Profile] Sex field tapped');
                    Alert.alert(
                      'Select Sex',
                      '',
                      [
                        {
                          text: 'Male',
                          onPress: () => {
                            console.log('[Profile] Sex changed to male');
                            saveFieldDirectly('sex', 'male');
                          },
                        },
                        {
                          text: 'Female',
                          onPress: () => {
                            console.log('[Profile] Sex changed to female');
                            saveFieldDirectly('sex', 'female');
                          },
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  }}
                  isDark={isDark}
                  highlight={!user.sex}
                />
                <EditableSettingItem
                  label="Height"
                  value={user.height ? formatHeight(user.height, units) : 'Tap to set'}
                  onPress={() => openEditModal('height')}
                  isDark={isDark}
                  highlight={!user.height}
                />
                <EditableSettingItem
                  label="Weight"
                  value={user.current_weight ? formatWeight(user.current_weight, units) : 'Tap to set'}
                  onPress={() => openEditModal('weight')}
                  isDark={isDark}
                  highlight={!user.current_weight}
                />
                <EditableSettingItem
                  label="Goal Weight"
                  value={user.goal_weight ? formatWeight(user.goal_weight, units) : 'Tap to set goal weight'}
                  onPress={() => openEditModal('goalWeight')}
                  isDark={isDark}
                  highlight={!user.goal_weight}
                />
                <EditableSettingItem
                  label="Units"
                  value={unitsDisplayValue}
                  onPress={() => {
                    console.log('[Profile] Units field tapped');
                    Alert.alert(
                      'Select Units',
                      '',
                      [
                        {
                          text: 'Metric (kg, cm)',
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
                              Alert.alert('Error', err.message || 'Failed to save units');
                            }
                          },
                        },
                        {
                          text: 'Imperial (lbs, ft/in)',
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
                              Alert.alert('Error', err.message || 'Failed to save units');
                            }
                          },
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  }}
                  isDark={isDark}
                />
                <EditableSettingItem
                  label="Activity Level"
                  value={activityDisplayValue}
                  onPress={() => {
                    console.log('[Profile] Activity level field tapped');
                    Alert.alert(
                      'Select Activity Level',
                      '',
                      [
                        {
                          text: 'Sedentary',
                          onPress: () => {
                            console.log('[Profile] Activity level changed to sedentary');
                            saveFieldDirectly('activity', 'sedentary');
                          },
                        },
                        {
                          text: 'Light',
                          onPress: () => {
                            console.log('[Profile] Activity level changed to light');
                            saveFieldDirectly('activity', 'light');
                          },
                        },
                        {
                          text: 'Moderate',
                          onPress: () => {
                            console.log('[Profile] Activity level changed to moderate');
                            saveFieldDirectly('activity', 'moderate');
                          },
                        },
                        {
                          text: 'Very Active',
                          onPress: () => {
                            console.log('[Profile] Activity level changed to very_active');
                            saveFieldDirectly('activity', 'very_active');
                          },
                        },
                        { text: 'Cancel', style: 'cancel' },
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
                  My Goal
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
                      label="Goal"
                      value={goalTypeDisplayValue}
                      onPress={() => {
                        console.log('[Profile] Goal type field tapped');
                        Alert.alert(
                          'Select Goal',
                          '',
                          [
                            {
                              text: '📉 Lose Weight',
                              onPress: () => {
                                console.log('[Profile] Goal type changed to lose');
                                if (goal) {
                                  recalculateGoals(user, { ...goal, goal_type: 'lose', loss_rate_lbs_per_week: goal?.loss_rate_lbs_per_week || 1.0 });
                                }
                              },
                            },
                            {
                              text: '⚖️ Maintain',
                              onPress: () => {
                                console.log('[Profile] Goal type changed to maintain');
                                if (goal) {
                                  recalculateGoals(user, { ...goal, goal_type: 'maintain' });
                                }
                              },
                            },
                            {
                              text: '📈 Gain Weight',
                              onPress: () => {
                                console.log('[Profile] Goal type changed to gain');
                                if (goal) {
                                  recalculateGoals(user, { ...goal, goal_type: 'gain' });
                                }
                              },
                            },
                            { text: 'Cancel', style: 'cancel' },
                          ]
                        );
                      }}
                      isDark={isDark}
                      highlight={!goal?.goal_type}
                    />

                    {/* Loss Rate — only if goal_type === 'lose' */}
                    {goal?.goal_type === 'lose' && (
                      <EditableSettingItem
                        label="Loss Rate"
                        value={goal?.loss_rate_lbs_per_week ? getLossRateDisplayText(goal.loss_rate_lbs_per_week) : 'Tap to set'}
                        onPress={() => openEditModal('lossRate')}
                        isDark={isDark}
                      />
                    )}

                    {/* Journey Start */}
                    <EditableSettingItem
                      label="Journey Start"
                      value={journeyStartDisplay}
                      onPress={() => {
                        console.log('[Profile] Journey Start Date row tapped');
                        openStartDatePicker();
                      }}
                      isDark={isDark}
                    />

                    {/* Daily Targets */}
                    {goal && (
                      <View style={styles.dailyTargetsSection}>
                        <Text style={[styles.dailyTargetsTitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          Daily Targets
                        </Text>
                        <View style={styles.goalsRow}>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              Calories
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.daily_calories}
                            </Text>
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              Protein
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.protein_g}
                              {'g'}
                            </Text>
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              Carbs
                            </Text>
                            <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                              {goal.carbs_g}
                              {'g'}
                            </Text>
                          </View>
                          <View style={styles.goalItemCompact}>
                            <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                              Fats
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
                      onPress={() => {
                        console.log('[Profile] Recalculate Goals button pressed');
                        handleEditGoals();
                      }}
                    >
                      <IconSymbol
                        ios_icon_name="arrow.clockwise"
                        android_material_icon_name="refresh"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={[styles.recalculateButtonText, { color: colors.primary }]}>
                        Recalculate Goals
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.noGoalContainer}>
                    <Text style={[styles.noGoalText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Complete onboarding to set your nutrition goals
                    </Text>
                    <TouchableOpacity
                      style={[styles.editButton, { backgroundColor: colors.primary }]}
                      onPress={handleEditGoals}
                    >
                      <Text style={styles.editButtonText}>Set Up Goals</Text>
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
                  Food Preferences
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
              console.log('[Profile] Invite Friends & Earn XP pressed');
              router.push('/referrals');
            }}
            activeOpacity={0.7}
          >
            <View style={styles.accordionHeaderLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol ios_icon_name="person.2" android_material_icon_name="group" size={18} color={isDark ? '#aaa' : '#666'} />
                <Text style={[styles.accordionHeaderTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Invite Friends & Earn XP
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
          {/* Notifications */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              console.log('[Profile] Notifications row pressed');
              router.push('/notification-preferences');
            }}
            activeOpacity={0.7}
          >
            <View style={styles.actionRowLeft}>
              <IconSymbol
                ios_icon_name="bell.fill"
                android_material_icon_name="notifications"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.actionRowLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Notifications
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={16}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>

          <View style={[styles.actionDivider, { backgroundColor: (isDark ? colors.textSecondaryDark : colors.border) + '20' }]} />

          {/* Send Feedback */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              console.log('[Profile] Send Feedback button pressed');
              const mailtoUrl = 'mailto:macrogoalapp@gmail.com?subject=MacroGoal%20App%20Feedback&body=Hi%2C%20I%27d%20like%20to%20share%20the%20following%20feedback%3A%0A%0A';
              Linking.openURL(mailtoUrl).catch((err) => {
                console.error('[Profile] Failed to open mail app:', err);
                Alert.alert('Error', 'Could not open the mail app. Please email us at macrogoalapp@gmail.com');
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
                Send Feedback
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={16}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Log Out */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: colors.error }]}
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>
            Log Out
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
                Privacy Policy
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
                Terms of Service
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
                Terms of Use (EULA)
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
                Delete Account
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

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
              {editingField === 'name' && 'Edit Name'}
              {editingField === 'height' && 'Edit Height'}
              {editingField === 'weight' && 'Edit Current Weight'}
              {editingField === 'goalWeight' && 'Edit Goal Weight'}
              {editingField === 'age' && 'Edit Age'}
              {editingField === 'lossRate' && 'Edit Weight Loss Rate'}
            </Text>

            {editingField === 'height' && units === 'imperial' ? (
              <View style={styles.dualInputRow}>
                <View style={styles.dualInputContainer}>
                  <Text style={[styles.inputLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Feet
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
                    Inches
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
                  editingField === 'name' ? 'Your first name' :
                  editingField === 'height' ? (units === 'imperial' ? 'inches' : 'cm') :
                  editingField === 'weight' || editingField === 'goalWeight' ? (units === 'imperial' ? 'lbs' : 'kg') :
                  editingField === 'age' ? 'years' :
                  editingField === 'lossRate' ? 'lbs per week' : ''
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
                  Cancel
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
                    Save
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
                What is your goal weight?
              </Text>
              <Text style={[styles.promptSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Setting a goal weight helps track your progress
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
                  Skip for now
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
                    Save
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
                Food Preferences
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

            <ScrollView showsVerticalScrollIndicator={false} style={styles.foodPrefsScroll}>
              {/* Dietary Restrictions */}
              <Text style={[styles.foodPrefsSectionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Dietary Restrictions
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
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Protein Preferences */}
              <Text style={[styles.foodPrefsSectionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                🥩 Protein Preferences
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
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Disliked Foods */}
              <Text style={[styles.foodPrefsSectionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Disliked Foods
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
                placeholder="e.g. mushrooms, cilantro"
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                multiline
              />

              {/* Recipe Style */}
              <Text style={[styles.foodPrefsSectionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                What type of recipe fits your lifestyle best?
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
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.foodPrefsSaveButton, { backgroundColor: colors.primary }]}
              onPress={saveFoodPrefs}
              disabled={savingFoodPrefs}
            >
              {savingFoodPrefs ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.foodPrefsSaveButtonText}>Save Preferences</Text>
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
            onRequestClose={() => setShowDatePicker(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            >
              <TouchableOpacity
                style={[styles.datePickerModal, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
                activeOpacity={1}
              >
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={[styles.datePickerButton, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.datePickerTitle, { color: isDark ? colors.textDark : colors.text }]}>
                    Select Start Date
                  </Text>
                  <TouchableOpacity onPress={() => saveStartDate(selectedDate)} disabled={saving}>
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.datePickerButton, { color: colors.primary }]}>
                        Done
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
                <DateTimePicker
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
    elevation: 2,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
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
