/**
 * Community Tab — Fitness Instagram
 * Sub-tabs: Feed | Discover | People
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ImageSourcePropType,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Users, Search, SquarePen, ChefHat, Clock, Bookmark, BookmarkCheck } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  fetchFollowing,
  fetchFollowers,
  searchUsers,
} from '@/utils/socialApi';
import type { SearchUser } from '@/utils/socialApi';
import SearchUserRow from '@/components/social/SearchUserRow';
import CreatePostSheet from '@/components/social/CreatePostSheet';
import { useRecipeFinder, RecipeResult } from '@/hooks/useRecipeFinder';
import { supabase } from '@/lib/supabase/client';

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

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

type SubTab = 'discover' | 'people' | 'recipes';
type PeopleSection = 'following' | 'followers';

// ─── Recipe skeleton card ─────────────────────────────────────────────────────
function RecipeSkeletonCard({ isDark, horizontal }: { isDark: boolean; horizontal?: boolean }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const shimmer = isDark ? '#3A3C52' : '#E5E7EB';
  const bg = isDark ? colors.cardDark : '#FFFFFF';
  const width = horizontal ? 220 : undefined;
  return (
    <Animated.View style={[recipeStyles.recipeCard, { backgroundColor: bg, opacity, width: width || '100%' }]}>
      <View style={[recipeStyles.recipeCardImage, { backgroundColor: shimmer }]} />
      <View style={{ padding: spacing.sm, gap: 6 }}>
        <View style={[styles.skeletonLine, { width: '80%', backgroundColor: shimmer }]} />
        <View style={[styles.skeletonLine, { width: '50%', height: 10, backgroundColor: shimmer }]} />
        <View style={[styles.skeletonLine, { width: '70%', height: 10, backgroundColor: shimmer }]} />
      </View>
    </Animated.View>
  );
}

// ─── Recipe card ──────────────────────────────────────────────────────────────
function RecipeCard({
  recipe,
  isDark,
  horizontal,
  onPress,
  onSave,
}: {
  recipe: RecipeResult;
  isDark: boolean;
  horizontal?: boolean;
  onPress: () => void;
  onSave: () => void;
}) {
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const textColor = isDark ? colors.textDark : colors.text;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const firstTag = recipe.tags[0] || null;
  const tagColor = firstTag ? (TAG_COLORS[firstTag] || colors.primary) : null;
  const prepText = recipe.prep_time_minutes != null ? `${recipe.prep_time_minutes} min` : null;
  const calText = `${Math.round(recipe.calories_per_serving)} cal`;

  const imageSource = recipe.image_url ? { uri: recipe.image_url } : null;

  return (
    <Pressable
      onPress={onPress}
      style={[
        recipeStyles.recipeCard,
        {
          backgroundColor: cardBg,
          borderColor,
          width: horizontal ? 220 : undefined,
        },
      ]}
      accessibilityRole="button"
    >
      {/* Image */}
      {imageSource ? (
        <Image
          key={imageSource.uri}
          source={imageSource}
          style={recipeStyles.recipeCardImage}
          resizeMode="cover"
          cache="reload"
        />
      ) : (
        <View style={[recipeStyles.recipeCardImage, recipeStyles.recipeCardImagePlaceholder]}>
          <ChefHat size={28} color="#666" />
        </View>
      )}

      {/* Tag badge */}
      {firstTag && tagColor && (
        <View style={[recipeStyles.tagBadge, { backgroundColor: tagColor }]}>
          <Text style={recipeStyles.tagBadgeText}>{firstTag.replace('-', ' ')}</Text>
        </View>
      )}

      {/* Save button */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onSave();
        }}
        style={recipeStyles.saveBtn}
        accessibilityRole="button"
        accessibilityLabel={recipe.is_saved ? 'Unsave recipe' : 'Save recipe'}
      >
        {recipe.is_saved
          ? <BookmarkCheck size={16} color={colors.primary} fill={colors.primary} />
          : <Bookmark size={16} color="#fff" />}
      </Pressable>

      {/* Info */}
      <View style={recipeStyles.recipeCardInfo}>
        <Text style={[recipeStyles.recipeCardName, { color: textColor }]} numberOfLines={2}>
          {recipe.name}
        </Text>
        <View style={recipeStyles.recipeCardMeta}>
          <Text style={[recipeStyles.recipeCardCal, { color: colors.calories }]}>{calText}</Text>
          {prepText && (
            <>
              <Text style={[recipeStyles.recipeCardDot, { color: subColor }]}>·</Text>
              <Clock size={11} color={subColor} />
              <Text style={[recipeStyles.recipeCardSource, { color: subColor }]}>{prepText}</Text>
            </>
          )}
        </View>
        <View style={recipeStyles.recipeCardMacros}>
          <Text style={[recipeStyles.recipeCardMacroVal, { color: colors.protein }]}>{Math.round(recipe.protein_per_serving)}g P</Text>
          <Text style={[recipeStyles.recipeCardMacroSep, { color: subColor }]}>·</Text>
          <Text style={[recipeStyles.recipeCardMacroVal, { color: colors.carbs }]}>{Math.round(recipe.carbs_per_serving)}g C</Text>
          <Text style={[recipeStyles.recipeCardMacroSep, { color: subColor }]}>·</Text>
          <Text style={[recipeStyles.recipeCardMacroVal, { color: colors.fat ?? '#EF4444' }]}>{Math.round(recipe.fat_per_serving)}g F</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SubTab>('recipes');
  const [peopleSection, setPeopleSection] = useState<PeopleSection>('following');

  const [showCreatePost, setShowCreatePost] = useState(false);

  // Discover state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // People state
  const [following, setFollowing] = useState<SearchUser[]>([]);
  const [followers, setFollowers] = useState<SearchUser[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleRefreshing, setPeopleRefreshing] = useState(false);

  // Recipes state
  const {
    loadDailySuggestions,
    savedRecipes,
    saveRecipe,
    unsaveRecipe,
    loadSavedRecipes,
    searchRecipes,
    searchResults: recipeFinderResults,
    searchLoading: recipeFinderLoading,
    searchError: recipeFinderError,
    hasMore: recipeFinderHasMore,
    isLoadingMore: recipeFinderLoadingMore,
    loadMore: recipeFinderLoadMore,
    browseResults,
    browseLoading,
    browseLoadingMore,
    browseHasMore,
    initBrowse,
    loadMoreBrowse,
    prefetchedRef,
  } = useRecipeFinder();
  const [recipeQuery, setRecipeQuery] = useState('');
  const recipesInitialized = useRef(false);

  // Popular recipes state
  const [trendingRecipes, setTrendingRecipes] = useState<RecipeResult[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularError, setPopularError] = useState<string | null>(null);



  // Recipe search debounce ref
  const recipeDebounceRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  // ─── Load discover ───────────────────────────────────────────────────────────
  const loadDiscover = useCallback(async () => {
    console.log('[Community] loadDiscover');
    setDiscoverLoading(true);
    try {
      const results = await searchUsers('');
      setDiscoverUsers(results);
    } catch (e) {
      console.error('[Community] loadDiscover error:', e);
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  // ─── Load people ─────────────────────────────────────────────────────────────
  const loadPeople = useCallback(async (isRefresh = false) => {
    console.log('[Community] loadPeople — isRefresh:', isRefresh);
    if (isRefresh) setPeopleRefreshing(true);
    else setPeopleLoading(true);
    try {
      const [followingData, followersData] = await Promise.all([
        fetchFollowing(),
        fetchFollowers(),
      ]);
      setFollowing(followingData);
      setFollowers(followersData);
      console.log('[Community] loadPeople — following:', followingData.length, 'followers:', followersData.length);
    } catch (e) {
      console.error('[Community] loadPeople error:', e);
    } finally {
      setPeopleLoading(false);
      setPeopleRefreshing(false);
    }
  }, []);

  // ─── Normalize popular-recipes response shape to RecipeResult ────────────────
  const normalizeForCommunity = useCallback((r: any): RecipeResult => ({
    id: r.id,
    name: r.name ?? r.title ?? 'Recipe',
    description: r.description ?? null,
    image_url: r.image_url ?? null,
    source_name: r.source_name ?? null,
    source_url: r.source_url ?? null,
    prep_time_minutes: r.prep_time_minutes ?? null,
    servings: r.servings ?? null,
    calories_per_serving: Number(r.calories_per_serving) || 0,
    protein_per_serving: Number(r.protein_per_serving) || 0,
    carbs_per_serving: Number(r.carbs_per_serving) || 0,
    fat_per_serving: Number(r.fat_per_serving) || 0,
    fiber_per_serving: Number(r.fiber_per_serving) || 0,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    instructions: Array.isArray(r.instructions) ? r.instructions : [],
    reviews: Array.isArray(r.reviews) ? r.reviews : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    click_count: r.click_count ?? 0,
    is_saved: false,
  }), []);

  // ─── Load popular recipes via POST to popular-recipes edge function ───────────
  const loadPopularRecipes = useCallback(async () => {
    console.log('[Community] loadPopularRecipes — POSTing to popular-recipes edge function');
    setPopularLoading(true);
    setPopularError(null);
    try {
      const { data, error } = await supabase.functions.invoke('popular-recipes', {
        method: 'POST',
        body: { action: 'get_popular' },
      });
      if (error) throw new Error(error.message);
      const trending: RecipeResult[] = (data?.trending ?? []).map(normalizeForCommunity);
      const popularThisWeek: RecipeResult[] = (data?.popular_this_week ?? []).map(normalizeForCommunity);
      console.log('[Community] loadPopularRecipes — trending:', trending.length, 'popular_this_week:', popularThisWeek.length);
      setTrendingRecipes(trending);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load trending recipes';
      console.error('[Community] loadPopularRecipes error:', msg);
      setPopularError(msg);
    } finally {
      setPopularLoading(false);
    }
  }, [normalizeForCommunity]);

  // ─── Load recipe suggestions ──────────────────────────────────────────────────
  const initRecipes = useCallback(async () => {
    if (recipesInitialized.current) return;
    recipesInitialized.current = true;
    console.log('[Community] initRecipes — loading saved recipes, trending, and browse feed');
    await Promise.all([loadSavedRecipes(), loadPopularRecipes(), initBrowse()]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let goals = { calories: 2000, protein: 150, carbs: 200, fat: 65, remainingCalories: 2000 };
      if (user) {
        const [goalRes, mealsRes] = await Promise.all([
          supabase.from('goals').select('daily_calories, protein_g, carbs_g, fat_g').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
          supabase.from('meals').select('meal_items(calories)').eq('user_id', user.id).eq('date', new Date().toISOString().split('T')[0]),
        ]);
        const g = goalRes.data;
        if (g) {
          let consumed = 0;
          (mealsRes.data || []).forEach((m: any) => {
            (m.meal_items || []).forEach((item: any) => { consumed += Number(item.calories) || 0; });
          });
          goals = {
            calories: Number(g.daily_calories) || 2000,
            protein: Number(g.protein_g) || 150,
            carbs: Number(g.carbs_g) || 200,
            fat: Number(g.fat_g) || 65,
            remainingCalories: Math.max(0, (Number(g.daily_calories) || 2000) - consumed),
          };
        }
      }
      await loadDailySuggestions(goals);
    } catch (e) {
      console.warn('[Community] initRecipes error:', e);
    }
  }, [loadSavedRecipes, loadDailySuggestions, loadPopularRecipes, initBrowse]);

  // ─── Tab switch ──────────────────────────────────────────────────────────────
  const handleTabSwitch = useCallback((tab: SubTab) => {
    console.log('[Community] Tab switched to:', tab);
    setActiveTab(tab);
    if (tab === 'discover' && discoverUsers.length === 0) {
      loadDiscover();
    }
    if (tab === 'people' && following.length === 0 && followers.length === 0) {
      loadPeople();
    }
    if (tab === 'recipes') {
      initRecipes();
    }
  }, [discoverUsers.length, following.length, followers.length, loadDiscover, loadPeople, initRecipes]);

  // ─── Search ──────────────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      console.log('[Community] Searching users — query:', text);
      setSearchLoading(true);
      try {
        const results = await searchUsers(text.trim());
        setSearchResults(results);
      } catch (e) {
        console.error('[Community] searchUsers error:', e);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, []);

  // ─── Render Discover ─────────────────────────────────────────────────────────
  const renderDiscover = () => {
    const displayUsers = searchQuery.trim() ? searchResults : discoverUsers;
    const isLoading = searchQuery.trim() ? searchLoading : discoverLoading;

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Search bar */}
        <View style={[styles.searchBarContainer, { backgroundColor: cardBg, borderColor }]}>
          <Search size={18} color={subColor} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Search by username..."
            placeholderTextColor={subColor}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {isLoading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {!searchQuery.trim() && !discoverLoading && discoverUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
              <Search size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>Find people</Text>
            <Text style={[styles.emptySubtitle, { color: subColor }]}>
              Search by username to find and follow others
            </Text>
          </View>
        ) : searchQuery.trim() && !searchLoading && searchResults.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No users found</Text>
            <Text style={[styles.emptySubtitle, { color: subColor }]}>Try a different username</Text>
          </View>
        ) : (
          <FlatList
            data={displayUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <SearchUserRow
                user={item}
                isDark={isDark}
                index={index}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  // ─── Render People ───────────────────────────────────────────────────────────
  const renderPeople = () => {
    const data = peopleSection === 'following' ? following : followers;

    return (
      <View style={{ flex: 1 }}>
        {/* Section toggle */}
        <View style={[styles.peopleSectionToggle, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor }]}>
          {(['following', 'followers'] as PeopleSection[]).map((section) => {
            const isActive = peopleSection === section;
            const label = section === 'following' ? 'Following' : 'Followers';
            return (
              <Pressable
                key={section}
                onPress={() => {
                  console.log('[Community] People section switched to:', section);
                  setPeopleSection(section);
                }}
                style={[
                  styles.peopleSectionBtn,
                  isActive && { backgroundColor: colors.primary },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.peopleSectionBtnText, { color: isActive ? '#fff' : subColor }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {peopleLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <SearchUserRow
                user={item}
                isDark={isDark}
                index={index}
              />
            )}
            contentContainerStyle={[styles.listContent, data.length === 0 && styles.listContentEmpty]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Users size={32} color={colors.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: textColor }]}>
                  {peopleSection === 'following' ? 'Not following anyone yet' : 'No followers yet'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: subColor }]}>
                  {peopleSection === 'following'
                    ? 'Discover people in the Discover tab'
                    : 'Share your profile to get followers'}
                </Text>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={peopleRefreshing}
                onRefresh={() => {
                  console.log('[Community] People pull-to-refresh');
                  loadPeople(true);
                }}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    );
  };

  // ─── Recipe search handler (recipe-finder edge function, paginated) ──────────
  const handleRecipeSearchChange = useCallback((text: string) => {
    setRecipeQuery(text);
    if (recipeDebounceRef2.current) clearTimeout(recipeDebounceRef2.current);
    if (!text.trim()) {
      return;
    }
    recipeDebounceRef2.current = setTimeout(() => {
      console.log('[Community] Recipe search — query:', text.trim());
      searchRecipes(text.trim());
    }, 500);
  }, [searchRecipes]);

  const handleRecipeSave = useCallback(async (recipe: RecipeResult) => {
    console.log('[Community] Recipe save toggled — id:', recipe.id, 'saved:', recipe.is_saved);
    if (recipe.is_saved) {
      await unsaveRecipe(recipe.id);
    } else {
      await saveRecipe(recipe);
    }
  }, [saveRecipe, unsaveRecipe]);

  const handleRecipePress = useCallback((recipe: RecipeResult) => {
    console.log('[Community] Recipe card pressed — id:', recipe.id, 'name:', recipe.name || (recipe as any).title);
    supabase.functions.invoke('popular-recipes', {
      body: { action: 'click', recipe_id: recipe.id, recipe_name: recipe.name },
    }).catch(() => {});
    const normalizeInstruction = (s: any): string => {
      if (typeof s === 'string') return s;
      if (s && typeof s === 'object') return String(s.text ?? s.description ?? s.instruction ?? s.step_text ?? JSON.stringify(s));
      return String(s ?? '');
    };
    const normalized = {
      ...recipe,
      name: recipe.name || (recipe as any).title || 'Recipe',
      image_url: recipe.image_url || null,
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      instructions: Array.isArray(recipe.instructions) ? recipe.instructions.map(normalizeInstruction) : [],
      reviews: Array.isArray(recipe.reviews) ? recipe.reviews : [],
    };
    console.log('[Community] Navigating to recipe detail — normalized name:', normalized.name, 'ingredients:', normalized.ingredients.length, 'instructions:', normalized.instructions.length);
    router.push({ pathname: '/recipe-finder-detail', params: { recipe: JSON.stringify(normalized) } });
  }, [router]);

  // ─── Render Recipes ───────────────────────────────────────────────────────────
  const renderRecipes = () => {
    const isSearchActive = recipeQuery.trim().length > 0;

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Search bar */}
        <View style={[styles.searchBarContainer, { backgroundColor: cardBg, borderColor }]}>
          <Search size={18} color={subColor} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Search recipes..."
            placeholderTextColor={subColor}
            value={recipeQuery}
            onChangeText={handleRecipeSearchChange}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {recipeFinderLoading && <ActivityIndicator size="small" color={colors.primary} />}
          {recipeQuery.length > 0 && !recipeFinderLoading && (
            <Pressable
              onPress={() => {
                console.log('[Community] Recipe search cleared');
                setRecipeQuery('');
                if (recipeDebounceRef2.current) clearTimeout(recipeDebounceRef2.current);
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: subColor, fontSize: 18, lineHeight: 20 }}>×</Text>
            </Pressable>
          )}
        </View>

        {isSearchActive ? (
          /* ── Search results (paginated FlatList) ── */
          recipeFinderLoading ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120 }}
            >
              {[0, 1, 2].map((i) => <RecipeSkeletonCard key={i} isDark={isDark} />)}
            </ScrollView>
          ) : recipeFinderError ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: textColor }]}>Search failed</Text>
              <Text style={[styles.emptySubtitle, { color: subColor }]}>{recipeFinderError}</Text>
              <Pressable
                onPress={() => {
                  console.log('[Community] Recipe search retry pressed — query:', recipeQuery);
                  searchRecipes(recipeQuery.trim());
                }}
                style={styles.retryBtn}
                accessibilityRole="button"
              >
                <Text style={styles.retryBtnText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={recipeFinderResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ marginBottom: spacing.sm }}>
                  <RecipeCard
                    recipe={item}
                    isDark={isDark}
                    onPress={() => handleRecipePress(item)}
                    onSave={() => handleRecipeSave(item)}
                  />
                </View>
              )}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onEndReached={() => {
                if (recipeFinderHasMore && !recipeFinderLoadingMore) {
                  console.log('[Community] Recipe search end reached — loading more');
                  recipeFinderLoadMore();
                }
              }}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyTitle, { color: textColor }]}>No recipes found</Text>
                  <Text style={[styles.emptySubtitle, { color: subColor }]}>Try a different search term</Text>
                </View>
              }
              ListFooterComponent={
                recipeFinderLoadingMore ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
                ) : !recipeFinderHasMore && recipeFinderResults.length > 0 ? (
                  <Text style={{ textAlign: 'center', color: subColor, fontSize: 13, marginVertical: spacing.md }}>
                    No more recipes
                  </Text>
                ) : null
              }
            />
          )
        ) : (
          /* ── Browse mode: Saved Recipes + Trending Now + Discover ── */
          <FlatList
            data={browseResults}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 120 }}
            onEndReached={() => {
              if (browseHasMore && !browseLoadingMore) {
                console.log('[Community] Discover end reached — loading more browse');
                loadMoreBrowse();
              }
            }}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={
              <>
                {/* ── Section 1: Saved Recipes ── */}
                <View style={[recipeStyles.sectionHeader, { marginTop: spacing.sm }]}>
                  <Text style={[recipeStyles.sectionTitle, { color: textColor, fontSize: 18 }]}>
                    ❤️ Saved Recipes
                  </Text>
                </View>

                {savedRecipes.length === 0 ? (
                  <View style={[recipeStyles.emptyHorizontal, { backgroundColor: cardBg, borderColor, marginHorizontal: spacing.md }]}>
                    <Bookmark size={24} color={subColor} />
                    <Text style={[recipeStyles.emptyHorizontalText, { color: subColor }]}>
                      Save recipes you love to find them here
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={recipeStyles.horizontalList}
                  >
                    {savedRecipes.map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        isDark={isDark}
                        horizontal
                        onPress={() => {
                          console.log('[Community] Saved recipe card pressed:', recipe.id);
                          handleRecipePress(recipe);
                        }}
                        onSave={() => {
                          console.log('[Community] Saved recipe unsave pressed:', recipe.id);
                          handleRecipeSave(recipe);
                        }}
                      />
                    ))}
                  </ScrollView>
                )}

                {/* ── Section 2: Trending Now ── */}
                <View style={[recipeStyles.sectionHeader, { marginTop: spacing.lg }]}>
                  <Text style={[recipeStyles.sectionTitle, { color: textColor, fontSize: 18 }]}>
                    🔥 Trending Now
                  </Text>
                  <Text style={[recipeStyles.sectionSubtitle, { color: subColor }]}>
                    Most clicked in the last 48h
                  </Text>
                </View>

                {popularLoading ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={recipeStyles.horizontalList}
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <RecipeSkeletonCard key={i} isDark={isDark} horizontal />
                    ))}
                  </ScrollView>
                ) : popularError ? (
                  <View style={[recipeStyles.emptyHorizontal, { backgroundColor: cardBg, borderColor }]}>
                    <ChefHat size={24} color={subColor} />
                    <Text style={[recipeStyles.emptyHorizontalText, { color: subColor }]}>{popularError}</Text>
                    <Pressable
                      onPress={() => {
                        console.log('[Community] Trending recipes retry pressed');
                        loadPopularRecipes();
                      }}
                      style={styles.retryBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.retryBtnText}>Try again</Text>
                    </Pressable>
                  </View>
                ) : trendingRecipes.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={recipeStyles.horizontalList}
                  >
                    {trendingRecipes.map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        isDark={isDark}
                        horizontal
                        onPress={() => handleRecipePress(recipe)}
                        onSave={() => handleRecipeSave(recipe)}
                      />
                    ))}
                  </ScrollView>
                ) : browseResults.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={recipeStyles.horizontalList}
                  >
                    {browseResults.slice(0, 5).map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        isDark={isDark}
                        horizontal
                        onPress={() => handleRecipePress(recipe)}
                        onSave={() => handleRecipeSave(recipe)}
                      />
                    ))}
                  </ScrollView>
                ) : null}

                {/* ── Section 3: Discover header ── */}
                <View style={[recipeStyles.sectionHeader, { marginTop: spacing.md }]}>
                  <Text style={[recipeStyles.sectionTitle, { color: textColor, fontSize: 18 }]}>
                    ✨ Discover
                  </Text>
                  <Text style={[recipeStyles.sectionSubtitle, { color: subColor }]}>
                    Endless fitness recipes, just for you
                  </Text>
                </View>

                {/* Loading skeleton for initial browse load */}
                {browseLoading && (
                  <View style={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
                    {[0, 1, 2].map((i) => (
                      <RecipeSkeletonCard key={i} isDark={isDark} />
                    ))}
                  </View>
                )}
              </>
            }
            renderItem={({ item, index }) => {
              const badgeLabel = (item as any).click_count > 0 ? '🔥 Trending' : '✨ New';
              const showBadge = (index + 1) % 6 === 0;
              return (
                <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
                  {showBadge && (
                    <View style={recipeStyles.discoverBadgeRow}>
                      <Text style={recipeStyles.discoverBadgeText}>{badgeLabel}</Text>
                    </View>
                  )}
                  <RecipeCard
                    recipe={item}
                    isDark={isDark}
                    onPress={() => handleRecipePress(item)}
                    onSave={() => handleRecipeSave(item)}
                  />
                </View>
              );
            }}
            ListFooterComponent={
              browseLoadingMore ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ marginVertical: spacing.sm }}
                />
              ) : null
            }
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'recipes', label: 'Recipes' },
    { key: 'discover', label: 'Discover' },
    { key: 'people', label: 'People' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Community',
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: isDark ? colors.backgroundDark : colors.background },
          headerTintColor: isDark ? colors.textDark : colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          headerRight: () => (
            <Pressable
              onPress={() => {
                console.log('[Community] Create post button pressed');
                setShowCreatePost(true);
              }}
              style={styles.headerCreateBtn}
              accessibilityLabel="Create post"
              accessibilityRole="button"
            >
              <SquarePen size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />

      <View style={[styles.container, { backgroundColor: bg }]}>
        {/* Sub-tab switcher */}
        <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor }]}>
          {SUB_TABS.map(({ key, label }) => {
            const isActive = activeTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => handleTabSwitch(key)}
                style={[styles.segmentBtn, isActive && { backgroundColor: colors.primary }]}
                accessibilityLabel={label}
                accessibilityRole="tab"
              >
                <Text style={[styles.segmentBtnText, { color: isActive ? '#fff' : subColor }, isActive && { fontWeight: '700' }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tab content */}
        <View style={{ flex: 1 }}>
          {activeTab === 'discover' && renderDiscover()}
          {activeTab === 'people' && renderPeople()}
          {activeTab === 'recipes' && renderRecipes()}
        </View>
      </View>

      {/* Create Post Sheet */}
      <CreatePostSheet
        visible={showCreatePost}
        isDark={isDark}
        onClose={() => {
          console.log('[Community] CreatePostSheet closed');
          setShowCreatePost(false);
        }}
        onPosted={() => {
          console.log('[Community] Post created');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerCreateBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: 8,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 120,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: spacing.md,
  },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  peopleSectionToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  peopleSectionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  peopleSectionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonLine: {
    height: 13,
    borderRadius: 6,
  },
});

const recipeStyles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  horizontalList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  recipeCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  recipeCardImage: {
    width: '100%',
    height: 160,
  },
  recipeCardImagePlaceholder: {
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  tagBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  saveBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeCardInfo: {
    padding: spacing.sm,
    gap: 4,
  },
  recipeCardName: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  recipeCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recipeCardSource: {
    fontSize: 12,
  },
  recipeCardDot: {
    fontSize: 12,
  },
  recipeCardMacros: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  recipeCardCal: {
    fontSize: 12,
    fontWeight: '700',
  },
  recipeCardMacroSep: {
    fontSize: 12,
  },
  recipeCardMacroVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyHorizontal: {
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyHorizontalText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  discoverBadgeRow: {
    marginBottom: spacing.xs,
  },
  discoverBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
});
