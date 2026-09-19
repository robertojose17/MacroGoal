/**
 * Recipe Finder Detail Screen
 * Full recipe view with ingredients, instructions, reviews, and food diary logging
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  Animated,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  ChevronUp,
  Bookmark,
  BookmarkCheck,
  Star,
  Clock,
  Users,
  ExternalLink,
  Minus,
  Plus,
  ChevronLeft,
  Sparkles,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useRecipeFinder, RecipeResult } from '@/hooks/useRecipeFinder';
import { useChatbot, ChatMessage } from '@/hooks/useChatbot';
import { toLocalDateString } from '@/utils/dateUtils';
import { supabase } from '@/lib/supabase/client';
import { RecipeImage } from '@/components/RecipeImage';

// ── Shimmer box ───────────────────────────────────────────────────────────────
function ShimmerBox({ style, isDark }: { style: any; isDark: boolean }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  const shimmerBg = isDark ? '#3a3a3a' : '#E5E7EB';
  return <Animated.View style={[style, { backgroundColor: shimmerBg, opacity }]} />;
}

// ─── Tag color map ────────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, string> = {
  'high-protein': colors.success,
  'low-carb': colors.primary,
  'low-calorie': '#8B5CF6',
  'quick': colors.warning,
  'vegetarian': '#10B981',
  'vegan': '#059669',
  'keto': '#F59E0B',
  'high-fiber': '#6366F1',
  'meal-prep': '#EC4899',
};

// ─── Star rating ──────────────────────────────────────────────────────────────
function StarRating({ rating, size = 14 }: { rating: number | null; size?: number }) {
  if (rating == null) return null;
  const stars = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          color={i <= stars ? '#F59E0B' : '#D1D5DB'}
          fill={i <= stars ? '#F59E0B' : 'transparent'}
        />
      ))}
    </View>
  );
}

// ─── Macro pill ───────────────────────────────────────────────────────────────
function MacroPill({
  label,
  value,
  unit,
  bgColor,
  isDark,
}: {
  label: string;
  value: number;
  unit: string;
  bgColor: string;
  isDark: boolean;
}) {
  const displayValue = Math.round(value);
  return (
    <View style={[styles.macroPill, { backgroundColor: bgColor + '18', borderColor: bgColor + '40' }]}>
      <Text style={[styles.macroPillLabel, { color: bgColor }]}>{label}</Text>
      <Text style={[styles.macroPillValue, { color: bgColor }]}>
        {displayValue}
        <Text style={styles.macroPillUnit}>{unit}</Text>
      </Text>
    </View>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, visible }: { message: string; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}



// ─── Main screen ──────────────────────────────────────────────────────────────
export default function RecipeFinderDetailScreen() {
  const params = useLocalSearchParams<{ recipe: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const { saveRecipe, unsaveRecipe } = useRecipeFinder();
  const { sendMessage, loading: aiLoading } = useChatbot();

  // Parse recipe from params
  const recipe: RecipeResult | null = (() => {
    try {
      if (!params.recipe) return null;
      const parsed = JSON.parse(params.recipe);
      console.log('[RecipeDetail] Parsed recipe from params — id:', parsed?.id, 'name:', parsed?.name || parsed?.title);

      // Normalize instructions: can be strings OR objects like { step: 1, text: "..." }
      const normalizeInstruction = (s: any): string => {
        if (typeof s === 'string') return s;
        if (s && typeof s === 'object') return String(s.text ?? s.description ?? s.instruction ?? s.step_text ?? JSON.stringify(s));
        return String(s ?? '');
      };

      // Normalize ingredients: ensure all fields are primitives
      const normalizeIngredient = (ing: any) => ({
        name: String(ing?.name ?? ''),
        amount: String(ing?.amount ?? ''),
        calories: Number(ing?.calories ?? 0),
        protein: Number(ing?.protein ?? 0),
        carbs: Number(ing?.carbs ?? 0),
        fat: Number(ing?.fat ?? 0),
      });

      return {
        ...parsed,
        name: String(parsed.name ?? parsed.title ?? 'Recipe'),
        description: String(parsed.description ?? ''),
        source_name: String(parsed.source_name ?? ''),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t)) : [],
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients.map(normalizeIngredient) : [],
        instructions: Array.isArray(parsed.instructions) ? parsed.instructions.map(normalizeInstruction) : [],
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
        calories_per_serving: Number(parsed.calories_per_serving ?? 0),
        protein_per_serving: Number(parsed.protein_per_serving ?? 0),
        carbs_per_serving: Number(parsed.carbs_per_serving ?? 0),
        fat_per_serving: Number(parsed.fat_per_serving ?? 0),
        fiber_per_serving: Number(parsed.fiber_per_serving ?? 0),
        servings: Number(parsed.servings ?? 1),
      };
    } catch {
      return null;
    }
  })();

  const [servings, setServings] = useState(recipe?.servings ?? 1);
  const [isSaved, setIsSaved] = useState(recipe?.is_saved ?? false);
  const [ingredientsExpanded, setIngredientsExpanded] = useState(true);
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [reviewsExpanded, setReviewsExpanded] = useState(true);

  // Log sheet state
  const [logSheetVisible, setLogSheetVisible] = useState(false);
  const [logServings, setLogServings] = useState(recipe?.servings ?? 1);
  const [logging, setLogging] = useState(false);

  // AI macro fit state
  const [macroFitNote, setMacroFitNote] = useState<string | null>(null);
  const [remainingCalories, setRemainingCalories] = useState(0);
  const [remainingProtein, setRemainingProtein] = useState(0);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  // ─── Track popular recipe click on mount ────────────────────────────────────
  useEffect(() => {
    if (!recipe?.id) return;
    console.log('[RecipeDetail] Tracking click for recipe id:', recipe.id);
    supabase.functions.invoke('popular-recipes', {
      method: 'POST',
      body: { id: recipe.id },
    }).catch((e: any) => {
      console.warn('[RecipeDetail] Click tracking failed (silent):', e?.message);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Load remaining macros ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadRemaining() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const today = toLocalDateString();
        const [mealsRes, goalRes] = await Promise.all([
          supabase
            .from('meals')
            .select('meal_items(calories, protein)')
            .eq('user_id', user.id)
            .eq('date', today),
          supabase
            .from('goals')
            .select('daily_calories, protein_g')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle(),
        ]);
        let totalCals = 0;
        let totalProtein = 0;
        (mealsRes.data || []).forEach((meal: any) => {
          (meal.meal_items || []).forEach((item: any) => {
            totalCals += Number(item.calories) || 0;
            totalProtein += Number(item.protein) || 0;
          });
        });
        const goalCals = Number(goalRes.data?.daily_calories) || 2000;
        const goalProtein = Number(goalRes.data?.protein_g) || 150;
        setRemainingCalories(Math.max(0, goalCals - totalCals));
        setRemainingProtein(Math.max(0, goalProtein - totalProtein));
      } catch (e) {
        console.warn('[RecipeDetail] loadRemaining error:', e);
      }
    }
    loadRemaining();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2800);
  }, []);

  // ─── Save / unsave ──────────────────────────────────────────────────────────
  const handleToggleSave = useCallback(async () => {
    if (!recipe) return;
    console.log('[RecipeDetail] Toggle save — currently saved:', isSaved, 'recipe:', recipe.name);
    if (isSaved) {
      setIsSaved(false);
      await unsaveRecipe(recipe.id);
      showToast('Recipe removed from saved');
    } else {
      setIsSaved(true);
      await saveRecipe({ ...recipe, is_saved: true });
      showToast('Recipe saved!');
    }
  }, [isSaved, recipe, saveRecipe, unsaveRecipe, showToast]);

  // ─── Make it fit my macros ──────────────────────────────────────────────────
  const handleMacroFit = useCallback(async () => {
    if (!recipe) return;
    console.log('[RecipeDetail] Make it fit my macros — remainingCalories:', remainingCalories, 'remainingProtein:', remainingProtein);
    if (remainingCalories <= 0) {
      showToast('No remaining calories today!');
      return;
    }
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Adjust the serving size of this recipe to fit exactly ${remainingCalories} remaining calories and ${remainingProtein}g remaining protein for today.

Recipe: ${recipe.name}
Per serving: ${recipe.calories_per_serving} cal, ${recipe.protein_per_serving}g protein
Original servings: ${recipe.servings}

Return ONLY a JSON object: { "adjusted_servings": 1.5, "note": "explanation" }`,
      },
    ];
    try {
      const result = await sendMessage({ messages, source: 'recipe-finder' });
      if (!result) return;
      const jsonMatch = result.message.match(/\{[\s\S]*"adjusted_servings"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const adj = Math.max(0.5, Math.min(10, Number(parsed.adjusted_servings) || 1));
        setServings(adj);
        setMacroFitNote(parsed.note || `Adjusted to ${adj} serving(s) to fit your remaining macros.`);
        console.log('[RecipeDetail] Macro fit — adjusted to', adj, 'servings');
      }
    } catch (e: any) {
      console.error('[RecipeDetail] handleMacroFit error:', e?.message);
      showToast('Could not adjust servings. Try again.');
    }
  }, [remainingCalories, remainingProtein, recipe, sendMessage, showToast]);

  // ─── Log to food diary ──────────────────────────────────────────────────────
  const handleLogToDiary = useCallback(async () => {
    if (!recipe) return;
    const logCaloriesLocal = Math.round(recipe.calories_per_serving * logServings);
    const logProteinLocal = Math.round(recipe.protein_per_serving * logServings);
    const logCarbsLocal = Math.round(recipe.carbs_per_serving * logServings);
    const logFatLocal = Math.round(recipe.fat_per_serving * logServings);
    const logFiberLocal = Math.round(recipe.fiber_per_serving * logServings);
    console.log('[recipe-finder-detail] handleLogToDiary pressed', { recipeId: recipe.id, logServings });
    const servingDesc = logServings === 1 ? '1 serving' : `${logServings} servings`;
    console.log('[RecipeDetail] Log to diary — recipe:', recipe.name, 'servings:', logServings, 'calories:', logCaloriesLocal, 'protein:', logProteinLocal);
    setLogging(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { showToast('Please sign in to log food'); return; }
      const today = toLocalDateString();

      // Insert a temporary food entry so the diary shows the recipe name cleanly
      console.log('[RecipeDetail] Inserting food entry for recipe:', recipe.name);
      const { data: newFood, error: foodError } = await supabase
        .from('foods')
        .insert({
          name: recipe.name,
          brand: null,
          serving_amount: 1,
          serving_unit: 'serving',
          calories: recipe.calories_per_serving,
          protein: recipe.protein_per_serving,
          carbs: recipe.carbs_per_serving,
          fats: recipe.fat_per_serving,
          fiber: recipe.fiber_per_serving,
          barcode: null,
          user_created: true,
        })
        .select('id')
        .single();

      if (foodError) {
        console.error('[RecipeDetail] Failed to insert food entry:', foodError?.message);
        throw foodError;
      }
      console.log('[RecipeDetail] Food entry created — id:', newFood.id);

      console.log('[RecipeDetail] Calling supabase.rpc log_food — user:', user.id, 'date:', today, 'food_id:', newFood.id);
      const { error: rpcError } = await supabase.rpc('log_food', {
        p_user_id: user.id,
        p_date: today,
        p_meal_type: 'breakfast',
        p_food_id: newFood.id,
        p_food_item_id: null,
        p_quantity: logServings,
        p_calories: logCaloriesLocal,
        p_protein: logProteinLocal,
        p_carbs: logCarbsLocal,
        p_fats: logFatLocal,
        p_fiber: logFiberLocal,
        p_serving_description: servingDesc,
        p_grams: null,
        p_logged_at: new Date().toISOString(),
      });
      if (rpcError) throw rpcError;
      console.log('[RecipeDetail] Logged to diary successfully via Supabase RPC');
      setLogSheetVisible(false);
      showToast(`${recipe.name} added to diary!`);
    } catch (e: any) {
      console.error('[RecipeDetail] handleLogToDiary error:', e?.message);
      showToast('Failed to log recipe. Try again.');
    } finally {
      setLogging(false);
    }
  }, [recipe, logServings, showToast]);

  if (!recipe) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <Stack.Screen options={{ title: 'Recipe', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: subColor }]}>Recipe not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Computed macro values ──────────────────────────────────────────────────
  const scaledCalories = Math.round(recipe.calories_per_serving * servings);
  const scaledProtein = Math.round(recipe.protein_per_serving * servings);
  const scaledCarbs = Math.round(recipe.carbs_per_serving * servings);
  const scaledFat = Math.round(recipe.fat_per_serving * servings);

  // Log sheet macros
  const logCalories = Math.round(recipe.calories_per_serving * logServings);
  const logProtein = Math.round(recipe.protein_per_serving * logServings);
  const logCarbs = Math.round(recipe.carbs_per_serving * logServings);
  const logFat = Math.round(recipe.fat_per_serving * logServings);
  const logFiber = Math.round(recipe.fiber_per_serving * logServings);

  const prepTimeText = recipe.prep_time_minutes != null ? `${recipe.prep_time_minutes} min` : null;

  // ─── Scaled ingredients ──────────────────────────────────────────────────────
  const scalingRatio = servings / (recipe.servings || 1);
  const scaledIngredients = (recipe.ingredients ?? []).map((ing) => {
    const match = String(ing.amount ?? '').match(/^([\d./]+)\s*(.*)/);
    if (!match) return { ...ing, scaledCalories: Math.round((ing.calories || 0) * scalingRatio) };
    let originalNum: number;
    try {
      // Handle fractions like "1/2"
      const parts = match[1].split('/');
      originalNum = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(parts[0]);
    } catch {
      return { ...ing, scaledCalories: Math.round((ing.calories || 0) * scalingRatio) };
    }
    if (!isFinite(originalNum) || originalNum === 0) return { ...ing, scaledCalories: Math.round((ing.calories || 0) * scalingRatio) };
    const scaledNum = originalNum * scalingRatio;
    const formatted = scaledNum % 1 === 0 ? String(Math.round(scaledNum)) : scaledNum.toFixed(1);
    return {
      ...ing,
      amount: `${formatted} ${match[2]}`.trim(),
      scaledCalories: Math.round((ing.calories || 0) * scalingRatio),
    };
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerTransparent: true,
          headerLeft: () => (
            <Pressable
              onPress={() => {
                console.log('[RecipeDetail] Back button pressed');
                router.back();
              }}
              style={styles.headerBackBtn}
              accessibilityRole="button"
            >
              <ChevronLeft size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />

      <View style={[styles.container, { backgroundColor: bg }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        >
          {/* Hero image */}
          <RecipeImage
            recipeId={recipe.id}
            initialUrl={recipe.image_url}
            style={styles.heroImage}
            iconSize={56}
          />

          {/* Header section */}
          <View style={[styles.section, { paddingTop: spacing.md }]}>
            <Text style={[styles.recipeName, { color: textColor }]}>{recipe.name}</Text>

            {/* Source row */}
            <View style={styles.sourceRow}>
              {recipe.source_url && recipe.url_verified !== false ? (
                <Pressable
                  onPress={() => {
                    console.log('[RecipeDetail] Source link pressed — url:', recipe.source_url);
                    if (recipe.source_url) Linking.openURL(recipe.source_url);
                  }}
                  style={styles.sourceLink}
                  accessibilityRole="link"
                >
                  <Text style={[styles.sourceName, { color: colors.primary }]}>
                    From {recipe.source_name}
                  </Text>
                  <ExternalLink size={13} color={colors.primary} />
                </Pressable>
              ) : (
                <Text style={[styles.sourceName, { color: subColor }]}>From {recipe.source_name}</Text>
              )}
              {prepTimeText && (
                <View style={styles.metaItem}>
                  <Clock size={13} color={subColor} />
                  <Text style={[styles.metaText, { color: subColor }]}>{prepTimeText}</Text>
                </View>
              )}
              <View style={styles.metaItem}>
                <Users size={13} color={subColor} />
                <Text style={[styles.metaText, { color: subColor }]}>{recipe.servings} servings</Text>
              </View>
            </View>

            {/* Tags */}
            {(recipe.tags ?? []).length > 0 && (
              <View style={styles.tagsRow}>
                {(recipe.tags ?? []).map((tag) => {
                  const tagColor = TAG_COLORS[tag] || colors.primary;
                  return (
                    <View key={tag} style={[styles.tagPill, { backgroundColor: tagColor + '18', borderColor: tagColor + '40' }]}>
                      <Text style={[styles.tagText, { color: tagColor }]}>{tag}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Macro pills */}
          <View style={[styles.macroPillsRow, { paddingHorizontal: spacing.md }]}>
            <MacroPill label="Calories" value={scaledCalories} unit=" kcal" bgColor={colors.calories} isDark={isDark} />
            <MacroPill label="Protein" value={scaledProtein} unit="g" bgColor={colors.protein} isDark={isDark} />
            <MacroPill label="Carbs" value={scaledCarbs} unit="g" bgColor={colors.carbs} isDark={isDark} />
            <MacroPill label="Fat" value={scaledFat} unit="g" bgColor={colors.fats} isDark={isDark} />
          </View>

          {/* Servings selector */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor, marginHorizontal: spacing.md, marginTop: spacing.sm }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Servings</Text>
            <View style={styles.servingsRow}>
              <Pressable
                onPress={() => {
                  const next = Math.max(0.5, servings - 0.5);
                  console.log('[RecipeDetail] Servings decreased to:', next);
                  setServings(next);
                }}
                style={[styles.servingsBtn, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                accessibilityRole="button"
              >
                <Minus size={18} color={colors.primary} />
              </Pressable>
              <Text style={[styles.servingsValue, { color: textColor }]}>{servings}</Text>
              <Pressable
                onPress={() => {
                  const next = Math.min(20, servings + 0.5);
                  console.log('[RecipeDetail] Servings increased to:', next);
                  setServings(next);
                }}
                style={[styles.servingsBtn, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                accessibilityRole="button"
              >
                <Plus size={18} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Make it fit my macros */}
          <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.sm }}>
            <Pressable
              onPress={handleMacroFit}
              style={[styles.macroFitBtn, { borderColor: colors.primary + '60' }]}
              disabled={aiLoading}
              accessibilityRole="button"
            >
              {aiLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Sparkles size={16} color={colors.primary} />
              )}
              <Text style={[styles.macroFitBtnText, { color: colors.primary }]}>
                {aiLoading ? 'Adjusting...' : 'Make it fit my macros'}
              </Text>
            </Pressable>
            {macroFitNote && (
              <View style={[styles.macroFitNote, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.macroFitNoteText, { color: colors.primary }]}>{macroFitNote}</Text>
              </View>
            )}
          </View>

          {/* Ingredients */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor, marginHorizontal: spacing.md, marginTop: spacing.md }]}>
            <Pressable
              onPress={() => {
                console.log('[RecipeDetail] Ingredients section toggled');
                setIngredientsExpanded((v) => !v);
              }}
              style={styles.sectionHeader}
              accessibilityRole="button"
            >
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                Ingredients ({(recipe.ingredients ?? []).length})
              </Text>
              {ingredientsExpanded
                ? <ChevronUp size={18} color={subColor} />
                : <ChevronDown size={18} color={subColor} />}
            </Pressable>
            {ingredientsExpanded && scaledIngredients.map((ing, idx) => (
              <View
                key={idx}
                style={[
                  styles.ingredientRow,
                  idx < scaledIngredients.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor },
                ]}
              >
                <Text style={[styles.ingredientName, { color: textColor }]}>{String(ing.name ?? '')}</Text>
                <View style={styles.ingredientRight}>
                  <Text style={[styles.ingredientAmount, { color: subColor }]}>{String(ing.amount ?? '')}</Text>
                  <Text style={[styles.ingredientCals, { color: subColor }]}>{ing.scaledCalories} cal</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Instructions */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor, marginHorizontal: spacing.md, marginTop: spacing.md }]}>
            <Pressable
              onPress={() => {
                console.log('[RecipeDetail] Instructions section toggled');
                setInstructionsExpanded((v) => !v);
              }}
              style={styles.sectionHeader}
              accessibilityRole="button"
            >
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                Instructions ({(recipe.instructions ?? []).length} steps)
              </Text>
              {instructionsExpanded
                ? <ChevronUp size={18} color={subColor} />
                : <ChevronDown size={18} color={subColor} />}
            </Pressable>
            {instructionsExpanded && (recipe.instructions ?? []).map((step, idx) => (
              <View key={idx} style={styles.instructionRow}>
                <View style={[styles.stepCircle, { backgroundColor: colors.primary }]}>
                  <Text style={styles.stepNumber}>{idx + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: textColor }]}>{String(step)}</Text>
              </View>
            ))}
          </View>

          {/* Reviews */}
          {(recipe.reviews ?? []).length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor, marginHorizontal: spacing.md, marginTop: spacing.md }]}>
              <Pressable
                onPress={() => {
                  console.log('[RecipeDetail] Reviews section toggled');
                  setReviewsExpanded((v) => !v);
                }}
                style={styles.sectionHeader}
                accessibilityRole="button"
              >
                <Text style={[styles.sectionTitle, { color: textColor }]}>
                  Reviews ({(recipe.reviews ?? []).length})
                </Text>
                {reviewsExpanded
                  ? <ChevronUp size={18} color={subColor} />
                  : <ChevronDown size={18} color={subColor} />}
              </Pressable>
              {reviewsExpanded && (recipe.reviews ?? []).map((review, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.reviewCard,
                    { backgroundColor: isDark ? colors.backgroundDark : colors.background },
                    idx < recipe.reviews.length - 1 && { marginBottom: spacing.sm },
                  ]}
                >
                  <View style={styles.reviewHeader}>
                    <Text style={[styles.reviewAuthor, { color: textColor }]}>{review.author}</Text>
                    <StarRating rating={review.rating} />
                  </View>
                  <Text style={[styles.reviewText, { color: subColor }]}>"{review.text}"</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Bottom bar */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: cardBg,
              borderTopColor: borderColor,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <Pressable
            onPress={handleToggleSave}
            style={[styles.bookmarkBtn, { borderColor }]}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? 'Unsave recipe' : 'Save recipe'}
          >
            {isSaved
              ? <BookmarkCheck size={22} color={colors.primary} fill={colors.primary} />
              : <Bookmark size={22} color={subColor} />}
          </Pressable>
          <Pressable
            onPress={() => {
              console.log('[RecipeDetail] Log to Food Diary button pressed');
              setLogServings(servings);
              setLogSheetVisible(true);
            }}
            style={[styles.logBtn, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={styles.logBtnText}>Log to Food Diary</Text>
          </Pressable>
        </View>
      </View>

      {/* Log sheet modal */}
      <Modal
        visible={logSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          console.log('[RecipeDetail] Log sheet dismissed');
          setLogSheetVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLogSheetVisible(false)}
        />
        <View
          style={[
            styles.logSheet,
            {
              backgroundColor: cardBg,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.logSheetHandle, { backgroundColor: borderColor }]} />
          <Text style={[styles.logSheetTitle, { color: textColor }]}>{recipe.name}</Text>

          {/* Servings */}
          <View style={styles.logSheetRow}>
            <Text style={[styles.logSheetLabel, { color: subColor }]}>Servings</Text>
            <View style={styles.servingsRow}>
              <Pressable
                onPress={() => {
                  const next = Math.max(0.5, logServings - 0.5);
                  console.log('[RecipeDetail] Log servings decreased to:', next);
                  setLogServings(next);
                }}
                style={[styles.servingsBtn, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                accessibilityRole="button"
              >
                <Minus size={16} color={colors.primary} />
              </Pressable>
              <Text style={[styles.servingsValue, { color: textColor }]}>{logServings}</Text>
              <Pressable
                onPress={() => {
                  const next = Math.min(20, logServings + 0.5);
                  console.log('[RecipeDetail] Log servings increased to:', next);
                  setLogServings(next);
                }}
                style={[styles.servingsBtn, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                accessibilityRole="button"
              >
                <Plus size={16} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Macro preview */}
          <View style={[styles.logMacroRow, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor }]}>
            <View style={styles.logMacroItem}>
              <Text style={[styles.logMacroValue, { color: colors.calories }]}>{logCalories}</Text>
              <Text style={[styles.logMacroLabel, { color: subColor }]}>cal</Text>
            </View>
            <View style={[styles.logMacroDivider, { backgroundColor: borderColor }]} />
            <View style={styles.logMacroItem}>
              <Text style={[styles.logMacroValue, { color: colors.protein }]}>{logProtein}g</Text>
              <Text style={[styles.logMacroLabel, { color: subColor }]}>protein</Text>
            </View>
            <View style={[styles.logMacroDivider, { backgroundColor: borderColor }]} />
            <View style={styles.logMacroItem}>
              <Text style={[styles.logMacroValue, { color: colors.carbs }]}>{logCarbs}g</Text>
              <Text style={[styles.logMacroLabel, { color: subColor }]}>carbs</Text>
            </View>
            <View style={[styles.logMacroDivider, { backgroundColor: borderColor }]} />
            <View style={styles.logMacroItem}>
              <Text style={[styles.logMacroValue, { color: colors.fats }]}>{logFat}g</Text>
              <Text style={[styles.logMacroLabel, { color: subColor }]}>fat</Text>
            </View>
          </View>

          {/* Add to log button */}
          <Pressable
            onPress={handleLogToDiary}
            style={[styles.addToLogBtn, { backgroundColor: colors.primary }]}
            disabled={logging}
            accessibilityRole="button"
          >
            {logging
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.addToLogBtnText}>Add to Log</Text>}
          </Pressable>
        </View>
      </Modal>

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16 },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  heroImage: {
    width: '100%',
    height: 250,
    overflow: 'hidden',
  },

  section: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  recipeName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.sm,
    lineHeight: 28,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceName: {
    fontSize: 13,
    fontWeight: '500',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  macroPillsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  macroPill: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  macroPillLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  macroPillValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  macroPillUnit: {
    fontSize: 10,
    fontWeight: '400',
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  servingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsValue: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'center',
  },
  macroFitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
  },
  macroFitBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  macroFitNote: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  macroFitNoteText: {
    fontSize: 13,
    lineHeight: 18,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  ingredientName: {
    fontSize: 14,
    flex: 1,
    marginRight: spacing.sm,
  },
  ingredientRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  ingredientAmount: {
    fontSize: 13,
    fontWeight: '500',
  },
  ingredientCals: {
    fontSize: 11,
  },
  instructionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumber: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  reviewCard: {
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reviewAuthor: {
    fontSize: 13,
    fontWeight: '600',
  },
  reviewText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  bookmarkBtn: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtn: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  logSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  logSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  logSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  logSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  logSheetLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  logMacroRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  logMacroItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  logMacroDivider: {
    width: 1,
  },
  logMacroValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  logMacroLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  addToLogBtn: {
    height: 50,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToLogBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
