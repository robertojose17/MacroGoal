/**
 * useRecipeFinder — manages recipe search, daily suggestions, and saved recipes
 */

import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';

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
  url_verified?: boolean;
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
  remainingProtein?: number;
};

const SUGGESTIONS_KEY_PREFIX = '@recipe_suggestions_';

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

// kept for any callers that may still pass raw AI text (e.g. recipe-finder-detail chatbot path)
export function parseRecipesFromResponse(text: string): RecipeResult[] {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) {
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

export function useRecipeFinder() {
  const [searchResults, setSearchResults] = useState<RecipeResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchPage, setSearchPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Keep a ref to the current query so loadMore can use it without stale closure
  const currentQueryRef = useRef('');

  const [dailySuggestions, setDailySuggestions] = useState<DailySuggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [savedRecipes, setSavedRecipes] = useState<RecipeResult[]>([]);

  const loadingRef = useRef(false);

  // ─── Browse feed state ───────────────────────────────────────────────────────
  const [browseResults, setBrowseResults] = useState<RecipeResult[]>([]);
  const [browsePage, setBrowsePage] = useState(0);
  const [browseHasMore, setBrowseHasMore] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const prefetchedRef = useRef<RecipeResult[]>([]); // invisible prefetch buffer
  const isPrefetchingRef = useRef(false);

  // ─── Search recipes (page 0 — replaces results) ──────────────────────────────
  const searchRecipes = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) return;
    console.log('[useRecipeFinder] searchRecipes — query:', query, 'page: 0');
    currentQueryRef.current = query;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    setSearchPage(0);
    setHasMore(true);
    try {
      const { data, error } = await supabase.functions.invoke('recipe-finder', {
        body: { query, type: 'search', page: 0 },
      });
      if (error) throw new Error(error.message);
      console.log('[useRecipeFinder] searchRecipes — response received, duration_ms:', data?.duration_ms, 'has_more:', data?.has_more, 'total:', data?.total);
      const recipes = normalizeRecipes(data?.recipes || []);
      console.log('[useRecipeFinder] searchRecipes — parsed', recipes.length, 'recipes (page 0)');
      setSearchResults(recipes);
      setHasMore(Boolean(data?.has_more));
      setSearchPage(0);
    } catch (e: any) {
      const msg = e?.message || 'Failed to search recipes';
      console.error('[useRecipeFinder] searchRecipes error:', msg);
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // ─── Load more search results (appends) ──────────────────────────────────────
  const loadMore = useCallback(async (): Promise<void> => {
    const query = currentQueryRef.current;
    if (!query.trim() || isLoadingMore || !hasMore) return;
    const nextPage = searchPage + 1;
    console.log('[useRecipeFinder] loadMore — query:', query, 'page:', nextPage);
    setIsLoadingMore(true);
    try {
      const { data, error } = await supabase.functions.invoke('recipe-finder', {
        body: { query, type: 'search', page: nextPage },
      });
      if (error) throw new Error(error.message);
      console.log('[useRecipeFinder] loadMore — response received, duration_ms:', data?.duration_ms, 'has_more:', data?.has_more, 'page:', nextPage);
      const recipes = normalizeRecipes(data?.recipes || []);
      console.log('[useRecipeFinder] loadMore — appending', recipes.length, 'recipes');
      setSearchResults((prev) => [...prev, ...recipes]);
      setHasMore(Boolean(data?.has_more));
      setSearchPage(nextPage);
    } catch (e: any) {
      console.error('[useRecipeFinder] loadMore error:', e?.message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, searchPage]);

  // ─── Daily suggestions ───────────────────────────────────────────────────────
  const loadDailySuggestions = useCallback(async (
    userGoals: UserGoals,
    forceRefresh = false,
  ): Promise<void> => {
    if (loadingRef.current) return;

    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${SUGGESTIONS_KEY_PREFIX}${today}`;

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
      } catch {}
    }

    loadingRef.current = true;
    setSuggestionsLoading(true);
    console.log('[useRecipeFinder] loadDailySuggestions — invoking recipe-finder edge function');

    try {
      const { data, error } = await supabase.functions.invoke('recipe-finder', {
        body: {
          query: 'healthy recipes',
          type: 'suggestions',
          userGoals: {
            ...userGoals,
            remainingProtein: userGoals.remainingProtein ?? Math.round(userGoals.protein * 0.5),
          },
        },
      });
      if (error) throw new Error(error.message);
      console.log('[useRecipeFinder] loadDailySuggestions — response received, duration_ms:', data?.duration_ms);
      const recipes = normalizeRecipes(data?.recipes || []);
      console.log('[useRecipeFinder] loadDailySuggestions — parsed', recipes.length, 'suggestions');

      const contextSummary = userGoals.remainingCalories > 0
        ? `Suggestions based on your ${userGoals.remainingCalories} remaining calories`
        : 'Suggested recipes for your goals';

      const suggestions: DailySuggestions = { recipes, generated_date: today, context_summary: contextSummary };
      setDailySuggestions(suggestions);
      try { await AsyncStorage.setItem(cacheKey, JSON.stringify(suggestions)); } catch {}
    } catch (e: any) {
      console.error('[useRecipeFinder] loadDailySuggestions error:', e?.message);
    } finally {
      setSuggestionsLoading(false);
      loadingRef.current = false;
    }
  }, []);

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

  // ─── Browse feed: internal page fetcher ─────────────────────────────────────
  const fetchBrowsePage = useCallback(async (page: number): Promise<{ recipes: RecipeResult[]; hasMore: boolean }> => {
    console.log('[useRecipeFinder] fetchBrowsePage — page:', page);
    const { data, error } = await supabase.functions.invoke('recipe-finder', {
      body: { type: 'browse', page },
    });
    if (error) throw new Error(error.message);
    console.log('[useRecipeFinder] fetchBrowsePage — page:', page, 'received:', data?.recipes?.length ?? 0, 'has_more:', data?.has_more);
    return { recipes: normalizeRecipes(data?.recipes || []), hasMore: Boolean(data?.has_more) };
  }, []);

  // ─── Browse feed: init (page 0 + silent prefetch of page 1) ─────────────────
  const initBrowse = useCallback(async (): Promise<void> => {
    if (browseLoading) return;
    console.log('[useRecipeFinder] initBrowse — starting');
    setBrowseLoading(true);
    setBrowseResults([]);
    setBrowsePage(0);
    setBrowseHasMore(true);
    prefetchedRef.current = [];
    try {
      const { recipes, hasMore } = await fetchBrowsePage(0);
      setBrowseResults(recipes);
      setBrowseHasMore(hasMore);
      setBrowsePage(0);
      console.log('[useRecipeFinder] initBrowse — loaded', recipes.length, 'recipes, has_more:', hasMore);
      // Silently prefetch page 1
      if (hasMore) {
        isPrefetchingRef.current = true;
        fetchBrowsePage(1)
          .then(({ recipes: prefetched }) => {
            prefetchedRef.current = prefetched;
            console.log('[useRecipeFinder] initBrowse — prefetched page 1:', prefetched.length, 'recipes');
          })
          .catch(() => {})
          .finally(() => { isPrefetchingRef.current = false; });
      }
    } catch (e: any) {
      console.error('[useRecipeFinder] initBrowse error:', e?.message);
    } finally {
      setBrowseLoading(false);
    }
  }, [browseLoading, fetchBrowsePage]);

  // ─── Browse feed: load more (serves from prefetch buffer, then prefetches next) ─
  const loadMoreBrowse = useCallback(async (): Promise<void> => {
    if (browseLoadingMore || !browseHasMore) return;
    const nextPage = browsePage + 1;
    console.log('[useRecipeFinder] loadMoreBrowse — nextPage:', nextPage, 'prefetchAvailable:', prefetchedRef.current.length);
    setBrowseLoadingMore(true);
    try {
      // If we have prefetched data, use it instantly (no spinner visible)
      if (prefetchedRef.current.length > 0) {
        const newRecipes = prefetchedRef.current;
        prefetchedRef.current = [];
        setBrowseResults((prev) => [...prev, ...newRecipes]);
        setBrowsePage(nextPage);
        setBrowseHasMore(true); // assume more until proven otherwise
        setBrowseLoadingMore(false);
        console.log('[useRecipeFinder] loadMoreBrowse — served', newRecipes.length, 'from prefetch buffer instantly');
        // Prefetch the NEXT page silently
        if (!isPrefetchingRef.current) {
          isPrefetchingRef.current = true;
          fetchBrowsePage(nextPage + 1)
            .then(({ recipes: prefetched, hasMore: moreAvailable }) => {
              prefetchedRef.current = prefetched;
              console.log('[useRecipeFinder] loadMoreBrowse — prefetched page', nextPage + 1, ':', prefetched.length, 'recipes, has_more:', moreAvailable);
              if (!moreAvailable && prefetched.length === 0) setBrowseHasMore(false);
            })
            .catch(() => {})
            .finally(() => { isPrefetchingRef.current = false; });
        }
        return;
      }

      // No prefetch available — fetch now (shows spinner briefly)
      console.log('[useRecipeFinder] loadMoreBrowse — no prefetch, fetching page', nextPage, 'now');
      const { recipes: newRecipes, hasMore } = await fetchBrowsePage(nextPage);
      setBrowseResults((prev) => [...prev, ...newRecipes]);
      setBrowsePage(nextPage);
      setBrowseHasMore(hasMore || newRecipes.length > 0);
      console.log('[useRecipeFinder] loadMoreBrowse — fetched', newRecipes.length, 'recipes, has_more:', hasMore);
      // Prefetch next
      if (!isPrefetchingRef.current) {
        isPrefetchingRef.current = true;
        fetchBrowsePage(nextPage + 1)
          .then(({ recipes: prefetched }) => {
            prefetchedRef.current = prefetched;
            console.log('[useRecipeFinder] loadMoreBrowse — prefetched page', nextPage + 1, ':', prefetched.length, 'recipes');
          })
          .catch(() => {})
          .finally(() => { isPrefetchingRef.current = false; });
      }
    } catch (e: any) {
      console.error('[useRecipeFinder] loadMoreBrowse error:', e?.message);
    } finally {
      setBrowseLoadingMore(false);
    }
  }, [browseLoadingMore, browseHasMore, browsePage, fetchBrowsePage]);

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
    hasMore,
    isLoadingMore,
    loadMore,
    dailySuggestions,
    suggestionsLoading,
    loadDailySuggestions,
    savedRecipes,
    saveRecipe,
    unsaveRecipe,
    loadSavedRecipes,
    // Browse feed
    browseResults,
    browseLoading,
    browseLoadingMore,
    browseHasMore,
    initBrowse,
    loadMoreBrowse,
    prefetchedRef,
  };
}
