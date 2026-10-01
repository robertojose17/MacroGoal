
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Image,
  FlatList,
  ImageSourcePropType,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { usePremium } from '@/hooks/usePremium';
import ProgressCircle from '@/components/ProgressCircle';
import { toLocalDateString } from '@/utils/dateUtils';
import { calcMacros } from '@/utils/macros';

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type FollowUser = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type FollowModalType = 'followers' | 'following' | null;

function MacroSummaryRowCompact({ label, eaten, goal, color, isDark }: any) {
  const percentage = goal > 0 ? Math.min((eaten / goal) * 100, 100) : 0;
  return (
    <View style={styles.macroSummaryRowCompact}>
      <Text style={[styles.macroSummaryLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
        {label}
      </Text>
      <View style={styles.macroSummaryBarContainer}>
        <View style={[styles.macroSummaryBarBackground, { backgroundColor: isDark ? colors.borderDark : colors.border }]}>
          <View style={[styles.macroSummaryBarFill, { width: `${percentage}%` as any, backgroundColor: color }]} />
        </View>
        <Text style={[styles.macroSummaryProgressCompact, { color: isDark ? colors.textDark : colors.text }]}>
          {eaten}
          {' / '}
          {goal}
          {'g'}
        </Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPremium } = usePremium();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Stats
  const [postsCount, setPostsCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Achievements
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalDaysLogged, setTotalDaysLogged] = useState(0);

  // Posts feed
  const [posts, setPosts] = useState<any[]>([]);

  // Follow modal
  const [followModalType, setFollowModalType] = useState<FollowModalType>(null);
  const [followModalUsers, setFollowModalUsers] = useState<FollowUser[]>([]);
  const [followModalLoading, setFollowModalLoading] = useState(false);

  // Nutrition card (today only, food-tab style)
  const [totalCalories, setTotalCalories] = useState(0);
  const [totalMacros, setTotalMacros] = useState({ protein: 0, carbs: 0, fats: 0, fiber: 0 });
  const [goal, setGoal] = useState<any>(null);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryText = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const cardBorderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const loadData = async () => {
    console.log('[Profile] loadData — starting');
    try {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[Profile] loadData — no authenticated user');
        setLoading(false);
        return;
      }
      console.log('[Profile] loadData — fetching data for user:', authUser.id);

      const dateString = toLocalDateString(new Date());
      console.log('[Profile] loadData — today dateString:', dateString);

      const [
        userResult,
        postsResult,
        followersResult,
        followingResult,
        xpResult,
        mealsResult,
        goalsResult,
        todayMealsResult,
      ] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', authUser.id),
        supabase.from('social_follows').select('id', { count: 'exact', head: true }).eq('following_id', authUser.id),
        supabase.from('social_follows').select('id', { count: 'exact', head: true }).eq('follower_id', authUser.id),
        supabase.from('user_xp').select('current_streak, longest_streak').eq('user_id', authUser.id).maybeSingle(),
        supabase.from('meals').select('logged_date').eq('user_id', authUser.id),
        supabase.from('goals').select('*').eq('user_id', authUser.id).eq('is_active', true).maybeSingle(),
        supabase
          .from('meals')
          .select(`
            id, meal_type, date,
            meal_items (
              id, food_id, food_item_id, quantity, calories, protein, carbs, fats, fiber,
              serving_description, grams, logged_at, food_name, food_brand, is_scheduled,
              food_items!meal_items_food_item_id_fkey (
                id, name, brand, calories, protein, carbs, fat, fiber, serving_size, macros_per
              )
            )
          `)
          .eq('user_id', authUser.id)
          .eq('date', dateString),
      ]);

      console.log('[Profile] loadData — user result:', userResult.error ? userResult.error.message : 'ok');
      console.log('[Profile] loadData — posts count:', postsResult.count, postsResult.error?.message);
      console.log('[Profile] loadData — followers count:', followersResult.count, followersResult.error?.message);
      console.log('[Profile] loadData — following count:', followingResult.count, followingResult.error?.message);
      console.log('[Profile] loadData — xp result:', xpResult.error ? xpResult.error.message : 'ok', xpResult.data);
      console.log('[Profile] loadData — meals result:', mealsResult.error ? mealsResult.error.message : 'ok');
      console.log('[Profile] loadData — goals result:', goalsResult.error ? goalsResult.error.message : 'ok');
      console.log('[Profile] loadData — today meals result:', todayMealsResult.error ? todayMealsResult.error.message : `${todayMealsResult.data?.length ?? 0} meals`);

      if (userResult.data) {
        setUser({ ...authUser, ...userResult.data });
      } else {
        setUser(authUser);
      }

      setPostsCount(postsResult.count ?? 0);
      setFollowersCount(followersResult.error ? 0 : (followersResult.count ?? 0));
      setFollowingCount(followingResult.error ? 0 : (followingResult.count ?? 0));

      if (xpResult.data) {
        setCurrentStreak(xpResult.data.current_streak ?? 0);
        const best = (xpResult.data as any).longest_streak ?? xpResult.data.current_streak ?? 0;
        setBestStreak(best);
      }

      if (!mealsResult.error && mealsResult.data) {
        const uniqueDates = new Set(mealsResult.data.map((m: any) => m.logged_date ?? m.created_at?.slice(0, 10)));
        setTotalDaysLogged(uniqueDates.size);
      }

      // Set goal
      if (goalsResult.data) {
        setGoal(goalsResult.data);
      }

      // Sum today's macros exactly like the food tab
      let totalCals = 0, totalP = 0, totalC = 0, totalF = 0, totalFib = 0;
      todayMealsResult.data?.forEach((meal: any) => {
        meal.meal_items?.forEach((item: any) => {
          const hasStoredMacros = item.calories != null && item.calories > 0;
          const fi = item.food_items;
          const grams = item.grams ?? 0;
          const macros = hasStoredMacros
            ? { calories: item.calories ?? 0, protein: item.protein ?? 0, carbs: item.carbs ?? 0, fats: item.fats ?? 0, fiber: item.fiber ?? 0 }
            : fi
              ? (() => { const r = calcMacros(fi, grams); return { calories: r.calories, protein: r.protein, carbs: r.carbs, fats: r.fat, fiber: r.fiber }; })()
              : { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
          if (!item.is_scheduled) {
            totalCals += macros.calories;
            totalP    += macros.protein;
            totalC    += macros.carbs;
            totalF    += macros.fats;
            totalFib  += macros.fiber;
          }
        });
      });
      setTotalCalories(totalCals);
      setTotalMacros({ protein: totalP, carbs: totalC, fats: totalF, fiber: totalFib });
      console.log('[Profile] loadData — today totals: calories:', totalCals, 'protein:', totalP, 'carbs:', totalC, 'fats:', totalF, 'fiber:', totalFib);

      // Load posts feed
      const { data: postsData, error: postsError } = await supabase
        .from('social_posts')
        .select('id, content, created_at, likes_count')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(50);

      console.log('[Profile] loadData — posts feed:', postsError ? postsError.message : `${postsData?.length ?? 0} posts`);
      setPosts(postsData ?? []);
    } catch (err) {
      console.error('[Profile] loadData — unexpected error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      console.log('[Profile] screen focused — loading data');
      loadData();
    }, [])
  );

  const onRefresh = () => {
    console.log('[Profile] pull-to-refresh triggered');
    setRefreshing(true);
    loadData();
  };

  const openFollowModal = async (type: FollowModalType) => {
    if (!user || !type) return;
    console.log('[Profile] openFollowModal — type:', type, 'user_id:', user.id);
    setFollowModalType(type);
    setFollowModalLoading(true);
    setFollowModalUsers([]);
    try {
      let ids: string[] = [];
      if (type === 'followers') {
        const { data, error } = await supabase
          .from('social_follows')
          .select('follower_id')
          .eq('following_id', user.id);
        console.log('[Profile] openFollowModal — followers query:', error ? error.message : `${data?.length ?? 0} rows`);
        ids = (data ?? []).map((r: any) => r.follower_id);
      } else {
        const { data, error } = await supabase
          .from('social_follows')
          .select('following_id')
          .eq('follower_id', user.id);
        console.log('[Profile] openFollowModal — following query:', error ? error.message : `${data?.length ?? 0} rows`);
        ids = (data ?? []).map((r: any) => r.following_id);
      }

      if (ids.length === 0) {
        setFollowModalUsers([]);
        return;
      }

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, username, full_name, avatar_url')
        .in('id', ids);
      console.log('[Profile] openFollowModal — users query:', usersError ? usersError.message : `${usersData?.length ?? 0} users`);
      setFollowModalUsers(usersData ?? []);
    } catch (err) {
      console.error('[Profile] openFollowModal — error:', err);
    } finally {
      setFollowModalLoading(false);
    }
  };

  const closeFollowModal = () => {
    console.log('[Profile] closeFollowModal');
    setFollowModalType(null);
    setFollowModalUsers([]);
  };

  const handleSettingsPress = () => {
    console.log('[Profile] settings gear icon pressed');
    router.push('/settings');
  };

  const handleDeletePost = async (postId: string) => {
    console.log('[Profile] handleDeletePost — trash button pressed, postId:', postId);
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => console.log('[Profile] handleDeletePost — cancelled') },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile] handleDeletePost — confirmed, deleting postId:', postId);
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;
            const { error } = await supabase
              .from('social_posts')
              .delete()
              .eq('id', postId)
              .eq('user_id', authUser.id);
            if (error) {
              console.error('[Profile] handleDeletePost — error:', error.message);
              Alert.alert('Error', 'Could not delete post');
            } else {
              console.log('[Profile] handleDeletePost — deleted successfully, postId:', postId);
              setPosts(prev => prev.filter(p => p.id !== postId));
              setPostsCount(prev => prev - 1);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[typography.body, { color: secondaryText }]}>Not signed in</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = user.full_name || user.name || 'User';
  const initials = displayName.charAt(0).toUpperCase();
  const isPremiumUser = user.user_type === 'premium' || isPremium;
  const bioText = user.bio || '';

  const currentStreakDisplay = String(currentStreak);
  const bestStreakDisplay = String(bestStreak);
  const totalDaysDisplay = String(totalDaysLogged);
  const postsCountDisplay = String(postsCount);
  const followersCountDisplay = String(followersCount);
  const followingCountDisplay = String(followingCount);

  const totalCaloriesRounded = Math.round(totalCalories);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: borderColor }]}>
        <Text style={[styles.topBarTitle, { color: textColor }]}>Profile</Text>
        <TouchableOpacity
          onPress={handleSettingsPress}
          activeOpacity={0.7}
          style={styles.settingsButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol
            ios_icon_name="gearshape"
            android_material_icon_name="settings"
            size={24}
            color={textColor}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Instagram-style Header Card ─────────────────────────────────── */}
        <View style={[styles.headerCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
          {/* Top row: avatar left, name/username/bio right */}
          <View style={styles.headerTopRow}>
            {/* Avatar */}
            <View style={[styles.avatarRing, { borderColor: colors.primary }]}>
              {user.avatar_url ? (
                <Image
                  source={resolveImageSource(user.avatar_url)}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
            </View>

            {/* Name / username / bio */}
            <View style={styles.headerInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.displayName, { color: textColor }]} numberOfLines={1}>{displayName}</Text>
                {isPremiumUser && (
                  <View style={styles.eliteBadge}>
                    <Text style={styles.eliteBadgeText}>ELITE</Text>
                  </View>
                )}
              </View>
              {user.username ? (
                <Text style={[styles.username, { color: secondaryText }]}>
                  {'@'}
                  {user.username}
                </Text>
              ) : null}
              {bioText.length > 0 ? (
                <Text style={[styles.bioText, { color: textColor }]} numberOfLines={3}>{bioText}</Text>
              ) : null}
            </View>
          </View>

          {/* Stats row — full-width below avatar+name */}
          <View style={[styles.statsRow, { borderTopColor: borderColor, borderBottomColor: borderColor }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: textColor }]}>{postsCountDisplay}</Text>
              <Text style={[styles.statLabel, { color: secondaryText }]}>Posts</Text>
            </View>

            <View style={[styles.statDivider, { backgroundColor: borderColor }]} />

            <TouchableOpacity
              style={styles.statItem}
              onPress={() => {
                console.log('[Profile] Followers stat tapped');
                openFollowModal('followers');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.statNumber, { color: textColor }]}>{followersCountDisplay}</Text>
              <Text style={[styles.statLabel, { color: secondaryText }]}>Followers</Text>
            </TouchableOpacity>

            <View style={[styles.statDivider, { backgroundColor: borderColor }]} />

            <TouchableOpacity
              style={styles.statItem}
              onPress={() => {
                console.log('[Profile] Following stat tapped');
                openFollowModal('following');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.statNumber, { color: textColor }]}>{followingCountDisplay}</Text>
              <Text style={[styles.statLabel, { color: secondaryText }]}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Achievements Strip ──────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.achievementsStrip}
        >
          <View style={[styles.achievementCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
            <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local_fire_department" size={20} color={colors.primary} />
            <Text style={[styles.achievementNumber, { color: textColor }]}>{currentStreakDisplay}</Text>
            <Text style={[styles.achievementLabel, { color: secondaryText }]}>Streak</Text>
          </View>

          <View style={[styles.achievementCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
            <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji_events" size={20} color="#F59E0B" />
            <Text style={[styles.achievementNumber, { color: textColor }]}>{bestStreakDisplay}</Text>
            <Text style={[styles.achievementLabel, { color: secondaryText }]}>Best Streak</Text>
          </View>

          <View style={[styles.achievementCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
            <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar_today" size={20} color={colors.primary} />
            <Text style={[styles.achievementNumber, { color: textColor }]}>{totalDaysDisplay}</Text>
            <Text style={[styles.achievementLabel, { color: secondaryText }]}>Days Logged</Text>
          </View>
        </ScrollView>

        {/* ── Nutrition Card (Today, food-tab style) ──────────────────────── */}
        <View style={[styles.nutritionCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
          <Text style={[styles.nutritionCardTitle, { color: textColor }]}>My Nutrition</Text>
          <View style={[styles.caloriesCard, { backgroundColor: cardBg }]}>
            <View style={styles.caloriesContent}>
              <ProgressCircle
                current={totalCaloriesRounded}
                target={goal?.daily_calories || 2000}
                size={140}
                strokeWidth={12}
                color={colors.calories}
                label="kcal"
              />
              <View style={styles.macroSummaryCompact}>
                <MacroSummaryRowCompact label="Protein" eaten={Math.round(totalMacros.protein)} goal={goal?.protein_g || 150} color={colors.protein} isDark={isDark} />
                <MacroSummaryRowCompact label="Carbs" eaten={Math.round(totalMacros.carbs)} goal={goal?.carbs_g || 200} color={colors.carbs} isDark={isDark} />
                <MacroSummaryRowCompact label="Fats" eaten={Math.round(totalMacros.fats)} goal={goal?.fats_g || 65} color={colors.fats} isDark={isDark} />
                <MacroSummaryRowCompact label="Fiber" eaten={Math.round(totalMacros.fiber)} goal={goal?.fiber_g || 30} color={colors.fiber} isDark={isDark} />
              </View>
            </View>
          </View>
        </View>

        {/* ── Posts Feed ──────────────────────────────────────────────────── */}
        <View style={styles.feedSection}>
          <Text style={[styles.feedSectionTitle, { color: textColor }]}>Posts</Text>

          {posts.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
              <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={40} color={colors.textSecondary} />
              <Text style={[styles.emptyStateText, { color: secondaryText }]}>
                Your achievements will appear here
              </Text>
            </View>
          ) : (
            posts.map((post) => {
              const postTime = relativeTime(post.created_at);
              const postLikes = String(post.likes_count ?? 0);
              return (
                <View
                  key={post.id}
                  style={[styles.postCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}
                >
                  <View style={styles.postCardHeader}>
                    <View style={styles.postCardBody}>
                      <Text style={[styles.postContent, { color: textColor }]}>{post.content}</Text>
                      <View style={styles.postMeta}>
                        <Text style={[styles.postTime, { color: secondaryText }]}>{postTime}</Text>
                        <View style={styles.postLikesRow}>
                          <IconSymbol
                            ios_icon_name="heart.fill"
                            android_material_icon_name="favorite"
                            size={13}
                            color={colors.error}
                          />
                          <Text style={[styles.postLikes, { color: secondaryText }]}>{postLikes}</Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeletePost(post.id)}
                      activeOpacity={0.7}
                      style={styles.postDeleteButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <IconSymbol
                        ios_icon_name="trash"
                        android_material_icon_name="delete"
                        size={16}
                        color={colors.error}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── Follow Modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={followModalType !== null}
        transparent
        animationType="slide"
        onRequestClose={closeFollowModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeFollowModal}
        >
          <TouchableOpacity
            style={[styles.modalSheet, { backgroundColor: cardBg }]}
            activeOpacity={1}
          >
            <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                {followModalType === 'followers' ? 'Followers' : 'Following'}
              </Text>
              <TouchableOpacity
                onPress={closeFollowModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={20}
                  color={secondaryText}
                />
              </TouchableOpacity>
            </View>

            {followModalLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : followModalUsers.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={[styles.modalEmptyText, { color: secondaryText }]}>
                  {followModalType === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={followModalUsers}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.modalList}
                renderItem={({ item }) => {
                  const itemName = item.full_name || item.username || 'User';
                  const itemInitial = itemName.charAt(0).toUpperCase();
                  const itemUsername = item.username ? `@${item.username}` : '';
                  return (
                    <View style={[styles.followUserRow, { borderBottomColor: borderColor }]}>
                      {item.avatar_url ? (
                        <Image
                          source={resolveImageSource(item.avatar_url)}
                          style={styles.followAvatar}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.followAvatarFallback, { backgroundColor: colors.primary }]}>
                          <Text style={styles.followAvatarInitial}>{itemInitial}</Text>
                        </View>
                      )}
                      <View style={styles.followUserInfo}>
                        <Text style={[styles.followUserName, { color: textColor }]}>{itemName}</Text>
                        {itemUsername ? (
                          <Text style={[styles.followUserUsername, { color: secondaryText }]}>{itemUsername}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarTitle: {
    ...typography.h3,
  },
  settingsButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // ── Instagram Header Card ──────────────────────────────────────────────────
  headerCard: {
    margin: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatarRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: 3,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    flexShrink: 1,
  },
  eliteBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  eliteBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  username: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    marginBottom: 4,
  },
  bioText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },

  // Stats row inside header card
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
  },

  // Achievements strip
  achievementsStrip: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  achievementCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    minWidth: 90,
  },
  achievementNumber: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  achievementLabel: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
    textAlign: 'center',
  },

  // Nutrition card wrapper
  nutritionCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  nutritionCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.md,
  },

  // ProgressCircle card (matches home tab)
  caloriesCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 0,
  },
  caloriesContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  macroSummaryCompact: {
    flex: 1,
    gap: 8,
  },
  macroSummaryRowCompact: {
    marginBottom: 4,
  },
  macroSummaryLabelCompact: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  macroSummaryBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroSummaryBarBackground: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroSummaryBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  macroSummaryProgressCompact: {
    fontSize: 11,
    fontWeight: '500',
    minWidth: 60,
    textAlign: 'right',
  },

  // Feed
  feedSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  feedSectionTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  emptyState: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  postCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  postCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  postCardBody: {
    flex: 1,
  },
  postDeleteButton: {
    padding: 4,
  },
  postContent: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  postTime: {
    ...typography.small,
  },
  postLikesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postLikes: {
    ...typography.small,
  },

  // Follow modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '70%',
    minHeight: 200,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    ...typography.h3,
  },
  modalLoading: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  modalEmpty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  modalEmptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  modalList: {
    paddingBottom: spacing.xl,
  },
  followUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  followAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  followAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followAvatarInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  followUserInfo: {
    flex: 1,
  },
  followUserName: {
    ...typography.bodyBold,
  },
  followUserUsername: {
    ...typography.small,
    marginTop: 1,
  },
});
