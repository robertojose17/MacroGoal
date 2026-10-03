
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  FlatList,
  Alert,
  ImageSourcePropType,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

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
  name: string | null;
  avatar_url: string | null;
};

type FollowModalType = 'followers' | 'following' | null;

export default function SocialProfileViewScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryText = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const cardBorderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Profile data
  const [profile, setProfile] = useState<any>(null);
  const [postsCount, setPostsCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);

  // Streak / consistency (only shown when following)
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [consistencyScore, setConsistencyScore] = useState(0);

  // UI state
  const [followLoading, setFollowLoading] = useState(false);
  const [showFollowingDropdown, setShowFollowingDropdown] = useState(false);

  // Follow modal
  const [followModalType, setFollowModalType] = useState<FollowModalType>(null);
  const [followModalUsers, setFollowModalUsers] = useState<FollowUser[]>([]);
  const [followModalLoading, setFollowModalLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    console.log('[SocialProfileView] loadData — starting for userId:', userId);
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[SocialProfileView] loadData — no authenticated user');
        setLoading(false);
        return;
      }
      const myId = authUser.id;
      setCurrentUserId(myId);
      console.log('[SocialProfileView] loadData — currentUserId:', myId, 'targetUserId:', userId);

      // Check blocked first (simple approach)
      const { data: blockData } = await supabase
        .from('blocked_users')
        .select('id')
        .or(`and(blocker_id.eq.${myId},blocked_id.eq.${userId}),and(blocker_id.eq.${userId},blocked_id.eq.${myId})`)
        .maybeSingle();
      const blocked = !!blockData;
      console.log('[SocialProfileView] loadData — isBlocked:', blocked);
      setIsBlocked(blocked);

      if (blocked) {
        setLoading(false);
        return;
      }

      // Fetch all profile data in parallel
      const [
        profileRes,
        postsCountRes,
        followersRes,
        followingRes,
        isFollowingRes,
        postsRes,
        xpRes,
      ] = await Promise.all([
        supabase.from('users').select('id, name, username, avatar_url, bio, created_at').eq('id', userId).maybeSingle(),
        supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('social_follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('social_follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
        supabase.from('social_follows').select('id').eq('follower_id', myId).eq('following_id', userId).maybeSingle(),
        supabase.from('social_posts').select('id, content, created_at, likes_count, post_type').eq('user_id', userId).eq('is_public', true).order('created_at', { ascending: false }).limit(20),
        supabase.from('user_xp').select('current_streak, longest_streak').eq('user_id', userId).maybeSingle(),
      ]);

      console.log('[SocialProfileView] loadData — profile:', profileRes.error ? profileRes.error.message : 'ok');
      console.log('[SocialProfileView] loadData — postsCount:', postsCountRes.count, postsCountRes.error?.message);
      console.log('[SocialProfileView] loadData — followers:', followersRes.count, followersRes.error?.message);
      console.log('[SocialProfileView] loadData — following:', followingRes.count, followingRes.error?.message);
      console.log('[SocialProfileView] loadData — isFollowing:', !!isFollowingRes.data, isFollowingRes.error?.message);
      console.log('[SocialProfileView] loadData — posts:', postsRes.data?.length ?? 0, postsRes.error?.message);
      console.log('[SocialProfileView] loadData — userXp:', xpRes.error ? xpRes.error.message : 'ok');

      setProfile(profileRes.data ?? null);
      setPostsCount(postsCountRes.count ?? 0);
      setFollowersCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);
      setIsFollowing(!!isFollowingRes.data);
      setPosts(postsRes.data ?? []);

      if (xpRes.data) {
        setCurrentStreak(xpRes.data.current_streak ?? 0);
        setBestStreak(xpRes.data.longest_streak ?? 0);
      }
    } catch (err) {
      console.error('[SocialProfileView] loadData — unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFollow = async () => {
    if (!currentUserId || !userId || followLoading) return;
    console.log('[SocialProfileView] handleFollow — Follow button pressed, currentUserId:', currentUserId, 'targetUserId:', userId);
    setFollowLoading(true);
    try {
      const { error } = await supabase
        .from('social_follows')
        .insert({ follower_id: currentUserId, following_id: userId });
      if (error) {
        console.error('[SocialProfileView] handleFollow — error:', error.message);
        Alert.alert('Error', 'Could not follow user');
      } else {
        console.log('[SocialProfileView] handleFollow — success, now following userId:', userId);
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('[SocialProfileView] handleFollow — unexpected error:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (!currentUserId || !userId || followLoading) return;
    console.log('[SocialProfileView] handleUnfollow — Unfollow pressed, currentUserId:', currentUserId, 'targetUserId:', userId);
    setShowFollowingDropdown(false);
    setFollowLoading(true);
    try {
      const { error } = await supabase
        .from('social_follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', userId);
      if (error) {
        console.error('[SocialProfileView] handleUnfollow — error:', error.message);
        Alert.alert('Error', 'Could not unfollow user');
      } else {
        console.log('[SocialProfileView] handleUnfollow — success, unfollowed userId:', userId);
        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('[SocialProfileView] handleUnfollow — unexpected error:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!currentUserId || !userId) return;
    console.log('[SocialProfileView] handleBlock — Block pressed, currentUserId:', currentUserId, 'targetUserId:', userId);
    setShowFollowingDropdown(false);
    Alert.alert(
      'Block User',
      'Are you sure you want to block this user? They will no longer be able to see your profile.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => console.log('[SocialProfileView] handleBlock — cancelled'),
        },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            console.log('[SocialProfileView] handleBlock — confirmed, blocking userId:', userId);
            const { error } = await supabase
              .from('blocked_users')
              .insert({ blocker_id: currentUserId, blocked_id: userId });
            if (error) {
              console.error('[SocialProfileView] handleBlock — error:', error.message);
              Alert.alert('Error', 'Could not block user');
            } else {
              console.log('[SocialProfileView] handleBlock — success, blocked userId:', userId);
              router.back();
            }
          },
        },
      ]
    );
  };

  const openFollowModal = async (type: FollowModalType) => {
    if (!userId || !type) return;
    console.log('[SocialProfileView] openFollowModal — type:', type, 'userId:', userId);
    setFollowModalType(type);
    setFollowModalLoading(true);
    setFollowModalUsers([]);
    try {
      let ids: string[] = [];
      if (type === 'followers') {
        const { data, error } = await supabase
          .from('social_follows')
          .select('follower_id')
          .eq('following_id', userId);
        console.log('[SocialProfileView] openFollowModal — followers query:', error ? error.message : `${data?.length ?? 0} rows`);
        ids = (data ?? []).map((r: any) => r.follower_id);
      } else {
        const { data, error } = await supabase
          .from('social_follows')
          .select('following_id')
          .eq('follower_id', userId);
        console.log('[SocialProfileView] openFollowModal — following query:', error ? error.message : `${data?.length ?? 0} rows`);
        ids = (data ?? []).map((r: any) => r.following_id);
      }

      if (ids.length === 0) {
        setFollowModalUsers([]);
        return;
      }

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, username, name, avatar_url')
        .in('id', ids);
      console.log('[SocialProfileView] openFollowModal — users query:', usersError ? usersError.message : `${usersData?.length ?? 0} users`);
      setFollowModalUsers(usersData ?? []);
    } catch (err) {
      console.error('[SocialProfileView] openFollowModal — error:', err);
    } finally {
      setFollowModalLoading(false);
    }
  };

  const closeFollowModal = () => {
    console.log('[SocialProfileView] closeFollowModal');
    setFollowModalType(null);
    setFollowModalUsers([]);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.topBar, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={() => {
              console.log('[SocialProfileView] back button pressed (loading state)');
              router.back();
            }}
            activeOpacity={0.7}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={textColor} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Blocked state ──────────────────────────────────────────────────────────
  if (isBlocked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.topBar, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={() => {
              console.log('[SocialProfileView] back button pressed (blocked state)');
              router.back();
            }}
            activeOpacity={0.7}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={textColor} />
          </TouchableOpacity>
        </View>
        <View style={styles.blockedContainer}>
          <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={48} color={secondaryText} />
          <Text style={[styles.blockedTitle, { color: textColor }]}>This account is not available</Text>
          <Text style={[styles.blockedSubtitle, { color: secondaryText }]}>
            This account is unavailable because you have blocked this user or they have blocked you.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Profile not found ──────────────────────────────────────────────────────
  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.topBar, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={() => {
              console.log('[SocialProfileView] back button pressed (not found state)');
              router.back();
            }}
            activeOpacity={0.7}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={textColor} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[typography.body, { color: secondaryText }]}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const displayName = profile.name || 'User';
  const usernameDisplay = profile.username ? `@${profile.username}` : displayName;
  const initials = displayName.charAt(0).toUpperCase();
  const bioText = profile.bio || '';

  const postsCountDisplay = String(postsCount);
  const followersCountDisplay = String(followersCount);
  const followingCountDisplay = String(followingCount);
  const currentStreakDisplay = String(currentStreak);
  const bestStreakDisplay = String(bestStreak);
  const consistencyScoreDisplay = String(consistencyScore);

  const memberSinceDisplay = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', " '")
    : '—';

  // ── Stats section (blurred when not following) ─────────────────────────────
  const StatsContent = (
    <View style={[styles.statsRowCard, { backgroundColor: cardBg }]}>
      <View style={styles.statCol}>
        <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local_fire_department" size={16} color={colors.primary} />
        <Text style={[styles.statColValue, { color: textColor }]}>{currentStreakDisplay}</Text>
        <Text style={[styles.statColLabel, { color: secondaryText }]}>STREAK</Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
      <View style={styles.statCol}>
        <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji_events" size={16} color="#F59E0B" />
        <Text style={[styles.statColValue, { color: textColor }]}>{bestStreakDisplay}</Text>
        <Text style={[styles.statColLabel, { color: secondaryText }]}>BEST</Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
      <View style={styles.statCol}>
        <IconSymbol ios_icon_name="chart.bar.fill" android_material_icon_name="bar_chart" size={16} color={colors.primary} />
        <Text style={[styles.statColValue, { color: colors.primary }]}>{consistencyScoreDisplay}</Text>
        <Text style={[styles.statColLabel, { color: secondaryText }]}>SCORE</Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
      <View style={styles.statCol}>
        <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={16} color="#8B5CF6" />
        <Text style={[styles.statColValue, { color: textColor }]}>{memberSinceDisplay}</Text>
        <Text style={[styles.statColLabel, { color: secondaryText }]}>SINCE</Text>
      </View>
    </View>
  );

  // ── Posts section (blurred when not following) ─────────────────────────────
  const PostsContent = (
    <View style={styles.feedSection}>
      <Text style={[styles.feedSectionTitle, { color: textColor }]}>Posts</Text>
      {posts.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
          <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyStateText, { color: secondaryText }]}>No posts yet</Text>
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
              <Text style={[styles.postContent, { color: textColor }]}>{post.content}</Text>
              <View style={styles.postMeta}>
                <Text style={[styles.postTime, { color: secondaryText }]}>{postTime}</Text>
                <View style={styles.postLikesRow}>
                  <IconSymbol ios_icon_name="heart.fill" android_material_icon_name="favorite" size={13} color={colors.error} />
                  <Text style={[styles.postLikes, { color: secondaryText }]}>{postLikes}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[SocialProfileView] back button pressed');
            router.back();
          }}
          activeOpacity={0.7}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: textColor }]} numberOfLines={1}>
          {profile.username || displayName}
        </Text>
        <View style={styles.topBarRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Instagram-style Header ─────────────────────────────────── */}
        <View style={styles.igHeader}>
          <View style={styles.igHeaderRow}>
            {/* Avatar */}
            <View style={[styles.igAvatarRing, { borderColor: colors.primary }]}>
              {profile.avatar_url ? (
                <Image
                  source={resolveImageSource(profile.avatar_url)}
                  style={styles.igAvatarImage}
                  resizeMode="cover"
                  onError={(e) => console.warn('[SocialProfileView] Avatar load error:', e.nativeEvent.error)}
                />
              ) : (
                <View style={[styles.igAvatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.igAvatarInitials}>{initials}</Text>
                </View>
              )}
            </View>

            {/* Info column */}
            <View style={styles.igInfoCol}>
              <Text style={[styles.igFullName, { color: textColor }]} numberOfLines={1}>
                {displayName}
              </Text>
              {/* Stats row */}
              <View style={styles.igStatsRow}>
                <View style={styles.igStatItem}>
                  <Text style={[styles.igStatNumber, { color: textColor }]}>{postsCountDisplay}</Text>
                  <Text style={[styles.igStatLabel, { color: secondaryText }]}> posts</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[SocialProfileView] Followers stat tapped');
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
                    console.log('[SocialProfileView] Following stat tapped');
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

          {/* Bio */}
          {bioText.length > 0 && (
            <Text style={[styles.igBio, { color: textColor }]}>{bioText}</Text>
          )}

          {/* Follow / Following button */}
          <View style={styles.followButtonRow}>
            {isFollowing ? (
              <View style={styles.followingButtonWrapper}>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[SocialProfileView] Following dropdown button pressed, isFollowing:', isFollowing);
                    setShowFollowingDropdown(v => !v);
                  }}
                  activeOpacity={0.7}
                  style={[styles.followingButton, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: borderColor }]}
                >
                  <Text style={[styles.followingButtonText, { color: textColor }]}>Following</Text>
                  <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={14} color={textColor} />
                </TouchableOpacity>

                {/* Dropdown */}
                {showFollowingDropdown && (
                  <View style={[styles.followDropdown, { backgroundColor: cardBg, borderColor: borderColor }]}>
                    <TouchableOpacity
                      onPress={handleUnfollow}
                      activeOpacity={0.7}
                      style={styles.followDropdownItem}
                    >
                      <Text style={[styles.followDropdownItemText, { color: textColor }]}>Unfollow</Text>
                    </TouchableOpacity>
                    <View style={[styles.followDropdownDivider, { backgroundColor: borderColor }]} />
                    <TouchableOpacity
                      onPress={handleBlock}
                      activeOpacity={0.7}
                      style={styles.followDropdownItem}
                    >
                      <Text style={[styles.followDropdownItemText, { color: colors.error }]}>Block</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleFollow}
                activeOpacity={0.7}
                style={[styles.followButton, { backgroundColor: colors.primary }]}
                disabled={followLoading}
              >
                {followLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.followButtonText}>Follow</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Stats section (blurred when not following) ─────────────────── */}
        {!isFollowing ? (
          <View style={styles.lockedSection}>
            <View style={styles.lockedContentDim} pointerEvents="none">
              {StatsContent}
            </View>
            <View style={styles.lockOverlay}>
              <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={28} color={colors.primary} />
              <Text style={[styles.lockOverlayText, { color: textColor }]}>
                Sigue a este usuario para ver sus estadísticas
              </Text>
            </View>
          </View>
        ) : (
          StatsContent
        )}

        {/* ── Posts feed (blurred when not following) ────────────────────── */}
        {!isFollowing ? (
          <View style={styles.lockedSection}>
            <View style={styles.lockedContentDim} pointerEvents="none">
              {PostsContent}
            </View>
            <View style={styles.lockOverlay}>
              <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={28} color={colors.primary} />
              <Text style={[styles.lockOverlayText, { color: textColor }]}>
                Sigue a este usuario para ver sus publicaciones
              </Text>
            </View>
          </View>
        ) : (
          PostsContent
        )}
      </ScrollView>

      {/* Dismiss dropdown overlay */}
      {showFollowingDropdown && (
        <TouchableOpacity
          style={styles.dropdownDismissOverlay}
          activeOpacity={1}
          onPress={() => {
            console.log('[SocialProfileView] dropdown dismiss overlay tapped');
            setShowFollowingDropdown(false);
          }}
        />
      )}

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
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={secondaryText} />
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
                  const itemName = item.name || item.username || 'User';
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
  blockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  blockedTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  blockedSubtitle: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Top bar
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
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    padding: spacing.xs,
    width: 36,
  },
  topBarRight: {
    width: 36,
  },

  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // ── Instagram Header ──────────────────────────────────────────────────────
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
  igUsername: {
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
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

  // Follow button row
  followButtonRow: {
    marginTop: spacing.md,
  },
  followButton: {
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  followButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  followingButtonWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  followingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    borderWidth: 1,
    minHeight: 40,
  },
  followingButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  followDropdown: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    zIndex: 999,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  followDropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  followDropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  followDropdownDivider: {
    height: StyleSheet.hairlineWidth,
  },
  dropdownDismissOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },

  // Stats row card
  statsRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
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

  // Locked / blurred section
  lockedSection: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  lockedContentDim: {
    opacity: 0.15,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  lockOverlayText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
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
