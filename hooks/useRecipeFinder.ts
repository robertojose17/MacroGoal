/**
 * useRecipeFinder — manages recipe search, daily suggestions, and saved recipes
 */

import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';
import { useChatbot, ChatMessage } from '@/hooks/useChatbot';

export type RecipeIngredient = {
  name: string;
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type RecipeReview = {
  text: string;
  author: string;
  rating: number | null;
};

export type RecipeResult = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  source_name: string;
  source_url: string | null;
  prep_time_minutes: number | null;
  servings: number;
  calories_per_serving: number;
  protein_per_serving: number;
  carbs_per_serving: number;
  fat_per_serving: number;
  fiber_per_serving: number;
  ingredients: RecipeIngredient[];
  instructions: string[];
  reviews: RecipeReview[];
  tags: string[];
  is_saved?: boolean;
};

export type DailySuggestions = {
  recipes: RecipeResult[];
  generated_date: string;
  context_summary: string;
};

export type UserGoals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  remainingCalories: number;
};

const SUGGESTIONS_KEY_PREFIX = '@recipe_suggestions_';

const RECIPE_SEARCH_SYSTEM_PROMPT = `You are a recipe finder AI. When the user asks for a recipe or type of food, search the web for real recipes from authoritative sources (AllRecipes, Serious Eats, Food Network, NYT Cooking, Bon Appétit, etc.).

Return ONLY a JSON code block with this exact structure:
\`\`\`json
{
  "recipes": [
    {
      "name": "Recipe Name",
      "description": "One sentence description",
      "image_url": "https://... (og:image URL from the source page, or null)",
      "source_name": "AllRecipes",
      "source_url": "https://...",
      "prep_time_minutes": 25,
      "servings": 4,
      "calories_per_serving": 487,
      "protein_per_serving": 42,
      "carbs_per_serving": 38,
      "fat_per_serving": 12,
      "fiber_per_serving": 3,
      "ingredients": [
        { "name": "chicken breast", "amount": "200g", "calories": 220, "protein": 41, "carbs": 0, "fat": 5 }
      ],
      "instructions": ["Step 1: ...", "Step 2: ..."],
      "reviews": [
        { "text": "Made this 5 times, incredible!", "author": "user123", "rating": 5 }
      ],
      "tags": ["high-protein", "low-carb"]
    }
  ]
}
\`\`\`

Rules:
- Return 5 recipes for search queries
- Return 3 recipes for suggestion requests
- Always search the web for real recipes — never invent recipes
- Include real og:image URLs from the source pages when available
- Include 2-3 real user reviews/comments from the source page
- Calculate accurate nutrition per serving based on ingredients
- Tags must be from: high-protein, low-carb, low-calorie, quick, vegetarian, vegan, keto, high-fiber, meal-prep`;

function parseRecipesFromResponse(text: string): RecipeResult[] {
  try {
    // Extract JSON block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) {
      // Try raw JSON
      const rawMatch = text.match(/\{[\s\S]*"recipes"[\s\S]*\}/);
      if (!rawMatch) {
        console.warn('[useRecipeFinder] No JSON block found in response');
        return [];
      }
      const parsed = JSON.parse(rawMatch[0]);
      return normalizeRecipes(parsed.recipes || []);
    }
    const parsed = JSON.parse(jsonMatch[1]);
    return normalizeRecipes(parsed.recipes || []);
  } catch (e) {
    console.error('[useRecipeFinder] Failed to parse recipes JSON:', e);
    return [];
  }
}

function normalizeRecipes(raw: any[]): RecipeResult[] {
  return raw.map((r: any, idx: number) => ({
    id: r.id || `recipe-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
    name: String(r.name || 'Unknown Recipe'),
    description: String(r.description || ''),
    image_url: r.image_url || null,
    source_name: String(r.source_name || 'Unknown'),
    source_url: r.source_url || null,
    prep_time_minutes: r.prep_time_minutes != null ? Number(r.prep_time_minutes) : null,
    servings: Number(r.servings) || 1,
    calories_per_serving: Number(r.calories_per_serving) || 0,
    protein_per_serving: Number(r.protein_per_serving) || 0,
    carbs_per_serving: Number(r.carbs_per_serving) || 0,
    fat_per_serving: Number(r.fat_per_serving) || 0,
    fiber_per_serving: Number(r.fiber_per_serving) || 0,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.map((ing: any) => ({
      name: String(ing.name || ''),
      amount: String(ing.amount || ''),
      calories: Number(ing.calories) || 0,
      protein: Number(ing.protein) || 0,
      carbs: Number(ing.carbs) || 0,
      fat: Number(ing.fat) || 0,
    })) : [],
    instructions: Array.isArray(r.instructions) ? r.instructions.map(String) : [],
    reviews: Array.isArray(r.reviews) ? r.reviews.map((rev: any) => ({
      text: String(rev.text || ''),
      author: String(rev.author || 'Anonymous'),
      rating: rev.rating != null ? Number(rev.rating) : null,
    })) : [],
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    is_saved: false,
  }));
}

export function useRecipeFinder() {
  const { sendMessage } = useChatbot();

  const [searchResults, setSearchResults] = useState<RecipeResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [dailySuggestions, setDailySuggestions] = useState<DailySuggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [savedRecipes, setSavedRecipes] = useState<RecipeResult[]>([]);

  const loadingRef = useRef(false);

  // ─── Search recipes ──────────────────────────────────────────────────────────
  const searchRecipes = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) return;
    console.log('[useRecipeFinder] searchRecipes — query:', query);
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);

    const messages: ChatMessage[] = [
      { role: 'system', content: RECIPE_SEARCH_SYSTEM_PROMPT },
      { role: 'user', content: `Find me recipes for: ${query}` },
    ];

    try {
      const result = await sendMessage({ messages, source: 'recipe-finder' });
      if (!result) {
        setSearchError('No response from AI. Please try again.');
        return;
      }
      const recipes = parseRecipesFromResponse(result.message);
      console.log('[useRecipeFinder] searchRecipes — parsed', recipes.length, 'recipes');
      setSearchResults(recipes);
    } catch (e: any) {
      const msg = e?.message || 'Failed to search recipes';
      console.error('[useRecipeFinder] searchRecipes error:', msg);
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
    }
  }, [sendMessage]);

  // ─── Daily suggestions ───────────────────────────────────────────────────────
  const loadDailySuggestions = useCallback(async (
    userGoals: UserGoals,
    forceRefresh = false,
  ): Promise<void> => {
    if (loadingRef.current) return;

    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${SUGGESTIONS_KEY_PREFIX}${today}`;

    // Check cache first
    if (!forceRefresh) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed: DailySuggestions = JSON.parse(cached);
          if (parsed.generated_date === today) {
            console.log('[useRecipeFinder] loadDailySuggestions — using cached suggestions');
            setDailySuggestions(parsed);
            return;
          }
        }
      } catch (e) {
        console.warn('[useRecipeFinder] Cache read error:', e);
      }
    }

    loadingRef.current = true;
    setSuggestionsLoading(true);
    console.log('[useRecipeFinder] loadDailySuggestions — generating new suggestions');

    const hour = new Date().getHours();
    const timeOfDay = hour < 11 ? 'morning' : hour < 15 ? 'midday' : hour < 19 ? 'afternoon' : 'evening';

    const systemPrompt = `You are a nutrition-aware recipe recommender. Based on the user's macro goals and remaining calories for today, suggest 3 recipes that would fit well into their day.

User context:
- Remaining calories today: ${userGoals.remainingCalories} kcal
- Daily protein goal: ${userGoals.protein}g
- Daily carbs goal: ${userGoals.carbs}g
- Daily fat goal: ${userGoals.fat}g
- Time of day: ${timeOfDay}

Return ONLY a JSON code block with the same recipe structure (3 recipes).
Search the web for real recipes that match the nutritional needs. Prioritize recipes where the macros per serving closely match the remaining macros.

${RECIPE_SEARCH_SYSTEM_PROMPT}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Suggest 3 recipes that fit my remaining ${userGoals.remainingCalories} calories today. I need about ${userGoals.protein}g protein total per day.` },
    ];

    try {
      const result = await sendMessage({ messages, source: 'recipe-finder' });
      if (!result) {
        console.warn('[useRecipeFinder] loadDailySuggestions — no response');
        return;
      }
      const recipes = parseRecipesFromResponse(result.message);
      console.log('[useRecipeFinder] loadDailySuggestions — parsed', recipes.length, 'suggestions');

      const contextSummary = userGoals.remainingCalories > 0
        ? `Suggestions based on your ${userGoals.remainingCalories} remaining calories`
        : 'Suggested recipes for your goals';

      const suggestions: DailySuggestions = {
        recipes,
        generated_date: today,
        context_summary: contextSummary,
      };

      setDailySuggestions(suggestions);

      // Cache
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify(suggestions));
      } catch (e) {
        console.warn('[useRecipeFinder] Cache write error:', e);
      }
    } catch (e: any) {
      console.error('[useRecipeFinder] loadDailySuggestions error:', e?.message);
    } finally {
      setSuggestionsLoading(false);
      loadingRef.current = false;
    }
  }, [sendMessage]);

  // ─── Save recipe ─────────────────────────────────────────────────────────────
  const saveRecipe = useCallback(async (recipe: RecipeResult): Promise<void> => {
    console.log('[useRecipeFinder] saveRecipe — id:', recipe.id, 'name:', recipe.name);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[useRecipeFinder] saveRecipe — no authenticated user');
        return;
      }
      const { error } = await supabase.from('saved_recipes').upsert({
        id: recipe.id,
        user_id: user.id,
        recipe_data: recipe,
        created_at: new Date().toISOString(),
      });
      if (error) {
        console.error('[useRecipeFinder] saveRecipe Supabase error:', error.message);
        return;
      }
      const saved = { ...recipe, is_saved: true };
      setSavedRecipes((prev) => {
        const exists = prev.find((r) => r.id === recipe.id);
        if (exists) return prev.map((r) => r.id === recipe.id ? saved : r);
        return [saved, ...prev];
      });
      setSearchResults((prev) => prev.map((r) => r.id === recipe.id ? { ...r, is_saved: true } : r));
      console.log('[useRecipeFinder] saveRecipe — saved successfully');
    } catch (e: any) {
      console.error('[useRecipeFinder] saveRecipe error:', e?.message);
    }
  }, []);

  // ─── Unsave recipe ───────────────────────────────────────────────────────────
  const unsaveRecipe = useCallback(async (recipeId: string): Promise<void> => {
    console.log('[useRecipeFinder] unsaveRecipe — id:', recipeId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('saved_recipes')
        .delete()
        .eq('id', recipeId)
        .eq('user_id', user.id);
      if (error) {
        console.error('[useRecipeFinder] unsaveRecipe Supabase error:', error.message);
        return;
      }
      setSavedRecipes((prev) => prev.filter((r) => r.id !== recipeId));
      setSearchResults((prev) => prev.map((r) => r.id === recipeId ? { ...r, is_saved: false } : r));
      console.log('[useRecipeFinder] unsaveRecipe — removed successfully');
    } catch (e: any) {
      console.error('[useRecipeFinder] unsaveRecipe error:', e?.message);
    }
  }, []);

  // ─── Load saved recipes ──────────────────────────────────────────────────────
  const loadSavedRecipes = useCallback(async (): Promise<void> => {
    console.log('[useRecipeFinder] loadSavedRecipes');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('saved_recipes')
        .select('recipe_data, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[useRecipeFinder] loadSavedRecipes Supabase error:', error.message);
        return;
      }
      const recipes: RecipeResult[] = (data || []).map((row: any) => ({
        ...row.recipe_data,
        is_saved: true,
      }));
      console.log('[useRecipeFinder] loadSavedRecipes — loaded', recipes.length, 'recipes');
      setSavedRecipes(recipes);
    } catch (e: any) {
      console.error('[useRecipeFinder] loadSavedRecipes error:', e?.message);
    }
  }, []);

  return {
    searchRecipes,
    searchResults,
    searchLoading,
    searchError,
    dailySuggestions,
    suggestionsLoading,
    loadDailySuggestions,
    savedRecipes,
    saveRecipe,
    unsaveRecipe,
    loadSavedRecipes,
  };
}
