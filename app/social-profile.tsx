/**
 * Social Profile Screen — Instagram-style
 * Route: /social-profile?user_id=X
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  RefreshControl,
  FlatList,
  Dimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Lock,
  TrendingUp,
  Flame,
  Trophy,
  ChevronLeft,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  fetchProfile,
  followUser,
  unfollowUser,
  toggleLike,
} from '@/utils/socialApi';
import type { SocialProfile, SocialPost } from '@/utils/socialApi';
import Avatar from '@/components/social/Avatar';
import SocialPostCard from '@/components/social/SocialPostCard';
import { ZoomablePhoto } from '@/components/ZoomablePhoto';

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function defaultFromDate(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

function defaultToDate(): string {
  return formatDate(new Date());
}

type ProfileTab = 'posts' | 'stats';
type DateRange = '7d' | '30d' | '90d';

const DATE_RANGES: { key: DateRange; label: string; days: number }[] = [
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - spacing.md * 2 - 4) / 3;

function StatPill({
  label,
  value,
  unit,
  color,
  isDark,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  color: string;
  isDark: boolean;
}) {
  const bg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const displayValue = value != null ? Math.round(Number(value)).toString() : '—';

  return (
    <View style={[styles.statPill, { backgroundColor: bg, borderColor }]}>
      <View style={[styles.statPillDot, { backgroundColor: color }]} />
      <Text style={[styles.statPillValue, { color: textColor }]}>{displayValue}</Text>
      <Text style={[styles.statPillUnit, { color: subColor }]}>{unit}</Text>
      <Text style={[styles.statPillLabel, { color: subColor }]}>{label}</Text>
    </View>
  );
}

export default function SocialProfileScreen() {
  const { user_id } = useLocalSearchParams<{ user_id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [fromDate, setFromDate] = useState(defaultFromDate(30));
  const [toDate] = useState(defaultToDate());

  const [followLoading, setFollowLoading] = useState(false);
  const [posts, setPosts] = useState<SocialPost[]>([]);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  // ─── Load profile ────────────────────────────────────────────────────────────
  const loadProfile = useCallback(async (from: string, to: string, isRefresh = false) => {
    if (!user_id) return;
    console.log('[SocialProfile] loadProfile — user_id:', user_id, 'from:', from, 'to:', to, 'isRefresh:', isRefresh);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchProfile(user_id, from, to);
      setProfile(data);
      setPosts(data.posts ?? []);
      console.log('[SocialProfile] Loaded profile — is_own:', data.is_own_profile, 'is_mutual:', data.is_mutual, 'posts:', data.posts?.length ?? 0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load profile';
      console.error('[SocialProfile] loadProfile error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user_id]);

  useEffect(() => {
    loadProfile(fromDate, toDate);
  }, [user_id]);

  const handleDateRangeChange = useCallback((range: DateRange) => {
    const days = DATE_RANGES.find((r) => r.key === range)?.days ?? 30;
    const newFrom = defaultFromDate(days);
    console.log('[SocialProfile] Date range changed to:', range, 'from:', newFrom);
    setDateRange(range);
    setFromDate(newFrom);
    loadProfile(newFrom, toDate);
  }, [toDate, loadProfile]);

  const handleRefresh = useCallback(() => {
    console.log('[SocialProfile] Pull-to-refresh');
    loadProfile(fromDate, toDate, true);
  }, [fromDate, toDate, loadProfile]);

  // ─── Follow / Unfollow ───────────────────────────────────────────────────────
  const handleFollowToggle = useCallback(async () => {
    if (!profile || !user_id) return;
    const isFollowing = profile.is_following;
    console.log('[SocialProfile] Follow toggle pressed — user_id:', user_id, 'currently following:', isFollowing);
    setFollowLoading(true);
    // Optimistic update
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            is_following: !isFollowing,
            user: {
              ...prev.user,
              followers_count: isFollowing
                ? prev.user.followers_count - 1
                : prev.user.followers_count + 1,
            },
          }
        : prev
    );
    try {
      if (isFollowing) {
        await unfollowUser(user_id);
        console.log('[SocialProfile] Unfollowed user:', user_id);
      } else {
        await followUser(user_id);
        console.log('[SocialProfile] Followed user:', user_id);
      }
      // Reload to get updated mutual status
      await loadProfile(fromDate, toDate);
    } catch (e) {
      console.error('[SocialProfile] Follow toggle failed, reverting:', e);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              is_following: isFollowing,
              user: {
                ...prev.user,
                followers_count: isFollowing
                  ? prev.user.followers_count + 1
                  : prev.user.followers_count - 1,
              },
            }
          : prev
      );
    } finally {
      setFollowLoading(false);
    }
  }, [profile, user_id, fromDate, toDate, loadProfile]);

  // ─── Like ────────────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (postId: string) => {
    console.log('[SocialProfile] Like pressed — post_id:', postId);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      )
    );
    try {
      const result = await toggleLike(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, liked_by_me: result.liked, likes_count: result.likes_count } : p))
      );
    } catch (e) {
      console.error('[SocialProfile] toggleLike failed:', e);
    }
  }, []);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Profile', headerBackButtonDisplayMode: 'minimal' }} />
        <View style={[styles.loadingContainer, { backgroundColor: bg }]}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <Stack.Screen options={{ title: 'Profile', headerBackButtonDisplayMode: 'minimal' }} />
        <View style={[styles.loadingContainer, { backgroundColor: bg }]}>
          <Text style={[styles.errorTitle, { color: textColor }]}>Couldn't load profile</Text>
          <Text style={[styles.errorSub, { color: subColor }]}>{error ?? 'Unknown error'}</Text>
          <Pressable
            onPress={() => {
              console.log('[SocialProfile] Retry pressed');
              loadProfile(fromDate, toDate);
            }}
            style={styles.retryBtn}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const { user, is_following, is_mutual, is_own_profile, stats } = profile;
  const canViewStats = is_mutual || is_own_profile;

  // Follow button state
  let followBtnLabel = 'Follow';
  let followBtnBg = colors.primary;
  let followBtnTextColor = '#FFFFFF';
  let followBtnBorderColor = colors.primary;
  if (is_own_profile) {
    followBtnLabel = 'Edit Profile';
    followBtnBg = 'transparent';
    followBtnTextColor = textColor;
    followBtnBorderColor = borderColor;
  } else if (is_mutual) {
    followBtnLabel = 'Friends ✓';
    followBtnBg = 'transparent';
    followBtnTextColor = colors.success;
    followBtnBorderColor = colors.success;
  } else if (is_following) {
    followBtnLabel = 'Following';
    followBtnBg = 'transparent';
    followBtnTextColor = textColor;
    followBtnBorderColor = borderColor;
  }

  const photoPosts = posts.filter((p) => p.post_type === 'photo' && p.image_url);
  const nonPhotoPosts = posts.filter((p) => p.post_type !== 'photo');

  const renderStatsTab = () => {
    if (!canViewStats) {
      return (
        <View style={styles.lockedStats}>
          <Lock size={32} color={subColor} />
          <Text style={[styles.lockedTitle, { color: textColor }]}>Stats are private</Text>
          <Text style={[styles.lockedSub, { color: subColor }]}>
            Follow each other to see stats
          </Text>
        </View>
      );
    }
    if (!stats) {
      return (
        <View style={styles.lockedStats}>
          <Text style={[styles.lockedSub, { color: subColor }]}>No stats available</Text>
        </View>
      );
    }

    const weightChangeDisplay = stats.weight_change != null
      ? (stats.weight_change > 0 ? '+' : '') + Number(stats.weight_change).toFixed(1)
      : null;
    const weightChangeColor = stats.weight_change != null
      ? (stats.weight_change < 0 ? colors.success : colors.warning)
      : subColor;
    const consistencyDisplay = stats.consistency_score != null
      ? Math.round(Number(stats.consistency_score)).toString() + '%'
      : '—';

    return (
      <View style={styles.statsContainer}>
        {/* Date range pills */}
        <View style={styles.dateRangeRow}>
          {DATE_RANGES.map((r) => {
            const isActive = dateRange === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => handleDateRangeChange(r.key)}
                style={[
                  styles.dateRangeBtn,
                  {
                    backgroundColor: isActive ? colors.primary : 'transparent',
                    borderColor: isActive ? colors.primary : borderColor,
                  },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.dateRangeBtnText, { color: isActive ? '#fff' : subColor }]}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Calories */}
        <View style={[styles.caloriesCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.caloriesLabel, { color: subColor }]}>Avg Calories</Text>
          <Text style={[styles.caloriesValue, { color: colors.calories }]}>
            {stats.avg_calories != null ? Math.round(Number(stats.avg_calories)).toString() : '—'}
          </Text>
          <Text style={[styles.caloriesUnit, { color: subColor }]}>kcal / day</Text>
        </View>

        {/* Macros row */}
        <View style={styles.macroRow}>
          <StatPill label="Protein" value={stats.avg_protein} unit="g" color={colors.protein} isDark={isDark} />
          <StatPill label="Carbs" value={stats.avg_carbs} unit="g" color={colors.carbs} isDark={isDark} />
          <StatPill label="Fat" value={stats.avg_fat} unit="g" color={colors.fats} isDark={isDark} />
        </View>

        {/* Weight change */}
        {weightChangeDisplay ? (
          <View style={[styles.weightChangeCard, { backgroundColor: cardBg, borderColor }]}>
            <TrendingUp size={20} color={weightChangeColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.weightChangeLabel, { color: subColor }]}>Weight change</Text>
              <Text style={[styles.weightChangeValue, { color: weightChangeColor }]}>
                {weightChangeDisplay}
                {' '}
                {stats.preferred_units ?? 'lbs'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Streak + Consistency */}
        <View style={styles.streakConsistencyRow}>
          <View style={[styles.streakCard, { backgroundColor: cardBg, borderColor }]}>
            <Flame size={22} color="#EF4444" />
            <Text style={[styles.streakValue, { color: textColor }]}>{stats.streak}</Text>
            <Text style={[styles.streakLabel, { color: subColor }]}>day streak</Text>
          </View>
          <View style={[styles.streakCard, { backgroundColor: cardBg, borderColor }]}>
            <Trophy size={22} color="#F59E0B" />
            <Text style={[styles.streakValue, { color: textColor }]}>{consistencyDisplay}</Text>
            <Text style={[styles.streakLabel, { color: subColor }]}>consistency</Text>
          </View>
        </View>

        {/* Days tracked */}
        {stats.days_tracked > 0 ? (
          <Text style={[styles.daysTracked, { color: subColor }]}>
            {stats.days_tracked}
            {' '}
            days tracked in this period
          </Text>
        ) : null}

        {/* Photo progress */}
        {stats.check_in_photos && stats.check_in_photos.length > 0 ? (
          <View style={styles.photoProgressSection}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Photo Progress</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoProgressScroll}>
              {stats.check_in_photos.map((photo) => {
                const d = new Date(photo.date ?? photo.created_at ?? '');
                const dateLabel = d instanceof Date && !isNaN(d.getTime())
                  ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';
                return (
                  <View key={photo.id} style={styles.photoProgressItem}>
                    <ZoomablePhoto uri={photo.photo_url} style={styles.photoProgressThumb} />
                    {dateLabel ? (
                      <Text style={[styles.photoProgressDate, { color: subColor }]}>{dateLabel}</Text>
                    ) : null}
                    {photo.weight != null ? (
                      <Text style={[styles.photoProgressWeight, { color: subColor }]}>
                        {Number(photo.weight).toFixed(1)}
                        {' '}
                        {stats.preferred_units ?? 'lbs'}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  };

  const renderPostsTab = () => {
    if (posts.length === 0) {
      return (
        <View style={styles.emptyPosts}>
          <Text style={[styles.emptyPostsText, { color: subColor }]}>No posts yet</Text>
        </View>
      );
    }

    return (
      <View>
        {/* Photo grid */}
        {photoPosts.length > 0 ? (
          <View style={styles.photoGrid}>
            {photoPosts.map((post) => (
              <Pressable
                key={post.id}
                onPress={() => {
                  console.log('[SocialProfile] Photo grid item pressed — post_id:', post.id);
                  router.push(`/social-post-detail?post_id=${post.id}`);
                }}
                style={styles.photoGridItem}
                accessibilityRole="button"
              >
                <Image
                  source={resolveImageSource(post.image_url ?? '')}
                  style={styles.photoGridImage}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Non-photo posts */}
        {nonPhotoPosts.map((post, index) => (
          <SocialPostCard
            key={post.id}
            post={post}
            isDark={isDark}
            onLike={handleLike}
            onPressUser={(uid) => {
              console.log('[SocialProfile] Post user pressed — user_id:', uid);
              router.push(`/social-profile?user_id=${uid}`);
            }}
            index={index}
          />
        ))}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: user.username,
          headerBackButtonDisplayMode: 'minimal',
          headerShown: true,
        }}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: bg }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── Profile header ── */}
        <View style={styles.profileHeader}>
          <View style={styles.profileTopRow}>
            <Avatar username={user.username} size={80} />
            <View style={styles.profileStats}>
              <View style={styles.profileStatItem}>
                <Text style={[styles.profileStatValue, { color: textColor }]}>{user.posts_count}</Text>
                <Text style={[styles.profileStatLabel, { color: subColor }]}>Posts</Text>
              </View>
              <View style={styles.profileStatItem}>
                <Text style={[styles.profileStatValue, { color: textColor }]}>{user.followers_count}</Text>
                <Text style={[styles.profileStatLabel, { color: subColor }]}>Followers</Text>
              </View>
              <View style={styles.profileStatItem}>
                <Text style={[styles.profileStatValue, { color: textColor }]}>{user.following_count}</Text>
                <Text style={[styles.profileStatLabel, { color: subColor }]}>Following</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.profileUsername, { color: textColor }]}>{user.username}</Text>
          {user.name ? (
            <Text style={[styles.profileName, { color: subColor }]}>{user.name}</Text>
          ) : null}
          {user.bio ? (
            <Text style={[styles.profileBio, { color: textColor }]}>{user.bio}</Text>
          ) : null}

          {/* Follow button */}
          {!is_own_profile && (
            <Pressable
              onPress={() => {
                console.log('[SocialProfile] Follow button pressed — user_id:', user_id, 'is_following:', is_following);
                handleFollowToggle();
              }}
              disabled={followLoading}
              style={[
                styles.followBtn,
                {
                  backgroundColor: followBtnBg,
                  borderColor: followBtnBorderColor,
                  opacity: followLoading ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={followBtnTextColor} />
              ) : (
                <Text style={[styles.followBtnText, { color: followBtnTextColor }]}>
                  {followBtnLabel}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        {/* ── Tab switcher ── */}
        <View style={[styles.tabSwitcher, { borderColor }]}>
          {(['posts', 'stats'] as ProfileTab[]).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === 'posts' ? 'Posts' : 'Stats';
            return (
              <Pressable
                key={tab}
                onPress={() => {
                  console.log('[SocialProfile] Tab switched to:', tab);
                  setActiveTab(tab);
                }}
                style={[styles.tabBtn, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                accessibilityRole="tab"
              >
                <Text style={[styles.tabBtnText, { color: isActive ? colors.primary : subColor }]}>
                  {label}
                </Text>
                {tab === 'stats' && !canViewStats ? (
                  <Lock size={12} color={subColor} style={{ marginLeft: 4 }} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* ── Tab content ── */}
        {activeTab === 'posts' ? renderPostsTab() : renderStatsTab()}

        <View style={{ height: 60 }} />
      </ScrollView>
    </>
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
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorSub: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xl,
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
  profileHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  profileStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  profileStatItem: {
    alignItems: 'center',
    gap: 2,
  },
  profileStatValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  profileStatLabel: {
    fontSize: 12,
  },
  profileUsername: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  profileName: {
    fontSize: 14,
    marginBottom: 2,
  },
  profileBio: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  followBtn: {
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  followBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabSwitcher: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginTop: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Posts tab
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 2,
  },
  photoGridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
  },
  photoGridImage: {
    width: '100%',
    height: '100%',
  },
  emptyPosts: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyPostsText: {
    fontSize: 14,
  },
  // Stats tab
  statsContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  dateRangeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dateRangeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  dateRangeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  caloriesCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  caloriesLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  caloriesValue: {
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 56,
  },
  caloriesUnit: {
    fontSize: 14,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statPill: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: 3,
  },
  statPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  statPillValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statPillUnit: {
    fontSize: 11,
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  weightChangeCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weightChangeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  weightChangeValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  streakConsistencyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  streakCard: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  streakValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  streakLabel: {
    fontSize: 12,
  },
  daysTracked: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  photoProgressSection: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  photoProgressScroll: {
    gap: spacing.md,
    paddingBottom: 4,
    paddingHorizontal: spacing.md,
  },
  photoProgressItem: {
    alignItems: 'center',
    gap: 4,
    width: 150,
  },
  photoProgressThumb: {
    width: 150,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoProgressWeight: {
    fontSize: 11,
    fontWeight: '500',
  },
  photoProgressDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  lockedStats: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  lockedTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  lockedSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
