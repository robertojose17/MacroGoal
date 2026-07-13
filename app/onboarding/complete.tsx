import React, { useState, useRef, useEffect } from 'react';
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
import { supabase } from '@/lib/supabase/client';
import { trackEvent } from '@/utils/analytics';
import { trackOnboardingEvent, trackPaywallActionOnce, getOrCreateSessionId } from '@/utils/onboardingAnalytics';
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
  const trackedStepRef = useRef<number>(-1);
  const sessionIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    getOrCreateSessionId().then(id => {
      sessionIdRef.current = id;
      console.log('[Onboarding] Session ID captured at mount:', id);
    });
  }, []);

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
  const bullet4Anim = useRef(new Animated.Value(0)).current;
  const bullet5Anim = useRef(new Animated.Value(0)).current;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    trackOnboardingEvent('onboarding_step_completed', step);
    goToStep(step + 1);
  };

  const goBack = () => {
    if (step > 0) {
      console.log(`[Onboarding] Going back from step ${step} to step ${step - 1}`);
      trackOnboardingEvent('onboarding_back_tapped', step);
      goToStep(step - 1);
    }
  };

  // ─── Bullet animations (step 2) ────────────────────────────────────────────

  useEffect(() => {
    if (step === 2) {
      bullet1Anim.setValue(0);
      bullet2Anim.setValue(0);
      bullet3Anim.setValue(0);
      bullet4Anim.setValue(0);
      bullet5Anim.setValue(0);
      Animated.sequence([
        Animated.timing(bullet1Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(bullet2Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(bullet3Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(bullet4Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(bullet5Anim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ─── Step viewed tracking ──────────────────────────────────────────────────

  useEffect(() => {
    if (trackedStepRef.current === step) return; // already tracked this step
    trackedStepRef.current = step;
    console.log(`[Onboarding] Step ${step} viewed`);
    trackOnboardingEvent('onboarding_step_viewed', step);
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    console.log('[Onboarding] Start Free Trial pressed');
    await trackPaywallActionOnce('trial', sessionIdRef.current ?? undefined);
    await showNotifPromptThen(() => router.push('/subscription?autoStart=true'));
  };

  const handleSkipTrial = async () => {
    console.log('[Onboarding] Skip trial pressed');
    await trackPaywallActionOnce('skip', sessionIdRef.current ?? undefined);
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
            bullet4Anim={bullet4Anim}
            bullet5Anim={bullet5Anim}
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
            units={units}
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
            calories={calcCalories}
            protein={calcProtein}
            carbs={calcCarbs}
            fats={calcFats}
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
            <Text style={styles.step0Headline}>{'Lose your first 10 lbs\nin 30 days.'}</Text>
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
  { icon: '😍', title: 'People will notice the difference before you mention it', body: '' },
  { icon: '👕', title: "You'll choose clothes because you love them—not because they hide you", body: '' },
  { icon: '⚡', title: "You'll wake up with more energy, confidence, and momentum", body: '' },
  { icon: '🧒', title: "You'll become the parent who plays, runs, and keeps up", body: '' },
  { icon: '❤️', title: "And you'll build a healthier body that stays with the people who need you", body: '' },
];

function Step2({
  bullet1Anim,
  bullet2Anim,
  bullet3Anim,
  bullet4Anim,
  bullet5Anim,
  onNext,
}: {
  bullet1Anim: Animated.Value;
  bullet2Anim: Animated.Value;
  bullet3Anim: Animated.Value;
  bullet4Anim: Animated.Value;
  bullet5Anim: Animated.Value;
  onNext: () => void;
}) {
  const anims = [bullet1Anim, bullet2Anim, bullet3Anim, bullet4Anim, bullet5Anim];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <Text style={styles.stepTitle}>{"This isn't just about losing weight"}</Text>
        <Text style={styles.stepSubtitle}>{"It's about what changes when you finally take control:"}</Text>

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

function getSpeedOptions(units: 'metric' | 'imperial') {
  if (units === 'metric') {
    return [
      { value: 0.5, label: '0.25 kg/week', sub: 'Slow & steady' },
      { value: 1.0, label: '0.5 kg/week',  sub: 'Moderate' },
      { value: 1.5, label: '0.75 kg/week', sub: 'Fast' },
      { value: 2.0, label: '1.0 kg/week',  sub: 'Aggressive' },
    ];
  }
  return [
    { value: 0.5, label: '0.5 lb/week', sub: 'Slow & steady' },
    { value: 1.0, label: '1.0 lb/week', sub: 'Moderate' },
    { value: 1.5, label: '1.5 lb/week', sub: 'Fast' },
    { value: 2.0, label: '2.0 lb/week', sub: 'Aggressive' },
  ];
}

function Step5({
  goalType,
  setGoalType,
  lossRateLbsPerWeek,
  setLossRateLbsPerWeek,
  units,
  onNext,
}: {
  goalType: GoalType;
  setGoalType: (v: GoalType) => void;
  lossRateLbsPerWeek: number;
  setLossRateLbsPerWeek: (v: number) => void;
  units: 'metric' | 'imperial';
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
              {getSpeedOptions(units).map((opt) => {
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

// ─── STEP 9 — RESULTS ────────────────────────────────────────────────────────

function Step9({
  saving,
  saveError,
  calories,
  protein,
  carbs,
  fats,
  goalProjectionText,
  onRetry,
  onNext,
}: {
  saving: boolean;
  saveError: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  goalProjectionText: string;
  onRetry: () => void;
  onNext: () => void;
}) {
  return (
    <View style={[styles.fullScreen, { backgroundColor: '#000000' }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <ScrollView
          contentContainerStyle={styles.stepScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SafeAreaView edges={['top']} style={styles.safeTop} />

          {saving ? (
            <View style={styles.s9LoadingBlock}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text style={styles.s9LoadingText}>Building your plan…</Text>
            </View>
          ) : saveError ? (
            <View style={styles.s9ErrorBlock}>
              <Text style={styles.s9ErrorText}>{saveError}</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={onRetry}>
                <Text style={styles.primaryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.stepTitle}>Your plan is ready 🎯</Text>
              <Text style={styles.stepSubtitle}>{goalProjectionText}</Text>

              <View style={styles.s9Grid}>
                <View style={styles.s9StatCard}>
                  <Text style={styles.s9StatEmoji}>🔥</Text>
                  <Text style={styles.s9StatValue}>{calories.toLocaleString()}</Text>
                  <Text style={styles.s9StatUnit}>kcal</Text>
                  <Text style={styles.s9StatLabel}>Daily Calories</Text>
                </View>
                <View style={styles.s9StatCard}>
                  <Text style={styles.s9StatEmoji}>🥩</Text>
                  <Text style={styles.s9StatValue}>{protein}g</Text>
                  <Text style={styles.s9StatUnit}> </Text>
                  <Text style={styles.s9StatLabel}>Protein</Text>
                </View>
                <View style={styles.s9StatCard}>
                  <Text style={styles.s9StatEmoji}>🍚</Text>
                  <Text style={styles.s9StatValue}>{carbs}g</Text>
                  <Text style={styles.s9StatUnit}> </Text>
                  <Text style={styles.s9StatLabel}>Carbs</Text>
                </View>
                <View style={styles.s9StatCard}>
                  <Text style={styles.s9StatEmoji}>🥑</Text>
                  <Text style={styles.s9StatValue}>{fats}g</Text>
                  <Text style={styles.s9StatUnit}> </Text>
                  <Text style={styles.s9StatLabel}>Fat</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={onNext}
              >
                <Text style={styles.primaryBtnText}>Show Me My Roadmap →</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  s9LoadingBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 16,
  },
  s9LoadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  s9ErrorBlock: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    gap: 16,
    paddingHorizontal: 8,
  },
  s9ErrorText: {
    color: '#FF6B6B',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  s9Grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  s9StatCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 16,
    alignItems: 'center',
  },
  s9StatEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  s9StatValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  s9StatUnit: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  s9StatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
    textAlign: 'center',
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


});
