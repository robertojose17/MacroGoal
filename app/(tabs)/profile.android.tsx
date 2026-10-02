
import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import CalendarDateRangePicker from '@/components/CalendarDateRangePicker';
import { useXpStatus } from '@/hooks/useXpStatus';
import { calcDailyScore } from '@/utils/consistencyMath';

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
type NutritionRange = 'today' | '7d' | '30d' | 'custom';

const TOOLTIP_CONTENT: Record<string, { title: string; description: string }> = {
  streak: {
    title: 'Current Streak',
    description: "The number of consecutive days you've logged your food. Keep it going!",
  },
  best: {
    title: 'Best Streak',
    description: 'Your longest streak ever. This is your personal record for consecutive days logged.',
  },
  score: {
    title: 'Consistency Score (30 days)',
    description: 'A score from 0–100 measuring how consistently you\'ve tracked your calories and protein over the last 30 days. 80+ is Locked In, 60+ is On Track.',
  },
  member: {
    title: 'Member Since',
    description: 'The date you joined Macro Goal. Welcome to the journey!',
  },
};

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
  const { status: xpStatus } = useXpStatus();

  // Streaks derived from useXpStatus (same source as dashboard)
  const currentStreak = xpStatus?.current_streak ?? 0;
  const bestStreak = xpStatus?.longest_streak ?? 0;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Stats
  const [postsCount, setPostsCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Consistency score (30-day)
  const [consistencyScore, setConsistencyScore] = useState(0);

  // Posts feed
  const [posts, setPosts] = useState<any[]>([]);

  // Follow modal
  const [followModalType, setFollowModalType] = useState<FollowModalType>(null);
  const [followModalUsers, setFollowModalUsers] = useState<FollowUser[]>([]);
  const [followModalLoading, setFollowModalLoading] = useState(false);

  // Nutrition card
  const [totalCalories, setTotalCalories] = useState(0);
  const [totalMacros, setTotalMacros] = useState({ protein: 0, carbs: 0, fats: 0, fiber: 0 });
  const [goal, setGoal] = useState<any>(null);

  // Range selector
  const [nutritionRange, setNutritionRange] = useState<NutritionRange>('today');
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [rangeDayCount, setRangeDayCount] = useState(1);
  const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);

  // Tooltip
  const [tooltipKey, setTooltipKey] = useState<string | null>(null);

  // Avatar error fallback
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => { setAvatarError(false); }, [user?.avatar_url]);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryText = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const cardBorderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  // Fetch nutrition data for a given date range
  const loadNutritionData = async (
    userId: string,
    range: NutritionRange,
    customStart?: Date,
    customEnd?: Date,
  ) => {
    const today = new Date();
    let startDateStr: string;
    let endDateStr: string;
    let dayCount = 1;

    if (range === 'today') {
      startDateStr = toLocalDateString(today);
      endDateStr = startDateStr;
      dayCount = 1;
    } else if (range === '7d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      startDateStr = toLocalDateString(start);
      endDateStr = toLocalDateString(today);
      dayCount = 7;
    } else if (range === '30d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      startDateStr = toLocalDateString(start);
      endDateStr = toLocalDateString(today);
      dayCount = 30;
    } else {
      // custom
      const s = customStart ?? customStartDate;
      const e = customEnd ?? customEndDate;
      startDateStr = toLocalDateString(s);
      endDateStr = toLocalDateString(e);
      const msPerDay = 1000 * 60 * 60 * 24;
      dayCount = Math.max(1, Math.round((e.getTime() - s.getTime()) / msPerDay) + 1);
    }

    console.log('[Profile] loadNutritionData — range:', range, 'start:', startDateStr, 'end:', endDateStr, 'days:', dayCount);

    const query = supabase
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
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr);

    const { data: mealsData, error: mealsError } = await query;
    console.log('[Profile] loadNutritionData — meals query:', mealsError ? mealsError.message : `${mealsData?.length ?? 0} meals`);

    let totalCals = 0, totalP = 0, totalC = 0, totalF = 0, totalFib = 0;
    mealsData?.forEach((meal: any) => {
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

    // Divide by day count for averages
    const avgCals = totalCals / dayCount;
    const avgP    = totalP / dayCount;
    const avgC    = totalC / dayCount;
    const avgF    = totalF / dayCount;
    const avgFib  = totalFib / dayCount;

    console.log('[Profile] loadNutritionData — totals: calories:', avgCals, 'protein:', avgP, 'carbs:', avgC, 'fats:', avgF, 'fiber:', avgFib, '(daily avg over', dayCount, 'days)');

    setTotalCalories(avgCals);
    setTotalMacros({ protein: avgP, carbs: avgC, fats: avgF, fiber: avgFib });
    setRangeDayCount(dayCount);
  };

  const loadConsistencyScore = async (userId: string) => {
    console.log('[Profile] loadConsistencyScore — starting 30-day calculation for user:', userId);
    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      const startStr = toLocalDateString(start);
      const endStr = toLocalDateString(today);

      const [mealsRes, goalsRes] = await Promise.all([
        supabase
          .from('meals')
          .select('date, meal_items(calories, protein, is_scheduled)')
          .eq('user_id', userId)
          .gte('date', startStr)
          .lte('date', endStr),
        supabase
          .from('goals')
          .select('daily_calories, protein_g')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle(),
      ]);

      console.log('[Profile] loadConsistencyScore — meals:', mealsRes.error ? mealsRes.error.message : `${mealsRes.data?.length ?? 0} meals`, 'goals:', goalsRes.error ? goalsRes.error.message : 'ok');

      const calorieTarget = goalsRes.data?.daily_calories ?? 2000;
      const proteinTarget = goalsRes.data?.protein_g ?? 150;

      // Group meals by date
      const byDate: Record<string, { calories: number; protein: number }> = {};
      mealsRes.data?.forEach((meal: any) => {
        const d = meal.date;
        if (!byDate[d]) byDate[d] = { calories: 0, protein: 0 };
        meal.meal_items?.forEach((item: any) => {
          if (!item.is_scheduled) {
            byDate[d].calories += item.calories ?? 0;
            byDate[d].protein += item.protein ?? 0;
          }
        });
      });

      // Score each of the 30 days
      let totalScore = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = toLocalDateString(d);
        const dayData = byDate[key];
        const hasTracking = !!dayData;
        const dayCals = dayData?.calories ?? 0;
        const dayProt = dayData?.protein ?? 0;
        totalScore += calcDailyScore(hasTracking, dayCals, calorieTarget, dayProt, proteinTarget);
      }

      const avg = Math.round(totalScore / 30);
      console.log('[Profile] loadConsistencyScore — 30-day avg score:', avg);
      setConsistencyScore(avg);
    } catch (err) {
      console.error('[Profile] loadConsistencyScore — error:', err);
    }
  };

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

      const [
        userResult,
        postsResult,
        followersResult,
        followingResult,
        goalsResult,
      ] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', authUser.id),
        supabase.from('social_follows').select('id', { count: 'exact', head: true }).eq('following_id', authUser.id),
        supabase.from('social_follows').select('id', { count: 'exact', head: true }).eq('follower_id', authUser.id),
        supabase.from('goals').select('*').eq('user_id', authUser.id).eq('is_active', true).maybeSingle(),
      ]);

      console.log('[Profile] loadData — user result:', userResult.error ? userResult.error.message : 'ok');
      console.log('[Profile] loadData — posts count:', postsResult.count, postsResult.error?.message);
      console.log('[Profile] loadData — followers count:', followersResult.count, followersResult.error?.message);
      console.log('[Profile] loadData — following count:', followingResult.count, followingResult.error?.message);
      console.log('[Profile] loadData — goals result:', goalsResult.error ? goalsResult.error.message : 'ok');

      if (userResult.data) {
        setUser({ ...authUser, ...userResult.data });
      } else {
        setUser(authUser);
      }

      setPostsCount(postsResult.count ?? 0);
      setFollowersCount(followersResult.error ? 0 : (followersResult.count ?? 0));
      setFollowingCount(followingResult.error ? 0 : (followingResult.count ?? 0));

      if (goalsResult.data) {
        setGoal(goalsResult.data);
      }

      // Load nutrition and consistency score in parallel
      await Promise.all([
        loadNutritionData(authUser.id, nutritionRange, customStartDate, customEndDate),
        loadConsistencyScore(authUser.id),
      ]);

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

  const handleRangeChange = async (range: NutritionRange) => {
    console.log('[Profile] handleRangeChange — range pill pressed:', range);
    if (range === 'custom') {
      setShowRangePicker(true);
      return;
    }
    setNutritionRange(range);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    await loadNutritionData(authUser.id, range);
  };

  const handleCustomRangeSelect = async (startDate: Date, endDate: Date) => {
    console.log('[Profile] handleCustomRangeSelect — start:', toLocalDateString(startDate), 'end:', toLocalDateString(endDate));
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
    setNutritionRange('custom');
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    await loadNutritionData(authUser.id, 'custom', startDate, endDate);
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
  const consistencyScoreDisplay = String(consistencyScore);
  const postsCountDisplay = String(postsCount);
  const followersCountDisplay = String(followersCount);
  const followingCountDisplay = String(followingCount);

  const totalCaloriesRounded = Math.round(totalCalories);

  const isMultiDay = nutritionRange !== 'today';
  const averageLabelText = nutritionRange === '7d'
    ? 'Daily average over 7 days'
    : nutritionRange === '30d'
      ? 'Daily average over 30 days'
      : nutritionRange === 'custom'
        ? `Daily average over ${rangeDayCount} day${rangeDayCount !== 1 ? 's' : ''}`
        : '';

  const memberSinceDisplay = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', " '")
    : '—';

  const activeTooltip = tooltipKey ? TOOLTIP_CONTENT[tooltipKey] : null;

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
        {/* ── Instagram-style Header ─────────────────────────────────── */}
        <View style={styles.igHeader}>
          {/* Row: avatar + info */}
          <View style={styles.igHeaderRow}>
            {/* Avatar */}
            <View style={[styles.igAvatarRing, { borderColor: colors.primary }]}>
              {user.avatar_url && !avatarError ? (
                <Image
                  source={resolveImageSource(user.avatar_url)}
                  style={styles.igAvatarImage}
                  resizeMode="cover"
                  onError={() => {
                    console.log('[Profile] Avatar image failed to load, falling back to initials', { url: user.avatar_url });
                    setAvatarError(true);
                  }}
                />
              ) : (
                <View style={[styles.igAvatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.igAvatarInitials}>{initials}</Text>
                </View>
              )}
            </View>

            {/* Info column */}
            <View style={styles.igInfoCol}>
              {/* Username + badge */}
              <View style={styles.igNameRow}>
                <Text style={[styles.igUsername, { color: textColor }]} numberOfLines={1}>
                  {user.username || displayName}
                </Text>
                {isPremiumUser && (
                  <View style={[styles.igEliteBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.igEliteBadgeText}>ELITE</Text>
                  </View>
                )}
              </View>
              {/* Full name */}
              <Text style={[styles.igFullName, { color: secondaryText }]} numberOfLines={1}>
                {displayName}
              </Text>
              {/* Stats row */}
              <View style={styles.igStatsRow}>
                <TouchableOpacity onPress={() => {}} activeOpacity={0.7} style={styles.igStatItem}>
                  <Text style={[styles.igStatNumber, { color: textColor }]}>{postsCountDisplay}</Text>
                  <Text style={[styles.igStatLabel, { color: secondaryText }]}> posts</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[Profile] Followers stat tapped');
                    openFollowModal('followers');
                  }}
                  activeOpacity={0.7}
                  style={styles.igStatItem}
                >
                  <Text style={[styles.igStatNumber, { color: textColor }]}>{followersCountDisplay}</Text>
                  <Text style={[styles.igStatLabel, { color: secondaryText }]}> followers</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[Profile] Following stat tapped');
                    openFollowModal('following');
                  }}
                  activeOpacity={0.7}
                  style={styles.igStatItem}
                >
                  <Text style={[styles.igStatNumber, { color: textColor }]}>{followingCountDisplay}</Text>
                  <Text style={[styles.igStatLabel, { color: secondaryText }]}> following</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Bio — full width below */}
          {bioText.length > 0 && (
            <Text style={[styles.igBio, { color: textColor }]}>{bioText}</Text>
          )}
        </View>

        {/* ── Stats Row ──────────────────────────────────────────────────── */}
        <View style={[styles.statsRowCard, { backgroundColor: cardBg }]}>
          {/* Streak */}
          <TouchableOpacity
            style={styles.statCol}
            activeOpacity={0.7}
            onPress={() => {
              console.log('[Profile] stat tooltip tapped: streak');
              setTooltipKey('streak');
            }}
          >
            <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local_fire_department" size={16} color={colors.primary} />
            <Text style={[styles.statColValue, { color: textColor }]}>{currentStreakDisplay}</Text>
            <Text style={[styles.statColLabel, { color: secondaryText }]}>STREAK</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: borderColor }]} />

          {/* Best */}
          <TouchableOpacity
            style={styles.statCol}
            activeOpacity={0.7}
            onPress={() => {
              console.log('[Profile] stat tooltip tapped: best');
              setTooltipKey('best');
            }}
          >
            <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji_events" size={16} color="#F59E0B" />
            <Text style={[styles.statColValue, { color: textColor }]}>{bestStreakDisplay}</Text>
            <Text style={[styles.statColLabel, { color: secondaryText }]}>BEST</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: borderColor }]} />

          {/* Consistency Score */}
          <TouchableOpacity
            style={styles.statCol}
            activeOpacity={0.7}
            onPress={() => {
              console.log('[Profile] stat tooltip tapped: score');
              setTooltipKey('score');
            }}
          >
            <IconSymbol ios_icon_name="chart.bar.fill" android_material_icon_name="bar_chart" size={16} color={colors.primary} />
            <Text style={[styles.statColValue, { color: colors.primary }]}>{consistencyScoreDisplay}</Text>
            <Text style={[styles.statColLabel, { color: secondaryText }]}>SCORE</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: borderColor }]} />

          {/* Member */}
          <TouchableOpacity
            style={styles.statCol}
            activeOpacity={0.7}
            onPress={() => {
              console.log('[Profile] stat tooltip tapped: member');
              setTooltipKey('member');
            }}
          >
            <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={16} color="#8B5CF6" />
            <Text style={[styles.statColValue, { color: textColor }]}>{memberSinceDisplay}</Text>
            <Text style={[styles.statColLabel, { color: secondaryText }]}>SINCE</Text>
          </TouchableOpacity>
        </View>

        {/* ── Nutrition Card ──────────────────────────────────────────────── */}
        <View style={[styles.caloriesCard, { backgroundColor: cardBg }]}>
          {/* Top-left dropdown button */}
          <View style={styles.rangeDropdownRow}>
            <TouchableOpacity
              style={[styles.rangeDropdownBtn, { borderColor: borderColor }]}
              onPress={() => {
                console.log('[Profile] range dropdown toggled, currently open:', rangeDropdownOpen);
                setRangeDropdownOpen(v => !v);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.rangeDropdownLabel, { color: secondaryText }]}>
                {nutritionRange === 'today' ? 'Today' : nutritionRange === '7d' ? '7 Days' : nutritionRange === '30d' ? '30 Days' : 'Custom'}
              </Text>
              <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={12} color={secondaryText} />
            </TouchableOpacity>
            {isMultiDay && (
              <Text style={[styles.avgLabel, { color: secondaryText }]}>{averageLabelText}</Text>
            )}
          </View>

          {/* Dropdown menu — shown inline below the button when open */}
          {rangeDropdownOpen && (
            <View style={[styles.rangeDropdownMenu, { backgroundColor: cardBg, borderColor: borderColor }]}>
              {(['today', '7d', '30d', 'custom'] as NutritionRange[]).map((key) => {
                const label = key === 'today' ? 'Today' : key === '7d' ? '7 Days' : key === '30d' ? '30 Days' : 'Custom';
                const isActive = nutritionRange === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.rangeDropdownItem, isActive && { backgroundColor: colors.primary + '15' }]}
                    onPress={() => {
                      console.log('[Profile] range dropdown item pressed:', key);
                      setRangeDropdownOpen(false);
                      handleRangeChange(key);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rangeDropdownItemText, { color: isActive ? colors.primary : (isDark ? colors.textDark : colors.text) }]}>
                      {label}
                    </Text>
                    {isActive && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={12} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* The actual macro content */}
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

      {/* ── Tooltip Modal ───────────────────────────────────────────────────── */}
      <Modal
        visible={tooltipKey !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          console.log('[Profile] tooltip modal dismissed via back button');
          setTooltipKey(null);
        }}
      >
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => {
            console.log('[Profile] tooltip overlay tapped — closing');
            setTooltipKey(null);
          }}
        >
          <TouchableOpacity
            style={[styles.tooltipCard, { backgroundColor: cardBg }]}
            activeOpacity={1}
          >
            <TouchableOpacity
              style={styles.tooltipCloseBtn}
              onPress={() => {
                console.log('[Profile] tooltip close button pressed, key:', tooltipKey);
                setTooltipKey(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={18}
                color={secondaryText}
              />
            </TouchableOpacity>
            <Text style={[styles.tooltipTitle, { color: secondaryText }]}>
              {activeTooltip?.title ?? ''}
            </Text>
            <Text style={[styles.tooltipDescription, { color: textColor }]}>
              {activeTooltip?.description ?? ''}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Custom Range Picker ─────────────────────────────────────────────── */}
      <CalendarDateRangePicker
        visible={showRangePicker}
        onClose={() => {
          console.log('[Profile] CalendarDateRangePicker closed');
          setShowRangePicker(false);
        }}
        onSelectRange={handleCustomRangeSelect}
        initialStartDate={customStartDate}
        initialEndDate={customEndDate}
        maxDate={new Date()}
        title="Select Date Range"
      />
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

  // ── Instagram Header (flat, no card) ──────────────────────────────────────
  igHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  igHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  igAvatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    overflow: 'hidden',
  },
  igAvatarImage: {
    width: '100%',
    height: '100%',
  },
  igAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  igAvatarInitials: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  igInfoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  igNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  igUsername: {
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  igEliteBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  igEliteBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  igFullName: {
    fontSize: 14,
    fontWeight: '400',
  },
  igStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  igStatItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  igStatNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  igStatLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  igBio: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },

  // Stats row (unified card with 4 columns)
  statsRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  } as any,
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  statDivider: {
    width: 1,
    height: 32,
  },
  statColValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statColLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ProgressCircle card (matches home tab exactly)
  caloriesCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  } as any,

  // Range dropdown
  rangeDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  rangeDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  rangeDropdownLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  rangeDropdownMenu: {
    position: 'absolute',
    top: 36,
    left: 0,
    zIndex: 100,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 120,
  },
  rangeDropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rangeDropdownItemText: {
    fontSize: 13,
    fontWeight: '500',
  },
  avgLabel: {
    fontSize: 11,
    fontWeight: '400',
  },
  caloriesContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  macroSummaryCompact: {
    flex: 1,
    gap: spacing.sm,
  },
  macroSummaryRowCompact: {
    gap: 4,
  },
  macroSummaryLabelCompact: {
    fontSize: 12,
    fontWeight: '500',
  },
  macroSummaryBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  macroSummaryBarBackground: {
    flex: 1,
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  macroSummaryBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  macroSummaryProgressCompact: {
    fontSize: 11,
    fontWeight: '500',
    minWidth: 70,
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

  // Tooltip modal
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  tooltipCard: {
    borderRadius: 20,
    padding: 24,
    maxWidth: 320,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  tooltipCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  tooltipTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginRight: 28,
  },
  tooltipDescription: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
});
