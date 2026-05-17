import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { createMealPlan, addMealPlanItem } from '@/utils/mealPlansApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  serving_size: number;
  serving_unit: string;
  serving_description: string;  // cooking method only: "grilled", "steamed", "raw"
  note?: string;                 // optional extra context for this ingredient
  // Hidden per-gram bases — set once so unit cycling stays accurate
  _base_calories_per_gram?: number;
  _base_protein_per_gram?: number;
  _base_carbs_per_gram?: number;
  _base_fats_per_gram?: number;
  _base_fiber_per_gram?: number;
}

interface MealSection {
  dish_description?: string;
  recipe_url?: string;
  meal_name?: string;
  items: PlanFood[];
}

interface GeneratedPlan {
  breakfast: MealSection | PlanFood[];
  lunch: MealSection | PlanFood[];
  dinner: MealSection | PlanFood[];
  snack: MealSection | PlanFood[];
}

interface UserGoals {
  daily_calories: number;
  daily_protein: number;
  daily_carbs: number;
  daily_fats: number;
}

interface UserPreferences {
  dietary_restrictions: string[] | null;
  protein_preferences: string[] | null;
  recipe_styles: string[] | null;
  disliked_foods: string | null;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type ScreenStep = 'preferences' | 'generating' | 'plan';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAL = '#14B8A6';

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
const MEAL_SECTIONS: { key: MealType; label: string; emoji: string }[] = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { key: 'lunch', label: 'Lunch', emoji: '☀️' },
  { key: 'dinner', label: 'Dinner', emoji: '🌙' },
  { key: 'snack', label: 'Snack', emoji: '🍎' },
];

const REPLACE_SUGGESTIONS = ['Something lighter', 'More protein', 'Vegetarian', 'Mediterranean', 'High fiber', 'Low carb'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayStr(): string {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

function getMealItems(meal: MealSection | PlanFood[] | undefined): PlanFood[] {
  if (!meal) return [];
  if (Array.isArray(meal)) return meal;
  return meal?.items || [];
}

function getMealDescription(meal: MealSection | PlanFood[] | undefined): string | null {
  if (!meal) return null;
  if (Array.isArray(meal)) return null;
  return meal?.dish_description || null;
}

function getMealRecipeUrl(meal: MealSection | PlanFood[] | undefined): string | null {
  if (!meal) return null;
  if (Array.isArray(meal)) return null;
  return meal?.recipe_url || null;
}

function getMealName(meal: MealSection | PlanFood[] | undefined): string | null {
  if (!meal) return null;
  if (Array.isArray(meal)) return null;
  return meal?.meal_name || null;
}

// Approximate calories per gram for common foods — used to infer serving size
const CAL_PER_GRAM: Record<string, number> = {
  // Grains/starches
  'oat': 3.89, 'oats': 3.89, 'rolled oat': 3.89, 'quinoa': 1.2, 'rice': 1.3, 'brown rice': 1.11,
  'white rice': 1.3, 'pasta': 1.31, 'bread': 2.65, 'toast': 2.65, 'whole wheat bread': 2.47,
  'whole wheat toast': 2.47, 'bagel': 2.57, 'tortilla': 2.18, 'corn tortilla': 2.18,
  // Proteins
  'chicken breast': 1.65, 'chicken': 1.65, 'grilled chicken': 1.65, 'salmon': 2.08,
  'tuna': 1.16, 'beef': 2.5, 'ground beef': 2.54, 'turkey': 1.89, 'egg': 1.43, 'eggs': 1.43,
  'tofu': 0.76, 'shrimp': 0.99, 'cod': 0.82, 'tilapia': 0.96,
  // Dairy
  'greek yogurt': 0.59, 'yogurt': 0.61, 'cottage cheese': 0.98, 'milk': 0.42,
  'cheese': 4.02, 'mozzarella': 2.8, 'cheddar': 4.03,
  // Vegetables
  'spinach': 0.23, 'broccoli': 0.34, 'mixed vegetables': 0.65, 'vegetables': 0.65,
  'sweet potato': 0.86, 'potato': 0.77, 'carrot': 0.41, 'tomato': 0.18,
  // Fruits
  'banana': 0.89, 'apple': 0.52, 'mixed berries': 0.57, 'berries': 0.57,
  'blueberries': 0.57, 'strawberries': 0.32, 'mango': 0.6,
  // Fats/nuts
  'almond butter': 6.14, 'peanut butter': 5.88, 'butter': 7.17, 'olive oil': 8.84,
  'avocado': 1.6, 'almonds': 5.79, 'walnuts': 6.54, 'cashews': 5.53,
  // Legumes
  'black beans': 1.32, 'chickpeas': 1.64, 'lentils': 1.16,
  // Sweeteners
  'honey': 3.04, 'maple syrup': 2.6,
};

function inferServingSizeFromCalories(food: PlanFood): number | null {
  const calories = Number(food.calories) || 0;
  if (calories <= 0) return null;
  const nameLower = food.name.toLowerCase();
  // Try longest match first
  const keys = Object.keys(CAL_PER_GRAM).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (nameLower.includes(key)) {
      const calPerG = CAL_PER_GRAM[key];
      if (calPerG > 0) {
        return Math.round(calories / calPerG);
      }
    }
  }
  return null;
}

function cleanServingDescription(desc: string): string {
  if (!desc) return '';
  // Remove everything from "with", "topped", "drizzled", "cooked in", "cooked with",
  // "served with", "mixed with", "and" onwards when it introduces ingredients
  const cleaned = desc
    .replace(/\s*(,?\s*cooked\s+(in|with)\s+.*)$/i, '')
    .replace(/\s*(,?\s*topped\s+with\s+.*)$/i, '')
    .replace(/\s*(,?\s*drizzled\s+with\s+.*)$/i, '')
    .replace(/\s*(,?\s*served\s+with\s+.*)$/i, '')
    .replace(/\s*(,?\s*mixed\s+with\s+.*)$/i, '')
    .replace(/\s*(,?\s*with\s+.*)$/i, '')
    .replace(/\s*(,?\s*and\s+\d+.*)$/i, '')  // "and 1 tsp butter"
    .trim();
  // If nothing left, return empty string
  return cleaned;
}

function normalizeServingDescription(food: PlanFood): PlanFood {
  const desc = (food.serving_description || '').trim();
  const currentSize = Number(food.serving_size) || 1;

  // Only attempt fixes when serving_size is suspiciously 1
  if (currentSize > 1) {
    // Always clean the description even if no other normalization happened
    const cleanedDesc = cleanServingDescription(food.serving_description || '');
    if (cleanedDesc !== food.serving_description) {
      return { ...food, serving_description: cleanedDesc };
    }
    return food;
  }

  // Try to extract quantity from description if it starts with a number
  // Matches: "1 slice toasted", "80g cooked", "2 cups raw", "150 g grilled"
  const match = desc.match(/^(\d+(?:\.\d+)?)\s*(g|ml|oz|lb|cup|cups|tbsp|tsp|slice|slices|piece|pieces|large|medium|small|gram|grams|ounce|ounces|unit|units)?\s*(.*)$/i);

  if (match) {
    const extractedSize = parseFloat(match[1]);
    const extractedUnitRaw = (match[2] || '').trim().toLowerCase();
    const cleanDesc = (match[3] || '').trim();

    if (!isNaN(extractedSize) && extractedSize >= 1) {
      const unitMap: Record<string, string> = {
        'g': 'g', 'gram': 'g', 'grams': 'g',
        'ml': 'ml',
        'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz',
        'lb': 'lb',
        'cup': 'cup', 'cups': 'cup',
        'tbsp': 'tbsp',
        'tsp': 'tsp',
        'slice': 'slice', 'slices': 'slice',
        'piece': 'piece', 'pieces': 'piece',
        'unit': 'unit', 'units': 'unit',
        'large': 'unit', 'medium': 'unit', 'small': 'unit',
      };
      const mappedUnit = extractedUnitRaw
        ? (unitMap[extractedUnitRaw] || extractedUnitRaw)
        : (food.serving_unit || 'g');

      return {
        ...food,
        serving_size: extractedSize,
        serving_unit: mappedUnit,
        serving_description: cleanServingDescription(cleanDesc || ''),
      };
    }
  }

  // Description doesn't start with a number — infer serving size from calories
  if (food.serving_unit === 'g' || !food.serving_unit) {
    const inferred = inferServingSizeFromCalories(food);
    if (inferred && inferred > 1) {
      return {
        ...food,
        serving_size: inferred,
        serving_unit: 'g',
        serving_description: cleanServingDescription(desc),
      };
    }
  }

  // Always clean the description even if no other normalization happened
  const cleanedDesc = cleanServingDescription(food.serving_description || '');
  if (cleanedDesc !== food.serving_description) {
    return { ...food, serving_description: cleanedDesc };
  }
  return food;
}

function normalizePlan(plan: GeneratedPlan): GeneratedPlan {
  const normalizeSection = (section: MealSection | PlanFood[] | undefined): MealSection | PlanFood[] => {
    if (!section) return [];
    if (Array.isArray(section)) return section.map(normalizeServingDescription);
    return { ...section, items: section.items.map(normalizeServingDescription) };
  };
  return {
    breakfast: normalizeSection(plan.breakfast),
    lunch: normalizeSection(plan.lunch),
    dinner: normalizeSection(plan.dinner),
    snack: normalizeSection(plan.snack),
  };
}

function sumMacros(foods: PlanFood[]) {
  return foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number(f.calories) || 0),
      protein: acc.protein + (Number(f.protein) || 0),
      carbs: acc.carbs + (Number(f.carbs) || 0),
      fats: acc.fats + (Number(f.fats) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  visible: boolean;
}

function Toast({ message, visible }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1600),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, message, opacity]);

  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

interface LoadingDotsProps {
  color: string;
}

function LoadingDots({ color }: LoadingDotsProps) {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          Animated.delay(800 - delay),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 200);
    const a3 = anim(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.dotsRow}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.dot, { backgroundColor: color, opacity: dot }]} />
      ))}
    </View>
  );
}

// ─── ActivePreferencesSummary ─────────────────────────────────────────────────

interface ActivePreferencesSummaryProps {
  userPreferences: UserPreferences | null;
  secondaryColor: string;
  cardBg: string;
  isDark: boolean;
  onGoToProfile: () => void;
}

function ActivePreferencesSummary({ userPreferences, secondaryColor, cardBg, isDark, onGoToProfile }: ActivePreferencesSummaryProps) {
  const hasRestrictions = userPreferences?.dietary_restrictions && userPreferences.dietary_restrictions.length > 0;
  const hasProteins = userPreferences?.protein_preferences && userPreferences.protein_preferences.length > 0;
  const hasRecipeStyles = userPreferences?.recipe_styles && userPreferences.recipe_styles.length > 0;
  const hasDisliked = !!userPreferences?.disliked_foods;
  const hasAny = hasRestrictions || hasProteins || hasRecipeStyles || hasDisliked;

  const restrictionEmojis: Record<string, string> = {
    vegetarian: '🥗',
    vegan: '🌱',
    'gluten-free': '🌾',
    'dairy-free': '🥛',
    halal: '☪️',
    'nut-free': '🥜',
  };

  if (!hasAny) {
    return (
      <View style={[styles.prefsHintCard, { backgroundColor: cardBg }]}>
        <Text style={[styles.prefsHintText, { color: secondaryColor }]}>
          No food preferences set.{' '}
        </Text>
        <TouchableOpacity onPress={onGoToProfile} activeOpacity={0.7}>
          <Text style={styles.prefsHintLink}>Set food preferences in Profile →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chips: string[] = [];
  if (hasRestrictions) {
    userPreferences!.dietary_restrictions!.forEach(r => {
      const emoji = restrictionEmojis[r] || '✓';
      const label = r.charAt(0).toUpperCase() + r.slice(1);
      chips.push(`${emoji} ${label}`);
    });
  }
  if (hasProteins) {
    userPreferences!.protein_preferences!.forEach(p => {
      chips.push(`🥩 ${p}`);
    });
  }
  if (hasRecipeStyles) {
    userPreferences!.recipe_styles!.forEach(s => {
      const styleEmojis: Record<string, string> = {
        'air-fryer': '🌬️',
        'meal-prep': '📦',
        'under-30-minutes': '⏱️',
        'one-pan-meals': '🍳',
        'slow-cooker': '🫕',
        'instant-pot': '⚡',
        'easy-recipes': '✅',
        'freezer-friendly': '❄️',
      };
      const label = RECIPE_STYLE_OPTIONS.find(o => o.value === s)?.label || s;
      chips.push(`${styleEmojis[s] || '🍽️'} ${label}`);
    });
  }

  return (
    <View style={[styles.prefsHintCard, { backgroundColor: cardBg }]}>
      <View style={styles.prefsHintHeader}>
        <Text style={[styles.prefsHintLabel, { color: secondaryColor }]}>YOUR PREFERENCES APPLIED</Text>
        <TouchableOpacity onPress={onGoToProfile} activeOpacity={0.7}>
          <Text style={styles.prefsHintLink}>Edit →</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.prefsChipsRow}>
        {chips.map((chip, i) => (
          <View key={i} style={[styles.prefsChip, { backgroundColor: isDark ? '#1A3A38' : '#E6FAF8' }]}>
            <Text style={[styles.prefsChipText, { color: TEAL }]}>{chip}</Text>
          </View>
        ))}
        {hasDisliked && (
          <View style={[styles.prefsChip, { backgroundColor: isDark ? '#2C2C2E' : '#F0F2F7' }]}>
            <Text style={[styles.prefsChipText, { color: secondaryColor }]}>
              {'🚫 Dislikes: '}
              <Text numberOfLines={1}>{userPreferences!.disliked_foods}</Text>
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AIMealPlannerScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isMounted = useRef(true);

  // Theme
  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const inputBg = isDark ? '#2C2C2E' : '#F5F5F5';

  // Screen state
  const [step, setStep] = useState<ScreenStep>('preferences');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      console.log('[AIMealPlanner] Keyboard shown');
      setKeyboardVisible(true);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      console.log('[AIMealPlanner] Keyboard hidden');
      setKeyboardVisible(false);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [userGoals, setUserGoals] = useState<UserGoals | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);

  // Preferences
  const [foodPrefs, setFoodPrefs] = useState('');

  // Recipe modal
  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [recipeModalTitle, setRecipeModalTitle] = useState<string | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<string[]>([]);
  const [recipeInstructions, setRecipeInstructions] = useState<string[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);

  // Save plan modal
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [planName, setPlanName] = useState('');
  const [saving, setSaving] = useState(false);

  // Replace sheet — now meal-level
  const [replaceSheetVisible, setReplaceSheetVisible] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{ mealType: MealType; mealLabel: string } | null>(null);
  const [replaceText, setReplaceText] = useState('');
  const [replacing, setReplacing] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastKey = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    loadUserGoals();
    return () => { isMounted.current = false; };
  }, []);

  // ── Load goals ──────────────────────────────────────────────────────────────

  const loadUserGoals = async () => {
    console.log('[AIMealPlanner] loadUserGoals called');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[AIMealPlanner] loadUserGoals: no authenticated user');
        return;
      }
      const [goalsResult, prefsResult] = await Promise.all([
        supabase
          .from('goals')
          .select('daily_calories, protein_g, carbs_g, fats_g')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('users')
          .select('dietary_restrictions, protein_preferences, recipe_styles, disliked_foods')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      if (goalsResult.data && isMounted.current) {
        console.log('[AIMealPlanner] loadUserGoals success:', goalsResult.data);
        setUserGoals({
          daily_calories: goalsResult.data.daily_calories,
          daily_protein: goalsResult.data.protein_g,
          daily_carbs: goalsResult.data.carbs_g,
          daily_fats: goalsResult.data.fats_g,
        });
      } else {
        console.log('[AIMealPlanner] loadUserGoals: no goals found');
      }

      if (prefsResult.data && isMounted.current) {
        console.log('[AIMealPlanner] user preferences loaded:', prefsResult.data);
        setUserPreferences({
          dietary_restrictions: prefsResult.data.dietary_restrictions || null,
          protein_preferences: prefsResult.data.protein_preferences || null,
          recipe_styles: prefsResult.data.recipe_styles || null,
          disliked_foods: prefsResult.data.disliked_foods || null,
        });
      } else {
        console.log('[AIMealPlanner] no user preferences found');
      }
    } catch (e) {
      console.error('[AIMealPlanner] loadUserGoals error:', e);
    }
  };

  // ── Generate plan ───────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!userGoals) {
      Alert.alert('No Goals', 'Please set your macro goals first.');
      return;
    }
    console.log('[AIMealPlanner] Generate My Plan pressed, foodPrefs:', foodPrefs, 'userPreferences:', userPreferences);
    setStep('generating');

    const parts: string[] = ['GENERATE_PLAN: Please create a complete meal plan for me.'];
    if (foodPrefs.trim()) parts.push(`Additional preferences for today: ${foodPrefs.trim()}`);
    const prompt = parts.join(' ');

    try {
      console.log('[AIMealPlanner] invoking generate-meal-plan, prompt:', prompt, 'userPreferences:', userPreferences);
      const { data, error } = await supabase.functions.invoke('generate-meal-plan', {
        body: { messages: [{ role: 'user', content: prompt }], userGoals, userPreferences },
      });
      if (!isMounted.current) return;
      if (error) throw new Error(error.message);

      console.log('[AIMealPlanner] generate-meal-plan response, readyToSave:', data?.readyToSave);

      if (data?.readyToSave && data?.planData) {
        const normalized = normalizePlan(data.planData);
        setGeneratedPlan(normalized);
        setStep('plan');
      } else {
        throw new Error('Plan data not returned. Please try again.');
      }
    } catch (e: any) {
      console.error('[AIMealPlanner] handleGenerate error:', e?.message || e);
      if (!isMounted.current) return;
      setStep('preferences');
      Alert.alert('Error', e?.message || 'Failed to generate plan. Please try again.');
    }
  }, [userGoals, foodPrefs, userPreferences]);

  const handleRegenerate = useCallback(() => {
    console.log('[AIMealPlanner] Regenerate button pressed');
    setGeneratedPlan(null);
    setStep('preferences');
  }, []);

  // ── Add food to log ─────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    toastKey.current += 1;
    setToastMsg(msg);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 10);
  }, []);

  const handleAddFood = useCallback(async (food: PlanFood, mealType: MealType) => {
    console.log('[AIMealPlanner] Add food pressed:', food.name, 'to', mealType);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Error', 'Not authenticated'); return; }

      const todayStr = getTodayStr();
      console.log('[AIMealPlanner] inserting food_log:', food.name, mealType, todayStr);
      const { error } = await supabase.from('food_logs').insert({
        user_id: user.id,
        date: todayStr,
        meal_type: mealType,
        food_name: food.name,
        calories: Math.round(Number(food.calories) || 0),
        protein: Math.round(Number(food.protein) || 0),
        carbs: Math.round(Number(food.carbs) || 0),
        fats: Math.round(Number(food.fats) || 0),
        fiber: Math.round(Number(food.fiber) || 0),
        quantity: 1,
        serving_description: food.serving_description || '1 serving',
      });
      if (error) throw new Error(error.message);

      const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
      console.log('[AIMealPlanner] food added to log successfully:', food.name);
      showToast(`Added to ${mealLabel} ✓`);
    } catch (e: any) {
      console.error('[AIMealPlanner] handleAddFood error:', e?.message || e);
      Alert.alert('Error', 'Failed to add food. Please try again.');
    }
  }, [showToast]);

  const handleAddAllToMeal = useCallback(async (mealType: MealType) => {
    if (!generatedPlan) return;
    const foods = getMealItems(generatedPlan[mealType]);
    console.log('[AIMealPlanner] Add all to meal pressed:', mealType, 'count:', foods.length);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Error', 'Not authenticated'); return; }

      const todayStr = getTodayStr();
      const inserts = foods.map(food => ({
        user_id: user.id,
        date: todayStr,
        meal_type: mealType,
        food_name: food.name,
        calories: Math.round(Number(food.calories) || 0),
        protein: Math.round(Number(food.protein) || 0),
        carbs: Math.round(Number(food.carbs) || 0),
        fats: Math.round(Number(food.fats) || 0),
        fiber: Math.round(Number(food.fiber) || 0),
        quantity: 1,
        serving_description: food.serving_description || '1 serving',
      }));

      console.log('[AIMealPlanner] inserting', inserts.length, 'food_logs for', mealType);
      const { error } = await supabase.from('food_logs').insert(inserts);
      if (error) throw new Error(error.message);

      const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
      console.log('[AIMealPlanner] all foods added to', mealType);
      showToast(`All added to ${mealLabel} ✓`);
    } catch (e: any) {
      console.error('[AIMealPlanner] handleAddAllToMeal error:', e?.message || e);
      Alert.alert('Error', 'Failed to add foods. Please try again.');
    }
  }, [generatedPlan, showToast]);

  // ── Recipe modal ────────────────────────────────────────────────────────────

  const handleOpenRecipe = useCallback(async (mealName: string, foods: PlanFood[]) => {
    console.log('[AIMealPlanner] ••• recipe modal opened for:', mealName, 'foods count:', foods.length);
    setRecipeModalTitle(mealName);
    setRecipeIngredients([]);
    setRecipeInstructions([]);
    setRecipeLoading(true);
    setRecipeModalVisible(true);

    const foodsPayload = foods.map(f => ({
      name: f.name,
      serving_size: f.serving_size ?? 1,
      serving_unit: f.serving_unit || 'g',
      calories: f.calories ?? 0,
      protein: f.protein ?? 0,
      carbs: f.carbs ?? 0,
      fats: f.fats ?? 0,
    }));

    try {
      console.log('[AIMealPlanner] Calling recipe-details edge function for:', mealName);
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZ3B0ZmlvZm9hZWd1c2xndmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDI4NjcsImV4cCI6MjA3OTExODg2N30.iC4P3lp4fJHLsYNWBwHwFwGP-WZuJONETOYd2q1lQWA";
      const response = await fetch('https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/recipe-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ meal_name: mealName, foods: foodsPayload }),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('[AIMealPlanner] recipe-details error:', response.status, errText.slice(0, 200));
        setRecipeInstructions(['Failed to generate recipe. Please try again.']);
        return;
      }
      const data = await response.json();
      console.log('[AIMealPlanner] recipe-details response received, ingredients:', data.ingredients?.length, 'instructions:', data.instructions?.length);
      setRecipeIngredients(Array.isArray(data.ingredients) ? data.ingredients : []);
      setRecipeInstructions(Array.isArray(data.instructions) ? data.instructions : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[AIMealPlanner] recipe-details fetch error:', msg);
      setRecipeInstructions(['Failed to generate recipe. Please try again.']);
    } finally {
      setRecipeLoading(false);
    }
  }, []);

  const handleCloseRecipe = useCallback(() => {
    console.log('[AIMealPlanner] recipe modal closed');
    setRecipeModalVisible(false);
    setRecipeModalTitle(null);
    setRecipeIngredients([]);
    setRecipeInstructions([]);
  }, []);

  // ── Replace meal ────────────────────────────────────────────────────────────

  const handleOpenReplace = useCallback((mealType: MealType, mealLabel: string) => {
    console.log('[AIMealPlanner] Replace Meal button pressed for:', mealLabel, '(', mealType, ')');
    setReplaceTarget({ mealType, mealLabel });
    setReplaceText('');
    setReplaceSheetVisible(true);
  }, []);

  const handleFoodServingChange = useCallback((
    mealType: MealType,
    foodIndex: number,
    field: 'serving_size' | 'serving_unit',
    value: string | number,
  ) => {
    console.log('[AIMealPlanner] handleFoodServingChange:', mealType, 'index:', foodIndex, 'field:', field, 'value:', value);
    if (!generatedPlan) return;
    const meal = generatedPlan[mealType];
    const items = getMealItems(meal);

    const updatedItems = items.map((f, i) => {
      if (i !== foodIndex) return f;

      const currentSize = Number(f.serving_size) || 1;
      const currentUnit = f.serving_unit || 'g';

      // Convert any unit to grams
      const unitToGrams = (unit: string): number => {
        switch (unit) {
          case 'g':     return 1;
          case 'oz':    return 28.3495;
          case 'lb':    return 453.592;
          case 'slice': return 30;
          case 'cup':   return 240;
          case 'tbsp':  return 15;
          case 'tsp':   return 5;
          case 'piece': return 100;
          case 'medium':return 120;
          default:      return 1; // unknown unit — treat as 1g equivalent (no conversion)
        }
      };

      // Resolve or initialise per-gram bases (set once, never overwritten)
      const currentGrams = currentSize * unitToGrams(currentUnit);
      const baseCalPerG = f._base_calories_per_gram !== undefined
        ? f._base_calories_per_gram
        : currentGrams > 0 ? (Number(f.calories) || 0) / currentGrams : 0;
      const baseProPerG = f._base_protein_per_gram !== undefined
        ? f._base_protein_per_gram
        : currentGrams > 0 ? (Number(f.protein) || 0) / currentGrams : 0;
      const baseCarbPerG = f._base_carbs_per_gram !== undefined
        ? f._base_carbs_per_gram
        : currentGrams > 0 ? (Number(f.carbs) || 0) / currentGrams : 0;
      const baseFatPerG = f._base_fats_per_gram !== undefined
        ? f._base_fats_per_gram
        : currentGrams > 0 ? (Number(f.fats) || 0) / currentGrams : 0;
      const baseFibPerG = f._base_fiber_per_gram !== undefined
        ? f._base_fiber_per_gram
        : currentGrams > 0 ? (Number(f.fiber) || 0) / currentGrams : 0;

      let newSize = currentSize;
      let newUnit = currentUnit;

      if (field === 'serving_size') {
        newSize = Number(value) || currentSize;
      } else if (field === 'serving_unit') {
        newUnit = String(value);
        // Convert current serving_size from currentUnit → grams → newUnit
        const gramsTotal = currentSize * unitToGrams(currentUnit);
        const newUnitGrams = unitToGrams(newUnit);
        newSize = newUnitGrams > 0 ? Math.round((gramsTotal / newUnitGrams) * 10) / 10 : currentSize;
        console.log('[AIMealPlanner] Unit conversion:', currentSize, currentUnit, '->', newSize, newUnit, '(', gramsTotal, 'g)');
      }

      const newGrams = newSize * unitToGrams(newUnit);
      return {
        ...f,
        serving_size: newSize,
        serving_unit: newUnit,
        calories: Math.round(baseCalPerG * newGrams),
        protein: Math.round(baseProPerG * newGrams * 10) / 10,
        carbs: Math.round(baseCarbPerG * newGrams * 10) / 10,
        fats: Math.round(baseFatPerG * newGrams * 10) / 10,
        fiber: Math.round(baseFibPerG * newGrams * 10) / 10,
        _base_calories_per_gram: baseCalPerG,
        _base_protein_per_gram: baseProPerG,
        _base_carbs_per_gram: baseCarbPerG,
        _base_fats_per_gram: baseFatPerG,
        _base_fiber_per_gram: baseFibPerG,
      };
    });

    const updatedMeal = Array.isArray(meal)
      ? updatedItems
      : { ...(meal as any), items: updatedItems };
    setGeneratedPlan({ ...generatedPlan, [mealType]: updatedMeal });
  }, [generatedPlan]);

  const handleReplace = useCallback(async () => {
    if (!replaceTarget || !replaceText.trim() || !userGoals) return;
    const { mealType } = replaceTarget;
    console.log('[AIMealPlanner] Replace submit pressed, mealType:', mealType, 'preference:', replaceText.trim());
    setReplacing(true);

    const prompt = `REPLACE_MEAL: Replace the ${mealType} meal with something different. User preference: ${replaceText.trim()}. Return the COMPLETE updated plan in the same JSON format, keeping all other meals exactly the same, only replacing the ${mealType} items and dish_description.`;
    try {
      console.log('[AIMealPlanner] invoking generate-meal-plan for replace, prompt:', prompt);
      const { data, error } = await supabase.functions.invoke('generate-meal-plan', {
        body: { messages: [{ role: 'user', content: prompt }], userGoals },
      });
      if (!isMounted.current) return;
      if (error) throw new Error(error.message);

      console.log('[AIMealPlanner] replace response, readyToSave:', data?.readyToSave);

      if (data?.readyToSave && data?.planData) {
        const normalized = normalizePlan(data.planData);
        setGeneratedPlan(prev => ({
          ...prev!,
          [mealType]: normalized[mealType],
        }));
        setReplaceSheetVisible(false);
        showToast('Meal replaced ✓');
      } else {
        throw new Error('Could not replace meal. Please try again.');
      }
    } catch (e: any) {
      console.error('[AIMealPlanner] handleReplace error:', e?.message || e);
      Alert.alert('Error', e?.message || 'Failed to replace meal.');
    } finally {
      if (isMounted.current) setReplacing(false);
    }
  }, [replaceTarget, replaceText, userGoals, showToast]);

  // ── Save plan ───────────────────────────────────────────────────────────────

  const handleOpenSaveModal = useCallback(() => {
    console.log('[AIMealPlanner] Save as Plan button pressed');
    setPlanName('');
    setSaveModalVisible(true);
  }, []);

  const handleSavePlan = useCallback(async () => {
    if (!generatedPlan || !planName.trim()) return;
    console.log('[AIMealPlanner] handleSavePlan called, planName:', planName.trim());
    setSaving(true);
    try {
      const dateStr = getTodayStr();
      console.log('[AIMealPlanner] creating meal plan:', planName.trim(), dateStr);
      const newPlan = await createMealPlan({ name: planName.trim(), start_date: dateStr, end_date: dateStr });
      console.log('[AIMealPlanner] meal plan created:', newPlan.id);

      const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
      for (const mealType of mealTypes) {
        const foods = getMealItems(generatedPlan[mealType]);
        for (const food of foods) {
          console.log('[AIMealPlanner] adding meal plan item:', food.name, 'to', mealType);
          await addMealPlanItem(newPlan.id, {
            date: dateStr,
            meal_type: mealType,
            food_name: food.name,
            quantity: food.serving_size > 0 ? food.serving_size : 1,
            serving_description: food.serving_description || '1 serving',
            calories: Math.round(Number(food.calories) || 0),
            protein: Math.round(Number(food.protein) || 0),
            carbs: Math.round(Number(food.carbs) || 0),
            fats: Math.round(Number(food.fats) || 0),
            fiber: Math.round(Number(food.fiber) || 0),
            grams: food.serving_size > 0 ? food.serving_size : null,
            dish_description: getMealDescription(generatedPlan[mealType]) || undefined,
            recipe_url: getMealRecipeUrl(generatedPlan[mealType]) || undefined,
          });
        }
      }

      console.log('[AIMealPlanner] all items saved, navigating to plan detail:', newPlan.id);
      setSaveModalVisible(false);
      router.replace({ pathname: '/meal-plan-detail', params: { planId: newPlan.id } });
    } catch (e: any) {
      console.error('[AIMealPlanner] handleSavePlan error:', e?.message || e);
      Alert.alert('Error', 'Failed to save plan. Please try again.');
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }, [generatedPlan, planName, router]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const totalMacros = generatedPlan
    ? sumMacros([
        ...getMealItems(generatedPlan.breakfast),
        ...getMealItems(generatedPlan.lunch),
        ...getMealItems(generatedPlan.dinner),
        ...getMealItems(generatedPlan.snack),
      ])
    : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  const replaceTitleText = replaceTarget ? `Replace ${replaceTarget.mealLabel}` : 'Replace Meal';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[AIMealPlanner] back button pressed');
            router.back();
          }}
          style={styles.backBtn}
        >
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto_awesome" size={20} color={TEAL} />
          <Text style={[styles.headerTitle, { color: textColor }]}>AI Meal Planner</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Step: Preferences */}
      {step === 'preferences' && (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.prefsContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Hero — hidden when keyboard is visible to give inputs room */}
          {!keyboardVisible && (
            <View style={styles.heroSection}>
              <Text style={styles.heroEmoji}>✨</Text>
              <Text style={[styles.heroTitle, { color: textColor }]}>Let's build your meal plan</Text>
              <Text style={[styles.heroSubtitle, { color: secondaryColor }]}>
                Tell us a bit about your preferences so we can create something you'll actually enjoy.
              </Text>
            </View>
          )}

          {/* Goals chips */}
          {userGoals && (
            <View style={[styles.goalsCard, { backgroundColor: cardBg }]}>
              <Text style={[styles.goalsLabel, { color: secondaryColor }]}>YOUR DAILY GOALS</Text>
              <View style={styles.goalsRow}>
                <View style={[styles.goalChip, { backgroundColor: isDark ? '#2C1F4A' : '#EDE9FE' }]}>
                  <Text style={[styles.goalChipText, { color: colors.calories }]}>{userGoals.daily_calories}</Text>
                  <Text style={[styles.goalChipUnit, { color: colors.calories }]}>kcal</Text>
                </View>
                <View style={[styles.goalChip, { backgroundColor: isDark ? '#3B1F1F' : '#FEE2E2' }]}>
                  <Text style={[styles.goalChipText, { color: colors.protein }]}>{userGoals.daily_protein}g</Text>
                  <Text style={[styles.goalChipUnit, { color: colors.protein }]}>protein</Text>
                </View>
                <View style={[styles.goalChip, { backgroundColor: isDark ? '#1F2E4A' : '#DBEAFE' }]}>
                  <Text style={[styles.goalChipText, { color: colors.carbs }]}>{userGoals.daily_carbs}g</Text>
                  <Text style={[styles.goalChipUnit, { color: colors.carbs }]}>carbs</Text>
                </View>
                <View style={[styles.goalChip, { backgroundColor: isDark ? '#3B2E1F' : '#FEF3C7' }]}>
                  <Text style={[styles.goalChipText, { color: colors.fats }]}>{userGoals.daily_fats}g</Text>
                  <Text style={[styles.goalChipUnit, { color: colors.fats }]}>fats</Text>
                </View>
              </View>
            </View>
          )}

          {/* Active preferences summary */}
          <ActivePreferencesSummary
            userPreferences={userPreferences}
            secondaryColor={secondaryColor}
            cardBg={cardBg}
            isDark={isDark}
            onGoToProfile={() => {
              console.log('[AIMealPlanner] Set food preferences link pressed, navigating to profile tab');
              router.push('/(tabs)/profile');
            }}
          />

          {/* Inputs */}
          <View style={styles.inputsSection}>
            <Text style={[styles.inputLabel, { color: secondaryColor }]}>ANYTHING SPECIAL TODAY?</Text>
            <TextInput
              style={[styles.prefInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
              placeholder="e.g. I want something spicy, extra protein"
              placeholderTextColor={secondaryColor}
              value={foodPrefs}
              onChangeText={setFoodPrefs}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              maxLength={300}
            />
          </View>

          {/* Generate button — inside scroll view */}
          <TouchableOpacity
            style={[styles.generateBtn, { opacity: userGoals ? 1 : 0.5, marginTop: 24 }]}
            onPress={handleGenerate}
            disabled={!userGoals}
            activeOpacity={0.85}
          >
            <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto_awesome" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>Generate My Plan</Text>
          </TouchableOpacity>
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Step: Generating */}
      {step === 'generating' && (
        <View style={styles.generatingContainer}>
          <View style={[styles.generatingCard, { backgroundColor: cardBg }]}>
            <Text style={styles.generatingEmoji}>🍽️</Text>
            <Text style={[styles.generatingTitle, { color: textColor }]}>Creating your personalized plan...</Text>
            <Text style={[styles.generatingSubtitle, { color: secondaryColor }]}>
              Our AI is crafting meals tailored to your goals and preferences.
            </Text>
            <LoadingDots color={TEAL} />
          </View>
        </View>
      )}

      {/* Step: Plan */}
      {step === 'plan' && generatedPlan && (
        <>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.planContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Plan header */}
            <View style={styles.planHeader}>
              <Text style={[styles.planTitle, { color: textColor }]}>Your Meal Plan</Text>
              {totalMacros && (
                <View style={styles.totalMacrosRow}>
                  <MacroPill value={totalMacros.calories} unit="kcal" color={colors.calories} bg={isDark ? '#2C1F4A' : '#EDE9FE'} />
                  <MacroPill value={totalMacros.protein} unit="P" color={colors.protein} bg={isDark ? '#3B1F1F' : '#FEE2E2'} />
                  <MacroPill value={totalMacros.carbs} unit="C" color={colors.carbs} bg={isDark ? '#1F2E4A' : '#DBEAFE'} />
                  <MacroPill value={totalMacros.fats} unit="F" color={colors.fats} bg={isDark ? '#3B2E1F' : '#FEF3C7'} />
                </View>
              )}
            </View>

            {/* Meal sections */}
            {MEAL_SECTIONS.map(section => {
              const meal = generatedPlan[section.key];
              const foods = getMealItems(meal);
              const description = getMealDescription(meal);
              const mealNameVal = getMealName(meal) || description;
              const sectionMacros = sumMacros(foods);
              return (
                <MealSectionCard
                  key={section.key}
                  section={section}
                  foods={foods}
                  dishDescription={description}
                  mealName={mealNameVal}
                  sectionCalories={sectionMacros.calories}
                  isDark={isDark}
                  textColor={textColor}
                  secondaryColor={secondaryColor}
                  cardBg={cardBg}
                  borderColor={borderColor}
                  inputBg={inputBg}
                  onReplaceMeal={handleOpenReplace}
                  onServingChange={handleFoodServingChange}
                  onOpenRecipe={(mealName, mealFoods) => handleOpenRecipe(mealName, mealFoods)}
                />
              );
            })}

            <View style={styles.planBottomSpacer} />
          </ScrollView>

          {/* Sticky bottom bar */}
          <View style={[styles.stickyBar, { backgroundColor: bgColor, borderTopColor: borderColor }]}>
            <TouchableOpacity
              style={[styles.regenBtn, { borderColor }]}
              onPress={handleRegenerate}
              activeOpacity={0.8}
            >
              <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={16} color={textColor} />
              <Text style={[styles.regenBtnText, { color: textColor }]}>Regenerate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleOpenSaveModal}
              activeOpacity={0.85}
            >
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Save as Plan</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} key={toastKey.current} />

      {/* Save Plan Modal — Bug 1 fix: KeyboardAvoidingView inside Modal */}
      <Modal
        visible={saveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSaveModalVisible(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : 'padding'}
          keyboardVerticalOffset={0}
          style={styles.keyboardAvoidingSheet}
        >
          <View style={[styles.bottomSheet, { backgroundColor: isDark ? '#1C1C1E' : '#fff' }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: textColor }]}>Name Your Plan</Text>
            <Text style={[styles.sheetSubtitle, { color: secondaryColor }]}>
              Give your meal plan a name so you can find it later.
            </Text>
            <Text style={[styles.sheetLabel, { color: secondaryColor }]}>PLAN NAME</Text>
            <TextInput
              style={[styles.sheetInput, { backgroundColor: isDark ? '#2C2C2E' : '#F5F5F5', color: textColor }]}
              value={planName}
              onChangeText={setPlanName}
              placeholder="e.g. Healthy Week 1"
              placeholderTextColor={secondaryColor}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSavePlan}
            />
            <TouchableOpacity
              style={[styles.sheetPrimaryBtn, { opacity: saving || !planName.trim() ? 0.5 : 1 }]}
              onPress={handleSavePlan}
              disabled={saving || !planName.trim()}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.sheetPrimaryBtnText}>Save Plan</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Replace Sheet — Bug 2 fix: KeyboardAvoidingView inside Modal */}
      <Modal
        visible={replaceSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReplaceSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !replacing && setReplaceSheetVisible(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'position' : 'padding'}
          keyboardVerticalOffset={0}
          style={styles.keyboardAvoidingSheet}
        >
          <View style={[styles.bottomSheet, { backgroundColor: isDark ? '#1C1C1E' : '#fff' }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: textColor }]}>
              {replaceTitleText}
            </Text>
            <Text style={[styles.sheetSubtitle, { color: secondaryColor }]}>
              Describe what kind of meal you'd like instead
            </Text>
            <TextInput
              style={[styles.sheetInput, { backgroundColor: isDark ? '#2C2C2E' : '#F5F5F5', color: textColor }]}
              value={replaceText}
              onChangeText={setReplaceText}
              placeholder="e.g. something lighter, more protein, Mediterranean style"
              placeholderTextColor={secondaryColor}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleReplace}
              editable={!replacing}
            />
            {/* Quick suggestions */}
            <View style={styles.suggestionsRow}>
              {REPLACE_SUGGESTIONS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.suggestionChip, { backgroundColor: isDark ? '#2C2C2E' : '#F0F2F7', borderColor }]}
                  onPress={() => {
                    console.log('[AIMealPlanner] Replace suggestion tapped:', s);
                    setReplaceText(s);
                  }}
                  disabled={replacing}
                >
                  <Text style={[styles.suggestionChipText, { color: secondaryColor }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.sheetPrimaryBtn, { opacity: replacing || !replaceText.trim() ? 0.5 : 1 }]}
              onPress={handleReplace}
              disabled={replacing || !replaceText.trim()}
              activeOpacity={0.85}
            >
              {replacing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.sheetPrimaryBtnText}>Replace</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Recipe Modal */}
      <Modal visible={recipeModalVisible} transparent={false} animationType="slide" onRequestClose={handleCloseRecipe}>
        <View style={[styles.recipeModalOverlay, { backgroundColor: isDark ? '#1C1C1E' : '#fff' }]}>
          <View style={styles.recipeModalSheet}>
            <View style={styles.recipeModalHeader}>
              <Text style={[styles.recipeModalTitle, { color: isDark ? '#fff' : '#000' }]} numberOfLines={2}>
                {recipeModalTitle || 'Recipe'}
              </Text>
              <TouchableOpacity onPress={handleCloseRecipe} style={styles.recipeModalCloseBtn} activeOpacity={0.7}>
                <Text style={{ fontSize: 22, color: isDark ? '#aaa' : '#666' }}>✕</Text>
              </TouchableOpacity>
            </View>
            {recipeLoading ? (
              <View style={styles.recipeLoadingContainer}>
                <ActivityIndicator size="large" color={TEAL} />
                <Text style={[styles.recipeNoContent, { color: isDark ? '#aaa' : '#666', marginTop: 12 }]}>
                  Generating recipe...
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.recipeModalScroll} showsVerticalScrollIndicator={false}>
                {recipeIngredients.length > 0 && (
                  <View style={styles.recipeSection}>
                    <Text style={[styles.recipeSectionTitle, { color: TEAL }]}>Ingredients</Text>
                    {recipeIngredients.map((ing, i) => (
                      <View key={i} style={styles.recipeIngredientRow}>
                        <Text style={[styles.recipeBullet, { color: TEAL }]}>•</Text>
                        <Text style={[styles.recipeIngredientText, { color: isDark ? '#e0e0e0' : '#222' }]}>{ing}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {recipeInstructions.length > 0 && (
                  <View style={styles.recipeSection}>
                    <Text style={[styles.recipeSectionTitle, { color: TEAL }]}>Instructions</Text>
                    {recipeInstructions.map((step, i) => {
                      const stepNum = i + 1;
                      return (
                        <View key={i} style={styles.recipeIngredientRow}>
                          <Text style={[styles.recipeBullet, { color: TEAL }]}>{stepNum}.</Text>
                          <Text style={[styles.recipeIngredientText, { color: isDark ? '#e0e0e0' : '#222' }]}>{step}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                {recipeIngredients.length === 0 && recipeInstructions.length === 0 && (
                  <Text style={[styles.recipeNoContent, { color: isDark ? '#aaa' : '#666' }]}>
                    No recipe available.
                  </Text>
                )}
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── MacroPill ────────────────────────────────────────────────────────────────

interface MacroPillProps {
  value: number;
  unit: string;
  color: string;
  bg: string;
}

function MacroPill({ value, unit, color, bg }: MacroPillProps) {
  const rounded = Math.round(value);
  return (
    <View style={[styles.macroPill, { backgroundColor: bg }]}>
      <Text style={[styles.macroPillValue, { color }]}>{rounded}</Text>
      <Text style={[styles.macroPillUnit, { color }]}>{unit}</Text>
    </View>
  );
}

// ─── MealSectionCard ──────────────────────────────────────────────────────────

interface MealSectionCardProps {
  section: { key: MealType; label: string; emoji: string };
  foods: PlanFood[];
  dishDescription: string | null;
  mealName: string | null;
  sectionCalories: number;
  isDark: boolean;
  textColor: string;
  secondaryColor: string;
  cardBg: string;
  borderColor: string;
  inputBg: string;
  onReplaceMeal: (mealType: MealType, mealLabel: string) => void;
  onServingChange: (mealType: MealType, foodIndex: number, field: 'serving_size' | 'serving_unit', value: string | number) => void;
  onOpenRecipe: (mealName: string, foods: PlanFood[]) => void;
}

function MealSectionCard({
  section, foods, dishDescription, mealName, sectionCalories, isDark, textColor, secondaryColor, cardBg, borderColor, inputBg,
  onReplaceMeal, onServingChange, onOpenRecipe,
}: MealSectionCardProps) {
  const calRounded = Math.round(sectionCalories);

  return (
    <View style={[styles.mealCard, { backgroundColor: cardBg, borderColor }]}>
      {/* 1. Meal header */}
      <View style={styles.mealCardHeader}>
        <View style={styles.mealCardHeaderLeft}>
          <Text style={styles.mealEmoji}>{section.emoji}</Text>
          <Text style={[styles.mealLabel, { color: textColor }]}>{section.label}</Text>
        </View>
        <View style={styles.mealCardHeaderRight}>
          <View style={[styles.mealCalBadge, { backgroundColor: isDark ? '#2C2C2E' : '#F0F2F7' }]}>
            <Text style={[styles.mealCalBadgeText, { color: colors.calories }]}>{calRounded} kcal</Text>
          </View>
          <TouchableOpacity
            style={styles.replaceMealBtn}
            onPress={() => {
              console.log('[AIMealPlanner] Replace Meal button pressed for:', section.label);
              onReplaceMeal(section.key, section.label);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.replaceMealBtnText}>↺ Replace</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Dish title row with ••• button (between header and divider) */}
      {!!dishDescription && (
        <View style={styles.dishTitleRow}>
          <Text style={[styles.dishTitleText, { color: secondaryColor }]} numberOfLines={2}>
            {dishDescription}
          </Text>
          <TouchableOpacity
            style={styles.recipeDotsBtn}
            onPress={() => {
              const searchName = mealName || dishDescription || '';
              console.log('[AIMealPlanner] ••• recipe button pressed for:', searchName);
              onOpenRecipe(searchName, foods);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.recipeDotsText, { color: TEAL }]}>•••</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. Divider */}
      <View style={[styles.mealDivider, { backgroundColor: borderColor }]} />

      {/* 4. Food rows */}
      {foods.map((food, idx) => (
        <FoodRow
          key={`${food.name}-${idx}`}
          food={food}
          isDark={isDark}
          textColor={textColor}
          secondaryColor={secondaryColor}
          borderColor={borderColor}
          inputBg={inputBg}
          isLast={idx === foods.length - 1}
          onServingChange={(field, value) => {
            console.log('[AIMealPlanner] Serving changed for', food.name, 'in', section.key, '- field:', field, 'value:', value);
            onServingChange(section.key, idx, field, value);
          }}
        />
      ))}
    </View>
  );
}

// ─── FoodRow ──────────────────────────────────────────────────────────────────

const SERVING_UNITS_BASE = ['g', 'oz', 'lb', 'slice', 'cup', 'tbsp', 'tsp', 'piece'] as const;

interface FoodRowProps {
  food: PlanFood;
  isDark: boolean;
  textColor: string;
  secondaryColor: string;
  borderColor: string;
  inputBg: string;
  isLast: boolean;
  onServingChange: (field: 'serving_size' | 'serving_unit', value: string | number) => void;
}

function FoodRow({ food, isDark, textColor, secondaryColor, borderColor, inputBg, isLast, onServingChange }: FoodRowProps) {
  const [localSize, setLocalSize] = useState(String(food.serving_size ?? 1));
  const [unitPickerVisible, setUnitPickerVisible] = useState(false);
  const [noteModalVisible, setNoteModalVisible] = useState(false);

  // Keep localSize in sync when parent recalculates serving_size after a unit change
  useEffect(() => {
    setLocalSize(String(food.serving_size ?? 1));
  }, [food.serving_size, food.serving_unit]);

  const currentUnit = food.serving_unit || 'g';

  const calVal = Math.round(Number(food.calories) || 0);
  const protVal = Math.round(Number(food.protein) || 0);
  const carbVal = Math.round(Number(food.carbs) || 0);
  const fatVal = Math.round(Number(food.fats) || 0);

  const servingDesc = food.serving_description || '';

  // Build the cycling list: if current unit is not in the base list, prepend it
  const cycleList: string[] = SERVING_UNITS_BASE.includes(currentUnit as typeof SERVING_UNITS_BASE[number])
    ? [...SERVING_UNITS_BASE]
    : [currentUnit, ...SERVING_UNITS_BASE];

  const showServingDesc = !!servingDesc;

  return (
    <View style={[styles.foodRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor }]}>
      {/* Left: name + serving row + macros */}
      <View style={styles.foodRowLeft}>
        <Text style={[styles.foodName, { color: textColor }]} numberOfLines={2}>{food.name}</Text>

        {/* Serving row: [size] [unit▾] · description */}
        <View style={styles.servingRow}>
          {/* Serving size input */}
          <TextInput
            style={[styles.servingInput, styles.sizeInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
            value={localSize}
            onChangeText={(t) => setLocalSize(t)}
            onBlur={() => {
              const n = parseFloat(localSize);
              if (!isNaN(n) && n > 0) {
                console.log('[AIMealPlanner] Serving size committed for', food.name, ':', n);
                onServingChange('serving_size', n);
              } else {
                setLocalSize(String(food.serving_size ?? 100));
              }
            }}
            keyboardType="decimal-pad"
            selectTextOnFocus
            maxLength={7}
          />

          {/* Unit dropdown button */}
          <TouchableOpacity
            style={[styles.unitBtn, { borderColor }]}
            onPress={() => {
              console.log('[AIMealPlanner] Unit picker opened for', food.name, 'current unit:', currentUnit);
              setUnitPickerVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.unitBtnText, { color: textColor }]}>{currentUnit}</Text>
            <Text style={[styles.unitChevron, { color: secondaryColor }]}>▾</Text>
          </TouchableOpacity>

          <Modal
            visible={unitPickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setUnitPickerVisible(false)}
          >
            <TouchableOpacity
              style={styles.unitPickerOverlay}
              activeOpacity={1}
              onPress={() => setUnitPickerVisible(false)}
            >
              <View style={[styles.unitPickerMenu, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderColor }]}>
                {cycleList.map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.unitPickerItem,
                      unit === currentUnit && { backgroundColor: isDark ? '#2C2C2E' : '#F0F9F7' },
                    ]}
                    onPress={() => {
                      console.log('[AIMealPlanner] Unit selected for', food.name, ':', currentUnit, '->', unit);
                      onServingChange('serving_unit', unit);
                      setUnitPickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.unitPickerItemText, { color: textColor }, unit === currentUnit && { color: TEAL, fontWeight: '600' }]}>
                      {unit}
                    </Text>
                    {unit === currentUnit && (
                      <Text style={{ color: TEAL, fontSize: 14 }}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {showServingDesc && (
            <>
              <Text style={[styles.servingDot, { color: secondaryColor }]}>·</Text>
              <TouchableOpacity onPress={() => { console.log('[AIMealPlanner] serving_description tapped for', food.name); setNoteModalVisible(true); }} activeOpacity={0.7}>
                <Text style={[styles.servingDesc, { color: secondaryColor }]} numberOfLines={1}>{servingDesc}</Text>
              </TouchableOpacity>
              <Modal
                visible={noteModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setNoteModalVisible(false)}
              >
                <TouchableOpacity
                  style={styles.unitPickerOverlay}
                  activeOpacity={1}
                  onPress={() => setNoteModalVisible(false)}
                >
                  <View style={[styles.noteModalBox, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderColor }]}>
                    <Text style={[styles.noteModalTitle, { color: textColor }]}>{food.name}</Text>
                    <Text style={[styles.noteModalBody, { color: secondaryColor }]}>{servingDesc}</Text>
                    <TouchableOpacity onPress={() => { console.log('[AIMealPlanner] Note modal closed for', food.name); setNoteModalVisible(false); }} style={styles.noteModalClose}>
                      <Text style={{ color: TEAL, fontWeight: '600', fontSize: 15 }}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </Modal>
            </>
          )}
        </View>

        {/* Note row (optional per-ingredient context from AI) */}
        {!!food.note && (
          <Text style={[styles.foodNote, { color: secondaryColor }]}>{food.note}</Text>
        )}

        {/* Macros row */}
        <View style={styles.foodMacrosRow}>
          <Text style={[styles.foodMacroText, { color: colors.calories }]}>{calVal} kcal</Text>
          <Text style={[styles.foodMacroDot, { color: secondaryColor }]}>|</Text>
          <Text style={[styles.foodMacroText, { color: colors.protein }]}>P: </Text>
          <Text style={[styles.foodMacroText, { color: colors.protein }]}>{protVal}g</Text>
          <Text style={[styles.foodMacroDot, { color: secondaryColor }]}>|</Text>
          <Text style={[styles.foodMacroText, { color: colors.carbs }]}>C: </Text>
          <Text style={[styles.foodMacroText, { color: colors.carbs }]}>{carbVal}g</Text>
          <Text style={[styles.foodMacroDot, { color: secondaryColor }]}>|</Text>
          <Text style={[styles.foodMacroText, { color: colors.fats }]}>F: </Text>
          <Text style={[styles.foodMacroText, { color: colors.fats }]}>{fatVal}g</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: spacing.xs, width: 40 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  headerRight: { width: 40 },

  // Preferences step
  prefsContent: {
    padding: spacing.md,
    paddingBottom: 32,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  heroEmoji: { fontSize: 40, marginBottom: 12 },
  heroTitle: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  heroSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },

  goalsCard: {
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  goalsLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  goalsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  goalChip: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 64,
  },
  goalChipText: { fontSize: 15, fontWeight: '700' },
  goalChipUnit: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  // Active preferences summary
  prefsHintCard: {
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  prefsHintHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  prefsHintLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  prefsHintText: {
    fontSize: 13,
    lineHeight: 20,
  },
  prefsHintLink: {
    fontSize: 13,
    fontWeight: '600',
    color: TEAL,
  },
  prefsChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  prefsChip: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  prefsChipText: {
    fontSize: 12,
    fontWeight: '500',
  },

  inputsSection: { marginBottom: spacing.md },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  prefInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 60,
  },

  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TEAL,
    borderRadius: 16,
    paddingVertical: 18,
  },
  generateBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  // Generating step
  generatingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  generatingCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  generatingEmoji: { fontSize: 48, marginBottom: 16 },
  generatingTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  generatingSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  dotsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },

  // Plan step
  planContent: { padding: spacing.md, paddingBottom: 100 },
  planHeader: { marginBottom: spacing.md },
  planTitle: { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  totalMacrosRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  macroPillValue: { fontSize: 14, fontWeight: '700' },
  macroPillUnit: { fontSize: 11, fontWeight: '500' },

  // Meal card
  mealCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  mealCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealCardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealEmoji: { fontSize: 20 },
  mealLabel: { fontSize: 17, fontWeight: '700' },
  mealCalBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  mealCalBadgeText: { fontSize: 13, fontWeight: '600' },
  replaceMealBtn: {
    borderWidth: 1,
    borderColor: TEAL,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  replaceMealBtnText: {
    fontSize: 12,
    color: TEAL,
    fontWeight: '600',
  },
  mealDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },

  // Dish title row with ••• button — between header and divider
  dishTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: 10,
  },
  dishTitleText: {
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
    marginRight: 8,
    lineHeight: 18,
  },
  recipeDotsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recipeDotsText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // Recipe modal
  recipeModalOverlay: {
    flex: 1,
  },
  recipeModalSheet: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  recipeModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  recipeModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
    lineHeight: 24,
  },
  recipeModalCloseBtn: {
    padding: 4,
  },
  recipeLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  recipeLoadingText: {
    fontSize: 14,
  },
  recipeModalScroll: {
    flex: 1,
  },
  recipeNoContent: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 40,
    lineHeight: 22,
  },
  recipeSection: {
    marginBottom: 24,
  },
  recipeSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recipeIngredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  recipeBullet: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 1,
  },
  recipeIngredientText: {
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  recipeStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  recipeStepNumber: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    minWidth: 20,
  },
  recipeStepText: {
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },

  // Food row
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 10,
  },
  foodRowLeft: { flex: 1 },
  foodName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  foodServing: { fontSize: 12, marginBottom: 4 },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
    flexWrap: 'nowrap',
  },
  servingInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 14,
    textAlign: 'center',
  },
  sizeInput: {
    width: 60,
  },
  unitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 2,
  },
  unitBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  unitChevron: {
    fontSize: 10,
  },
  servingDot: {
    fontSize: 13,
  },
  servingDesc: {
    fontSize: 12,
    fontStyle: 'italic',
    flex: 1,
  },
  foodNote: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 2,
  },
  foodMacrosRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  foodMacroText: { fontSize: 12, fontWeight: '600' },
  foodMacroDot: { fontSize: 12 },
  // Unit picker modal
  unitPickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  unitPickerMenu: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  unitPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  unitPickerItemText: {
    fontSize: 15,
  },

  planBottomSpacer: { height: 20 },

  // Sticky bar
  stickyBar: {
    flexDirection: 'row',
    gap: 10,
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  regenBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
  },
  regenBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(20,184,166,0.95)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Modal / Bottom sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  keyboardAvoidingSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  sheetSubtitle: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  sheetLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sheetInput: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  sheetPrimaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: TEAL,
    marginTop: 4,
  },
  sheetPrimaryBtnText: { fontSize: 17, fontWeight: '600', color: '#fff' },

  // Suggestions
  suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  suggestionChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestionChipText: { fontSize: 13, fontWeight: '500' },

  // Note modal
  noteModalBox: {
    margin: 32,
    borderRadius: 16,
    padding: 24,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  noteModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  noteModalBody: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  noteModalClose: {
    alignSelf: 'flex-end',
  },
});
