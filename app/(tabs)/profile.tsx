
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert, RefreshControl, ActivityIndicator, Modal, TextInput, Linking, Animated } from 'react-native';
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

const TEAL = '#14B8A6';

const DIETARY_RESTRICTION_OPTIONS = [
  { label: 'Vegetarian', value: 'vegetarian' },
  { label: 'Vegan', value: 'vegan' },
  { label: 'Gluten-Free', value: 'gluten-free' },
  { label: 'Dairy-Free', value: 'dairy-free' },
  { label: 'Halal', value: 'halal' },
  { label: 'Nut-Free', value: 'nut-free' },
];

const PROTEIN_OPTIONS = ['Chicken', 'Turkey', 'Beef', 'Pork', 'Salmon', 'Tuna', 'Shrimp', 'Cod', 'Tilapia', 'Eggs', 'Greek Yogurt', 'Cottage Cheese', 'Whey Protein', 'Tofu', 'Tempeh', 'Edamame', 'Lentils', 'Chickpeas', 'Black Beans'];
const CARB_OPTIONS = ['White Rice', 'Brown Rice', 'Oats', 'Sweet Potato', 'Quinoa', 'Whole Wheat Bread', 'Pasta', 'Tortillas', 'Potatoes', 'Fruits', 'Vegetables', 'Beans'];
const FAT_OPTIONS = ['Avocado', 'Olive Oil', 'Almonds', 'Walnuts', 'Cashews', 'Peanut Butter', 'Almond Butter', 'Chia Seeds', 'Flaxseeds', 'Coconut Oil', 'Cheese'];

const COOKING_LEVELS = [
  { label: 'Simple', value: 'simple' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Advanced', value: 'advanced' },
];

type EditField = 'name' | 'height' | 'weight' | 'goalWeight' | 'age' | 'sex' | 'activity' | 'lossRate' | 'startDate' | null;

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const { isPremium, loading: premiumLoading, refreshPremiumStatus } = usePremium();

  const [user, setUser] = useState<any>(null);
  const [goal, setGoal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [proteinPreferences, setProteinPreferences] = useState<string[]>([]);
  const [carbPreferences, setCarbPreferences] = useState<string[]>([]);
  const [fatPreferences, setFatPreferences] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState('');
  const [cookingLevel, setCookingLevel] = useState<string | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const prefsSaveOpacity = useRef(new Animated.Value(0)).current;

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
        // Initialize food preferences from DB
        setDietaryRestrictions(Array.isArray(userResult.data.dietary_restrictions) ? userResult.data.dietary_restrictions : []);
        setProteinPreferences(Array.isArray(userResult.data.protein_preferences) ? userResult.data.protein_preferences : []);
        setCarbPreferences(Array.isArray(userResult.data.carb_preferences) ? userResult.data.carb_preferences : []);
        setFatPreferences(Array.isArray(userResult.data.fat_preferences) ? userResult.data.fat_preferences : []);
        setDislikedFoods(userResult.data.disliked_foods || '');
        setCookingLevel(userResult.data.cooking_level || null);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadUserData(), refreshPremiumStatus()]);
  };

  const showPrefsSavedIndicator = () => {
    Animated.sequence([
      Animated.timing(prefsSaveOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(prefsSaveOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const saveFoodPrefsField = async (field: string, value: any) => {
    if (!user) return;
    console.log('[Profile] Saving food preference field:', field, value);
    try {
      const { error } = await supabase
        .from('users')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      console.log('[Profile] Food preference saved:', field, value);
      showPrefsSavedIndicator();
    } catch (err: any) {
      console.error('[Profile] Error saving food preference:', field, err);
    }
  };

  const toggleDietaryRestriction = async (value: string) => {
    console.log('[Profile] Dietary restriction chip tapped:', value);
    const next = dietaryRestrictions.includes(value)
      ? dietaryRestrictions.filter(v => v !== value)
      : [...dietaryRestrictions, value];
    setDietaryRestrictions(next);
    await saveFoodPrefsField('dietary_restrictions', next);
  };

  const toggleProteinPreference = async (value: string) => {
    console.log('[Profile] Protein preference chip tapped:', value);
    const next = proteinPreferences.includes(value)
      ? proteinPreferences.filter(v => v !== value)
      : [...proteinPreferences, value];
    setProteinPreferences(next);
    await saveFoodPrefsField('protein_preferences', next);
  };

  const toggleCarbPreference = async (value: string) => {
    console.log('[Profile] Carb preference chip tapped:', value);
    const next = carbPreferences.includes(value)
      ? carbPreferences.filter(v => v !== value)
      : [...carbPreferences, value];
    setCarbPreferences(next);
    await saveFoodPrefsField('carb_preferences', next);
  };

  const toggleFatPreference = async (value: string) => {
    console.log('[Profile] Fat preference chip tapped:', value);
    const next = fatPreferences.includes(value)
      ? fatPreferences.filter(v => v !== value)
      : [...fatPreferences, value];
    setFatPreferences(next);
    await saveFoodPrefsField('fat_preferences', next);
  };

  const handleCookingLevelSelect = async (value: string) => {
    console.log('[Profile] Cooking level selected:', value);
    setCookingLevel(value);
    await saveFoodPrefsField('cooking_level', value);
  };

  const handleDislikedFoodsBlur = async () => {
    console.log('[Profile] Disliked foods field blurred, saving:', dislikedFoods);
    await saveFoodPrefsField('disliked_foods', dislikedFoods);
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
      const units = user.preferred_units || 'metric';
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
      const dateString = date.toISOString().split('T')[0];
      
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

  const formatJourneyStartDate = (dateStr: string | null) => {
    if (!dateStr) return 'Set Date';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (error) {
      console.error('[Profile] Error formatting date:', error);
      return 'Set Date';
    }
  };

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
        <View style={[styles.profileCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {user.name ? user.name.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          
          <Text style={[styles.userName, { color: isDark ? colors.textDark : colors.text }]}>
            {user.name || 'User'}
          </Text>
          
          <Text style={[styles.subscriptionStatus, { color: isPremium ? colors.primary : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
            {subscriptionStatusText}
          </Text>
          
          <Text style={[styles.email, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {user.email || 'Guest User'}
          </Text>
        </View>

        {/* Subscription Card */}
        {!isPremium && (
          <TouchableOpacity
            style={[styles.subscriptionCard, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[Profile] Upgrade to Premium button pressed');
              router.push('/subscription');
            }}
          >
            <View style={styles.subscriptionContent}>
              <View style={styles.subscriptionIcon}>
                <IconSymbol
                  ios_icon_name="star.fill"
                  android_material_icon_name="star"
                  size={32}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.subscriptionText}>
                <Text style={styles.subscriptionTitle}>Upgrade to Premium</Text>
                <Text style={styles.subscriptionSubtitle}>
                  Unlock advanced analytics, custom recipes, and more
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="arrow-forward"
                size={20}
                color="#FFFFFF"
              />
            </View>
          </TouchableOpacity>
        )}

        {/* Calorie & Goals Settings Card */}
        {user.onboarding_completed && (
          <View style={[styles.goalsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text, marginBottom: 0 }]}>
                Calorie & Goals Settings
              </Text>
              <TouchableOpacity onPress={handleEditGoals}>
                <Text style={[styles.advancedLink, { color: colors.primary }]}>
                  Advanced
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sectionSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Edit any value to recalculate your daily targets
            </Text>

            {/* Editable Fields */}
            <View style={styles.settingsGrid}>
              <EditableSettingItem
                label="Name"
                value={user.name || 'Tap to set your name'}
                onPress={() => openEditModal('name')}
                isDark={isDark}
                highlight={!user.name}
              />
              {user.height && (
                <EditableSettingItem
                  label="Height"
                  value={formatHeight(user.height, units)}
                  onPress={() => openEditModal('height')}
                  isDark={isDark}
                />
              )}
              {user.current_weight && (
                <EditableSettingItem
                  label="Current Weight"
                  value={formatWeight(user.current_weight, units)}
                  onPress={() => openEditModal('weight')}
                  isDark={isDark}
                />
              )}
              <EditableSettingItem
                label="Goal Weight"
                value={user.goal_weight ? formatWeight(user.goal_weight, units) : 'Tap to set your goal weight'}
                onPress={() => openEditModal('goalWeight')}
                isDark={isDark}
                highlight={!user.goal_weight}
              />
              {age && (
                <EditableSettingItem
                  label="Age"
                  value={`${age} years`}
                  onPress={() => openEditModal('age')}
                  isDark={isDark}
                />
              )}
              {user.sex && (
                <EditableSettingItem
                  label="Sex"
                  value={user.sex === 'male' ? 'Male' : user.sex === 'female' ? 'Female' : 'Other'}
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
                />
              )}
              {user.activity_level && (
                <EditableSettingItem
                  label="Activity Level"
                  value={user.activity_level.charAt(0).toUpperCase() + user.activity_level.slice(1).replace('_', ' ')}
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
                />
              )}
              {goal?.goal_type === 'lose' && goal?.loss_rate_lbs_per_week && (
                <EditableSettingItem
                  label="Weight Loss Rate"
                  value={getLossRateDisplayText(goal.loss_rate_lbs_per_week)}
                  onPress={() => openEditModal('lossRate')}
                  isDark={isDark}
                />
              )}
            </View>

            {/* Current Goals Display */}
            {goal && (
              <View style={styles.currentGoalsSection}>
                <Text style={[styles.currentGoalsTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Current Daily Targets
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
                      {goal.protein_g}g
                    </Text>
                  </View>
                  <View style={styles.goalItemCompact}>
                    <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Carbs
                    </Text>
                    <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                      {goal.carbs_g}g
                    </Text>
                  </View>
                  <View style={styles.goalItemCompact}>
                    <Text style={[styles.goalLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Fats
                    </Text>
                    <Text style={[styles.goalValueCompact, { color: isDark ? colors.textDark : colors.text }]}>
                      {goal.fats_g}g
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Start Date */}
            {goal && (
              <View style={styles.startDateSection}>
                <View style={styles.startDateHeader}>
                  <Text style={[styles.startDateLabel, { color: isDark ? colors.textDark : colors.text }]}>
                    Journey Start Date
                  </Text>
                  <TouchableOpacity onPress={openStartDatePicker} style={styles.dateButton}>
                    <Text style={[styles.dateButtonText, { color: colors.primary }]}>
                      {formatJourneyStartDate(goal.start_date)}
                    </Text>
                    <IconSymbol
                      ios_icon_name="calendar"
                      android_material_icon_name="event"
                      size={16}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.startDateHelper, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Track your progress from this date
                </Text>
              </View>
            )}
          </View>
        )}

        {!user.onboarding_completed && (
          <View style={[styles.goalsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              No Goals Set
            </Text>
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

        {/* Food Preferences Card */}
        {!!user && (
          <View style={[styles.goalsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.prefCardHeader}>
              <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text, marginBottom: 0 }]}>
                Food Preferences
              </Text>
              <Animated.View style={[styles.savedBadge, { opacity: prefsSaveOpacity }]}>
                <Text style={styles.savedBadgeText}>Saved ✓</Text>
              </Animated.View>
            </View>
            <Text style={[styles.sectionSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginBottom: spacing.lg }]}>
              Used by the AI Meal Planner to personalize your plans
            </Text>

            {/* Dietary Restrictions */}
            <Text style={[styles.prefSectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              DIETARY RESTRICTIONS
            </Text>
            <View style={styles.chipsRow}>
              {DIETARY_RESTRICTION_OPTIONS.map(opt => {
                const isSelected = dietaryRestrictions.includes(opt.value);
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.chip,
                      isSelected
                        ? { backgroundColor: TEAL }
                        : { backgroundColor: isDark ? '#2C2C2E' : '#F0F2F7' },
                    ]}
                    onPress={() => toggleDietaryRestriction(opt.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Protein Preferences */}
            <Text style={[styles.prefSectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              🥩 PROTEIN PREFERENCES
            </Text>
            <View style={styles.chipsRow}>
              {PROTEIN_OPTIONS.map(item => {
                const isSelected = proteinPreferences.includes(item);
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.chip,
                      isSelected
                        ? { backgroundColor: TEAL }
                        : { backgroundColor: isDark ? '#2C2C2E' : '#F0F2F7' },
                    ]}
                    onPress={() => toggleProteinPreference(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Carb Preferences */}
            <Text style={[styles.prefSectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              🌾 CARB PREFERENCES
            </Text>
            <View style={styles.chipsRow}>
              {CARB_OPTIONS.map(item => {
                const isSelected = carbPreferences.includes(item);
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.chip,
                      isSelected
                        ? { backgroundColor: TEAL }
                        : { backgroundColor: isDark ? '#2C2C2E' : '#F0F2F7' },
                    ]}
                    onPress={() => toggleCarbPreference(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Fat Preferences */}
            <Text style={[styles.prefSectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              🥑 FAT PREFERENCES
            </Text>
            <View style={styles.chipsRow}>
              {FAT_OPTIONS.map(item => {
                const isSelected = fatPreferences.includes(item);
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.chip,
                      isSelected
                        ? { backgroundColor: TEAL }
                        : { backgroundColor: isDark ? '#2C2C2E' : '#F0F2F7' },
                    ]}
                    onPress={() => toggleFatPreference(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Foods I Dislike */}
            <Text style={[styles.prefSectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              FOODS I DISLIKE
            </Text>
            <TextInput
              style={[
                styles.prefTextInput,
                {
                  backgroundColor: isDark ? '#2C2C2E' : '#F5F5F5',
                  color: isDark ? colors.textDark : colors.text,
                  borderColor: isDark ? colors.borderDark : colors.border,
                },
              ]}
              value={dislikedFoods}
              onChangeText={setDislikedFoods}
              onBlur={handleDislikedFoodsBlur}
              placeholder="e.g. fish, broccoli, mushrooms"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              returnKeyType="done"
            />

            {/* Cooking Level */}
            <Text style={[styles.prefSectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              COOKING LEVEL
            </Text>
            <View style={styles.segmentedRow}>
              {COOKING_LEVELS.map((lvl, idx) => {
                const isSelected = cookingLevel === lvl.value;
                const isFirst = idx === 0;
                const isLast = idx === COOKING_LEVELS.length - 1;
                return (
                  <TouchableOpacity
                    key={lvl.value}
                    style={[
                      styles.segmentBtn,
                      isFirst && styles.segmentBtnFirst,
                      isLast && styles.segmentBtnLast,
                      isSelected
                        ? { backgroundColor: TEAL, borderColor: TEAL }
                        : { backgroundColor: isDark ? '#2C2C2E' : '#F0F2F7', borderColor: isDark ? colors.borderDark : colors.border },
                    ]}
                    onPress={() => handleCookingLevelSelect(lvl.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.segmentBtnText, { color: isSelected ? '#FFFFFF' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
                      {lvl.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Feedback Section */}
        <TouchableOpacity
          style={[styles.feedbackCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
          onPress={() => {
            console.log('[Profile] Send Feedback button pressed');
            const mailtoUrl = 'mailto:macrogoalapp@gmail.com?subject=MacroGoal%20App%20Feedback&body=Hi%2C%20I%27d%20like%20to%20share%20the%20following%20feedback%3A%0A%0A';
            Linking.openURL(mailtoUrl).catch((err) => {
              console.error('[Profile] Failed to open mail app:', err);
              Alert.alert('Error', 'Could not open the mail app. Please email us at macrogoalapp@gmail.com');
            });
          }}
        >
          <View style={styles.feedbackRow}>
            <Text style={[styles.feedbackRowLabel, { color: isDark ? colors.textDark : colors.text }]}>
              Send Feedback
            </Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={16}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </View>
        </TouchableOpacity>

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
            <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
              <Text style={[styles.footerLink, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Privacy Policy
              </Text>
            </TouchableOpacity>
            <Text style={[styles.footerSeparator, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {' · '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/terms-of-service')}>
              <Text style={[styles.footerLink, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Terms of Service
              </Text>
            </TouchableOpacity>
            <Text style={[styles.footerSeparator, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {' · '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/terms-of-use-eula')}>
              <Text style={[styles.footerLink, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Terms of Use (EULA)
              </Text>
            </TouchableOpacity>
            <Text style={[styles.footerSeparator, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {' · '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/delete-account')}>
              <Text style={[styles.footerLink, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Delete Account
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Edit Modal */}
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

      {/* Goal Weight Prompt Modal */}
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

      {/* Date Picker */}
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
  profileCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
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
  goalsCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  sectionSubtitle: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  advancedLink: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  settingsGrid: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
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
  currentGoalsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border + '20',
  },
  currentGoalsTitle: {
    ...typography.bodyBold,
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
  startDateSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border + '20',
  },
  startDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  startDateLabel: {
    ...typography.bodyBold,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  dateButtonText: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  startDateHelper: {
    ...typography.caption,
  },
  noGoalText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  editButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  feedbackCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  feedbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  feedbackRowLabel: {
    ...typography.body,
  },
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

  // Food Preferences card
  prefCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  savedBadge: {
    backgroundColor: TEAL + '22',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  savedBadgeText: {
    color: TEAL,
    fontSize: 12,
    fontWeight: '600',
  },
  prefSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipsScrollRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  prefTextInput: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  segmentedRow: {
    flexDirection: 'row',
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  segmentBtnFirst: {
    borderTopLeftRadius: borderRadius.md,
    borderBottomLeftRadius: borderRadius.md,
  },
  segmentBtnLast: {
    borderTopRightRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
  },
  segmentBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
