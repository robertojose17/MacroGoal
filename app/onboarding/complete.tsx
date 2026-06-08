import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
  ImageBackground,
  Image,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase/client';
import { trackEvent } from '@/utils/analytics';
import { calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacrosWithPreset } from '@/utils/calculations';
import { Sex, GoalType, ActivityLevel } from '@/types';
import Purchases, { isPurchasesAvailable } from '@/utils/purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toLocalDateString } from '@/utils/dateUtils';

const ONESIGNAL_PROMPT_KEY = 'onesignal_prompt_shown_v1';

const BG_IMAGE = require('../../assets/images/73291328-4520-475d-9d5f-c23a5206eb1d.jpeg');
const PRIMARY = '#4CAF50';
const DARK_BG = '#0A0A0A';

const DIETARY_OPTIONS = [
  { label: 'Vegetarian', value: 'vegetarian' },
  { label: 'Vegan', value: 'vegan' },
  { label: 'Gluten-Free', value: 'gluten-free' },
  { label: 'Dairy-Free', value: 'dairy-free' },
  { label: 'Halal', value: 'halal' },
  { label: 'Nut-Free', value: 'nut-free' },
];

const PROTEIN_OPTIONS = [
  { label: 'Chicken', value: 'chicken' },
  { label: 'Turkey', value: 'turkey' },
  { label: 'Beef', value: 'beef' },
  { label: 'Pork', value: 'pork' },
  { label: 'Salmon', value: 'salmon' },
  { label: 'Tuna', value: 'tuna' },
  { label: 'Shrimp', value: 'shrimp' },
  { label: 'Cod', value: 'cod' },
  { label: 'Tilapia', value: 'tilapia' },
  { label: 'Eggs', value: 'eggs' },
  { label: 'Greek Yogurt', value: 'greek-yogurt' },
  { label: 'Cottage Cheese', value: 'cottage-cheese' },
  { label: 'Whey Protein', value: 'whey-protein' },
  { label: 'Tofu', value: 'tofu' },
  { label: 'Tempeh', value: 'tempeh' },
  { label: 'Edamame', value: 'edamame' },
  { label: 'Lentils', value: 'lentils' },
  { label: 'Chickpeas', value: 'chickpeas' },
  { label: 'Black Beans', value: 'black-beans' },
];

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

export default function CompleteOnboardingScreen() {
  const router = useRouter();
  const { width } = Dimensions.get('window');

  const [step, setStep] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Body data
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weight, setWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('lose');
  const [lossRateLbsPerWeek, setLossRateLbsPerWeek] = useState<number>(1.0);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');

  // Pain point
  const [painPoint, setPainPoint] = useState<number | null>(null);

  // Food preferences
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [proteinPreferences, setProteinPreferences] = useState<string[]>([]);
  const [recipeStyles, setRecipeStyles] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState('');

  // Calculated results
  const [calcCalories, setCalcCalories] = useState(0);
  const [calcProtein, setCalcProtein] = useState(0);
  const [calcCarbs, setCalcCarbs] = useState(0);
  const [calcFats, setCalcFats] = useState(0);
  const [calcWeeks, setCalcWeeks] = useState(0);

  // Animated bullets for step 2
  const bullet1Anim = useRef(new Animated.Value(0)).current;
  const bullet2Anim = useRef(new Animated.Value(0)).current;
  const bullet3Anim = useRef(new Animated.Value(0)).current;

  // Count-up animations for step 9
  const caloriesAnim = useRef(new Animated.Value(0)).current;
  const proteinAnim = useRef(new Animated.Value(0)).current;
  const carbsAnim = useRef(new Animated.Value(0)).current;
  const fatsAnim = useRef(new Animated.Value(0)).current;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Animated display values for count-up
  const [displayCalories, setDisplayCalories] = useState(0);
  const [displayProtein, setDisplayProtein] = useState(0);
  const [displayCarbs, setDisplayCarbs] = useState(0);
  const [displayFats, setDisplayFats] = useState(0);

  // ─── Navigation ────────────────────────────────────────────────────────────

  const goToStep = (nextStep: number) => {
    const direction = nextStep > step ? 1 : -1;
    slideAnim.setValue(direction * width);
    setStep(nextStep);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const goNext = () => {
    console.log(`[Onboarding] Advancing from step ${step} to step ${step + 1}`);
    if (step === 9) {
      trackEvent('onboarding_completed');
    }
    goToStep(step + 1);
  };

  const goBack = () => {
    if (step > 0) {
      console.log(`[Onboarding] Going back from step ${step} to step ${step - 1}`);
      goToStep(step - 1);
    }
  };

  // ─── Bullet animations (step 2) ────────────────────────────────────────────

  useEffect(() => {
    if (step === 2) {
      bullet1Anim.setValue(0);
      bullet2Anim.setValue(0);
      bullet3Anim.setValue(0);
      Animated.sequence([
        Animated.timing(bullet1Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(bullet2Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(bullet3Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ─── Calculations + Save (step 9) ──────────────────────────────────────────

  useEffect(() => {
    if (step === 9) {
      runCalculationsAndSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const runCalculationsAndSave = async () => {
    console.log('[Onboarding] Step 9 mounted — running calculations and saving');
    setSaving(true);
    setSaveError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('You must be logged in');
      }

      // Convert height to cm
      let heightInCm: number;
      if (units === 'imperial') {
        const totalInches = parseInt(heightFeet) * 12 + parseInt(heightInches);
        heightInCm = totalInches * 2.54;
      } else {
        heightInCm = parseInt(heightCm);
      }

      // Convert weight to kg
      let weightInKg: number;
      if (units === 'imperial') {
        weightInKg = parseFloat(weight) * 0.453592;
      } else {
        weightInKg = parseFloat(weight);
      }

      // Convert goal weight to kg
      let goalWeightInKg: number;
      if (units === 'imperial') {
        goalWeightInKg = parseFloat(goalWeight) * 0.453592;
      } else {
        goalWeightInKg = parseFloat(goalWeight);
      }

      const ageNum = parseInt(age);

      console.log('[Onboarding] Calculating goals with:', {
        weight: weightInKg,
        height: heightInCm,
        age: ageNum,
        sex,
        activityLevel,
        goalType,
        goalWeight: goalWeightInKg,
        lossRateLbsPerWeek: goalType === 'lose' ? lossRateLbsPerWeek : null,
      });

      const bmr = calculateBMR(weightInKg, heightInCm, ageNum, sex);
      const tdee = calculateTDEE(bmr, activityLevel);
      const targetCalories = calculateTargetCalories(
        tdee,
        goalType,
        goalType === 'lose' ? lossRateLbsPerWeek : undefined
      );
      const macros = calculateMacrosWithPreset(targetCalories, weightInKg, 'lean_body');

      console.log('[Onboarding] Calculated:', { bmr, tdee, targetCalories, macros });

      // Set state for display
      setCalcCalories(targetCalories);
      setCalcProtein(macros.protein);
      setCalcCarbs(macros.carbs);
      setCalcFats(macros.fats);

      // Calculate weeks to goal
      const currentWeightLbs = units === 'imperial' ? parseFloat(weight) : parseFloat(weight) * 2.20462;
      const goalWeightLbs = units === 'imperial' ? parseFloat(goalWeight) : parseFloat(goalWeight) * 2.20462;
      let weeks = 0;
      if (goalType === 'lose') {
        weeks = Math.round(Math.abs(currentWeightLbs - goalWeightLbs) / lossRateLbsPerWeek);
      } else if (goalType === 'gain') {
        weeks = Math.round(Math.abs(currentWeightLbs - goalWeightLbs) / 0.5);
      }
      setCalcWeeks(weeks);

      // Date of birth
      const currentYear = new Date().getFullYear();
      const birthYear = currentYear - ageNum;
      const dateOfBirth = `${birthYear}-01-01`;

      // Save user profile
      console.log('[Onboarding] Saving user profile to Supabase...');

      // Check if journey_start_date is already set (only set it once, on first completion)
      const { data: existingUser } = await supabase
        .from('users')
        .select('journey_start_date')
        .eq('id', user.id)
        .maybeSingle();

      const updatePayload: Record<string, unknown> = {
        sex,
        date_of_birth: dateOfBirth,
        height: heightInCm,
        current_weight: weightInKg,
        goal_weight: goalWeightInKg,
        activity_level: activityLevel,
        preferred_units: units,
        dietary_restrictions: dietaryRestrictions,
        protein_preferences: proteinPreferences,
        recipe_styles: recipeStyles,
        disliked_foods: dislikedFoods,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      };

      if (!existingUser?.journey_start_date) {
        const todayStr = toLocalDateString(new Date());
        console.log('[Onboarding] Setting journey_start_date for first time:', todayStr);
        updatePayload.journey_start_date = todayStr;
      } else {
        console.log('[Onboarding] journey_start_date already set, skipping');
      }

      const { error: userError } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', user.id);

      if (userError) {
        console.error('[Onboarding] User update error:', userError);
        throw userError;
      }

      console.log('[Onboarding] User profile updated');

      // Deactivate existing goals
      await supabase
        .from('goals')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true);

      // Create new goal
      const goalData: Record<string, unknown> = {
        user_id: user.id,
        goal_type: goalType,
        goal_intensity: 1,
        daily_calories: targetCalories,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fats_g: macros.fats,
        fiber_g: macros.fiber,
        is_active: true,
      };

      if (goalType === 'lose') {
        goalData.loss_rate_lbs_per_week = lossRateLbsPerWeek;
      }

      console.log('[Onboarding] Creating goal in Supabase...');
      const { error: goalError } = await supabase.from('goals').insert(goalData);

      if (goalError) {
        console.error('[Onboarding] Goal creation error:', goalError);
        throw goalError;
      }

      console.log('[Onboarding] Goal created successfully');

      // Run count-up animations
      caloriesAnim.setValue(0);
      proteinAnim.setValue(0);
      carbsAnim.setValue(0);
      fatsAnim.setValue(0);

      caloriesAnim.addListener(({ value }) => setDisplayCalories(Math.round(value)));
      proteinAnim.addListener(({ value }) => setDisplayProtein(Math.round(value)));
      carbsAnim.addListener(({ value }) => setDisplayCarbs(Math.round(value)));
      fatsAnim.addListener(({ value }) => setDisplayFats(Math.round(value)));

      Animated.parallel([
        Animated.timing(caloriesAnim, { toValue: targetCalories, duration: 1200, useNativeDriver: false }),
        Animated.timing(proteinAnim, { toValue: macros.protein, duration: 1200, useNativeDriver: false }),
        Animated.timing(carbsAnim, { toValue: macros.carbs, duration: 1200, useNativeDriver: false }),
        Animated.timing(fatsAnim, { toValue: macros.fats, duration: 1200, useNativeDriver: false }),
      ]).start();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save your information. Please try again.';
      console.error('[Onboarding] Save error:', error);
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Notification permission helper ───────────────────────────────────────

  const requestOneSignalPermission = async () => {
    if (Platform.OS === 'web') return;
    try {
      const OneSignal = require('react-native-onesignal').OneSignal;
      console.log('[Onboarding] Requesting OneSignal notification permission');
      await OneSignal.Notifications.requestPermission(true);
      await AsyncStorage.setItem(ONESIGNAL_PROMPT_KEY, 'true');
    } catch (e) {
      console.warn('[Onboarding] OneSignal permission request failed (non-fatal):', e);
    }
  };

  const showNotifPromptThen = async (nav: () => void) => {
    if (Platform.OS === 'web') {
      nav();
      return;
    }
    await requestOneSignalPermission();
    nav();
  };

  // ─── Purchase / finish ─────────────────────────────────────────────────────

  const handleStartTrial = async () => {
    console.log('[Onboarding] Start Free Trial pressed — requesting notification permission then navigating to subscription');
    await showNotifPromptThen(() => router.push('/subscription?autoStart=true'));
  };

  const handleSkipTrial = async () => {
    console.log('[Onboarding] Skip trial pressed — requesting notification permission then navigating home');
    await showNotifPromptThen(() => router.replace('/(tabs)/(home)/'));
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const toggleItem = (item: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const weightUnit = units === 'metric' ? 'kg' : 'lbs';

  // ─── Step 4 validation ─────────────────────────────────────────────────────

  const step4Valid = (() => {
    if (units === 'imperial') {
      return heightFeet !== '' && heightInches !== '' && weight !== '' && goalWeight !== '';
    }
    return heightCm !== '' && weight !== '' && goalWeight !== '';
  })();

  // ─── Goal projection text ──────────────────────────────────────────────────

  const goalProjectionText = (() => {
    if (goalType === 'maintain') {
      return "You're already at your goal weight. Let's keep you there.";
    }
    if (calcWeeks === 0) {
      return "You're already at your goal weight!";
    }
    return `You could reach your goal of ${goalWeight}${weightUnit} in ~${calcWeeks} weeks.`;
  })();

  // ─── Progress bar ──────────────────────────────────────────────────────────

  const progress = step / 10;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Progress bar — steps 1–10 */}
      {step > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      )}

      {/* Back button — steps 1–9 */}
      {step > 0 && step < 10 && (
        <TouchableOpacity style={styles.backBtn} onPress={goBack}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
      )}

      <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
        {step === 0 && <Step0 onNext={goNext} />}
        {step === 1 && (
          <Step1
            painPoint={painPoint}
            setPainPoint={setPainPoint}
            onNext={goNext}
          />
        )}
        {step === 2 && (
          <Step2
            bullet1Anim={bullet1Anim}
            bullet2Anim={bullet2Anim}
            bullet3Anim={bullet3Anim}
            onNext={goNext}
          />
        )}
        {step === 3 && (
          <Step3
            sex={sex}
            setSex={setSex}
            age={age}
            setAge={setAge}
            units={units}
            setUnits={setUnits}
            onNext={goNext}
          />
        )}
        {step === 4 && (
          <Step4
            units={units}
            heightFeet={heightFeet}
            setHeightFeet={setHeightFeet}
            heightInches={heightInches}
            setHeightInches={setHeightInches}
            heightCm={heightCm}
            setHeightCm={setHeightCm}
            weight={weight}
            setWeight={setWeight}
            goalWeight={goalWeight}
            setGoalWeight={setGoalWeight}
            weightUnit={weightUnit}
            isValid={step4Valid}
            onNext={goNext}
          />
        )}
        {step === 5 && (
          <Step5
            goalType={goalType}
            setGoalType={setGoalType}
            lossRateLbsPerWeek={lossRateLbsPerWeek}
            setLossRateLbsPerWeek={setLossRateLbsPerWeek}
            onNext={goNext}
          />
        )}
        {step === 6 && (
          <Step6
            activityLevel={activityLevel}
            setActivityLevel={setActivityLevel}
            onNext={goNext}
          />
        )}
        {step === 7 && (
          <Step7
            dietaryRestrictions={dietaryRestrictions}
            proteinPreferences={proteinPreferences}
            toggleDietary={(item) => toggleItem(item, dietaryRestrictions, setDietaryRestrictions)}
            toggleProtein={(item) => toggleItem(item, proteinPreferences, setProteinPreferences)}
            onNext={goNext}
          />
        )}
        {step === 8 && (
          <Step8
            recipeStyles={recipeStyles}
            toggleRecipeStyle={(item) => toggleItem(item, recipeStyles, setRecipeStyles)}
            dislikedFoods={dislikedFoods}
            setDislikedFoods={setDislikedFoods}
            onNext={goNext}
          />
        )}
        {step === 9 && (
          <Step9
            saving={saving}
            saveError={saveError}
            displayCalories={displayCalories}
            displayProtein={displayProtein}
            displayCarbs={displayCarbs}
            displayFats={displayFats}
            goalProjectionText={goalProjectionText}
            onRetry={runCalculationsAndSave}
            onNext={goNext}
          />
        )}
        {step === 10 && (
          <Step10
            onStartTrial={handleStartTrial}
            onSkip={handleSkipTrial}
            totalWeeks={calcWeeks}
            goalWeight={goalWeight}
            weightUnit={weightUnit}
            currentWeight={weight}
            lossRateLbsPerWeek={lossRateLbsPerWeek}
            units={units}
            goalType={goalType}
          />
        )}
      </Animated.View>
    </View>
  );
}

// ─── STEP 0 — EMOTION ────────────────────────────────────────────────────────

function Step0({ onNext }: { onNext: () => void }) {
  return (
    <ImageBackground source={BG_IMAGE} style={styles.fullScreen} resizeMode="cover">
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.95)', '#000000']}
        locations={[0, 0.35, 0.55, 0.75, 1]}
        style={styles.fullScreen}
      >
        <SafeAreaView style={styles.step0Safe} edges={['bottom']}>
          <View style={styles.step0Content}>
            <Text style={styles.step0Headline}>{'Lose weight without\noverthinking food.'}</Text>
            <Text style={styles.step0Sub}>
              {'A personalized nutrition system built around your body and favorite foods.'}
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                console.log('[Onboarding] Step 0: Build My Plan pressed');
                onNext();
              }}
            >
              <Text style={styles.primaryBtnText}>Build My Plan</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </ImageBackground>
  );
}

// ─── STEP 1 — PAIN ───────────────────────────────────────────────────────────

const PAIN_CARDS = [
  {
    emoji: '😩',
    title: "I don't know what to eat",
    subtitle: 'Guessing every meal is exhausting',
  },
  {
    emoji: '📊',
    title: 'I track but never see results',
    subtitle: 'Logging without progress is demoralizing',
  },
  {
    emoji: '🔄',
    title: 'I start strong, then fall off',
    subtitle: 'Consistency has always been the problem',
  },
];

function Step1({
  painPoint,
  setPainPoint,
  onNext,
}: {
  painPoint: number | null;
  setPainPoint: (v: number) => void;
  onNext: () => void;
}) {
  const ctaDisabled = painPoint === null;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{"What's been holding you back?"}</Text>
        <Text style={styles.stepSubtitle}>{'Pick the one that hits closest.'}</Text>

        <View style={styles.cardList}>
          {PAIN_CARDS.map((card, idx) => {
            const selected = painPoint === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.selectionCard, selected && styles.selectionCardSelected]}
                onPress={() => {
                  console.log(`[Onboarding] Pain point selected: ${card.title}`);
                  setPainPoint(idx);
                }}
              >
                <Text style={styles.cardEmoji}>{card.emoji}</Text>
                <View style={styles.cardTextBlock}>
                  <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>{card.title}</Text>
                  <Text style={[styles.cardSubtitle, selected && styles.cardSubtitleSelected]}>{card.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, ctaDisabled && styles.primaryBtnDisabled]}
          onPress={() => {
            console.log('[Onboarding] Step 1: This is me pressed');
            onNext();
          }}
          disabled={ctaDisabled}
        >
          <Text style={styles.primaryBtnText}>This is me →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STEP 2 — HOPE ───────────────────────────────────────────────────────────

const HOPE_BULLETS = [
  {
    icon: '✅',
    title: 'Know exactly how much to eat',
    body: 'Your daily calorie and macro targets, calculated for your body.',
  },
  {
    icon: '✅',
    title: 'Meals already planned around your preferences',
    body: 'No more guessing what fits your goals.',
  },
  {
    icon: '✅',
    title: 'A system built to help you stay consistent',
    body: 'Weekly check-ins and progress tracking built in.',
  },
];

function Step2({
  bullet1Anim,
  bullet2Anim,
  bullet3Anim,
  onNext,
}: {
  bullet1Anim: Animated.Value;
  bullet2Anim: Animated.Value;
  bullet3Anim: Animated.Value;
  onNext: () => void;
}) {
  const anims = [bullet1Anim, bullet2Anim, bullet3Anim];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{'What changes when you stop guessing'}</Text>
        <Text style={styles.stepSubtitle}>{"Here's what your plan includes:"}</Text>

        <View style={styles.cardList}>
          {HOPE_BULLETS.map((bullet, idx) => {
            const anim = anims[idx];
            const opacity = anim;
            const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
            return (
              <Animated.View
                key={idx}
                style={[styles.hopeBullet, { opacity, transform: [{ translateY }] }]}
              >
                <Text style={styles.hopeBulletIcon}>{bullet.icon}</Text>
                <View style={styles.hopeBulletText}>
                  <Text style={styles.hopeBulletTitle}>{bullet.title}</Text>
                  <Text style={styles.hopeBulletBody}>{bullet.body}</Text>
                </View>
              </Animated.View>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            console.log('[Onboarding] Step 2: I want this pressed');
            onNext();
          }}
        >
          <Text style={styles.primaryBtnText}>I want this →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STEP 3 — BODY DATA part 1 ───────────────────────────────────────────────

function Step3({
  sex,
  setSex,
  age,
  setAge,
  units,
  setUnits,
  onNext,
}: {
  sex: Sex;
  setSex: (v: Sex) => void;
  age: string;
  setAge: (v: string) => void;
  units: 'metric' | 'imperial';
  setUnits: (v: 'metric' | 'imperial') => void;
  onNext: () => void;
}) {
  const ctaDisabled = age === '';
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{"Let's build your system"}</Text>
        <Text style={styles.stepSubtitle}>{'A few quick questions about your body.'}</Text>

        {/* Sex */}
        <Text style={styles.fieldLabel}>{'Biological sex'}</Text>
        <View style={styles.twoCardRow}>
          {([['male', '👨', 'Male'], ['female', '👩', 'Female']] as const).map(([val, emoji, label]) => {
            const selected = sex === val;
            return (
              <TouchableOpacity
                key={val}
                style={[styles.twoCard, selected && styles.twoCardSelected]}
                onPress={() => {
                  console.log(`[Onboarding] Sex selected: ${val}`);
                  setSex(val);
                }}
              >
                <Text style={styles.twoCardEmoji}>{emoji}</Text>
                <Text style={[styles.twoCardLabel, selected && styles.twoCardLabelSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Age */}
        <Text style={styles.fieldLabel}>{'How old are you?'}</Text>
        <TextInput
          style={styles.bigInput}
          placeholder="e.g. 28"
          placeholderTextColor="rgba(255,255,255,0.3)"
          keyboardType="number-pad"
          value={age}
          onChangeText={setAge}
          returnKeyType="done"
        />

        {/* Units */}
        <Text style={styles.fieldLabel}>{'Preferred units'}</Text>
        <View style={styles.twoCardRow}>
          {([['metric', 'Metric', 'kg / cm'], ['imperial', 'Imperial', 'lbs / ft']] as const).map(([val, label, sub]) => {
            const selected = units === val;
            return (
              <TouchableOpacity
                key={val}
                style={[styles.twoCard, selected && styles.twoCardSelected]}
                onPress={() => {
                  console.log(`[Onboarding] Units selected: ${val}`);
                  setUnits(val);
                }}
              >
                <Text style={[styles.twoCardLabel, selected && styles.twoCardLabelSelected]}>{label}</Text>
                <Text style={[styles.twoCardSub, selected && styles.twoCardSubSelected]}>{sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, ctaDisabled && styles.primaryBtnDisabled]}
          onPress={() => {
            console.log('[Onboarding] Step 3: Continue pressed');
            onNext();
          }}
          disabled={ctaDisabled}
        >
          <Text style={styles.primaryBtnText}>Continue →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STEP 4 — BODY DATA part 2 ───────────────────────────────────────────────

function Step4({
  units,
  heightFeet,
  setHeightFeet,
  heightInches,
  setHeightInches,
  heightCm,
  setHeightCm,
  weight,
  setWeight,
  goalWeight,
  setGoalWeight,
  weightUnit,
  isValid,
  onNext,
}: {
  units: 'metric' | 'imperial';
  heightFeet: string;
  setHeightFeet: (v: string) => void;
  heightInches: string;
  setHeightInches: (v: string) => void;
  heightCm: string;
  setHeightCm: (v: string) => void;
  weight: string;
  setWeight: (v: string) => void;
  goalWeight: string;
  setGoalWeight: (v: string) => void;
  weightUnit: string;
  isValid: boolean;
  onNext: () => void;
}) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{'Almost there'}</Text>
        <Text style={styles.stepSubtitle}>{'Your measurements help us calculate your exact targets.'}</Text>

        {/* Height */}
        <Text style={styles.fieldLabel}>{'Your height'}</Text>
        {units === 'imperial' ? (
          <View style={styles.twoInputRow}>
            <View style={styles.twoInputItem}>
              <TextInput
                style={styles.bigInput}
                placeholder="5"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="number-pad"
                value={heightFeet}
                onChangeText={setHeightFeet}
                returnKeyType="next"
              />
              <Text style={styles.inputSuffix}>ft</Text>
            </View>
            <View style={styles.twoInputItem}>
              <TextInput
                style={styles.bigInput}
                placeholder="9"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="number-pad"
                value={heightInches}
                onChangeText={setHeightInches}
                returnKeyType="next"
              />
              <Text style={styles.inputSuffix}>in</Text>
            </View>
          </View>
        ) : (
          <View style={styles.inputWithSuffix}>
            <TextInput
              style={[styles.bigInput, styles.flex1]}
              placeholder="e.g. 175"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="number-pad"
              value={heightCm}
              onChangeText={setHeightCm}
              returnKeyType="next"
            />
            <Text style={styles.inputSuffix}>cm</Text>
          </View>
        )}

        {/* Current Weight */}
        <Text style={styles.fieldLabel}>{'Current weight'}</Text>
        <View style={styles.inputWithSuffix}>
          <TextInput
            style={[styles.bigInput, styles.flex1]}
            placeholder={units === 'metric' ? 'e.g. 75' : 'e.g. 165'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
            returnKeyType="next"
          />
          <Text style={styles.inputSuffix}>{weightUnit}</Text>
        </View>

        {/* Goal Weight */}
        <Text style={styles.fieldLabel}>{'Goal weight'}</Text>
        <Text style={styles.fieldHelper}>{'The weight you want to reach'}</Text>
        <View style={styles.inputWithSuffix}>
          <TextInput
            style={[styles.bigInput, styles.flex1]}
            placeholder={units === 'metric' ? 'e.g. 70' : 'e.g. 155'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="decimal-pad"
            value={goalWeight}
            onChangeText={setGoalWeight}
            returnKeyType="done"
          />
          <Text style={styles.inputSuffix}>{weightUnit}</Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, !isValid && styles.primaryBtnDisabled]}
          onPress={() => {
            console.log('[Onboarding] Step 4: Continue pressed');
            onNext();
          }}
          disabled={!isValid}
        >
          <Text style={styles.primaryBtnText}>Continue →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STEP 5 — GOAL + SPEED ───────────────────────────────────────────────────

const GOAL_CARDS = [
  { value: 'lose' as GoalType, emoji: '📉', title: 'Lose Weight', subtitle: 'Burn fat, keep muscle' },
  { value: 'maintain' as GoalType, emoji: '⚖️', title: 'Maintain', subtitle: 'Stay where you are, feel better' },
  { value: 'gain' as GoalType, emoji: '📈', title: 'Gain', subtitle: 'Build strength and size' },
];

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5 lb/week', sub: 'Slow & steady' },
  { value: 1.0, label: '1.0 lb/week', sub: 'Moderate' },
  { value: 1.5, label: '1.5 lb/week', sub: 'Fast' },
  { value: 2.0, label: '2.0 lb/week', sub: 'Aggressive' },
];

function Step5({
  goalType,
  setGoalType,
  lossRateLbsPerWeek,
  setLossRateLbsPerWeek,
  onNext,
}: {
  goalType: GoalType;
  setGoalType: (v: GoalType) => void;
  lossRateLbsPerWeek: number;
  setLossRateLbsPerWeek: (v: number) => void;
  onNext: () => void;
}) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{"What's your goal?"}</Text>

        <View style={styles.cardList}>
          {GOAL_CARDS.map((card) => {
            const selected = goalType === card.value;
            return (
              <TouchableOpacity
                key={card.value}
                style={[styles.selectionCard, selected && styles.selectionCardSelected]}
                onPress={() => {
                  console.log(`[Onboarding] Goal selected: ${card.value}`);
                  setGoalType(card.value);
                }}
              >
                <Text style={styles.cardEmoji}>{card.emoji}</Text>
                <View style={styles.cardTextBlock}>
                  <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>{card.title}</Text>
                  <Text style={[styles.cardSubtitle, selected && styles.cardSubtitleSelected]}>{card.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {goalType === 'lose' && (
          <View style={styles.speedSection}>
            <Text style={styles.fieldLabel}>{'How fast?'}</Text>
            <View style={styles.speedGrid}>
              {SPEED_OPTIONS.map((opt) => {
                const selected = lossRateLbsPerWeek === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.speedChip, selected && styles.speedChipSelected]}
                    onPress={() => {
                      console.log(`[Onboarding] Loss rate selected: ${opt.value} lb/week`);
                      setLossRateLbsPerWeek(opt.value);
                    }}
                  >
                    <Text style={[styles.speedChipLabel, selected && styles.speedChipLabelSelected]}>{opt.label}</Text>
                    <Text style={[styles.speedChipSub, selected && styles.speedChipSubSelected]}>{opt.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            console.log('[Onboarding] Step 5: Continue pressed');
            onNext();
          }}
        >
          <Text style={styles.primaryBtnText}>Continue →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STEP 6 — ACTIVITY LEVEL ─────────────────────────────────────────────────

const ACTIVITY_CARDS = [
  { value: 'sedentary' as ActivityLevel, emoji: '🪑', title: 'Sedentary', subtitle: 'Desk job, little movement' },
  { value: 'light' as ActivityLevel, emoji: '🚶', title: 'Lightly Active', subtitle: 'Light exercise 1–3 days/week' },
  { value: 'moderate' as ActivityLevel, emoji: '🏃', title: 'Moderately Active', subtitle: 'Exercise 3–5 days/week' },
  { value: 'very_active' as ActivityLevel, emoji: '💪', title: 'Very Active', subtitle: 'Hard training 6–7 days/week' },
];

function Step6({
  activityLevel,
  setActivityLevel,
  onNext,
}: {
  activityLevel: ActivityLevel;
  setActivityLevel: (v: ActivityLevel) => void;
  onNext: () => void;
}) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{'How active are you?'}</Text>
        <Text style={styles.stepSubtitle}>{'Be honest — this affects your calorie target.'}</Text>

        <View style={styles.cardList}>
          {ACTIVITY_CARDS.map((card) => {
            const selected = activityLevel === card.value;
            return (
              <TouchableOpacity
                key={card.value}
                style={[styles.selectionCard, selected && styles.selectionCardSelected]}
                onPress={() => {
                  console.log(`[Onboarding] Activity level selected: ${card.value}`);
                  setActivityLevel(card.value);
                }}
              >
                <Text style={styles.cardEmoji}>{card.emoji}</Text>
                <View style={styles.cardTextBlock}>
                  <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]}>{card.title}</Text>
                  <Text style={[styles.cardSubtitle, selected && styles.cardSubtitleSelected]}>{card.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            console.log('[Onboarding] Step 6: Continue pressed');
            onNext();
          }}
        >
          <Text style={styles.primaryBtnText}>Continue →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STEP 7 — FOOD PREFERENCES part 1 ───────────────────────────────────────

function Step7({
  dietaryRestrictions,
  proteinPreferences,
  toggleDietary,
  toggleProtein,
  onNext,
}: {
  dietaryRestrictions: string[];
  proteinPreferences: string[];
  toggleDietary: (item: string) => void;
  toggleProtein: (item: string) => void;
  onNext: () => void;
}) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{'What are your dietary restrictions?'}</Text>
        <Text style={styles.stepSubtitle}>{"Select all that apply. We'll make sure your plan respects these."}</Text>

        <View style={styles.chipWrap}>
          {DIETARY_OPTIONS.map((opt) => {
            const selected = dietaryRestrictions.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => {
                  console.log(`[Onboarding] Dietary restriction toggled: ${opt.value}`);
                  toggleDietary(opt.value);
                }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{'Choose proteins you actually enjoy eating.'}</Text>

        <View style={styles.chipWrap}>
          {PROTEIN_OPTIONS.map((opt) => {
            const selected = proteinPreferences.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => {
                  console.log(`[Onboarding] Protein preference toggled: ${opt.value}`);
                  toggleProtein(opt.value);
                }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            console.log('[Onboarding] Step 7: Continue pressed');
            onNext();
          }}
        >
          <Text style={styles.primaryBtnText}>Continue →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STEP 8 — FOOD PREFERENCES part 2 ───────────────────────────────────────

function Step8({
  recipeStyles,
  toggleRecipeStyle,
  dislikedFoods,
  setDislikedFoods,
  onNext,
}: {
  recipeStyles: string[];
  toggleRecipeStyle: (item: string) => void;
  dislikedFoods: string;
  setDislikedFoods: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{'What kind of meals fit your lifestyle?'}</Text>

        <View style={styles.chipWrap}>
          {RECIPE_STYLE_OPTIONS.map((opt) => {
            const selected = recipeStyles.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => {
                  console.log(`[Onboarding] Recipe style toggled: ${opt.value}`);
                  toggleRecipeStyle(opt.value);
                }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>{'Anything you never want to see in your plan?'}</Text>
        <TextInput
          style={styles.multilineInput}
          placeholder="e.g. cilantro, mushrooms, shellfish..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          multiline
          value={dislikedFoods}
          onChangeText={setDislikedFoods}
        />

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            console.log('[Onboarding] Step 8: Build My Plan pressed');
            onNext();
          }}
        >
          <Text style={styles.primaryBtnText}>Build My Plan →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STEP 9 — CINEMATIC RESULTS ──────────────────────────────────────────────

const ACCENT = '#8EFF7A';
const BG_DARK = '#0a0a0a';
const BG_MID = '#0d1a0f';

const PARTICLE_CONFIG = [
  { top: '8%', left: '12%', size: 5, duration: 3200, delay: 0, opacity: 0.4 },
  { top: '15%', left: '78%', size: 4, duration: 4100, delay: 600, opacity: 0.3 },
  { top: '28%', left: '88%', size: 6, duration: 3600, delay: 1200, opacity: 0.5 },
  { top: '45%', left: '6%', size: 4, duration: 4800, delay: 300, opacity: 0.35 },
  { top: '55%', left: '92%', size: 5, duration: 3900, delay: 900, opacity: 0.45 },
  { top: '68%', left: '18%', size: 4, duration: 4300, delay: 1500, opacity: 0.3 },
  { top: '78%', left: '72%', size: 6, duration: 3500, delay: 700, opacity: 0.5 },
  { top: '88%', left: '42%', size: 5, duration: 4600, delay: 400, opacity: 0.4 },
] as const;

const PHASE_DURATIONS = [2800, 2800, 3500, 2800] as const;

function FloatingParticles() {
  const anims = useRef(
    PARTICLE_CONFIG.map(() => ({
      translateY: new Animated.Value(0),
      opacity: new Animated.Value(0.3),
    }))
  ).current;

  useEffect(() => {
    anims.forEach((anim, i) => {
      const cfg = PARTICLE_CONFIG[i];
      const loopY = Animated.loop(
        Animated.sequence([
          Animated.timing(anim.translateY, {
            toValue: -20,
            duration: cfg.duration,
            delay: cfg.delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim.translateY, {
            toValue: 20,
            duration: cfg.duration,
            useNativeDriver: true,
          }),
        ])
      );
      const loopOp = Animated.loop(
        Animated.sequence([
          Animated.timing(anim.opacity, {
            toValue: cfg.opacity,
            duration: cfg.duration / 2,
            delay: cfg.delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim.opacity, {
            toValue: 0.15,
            duration: cfg.duration / 2,
            useNativeDriver: true,
          }),
        ])
      );
      loopY.start();
      loopOp.start();
    });
  }, [anims]);

  return (
    <>
      {PARTICLE_CONFIG.map((cfg, i) => (
        <Animated.View
          key={i}
          style={[
            styles.s9Particle,
            {
              top: cfg.top as string,
              left: cfg.left as string,
              width: cfg.size,
              height: cfg.size,
              borderRadius: cfg.size / 2,
              opacity: anims[i].opacity,
              transform: [{ translateY: anims[i].translateY }],
            },
          ]}
        />
      ))}
    </>
  );
}

function Phase1Saving({ progressAnim }: { progressAnim: Animated.Value }) {
  const chipAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    chipAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.7,
            duration: 1400,
            delay: i * 280,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 1400,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, [chipAnims]);

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 240],
  });

  const chipLabels = ['calories', 'protein', 'habits', 'meals', 'goals'];
  const chipPositions = [
    { top: -36, left: -20 },
    { top: -36, right: -20 },
    { top: 20, left: -40 },
    { top: 20, right: -40 },
    { top: 56, left: 80 },
  ];

  return (
    <View style={styles.s9PhaseCenter}>
      <Text style={styles.s9Phase1Title}>{'Analyzing your habits\u2026'}</Text>
      <View style={styles.s9ProgressContainer}>
        {chipLabels.map((label, i) => (
          <Animated.Text
            key={label}
            style={[
              styles.s9Chip,
              {
                opacity: chipAnims[i],
                top: chipPositions[i].top,
                left: 'left' in chipPositions[i] ? (chipPositions[i] as { top: number; left: number }).left : undefined,
                right: 'right' in chipPositions[i] ? (chipPositions[i] as { top: number; right: number }).right : undefined,
              },
            ]}
          >
            {label}
          </Animated.Text>
        ))}
        <View style={styles.s9ProgressTrack}>
          <Animated.View
            style={[
              styles.s9ProgressFill,
              { width: barWidth },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function Phase2({ underestimatePercent }: { underestimatePercent: number }) {
  const barAnims = useRef(
    Array.from({ length: 7 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    barAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: 0.9,
        duration: 800,
        delay: i * 100,
        useNativeDriver: true,
      }).start();
    });
  }, [barAnims]);

  const barHeights = [20, 28, 22, 36, 30, 44, 38];
  const percentText = underestimatePercent + '%';

  return (
    <View style={styles.s9PhaseCenter}>
      <Text style={styles.s9Phase2Text}>
        {'Most people with your profile\nunderestimate their calories by '}
        <Text style={styles.s9Accent}>{percentText}</Text>
        {'.'}
      </Text>
      <View style={styles.s9BarChart}>
        {barHeights.map((h, i) => (
          <Animated.View
            key={i}
            style={[
              styles.s9Bar,
              { height: h, opacity: barAnims[i] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function Phase3({
  displayCalories,
  displayProtein,
  displayCarbs,
  displayFats,
}: {
  displayCalories: number;
  displayProtein: number;
  displayCarbs: number;
  displayFats: number;
}) {
  const dotAnims = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(0.4))
  ).current;

  useEffect(() => {
    dotAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 1000,
            delay: i * 250,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, [dotAnims]);

  const caloriesDisplay = Number(displayCalories).toLocaleString();
  const proteinDisplay = String(displayProtein) + 'g';
  const carbsDisplay = String(displayCarbs) + 'g';
  const fatsDisplay = String(displayFats) + 'g';

  const macros = [
    { label: 'Daily Calories', value: caloriesDisplay, unit: 'kcal' },
    { label: 'Protein', value: proteinDisplay, unit: '' },
    { label: 'Carbs', value: carbsDisplay, unit: '' },
    { label: 'Fat', value: fatsDisplay, unit: '' },
  ];

  return (
    <View style={styles.s9PhaseCenter}>
      <Text style={styles.s9Phase3Headline}>
        {'Your personalized nutrition plan is ready'}
      </Text>
      <BlurView intensity={40} tint="dark" style={styles.s9GlassCard}>
        <View style={styles.s9GlassOverlay}>
          <View style={styles.s9MacroGrid}>
            {macros.map((m, i) => (
              <View key={m.label} style={styles.s9MacroItem}>
                <View style={styles.s9MacroLabelRow}>
                  <Animated.View
                    style={[styles.s9MacroDot, { opacity: dotAnims[i] }]}
                  />
                  <Text style={styles.s9MacroLabel}>{m.label}</Text>
                </View>
                <Text style={styles.s9MacroValue}>{m.value}</Text>
                {m.unit ? (
                  <Text style={styles.s9MacroUnit}>{m.unit}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </BlurView>
      <Text style={styles.s9Phase3Sub}>
        {'Built specifically for your body and goals.'}
      </Text>
    </View>
  );
}

function Phase4({ weeksText }: { weeksText: string }) {
  const timelineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(timelineAnim, {
      toValue: 260,
      duration: 1800,
      useNativeDriver: false,
    }).start();
  }, [timelineAnim]);

  const nodePositions = [0, 65, 130, 195, 260];

  return (
    <View style={styles.s9PhaseCenter}>
      <Text style={styles.s9Phase4Text}>
        {'You could reach your goal\nin around '}
        <Text style={styles.s9Accent}>{weeksText}</Text>
        {'.'}
      </Text>
      <View style={styles.s9TimelineWrap}>
        <View style={styles.s9TimelineTrack} />
        <Animated.View
          style={[styles.s9TimelineFill, { width: timelineAnim }]}
        />
        {nodePositions.map((pos, i) => (
          <View
            key={i}
            style={[styles.s9TimelineNode, { left: pos - 4 }]}
          />
        ))}
      </View>
    </View>
  );
}

function Phase5({ onNext }: { onNext: () => void }) {
  const foodEmojis = ['🍕', '🍔', '🍣', '🌮'];
  const bounceAnims = useRef(
    foodEmojis.map(() => ({
      translateY: new Animated.Value(0),
      scale: new Animated.Value(1),
    }))
  ).current;

  useEffect(() => {
    bounceAnims.forEach((anim, i) => {
      const loopY = Animated.loop(
        Animated.sequence([
          Animated.timing(anim.translateY, {
            toValue: -4,
            duration: 700,
            delay: i * 180,
            useNativeDriver: true,
          }),
          Animated.timing(anim.translateY, {
            toValue: 4,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      const loopS = Animated.loop(
        Animated.sequence([
          Animated.timing(anim.scale, {
            toValue: 1.05,
            duration: 700,
            delay: i * 180,
            useNativeDriver: true,
          }),
          Animated.timing(anim.scale, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      loopY.start();
      loopS.start();
    });
  }, [bounceAnims]);

  return (
    <View style={styles.s9PhaseCenter}>
      <Text style={styles.s9Phase5Text}>
        {'You don\u2019t need to stop eating\nyour favorite foods.'}
      </Text>
      <View style={styles.s9EmojiRow}>
        {foodEmojis.map((emoji, i) => (
          <Animated.View
            key={emoji}
            style={{
              transform: [
                { translateY: bounceAnims[i].translateY },
                { scale: bounceAnims[i].scale },
              ],
            }}
          >
            <Text style={styles.s9FoodEmoji}>{emoji}</Text>
          </Animated.View>
        ))}
      </View>
      <Text style={styles.s9Phase5Sub}>{'Progress comes from consistency.'}</Text>
      <TouchableOpacity
        style={styles.s9ContinueBtn}
        onPress={() => {
          console.log('[Onboarding] Step 9 final phase: Continue pressed');
          onNext();
        }}
      >
        <Text style={styles.s9ContinueBtnText}>{'Continue'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Step9({
  saving,
  saveError,
  displayCalories,
  displayProtein,
  displayCarbs,
  displayFats,
  goalProjectionText,
  onRetry,
  onNext,
}: {
  saving: boolean;
  saveError: string | null;
  displayCalories: number;
  displayProtein: number;
  displayCarbs: number;
  displayFats: number;
  goalProjectionText: string;
  onRetry: () => void;
  onNext: () => void;
}) {
  const [phase, setPhase] = useState(1);
  const phaseOpacity = useRef(new Animated.Value(1)).current;
  const phaseTranslateY = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStarted = useRef(false);

  const [underestimatePercent] = useState(() =>
    Math.floor(Math.random() * (35 - 15 + 1)) + 15
  );

  const weeksText = useMemo(() => {
    const match = goalProjectionText.match(/(\d+)\s*week/i);
    if (match) {
      const weeks = parseInt(match[1], 10);
      return weeks + ' ' + (weeks === 1 ? 'week' : 'weeks');
    }
    return goalProjectionText;
  }, [goalProjectionText]);

  const advancePhase = (from: number) => {
    const next = from + 1;
    Animated.timing(phaseOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      phaseTranslateY.setValue(12);
      setPhase(next);
      Animated.parallel([
        Animated.timing(phaseOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(phaseTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // Start progress bar animation for phase 1 (loops continuously)
  useEffect(() => {
    progressAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: false,
      }),
      { resetBeforeIteration: true }
    );
    loop.start();
    return () => loop.stop();
  }, [progressAnim]);

  // Phase auto-advance chain
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let currentPhase = 1;
    const scheduleNext = (p: number) => {
      if (p > PHASE_DURATIONS.length) return;
      const duration = PHASE_DURATIONS[p - 1];
      timerRef.current = setTimeout(() => {
        advancePhase(p);
        currentPhase = p + 1;
        scheduleNext(currentPhase);
      }, duration);
    };
    scheduleNext(currentPhase);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseTransform = [{ translateY: phaseTranslateY }];

  if (saveError) {
    return (
      <View style={styles.s9Root}>
        <LinearGradient
          colors={[BG_DARK, BG_MID, BG_DARK]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.s9Glow} />
        <FloatingParticles />
        <View style={styles.s9ContentLayer}>
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{saveError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                console.log('[Onboarding] Step 9: Retry pressed');
                onRetry();
              }}
            >
              <Text style={styles.retryBtnText}>{'Try Again'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.s9Root}>
      <LinearGradient
        colors={[BG_DARK, BG_MID, BG_DARK]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.s9Glow} />
      <FloatingParticles />
      <View style={styles.s9ContentLayer}>
        <Animated.View
          style={[
            styles.s9AnimatedContent,
            { opacity: phaseOpacity, transform: phaseTransform },
          ]}
        >
          {phase === 1 && (
            <>
              <Phase1Saving progressAnim={progressAnim} />
              {saving && (
                <ActivityIndicator
                  color={ACCENT}
                  size="small"
                  style={styles.s9Spinner}
                />
              )}
            </>
          )}
          {phase === 2 && (
            <Phase2 underestimatePercent={underestimatePercent} />
          )}
          {phase === 3 && (
            <Phase3
              displayCalories={displayCalories}
              displayProtein={displayProtein}
              displayCarbs={displayCarbs}
              displayFats={displayFats}
            />
          )}
          {phase === 4 && <Phase4 weeksText={weeksText} />}
          {phase === 5 && <Phase5 onNext={onNext} />}
        </Animated.View>
      </View>
    </View>
  );
}

// ─── STEP 10 — PURCHASE ───────────────────────────────────────────────────────

const MILESTONE_PCTS = [0.15, 0.50, 0.70, 1.00] as const;

function computeMilestoneWeeks(totalWeeks: number): number[] {
  const raw = MILESTONE_PCTS.map((p) => Math.max(1, Math.round(totalWeeks * p)));
  const adjusted: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const min = i === 0 ? 1 : adjusted[i - 1] + 1;
    adjusted.push(Math.max(raw[i], min));
  }
  adjusted[adjusted.length - 1] = totalWeeks;
  for (let i = adjusted.length - 2; i >= 0; i--) {
    if (adjusted[i] >= adjusted[i + 1]) {
      adjusted[i] = adjusted[i + 1] - 1;
    }
  }
  return adjusted;
}

function Step10({
  onStartTrial,
  onSkip,
  totalWeeks,
  goalWeight,
  weightUnit,
  currentWeight,
  lossRateLbsPerWeek,
  units,
  goalType,
}: {
  onStartTrial: () => void;
  onSkip: () => void;
  totalWeeks: number;
  goalWeight: string;
  weightUnit: string;
  currentWeight: string;
  lossRateLbsPerWeek: number;
  units: 'metric' | 'imperial';
  goalType: 'lose' | 'gain' | 'maintain';
}) {
  const milestoneWeeks = totalWeeks > 0 ? computeMilestoneWeeks(totalWeeks) : [];

  useEffect(() => {
    console.log('[Onboarding] Step 10: timeline rendered with weeks', milestoneWeeks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentWeightNum = parseFloat(currentWeight) || 0;
  const goalWeightNum = parseFloat(goalWeight) || 0;
  const goalWeightInt = Math.round(goalWeightNum);

  const rateInUserUnit = units === 'imperial'
    ? lossRateLbsPerWeek
    : lossRateLbsPerWeek * 0.453592;
  const gainRateInUserUnit = units === 'imperial' ? 0.5 : 0.5 * 0.453592;

  const estimatedWeights: number[] = milestoneWeeks.slice(0, 3).map((week, i) => {
    if (currentWeightNum === 0 || goalWeightNum === 0) return 0;
    let est: number;
    if (goalType === 'lose') {
      est = currentWeightNum - rateInUserUnit * milestoneWeeks[i];
      est = Math.max(est, goalWeightNum);
    } else if (goalType === 'gain') {
      est = currentWeightNum + gainRateInUserUnit * milestoneWeeks[i];
      est = Math.min(est, goalWeightNum);
    } else {
      est = currentWeightNum;
    }
    return Math.round(est);
  });
  // Pad to length 3 in case milestoneWeeks has fewer entries
  while (estimatedWeights.length < 3) estimatedWeights.push(0);

  const TIMELINE_NODES = [
    {
      weekLabel: 'Today',
      title: `Your Personalized Path to ${goalWeightInt} ${weightUnit} Is Ready 🎯`,
      lines: [
        'Personalized meal plan',
        'Custom grocery list',
      ],
      isToday: true,
      isFinal: false,
      pctIndex: -1,
    },
    {
      weekLabel: '',
      title: "It's Finally Working 📉",
      lines: [
        `Estimated Weight: ${estimatedWeights[0]} ${weightUnit}`,
        "The scale is moving down & you're building real momentum",
      ],
      isToday: false,
      isFinal: false,
      pctIndex: 0,
    },
    {
      weekLabel: '',
      title: 'People Are Starting to Notice 👀',
      lines: [
        `Estimated Weight: ${estimatedWeights[1]} ${weightUnit}`,
        'Your clothes are fitting better & the compliments are starting',
      ],
      isToday: false,
      isFinal: false,
      pctIndex: 1,
    },
    {
      weekLabel: '',
      title: "You're Becoming a New You 🔥",
      lines: [
        `Estimated Weight: ${estimatedWeights[2]} ${weightUnit}`,
        'The mirror reflects your progress & healthy habits feel natural',
      ],
      isToday: false,
      isFinal: false,
      pctIndex: 2,
    },
    {
      weekLabel: '',
      title: 'You Finally Did It !!',
      lines: [
        `Reached ${goalWeightInt} ${weightUnit}`,
        'You love what you see in the mirror',
      ],
      isToday: false,
      isFinal: true,
      pctIndex: 3,
    },
  ];

  return (
    <View style={[styles.fullScreen, { backgroundColor: '#000000' }]}>
      <SafeAreaView style={styles.step10Safe} edges={['top', 'bottom']}>
        <ScrollView
            contentContainerStyle={styles.step10Scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <Text style={styles.step10Title}>{'Your transformation\nstarts today.'}</Text>
            <Text style={styles.step10Sub}>
              {"Here's what your journey will look like."}
            </Text>

            {/* Timeline or fallback */}
            {totalWeeks <= 0 ? (
              <View style={styles.timelineFallback}>
                <Text style={styles.timelineFallbackTitle}>{"You're already where you want to be."}</Text>
                <Text style={styles.timelineFallbackSub}>{"Let's keep you there with a system built for consistency."}</Text>
              </View>
            ) : (
              <View style={styles.timelineContainer}>
                {/* Vertical connecting line */}
                <View style={styles.timelineLineTrack} />

                {TIMELINE_NODES.map((node, idx) => {
                  const isToday = node.isToday;
                  const isFinal = node.isFinal;
                  const weekLabel = isToday
                    ? 'Today'
                    : node.pctIndex >= 0 && milestoneWeeks[node.pctIndex] !== undefined
                      ? `Week ${milestoneWeeks[node.pctIndex]}`
                      : '';
                  const weekLabelColor = isToday || isFinal
                    ? PRIMARY
                    : 'rgba(255,255,255,0.55)';
                  const titleStyle = node.title.startsWith('"')
                    ? [styles.timelineTitle, styles.timelineTitleItalic]
                    : [styles.timelineTitle];

                  return (
                    <View key={idx} style={styles.timelineRow}>
                      {/* Dot column */}
                      <View style={styles.timelineDotCol}>
                        {isToday ? (
                          <View style={styles.timelineDotToday} />
                        ) : isFinal ? (
                          <View style={styles.timelineDotFinal} />
                        ) : (
                          <View style={styles.timelineDotMid} />
                        )}
                      </View>

                      {/* Text block */}
                      <View style={styles.timelineTextBlock}>
                        <View style={styles.timelineWeekRow}>
                          <Text style={[styles.timelineWeekLabel, { color: weekLabelColor }]}>
                            {weekLabel}
                          </Text>
                          {isFinal && (
                            <View style={styles.timelineGoalPill}>
                              <Text style={styles.timelineGoalPillText}>{'GOAL'}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={titleStyle}>{node.title}</Text>
                        {node.lines.map((line, li) => (
                          <Text key={li} style={styles.timelineSubLine}>{line}</Text>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* CTA */}
            <TouchableOpacity
              style={styles.purchaseBtn}
              onPress={() => {
                console.log('[Onboarding] Step 10: Start My Personalized Plan pressed');
                onStartTrial();
              }}
            >
              <Text style={styles.purchaseBtnText}>{'Start My Personalized Plan'}</Text>
            </TouchableOpacity>

            {/* Skip */}
            <TouchableOpacity
              onPress={() => {
                console.log('[Onboarding] Step 10: I\'ll do everything manually pressed');
                onSkip();
              }}
              style={styles.skipLink}
            >
              <Text style={styles.skipLinkText}>{"I'll do everything manually"}</Text>
            </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  flex1: {
    flex: 1,
  },
  stepContainer: {
    flex: 1,
  },
  fullScreen: {
    flex: 1,
  },

  // Progress bar
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  progressFill: {
    height: 3,
    backgroundColor: PRIMARY,
  },

  // Back button
  backBtn: {
    position: 'absolute',
    top: 8,
    left: 0,
    zIndex: 20,
    padding: 16,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 32,
  },

  // Safe area spacer for steps
  safeTop: {
    height: 56,
  },

  // Step scroll container
  stepScroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  // Step 0
  step0Safe: {
    flex: 1,
    justifyContent: 'center',
  },
  step0Content: {
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  step0Headline: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 42,
  },
  step0Sub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 24,
  },

  // Step 9
  step9Scroll: {
  },
  step9Title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  step9Sub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginBottom: 32,
  },
  loadingBlock: {
    alignItems: 'center',
    marginTop: 40,
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
  },
  errorBlock: {
    alignItems: 'center',
    marginTop: 40,
    gap: 16,
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 15,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statUnit: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.6)',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  projectionBox: {
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderColor: PRIMARY,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
    marginBottom: 24,
    width: '100%',
  },
  projectionText: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Step 10
  step10Safe: {
    flex: 1,
  },
  step10Scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  step10Label: {
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  step10Title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 6,
  },
  step10Sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  skipLink: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipLinkText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    textAlign: 'center',
  },
  purchaseBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  purchaseBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  trialNote: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
  },

  // Timeline
  timelineContainer: {
    position: 'relative',
    marginBottom: 24,
    paddingLeft: 0,
  },
  timelineLineTrack: {
    position: 'absolute',
    left: 13,
    top: 14,
    bottom: 14,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 22,
  },
  timelineDotCol: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  timelineDotToday: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  timelineDotMid: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  timelineDotFinal: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  timelineTextBlock: {
    flex: 1,
    paddingLeft: 10,
  },
  timelineWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  timelineWeekLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  timelineGoalPill: {
    backgroundColor: PRIMARY,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timelineGoalPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 4,
  },
  timelineTitleItalic: {
    fontStyle: 'italic',
  },
  timelineSubLine: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 18,
    marginBottom: 2,
  },
  timelineFallback: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  timelineFallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  timelineFallbackSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Shared step titles
  stepTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 28,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 28,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 10,
    marginTop: 20,
  },
  fieldHelper: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
    marginTop: -6,
  },

  // Primary button
  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  // Selection cards
  cardList: {
    gap: 12,
    marginBottom: 8,
  },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 16,
  },
  selectionCardSelected: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderColor: PRIMARY,
  },
  cardEmoji: {
    fontSize: 28,
  },
  cardTextBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  cardTitleSelected: {
    color: '#FFFFFF',
  },
  cardSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  cardSubtitleSelected: {
    color: 'rgba(255,255,255,0.7)',
  },

  // Two-card row (sex, units)
  twoCardRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  twoCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 6,
  },
  twoCardSelected: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderColor: PRIMARY,
  },
  twoCardEmoji: {
    fontSize: 28,
  },
  twoCardLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  twoCardLabelSelected: {
    color: PRIMARY,
  },
  twoCardSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  twoCardSubSelected: {
    color: 'rgba(76,175,80,0.8)',
  },

  // Inputs
  bigInput: {
    height: 56,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: '#FFFFFF',
    fontSize: 20,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  inputWithSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputSuffix: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontWeight: '600',
    minWidth: 32,
  },
  twoInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  twoInputItem: {
    flex: 1,
    gap: 6,
  },
  multilineInput: {
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: '#FFFFFF',
    fontSize: 15,
    padding: 14,
    textAlignVertical: 'top',
  },

  // Speed chips (2x2 grid)
  speedSection: {
    marginTop: 8,
  },
  speedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  speedChip: {
    width: '47%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  speedChipSelected: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderColor: PRIMARY,
  },
  speedChipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  speedChipLabelSelected: {
    color: PRIMARY,
  },
  speedChipSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  speedChipSubSelected: {
    color: 'rgba(76,175,80,0.7)',
  },

  // Chips (dietary, protein, recipe)
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipSelected: {
    backgroundColor: 'rgba(76,175,80,0.2)',
    borderColor: PRIMARY,
  },
  chipText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  chipTextSelected: {
    color: PRIMARY,
    fontWeight: '600',
  },

  // Hope bullets
  hopeBullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderLeftWidth: 3,
    borderLeftColor: PRIMARY,
    marginBottom: 12,
  },
  hopeBulletIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  hopeBulletText: {
    flex: 1,
  },
  hopeBulletTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  hopeBulletBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 19,
  },

  // ── Step 9 cinematic ──────────────────────────────────────────────────────
  s9Root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  s9Glow: {
    position: 'absolute',
    width: 600,
    height: 600,
    borderRadius: 300,
    backgroundColor: '#8EFF7A',
    opacity: 0.06,
    top: '50%',
    left: '50%',
    marginTop: -300,
    marginLeft: -300,
  },
  s9Particle: {
    position: 'absolute',
    backgroundColor: '#8EFF7A',
  },
  s9ContentLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  s9AnimatedContent: {
    width: '100%',
    alignItems: 'center',
  },
  s9PhaseCenter: {
    alignItems: 'center',
    width: '100%',
  },
  // Phase 1
  s9Phase1Title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 40,
  },
  s9ProgressContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    width: 240,
  },
  s9ProgressTrack: {
    width: 240,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  s9ProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8EFF7A',
    shadowColor: '#8EFF7A',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  s9Chip: {
    position: 'absolute',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  s9Spinner: {
    marginTop: 24,
  },
  // Phase 2
  s9Phase2Text: {
    fontSize: 22,
    fontWeight: '500',
    color: '#FFFFFF',
    lineHeight: 32,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 40,
  },
  s9Accent: {
    color: '#8EFF7A',
  },
  s9BarChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
  },
  s9Bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: '#8EFF7A',
  },
  // Phase 3
  s9Phase3Headline: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 30,
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  s9GlassCard: {
    borderRadius: 24,
    width: '85%',
    maxWidth: 340,
    overflow: 'hidden',
  },
  s9GlassOverlay: {
    padding: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  s9MacroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  s9MacroItem: {
    width: '45%',
  },
  s9MacroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  s9MacroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EFF7A',
  },
  s9MacroLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  s9MacroValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  s9MacroUnit: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  s9Phase3Sub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 20,
    textAlign: 'center',
  },
  // Phase 4
  s9Phase4Text: {
    fontSize: 24,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 48,
    paddingHorizontal: 24,
  },
  s9TimelineWrap: {
    width: 260,
    height: 20,
    justifyContent: 'center',
    position: 'relative',
  },
  s9TimelineTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 1,
  },
  s9TimelineFill: {
    position: 'absolute',
    left: 0,
    height: 2,
    backgroundColor: '#8EFF7A',
    borderRadius: 1,
    shadowColor: '#8EFF7A',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  s9TimelineNode: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8EFF7A',
    top: 6,
  },
  // Phase 5
  s9Phase5Text: {
    fontSize: 24,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 28,
  },
  s9EmojiRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  s9FoodEmoji: {
    fontSize: 36,
  },
  s9Phase5Sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 24,
    textAlign: 'center',
  },
  s9ContinueBtn: {
    backgroundColor: '#8EFF7A',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginTop: 40,
    shadowColor: '#8EFF7A',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  s9ContinueBtnText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 16,
  },
});
