/**
 * Most Popular Recipes Tab Screen
 * Fetches and displays popular recipes from the popular-recipes edge function
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  RefreshControl,
  ImageSourcePropType,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { supabase } from '@/lib/supabase/client';

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

interface PopularRecipe {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  source_name: string | null;
  source_url: string | null;
  prep_time_minutes: number | null;
  servings: number | null;
  calories_per_serving: number | null;
  protein_per_serving: number | null;
  carbs_per_serving: number | null;
  fat_per_serving: number | null;
  fiber_per_serving: number | null;
  ingredients: any;
  instructions: any;
  reviews: any;
  tags: any;
  click_count: number | null;
  generated_at: string | null;
  last_clicked_at: string | null;
}

function RecipeCard({
  recipe,
  onPress,
  isDark,
}: {
  recipe: PopularRecipe;
  onPress: () => void;
  isDark: boolean;
}) {
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const calories = recipe.calories_per_serving != null ? Math.round(Number(recipe.calories_per_serving)) : null;
  const protein = recipe.protein_per_serving != null ? Math.round(Number(recipe.protein_per_serving)) : null;
  const prepTime = recipe.prep_time_minutes != null ? `${recipe.prep_time_minutes} min` : null;
  const clickCount = recipe.click_count != null ? Number(recipe.click_count) : 0;

  const imageSource = recipe.image_url
    ? resolveImageSource(recipe.image_url)
    : resolveImageSource(`https://picsum.photos/seed/${encodeURIComponent((recipe.name || 'recipe').replace(/\s+/g, '-').toLowerCase())}/400/300`);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: cardBg, borderColor }]}
      accessibilityRole="button"
    >
      <Image
        source={imageSource}
        style={styles.cardImage}
        resizeMode="cover"
      />
      <View style={styles.cardBody}>
        <Text style={[styles.cardName, { color: textColor }]} numberOfLines={2}>
          {recipe.name}
        </Text>
        <View style={styles.cardMeta}>
          {calories != null && (
            <View style={[styles.metaPill, { backgroundColor: colors.calories + '18' }]}>
              <Text style={[styles.metaPillText, { color: colors.calories }]}>
                {calories}
              </Text>
              <Text style={[styles.metaPillUnit, { color: colors.calories }]}>cal</Text>
            </View>
          )}
          {protein != null && (
            <View style={[styles.metaPill, { backgroundColor: colors.protein + '18' }]}>
              <Text style={[styles.metaPillText, { color: colors.protein }]}>
                {protein}
              </Text>
              <Text style={[styles.metaPillUnit, { color: colors.protein }]}>g protein</Text>
            </View>
          )}
        </View>
        {prepTime != null && (
          <Text style={[styles.prepTime, { color: subColor }]}>
            {prepTime}
          </Text>
        )}
        {clickCount > 0 && (
          <View style={styles.popularRow}>
            <Text style={styles.fireEmoji}>🔥</Text>
            <Text style={[styles.popularText, { color: subColor }]}>
              {clickCount}
              {' people made this'}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function RecipesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [recipes, setRecipes] = useState<PopularRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const fetchRecipes = useCallback(async (isRefresh = false) => {
    console.log('[Recipes] Fetching popular recipes, isRefresh:', isRefresh);
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('popular-recipes', {
        method: 'GET',
      });
      if (fnError) {
        console.error('[Recipes] Edge function error:', fnError);
        setError('Failed to load recipes. Pull to refresh.');
      } else {
        const list: PopularRecipe[] = Array.isArray(data) ? data : (data?.recipes ?? []);
        console.log('[Recipes] Fetched', list.length, 'popular recipes');
        setRecipes(list);
      }
    } catch (e: any) {
      console.error('[Recipes] fetchRecipes error:', e?.message);
      setError('Failed to load recipes. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRecipes(false);
  }, [fetchRecipes]);

  const handleRefresh = useCallback(() => {
    console.log('[Recipes] Pull-to-refresh triggered');
    setRefreshing(true);
    fetchRecipes(true);
  }, [fetchRecipes]);

  const handleRecipePress = useCallback((recipe: PopularRecipe) => {
    console.log('[Recipes] Recipe card pressed — id:', recipe.id, 'name:', recipe.name);

    // Fire-and-forget click increment
    supabase.functions.invoke('popular-recipes', {
      method: 'POST',
      body: { id: recipe.id },
    }).then(() => {
      console.log('[Recipes] Click count incremented for recipe:', recipe.id);
    }).catch((e: any) => {
      console.warn('[Recipes] Failed to increment click count:', e?.message);
    });

    // Build a RecipeResult-compatible object for the detail screen
    const recipeParam = {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description ?? '',
      image_url: recipe.image_url ?? null,
      source_name: recipe.source_name ?? 'Popular Recipes',
      source_url: recipe.source_url ?? null,
      prep_time_minutes: recipe.prep_time_minutes ?? null,
      servings: recipe.servings ?? 1,
      calories_per_serving: Number(recipe.calories_per_serving) || 0,
      protein_per_serving: Number(recipe.protein_per_serving) || 0,
      carbs_per_serving: Number(recipe.carbs_per_serving) || 0,
      fat_per_serving: Number(recipe.fat_per_serving) || 0,
      fiber_per_serving: Number(recipe.fiber_per_serving) || 0,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
      reviews: Array.isArray(recipe.reviews) ? recipe.reviews : [],
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
      is_saved: false,
    };

    router.push({
      pathname: '/recipe-finder-detail',
      params: { recipe: JSON.stringify(recipeParam) },
    });
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: PopularRecipe; index: number }) => {
    const isLeft = index % 2 === 0;
    return (
      <View style={[styles.gridItem, isLeft ? { paddingRight: spacing.xs / 2 } : { paddingLeft: spacing.xs / 2 }]}>
        <RecipeCard
          recipe={item}
          onPress={() => handleRecipePress(item)}
          isDark={isDark}
        />
      </View>
    );
  }, [handleRecipePress, isDark]);

  const headerComponent = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <Text style={[styles.headerTitle, { color: textColor }]}>Most Popular</Text>
      <Text style={[styles.headerSubtitle, { color: subColor }]}>
        {'What people are cooking right now 🔥'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        {headerComponent}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: subColor }]}>Loading recipes...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        {headerComponent}
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: subColor }]}>{error}</Text>
          <Pressable
            onPress={() => {
              console.log('[Recipes] Retry button pressed');
              fetchRecipes(false);
            }}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (recipes.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        {headerComponent}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.md }} />
          <Text style={[styles.emptyTitle, { color: textColor }]}>Generating popular recipes...</Text>
          <Text style={[styles.emptySubtitle, { color: subColor }]}>
            Check back soon — we're curating the best recipes for you.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={2}
        ListHeaderComponent={headerComponent}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.columnWrapper}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '400',
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  columnWrapper: {
    marginBottom: spacing.sm,
  },
  gridItem: {
    flex: 1,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
  cardBody: {
    padding: spacing.sm,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    gap: 2,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaPillUnit: {
    fontSize: 10,
    fontWeight: '400',
  },
  prepTime: {
    fontSize: 11,
    marginBottom: 4,
  },
  popularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  fireEmoji: {
    fontSize: 11,
  },
  popularText: {
    fontSize: 11,
    fontWeight: '500',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
