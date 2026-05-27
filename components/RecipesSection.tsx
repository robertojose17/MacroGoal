
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, Image, ActivityIndicator, ScrollView, RefreshControl,
  ImageSourcePropType,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Recipe {
  id: string;
  name: string;
  cuisine: string | null;
  meal_type: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  description: string | null;
  dietary_tags: string[] | null;
  thumbnail_url: string | null;
  source: string | null;
  average_rating: number | null;
  review_count: number | null;
}

type RecipeFilter = 'All' | 'My Recipes' | 'Saved' | 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
const RECIPE_FILTERS: RecipeFilter[] = ['All', 'My Recipes', 'Saved', 'Breakfast', 'Lunch', 'Dinner', 'Snack'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const PLACEHOLDER_COLORS = ['#14B8A6', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#10B981'];

function getPlaceholderColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

// ─── Recipe Card ──────────────────────────────────────────────────────────────

interface RecipeCardProps {
  recipe: Recipe;
  isDark: boolean;
  onPress: () => void;
}

function RecipeCard({ recipe, isDark, onPress }: RecipeCardProps) {
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const placeholderColor = getPlaceholderColor(recipe.id);
  const ratingDisplay = recipe.average_rating != null ? Number(recipe.average_rating).toFixed(1) : '—';
  const reviewCountDisplay = recipe.review_count != null ? String(recipe.review_count) : '0';
  const caloriesDisplay = recipe.calories != null ? String(Math.round(Number(recipe.calories))) : '—';
  const proteinDisplay = recipe.protein != null ? String(Math.round(Number(recipe.protein))) : '—';
  const carbsDisplay = recipe.carbs != null ? String(Math.round(Number(recipe.carbs))) : '—';
  const fatDisplay = recipe.fat != null ? String(Math.round(Number(recipe.fat))) : '—';

  return (
    <TouchableOpacity
      style={[rcStyles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
      onPress={() => {
        console.log('[RecipesSection] Recipe card pressed:', recipe.id, recipe.name);
        onPress();
      }}
      activeOpacity={0.75}
    >
      {/* Thumbnail */}
      {recipe.thumbnail_url ? (
        <Image
          source={resolveImageSource(recipe.thumbnail_url)}
          style={rcStyles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={[rcStyles.thumbnailPlaceholder, { backgroundColor: placeholderColor + '33' }]}>
          <IconSymbol
            ios_icon_name="fork.knife"
            android_material_icon_name="restaurant"
            size={28}
            color={placeholderColor}
          />
        </View>
      )}

      {/* Content */}
      <View style={rcStyles.cardContent}>
        <Text style={[rcStyles.recipeName, { color: textColor }]} numberOfLines={2}>
          {recipe.name}
        </Text>

        <Text style={[rcStyles.caloriesText, { color: colors.calories }]}>
          {caloriesDisplay}
          <Text style={[rcStyles.caloriesUnit, { color: secondaryColor }]}> kcal</Text>
        </Text>

        {/* Rating row */}
        <View style={rcStyles.ratingRow}>
          <Text style={rcStyles.starIcon}>⭐</Text>
          <Text style={[rcStyles.ratingValue, { color: colors.fats }]}>{ratingDisplay}</Text>
          <Text style={[rcStyles.reviewCount, { color: secondaryColor }]}>
            {'('}
            {reviewCountDisplay}
            {')'}
          </Text>
        </View>

        {/* Macro row */}
        <View style={rcStyles.macroRow}>
          <Text style={[rcStyles.macroText, { color: colors.protein }]}>
            {'P:'}
            {proteinDisplay}
            {'g'}
          </Text>
          <Text style={[rcStyles.macroDot, { color: secondaryColor }]}> · </Text>
          <Text style={[rcStyles.macroText, { color: colors.carbs }]}>
            {'C:'}
            {carbsDisplay}
            {'g'}
          </Text>
          <Text style={[rcStyles.macroDot, { color: secondaryColor }]}> · </Text>
          <Text style={[rcStyles.macroText, { color: colors.fats }]}>
            {'F:'}
            {fatDisplay}
            {'g'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RecipesSectionProps {
  isDark: boolean;
}

export default function RecipesSection({ isDark }: RecipesSectionProps) {
  const router = useRouter();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<RecipeFilter>('All');

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? colors.cardDark : colors.card;
  const inputBorder = isDark ? colors.borderDark : colors.border;

  const loadRecipes = useCallback(async () => {
    console.log('[RecipesSection] Loading recipes, filter:', activeFilter, 'query:', searchQuery);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id ?? null;

      // ── My Recipes ──────────────────────────────────────────────────────────
      if (activeFilter === 'My Recipes') {
        if (!currentUserId) {
          setRecipes([]);
          return;
        }
        let query = supabase
          .from('meal_recipes')
          .select('id, name, cuisine, meal_type, calories, protein, carbs, fat, description, dietary_tags, thumbnail_url, source, average_rating, review_count')
          .eq('created_by', currentUserId)
          .order('average_rating', { ascending: false, nullsFirst: false })
          .order('review_count', { ascending: false, nullsFirst: false })
          .limit(50);

        if (searchQuery.trim()) {
          query = query.ilike('name', `%${searchQuery.trim()}%`);
        }

        const { data, error: fetchError } = await query;
        if (fetchError) {
          console.error('[RecipesSection] Error loading my recipes:', fetchError);
          setError('Failed to load recipes. Please try again.');
          return;
        }
        console.log('[RecipesSection] My recipes loaded:', data?.length ?? 0);
        setRecipes((data as Recipe[]) ?? []);
        return;
      }

      // ── Saved ────────────────────────────────────────────────────────────────
      if (activeFilter === 'Saved') {
        if (!currentUserId) {
          setRecipes([]);
          return;
        }
        const { data: favData, error: favError } = await supabase
          .from('recipe_favorites')
          .select('recipe_id')
          .eq('user_id', currentUserId);

        if (favError) {
          console.error('[RecipesSection] Error loading favorites:', favError);
          setError('Failed to load saved recipes. Please try again.');
          return;
        }

        const recipeIds = (favData ?? []).map((r: { recipe_id: string }) => r.recipe_id);
        console.log('[RecipesSection] Saved recipe IDs:', recipeIds.length);

        if (recipeIds.length === 0) {
          setRecipes([]);
          return;
        }

        let query = supabase
          .from('meal_recipes')
          .select('id, name, cuisine, meal_type, calories, protein, carbs, fat, description, dietary_tags, thumbnail_url, source, average_rating, review_count')
          .in('id', recipeIds)
          .eq('is_public', true)
          .order('average_rating', { ascending: false, nullsFirst: false })
          .order('review_count', { ascending: false, nullsFirst: false })
          .limit(50);

        if (searchQuery.trim()) {
          query = query.ilike('name', `%${searchQuery.trim()}%`);
        }

        const { data, error: fetchError } = await query;
        if (fetchError) {
          console.error('[RecipesSection] Error loading saved recipes:', fetchError);
          setError('Failed to load saved recipes. Please try again.');
          return;
        }
        console.log('[RecipesSection] Saved recipes loaded:', data?.length ?? 0);
        setRecipes((data as Recipe[]) ?? []);
        return;
      }

      // ── All / Meal-type filters ──────────────────────────────────────────────
      let query = supabase
        .from('meal_recipes')
        .select('id, name, cuisine, meal_type, calories, protein, carbs, fat, description, dietary_tags, thumbnail_url, source, average_rating, review_count')
        .eq('is_public', true)
        .order('average_rating', { ascending: false, nullsFirst: false })
        .order('review_count', { ascending: false, nullsFirst: false })
        .limit(50);

      if (searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }

      if (activeFilter !== 'All') {
        query = query.ilike('meal_type', activeFilter.toLowerCase());
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error('[RecipesSection] Error loading recipes:', fetchError);
        setError('Failed to load recipes. Please try again.');
        return;
      }

      console.log('[RecipesSection] Recipes loaded:', data?.length ?? 0);
      setRecipes((data as Recipe[]) ?? []);
    } catch (err: any) {
      console.error('[RecipesSection] Unexpected error:', err);
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, activeFilter]);

  useFocusEffect(
    useCallback(() => {
      console.log('[RecipesSection] Screen focused, reloading recipes');
      setLoading(true);
      loadRecipes();
    }, [loadRecipes])
  );

  const onRefresh = () => {
    console.log('[RecipesSection] Pull-to-refresh triggered');
    setRefreshing(true);
    loadRecipes();
  };

  const handleSearch = (text: string) => {
    console.log('[RecipesSection] Search query changed:', text);
    setSearchQuery(text);
  };

  const handleFilterPress = (filter: RecipeFilter) => {
    console.log('[RecipesSection] Filter chip pressed:', filter);
    setActiveFilter(filter);
  };

  const handleRecipePress = (recipe: Recipe) => {
    router.push({ pathname: '/recipe-detail', params: { id: recipe.id } });
  };

  const handleAddRecipe = () => {
    console.log('[RecipesSection] Add Recipe FAB pressed');
    router.push('/recipe-create');
  };

  const renderRecipeCard = ({ item, index }: { item: Recipe; index: number }) => {
    const isLeftColumn = index % 2 === 0;
    return (
      <View style={[rcStyles.gridItem, isLeftColumn ? { paddingRight: spacing.xs } : { paddingLeft: spacing.xs }]}>
        <RecipeCard recipe={item} isDark={isDark} onPress={() => handleRecipePress(item)} />
      </View>
    );
  };

  const ListHeader = (
    <View>
      {/* Search bar */}
      <View style={[rcStyles.searchContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
        <IconSymbol
          ios_icon_name="magnifyingglass"
          android_material_icon_name="search"
          size={18}
          color={secondaryColor}
        />
        <TextInput
          style={[rcStyles.searchInput, { color: textColor }]}
          placeholder="Search recipes..."
          placeholderTextColor={secondaryColor}
          value={searchQuery}
          onChangeText={handleSearch}
          returnKeyType="search"
          onSubmitEditing={() => {
            console.log('[RecipesSection] Search submitted:', searchQuery);
            setLoading(true);
            loadRecipes();
          }}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              console.log('[RecipesSection] Search cleared');
              setSearchQuery('');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={18}
              color={secondaryColor}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={rcStyles.filterScroll}
        contentContainerStyle={rcStyles.filterContent}
      >
        {RECIPE_FILTERS.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[
                rcStyles.filterChip,
                {
                  backgroundColor: isActive ? colors.primary : (isDark ? colors.cardDark : colors.card),
                  borderColor: isActive ? colors.primary : (isDark ? colors.borderDark : colors.border),
                },
              ]}
              onPress={() => handleFilterPress(filter)}
              activeOpacity={0.7}
            >
              <Text style={[rcStyles.filterChipText, { color: isActive ? '#fff' : secondaryColor }]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const emptyTitle =
    activeFilter === 'My Recipes' ? 'No recipes yet' :
    activeFilter === 'Saved' ? 'No saved recipes' :
    'No recipes found';

  const emptySubtitle =
    activeFilter === 'My Recipes' ? 'Tap + Add Recipe to create your first recipe' :
    activeFilter === 'Saved' ? 'Tap the bookmark icon on any recipe to save it here' :
    searchQuery ? 'Try a different search term' : 'Be the first to add a recipe!';

  const ListEmpty = loading ? (
    <View style={rcStyles.centerContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  ) : error ? (
    <View style={rcStyles.centerContainer}>
      <Text style={[rcStyles.errorText, { color: colors.error }]}>{error}</Text>
      <TouchableOpacity
        style={[rcStyles.retryBtn, { backgroundColor: colors.primary }]}
        onPress={() => {
          console.log('[RecipesSection] Retry pressed');
          setLoading(true);
          loadRecipes();
        }}
      >
        <Text style={rcStyles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={rcStyles.centerContainer}>
      <IconSymbol
        ios_icon_name={activeFilter === 'Saved' ? 'bookmark' : 'fork.knife'}
        android_material_icon_name={activeFilter === 'Saved' ? 'bookmark-border' : 'restaurant'}
        size={48}
        color={secondaryColor}
      />
      <Text style={[rcStyles.emptyTitle, { color: textColor }]}>{emptyTitle}</Text>
      <Text style={[rcStyles.emptySubtitle, { color: secondaryColor }]}>{emptySubtitle}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <FlatList
        data={recipes}
        renderItem={renderRecipeCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={rcStyles.listContent}
        columnWrapperStyle={rcStyles.columnWrapper}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[rcStyles.fab, { backgroundColor: colors.primary }]}
        onPress={handleAddRecipe}
        activeOpacity={0.85}
      >
        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={24} color="#fff" />
        <Text style={rcStyles.fabText}>Add Recipe</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const rcStyles = StyleSheet.create({
  listContent: {
    paddingBottom: 100,
  },
  columnWrapper: {
    paddingHorizontal: 0,
  },
  gridItem: {
    flex: 1,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
  },
  thumbnail: {
    width: '100%',
    height: 110,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    padding: spacing.sm,
    gap: 3,
  },
  recipeName: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 2,
  },
  caloriesText: {
    fontSize: 13,
    fontWeight: '700',
  },
  caloriesUnit: {
    fontSize: 11,
    fontWeight: '400',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  starIcon: {
    fontSize: 11,
  },
  ratingValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  reviewCount: {
    fontSize: 11,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'nowrap',
  },
  macroText: {
    fontSize: 10,
    fontWeight: '600',
  },
  macroDot: {
    fontSize: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
  },
  filterScroll: {
    marginBottom: spacing.sm,
  },
  filterContent: {
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  centerContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
