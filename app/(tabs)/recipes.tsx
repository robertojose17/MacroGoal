/**
 * Recipes Tab — Trending Now + Popular This Week + Search + Category Filters
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  ActivityIndicator, RefreshControl, ScrollView, TextInput,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
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

interface RecipeItem {
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
  ingredients: any[];
  instructions: any[];
  reviews: any[];
  tags: any[];
  click_count: number | null;
  generated_at: string | null;
  last_clicked_at: string | null;
}

function normalizeRecipe(recipe: any): RecipeItem {
  return {
    ...recipe,
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions)
      ? recipe.instructions.map((s: any) =>
          typeof s === 'string' ? s : String(s?.text ?? s?.description ?? s?.instruction ?? JSON.stringify(s))
        )
      : [],
    reviews: Array.isArray(recipe.reviews) ? recipe.reviews : [],
  };
}

// ── Category filter definitions ───────────────────────────────────────────────
interface FilterDef {
  id: string;
  label: string;
  match: (r: RecipeItem) => boolean;
}

const FILTERS: FilterDef[] = [
  { id: 'all', label: 'All', match: () => true },
  {
    id: 'high-protein',
    label: '🔥 High Protein',
    match: (r) => r.protein_per_serving != null && Number(r.protein_per_serving) >= 30,
  },
  {
    id: 'low-carb',
    label: '🥗 Low Carb',
    match: (r) => r.carbs_per_serving != null && Number(r.carbs_per_serving) <= 20,
  },
  {
    id: 'vegetarian',
    label: '🌱 Vegetarian',
    match: (r) => {
      const tags = r.tags.map((t: any) => String(t).toLowerCase());
      return tags.includes('vegetarian') || tags.includes('vegan');
    },
  },
  {
    id: 'quick',
    label: '⚡ Quick',
    match: (r) => r.prep_time_minutes != null && Number(r.prep_time_minutes) <= 20,
  },
  {
    id: 'breakfast',
    label: '🍳 Breakfast',
    match: (r) => {
      const tags = r.tags.map((t: any) => String(t).toLowerCase());
      return tags.includes('breakfast');
    },
  },
  {
    id: 'keto',
    label: '🥩 Keto',
    match: (r) => {
      const tags = r.tags.map((t: any) => String(t).toLowerCase());
      return tags.includes('keto') || (r.carbs_per_serving != null && Number(r.carbs_per_serving) <= 10);
    },
  },
];

// ── Skeleton cards ────────────────────────────────────────────────────────────
function TrendingSkeletonCard({ isDark }: { isDark: boolean }) {
  const skeletonBg = isDark ? '#2a2a2a' : '#F3F4F6';
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  return (
    <View style={[styles.trendingCard, { backgroundColor: cardBg, borderColor }]}>
      <ShimmerBox style={{ width: 200, height: 130 }} isDark={isDark} />
      <View style={[styles.trendingBody, { gap: 8 }]}>
        <ShimmerBox style={{ width: 160, height: 14, borderRadius: 4 }} isDark={isDark} />
        <ShimmerBox style={{ width: 100, height: 12, borderRadius: 4 }} isDark={isDark} />
      </View>
    </View>
  );
}

function PopularSkeletonCard({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  return (
    <View style={[styles.popularCard, { backgroundColor: cardBg, borderColor }]}>
      <ShimmerBox style={{ width: '100%', height: 150 }} isDark={isDark} />
      <View style={[styles.popularBody, { gap: 8 }]}>
        <ShimmerBox style={{ width: '80%', height: 14, borderRadius: 4 }} isDark={isDark} />
        <ShimmerBox style={{ width: '60%', height: 12, borderRadius: 4 }} isDark={isDark} />
      </View>
    </View>
  );
}

function SearchSkeletonRow({ isDark }: { isDark: boolean }) {
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  return (
    <View style={[styles.searchResultRow, { borderBottomColor: borderColor }]}>
      <ShimmerBox style={{ width: 52, height: 52, borderRadius: borderRadius.sm }} isDark={isDark} />
      <View style={{ flex: 1, gap: 8 }}>
        <ShimmerBox style={{ width: 200, height: 14, borderRadius: 4 }} isDark={isDark} />
        <ShimmerBox style={{ width: 120, height: 12, borderRadius: 4 }} isDark={isDark} />
      </View>
    </View>
  );
}

// ── Trending card (horizontal) ────────────────────────────────────────────────
function TrendingCard({ recipe, onPress, isDark }: { recipe: RecipeItem; onPress: () => void; isDark: boolean }) {
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const calories = recipe.calories_per_serving != null ? Math.round(Number(recipe.calories_per_serving)) : null;
  const protein = recipe.protein_per_serving != null ? Math.round(Number(recipe.protein_per_serving)) : null;
  const caloriesBg = colors.calories + '18';
  const proteinBg = colors.protein + '18';

  return (
    <Pressable
      onPress={() => {
        console.log('[Recipes] Trending card pressed:', recipe.name, recipe.id);
        onPress();
      }}
      style={[styles.trendingCard, { backgroundColor: cardBg, borderColor }]}
    >
      <RecipeImage
        recipeId={recipe.id}
        initialUrl={recipe.image_url}
        style={styles.trendingImage}
        iconSize={40}
      />
      <View style={styles.trendingBody}>
        <Text style={[styles.trendingName, { color: textColor }]} numberOfLines={2}>{recipe.name}</Text>
        <View style={styles.pillRow}>
          {calories != null && (
            <View style={[styles.pill, { backgroundColor: caloriesBg }]}>
              <Text style={[styles.pillText, { color: colors.calories }]}>{calories} cal</Text>
            </View>
          )}
          {protein != null && (
            <View style={[styles.pill, { backgroundColor: proteinBg }]}>
              <Text style={[styles.pillText, { color: colors.protein }]}>{protein}g P</Text>
            </View>
          )}
        </View>
        {recipe.source_name && (
          <Text style={[styles.trendingSource, { color: subColor }]} numberOfLines={1}>
            {recipe.source_name}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ── Popular grid card ─────────────────────────────────────────────────────────
function PopularCard({ recipe, onPress, isDark }: { recipe: RecipeItem; onPress: () => void; isDark: boolean }) {
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const calories = recipe.calories_per_serving != null ? Math.round(Number(recipe.calories_per_serving)) : null;
  const protein = recipe.protein_per_serving != null ? Math.round(Number(recipe.protein_per_serving)) : null;
  const clickCount = recipe.click_count != null ? Number(recipe.click_count) : 0;
  const caloriesBg = colors.calories + '18';
  const proteinBg = colors.protein + '18';

  return (
    <Pressable
      onPress={() => {
        console.log('[Recipes] Popular card pressed:', recipe.name, recipe.id);
        onPress();
      }}
      style={[styles.popularCard, { backgroundColor: cardBg, borderColor }]}
    >
      <RecipeImage
        recipeId={recipe.id}
        initialUrl={recipe.image_url}
        style={styles.popularImage}
        iconSize={32}
      />
      <View style={styles.popularBody}>
        <Text style={[styles.popularName, { color: textColor }]} numberOfLines={2}>{recipe.name}</Text>
        <View style={styles.pillRow}>
          {calories != null && (
            <View style={[styles.pill, { backgroundColor: caloriesBg }]}>
              <Text style={[styles.pillText, { color: colors.calories }]}>{calories} cal</Text>
            </View>
          )}
          {protein != null && (
            <View style={[styles.pill, { backgroundColor: proteinBg }]}>
              <Text style={[styles.pillText, { color: colors.protein }]}>{protein}g P</Text>
            </View>
          )}
        </View>
        {recipe.prep_time_minutes != null && (
          <Text style={[styles.prepTime, { color: subColor }]}>{recipe.prep_time_minutes} min</Text>
        )}
        {clickCount > 0 && (
          <View style={styles.clickRow}>
            <Text style={styles.fireEmoji}>🔥</Text>
            <Text style={[styles.clickText, { color: subColor }]}>{clickCount} made this</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Search result row ─────────────────────────────────────────────────────────
function SearchResultRow({ recipe, onPress, isDark }: { recipe: any; onPress: () => void; isDark: boolean }) {
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const calories = recipe.calories_per_serving != null ? Math.round(Number(recipe.calories_per_serving)) : null;
  const caloriesText = calories != null ? `${calories} cal` : '';
  const sourceText = recipe.source_name ? ` · ${recipe.source_name}` : '';
  const metaText = caloriesText + sourceText;

  return (
    <Pressable
      onPress={() => {
        console.log('[Recipes] Search result pressed:', recipe.name, recipe.id);
        onPress();
      }}
      style={[styles.searchResultRow, { borderBottomColor: borderColor }]}
    >
      <RecipeImage
        recipeId={recipe.id}
        initialUrl={recipe.image_url}
        style={{ width: 52, height: 52, borderRadius: borderRadius.sm }}
        iconSize={24}
      />
      <View style={styles.searchResultInfo}>
        <Text style={[styles.searchResultName, { color: textColor }]} numberOfLines={2}>{recipe.name}</Text>
        <Text style={[styles.searchResultMeta, { color: subColor }]}>{metaText}</Text>
      </View>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function RecipesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [trending, setTrending] = useState<RecipeItem[]>([]);
  const [popularThisWeek, setPopularThisWeek] = useState<RecipeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const inputBg = isDark ? colors.cardDark : '#F5F5F5';

  const fetchPopular = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    console.log('[Recipes] Fetching popular recipes, isRefresh:', isRefresh);
    try {
      console.log('[Recipes] popular-recipes request — invoking edge function');
      const { data, error: fnError } = await supabase.functions.invoke('popular-recipes', {
        method: 'POST',
        body: { action: 'get_popular' },
      });
      if (fnError) {
        console.error('[Recipes] popular-recipes error:', fnError);
        setError('Failed to load recipes. Pull to refresh.');
      } else {
        console.log('[Recipes] popular-recipes response — trending:', data?.trending?.length ?? 0, 'popular_this_week:', data?.popular_this_week?.length ?? 0);
        setTrending((data?.trending ?? []).map(normalizeRecipe));
        setPopularThisWeek((data?.popular_this_week ?? []).map(normalizeRecipe));
      }
    } catch (e: any) {
      console.error('[Recipes] fetchPopular error:', e?.message);
      setError('Failed to load recipes. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPopular(false); }, [fetchPopular]);

  const handleRefresh = useCallback(() => {
    console.log('[Recipes] Pull-to-refresh triggered');
    setRefreshing(true);
    fetchPopular(true);
  }, [fetchPopular]);

  // Search with debounce — immediately show skeleton on typing
  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!text.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    // Show skeleton immediately so UI responds to typing
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      console.log('[Recipes] Search request fired, query:', text.trim());
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error: fnError } = await supabase.functions.invoke('recipe-finder', {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          body: { query: text.trim(), type: 'search' },
        });
        if (fnError) {
          console.error('[Recipes] search error:', fnError);
          setSearchResults([]);
        } else {
          const results = (data?.recipes ?? []).map(normalizeRecipe);
          console.log('[Recipes] Search results count:', results.length);
          setSearchResults(results);
        }
      } catch (e: any) {
        console.error('[Recipes] search error:', e?.message);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 500);
  }, []);

  const handleRecipePress = useCallback((recipe: RecipeItem | any) => {
    const normalized = normalizeRecipe(recipe);
    console.log('[Recipes] Recipe pressed, tracking click:', normalized.id, normalized.name);
    // Fire-and-forget click tracking
    supabase.functions.invoke('popular-recipes', {
      method: 'POST',
      body: { id: normalized.id },
    }).catch(() => {});

    router.push({
      pathname: '/recipe-finder-detail',
      params: { recipe: JSON.stringify(normalized) },
    });
  }, [router]);

  const handleSearchResultPress = useCallback((recipe: any) => {
    console.log('[Recipes] Search result selected:', recipe.name);
    setSearchText('');
    setSearchResults([]);
    handleRecipePress(recipe);
  }, [handleRecipePress]);

  const handleClearSearch = useCallback(() => {
    console.log('[Recipes] Search cleared');
    setSearchText('');
    setSearchResults([]);
  }, []);

  const handleFilterPress = useCallback((filterId: string) => {
    console.log('[Recipes] Filter selected:', filterId);
    setActiveFilter(filterId);
  }, []);

  const isSearchActive = searchText.trim().length > 0;
  const headerPaddingTop = insets.top + spacing.md;

  // Derive filtered lists client-side
  const activeFilterDef = FILTERS.find((f) => f.id === activeFilter) ?? FILTERS[0];
  const filteredTrending = activeFilter === 'all' ? trending : trending.filter(activeFilterDef.match);
  const filteredPopular = activeFilter === 'all' ? popularThisWeek : popularThisWeek.filter(activeFilterDef.match);
  const noFilterResults = activeFilter !== 'all' && filteredTrending.length === 0 && filteredPopular.length === 0;
  const emptyFilterMessage = `No ${activeFilterDef.label.replace(/^[^\w]+/, '')} recipes yet — search to add some!`;

  const skeletonBg = isDark ? '#2a2a2a' : '#F3F4F6';

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Recipes</Text>
          <Text style={[styles.headerSubtitle, { color: subColor }]}>Discover what people are cooking 🍳</Text>
        </View>

        {/* Trending skeleton */}
        <View style={styles.sectionHeader}>
          <ShimmerBox style={{ width: 140, height: 18, borderRadius: 4 }} isDark={isDark} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendingList}
          scrollEnabled={false}
        >
          {[0, 1, 2].map((i) => (
            <TrendingSkeletonCard key={i} isDark={isDark} />
          ))}
        </ScrollView>

        {/* Popular skeleton */}
        <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
          <ShimmerBox style={{ width: 180, height: 18, borderRadius: 4 }} isDark={isDark} />
        </View>
        <View style={[styles.popularGrid, { paddingHorizontal: spacing.md }]}>
          {[0, 1, 2, 3].map((i) => {
            const gridItemStyle = i % 2 === 0 ? { paddingRight: 4 } : { paddingLeft: 4 };
            return (
              <View key={i} style={[styles.popularGridItem, gridItemStyle]}>
                <PopularSkeletonCard isDark={isDark} />
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Recipes</Text>
          <Text style={[styles.headerSubtitle, { color: subColor }]}>Discover what people are cooking 🍳</Text>
        </View>

        {/* Search bar */}
        <View style={[styles.searchContainer, { marginHorizontal: spacing.md, marginBottom: spacing.md }]}>
          <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor }]}>
            <Search size={18} color={subColor} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search any recipe..."
              placeholderTextColor={subColor}
              value={searchText}
              onChangeText={handleSearchChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <Pressable onPress={handleClearSearch}>
                <X size={18} color={subColor} />
              </Pressable>
            )}
          </View>

          {/* Search results dropdown */}
          {isSearchActive && (
            <View style={[styles.searchDropdown, { backgroundColor: cardBg, borderColor }]}>
              {searchLoading ? (
                <View style={styles.searchSkeletonContainer}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <SearchSkeletonRow key={i} isDark={isDark} />
                  ))}
                </View>
              ) : searchResults.length === 0 ? (
                <Text style={[styles.noResultsText, { color: subColor }]}>No recipes found. Try a different search.</Text>
              ) : (
                searchResults.map((recipe, idx) => (
                  <SearchResultRow
                    key={recipe.id ?? idx}
                    recipe={recipe}
                    onPress={() => handleSearchResultPress(recipe)}
                    isDark={isDark}
                  />
                ))
              )}
            </View>
          )}
        </View>

        {/* Category filter bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filterList, { paddingHorizontal: spacing.md }]}
          style={styles.filterBar}
        >
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.id;
            const chipBg = isActive ? colors.primary : 'transparent';
            const chipBorder = isActive ? colors.primary : borderColor;
            const chipText = isActive ? '#FFFFFF' : subColor;
            return (
              <Pressable
                key={filter.id}
                onPress={() => handleFilterPress(filter.id)}
                style={[styles.filterChip, { backgroundColor: chipBg, borderColor: chipBorder }]}
              >
                <Text style={[styles.filterChipText, { color: chipText }]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error && (
          <View style={styles.errorRow}>
            <Text style={[styles.errorText, { color: subColor }]}>{error}</Text>
          </View>
        )}

        {/* Empty state when filter has no matches */}
        {noFilterResults ? (
          <View style={styles.filterEmptyState}>
            <Text style={[styles.filterEmptyText, { color: subColor }]}>{emptyFilterMessage}</Text>
          </View>
        ) : (
          <>
            {/* Trending Now */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>🔥 Trending Now</Text>
              <Text style={[styles.sectionSubtitle, { color: subColor }]}>Most clicked this week</Text>
            </View>
            {filteredTrending.length === 0 ? (
              <Text style={[styles.emptySection, { color: subColor }]}>
                {trending.length === 0 ? 'Loading trending recipes...' : 'No matches in trending.'}
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trendingList}
              >
                {filteredTrending.map((recipe) => (
                  <TrendingCard
                    key={recipe.id}
                    recipe={recipe}
                    onPress={() => handleRecipePress(recipe)}
                    isDark={isDark}
                  />
                ))}
              </ScrollView>
            )}

            {/* Popular This Week */}
            <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>✨ Popular This Week</Text>
              <Text style={[styles.sectionSubtitle, { color: subColor }]}>Trending in the community</Text>
            </View>
            {filteredPopular.length === 0 ? (
              <Text style={[styles.emptySection, { color: subColor }]}>
                {popularThisWeek.length === 0 ? 'Loading popular recipes...' : 'No matches in popular.'}
              </Text>
            ) : (
              <View style={[styles.popularGrid, { paddingHorizontal: spacing.md }]}>
                {filteredPopular.map((recipe, idx) => {
                  const gridItemStyle = idx % 2 === 0 ? { paddingRight: 4 } : { paddingLeft: 4 };
                  return (
                    <View key={recipe.id} style={[styles.popularGridItem, gridItemStyle]}>
                      <PopularCard
                        recipe={recipe}
                        onPress={() => handleRecipePress(recipe)}
                        isDark={isDark}
                      />
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  headerSubtitle: { fontSize: 14 },
  loadingText: { marginTop: spacing.md, fontSize: 14 },
  errorRow: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  errorText: { fontSize: 13, textAlign: 'center' },
  searchContainer: { position: 'relative', zIndex: 100 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: borderRadius.lg, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  searchDropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    borderRadius: borderRadius.lg, borderWidth: 1,
    marginTop: 4, maxHeight: 380, zIndex: 200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
    overflow: 'hidden',
  },
  searchSkeletonContainer: { padding: spacing.sm, gap: 4 },
  searchLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  searchLoadingText: { fontSize: 14 },
  noResultsText: { padding: spacing.md, fontSize: 14, textAlign: 'center' },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderBottomWidth: 1 },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  searchResultMeta: { fontSize: 12 },
  filterBar: { marginBottom: spacing.md },
  filterList: { gap: spacing.sm, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  filterEmptyState: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  filterEmptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  sectionHeader: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  sectionSubtitle: { fontSize: 12 },
  emptySection: { paddingHorizontal: spacing.md, fontSize: 13, marginBottom: spacing.md },
  trendingList: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: 4 },
  trendingCard: { width: 200, borderRadius: borderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  trendingImage: { width: 200, height: 130, overflow: 'hidden' },
  trendingBody: { padding: spacing.sm },
  trendingName: { fontSize: 13, fontWeight: '700', lineHeight: 18, marginBottom: 4 },
  trendingSource: { fontSize: 11, marginTop: 4 },
  popularGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  popularGridItem: { width: '50%', marginBottom: spacing.sm },
  popularCard: { borderRadius: borderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  popularImage: { width: '100%', height: 150, overflow: 'hidden' },
  popularBody: { padding: spacing.sm },
  popularName: { fontSize: 13, fontWeight: '700', lineHeight: 18, marginBottom: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm },
  pillText: { fontSize: 11, fontWeight: '600' },
  prepTime: { fontSize: 11, marginBottom: 2 },
  clickRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  fireEmoji: { fontSize: 11 },
  clickText: { fontSize: 11, fontWeight: '500' },
});
