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
  fetchFeed,
  fetchFollowing,
  fetchFollowers,
  searchUsers,
  toggleLike,
} from '@/utils/socialApi';
import type { SocialPost, SearchUser } from '@/utils/socialApi';
import SocialPostCard from '@/components/social/SocialPostCard';
import SearchUserRow from '@/components/social/SearchUserRow';
import CreatePostSheet from '@/components/social/CreatePostSheet';
import { useRecipeFinder, RecipeResult } from '@/hooks/useRecipeFinder';
import { supabase, SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/client';

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

type SubTab = 'feed' | 'discover' | 'people' | 'recipes';
type PeopleSection = 'following' | 'followers';

const FILTER_KEY_MAP: Record<string, string> = {
  'All': '',
  'High Protein': 'high-protein',
  'Low Carb': 'low-carb',
  'Vegetarian': 'vegetarian',
  'Quick': 'quick',
  'Breakfast': 'breakfast',
  'Keto': 'keto',
};
const FILTER_CHIPS = Object.keys(FILTER_KEY_MAP);

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonCard({ isDark }: { isDark: boolean }) {
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
  return (
    <Animated.View style={[styles.skeletonCard, { backgroundColor: bg, opacity }]}>
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeletonAvatar, { backgroundColor: shimmer }]} />
        <View style={styles.skeletonHeaderText}>
          <View style={[styles.skeletonLine, { width: 120, backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: 80, height: 10, marginTop: 6, backgroundColor: shimmer }]} />
        </View>
      </View>
      <View style={[styles.skeletonImage, { backgroundColor: shimmer }]} />
      <View style={[styles.skeletonLine, { width: '60%', backgroundColor: shimmer, margin: spacing.md }]} />
    </Animated.View>
  );
}

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
  const proteinText = `${Math.round(recipe.protein_per_serving)}g protein`;
  const carbsText = `${Math.round(recipe.carbs_per_serving)}g carbs`;

  const imageSource = { uri: recipe.image_url || `https://picsum.photos/seed/${encodeURIComponent(recipe.name.replace(/\s+/g, '-').toLowerCase())}/400/300` };

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
      <Image
        source={imageSource}
        style={recipeStyles.recipeCardImage}
        resizeMode="cover"
      />

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
          <Text style={[recipeStyles.recipeCardSource, { color: subColor }]}>{recipe.source_name}</Text>
          {prepText && (
            <>
              <Text style={[recipeStyles.recipeCardDot, { color: subColor }]}>·</Text>
              <Clock size={11} color={subColor} />
              <Text style={[recipeStyles.recipeCardSource, { color: subColor }]}>{prepText}</Text>
            </>
          )}
        </View>
        <View style={recipeStyles.recipeCardMacros}>
          <Text style={[recipeStyles.recipeCardCal, { color: colors.calories }]}>{calText}</Text>
          <Text style={[recipeStyles.recipeCardMacroSep, { color: subColor }]}>·</Text>
          <Text style={[recipeStyles.recipeCardMacroVal, { color: colors.protein }]}>{proteinText}</Text>
          <Text style={[recipeStyles.recipeCardMacroSep, { color: subColor }]}>·</Text>
          <Text style={[recipeStyles.recipeCardMacroVal, { color: colors.carbs }]}>{carbsText}</Text>
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

  const [activeTab, setActiveTab] = useState<SubTab>('feed');
  const [peopleSection, setPeopleSection] = useState<PeopleSection>('following');

  // Feed state
  const [feed, setFeed] = useState<SocialPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedOffset, setFeedOffset] = useState(0);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
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
  } = useRecipeFinder();
  const [recipeQuery, setRecipeQuery] = useState('');
  const recipesInitialized = useRef(false);

  // Popular recipes state
  const [trendingRecipes, setTrendingRecipes] = useState<RecipeResult[]>([]);
  const [popularThisWeek, setPopularThisWeek] = useState<RecipeResult[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularError, setPopularError] = useState<string | null>(null);

  // Infinite scroll + filter state
  const [popularPage, setPopularPage] = useState(0);
  const [popularHasMore, setPopularHasMore] = useState(false);
  const [popularLoadingMore, setPopularLoadingMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('All');



  // Recipe library search state (edge function)
  const [recipeSearchResults2, setRecipeSearchResults2] = useState<RecipeResult[]>([]);
  const [recipeSearchLoading2, setRecipeSearchLoading2] = useState(false);
  const [recipeSearchError2, setRecipeSearchError2] = useState<string | null>(null);
  const recipeDebounceRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const FEED_LIMIT = 20;

  // ─── Load feed ──────────────────────────────────────────────────────────────
  const loadFeed = useCallback(async (isRefresh = false) => {
    console.log('[Community] loadFeed — isRefresh:', isRefresh);
    if (isRefresh) {
      setFeedRefreshing(true);
      setFeedOffset(0);
      setFeedHasMore(true);
    } else {
      setFeedLoading(true);
    }
    setFeedError(null);
    try {
      const posts = await fetchFeed('following', FEED_LIMIT, 0);
      setFeed(posts);
      setFeedOffset(posts.length);
      setFeedHasMore(posts.length === FEED_LIMIT);
      console.log('[Community] loadFeed — loaded', posts.length, 'posts');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load feed';
      console.error('[Community] loadFeed error:', msg);
      setFeedError(msg);
    } finally {
      setFeedLoading(false);
      setFeedRefreshing(false);
    }
  }, []);

  const loadMoreFeed = useCallback(async () => {
    if (feedLoadingMore || !feedHasMore) return;
    console.log('[Community] loadMoreFeed — offset:', feedOffset);
    setFeedLoadingMore(true);
    try {
      const posts = await fetchFeed('following', FEED_LIMIT, feedOffset);
      setFeed((prev) => [...prev, ...posts]);
      setFeedOffset((prev) => prev + posts.length);
      setFeedHasMore(posts.length === FEED_LIMIT);
    } catch (e) {
      console.error('[Community] loadMoreFeed error:', e);
    } finally {
      setFeedLoadingMore(false);
    }
  }, [feedLoadingMore, feedHasMore, feedOffset]);

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

  useEffect(() => {
    loadFeed();
  }, []);

  // ─── Fetch popular-recipes via direct fetch (supports query params) ──────────
  const fetchPopularRecipesUrl = useCallback(async (
    section: 'popular' | 'trending',
    page: number,
    limit: number,
    filter: string,
  ): Promise<{ recipes: RecipeResult[]; total: number; page: number; has_more: boolean }> => {
    const base = `${SUPABASE_PROJECT_URL}/functions/v1/popular-recipes`;
    const params = new URLSearchParams({ section, page: String(page), limit: String(limit) });
    if (filter) params.set('filter', filter);
    const url = `${base}?${params.toString()}`;
    console.log('[Community] fetchPopularRecipesUrl — GET', url);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`popular-recipes ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return {
      recipes: Array.isArray(data?.recipes) ? data.recipes : [],
      total: Number(data?.total ?? 0),
      page: Number(data?.page ?? page),
      has_more: Boolean(data?.has_more ?? false),
    };
  }, []);

  // ─── Load popular recipes (initial / filter change) ───────────────────────────
  const loadPopularRecipes = useCallback(async (filter = activeFilter) => {
    const filterKey = FILTER_KEY_MAP[filter] ?? '';
    console.log('[Community] loadPopularRecipes — filter:', filter, 'filterKey:', filterKey);
    setPopularLoading(true);
    setPopularError(null);
    setPopularPage(0);
    try {
      const [popularRes, trendingRes] = await Promise.all([
        fetchPopularRecipesUrl('popular', 0, 20, filterKey),
        fetchPopularRecipesUrl('trending', 0, 5, filterKey),
      ]);
      console.log('[Community] loadPopularRecipes — popular:', popularRes.recipes.length, 'has_more:', popularRes.has_more, 'trending:', trendingRes.recipes.length);
      setPopularThisWeek(popularRes.recipes);
      setPopularHasMore(popularRes.has_more);
      setTrendingRecipes(trendingRes.recipes);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load popular recipes';
      console.error('[Community] loadPopularRecipes error:', msg);
      setPopularError(msg);
    } finally {
      setPopularLoading(false);
    }
  }, [activeFilter, fetchPopularRecipesUrl]);

  // ─── Load more popular recipes (infinite scroll) ──────────────────────────────
  const loadMorePopularRecipes = useCallback(async () => {
    if (popularLoadingMore || !popularHasMore) return;
    const nextPage = popularPage + 1;
    const filterKey = FILTER_KEY_MAP[activeFilter] ?? '';
    console.log('[Community] loadMorePopularRecipes — page:', nextPage, 'filter:', activeFilter);
    setPopularLoadingMore(true);
    try {
      const res = await fetchPopularRecipesUrl('popular', nextPage, 20, filterKey);
      console.log('[Community] loadMorePopularRecipes — appending', res.recipes.length, 'recipes, has_more:', res.has_more);
      setPopularThisWeek((prev) => [...prev, ...res.recipes]);
      setPopularPage(nextPage);
      setPopularHasMore(res.has_more);
    } catch (e) {
      console.error('[Community] loadMorePopularRecipes error:', e);
    } finally {
      setPopularLoadingMore(false);
    }
  }, [popularLoadingMore, popularHasMore, popularPage, activeFilter, fetchPopularRecipesUrl]);

  // ─── Filter chip press ────────────────────────────────────────────────────────
  const handleFilterPress = useCallback((filter: string) => {
    if (filter === activeFilter) return;
    console.log('[Community] Filter chip pressed:', filter);
    setActiveFilter(filter);
    loadPopularRecipes(filter);
  }, [activeFilter, loadPopularRecipes]);

  // ─── Load recipe suggestions ──────────────────────────────────────────────────
  const initRecipes = useCallback(async () => {
    if (recipesInitialized.current) return;
    recipesInitialized.current = true;
    console.log('[Community] initRecipes — loading saved recipes, suggestions, and popular recipes');
    await Promise.all([loadSavedRecipes(), loadPopularRecipes(activeFilter)]);
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
  }, [loadSavedRecipes, loadDailySuggestions, loadPopularRecipes, activeFilter]);

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

  // ─── Like toggle ─────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId: string) => {
    console.log('[Community] handleLike — post_id:', postId);
    setFeed((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      )
    );
    try {
      const result = await toggleLike(postId);
      setFeed((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, liked_by_me: result.liked, likes_count: result.likes_count } : p
        )
      );
    } catch (e) {
      console.error('[Community] toggleLike failed, reverting:', e);
      setFeed((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
            : p
        )
      );
    }
  }, []);

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

  // ─── Render Feed ─────────────────────────────────────────────────────────────
  const renderFeed = () => {
    if (feedLoading) {
      return (
        <View>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} isDark={isDark} />)}
        </View>
      );
    }
    if (feedError) {
      return (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: textColor }]}>Couldn't load feed</Text>
          <Text style={[styles.emptySubtitle, { color: subColor }]}>{feedError}</Text>
          <Pressable
            onPress={() => {
              console.log('[Community] Retry feed pressed');
              loadFeed();
            }}
            style={styles.retryBtn}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <SocialPostCard
            post={item}
            isDark={isDark}
            onLike={handleLike}
            onPressUser={(userId) => {
              console.log('[Community] Navigate to profile — user_id:', userId);
              router.push(`/social-profile?user_id=${userId}`);
            }}
            index={index}
          />
        )}
        contentContainerStyle={[styles.listContent, feed.length === 0 && styles.listContentEmpty]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18' }]}>
              <Users size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No posts yet</Text>
            <Text style={[styles.emptySubtitle, { color: subColor }]}>
              Follow people to see their posts here
            </Text>
            <Pressable
              onPress={() => {
                console.log('[Community] Empty feed — go to Discover pressed');
                handleTabSwitch('discover');
              }}
              style={styles.retryBtn}
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>Discover people</Text>
            </Pressable>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={feedRefreshing}
            onRefresh={() => {
              console.log('[Community] Feed pull-to-refresh');
              loadFeed(true);
            }}
            tintColor={colors.primary}
          />
        }
        onEndReached={() => {
          console.log('[Community] Feed end reached — loading more');
          loadMoreFeed();
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          feedLoadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

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

  // ─── Recipe search handler (edge function) ───────────────────────────────────
  const handleRecipeSearchChange = useCallback((text: string) => {
    setRecipeQuery(text);
    if (recipeDebounceRef2.current) clearTimeout(recipeDebounceRef2.current);
    if (!text.trim()) {
      setRecipeSearchResults2([]);
      setRecipeSearchError2(null);
      return;
    }
    recipeDebounceRef2.current = setTimeout(async () => {
      console.log('[Community] Recipe library search — query:', text);
      setRecipeSearchLoading2(true);
      setRecipeSearchError2(null);
      try {
        const { data, error } = await supabase.functions.invoke('recipe-search', { body: { query: text.trim() } });
        if (error) throw error;
        const results: RecipeResult[] = Array.isArray(data) ? data : (data?.recipes ?? []);
        console.log('[Community] Recipe library search — found', results.length, 'results');
        setRecipeSearchResults2(results);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Search failed';
        console.error('[Community] Recipe library search error:', msg);
        setRecipeSearchError2(msg);
      } finally {
        setRecipeSearchLoading2(false);
      }
    }, 500);
  }, []);

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

    // Popular This Week FlatList data — pairs of recipes for the 2-column grid
    const popularPairs: [RecipeResult, RecipeResult | null][] = [];
    for (let i = 0; i < popularThisWeek.length; i += 2) {
      popularPairs.push([popularThisWeek[i], popularThisWeek[i + 1] ?? null]);
    }

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
          {recipeSearchLoading2 && <ActivityIndicator size="small" color={colors.primary} />}
          {recipeQuery.length > 0 && !recipeSearchLoading2 && (
            <Pressable
              onPress={() => {
                console.log('[Community] Recipe search cleared');
                setRecipeQuery('');
                setRecipeSearchResults2([]);
                setRecipeSearchError2(null);
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: subColor, fontSize: 18, lineHeight: 20 }}>×</Text>
            </Pressable>
          )}
        </View>

        {isSearchActive ? (
          /* ── Search results ── */
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {recipeSearchLoading2 ? (
              [0, 1, 2].map((i) => <RecipeSkeletonCard key={i} isDark={isDark} />)
            ) : recipeSearchError2 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: textColor }]}>Search failed</Text>
                <Text style={[styles.emptySubtitle, { color: subColor }]}>{recipeSearchError2}</Text>
                <Pressable
                  onPress={() => {
                    console.log('[Community] Recipe search retry pressed — query:', recipeQuery);
                    handleRecipeSearchChange(recipeQuery);
                  }}
                  style={styles.retryBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryBtnText}>Try again</Text>
                </Pressable>
              </View>
            ) : recipeSearchResults2.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No recipes found</Text>
                <Text style={[styles.emptySubtitle, { color: subColor }]}>Try a different search term</Text>
              </View>
            ) : (
              recipeSearchResults2.map((recipe) => (
                <View key={recipe.id} style={{ marginBottom: spacing.sm }}>
                  <RecipeCard
                    recipe={recipe}
                    isDark={isDark}
                    onPress={() => handleRecipePress(recipe)}
                    onSave={() => handleRecipeSave(recipe)}
                  />
                </View>
              ))
            )}
          </ScrollView>
        ) : (
          /* ── Browse mode: Trending + Popular + Saved ── */
          <FlatList
            data={popularPairs}
            keyExtractor={(_, idx) => `popular-pair-${idx}`}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 120 }}
            onEndReached={() => {
              console.log('[Community] Popular This Week end reached — loading more');
              loadMorePopularRecipes();
            }}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={
              <>
                {/* ── Section 1: Trending Now ── */}
                <View style={recipeStyles.sectionHeader}>
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
                        console.log('[Community] Popular recipes retry pressed');
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
                ) : null}

                {/* ── Section 2: Popular This Week header + filter chips ── */}
                <View style={[recipeStyles.sectionHeader, { marginTop: spacing.md }]}>
                  <Text style={[recipeStyles.sectionTitle, { color: textColor, fontSize: 18 }]}>
                    ✨ Popular This Week
                  </Text>
                  <Text style={[recipeStyles.sectionSubtitle, { color: subColor }]}>
                    Top picks from the web
                  </Text>
                </View>

                {/* Filter chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={recipeStyles.filterChipsRow}
                >
                  {FILTER_CHIPS.map((chip) => {
                    const isActive = activeFilter === chip;
                    return (
                      <Pressable
                        key={chip}
                        onPress={() => handleFilterPress(chip)}
                        style={[
                          recipeStyles.filterChip,
                          {
                            backgroundColor: isActive ? colors.primary : (isDark ? colors.cardDark : '#FFFFFF'),
                            borderColor: isActive ? colors.primary : borderColor,
                          },
                        ]}
                        accessibilityRole="button"
                      >
                        <Text style={[recipeStyles.filterChipText, { color: isActive ? '#fff' : subColor }]}>
                          {chip}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Loading skeleton for initial popular load */}
                {popularLoading && (
                  <View style={recipeStyles.popularGrid}>
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} style={recipeStyles.popularGridItem}>
                        <RecipeSkeletonCard isDark={isDark} />
                      </View>
                    ))}
                  </View>
                )}
              </>
            }
            renderItem={({ item: [left, right] }) => (
              <View style={recipeStyles.popularGrid}>
                <View style={recipeStyles.popularGridItem}>
                  <RecipeCard
                    recipe={left}
                    isDark={isDark}
                    onPress={() => handleRecipePress(left)}
                    onSave={() => handleRecipeSave(left)}
                  />
                </View>
                {right ? (
                  <View style={recipeStyles.popularGridItem}>
                    <RecipeCard
                      recipe={right}
                      isDark={isDark}
                      onPress={() => handleRecipePress(right)}
                      onSave={() => handleRecipeSave(right)}
                    />
                  </View>
                ) : (
                  <View style={recipeStyles.popularGridItem} />
                )}
              </View>
            )}
            ListFooterComponent={
              <>
                {popularLoadingMore && (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
                )}

                {/* ── Saved recipes ── */}
                <View style={[recipeStyles.sectionHeader, { marginTop: spacing.md }]}>
                  <Text style={[recipeStyles.sectionTitle, { color: textColor }]}>Saved Recipes</Text>
                </View>

                {savedRecipes.length === 0 ? (
                  <View style={[recipeStyles.emptyHorizontal, { backgroundColor: cardBg, borderColor, marginHorizontal: spacing.md }]}>
                    <Bookmark size={24} color={subColor} />
                    <Text style={[recipeStyles.emptyHorizontalText, { color: subColor }]}>
                      Save recipes to find them here
                    </Text>
                  </View>
                ) : (
                  <View style={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
                    {savedRecipes.map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        isDark={isDark}
                        onPress={() => handleRecipePress(recipe)}
                        onSave={() => handleRecipeSave(recipe)}
                      />
                    ))}
                  </View>
                )}
              </>
            }
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'recipes', label: 'Recipes' },
    { key: 'feed', label: 'Feed' },
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
          {activeTab === 'feed' && renderFeed()}
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
          console.log('[Community] Post created — refreshing feed');
          loadFeed(true);
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
  skeletonCard: {
    marginBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skeletonHeaderText: {
    flex: 1,
  },
  skeletonLine: {
    height: 13,
    borderRadius: 6,
  },
  skeletonImage: {
    width: '100%',
    aspectRatio: 1,
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
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  popularGridItem: {
    width: '48%',
  },
  filterChipsRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
